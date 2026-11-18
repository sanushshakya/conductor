import { useState } from 'react'
import { Markdown } from '../components/Markdown'
import { useMentor } from './useMentor'

interface Props {
  authoredHints: string[]
  lessonId?: string
  learnerCode?: string
}

/**
 * Ask the mentor a question in your own words.
 *
 * Sits beside the authored hints rather than replacing them: the hints answer
 * the confusion the lesson anticipated, and this answers the one it did not.
 * When no model is configured the reply comes from the same authored text,
 * which is why the panel never needs to be hidden or disabled.
 */
export function MentorPanel({ authoredHints, lessonId, learnerCode }: Props) {
  const { turns, tier, asking, askMentor } = useMentor(authoredHints)
  const [draft, setDraft] = useState('')

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    const question = draft.trim()
    if (!question || asking) return
    setDraft('')
    await askMentor(question, lessonId, learnerCode)
  }

  return (
    <section className="mt-6 rounded-xl border border-ink-700 bg-ink-850 p-4">
      <div className="mb-3 flex items-baseline justify-between">
        <h3 className="text-sm font-medium text-parchment-100">Ask the mentor</h3>
        <span className="font-mono text-[10px] text-parchment-400">
          {tier === 1 ? 'a question back' : tier === 2 ? 'names the concept' : 'a worked example'}
        </span>
      </div>

      {turns.length > 0 && (
        <ol className="mb-3 space-y-3">
          {turns.map((turn, i) => (
            <li key={i}>
              <p className="mb-1 text-xs text-parchment-400">You: {turn.question}</p>
              <div className="rounded-lg border border-ink-700 bg-ink-900 px-3 py-2 text-sm">
                <Markdown text={turn.reply.answer} />
                {turn.reply.usedFallback && (
                  <p className="mt-1.5 text-[10px] text-parchment-400">
                    Answered from this lesson's own hints — no AI model is configured.
                  </p>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}

      <form onSubmit={(e) => void submit(e)} className="flex gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="What is confusing you?"
          aria-label="Ask the mentor a question"
          className="focus-ring min-w-0 flex-1 rounded-md border border-ink-600 bg-ink-900 px-3 py-1.5 text-sm text-parchment-100 placeholder:text-parchment-400/60"
        />
        <button
          type="submit"
          disabled={asking || draft.trim() === ''}
          className="focus-ring shrink-0 rounded-md border border-ink-600 px-3 py-1.5 text-sm text-parchment-200 transition-colors hover:border-brass-600 hover:text-brass-400 disabled:opacity-40"
        >
          {asking ? 'Thinking…' : 'Ask'}
        </button>
      </form>
    </section>
  )
}
