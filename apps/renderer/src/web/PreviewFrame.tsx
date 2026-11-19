import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { previewUrl, renderInPreview, type PreviewRequest, type PreviewResult } from './preview-host'

export interface PreviewHandle {
  render(request: PreviewRequest): Promise<PreviewResult>
}

/**
 * The live page the learner is building.
 *
 * Keeping the preview visible while they type is most of what makes the web
 * track feel different from the others: in Python the reward is a line of
 * output, here it is the thing itself appearing. The frame is deliberately
 * white and unstyled — it is their page, not part of the app's chrome.
 */
export const PreviewFrame = forwardRef<PreviewHandle, { title?: string; className?: string }>(
  function PreviewFrame({ title = 'Your page', className }, ref) {
    const frame = useRef<HTMLIFrameElement>(null)
    const [ready, setReady] = useState(false)

    useEffect(() => {
      function onMessage(event: MessageEvent) {
        const data = event.data as { source?: string; ready?: boolean } | null
        if (data?.source === 'conductor-preview' && data.ready) setReady(true)
      }
      window.addEventListener('message', onMessage)
      return () => window.removeEventListener('message', onMessage)
    }, [])

    useImperativeHandle(ref, () => ({
      async render(request) {
        const element = frame.current
        if (!element) throw new Error('the preview is not mounted')
        return renderInPreview(element, request)
      },
    }))

    return (
      <div className={className}>
        <div className="mb-1.5 flex items-center gap-2">
          <span className="text-xs uppercase tracking-wide text-parchment-400">{title}</span>
          {!ready && <span className="text-[10px] text-parchment-400/60">starting…</span>}
        </div>
        <iframe
          ref={frame}
          title={title}
          src={previewUrl()}
          // No sandbox attribute, deliberately: a sandboxed frame gets an
          // opaque origin, and opaque origins inherit the embedder's CSP —
          // which would block every inline script a learner writes. Isolation
          // comes from the separate origin instead, which the same-origin
          // policy enforces just as strictly.
          className="h-72 w-full rounded-lg border border-ink-700 bg-white"
        />
      </div>
    )
  },
)
