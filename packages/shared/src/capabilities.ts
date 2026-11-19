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
  /** Track 2. Runs on SQLite compiled to WASM in the renderer, never on Python. */
  sqlLessons: boolean
  /** Tracks 1 and 3 exercises that execute the learner's Python. */
  pythonExec: boolean
  /** Track 3 grading, which makes real HTTP calls to the learner's own server. */
  apiGrading: boolean
  /** Free-form mentor conversation. Authored hints do not need this. */
  liveMentor: boolean
  /** The three escalating hints shipped with every exercise. */
  authoredHints: boolean
}

/** Where Python can run, beyond the sidecar. */
export interface LocalEngines {
  /** Real CPython compiled to WebAssembly, used by the browser build. */
  pyodide?: boolean
}

export function capabilities(status: SidecarStatus, local: LocalEngines = {}): Capabilities {
  const sidecarReady = status.state === 'ready'

  return {
    bootTrack: true,
    sqlLessons: true,
    authoredHints: true,

    // Either real interpreter will do. The browser build has no sidecar and
    // runs Pyodide instead, so Track 1 is fully available there.
    pythonExec: sidecarReady || local.pyodide === true,

    // Grading the learner's OWN server means making real HTTP requests to
    // localhost, which only the desktop app can do — a page served from a
    // website cannot reach a server on the visitor's machine.
    apiGrading: sidecarReady,

    liveMentor: sidecarReady,
  }
}

/** A one-line, non-technical explanation of what is currently unavailable. */
export function capabilityNotice(status: SidecarStatus, local: LocalEngines = {}): string | null {
  // Python is running, just not from a sidecar. Nothing to report.
  if (local.pyodide === true && status.state !== 'ready') {
    return 'Running in your browser. Everything works except the API track, which needs the desktop app.'
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
