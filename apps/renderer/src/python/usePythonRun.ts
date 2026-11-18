import { useCallback, useState } from 'react'
import type { RunResult } from '@conductor/shared'
import { bootPython } from '@conductor/core'
import { host } from '../host'

/**
 * Runs the learner's Python, wherever it can be run.
 *
 * Track 0 uses the in-app Boot interpreter so the first program runs with no
 * setup at all; from Track 1 the sidecar's real CPython takes over. This hook
 * hides which one answered, with one exception: when the sidecar is down and
 * the code is beyond Boot's subset, the learner is told plainly rather than
 * given a wrong answer.
 */
export function usePythonRun(prefer: 'boot' | 'cpython' = 'cpython') {
  const [result, setResult] = useState<RunResult | null>(null)
  const [running, setRunning] = useState(false)

  const run = useCallback(
    async (code: string, stdin?: string): Promise<RunResult> => {
      setRunning(true)
      try {
        if (prefer === 'cpython') {
          const fromSidecar = (await host().runPython({ code, stdin })) as RunResult
          if (fromSidecar.ok || fromSidecar.exitCode !== null) {
            setResult(fromSidecar)
            return fromSidecar
          }
          // The sidecar refused before running anything (not started yet).
          // Boot's interpreter may still be able to answer honestly.
        }

        const boot = bootPython(code)
        const asRun: RunResult = {
          ok: boot.ok,
          stdout: boot.stdout,
          stderr: boot.ok ? '' : `${boot.error.message}\n  on line ${boot.error.line}`,
          exitCode: boot.ok ? 0 : 1,
          durationMs: 0,
          truncated: false,
        }
        setResult(asRun)
        return asRun
      } finally {
        setRunning(false)
      }
    },
    [prefer],
  )

  return { run, result, running }
}
