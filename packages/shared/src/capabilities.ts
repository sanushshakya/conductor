import type { SidecarStatus } from './domain'

/**
 * What the app can do given the sidecar's current state.
 *
 * Both the main and renderer processes must agree on this, because the spec
 * makes offline degradation a cross-cutting guarantee rather than a renderer
 * concern: a learner whose Python provisioning failed must still be told,
 * truthfully, that the whole SQL track is open to them.
 */
export interface Capabilities {
  /** Track 0. Authored content and quiz/output graders only — always available. */
  bootTrack: boolean
  /** Track 3. Runs on SQLite compiled to WASM in the renderer, never on Python. */
  sqlLessons: boolean
  /** Every exercise that executes the learner's Python — Tracks 1 and 4. */
  pythonExec: boolean
  /**
   * The Hospital API project, graded by making real HTTP calls to a server
   * the learner is running. Track 4's lessons do NOT need this: they are
   * graded by running Python, so they work wherever pythonExec does.
   */
  apiGrading: boolean
  /** Free-form mentor conversation. Authored hints do not need this. */
  liveMentor: boolean
  /** The three escalating hints shipped with every exercise. */
  authoredHints: boolean
  /** Tracks 2 and 5 exercises that render the learner's HTML, CSS and JS. */
  webPreview: boolean
}

/** Where Python can run, beyond the sidecar. */
export interface LocalEngines {
  /** Real CPython compiled to WebAssembly, used by the browser build. */
  pyodide?: boolean
  /**
   * Whether a second origin exists to render the learner's web code on.
   *
   * The preview cannot share the app's origin: isolating it with a sandboxed
   * frame gives it an opaque origin, and an opaque origin inherits the
   * embedder's CSP — so every inline script a learner writes would be
   * blocked by the app's own `script-src 'self'`. The desktop app registers
   * a `preview://` protocol for this; a static deployment has to be given a
   * second origin at build time, and may not have been.
   */
  webPreview?: boolean
}

export function capabilities(status: SidecarStatus, local: LocalEngines = {}): Capabilities {
  const sidecarReady = status.state === 'ready'

  return {
    bootTrack: true,
    sqlLessons: true,
    authoredHints: true,

    // Nothing to do with Python: the desktop app registers its preview://
    // protocol in the main process, so the default is yes. Only a browser
    // build deployed without a second origin says otherwise.
    webPreview: local.webPreview ?? true,

    // Either real interpreter will do. The browser build has no sidecar and
    // runs Pyodide instead, so Track 1 is fully available there.
    pythonExec: sidecarReady || local.pyodide === true,

    // Grading the learner's OWN server means making real HTTP requests to
    // localhost, which only the desktop app can do — a page served from a
    // website cannot reach a server on the visitor's machine. This gates one
    // boss project, not the track.
    apiGrading: sidecarReady,

    liveMentor: sidecarReady,
  }
}

/** A one-line, non-technical explanation of what is currently unavailable. */
export function capabilityNotice(status: SidecarStatus, local: LocalEngines = {}): string | null {
  // Python is running, just not from a sidecar. Nothing to report but what
  // this deployment genuinely cannot do.
  if (local.pyodide === true && status.state !== 'ready') {
    // Precise about what is missing. Every lesson in Track 4 is graded by
    // running Python, which works here; it is the Hospital API project —
    // which builds a server on the learner's own machine — that a web page
    // cannot check.
    return local.webPreview === false
      ? 'Running in your browser. The web lessons and the Hospital API project need the desktop app; everything else works.'
      : 'Running in your browser. Everything works except the Hospital API project, which needs the desktop app.'
  }

  switch (status.state) {
    case 'ready':
      return null
    case 'provisioning':
      return 'Setting up Python in the background. SQL and Boot lessons are ready now.'
    case 'starting':
      return 'Starting the Python engine. SQL and Boot lessons are ready now.'
    case 'stopped':
      return 'The Python engine is not running yet. SQL and Boot lessons are ready now.'
    case 'failed':
      return (
        status.message ??
        'The Python engine could not start, so Python and API lessons are paused. Everything in Boot and SQL still works.'
      )
  }
}
