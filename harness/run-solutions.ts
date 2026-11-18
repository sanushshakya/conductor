import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { lintContent } from './lint-content'
import { grade } from '@conductor/core'
import '@conductor/core/grading/graders'
import '@conductor/core/grading/sql-graders'
import '@conductor/core/grading/python-graders'
import { SqlEngine, setSqlWasmLocator } from '@conductor/core'
import { createPythonRunner } from './python-runner'
import type { Exercise, Lesson } from '@conductor/shared/content-schema'
import { API_SUITE_IDS } from '@conductor/shared'

/**
 * The most important check in this repository.
 *
 * Every exercise ships a reference solution. This runs each one through that
 * exercise's own grader and requires it to pass. An unsolvable exercise — a
 * grader with a typo, a solution that drifted from its prompt, an expected
 * output with a stray space — is the single thing that would destroy a
 * learner's trust permanently, because the failure looks exactly like being
 * bad at programming. Here it is a red build instead.
 *
 * It also proves graders stay honest: a grader that passes everything would
 * let a wrong reference solution through, which the companion fixture tests
 * deliberately check for.
 */

export interface SolutionFailure {
  lessonId: string
  exerciseId: string
  reason: string
}

export interface DuelFailure {
  duelId: string
  reason: string
}

export interface SolutionReport {
  ok: boolean
  total: number
  failures: SolutionFailure[]
  duelFailures: DuelFailure[]
}

setSqlWasmLocator((file) => resolve(process.cwd(), 'node_modules/sql.js/dist', file))

const engines = new Map<string, SqlEngine>()
const runCode = createPythonRunner()

async function engineFor(contentDir: string, fixture: string): Promise<SqlEngine> {
  const key = `${contentDir}:${fixture}`
  const existing = engines.get(key)
  if (existing) return existing

  const sql = readFileSync(resolve(contentDir, 'fixtures', `${fixture}.sql`), 'utf8')
  const engine = await SqlEngine.create(sql)
  engines.set(key, engine)
  return engine
}

function exercisesOf(lesson: Lesson): Exercise[] {
  return lesson.beats.flatMap((beat) => ('exercise' in beat && beat.exercise ? [beat.exercise] : []))
}

/**
 * Grades one arbitrary submission against an authored exercise's grader.
 *
 * Used by tests that prove an exercise is not satisfied by a partial answer —
 * a criterion its own half-solution also passes is testing nothing, and the
 * reference-solution check alone cannot detect that.
 */
export async function gradeExercise(contentDir: string, exerciseId: string, submission: string) {
  const content = lintContent(contentDir)
  const all: Exercise[] = [
    ...content.tracks.flatMap((t) => t.lessons.flatMap(exercisesOf)),
    ...content.bosses.flatMap((b) => b.criteria.map((c) => c.exercise)),
  ]
  const exercise = all.find((e) => e.id === exerciseId)
  if (!exercise) throw new Error(`no exercise with id "${exerciseId}"`)

  return grade(submission, exercise.grader, {
    exerciseId: exercise.id,
    xp: exercise.xp ?? 25,
    sqlEngineFor: (fixture) => engineFor(contentDir, fixture),
    runCode,
  })
}

export async function runAllSolutions(contentDir: string): Promise<SolutionReport> {
  const content = lintContent(contentDir)
  const failures: SolutionFailure[] = []
  const duelFailures: DuelFailure[] = []
  let total = 0

  const graded: { lessonId: string; exercise: Exercise }[] = []
  for (const track of content.tracks) {
    for (const lesson of track.lessons) {
      for (const exercise of exercisesOf(lesson)) graded.push({ lessonId: lesson.id, exercise })
    }
  }
  for (const boss of content.bosses) {
    for (const criterion of boss.criteria) {
      graded.push({ lessonId: boss.id, exercise: criterion.exercise })
    }
  }

  for (const { lessonId, exercise } of graded) {
    // An api-suite exercise is satisfied by a server the learner is running,
    // not by a text submission, so there is no reference solution to execute.
    // Its integrity is checked below instead: the suite it names must exist.
    if (exercise.grader.kind === 'api-suite') {
      if (!(API_SUITE_IDS as readonly string[]).includes(exercise.grader.suiteId)) {
        failures.push({
          lessonId,
          exerciseId: exercise.id,
          reason: `names grading suite "${exercise.grader.suiteId}", which the sidecar does not provide`,
        })
      }
      continue
    }

    total += 1
    try {
      const result = await grade(exercise.solution, exercise.grader, {
        exerciseId: exercise.id,
        xp: exercise.xp ?? 25,
        sqlEngineFor: (fixture) => engineFor(contentDir, fixture),
        runCode,
      })

      if (!result.passed) {
        const failed = result.checks.filter((c) => !c.passed)
        failures.push({
          lessonId,
          exerciseId: exercise.id,
          reason:
            `the reference solution did not pass its own grader — ` +
            failed.map((c) => `${c.label}${c.detail ? `: ${c.detail}` : ''}`).join(' | '),
        })
      }
    } catch (e) {
      failures.push({
        lessonId,
        exerciseId: exercise.id,
        reason: `grading threw: ${(e as Error).message}`,
      })
    }
  }

  // Duel integrity: a duel whose bug cannot be located, or whose "fix" changes
  // nothing, is a duel that cannot be won. The learner would be hunting for
  // something that is not there.
  const lessonIds = new Set(content.tracks.flatMap((t) => t.lessons.map((l) => l.id)))
  for (const duel of content.duels) {
    const lines = duel.code.replace(/\n$/, '').split('\n')
    if (duel.bugLine < 1 || duel.bugLine > lines.length) {
      duelFailures.push({
        duelId: duel.id,
        reason: `bugLine ${duel.bugLine} is outside the code, which is ${lines.length} line(s) long`,
      })
    }
    if (duel.code.trim() === duel.fixedCode.trim()) {
      duelFailures.push({
        duelId: duel.id,
        reason: 'the fixed code is identical to the buggy code, so there is nothing to find',
      })
    }
    if (!lessonIds.has(duel.lessonId)) {
      duelFailures.push({ duelId: duel.id, reason: `lesson "${duel.lessonId}" does not exist` })
    }
  }

  return {
    ok: failures.length === 0 && duelFailures.length === 0 && content.ok,
    total,
    failures,
    duelFailures,
  }
}
