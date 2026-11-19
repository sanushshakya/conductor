import type { ExerciseResult, GraderConfig, GraderKind, ConductorApi } from '@conductor/shared'

/**
 * The grading registry.
 *
 * Every exercise in the course is graded by one of these, and the harness
 * executes every authored reference solution through this same path in CI —
 * so a grader that is wrong fails the build rather than failing a learner.
 *
 * Graders are registered rather than imported directly because they have very
 * different dependencies: quizzes need nothing, SQL graders need a WASM
 * database, Python graders need the sidecar. Registration keeps those
 * dependencies out of the lesson player entirely.
 */

export interface GradeContext {
  exerciseId: string
  /** XP awarded on a pass. */
  xp: number
  /** Present in the app; absent in unit tests that grade pure submissions. */
  host?: ConductorApi
  /**
   * Renders HTML/CSS/JS and reports what the page became. Supplied by the app
   * (a cross-origin preview frame) and by the harness (jsdom), so the same
   * graders run in the lesson and in CI.
   */
  renderWeb?: (request: {
    html?: string
    css?: string
    js?: string
    settleMs?: number
  }) => Promise<{ logs: string[]; errors: string[]; html: string; text: string }>

  /**
   * Parses rendered HTML into a queryable document.
   *
   * Injectable because `DOMParser` is a browser global and the harness runs
   * these same graders in Node to check every authored solution. Defaults to
   * `DOMParser` wherever one exists.
   */
  parseHtml?: (html: string) => Document

  /** Resolves a named SQL fixture to a live engine. Required by sql-* graders. */
  sqlEngineFor?: (fixture: string) => Promise<import('../sql/engine').SqlEngine>
  /** Overrides the default code runner. Used by the harness and by tests. */
  runCode?: (
    code: string,
    stdin?: string,
  ) => Promise<{
    ok: boolean
    stdout: string
    stderr: string
    /**
     * True when no engine executed the code at all — as opposed to it running
     * and failing. The distinction decides whether the learner is told they
     * were wrong or told it could not be checked, and getting that backwards
     * is the fastest way to lose their trust in the grading.
     */
    unavailable?: boolean
  }>
}

export type Grader = (
  submission: string,
  config: GraderConfig,
  ctx: GradeContext,
) => Promise<ExerciseResult>

export const UnknownGraderError = 'UnknownGraderError'

const graders = new Map<string, Grader>()

export function registerGrader(kind: GraderKind, grader: Grader): void {
  graders.set(kind, grader)
}

export function registeredKinds(): string[] {
  return [...graders.keys()]
}

export async function grade(
  submission: string,
  config: GraderConfig,
  ctx: GradeContext,
): Promise<ExerciseResult> {
  const grader = graders.get(config.kind)
  if (!grader) {
    const error = new Error(
      `${UnknownGraderError}: no grader registered for kind "${config.kind}". ` +
        `Registered: ${registeredKinds().join(', ') || '(none)'}`,
    )
    error.name = UnknownGraderError
    throw error
  }
  return grader(submission, config, ctx)
}

/** Builds a result from checks, awarding XP only when every check passed. */
export function resultFrom(checks: ExerciseResult['checks'], xp: number): ExerciseResult {
  const passed = checks.length > 0 && checks.every((c) => c.passed)
  return { passed, checks, xpAwarded: passed ? xp : 0 }
}
