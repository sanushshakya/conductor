import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Getting Python ready, without the learner knowing it happened.
 *
 * The spec forbids the app ever showing a terminal command as a prerequisite,
 * so the app builds its own virtualenv in its user-data directory on first
 * run and installs pinned dependencies into it. That takes twenty seconds
 * once, in the background, while the learner is already inside Track 0 — which
 * is why `start()` is called after the window is showing, not before.
 */

export interface ProvisionResult {
  python: string
}

const PROBE_SCRIPT = 'import sys; print(sys.version_info[0], sys.version_info[1])'

/**
 * Finds a system interpreter that is new enough.
 *
 * `python3` and `python` are tried in turn; anything older than 3.10 is
 * rejected rather than used, because failing later with a syntax error inside
 * a dependency is far more confusing than failing here with a clear message.
 */
export async function findPython(candidates = ['python3', 'python3.12', 'python']): Promise<string | null> {
  for (const candidate of candidates) {
    const version = await probe(candidate)
    if (version && (version[0] > 3 || (version[0] === 3 && version[1] >= 10))) return candidate
  }
  return null
}

function probe(command: string): Promise<[number, number] | null> {
  return new Promise((resolve) => {
    let output = ''
    const child = spawn(command, ['-c', PROBE_SCRIPT], { stdio: ['ignore', 'pipe', 'ignore'] })
    child.stdout.on('data', (chunk: Buffer) => (output += chunk.toString()))
    child.on('error', () => resolve(null))
    child.on('exit', (code) => {
      if (code !== 0) return resolve(null)
      const [major, minor] = output.trim().split(/\s+/).map(Number)
      resolve(major !== undefined && minor !== undefined ? [major, minor] : null)
    })
  })
}

function venvPython(root: string): string {
  return process.platform === 'win32'
    ? join(root, 'Scripts', 'python.exe')
    : join(root, 'bin', 'python')
}

function run(
  command: string,
  args: string[],
  onLog: (line: string) => void,
  cwd?: string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] })
    const emit = (chunk: Buffer) => {
      for (const line of chunk.toString().split('\n')) {
        if (line.trim()) onLog(line.trim())
      }
    }
    child.stdout.on('data', emit)
    child.stderr.on('data', emit)
    child.on('error', reject)
    child.on('exit', (code) =>
      code === 0 ? resolve() : reject(new Error(`${command} exited with code ${code}`)),
    )
  })
}

/**
 * Creates (or reuses) the virtualenv and installs the sidecar's dependencies.
 *
 * Reuse is checked by the interpreter's presence plus an import probe rather
 * than by a marker file: a half-finished install from a previous run that was
 * killed mid-`pip` would otherwise look complete forever.
 */
export async function provisionVenv(
  systemPython: string,
  venvRoot: string,
  requirementsPath: string,
  onLog: (line: string) => void,
): Promise<ProvisionResult> {
  const python = venvPython(venvRoot)

  if (existsSync(python) && (await hasDependencies(python))) {
    onLog('Python environment already set up.')
    return { python }
  }

  onLog('Setting up Python. This happens once and takes about twenty seconds.')
  if (!existsSync(python)) {
    await run(systemPython, ['-m', 'venv', venvRoot], onLog)
  }

  onLog('Installing the Python packages the lessons need…')
  await run(python, ['-m', 'pip', 'install', '--quiet', '--disable-pip-version-check', '-r', requirementsPath], onLog)

  if (!(await hasDependencies(python))) {
    throw new Error('dependencies are still missing after install')
  }

  onLog('Python is ready.')
  return { python }
}

function hasDependencies(python: string): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn(python, ['-c', 'import fastapi, uvicorn, httpx'], { stdio: 'ignore' })
    child.on('error', () => resolve(false))
    child.on('exit', (code) => resolve(code === 0))
  })
}

/**
 * Polls `/health` until the sidecar answers.
 *
 * uvicorn is listening some time after the process exists, and treating spawn
 * as readiness produces a race the learner experiences as "the first thing I
 * ran failed, the second worked".
 */
export async function waitForHealth(
  port: number,
  timeoutMs = 20_000,
  intervalMs = 150,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/health`)
      if (response.ok) return true
    } catch {
      // Not listening yet. Expected for the first second or so.
    }
    await new Promise((r) => setTimeout(r, intervalMs))
  }
  return false
}
