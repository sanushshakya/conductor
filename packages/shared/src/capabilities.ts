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

export function capabilities(status: SidecarStatus): Capabilities {
  const sidecarReady = status.state === 'ready'
  return {
    bootTrack: true,
    sqlLessons: true,
    authoredHints: true,
    pythonExec: sidecarReady,
    apiGrading: sidecarReady,
    liveMentor: sidecarReady,
  }
}

/** A one-line, non-technical explanation of what is currently unavailable. */
export function capabilityNotice(status: SidecarStatus): string | null {
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
