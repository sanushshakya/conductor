import type { CheckResult } from '@conductor/shared'
import { registerGrader, resultFrom, type GradeContext } from './index'
import { bootPython } from '../python/boot-python'

/**
 * The graders that need nothing but the submission itself.
 *
 * SQL, Python and API graders register themselves in later phases; keeping
 * them apart is what lets Track 0 and Track 2 grade with no sidecar running.
 */

/** Python's own comparison rules for learner output: trailing space is noise. */
function normalize(text: string, trimTrailing: boolean, caseSensitive: boolean): string {
  let out = text
    .split('\n')
    .map((line) => (trimTrailing ? line.replace(/\s+$/, '') : line))
    .join('\n')
    .replace(/\n+$/, '')
  if (!caseSensitive) out = out.toLowerCase()
  return out
}

/**
 * Runs the learner's code. In Boot this is the tiny in-app evaluator; from
 * Track 1 the context supplies the real CPython runner instead.
 */
async function runCode(
  ctx: GradeContext,
  code: string,
  stdin?: string,
): Promise<{ ok: boolean; stdout: string; stderr: string }> {
  if (ctx.runCode) return ctx.runCode(code, stdin)
  const result = bootPython(code)
  return {
    ok: result.ok,
    stdout: result.stdout,
    stderr: result.ok ? '' : `${result.error.message} (line ${result.error.line})`,
  }
}

registerGrader('output-match', async (submission, config, ctx) => {
  if (config.kind !== 'output-match') throw new Error('wrong config')
  const trimTrailing = config.trimTrailing ?? true
  const caseSensitive = config.caseSensitive ?? true

  const checks: CheckResult[] = []
  for (const [index, testCase] of config.cases.entries()) {
    const label = testCase.label ?? `Prints ${JSON.stringify(testCase.expected)}`
    const run = await runCode(ctx, submission, testCase.stdin)
    const actual = normalize(run.stdout, trimTrailing, caseSensitive)
    const expected = normalize(testCase.expected, trimTrailing, caseSensitive)

    // A program that crashed did not work, even if it printed the right thing
    // on the way down. Grading that as correct teaches the opposite of what
    // Track 0 spends two lessons establishing about reading errors.
    if (!run.ok) {
      checks.push({
        id: `case-${index}`,
        label,
        passed: false,
        // The error is the most useful thing a beginner can be shown here, so
        // it is surfaced verbatim rather than replaced with "incorrect".
        detail: run.stderr || 'Your program stopped before it finished.',
      })
      continue
    }

    checks.push({
      id: `case-${index}`,
      label,
      passed: actual === expected,
      detail:
        actual === expected
          ? undefined
          : `Expected:\n${testCase.expected}\n\nYour program printed:\n${run.stdout || '(nothing)'}`,
    })
  }

  return resultFrom(checks, ctx.xp)
})

registerGrader('quiz', async (submission, config, ctx) => {
  if (config.kind !== 'quiz') throw new Error('wrong config')

  let selected: number[] = []
  try {
    const parsed: unknown = JSON.parse(submission || '[]')
    if (Array.isArray(parsed)) selected = parsed.map(Number).filter((n) => Number.isInteger(n))
  } catch {
    selected = []
  }

  // Set equality: order must not matter, but an extra selection is wrong.
  const chosen = new Set(selected)
  const correct = new Set(config.correct)
  const passed =
    chosen.size > 0 && chosen.size === correct.size && [...correct].every((i) => chosen.has(i))

  return resultFrom(
    [
      {
        id: 'answer',
        // Deliberately not the question's first line: questions are often
        // multi-line code, and slicing one line out of them produces a label
        // that reads like a fragment of the puzzle rather than a verdict.
        label: passed ? 'Correct' : 'Not that one',
        passed,
        detail: config.explanation,
      },
    ],
    ctx.xp,
  )
})

registerGrader('regex-contains', async (submission, config, ctx) => {
  if (config.kind !== 'regex-contains') throw new Error('wrong config')
  const checks: CheckResult[] = []

  for (const [index, pattern] of config.patterns.entries()) {
    const matched = new RegExp(pattern, 'm').test(submission)
    checks.push({
      id: `pattern-${index}`,
      label: `Uses ${pattern}`,
      passed: matched,
      detail: matched ? undefined : (config.message ?? `Your code does not match ${pattern} yet.`),
    })
  }

  for (const [index, pattern] of (config.forbidden ?? []).entries()) {
    const matched = new RegExp(pattern, 'm').test(submission)
    checks.push({
      id: `forbidden-${index}`,
      label: `Avoids ${pattern}`,
      passed: !matched,
      detail: matched
        ? (config.message ??
          'That shortcut gets the right answer without doing the work the exercise is about.')
        : undefined,
    })
  }

  return resultFrom(checks, ctx.xp)
})
