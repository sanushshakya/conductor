import { readFileSync, existsSync } from 'node:fs'
import { resolve, join, dirname } from 'node:path'

/**
 * Paths in the main process are relative to the BUNDLE, not the source.
 *
 * `apps/main/src/index.ts` is bundled to `out/main/index.js`, so every
 * `join(here, '../..')` in it is resolved from a directory two levels below
 * the repository root — not from the source tree. Three of them were written
 * against the source layout and pointed outside the project; none of it shows
 * up in a typecheck, a unit test, or a build. It only appears on launch.
 *
 * These tests read the source and assert the arithmetic, so the next person to
 * move a file finds out here instead of in a blank window.
 */

const root = resolve(process.cwd())
const source = readFileSync(join(root, 'apps/main/src/index.ts'), 'utf8')

/** Where `here` points once bundled. */
const BUNDLED_DIR = join(root, 'out/main')

function resolveFromBundle(relative: string): string {
  return resolve(BUNDLED_DIR, relative)
}

test('package.json names the bundled main process as the entry point', () => {
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { main?: string }
  expect(pkg.main).toBe('./out/main/index.js')
})

test('the content directory resolves to the real one', () => {
  const match = /return join\(here, '([^']+content)'\)/.exec(source)
  expect(match, 'contentRoot no longer uses join(here, ...)').toBeTruthy()

  const resolved = resolveFromBundle(match![1]!)
  expect(resolved).toBe(join(root, 'content'))
  expect(existsSync(join(resolved, 'tracks'))).toBe(true)
})

test('the sidecar directory resolves to the real one', () => {
  const match = /join\(here, '([^']*services\/mentor)'\)/.exec(source)
  expect(match, 'sidecarRoot no longer uses join(here, ...)').toBeTruthy()

  const resolved = resolveFromBundle(match![1]!)
  expect(resolved).toBe(join(root, 'services/mentor'))
  expect(existsSync(join(resolved, 'requirements.txt'))).toBe(true)
})

test('the preload path matches the filename electron-vite actually emits', () => {
  const match = /preload: join\(here, '([^']+)'\)/.exec(source)
  expect(match, 'the preload path is no longer a join(here, ...)').toBeTruthy()

  // A wrong name here fails SILENTLY — the bridge never loads and the renderer
  // falls back to its browser host, so progress stops reaching disk.
  expect(match![1]).toBe('../preload/index.js')
  expect(match![1]).not.toMatch(/\.mjs$/)
})

test('the renderer directory the protocols serve resolves to the bundle output', () => {
  const match = /resolve\(join\(here, '([^']+renderer)'\)\)/.exec(source)
  expect(match, 'the protocol root is no longer a join(here, ...)').toBeTruthy()
  expect(resolveFromBundle(match![1]!)).toBe(join(root, 'out/renderer'))
})
