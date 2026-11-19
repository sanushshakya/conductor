import { previewOrigin, previewUrl } from './preview-host'

/**
 * The isolation these tests protect is not obvious, so it is stated here:
 * the preview must NEVER be served from the app's own origin, or the learner's
 * JavaScript could reach `parent.conductor` and drive the app.
 */
function withLocation(protocol: string, hostname: string, port: string) {
  Object.defineProperty(window, 'location', {
    value: { protocol, hostname, port },
    writable: true,
    configurable: true,
  })
}

test('in development the preview is on a different hostname to the app', () => {
  withLocation('http:', 'localhost', '5178')
  expect(previewOrigin()).toBe('http://127.0.0.1:5178')

  withLocation('http:', '127.0.0.1', '5178')
  expect(previewOrigin()).toBe('http://localhost:5178')
})

test('the preview origin is never the app origin', () => {
  for (const [protocol, hostname, port] of [
    ['http:', 'localhost', '5178'],
    ['http:', '127.0.0.1', '5178'],
    ['app:', '-', ''],
  ] as const) {
    withLocation(protocol, hostname, port)
    const appOrigin = `${protocol}//${hostname}${port ? `:${port}` : ''}`
    expect(previewOrigin()).not.toBe(appOrigin)
  }
})

test('the packaged app uses its own preview scheme', () => {
  withLocation('app:', '-', '')
  expect(previewOrigin()).toBe('preview://-')
})

test('previewUrl points at the sandbox document', () => {
  withLocation('http:', 'localhost', '5178')
  expect(previewUrl()).toBe('http://127.0.0.1:5178/preview.html')
})

/**
 * On a static host there is no second hostname for free: `localhost` and
 * `127.0.0.1` are a development convenience, and a deployed site has exactly
 * the one origin it was served from. The origin for the preview is therefore
 * a build-time decision, and when it was not made the app must say the web
 * track is unavailable rather than render into its own origin.
 */
test('a deployed build uses the preview origin it was built with', () => {
  withLocation('https:', 'conductor.example', '')
  expect(previewOrigin('https://preview.conductor.example')).toBe(
    'https://preview.conductor.example',
  )
})

test('a deployed build with no preview origin has none', () => {
  withLocation('https:', 'conductor.example', '')
  expect(previewOrigin(undefined)).toBeNull()
  expect(previewUrl(undefined)).toBeNull()
})

test('a configured origin equal to the app origin is refused', () => {
  // Same origin means the learner's JavaScript can reach parent.conductor.
  // A misconfigured deploy must lose the web track, not its isolation.
  withLocation('https:', 'conductor.example', '')
  expect(previewOrigin('https://conductor.example')).toBeNull()
})

test('development still works without any configured origin', () => {
  withLocation('http:', 'localhost', '5178')
  expect(previewOrigin(undefined)).toBe('http://127.0.0.1:5178')
})
