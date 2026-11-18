import { useMemo } from 'react'

/**
 * A deliberately small Markdown renderer for lesson prose.
 *
 * Lesson bodies use a fixed, known subset — paragraphs, bold, inline code,
 * indented code blocks, lists — so a full Markdown library would add a
 * dependency and an HTML-injection surface to render six constructs. Output is
 * built as React elements, never `dangerouslySetInnerHTML`, so authored
 * content cannot inject markup even by accident.
 */
export function Markdown({ text }: { text: string }) {
  const blocks = useMemo(() => parseBlocks(text), [text])

  return (
    <div className="lesson-prose">
      {blocks.map((block, i) => {
        if (block.kind === 'code') {
          return (
            <pre key={i}>
              <code>{block.lines.join('\n')}</code>
            </pre>
          )
        }
        if (block.kind === 'ul') {
          return (
            <ul key={i}>
              {block.lines.map((line, j) => (
                <li key={j}>{inline(line)}</li>
              ))}
            </ul>
          )
        }
        if (block.kind === 'ol') {
          return (
            <ol key={i}>
              {block.lines.map((line, j) => (
                <li key={j}>{inline(line)}</li>
              ))}
            </ol>
          )
        }
        return <p key={i}>{inline(block.lines.join(' '))}</p>
      })}
    </div>
  )
}

type Block = { kind: 'p' | 'code' | 'ul' | 'ol'; lines: string[] }

function parseBlocks(text: string): Block[] {
  const blocks: Block[] = []
  const lines = text.replace(/\r/g, '').split('\n')
  let current: Block | null = null

  const flush = () => {
    if (current && current.lines.length) blocks.push(current)
    current = null
  }

  for (const line of lines) {
    const isIndentedCode = /^ {4,}\S/.test(line)
    const isBullet = /^\s*[-*]\s+/.test(line)
    const isNumbered = /^\s*\d+\.\s+/.test(line)

    if (line.trim() === '') {
      flush()
      continue
    }
    if (isIndentedCode) {
      if (current?.kind !== 'code') {
        flush()
        current = { kind: 'code', lines: [] }
      }
      current.lines.push(line.replace(/^ {4}/, ''))
      continue
    }
    if (isBullet) {
      if (current?.kind !== 'ul') {
        flush()
        current = { kind: 'ul', lines: [] }
      }
      current.lines.push(line.replace(/^\s*[-*]\s+/, ''))
      continue
    }
    if (isNumbered) {
      if (current?.kind !== 'ol') {
        flush()
        current = { kind: 'ol', lines: [] }
      }
      current.lines.push(line.replace(/^\s*\d+\.\s+/, ''))
      continue
    }
    if (current?.kind !== 'p') {
      flush()
      current = { kind: 'p', lines: [] }
    }
    current.lines.push(line.trim())
  }
  flush()
  return blocks
}

/**
 * Handles `**bold**`, `*italic*` and `` `code` `` without ever producing raw
 * HTML. The bold alternative is listed first so `**x**` cannot be mistaken for
 * an empty italic, and an unmatched `*` (as in `2 * 3`) is simply text.
 */
function inline(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = []
  const pattern = /(\*\*[^*]+\*\*|\*[^*\n]+\*|`[^`]+`)/g
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) parts.push(text.slice(lastIndex, match.index))
    const token = match[0]
    if (token.startsWith('**')) parts.push(<strong key={parts.length}>{token.slice(2, -2)}</strong>)
    else if (token.startsWith('*')) parts.push(<em key={parts.length}>{token.slice(1, -1)}</em>)
    else parts.push(<code key={parts.length}>{token.slice(1, -1)}</code>)
    lastIndex = match.index + token.length
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex))
  return parts
}
