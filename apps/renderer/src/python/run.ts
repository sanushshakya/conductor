import { bootPython } from '@conductor/core'
import { host } from '../host'

export interface CodeOutcome {
  ok: boolean
  stdout: string
  stderr: string
  /** Which engine answered, or `none` when neither could run the code. */
  engine: 'cpython' | 'boot' | 'none'
  /**
   * True when nothing executed the code. Graders turn this into "could not be
   * checked" rather than "wrong" — a learner whose correct Track 1 answer is
   * marked wrong because provisioning failed has been told something untrue.
   */
  unavailable?: boolean
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

  // Boot refuses anything outside its documented subset rather than guessing.
  // When the sidecar is also absent, that refusal means NOBODY ran this — it
  // is not a verdict on the learner's code.
  if (!boot.ok && boot.error.kind === 'unsupported') {
    return {
      ok: false,
      stdout: '',
      stderr:
        'The Python engine is not running, so this could not be run. Everything in Boot and SQL still works.',
      engine: 'none',
      unavailable: true,
    }
  }

  return {
    ok: boot.ok,
    stdout: boot.stdout,
    stderr: boot.ok ? '' : `${boot.error.message}\n  on line ${boot.error.line}`,
    engine: 'boot',
  }
}
