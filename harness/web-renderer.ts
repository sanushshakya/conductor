import { JSDOM, VirtualConsole } from 'jsdom'

/**
 * Renders web exercises for the harness.
 *
 * CI has no browser, but it must still prove that every authored HTML, CSS and
 * JavaScript solution passes its own grader. jsdom offers the same contract
 * the app's preview frame does — render, run, report — so the graders are
 * identical in both places and a lesson cannot pass in CI and fail for the
 * learner.
 *
 * Scripts run with `runScripts: 'dangerously'`, which is accurate: this
 * executes authored reference solutions on a build machine, not learner input.
 * The app's own preview is the hardened path, isolated by origin.
 */
export interface WebRenderResult {
  logs: string[]
  errors: string[]
  html: string
  text: string
}

const RENDER_TIMEOUT_MS = 5000

export function createWebRenderer() {
  return async function renderWeb(request: {
    html?: string
    css?: string
    js?: string
    settleMs?: number
  }): Promise<WebRenderResult> {
    const logs: string[] = []
    const errors: string[] = []

    const virtualConsole = new VirtualConsole()
    virtualConsole.on('log', (...args: unknown[]) => logs.push(args.map(stringify).join(' ')))
    virtualConsole.on('info', (...args: unknown[]) => logs.push(args.map(stringify).join(' ')))
    virtualConsole.on('warn', (...args: unknown[]) => logs.push(args.map(stringify).join(' ')))
    virtualConsole.on('error', (...args: unknown[]) => logs.push(args.map(stringify).join(' ')))
    virtualConsole.on('jsdomError', (error: Error) => errors.push(error.message))

    const document = `<!doctype html><html><head>${
      request.css ? `<style>${request.css}</style>` : ''
    }</head><body>${request.html ?? ''}</body></html>`

    const dom = new JSDOM(document, {
      runScripts: 'dangerously',
      virtualConsole,
      // No network, matching the preview frame's `connect-src 'none'`.
      resources: undefined,
      url: 'http://localhost/',
    })

    try {
      if (request.js) {
        const script = dom.window.document.createElement('script')
        script.textContent = request.js
        dom.window.document.body.appendChild(script)
      }

      if (request.settleMs) {
        await new Promise((resolve) => setTimeout(resolve, Math.min(request.settleMs!, 200)))
      }

      return {
        logs,
        errors,
        html: dom.window.document.body.innerHTML,
        text: dom.window.document.body.textContent ?? '',
      }
    } catch (error) {
      errors.push((error as Error).message)
      return { logs, errors, html: dom.window.document.body.innerHTML, text: '' }
    } finally {
      dom.window.close()
    }
  }
}

function stringify(value: unknown): string {
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

export { RENDER_TIMEOUT_MS }

/** A jsdom-backed `parseHtml` for the grade context, matching the browser's. */
export function createHtmlParser() {
  return function parseHtml(html: string): Document {
    return new JSDOM(html).window.document as unknown as Document
  }
}
