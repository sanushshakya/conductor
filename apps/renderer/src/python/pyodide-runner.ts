/**
 * Real CPython in the browser, via Pyodide in a worker.
 *
 * This is what makes the course distributable as a web page: without it,
 * Tracks 1 and 4 need a Python installation and a virtualenv built on first
 * run, which is a prerequisite no beginner should be asked to satisfy and a
 * silent failure when they cannot.
 *
 * The worker is the sandbox and the kill switch at once. Pyodide has no
 * filesystem, no subprocesses and no sockets, so there is nothing to escape
 * to — and when a learner writes `while True:`, the worker is terminated and
 * replaced, which is the browser's only equivalent of killing a process.
 */

export interface PyodideRunOutcome {
  ok: boolean
  stdout: string
  stderr: string
  truncated: boolean
  /** Set when the program was stopped rather than finishing. */
  killedReason?: 'timeout'
}

const DEFAULT_TIMEOUT_MS = 5000
const WARMUP_TIMEOUT_MS = 60_000

/** The name the worker compiles the learner's program under. */
const LEARNER_FILE = 'File "your program"'

/** Anything naming the runner rather than the program. */
const INTERNAL = /pyodide|PythonError|_base\.py|run_async|\/lib\/python/i

const INTERNAL_MESSAGE =
  'Python ran into a problem inside the app, not in your code. Try running it again.'

type Pending = {
  resolve(outcome: PyodideRunOutcome): void
  timer: ReturnType<typeof setTimeout>
}

export class PyodideRunner {
  private worker: Worker | null = null
  private pending = new Map<string, Pending>()
  private nextId = 0
  private warming: Promise<boolean> | null = null
  private failed = false

  constructor(private readonly workerUrl = '/pyodide-worker.js') {}

  /** True once Python is loaded and a program could run immediately. */
  get ready(): boolean {
    return this.worker !== null && !this.failed
  }

  /**
   * Downloads and starts Python.
   *
   * ~11MB, so it is started in the background as soon as the app opens rather
   * than when a learner first presses Run — by the time they reach Track 1
   * it has long finished, and Track 0 never needed it.
   */
  async warmUp(): Promise<boolean> {
    this.warming ??= this.doWarmUp()
    return this.warming
  }

  private async doWarmUp(): Promise<boolean> {
    try {
      const worker = this.spawn()
      const ok = await new Promise<boolean>((resolve) => {
        const id = this.id()
        const timer = setTimeout(() => resolve(false), WARMUP_TIMEOUT_MS)

        const onMessage = (event: MessageEvent) => {
          if (event.data?.id !== id) return
          clearTimeout(timer)
          worker.removeEventListener('message', onMessage)
          resolve(event.data.ready === true)
        }

        worker.addEventListener('message', onMessage)
        worker.postMessage({ id, type: 'warmup' })
      })

      this.failed = !ok
      return ok
    } catch {
      this.failed = true
      return false
    }
  }

  async run(code: string, stdin?: string, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<PyodideRunOutcome> {
    const worker = this.spawn()
    const id = this.id()

    return new Promise<PyodideRunOutcome>((resolve) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)

        // The worker is wedged inside the learner's loop and will never answer.
        // Terminating is the only way out; the next run gets a fresh one, which
        // means paying the load cost again but never losing the session.
        this.restart()

        resolve({
          ok: false,
          stdout: '',
          stderr: `This program took too long and was stopped after ${Math.round(
            timeoutMs / 1000,
          )} seconds. A loop that never ends is the usual cause.`,
          truncated: false,
          killedReason: 'timeout',
        })
      }, timeoutMs)

      this.pending.set(id, { resolve, timer })
      worker.postMessage({ id, type: 'run', code, stdin })
    })
  }

  /** Releases the worker and everything Python loaded into it. */
  dispose(): void {
    this.worker?.terminate()
    this.worker = null
    this.warming = null
    for (const { timer } of this.pending.values()) clearTimeout(timer)
    this.pending.clear()
  }

  private restart(): void {
    this.worker?.terminate()
    this.worker = null
    this.warming = null
    // Rebuilt lazily; warming starts again on the next run or warmUp.
    void this.warmUp()
  }

  private id(): string {
    this.nextId += 1
    return `py-${this.nextId}`
  }

  private spawn(): Worker {
    if (this.worker) return this.worker

    const worker = new Worker(this.workerUrl)

    worker.addEventListener('message', (event: MessageEvent) => {
      const data = event.data as { id?: string } & PyodideRunOutcome
      if (!data?.id) return

      const waiting = this.pending.get(data.id)
      if (!waiting) return

      clearTimeout(waiting.timer)
      this.pending.delete(data.id)
      waiting.resolve({
        ok: data.ok === true,
        stdout: data.stdout ?? '',
        stderr: cleanTraceback(data.stderr ?? ''),
        truncated: data.truncated === true,
      })
    })

    worker.addEventListener('error', () => {
      this.failed = true
      for (const [id, waiting] of this.pending) {
        clearTimeout(waiting.timer)
        waiting.resolve({
          ok: false,
          stdout: '',
          stderr: 'Python stopped unexpectedly. Try running it again.',
          truncated: false,
        })
        this.pending.delete(id)
      }
    })

    this.worker = worker
    return worker
  }
}

/**
 * Keeps the learner's own frames and discards the runner's.
 *
 * The worker formats errors in Python precisely so this rarely has work to
 * do, but a failure in the bridge itself — Pyodide reporting the error from
 * JavaScript, a worker that died mid-load — arrives here raw. Lessons 0.3 and
 * 1.7 teach reading a traceback, and the first one a beginner reads must
 * describe their program and nothing else, so anything belonging to the app
 * is summarised rather than pasted.
 */
export function cleanTraceback(stderr: string): string {
  if (!stderr.trim()) return ''

  const lines = stderr.split('\n')
  const frames: string[] = []
  let tail: string[] = []
  let hadHeader = false

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? ''
    if (!line.trim()) continue

    if (/^\s*File "/.test(line)) {
      // A frame owns the more-indented source lines that follow it, so they
      // travel together — or are dropped together.
      const frame = [line]
      for (let next = lines[i + 1]; next !== undefined; next = lines[i + 1]) {
        if (!/^\s/.test(next) || /^\s*File "/.test(next)) break
        i += 1
        frame.push(next)
      }
      if (line.includes(LEARNER_FILE)) {
        // `...<N lines>...` is Python eliding frames, never the learner's code.
        frames.push(...frame.filter((entry) => !/\.\.\.<\d+ lines>\.\.\./.test(entry)))
      }
      tail = []
      continue
    }

    // Indented and not part of a frame: runner noise.
    if (/^\s/.test(line)) continue

    if (/^Traceback \(most recent call last\):/.test(line)) {
      hadHeader = true
      continue
    }

    // Pyodide chains its own failure onto the learner's; only theirs is news.
    if (/^(During handling|The above exception)/.test(line)) continue

    // The bridge's own class name, with no message of its own.
    if (/^PythonError\s*$/.test(line)) continue

    tail.push(line)
  }

  const exception = tail.join('\n').trim()
  if (!exception || INTERNAL.test(exception)) return INTERNAL_MESSAGE

  const out: string[] = []
  if (hadHeader && frames.length > 0) out.push('Traceback (most recent call last):')
  out.push(...frames, exception)
  return out.join('\n')
}
