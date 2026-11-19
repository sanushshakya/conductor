/**
 * Decides what a static build is allowed to produce, given the two origins.
 *
 * Separated from the build so the rules can be tested: the one that matters
 * is that the preview may never share the app's origin. Same origin means the
 * JavaScript a learner writes — or that an agent wrote for them — runs with
 * access to the app's own page, storage and progress.
 */

export function planWebBuild(env = {}) {
  const app = normalise(env.APP_ORIGIN)
  const preview = normalise(env.PREVIEW_ORIGIN)

  if (app.error) return { ok: false, error: `APP_ORIGIN is not a valid origin: ${app.error}` }
  if (preview.error) {
    return { ok: false, error: `PREVIEW_ORIGIN is not a valid origin: ${preview.error}` }
  }

  if ((app.origin === null) !== (preview.origin === null)) {
    return {
      ok: false,
      error:
        'APP_ORIGIN and PREVIEW_ORIGIN go together — the app needs to know where the ' +
        'preview lives, and the preview needs to know who is allowed to frame it.',
    }
  }

  if (app.origin !== null && app.origin === preview.origin) {
    return {
      ok: false,
      error:
        'APP_ORIGIN and PREVIEW_ORIGIN must differ. Same origin means the code a ' +
        "learner writes can reach the app's own page and storage.",
    }
  }

  return {
    ok: true,
    appOrigin: app.origin,
    previewOrigin: preview.origin,
    /** Tracks 2 and 5 need somewhere to run the learner's code. */
    webTrackIncluded: app.origin !== null,
    appFrameAncestors: "frame-ancestors 'none'",
    previewFrameAncestors: `frame-ancestors ${app.origin ?? "'none'"}`,
  }
}

function normalise(value) {
  if (!value) return { origin: null }
  try {
    return { origin: new URL(value).origin }
  } catch {
    return { error: value }
  }
}
