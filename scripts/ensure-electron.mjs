/**
 * Makes sure Electron's binary is actually on disk before `dev` or `build`.
 *
 * npm's postinstall for the `electron` package downloads a ~92MB zip and
 * extracts it. The download is cached, but the extraction can be left
 * half-finished — by an interrupted install, a sandboxed shell, or a disk
 * cleaner — and what survives is a `dist/` holding only the licence files.
 *
 * npm then considers the package installed, so `npm install` does nothing and
 * every subsequent run fails with a bare `spawn … ENOENT` that says nothing
 * about the cause. This script turns that into a fixed problem, or failing
 * that, an explanation.
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const electronDir = join(root, 'node_modules', 'electron')
const pathFile = join(electronDir, 'path.txt')
const distDir = join(electronDir, 'dist')

function binaryPath() {
  if (!existsSync(pathFile)) return null
  return join(distDir, readFileSync(pathFile, 'utf8').trim())
}

function installed() {
  const binary = binaryPath()
  return binary !== null && existsSync(binary)
}

if (installed()) process.exit(0)

const present = existsSync(distDir) ? readdirSync(distDir) : []
console.log(
  `Electron's binary is missing (dist/ holds ${present.length} file(s)). Extracting it…`,
)

try {
  const require = createRequire(import.meta.url)
  execFileSync(process.execPath, [require.resolve('electron/install.js')], {
    cwd: electronDir,
    stdio: 'inherit',
  })
} catch (error) {
  console.error(`\nCould not extract Electron: ${error.message}`)
}

if (installed()) {
  console.log('Electron is ready.\n')
  process.exit(0)
}

console.error(
  [
    '',
    'Electron still is not installed, so the desktop app cannot start.',
    '',
    'The download is usually already cached, so this normally just needs the',
    'extraction to be run where it can write:',
    '',
    '    node node_modules/electron/install.js && npx electron --version',
    '',
    'If that reports the app is damaged or from an unidentified developer,',
    'macOS has quarantined the unsigned binary — clear it with:',
    '',
    '    xattr -dr com.apple.quarantine node_modules/electron/dist/Electron.app',
    '',
    'Nothing else in the project needs Electron: `npm run dev:web` runs the',
    'whole course in a browser, and `npm test` and `npm run harness` are',
    'unaffected.',
    '',
  ].join('\n'),
)
process.exit(1)
