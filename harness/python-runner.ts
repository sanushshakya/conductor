import { spawn } from 'node:child_process'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/**
 * Runs Python for the harness.
 *
 * CI has no sidecar — there is no Electron process to supervise one — but it
 * must still prove that every Track 1 and Track 3 reference solution passes
 * its own grader. This is the same contract the sidecar's runner offers,
 * implemented with a plain subprocess: isolated interpreter, throwaway
 * directory, hard timeout.
 */
export interface RunOutcome {
  ok: boolean
  stdout: string
  stderr: string
}

const TIMEOUT_MS = 15_000

export function createPythonRunner(python = 'python3') {
  return function runCode(code: string, stdin?: string): Promise<RunOutcome> {
    return new Promise((resolve) => {
      const dir = mkdtempSync(join(tmpdir(), 'conductor-harness-'))
      const file = join(dir, 'program.py')
      writeFileSync(file, code)

      let stdout = ''
      let stderr = ''
      let settled = false

      const finish = (outcome: RunOutcome) => {
        if (settled) return
        settled = true
        rmSync(dir, { recursive: true, force: true })
        resolve(outcome)
      }

      const child = spawn(python, ['-I', '-u', '-B', file], { cwd: dir })
      const timer = setTimeout(() => {
        child.kill('SIGKILL')
        finish({ ok: false, stdout, stderr: `${stderr}\nTimed out after ${TIMEOUT_MS}ms` })
      }, TIMEOUT_MS)

      child.stdout.on('data', (chunk: Buffer) => (stdout += chunk.toString()))
      child.stderr.on('data', (chunk: Buffer) => (stderr += chunk.toString()))
      if (stdin) child.stdin.write(stdin)
      child.stdin.end()

      child.on('error', (error) => {
        clearTimeout(timer)
        finish({ ok: false, stdout: '', stderr: `could not start ${python}: ${error.message}` })
      })
      child.on('exit', (code) => {
        clearTimeout(timer)
        finish({ ok: code === 0, stdout, stderr })
      })
    })
  }
}
