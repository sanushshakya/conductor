/**
 * Copies Pyodide's runtime into the renderer's public directory.
 *
 * Pyodide is real CPython compiled to WebAssembly — about 11MB across four
 * files. It is copied rather than committed (git has no business holding a
 * compiled interpreter) and served from our own origin rather than a CDN,
 * because the app's CSP is `script-src 'self'` and because the whole point of
 * this project is that it works offline.
 */

import { copyFileSync, existsSync, mkdirSync, statSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const target = join(root, 'apps/renderer/public/pyodide')

/** Everything `loadPyodide` reaches for. Omitting one fails at runtime, not at build. */
const REQUIRED = [
  'pyodide.js',
  'pyodide.asm.js',
  'pyodide.asm.wasm',
  'python_stdlib.zip',
  'pyodide-lock.json',
]

const require = createRequire(import.meta.url)
let source
try {
  source = dirname(require.resolve('pyodide/package.json'))
} catch {
  console.error('pyodide is not installed — run `npm install` first.')
  process.exit(1)
}

mkdirSync(target, { recursive: true })

let copied = 0
let bytes = 0
for (const file of REQUIRED) {
  const from = join(source, file)
  const to = join(target, file)

  if (!existsSync(from)) {
    console.error(`pyodide is missing ${file}; the installed version may not match.`)
    process.exit(1)
  }

  // Skip files already in place and the same size — this runs before every
  // dev start, and copying 11MB each time is a needless second.
  if (existsSync(to) && statSync(to).size === statSync(from).size) continue

  copyFileSync(from, to)
  copied += 1
  bytes += statSync(to).size
}

if (copied > 0) {
  console.log(`Pyodide: copied ${copied} file(s), ${(bytes / 1e6).toFixed(1)}MB`)
}
