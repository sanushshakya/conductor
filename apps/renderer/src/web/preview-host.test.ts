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
