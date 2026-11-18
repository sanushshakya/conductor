import { useState } from 'react'
import { motion } from 'framer-motion'
import { registerVisualizer, type VisualizerProps } from './registry'

interface Stage {
  label: string
  detail: string
}

const DEFAULT_STAGES: Stage[] = [
  { label: 'Your app writes a request', detail: 'GET /patients/7 HTTP/1.1\nHost: hospital.local\nAccept: application/json' },
  { label: 'It travels to the server', detail: 'Across the network. Nothing is remembered between requests — each one arrives alone.' },
  { label: 'The server reads it and decides', detail: 'Route: GET /patients/{id}\nLooks up patient 7 in the database.' },
  { label: 'The server writes a response', detail: 'HTTP/1.1 200 OK\nContent-Type: application/json\n\n{"id": 7, "full_name": "Asha Rai"}' },
  { label: 'Your app reads it', detail: 'Status 200 means the server did what was asked. The body is the answer.' },
]

/**
 * One request and one response, step by step.
 *
 * The idea this has to carry into Track 3 is that HTTP is not a connection —
 * it is a letter and a reply. Everything about REST, status codes and why the
 * server cannot trust the client follows from that one fact.
 */
function HttpTrace({ config }: VisualizerProps) {
  const stages = (config.stages as Stage[] | undefined) ?? DEFAULT_STAGES
  const [step, setStep] = useState(0)

  return (
    <div className="rounded-xl border border-ink-700 bg-ink-850 p-5">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2 font-mono text-xs">
          <span className="rounded bg-ink-800 px-2 py-1 text-parchment-300">your app</span>
          <motion.span
            aria-hidden
            animate={{ x: step >= 1 && step <= 2 ? 10 : 0 }}
            className="text-brass-500"
          >
            ────▶
          </motion.span>
          <span className="rounded bg-ink-800 px-2 py-1 text-parchment-300">server</span>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            disabled={step === 0}
            className="focus-ring rounded-md border border-ink-600 px-2.5 py-1 text-xs text-parchment-300 disabled:opacity-40"
          >
            Back
          </button>
          <button
            type="button"
            onClick={() => setStep((s) => Math.min(stages.length - 1, s + 1))}
            disabled={step >= stages.length - 1}
            className="focus-ring rounded-md bg-brass-500 px-3 py-1 text-xs font-medium text-ink-950 disabled:opacity-40"
          >
            Next
          </button>
        </div>
      </div>

      <ol className="space-y-1.5">
        {stages.map((stage, i) => (
          <li
            key={i}
            className={`rounded-lg border px-3 py-2 text-xs transition-colors ${
              i === step
                ? 'border-brass-500 bg-brass-500/10 text-brass-400'
                : i < step
                  ? 'border-ink-700 bg-ink-900 text-parchment-400'
                  : 'border-ink-800 bg-ink-900 text-parchment-400/40'
            }`}
          >
            {i + 1}. {stage.label}
          </li>
        ))}
      </ol>

      <pre className="mt-4 overflow-x-auto whitespace-pre-wrap rounded-lg border border-ink-700 bg-ink-950 p-3 font-mono text-xs text-parchment-200">
        {stages[step]!.detail}
      </pre>
    </div>
  )
}

registerVisualizer('http-trace', HttpTrace)
export { HttpTrace }
