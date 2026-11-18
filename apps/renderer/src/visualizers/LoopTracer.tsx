import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { registerVisualizer, type VisualizerProps } from './registry'
import { traceLoop, type LoopSpec } from './loop-trace'

const DEFAULT: LoopSpec = {
  kind: 'for',
  variable: 'patient',
  over: ['Ana', 'Ben', 'Cal'],
  print: 'Calling {patient}',
}

/**
 * A loop, one iteration at a time, with the variables visible at each step.
 *
 * The thing beginners cannot see in a loop is that the same lines run again
 * with different values. Stepping through it makes that unmissable.
 */
function LoopTracer({ config }: VisualizerProps) {
  const spec = (config.loop as LoopSpec | undefined) ?? DEFAULT
  const code = (config.code as string | undefined) ?? defaultCode(spec)
  const frames = useMemo(() => traceLoop(spec), [spec])
  const [index, setIndex] = useState(-1)

  const frame = index >= 0 ? frames[index] : undefined
  const printed = frames
    .slice(0, index + 1)
    .map((f) => f.output)
    .filter(Boolean)

  return (
    <div className="rounded-xl border border-ink-700 bg-ink-850 p-5">
      <div className="grid gap-4 md:grid-cols-2">
        <pre className="overflow-x-auto rounded-lg border border-ink-700 bg-ink-950 p-3 font-mono text-xs text-parchment-200">
          {code}
        </pre>

        <div className="space-y-3">
          <div className="rounded-lg border border-ink-700 bg-ink-900 p-3">
            <div className="mb-1.5 text-[11px] uppercase tracking-wide text-parchment-400">
              Variables right now
            </div>
            {frame ? (
              <ul className="space-y-1 font-mono text-xs">
                {Object.entries(frame.state).map(([name, value]) => (
                  <motion.li key={name} initial={{ opacity: 0.4 }} animate={{ opacity: 1 }}>
                    <span className="text-brass-400">{name}</span>
                    <span className="text-parchment-400"> = </span>
                    <span className="text-parchment-100">
                      {typeof value === 'string' ? `"${value}"` : value}
                    </span>
                  </motion.li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-parchment-400">Nothing yet — the loop has not started.</p>
            )}
          </div>

          <div className="rounded-lg border border-ink-700 bg-ink-900 p-3">
            <div className="mb-1.5 text-[11px] uppercase tracking-wide text-parchment-400">Output</div>
            <pre className="font-mono text-xs text-verify-400">{printed.join('\n') || '—'}</pre>
          </div>
        </div>
      </div>

      <div className="mt-4 flex items-center gap-2 border-t border-ink-700 pt-4">
        <button
          type="button"
          onClick={() => setIndex((i) => Math.max(-1, i - 1))}
          disabled={index < 0}
          className="focus-ring rounded-md border border-ink-600 px-2.5 py-1 text-xs text-parchment-300 disabled:opacity-40"
        >
          Back
        </button>
        <button
          type="button"
          onClick={() => setIndex((i) => Math.min(frames.length - 1, i + 1))}
          disabled={index >= frames.length - 1}
          className="focus-ring rounded-md bg-brass-500 px-3 py-1 text-xs font-medium text-ink-950 disabled:opacity-40"
        >
          {index < 0 ? 'Start' : 'Next iteration'}
        </button>
        <span className="ml-auto font-mono text-[11px] text-parchment-400">
          {index < 0 ? `${frames.length} iterations` : `iteration ${index + 1} of ${frames.length}`}
        </span>
      </div>

      {frame?.cutOff && (
        <p className="mt-3 text-sm text-wrong-400">
          This loop never ends — the condition can never become false. Shown stopped after{' '}
          {frames.length} rounds.
        </p>
      )}
      {frames.length === 0 && (
        <p className="mt-3 text-sm text-parchment-300">
          The sequence is empty, so the body never runs once. A loop over nothing is not an error.
        </p>
      )}
    </div>
  )
}

function defaultCode(spec: LoopSpec): string {
  if (spec.kind === 'for') {
    const items = spec.over.map((v) => (typeof v === 'string' ? `"${v}"` : v)).join(', ')
    return `for ${spec.variable} in [${items}]:\n    print(f"${spec.print ?? ''}")`
  }
  return `${spec.variable} = ${spec.start}\nwhile ${spec.variable} > ${spec.whileGreaterThan}:\n    print(${spec.variable})\n    ${spec.variable} = ${spec.variable} + (${spec.step})`
}

registerVisualizer('loop-tracer', LoopTracer)
export { LoopTracer }
