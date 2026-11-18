import { randomBytes } from 'node:crypto'
import type { SidecarStatus } from '@conductor/shared'
import { findFreePort } from './port'

/** The slice of a child process this supervisor uses, so it tests without spawning. */
export interface ChildLike {
  pid?: number
  stdout: { on(event: 'data', listener: (chunk: unknown) => void): void } | null
  stderr: { on(event: 'data', listener: (chunk: unknown) => void): void } | null
  kill(signal?: string): void
  on(event: 'exit', listener: (code: number | null, signal: string | null) => void): void
}

export interface FetchResponseLike {
  ok: boolean
  status: number
  json(): Promise<unknown>
}

export interface SupervisorDeps {
  /** Resolves a usable system interpreter, or null when there is none. */
  findPython(): Promise<string | null>
  /** Creates the virtualenv and installs dependencies. Returns the venv python. */
  provision(systemPython: string, onLog: (line: string) => void): Promise<{ python: string }>
  spawn(command: string, args: string[], env: Record<string, string>): ChildLike
  fetch(url: string, init?: { method?: string; headers?: Record<string, string>; body?: string }): Promise<FetchResponseLike>
  /** Polls /health until it answers, or gives up. */
  waitForHealth(port: number, token: string): Promise<boolean>
  restartDelayMs?: number
}

const PREFERRED_PORT = 52_861
const MAX_RESTARTS = 3
/**
 * How long the sidecar must stay up before a restart is forgiven.
 *
 * Without this window, every successful start resets the counter — so a
 * process that starts and dies immediately restarts forever and the limit is
 * never reached. A crash loop is exactly the case the limit exists for.
 */
const STABLE_MS = 30_000

/**
 * Owns the Python sidecar's lifecycle.
 *
 * The governing requirement is that **nothing here may ever block the app**.
 * Tracks 0 and 2 are fully playable with no Python at all, so every failure
 * mode in this class ends in a `failed` status carrying a sentence a beginner
 * can read — never a thrown exception, never a stack trace, never a modal.
 * `capabilities()` turns that status into an honest statement of what still
 * works, and the UI says so.
 *
 * That is also why the messages below are written out longhand rather than
 * interpolating the underlying error: `ENOENT spawn pip` tells the learner
 * nothing except that something is broken and they cannot fix it.
 */
export class SidecarSupervisor {
  private state: SidecarStatus = { state: 'stopped' }
  private child: ChildLike | null = null
  private token = ''
  private port = 0
  private starting: Promise<SidecarStatus> | null = null
  private restarts = 0
  private stopping = false
  private readySince = 0
  private listeners = new Set<(status: SidecarStatus) => void>()
  private readonly logs: string[] = []

  constructor(private readonly deps: SupervisorDeps) {}

  status(): SidecarStatus {
    return this.state
  }

  onStatus(listener: (status: SidecarStatus) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  /** The last lines the sidecar printed. Shown in a diagnostics panel, not to beginners. */
  recentLogs(): readonly string[] {
    return this.logs
  }

  /**
   * Starts the sidecar, provisioning Python if needed.
   *
   * Concurrent calls share one attempt — the renderer mounts several
   * components that each want Python, and three virtualenvs being built at
   * once in the same directory is a genuinely bad time.
   */
  async start(): Promise<SidecarStatus> {
    if (this.state.state === 'ready') return this.state
    this.starting ??= this.doStart().finally(() => {
      this.starting = null
    })
    return this.starting
  }

  private async doStart(): Promise<SidecarStatus> {
    this.stopping = false

    const systemPython = await this.deps.findPython()
    if (!systemPython) {
      return this.fail(
        'Python 3 was not found on this computer, so the Python and API lessons are paused. Everything in Boot and SQL still works.',
      )
    }

    this.set({ state: 'provisioning', progress: 0 })

    let python: string
    try {
      const provisioned = await this.deps.provision(systemPython, (line) => {
        this.log(line)
        this.set({ state: 'provisioning', progress: this.state.progress ?? 0, message: line })
      })
      python = provisioned.python
    } catch (e) {
      this.log(`provision failed: ${(e as Error).message}`)
      return this.fail(
        'The Python engine could not finish setting itself up, so Python and API lessons are paused. Boot and SQL lessons are unaffected.',
      )
    }

    this.set({ state: 'starting' })
    this.token = randomBytes(24).toString('hex')
    this.port = await findFreePort(PREFERRED_PORT)

    this.child = this.deps.spawn(
      python,
      ['-m', 'uvicorn', 'app.main:app', '--host', '127.0.0.1', '--port', String(this.port)],
      {
        // The token never touches disk and is new on every launch, so a stale
        // one cannot be replayed against a later session.
        CONDUCTOR_TOKEN: this.token,
        PYTHONUNBUFFERED: '1',
      },
    )

    this.child.stdout?.on('data', (chunk) => this.log(String(chunk)))
    this.child.stderr?.on('data', (chunk) => this.log(String(chunk)))
    this.child.on('exit', (code) => this.handleExit(code))

    const healthy = await this.deps.waitForHealth(this.port, this.token)
    if (!healthy) {
      return this.fail(
        'The Python engine did not start in time, so Python and API lessons are paused. Boot and SQL lessons are unaffected.',
      )
    }

    this.readySince = Date.now()
    return this.set({ state: 'ready', port: this.port })
  }

  private handleExit(code: number | null): void {
    if (this.stopping) return
    this.child = null
    this.log(`sidecar exited with code ${code}`)

    // A sidecar that ran healthily for a while and then died is an isolated
    // incident, not a loop; forgive the earlier restarts.
    if (this.readySince > 0 && Date.now() - this.readySince >= STABLE_MS) {
      this.restarts = 0
    }
    this.readySince = 0

    if (this.restarts >= MAX_RESTARTS) {
      this.fail(
        'The Python engine keeps stopping, so Python and API lessons are paused. Boot and SQL lessons still work normally.',
      )
      return
    }

    this.restarts += 1
    this.set({ state: 'starting', message: 'Restarting the Python engine.' })
    const delay = this.deps.restartDelayMs ?? 500
    setTimeout(() => {
      if (!this.stopping) void this.doStart()
    }, delay)
  }

  async stop(): Promise<void> {
    this.stopping = true
    this.child?.kill('SIGTERM')
    this.child = null
    this.set({ state: 'stopped' })
  }

  /** Makes an authenticated request to the sidecar. Loopback only, by construction. */
  async request(
    path: string,
    init: { method?: string; body?: unknown } = {},
  ): Promise<unknown> {
    if (this.state.state !== 'ready') {
      throw new Error('The Python engine is not running yet, so this cannot be done right now.')
    }
    const response = await this.deps.fetch(`http://127.0.0.1:${this.port}${path}`, {
      method: init.method ?? 'GET',
      headers: {
        'Content-Type': 'application/json',
        'X-Conductor-Token': this.token,
      },
      ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
    })
    return response.json()
  }

  private log(line: string): void {
    const trimmed = line.trim()
    if (!trimmed) return
    this.logs.push(trimmed)
    if (this.logs.length > 200) this.logs.shift()
  }

  private set(status: SidecarStatus): SidecarStatus {
    this.state = status
    for (const listener of this.listeners) listener(status)
    return status
  }

  private fail(message: string): SidecarStatus {
    return this.set({ state: 'failed', message })
  }
}
