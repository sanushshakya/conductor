import { useState } from 'react'
import { Markdown } from './Markdown'

export interface ChecklistItem {
  id: string
  text: string
  why?: string
}

/**
 * A list of things the learner verifies themselves.
 *
 * Track 4 has them drive a real agent in a real editor, which this app cannot
 * observe. Inventing a grade for it would be exactly the dishonesty the course
 * argues against, so the learner ticks each item — and every item is phrased
 * as something checked by running it, not by feeling finished.
 *
 * Ticks are local to the session and grant no XP: this is a working aid, not
 * a score, and treating it as one would invite clicking through.
 */
export function ChecklistBeat({
  items,
  intro,
  onAllChecked,
}: {
  items: ChecklistItem[]
  intro?: string
  onAllChecked?: () => void
}) {
  const [done, setDone] = useState<Set<string>>(new Set())

  function toggle(id: string) {
    setDone((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      if (next.size === items.length) onAllChecked?.()
      return next
    })
  }

  return (
    <div>
      {intro && <Markdown text={intro} />}

      <ul className="mt-3 space-y-1.5">
        {items.map((item) => {
          const checked = done.has(item.id)
          return (
            <li key={item.id}>
              <button
                type="button"
                role="checkbox"
                aria-checked={checked}
                onClick={() => toggle(item.id)}
                className={`focus-ring flex w-full items-start gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors ${
                  checked
                    ? 'border-verify-600/40 bg-verify-600/10'
                    : 'border-ink-700 bg-ink-850 hover:border-ink-600'
                }`}
              >
                <span
                  aria-hidden
                  className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[10px] ${
                    checked
                      ? 'border-verify-500 bg-verify-500 text-ink-950'
                      : 'border-ink-500 text-transparent'
                  }`}
                >
                  ✓
                </span>
                <span className="min-w-0 flex-1">
                  <span
                    className={`block text-sm ${checked ? 'text-verify-400' : 'text-parchment-200'}`}
                  >
                    {item.text}
                  </span>
                  {item.why && (
                    <span className="mt-0.5 block text-xs text-parchment-400">{item.why}</span>
                  )}
                </span>
              </button>
            </li>
          )
        })}
      </ul>

      <p className="mt-3 text-xs text-parchment-400">
        {done.size} of {items.length} checked. Nobody is marking this — the list is for you.
      </p>
    </div>
  )
}
