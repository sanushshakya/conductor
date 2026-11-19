/**
 * Talks to the sandboxed preview frame.
 *
 * ## Why a separate origin rather than a sandboxed iframe
 *
 * The obvious design is `<iframe sandbox="allow-scripts">`. It does not work,
 * and the reason is worth writing down because it is not obvious: a sandboxed
 * frame without `allow-same-origin` has an **opaque origin**, and documents
 * with opaque origins *inherit the embedder's CSP*. The app runs under
 * `script-src 'self'`, so every inline `<script>` a learner writes would be
 * blocked, and no policy the child declares can relax what it inherited.
 *
 * So isolation comes from the origin instead. The preview document is served
 * from a different origin to the app, which means:
 *
 *   - it keeps its own CSP, and can run the learner's inline scripts;
 *   - the same-origin policy stops it reaching `parent.conductor`, the IPC
 *     bridge, or anything the app has stored.
 *
 * In development that is `127.0.0.1` against the app's `localhost` — different
 * origins to a browser, same Vite server. In the packaged app it is a separate
 * `preview://` protocol registered by the main process.
 */

export interface PreviewRequest {
  html?: string
  css?: string
  js?: string
  /** Milliseconds to let the page settle before snapshotting. */
  settleMs?: number
  /** Computed styles to read back; innerHTML carries no styling. */
  measureStyles?: { selector: string; property: string }[]
}

export interface PreviewResult {
  /** `console.log` and friends, in order. */
  logs: string[]
  /** Uncaught errors, phrased as the browser phrased them. */
  errors: string[]
  /** `document.body.innerHTML` after the learner's code ran. */
  html: string
  /** `document.body.innerText` — what a person would actually read. */
  text: string
  /** Computed values for whatever `measureStyles` asked about. */
  styles: { selector: string; property: string; value: string | null }[]
  /** Current values of every form field, which innerHTML never reflects. */
  values: { id: string | null; name: string | null; value: string }[]
}

const RESPONSE_TIMEOUT_MS = 8000

/**
 * The origin a deployed build was told to put the preview on.
 *
 * Written as the exact literal the bundler looks for. A build that fails to
 * substitute it does not fail — the value becomes undefined and the app
 * quietly falls back to its development guess, serving the preview from the
 * wrong place. No test can see that, so build-web.mjs checks the built
 * bundle for the origin it passed in.
 */
export const CONFIGURED_PREVIEW_ORIGIN: string | undefined =
  import.meta.env.VITE_PREVIEW_ORIGIN || undefined

/** True for a host that hands out a second origin without being configured. */
function isDevelopmentHost(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1'
}

/**
 * Where the preview document lives, which must not be the app's own origin.
 *
 * Returns null when this deployment has nowhere safe to put it — a static
 * site built without VITE_PREVIEW_ORIGIN, or one configured with the app's
 * own origin. Rendering there anyway would put the learner's JavaScript on
 * the same origin as the app, where `parent.conductor` is reachable, so the
 * web track is withdrawn instead and the learner is told.
 */
export function previewOrigin(configured = CONFIGURED_PREVIEW_ORIGIN): string | null {
  // The packaged app registers `preview://` in the main process.
  if (window.location.protocol === 'app:') return 'preview://-'

  const appOrigin = `${window.location.protocol}//${window.location.hostname}${
    window.location.port ? `:${window.location.port}` : ''
  }`

  if (configured) {
    const normalised = configured.replace(/\/$/, '')
    return normalised === appOrigin ? null : normalised
  }

  // Development: the app is reached on one hostname and the preview on the
  // other. Both resolve to this machine; only the browser's notion of origin
  // differs, which is exactly what is wanted. A real deployment has no such
  // second name, which is why it must be configured.
  if (!isDevelopmentHost(window.location.hostname)) return null

  const port = window.location.port || '5178'
  const host = window.location.hostname === 'localhost' ? '127.0.0.1' : 'localhost'
  return `http://${host}:${port}`
}

export function previewUrl(configured = CONFIGURED_PREVIEW_ORIGIN): string | null {
  const origin = previewOrigin(configured)
  return origin === null ? null : `${origin}/preview.html`
}

/** Unguessable, so learner code cannot pre-forge a reply for the next id. */
function newRequestId(): string {
  const random = globalThis.crypto?.randomUUID?.()
  return `preview-${random ?? Math.random().toString(36).slice(2)}-${Date.now()}`
}

/**
 * Renders `request` in `frame` and resolves with what happened.
 *
 * Rejects on timeout rather than hanging: a learner's infinite loop freezes
 * the frame, and a grader that never settles is indistinguishable from a
 * broken app.
 */
export function renderInPreview(
  frame: HTMLIFrameElement,
  request: PreviewRequest,
): Promise<PreviewResult> {
  const id = newRequestId()
  // Resolved once, so the origin a message is checked against is the same one
  // the request was addressed to.
  const origin = previewOrigin()

  return new Promise((resolve, reject) => {
    if (origin === null) {
      reject(new Error('the preview is not available in this build'))
      return
    }

    const target = frame.contentWindow
    if (!target) {
      reject(new Error('the preview is not ready yet'))
      return
    }

    const timer = setTimeout(() => {
      window.removeEventListener('message', onMessage)
      reject(new Error('the preview did not respond — a loop that never ends is the usual cause'))
    }, RESPONSE_TIMEOUT_MS)

    function onMessage(event: MessageEvent) {
      // The learner's own code runs inside this frame and can post messages
      // too. Without these two checks it could answer on the grader's behalf —
      // and because the frame is reused across exercises, one pasted listener
      // would forge every result for the rest of the session.
      if (event.origin !== origin) return
      if (event.source !== target) return

      const data = event.data as (Partial<PreviewResult> & { source?: string; id?: string }) | null
      if (!data || data.source !== 'conductor-preview' || data.id !== id) return
      clearTimeout(timer)
      window.removeEventListener('message', onMessage)
      resolve({
        logs: data.logs ?? [],
        errors: data.errors ?? [],
        html: data.html ?? '',
        text: data.text ?? '',
        styles: data.styles ?? [],
        values: data.values ?? [],
      })
    }

    window.addEventListener('message', onMessage)
    target.postMessage({ source: 'conductor-host', id, ...request }, origin)
  })
}
