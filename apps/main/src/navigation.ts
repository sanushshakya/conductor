/**
 * Decides where the app window is allowed to navigate.
 *
 * The window has no address bar and no reload control, so a page that replaced
 * it would leave the learner with no way back — and the web track runs code
 * they pasted in. Everything except the app itself is refused and handed to
 * the real browser instead.
 *
 * Destinations are compared by ORIGIN rather than by exact string: the dev
 * server URL arrives first bare, then with a trailing slash, then with paths,
 * and an exact match would refuse to load the app at all in development.
 */
export function buildNavigationGuard(
  appScheme: string,
  devServerUrl: string | undefined,
): (url: string) => boolean {
  let devOrigin: string | null = null
  if (devServerUrl) {
    try {
      devOrigin = new URL(devServerUrl).origin
    } catch {
      devOrigin = null
    }
  }

  return function allowDestination(url: string): boolean {
    if (url.startsWith(`${appScheme}://`)) return true
    if (!devOrigin) return false
    try {
      return new URL(url).origin === devOrigin
    } catch {
      return false
    }
  }
}
