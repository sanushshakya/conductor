/**
 * Who is allowed to frame each of the app's two origins.
 *
 * This lives in a response header rather than preview.html's `<meta>` CSP
 * because `frame-ancestors` is one of the directives a meta tag cannot carry:
 * browsers parse it there and ignore it. Every other directive in that meta
 * tag does work, which is what made the gap easy to miss.
 */

export const APP_SCHEME = 'app'
export const PREVIEW_SCHEME = 'preview'

export function frameAncestorsFor(scheme: string): string {
  // The preview is framed by the app and by nothing else — not by a page the
  // learner's own code manages to open, and not by a website.
  if (scheme === PREVIEW_SCHEME) return `frame-ancestors ${APP_SCHEME}://-`

  // Nothing frames the app. There is no address bar inside a frame to show a
  // learner where they really are.
  return "frame-ancestors 'none'"
}
