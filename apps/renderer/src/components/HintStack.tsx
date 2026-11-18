import { useState } from 'react'
import { Markdown } from './Markdown'

/**
 * Three escalating hints, revealed one at a time.
 *
 * The tiers are a teaching contract, not a UI detail: tier 1 asks a question,
 * tier 2 names the concept, tier 3 shows a worked analogue. Revealing them all
 * at once would collapse that into "here is the answer", which feels like
 * progress and is not — so each reveal is a separate, deliberate choice.
 */
export function HintStack({ hints }: { hints: string[] }) {
  const [revealed, setRevealed] = useState(0)

  const labels = ['Give me a nudge', 'Name what I am missing', 'Show me a worked example']

  return (
    <div className="mt-4">
      <div className="space-y-2">
        {hints.slice(0, revealed).map((hint, i) => (
          <div
            key={i}
            className="animate-fade-up rounded-lg border border-ink-700 bg-ink-850 px-4 py-3 text-sm"
          >
            <div className="mb-1 text-xs font-medium uppercase tracking-wide text-brass-500">
              Hint {i + 1}
            </div>
            <Markdown text={hint} />
          </div>
        ))}
      </div>

      {revealed < hints.length && (
        <button
          type="button"
          onClick={() => setRevealed((n) => n + 1)}
          className="focus-ring mt-2 rounded-md border border-ink-600 px-3 py-1.5 text-xs text-parchment-300 transition-colors hover:border-brass-600 hover:text-brass-400"
        >
          {labels[revealed] ?? 'Another hint'}
        </button>
      )}

      {revealed >= hints.length && revealed > 0 && (
        <p className="mt-2 text-xs text-parchment-400">
          That is every hint. If it still will not come, move on and return to it — that works
          more often than staring does.
        </p>
      )}
    </div>
  )
}
