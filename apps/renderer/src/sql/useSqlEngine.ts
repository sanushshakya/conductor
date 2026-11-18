import { useEffect, useState } from 'react'
import { SqlEngine } from '@conductor/core'
import { fixtures } from '../content'

/**
 * One SQLite instance per fixture, shared across lessons.
 *
 * Creating a database means parsing several hundred INSERTs through WASM.
 * Doing that on every beat would put a visible stall between a learner and
 * their query, so engines are cached and `reset()` is used to undo damage
 * instead of rebuilding from scratch.
 */
const cache = new Map<string, Promise<SqlEngine>>()

export function sqlEngineFor(fixtureName = 'hospital'): Promise<SqlEngine> {
  const existing = cache.get(fixtureName)
  if (existing) return existing

  const sql = fixtures[fixtureName]
  if (!sql) return Promise.reject(new Error(`no fixture called "${fixtureName}"`))

  const created = SqlEngine.create(sql)
  cache.set(fixtureName, created)
  return created
}

export function useSqlEngine(fixtureName = 'hospital') {
  const [engine, setEngine] = useState<SqlEngine | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setEngine(null)
    setError(null)
    sqlEngineFor(fixtureName)
      .then((e) => !cancelled && setEngine(e))
      .catch((e: Error) => !cancelled && setError(e.message))
    return () => {
      cancelled = true
    }
  }, [fixtureName])

  return { engine, ready: engine !== null, error }
}
