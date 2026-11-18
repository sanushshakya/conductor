export interface ForLoopSpec {
  kind: 'for'
  variable: string
  over: (string | number)[]
  accumulator?: { name: string; start: number; op: 'add' | 'multiply' }
  /** Template for what a print inside the loop body would emit, e.g. "{i}". */
  print?: string
}

export interface WhileLoopSpec {
  kind: 'while'
  variable: string
  start: number
  step: number
  whileGreaterThan: number
  accumulator?: { name: string; start: number; op: 'add' | 'multiply' }
  print?: string
}

export type LoopSpec = ForLoopSpec | WhileLoopSpec

export interface LoopFrame {
  iteration: number
  state: Record<string, string | number>
  output?: string
  /** True on the final frame when the loop was stopped by the safety limit. */
  cutOff?: boolean
}

/** A runaway `while` must not hang the UI; it is shown stopping instead. */
const MAX_FRAMES = 50

/**
 * Expands a loop into one frame per iteration.
 *
 * Loops are the first thing in programming that happens *over time*, and a
 * printed listing shows none of that. Stepping through frames with the
 * variables visible at each step is what turns "I sort of follow it" into
 * actually following it — and the cut-off frame is how an infinite loop gets
 * taught without anyone having to sit through one.
 */
export function traceLoop(spec: LoopSpec): LoopFrame[] {
  const frames: LoopFrame[] = []
  let accumulator = spec.accumulator?.start ?? 0

  function record(iteration: number, value: string | number, cutOff?: boolean) {
    if (spec.accumulator && typeof value === 'number') {
      accumulator =
        spec.accumulator.op === 'add' ? accumulator + value : accumulator * value
    }
    const state: Record<string, string | number> = { [spec.variable]: value }
    if (spec.accumulator) state[spec.accumulator.name] = accumulator

    frames.push({
      iteration,
      state,
      output: spec.print ? interpolate(spec.print, state) : undefined,
      ...(cutOff ? { cutOff: true } : {}),
    })
  }

  if (spec.kind === 'for') {
    spec.over.forEach((value, i) => record(i + 1, value))
    return frames
  }

  let value = spec.start
  let iteration = 1
  while (value > spec.whileGreaterThan) {
    if (iteration > MAX_FRAMES) {
      frames[frames.length - 1] = { ...frames[frames.length - 1]!, cutOff: true }
      break
    }
    record(iteration, value)
    value += spec.step
    iteration += 1
  }
  return frames
}

function interpolate(template: string, state: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_m, name: string) => String(state[name] ?? ''))
}
