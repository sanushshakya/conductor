/**
 * Compiles the Python that ships inside JavaScript.
 *
 * `pyodide-worker.js` carries its setup code in a JS template literal, where
 * `\n` is a real newline rather than the two characters Python needs. A
 * mistake there is invisible to the type checker and to every unit test —
 * the worker loads, the page looks fine, and the only symptom is that Python
 * reports itself unavailable and the learner silently loses two tracks.
 */

import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const WORKER = 'apps/renderer/public/pyodide-worker.js'

export interface EmbeddedPythonReport {
  ok: boolean
  /** Why the check could not run, as opposed to a genuine failure. */
  skipped?: string
  errors: string[]
}

/** Pulls out what the JS template literal actually evaluates to. */
export function embeddedPython(source: string): string {
  const open = source.indexOf('const SETUP = `')
  if (open === -1) throw new Error(`no SETUP template literal in ${WORKER}`)
  const start = open + 'const SETUP = `'.length
  const end = source.indexOf('`', start)
  if (end === -1) throw new Error(`unterminated SETUP template literal in ${WORKER}`)

  // The same unescaping the JS engine performs when it builds the string.
  return source.slice(start, end).replace(/\\([\\`$nrt])/g, (_, char: string) => {
    if (char === 'n') return '\n'
    if (char === 'r') return '\r'
    if (char === 't') return '\t'
    return char
  })
}

export function checkEmbeddedPython(workerPath = WORKER): EmbeddedPythonReport {
  const code = embeddedPython(readFileSync(workerPath, 'utf8'))

  try {
    execFileSync('python3', ['-c', 'import sys; compile(sys.stdin.read(), "setup", "exec")'], {
      input: code,
      stdio: ['pipe', 'pipe', 'pipe'],
    })
  } catch (error) {
    const failure = error as { status?: number; stderr?: Buffer; code?: string }
    // No interpreter is not a content failure; CI has one, a contributor's
    // machine might not.
    if (failure.code === 'ENOENT') {
      return { ok: true, skipped: 'python3 is not installed', errors: [] }
    }
    const detail = failure.stderr?.toString().trim() ?? String(error)
    return { ok: false, errors: [`${workerPath} — embedded Python does not compile:\n${detail}`] }
  }

  return { ok: true, errors: [] }
}
