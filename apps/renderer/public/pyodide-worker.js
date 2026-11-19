/* eslint-disable no-undef -- classic worker scope */

/**
 * Runs the learner's Python, in a worker, on real CPython.
 *
 * ## Why a worker
 *
 * A beginner writing their first loop will write an infinite one — not
 * occasionally, but on the way to understanding loops. On the main thread
 * that freezes the entire app with no way back, because JavaScript cannot
 * interrupt itself. A worker can simply be terminated, so the runaway program
 * is killed and the next attempt starts clean. That is the same guarantee the
 * desktop sidecar gets from `subprocess.kill`, obtained the only way a browser
 * offers it.
 *
 * ## What it gives up
 *
 * Pyodide has no OS: no real filesystem, no subprocesses, and no sockets. For
 * this course that is almost entirely upside — it is the sandbox, rather than
 * something that needs sandboxing. `input()` is wired to the stdin the lesson
 * supplies, since there is no terminal to read from.
 */

importScripts('./pyodide/pyodide.js')

let pyodide = null
let loading = null

/** Captures the program's output without letting it reach the host console. */
const SETUP = `
import sys, io, builtins, traceback, linecache

LEARNER_FILE = "your program"

class _Captured(io.StringIO):
    def __init__(self, limit):
        super().__init__()
        self._limit = limit
        self.truncated = False

    def write(self, text):
        if self.tell() >= self._limit:
            self.truncated = True
            return len(text)
        return super().write(text)

def _conductor_run(source, stdin_text):
    """Runs the learner's program and returns (stdout, stderr, ok, truncated).

    Errors are formatted HERE, in Python, rather than letting Pyodide's
    JavaScript wrapper report them. Its message carries the whole bridge —
    run_async frames, 'PythonError', a nested 'During handling of the above
    exception' — and lessons 0.3 and 1.7 teach reading a traceback, so the
    first one a beginner reads must contain their program and nothing else.
    """
    out = _Captured(256 * 1024)
    err = _Captured(256 * 1024)
    previous_out, previous_err = sys.stdout, sys.stderr
    sys.stdout, sys.stderr = out, err

    lines = iter(stdin_text.split("\\n")) if stdin_text else iter(())
    previous_input = builtins.input

    def _input(prompt=""):
        try:
            return next(lines)
        except StopIteration:
            raise EOFError("this program asked for input, and none was given")

    builtins.input = _input
    ok = True

    try:
        # There is no file on disk for traceback to read the offending line
        # from, so without this a traceback names a line number and shows
        # nothing. Lessons 0.3 and 1.7 are about reading that line.
        linecache.cache[LEARNER_FILE] = (
            len(source),
            None,
            source.splitlines(True),
            LEARNER_FILE,
        )

        try:
            compiled = compile(source, LEARNER_FILE, "exec")
        except SyntaxError:
            ok = False
            for line in traceback.format_exception_only(*sys.exc_info()[:2]):
                err.write(line)
            return out.getvalue(), err.getvalue(), ok, out.truncated

        try:
            exec(compiled, {"__name__": "__main__", "__file__": LEARNER_FILE})
        except SystemExit:
            pass
        except BaseException:
            ok = False
            exc_type, exc_value, exc_tb = sys.exc_info()
            # Only the learner's own frames survive.
            frames = [f for f in traceback.extract_tb(exc_tb) if f.filename == LEARNER_FILE]
            err.write("Traceback (most recent call last):\\n")
            for line in traceback.format_list(frames):
                err.write(line)
            for line in traceback.format_exception_only(exc_type, exc_value):
                err.write(line)
    finally:
        sys.stdout, sys.stderr = previous_out, previous_err
        builtins.input = previous_input

    return out.getvalue(), err.getvalue(), ok, out.truncated
`

async function ensurePyodide() {
  if (pyodide) return pyodide
  loading ??= loadPyodide({ indexURL: './pyodide/' }).then(async (instance) => {
    await instance.runPythonAsync(SETUP)
    pyodide = instance
    return instance
  })
  return loading
}

self.onmessage = async (event) => {
  const { id, type, code, stdin } = event.data ?? {}

  if (type === 'warmup') {
    try {
      await ensurePyodide()
      self.postMessage({ id, ready: true })
    } catch (error) {
      self.postMessage({ id, ready: false, error: String(error && error.message) })
    }
    return
  }

  if (type !== 'run') return

  try {
    const instance = await ensurePyodide()

    const run = instance.globals.get('_conductor_run')
    const result = run(code ?? '', stdin ?? '')

    const stdout = result.get(0)
    const stderr = result.get(1)
    const ok = result.get(2)
    const truncated = result.get(3)

    result.destroy?.()
    run.destroy?.()

    self.postMessage({
      id,
      ok: ok === true,
      stdout,
      stderr: truncated
        ? `${stderr}\nThe output was truncated — this program printed more than a lesson shows.`.trim()
        : stderr,
      truncated: truncated === true,
    })
  } catch (error) {
    self.postMessage({
      id,
      ok: false,
      stdout: '',
      stderr: String((error && error.message) || error),
      truncated: false,
    })
  }
}
