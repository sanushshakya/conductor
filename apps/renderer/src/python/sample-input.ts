import type { Exercise } from '@conductor/shared'

export interface SampleInput {
  stdin: string
  /** What the lesson calls this case, for telling the learner what Run used. */
  label: string
}

/**
 * The input Run should feed the program.
 *
 * A lesson that asks for a program reading `input()` states the inputs it
 * will check against. Without one of them, pressing Run raises EOFError
 * before the program does anything — so the button that exists to let a
 * beginner try their code would only ever show them a failure, and the first
 * traceback they meet would be the app's fault rather than their own.
 */
export function sampleInput(exercise: Exercise): SampleInput | undefined {
  const grader = exercise.grader as { cases?: Array<{ stdin?: string; label?: string }> }
  const cases = grader.cases
  if (!cases) return undefined

  for (const [index, entry] of cases.entries()) {
    if (entry.stdin === undefined) continue
    return { stdin: entry.stdin, label: entry.label ?? `case ${index + 1}` }
  }

  return undefined
}
