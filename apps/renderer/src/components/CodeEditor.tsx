import { useEffect, useRef } from 'react'

interface Props {
  value: string
  onChange(value: string): void
  language?: 'python' | 'sql' | 'javascript'
  readOnly?: boolean
  minLines?: number
  ariaLabel: string
}

/**
 * The code editor.
 *
 * A textarea with a gutter rather than Monaco, on purpose. Monaco is 2 MB,
 * takes a visible moment to boot, and brings autocomplete and squiggly error
 * underlines — all of which do the noticing *for* the learner. Noticing is the
 * skill being taught here, so the editor stays quiet. Monaco earns its place
 * in Track 4, where the learner is reading agent output at volume.
 */
export function CodeEditor({ value, onChange, readOnly, minLines = 5, ariaLabel }: Props) {
  const textarea = useRef<HTMLTextAreaElement>(null)
  const lineCount = Math.max(value.split('\n').length, minLines)

  useEffect(() => {
    const el = textarea.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [value])

  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Tab indents instead of leaving the editor: in a code box, losing focus
    // mid-thought is worse than the keyboard-trap it technically is, and
    // Escape-then-Tab still moves on for keyboard users.
    if (event.key === 'Tab') {
      event.preventDefault()
      const el = event.currentTarget
      const { selectionStart, selectionEnd } = el
      const next = `${value.slice(0, selectionStart)}    ${value.slice(selectionEnd)}`
      onChange(next)
      requestAnimationFrame(() => el.setSelectionRange(selectionStart + 4, selectionStart + 4))
    }
  }

  return (
    <div className="flex overflow-hidden rounded-lg border border-ink-700 bg-ink-950 font-mono text-sm">
      <div
        aria-hidden
        className="select-none border-r border-ink-700 bg-ink-900 px-3 py-3 text-right text-parchment-400/50"
      >
        {Array.from({ length: lineCount }, (_, i) => (
          <div key={i} className="leading-6">
            {i + 1}
          </div>
        ))}
      </div>
      <textarea
        ref={textarea}
        aria-label={ariaLabel}
        className="flex-1 resize-none bg-transparent px-4 py-3 leading-6 text-parchment-100 outline-none"
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        readOnly={readOnly}
        value={value}
        rows={lineCount}
        onKeyDown={handleKeyDown}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  )
}
