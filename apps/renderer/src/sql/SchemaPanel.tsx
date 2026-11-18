import type { TableInfo } from '@conductor/core'

/**
 * The live schema, always visible beside the editor.
 *
 * Beginners do not fail SQL exercises because joins are hard; they fail
 * because they cannot remember whether the column is `name` or `full_name`.
 * Keeping the answer on screen removes a frustration that teaches nothing.
 */
export function SchemaPanel({ tables }: { tables: TableInfo[] }) {
  return (
    <div className="space-y-3 text-xs">
      {tables.map((table) => (
        <div key={table.name} className="rounded-lg border border-ink-700 bg-ink-900 p-3">
          <div className="mb-1.5 font-mono font-semibold text-brass-400">{table.name}</div>
          <ul className="space-y-0.5 font-mono">
            {table.columns.map((column) => {
              const fk = table.foreignKeys.find((k) => k.column === column.name)
              return (
                <li key={column.name} className="flex items-baseline gap-2">
                  <span className={column.primaryKey ? 'text-parchment-100' : 'text-parchment-300'}>
                    {column.name}
                  </span>
                  <span className="text-[10px] text-parchment-400/60">{column.type}</span>
                  {column.primaryKey && <span className="text-[10px] text-brass-600">PK</span>}
                  {fk && (
                    <span className="text-[10px] text-verify-400/70">
                      → {fk.referencesTable}.{fk.referencesColumn}
                    </span>
                  )}
                  {column.notNull && !column.primaryKey && (
                    <span className="text-[10px] text-parchment-400/40">required</span>
                  )}
                </li>
              )
            })}
          </ul>
        </div>
      ))}
    </div>
  )
}
