import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const html = readFileSync(resolve(process.cwd(), 'apps/renderer/index.html'), 'utf8')
const csp = /content="([^"]*default-src[^"]*)"/i.exec(html)?.[1] ?? ''

/**
 * The SQL track runs SQLite compiled to WebAssembly, and a Content Security
 * Policy of `script-src 'self'` blocks WebAssembly.instantiate outright — so
 * the entire centrepiece of the course fails with a console error and a dead
 * panel. Unit tests cannot catch this (jsdom does not enforce CSP), so the
 * policy itself is asserted here.
 */
test('the CSP allows WebAssembly, which the SQL engine needs', () => {
  expect(csp).toMatch(/'wasm-unsafe-eval'/)
})

test("the CSP does NOT grant blanket 'unsafe-eval'", () => {
  // 'wasm-unsafe-eval' permits WebAssembly only. Blanket 'unsafe-eval' would
  // also re-enable eval() and new Function() for every script on the page.
  expect(csp).not.toMatch(/'unsafe-eval'/)
})

test('the CSP restricts scripts to this app', () => {
  expect(csp).toMatch(/script-src 'self'/)
})

test('the CSP allows the sidecar on loopback and nothing else outbound', () => {
  const connectSrc = /connect-src ([^;]*)/.exec(csp)?.[1]?.trim().split(/\s+/) ?? []
  expect(connectSrc).toContain("'self'")

  // A port wildcard is required — the sidecar picks a free port at launch.
  // A HOST wildcard would let the renderer talk to anything on the internet,
  // which is what this asserts cannot happen.
  for (const source of connectSrc) {
    const host = source.replace(/^[a-z]+:\/\//, '').split(':')[0]
    expect(['', "'self'", '127.0.0.1', 'localhost']).toContain(host)
  }
})

test('a default-src is declared, so anything unlisted is denied', () => {
  expect(csp).toMatch(/default-src 'self'/)
})

test('the CSP permits the preview origin to be framed, and only that', () => {
  const frameSrc = /frame-src ([^;]*)/.exec(csp)?.[1]?.trim().split(/\s+/) ?? []
  expect(frameSrc.length).toBeGreaterThan(0)

  // The web track runs learner code in a frame on a DIFFERENT origin — that
  // separation is what stops it reaching the IPC bridge. Only those two
  // origins may be framed.
  for (const source of frameSrc) {
    expect(['http://127.0.0.1:*', 'http://localhost:*', 'preview://-']).toContain(source)
  }
})

test('the app itself is never framed from an arbitrary origin', () => {
  expect(csp).not.toMatch(/frame-src[^;]*\*\s*;/)
  expect(csp).not.toMatch(/frame-src[^;]*'unsafe/)
})
