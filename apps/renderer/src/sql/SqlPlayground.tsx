import { useEffect, useState } from 'react'
import { CodeEditor } from '../components/CodeEditor'
import { ResultTable } from './ResultTable'
import { SchemaPanel } from './SchemaPanel'
import { useSqlEngine } from './useSqlEngine'
import type { SqlRunResult } from './engine'

interface Props {
  value: string
  onChange(value: string): void
  /** Which fixture to load. Defaults to the main hospital database. */
  fixture?: string
  onResult?(result: SqlRunResult): void
}

/**
 * The SQL surface: an editor, the schema, and the rows that came back.
 *
 * Running and being graded are separate buttons on purpose. Exploration has to
 * be free — a learner who is scared that every run is being marked stops
 * poking at things, and poking at things is how anyone actually learns what a
 * query does.
 */
export function SqlPlayground({ value, onChange, fixture, onResult }: Props) {
  const { engine, ready, error } = useSqlEngine(fixture)
  const [result, setResult] = useState<SqlRunResult | null>(null)
  const [showSchema, setShowSchema] = useState(true)

  useEffect(() => {
    setResult(null)
  }, [value])

  function run() {
    if (!engine) return
    const next = engine.exec(value)
    setResult(next)
    onResult?.(next)
  }

  if (error) {
    return (
      <div className="rounded-lg border border-wrong-500/40 bg-wrong-500/5 px-4 py-3 text-sm text-wrong-400">
        The database could not start: {error}
      </div>
    )
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_15rem]">
      <div className="min-w-0">
        <CodeEditor
          value={value}
          onChange={onChange}
          language="sql"
          minLines={4}
          ariaLabel="SQL editor"
        />

        <div className="mt-3 flex items-center gap-2">
          <button
            type="button"
            onClick={run}
            disabled={!ready}
            className="focus-ring rounded-md border border-ink-600 px-3 py-1.5 text-sm text-parchment-200 transition-colors hover:border-parchment-400 disabled:opacity-50"
          >
            {ready ? 'Run query' : 'Starting database…'}
          </button>
          <button
            type="button"
            onClick={() => {
              engine?.reset()
              setResult(null)
            }}
            className="focus-ring text-xs text-parchment-400 transition-colors hover:text-parchment-200"
            title="Rebuild the hospital database from scratch"
          >
            Reset database
          </button>
          <button
            type="button"
            onClick={() => setShowSchema((s) => !s)}
            className="focus-ring ml-auto text-xs text-parchment-400 transition-colors hover:text-parchment-200 lg:hidden"
          >
            {showSchema ? 'Hide schema' : 'Show schema'}
          </button>
        </div>

        {result && (
          <div className="mt-3 space-y-3">
            {result.ok ? (
              <>
                {result.tables.map((table, i) => (
                  <ResultTable
                    key={i}
                    result={table}
                    truncated={result.truncated}
                    totalRows={result.totalRows}
                  />
                ))}
                {result.tables.length === 0 && (
                  <p className="rounded-lg border border-verify-600/40 bg-verify-600/10 px-4 py-3 text-sm text-verify-400">
                    Done — {result.rowsAffected}{' '}
                    {result.rowsAffected === 1 ? 'row changed' : 'rows changed'}.
                  </p>
                )}
                <p className="text-xs text-parchment-400">Ran in {result.ms} ms.</p>
              </>
            ) : (
              <div className="rounded-lg border border-wrong-500/40 bg-wrong-500/5 px-4 py-3">
                <p className="text-sm text-wrong-400">{result.error!.friendly}</p>
                {result.error!.hint && (
                  <p className="mt-1.5 text-xs text-parchment-300">{result.error!.hint}</p>
                )}
                <details className="mt-2">
                  <summary className="cursor-pointer text-xs text-parchment-400">
                    What SQLite actually said
                  </summary>
                  <pre className="mt-1 overflow-x-auto font-mono text-xs text-parchment-400">
                    {result.error!.raw}
                  </pre>
                </details>
              </div>
            )}
          </div>
        )}
      </div>

      <aside className={`min-w-0 ${showSchema ? '' : 'hidden lg:block'}`}>
        <div className="mb-2 text-xs font-medium uppercase tracking-wide text-parchment-400">
          Schema
        </div>
        {engine && <SchemaPanel tables={engine.schema()} />}
      </aside>
    </div>
  )
}
