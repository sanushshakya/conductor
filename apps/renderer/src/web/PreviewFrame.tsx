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
    const readyWaiters = useRef<(() => void)[]>([])

    useEffect(() => {
      function onMessage(event: MessageEvent) {
        const data = event.data as { source?: string; ready?: boolean } | null
        if (data?.source === 'conductor-preview' && data.ready) {
          setReady(true)
          readyWaiters.current.splice(0).forEach((resolve) => resolve())
        }
      }
      window.addEventListener('message', onMessage)
      return () => window.removeEventListener('message', onMessage)
    }, [])

    /** Reloads the frame, which is the only way back from a runaway loop. */
    function restart(element: HTMLIFrameElement) {
      setReady(false)
      // eslint-disable-next-line no-self-assign -- forces a reload
      element.src = element.src
    }

    useImperativeHandle(ref, () => ({
      async render(request) {
        const element = frame.current
        if (!element) throw new Error('the preview is not mounted')

        // Clicking Run during the first load used to post into about:blank,
        // where nothing was listening — so a learner's very first action in
        // Track 2 could hang for the full timeout.
        if (!ready) {
          await new Promise<void>((resolve) => {
            readyWaiters.current.push(resolve)
            setTimeout(resolve, 5000)
          })
        }

        try {
          return await renderInPreview(element, request)
        } catch (error) {
          // A program that never finishes leaves the frame spinning forever.
          // Reloading it means the next attempt works, instead of every
          // attempt for the rest of the session timing out too.
          restart(element)
          throw error
        }
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
          /*
           * `allow-same-origin` here means "keep your OWN origin" — which is
           * the preview origin, not the app's. So the frame stays cross-origin
           * to the app (the isolation that matters) while avoiding the opaque
           * origin that would make it inherit the app's CSP and block every
           * inline script a learner writes.
           *
           * Everything else the sandbox withholds is withheld, and each one
           * matters here: without `allow-top-navigation` a learner's page
           * cannot replace the whole app window (which has no address bar to
           * escape from), without `allow-popups` it cannot open their real
           * browser via the window-open handler, and without `allow-modals` an
           * `alert` in a loop cannot wedge the app.
           */
          sandbox="allow-scripts allow-same-origin"
          className="h-72 w-full rounded-lg border border-ink-700 bg-white"
        />
      </div>
    )
  },
)
