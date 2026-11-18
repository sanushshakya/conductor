import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { registerVisualizer, type VisualizerProps } from './registry'

interface Step {
  label: string
  state?: Record<string, unknown>
}

/**
 * The very first diagram a learner sees: instructions on a tape, consumed one
 * at a time, with the machine's state beside them.
 *
 * The point it has to land is that the computer has no lookahead — so the
 * steps ahead are visibly dimmed and the state only ever changes on the step
 * being executed.
 */
function InstructionTape({ config, onComplete }: VisualizerProps) {
  const steps = (config.steps as Step[] | undefined) ?? []
  const [cursor, setCursor] = useState(-1)
  const [playing, setPlaying] = useState(false)

  useEffect(() => {
    if (!playing) return
    if (cursor >= steps.length - 1) {
      setPlaying(false)
      onComplete?.()
      return
    }
    const timer = setTimeout(() => setCursor((c) => c + 1), 900)
    return () => clearTimeout(timer)
  }, [playing, cursor, steps.length, onComplete])

  const current = cursor >= 0 ? steps[cursor] : undefined
  const output = current?.state?.['output']

  return (
    <div className="rounded-xl border border-ink-700 bg-ink-850 p-5">
      <div className="space-y-2">
        {steps.map((step, i) => {
          const done = i < cursor
          const active = i === cursor
          return (
            <motion.div
              key={i}
              animate={{ opacity: active ? 1 : done ? 0.55 : 0.28 }}
              className={`flex items-center gap-3 rounded-lg border px-4 py-2.5 font-mono text-sm ${
                active ? 'border-brass-500 bg-brass-500/10' : 'border-ink-700 bg-ink-900'
              }`}
            >
              <span className="text-xs text-parchment-400">{i + 1}</span>
              <span className={active ? 'text-brass-400' : 'text-parchment-200'}>{step.label}</span>
              {active && <span className="ml-auto text-xs text-brass-500">running</span>}
            </motion.div>
          )
        })}
      </div>

      <div className="mt-4 flex items-center gap-4 border-t border-ink-700 pt-4">
        <button
          type="button"
          onClick={() => {
            setCursor(-1)
            setPlaying(true)
          }}
          className="focus-ring rounded-md bg-brass-500 px-3 py-1.5 text-sm font-medium text-ink-950 hover:bg-brass-400"
        >
          {cursor >= steps.length - 1 ? 'Play again' : 'Play'}
        </button>

        <div className="flex gap-6 font-mono text-xs">
          <div>
            <span className="text-parchment-400">value: </span>
            <span className="text-parchment-100">
              {current?.state?.['value'] !== undefined ? String(current.state['value']) : '—'}
            </span>
          </div>
          <div>
            <span className="text-parchment-400">output: </span>
            <span className="text-verify-400">{output !== undefined ? String(output) : '—'}</span>
          </div>
        </div>
      </div>
    </div>
  )
}

registerVisualizer('instruction-tape', InstructionTape)
export { InstructionTape }
