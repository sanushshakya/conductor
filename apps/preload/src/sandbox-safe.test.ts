import { existsSync, readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join, resolve } from 'node:path'

/**
 * A sandboxed preload may only require a tiny allowlist.
 *
 * The window runs with `sandbox: true`, and Electron then gives the preload a
 * polyfilled `require` that resolves only these four modules. Anything else —
 * a dependency left external by the bundler, say — throws on load.
 *
 * That failure is silent and expensive: `contextBridge` never runs, so
 * `window.conductor` is undefined and the renderer falls back to its browser
 * host. The app looks completely normal while writing progress to
 * localStorage instead of disk, with the Python sidecar permanently
 * unreachable. It shipped that way once; this test is why it cannot again.
 */
const SANDBOX_ALLOWLIST = new Set(['electron', 'events', 'timers', 'url'])

const root = resolve(process.cwd())
const bundle = join(root, 'out/preload/index.js')

function preloadSource(): string {
  if (!existsSync(bundle)) {
    // The bundle is a build artefact; build it if this ran on a clean tree.
    execFileSync('npx', ['electron-vite', 'build'], { cwd: root, stdio: 'ignore' })
  }
  return readFileSync(bundle, 'utf8')
}

test('the preload bundle requires nothing outside the sandbox allowlist', () => {
  const required = [...preloadSource().matchAll(/require\("([^"]+)"\)/g)].map((m) => m[1]!)
  expect(required.length).toBeGreaterThan(0)

  for (const name of new Set(required)) {
    expect(SANDBOX_ALLOWLIST, `preload requires "${name}", which a sandboxed preload cannot load`)
      .toContain(name)
  }
})

test('the preload still installs the bridge', () => {
  const source = preloadSource()
  expect(source).toMatch(/exposeInMainWorld/)
  expect(source).toMatch(/conductor/)
})

test('the window is actually sandboxed, which is what makes the rule apply', () => {
  const main = readFileSync(join(root, 'apps/main/src/index.ts'), 'utf8')
  expect(main).toMatch(/sandbox:\s*true/)
  expect(main).toMatch(/contextIsolation:\s*true/)
  expect(main).toMatch(/nodeIntegration:\s*false/)
})
