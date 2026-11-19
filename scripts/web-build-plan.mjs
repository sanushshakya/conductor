/**
 * Decides what a static build is allowed to produce, given the two origins.
 *
 * Separated from the build so the rules can be tested: the one that matters
 * is that the preview may never share the app's origin. Same origin means the
 * JavaScript a learner writes — or that an agent wrote for them — runs with
 * access to the app's own page, storage and progress.
 *
 * APP_ORIGIN may name several origins, space-separated, because a deployment
 * can answer on more than one — a host's assigned subdomain plus a custom
 * domain. All of them are allowed to frame the preview; the first is the one
 * the app is built as.
 */

export function planWebBuild(env = {}) {
  const app = normaliseList(env.APP_ORIGIN)
  const preview = normalise(env.PREVIEW_ORIGIN)

  if (app.error) return { ok: false, error: `APP_ORIGIN is not a valid origin: ${app.error}` }
  if (preview.error) {
    return { ok: false, error: `PREVIEW_ORIGIN is not a valid origin: ${preview.error}` }
  }

  const appOrigins = app.origins
  const appOrigin = appOrigins[0] ?? null

  if ((appOrigin === null) !== (preview.origin === null)) {
    return {
      ok: false,
      error:
        'APP_ORIGIN and PREVIEW_ORIGIN go together — the app needs to know where the ' +
        'preview lives, and the preview needs to know who is allowed to frame it.',
    }
  }

  if (preview.origin !== null && appOrigins.includes(preview.origin)) {
    return {
      ok: false,
      error:
        'APP_ORIGIN and PREVIEW_ORIGIN must differ. Same origin means the code a ' +
        "learner writes can reach the app's own page and storage.",
    }
  }

  return {
    ok: true,
    appOrigin,
    appOrigins,
    previewOrigin: preview.origin,
    /** Tracks 2 and 5 need somewhere to run the learner's code. */
    webTrackIncluded: appOrigin !== null,
    appFrameAncestors: "frame-ancestors 'none'",
    previewFrameAncestors:
      appOrigins.length > 0 ? `frame-ancestors ${appOrigins.join(' ')}` : "frame-ancestors 'none'",
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

function normaliseList(value) {
  const parts = String(value ?? '')
    .split(/\s+/)
    .filter(Boolean)
  const origins = []
  for (const part of parts) {
    const one = normalise(part)
    if (one.error) return { error: part }
    if (one.origin && !origins.includes(one.origin)) origins.push(one.origin)
  }
  return { origins }
}

/**
 * Points the app's own CSP at the origin it will actually frame.
 *
 * `frame-src` in the source HTML lists the development hosts and the
 * desktop app's `preview://` scheme. A deployed app frames neither, and
 * without this rewrite it refuses to frame its own preview — the web
 * lessons then show an empty panel with the reason only in the console.
 *
 * A two-origin test on local ports cannot catch that, because those are the
 * very hosts the source list permits.
 *
 * Returns null if there is no frame-src to rewrite, so the caller can fail
 * rather than ship a build whose CSP was silently left alone.
 */
export function rewriteFrameSrc(html, previewOrigin) {
  if (!/frame-src [^;"]*/.test(html)) return null
  return html.replace(/frame-src [^;"]*/, `frame-src ${previewOrigin}`)
}
