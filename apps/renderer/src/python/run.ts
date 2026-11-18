import { bootPython } from '@conductor/core'
import { host } from '../host'

export interface CodeOutcome {
  ok: boolean
  stdout: string
  stderr: string
  /** Which engine answered. Shown in the output panel's footer. */
  engine: 'cpython' | 'boot'
}

/**
 * Runs the learner's Python, wherever it can actually be run.
 *
 * The policy, in one place because both the editor's Run button and the
 * graders must agree on it:
 *
 *  1. Ask the sidecar. Real CPython is the right answer whenever it exists.
 *  2. If the sidecar never actually ran anything — not started, still
 *     provisioning, or absent in the browser preview — fall back to the Boot
 *     interpreter.
 *  3. If the code is beyond Boot's documented subset, Boot refuses and says
 *     so. It never guesses.
 *
 * Step 2 is what keeps Track 0 playable with no Python installed, which is the
 * spec's first goal. Step 3 is what stops that convenience turning into a
 * teaching tool that lies about what Python does.
 */
export async function runLearnerCode(code: string, stdin?: string): Promise<CodeOutcome> {
  const fromSidecar = await host().runPython({ code, stdin })

  // exitCode is null only when nothing was executed. A real crash has an exit
  // code, and must NOT be retried against Boot — the learner's error is the
  // answer, and Boot would report a different one.
  if (fromSidecar.exitCode !== null) {
    return {
      ok: fromSidecar.ok,
      stdout: fromSidecar.stdout,
      stderr: fromSidecar.stderr,
      engine: 'cpython',
    }
  }

  const boot = bootPython(code)
  return {
    ok: boot.ok,
    stdout: boot.stdout,
    stderr: boot.ok ? '' : `${boot.error.message}\n  on line ${boot.error.line}`,
    engine: 'boot',
  }
}
