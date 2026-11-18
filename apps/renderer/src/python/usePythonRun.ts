import { useCallback, useState } from 'react'
import { runLearnerCode, type CodeOutcome } from './run'

/** React wrapper around the single run policy in `run.ts`. */
export function usePythonRun() {
  const [result, setResult] = useState<CodeOutcome | null>(null)
  const [running, setRunning] = useState(false)

  const run = useCallback(async (code: string, stdin?: string) => {
    setRunning(true)
    try {
      const outcome = await runLearnerCode(code, stdin)
      setResult(outcome)
      return outcome
    } finally {
      setRunning(false)
    }
  }, [])

  return { run, result, running }
}
