import { useState } from 'react'
import { registerVisualizer, type VisualizerProps } from './registry'
import { validateErModel, type ErModel } from './er'

const STARTER: ErModel = {
  tables: [
    {
      name: 'departments',
      columns: [
        { name: 'id', type: 'INTEGER', primaryKey: true },
        { name: 'name', type: 'TEXT' },
      ],
    },
    {
      name: 'doctors',
      columns: [
        { name: 'id', type: 'INTEGER', primaryKey: true },
        { name: 'full_name', type: 'TEXT' },
        { name: 'department_id', type: 'INTEGER' },
      ],
    },
  ],
  relationships: [{ from: 'doctors.department_id', to: 'departments.id', kind: 'many-to-one' }],
}

/**
 * Build the schema, then find out whether it holds up.
 *
 * Normalisation is a judgement, not a recipe, so the useful exercise is making
 * a decision and having it checked. Every rule the validator applies is one
 * SQLite would also apply, so "it validates here" means something.
 */
function ErDiagramBuilder({ config }: VisualizerProps) {
  const [model, setModel] = useState<ErModel>((config.model as ErModel | undefined) ?? STARTER)
  const validation = validateErModel(model)

  function toggleKey(tableName: string, columnName: string) {
    setModel((current) => ({
      ...current,
      tables: current.tables.map((table) =>
        table.name !== tableName
          ? table
          : {
              ...table,
              columns: table.columns.map((column) =>
                column.name === columnName ? { ...column, primaryKey: !column.primaryKey } : column,
              ),
            },
      ),
    }))
  }

  return (
    <div className="rounded-xl border border-ink-700 bg-ink-850 p-5">
      <p className="mb-3 text-xs text-parchment-400">
        Click a column to make it the primary key. The checks below are the same ones the database
        would make.
      </p>

      <div className="grid gap-4 md:grid-cols-2">
        {model.tables.map((table) => (
          <div key={table.name} className="rounded-lg border border-ink-700 bg-ink-900 p-3">
            <div className="mb-2 font-mono text-xs font-semibold text-brass-400">{table.name}</div>
            <ul className="space-y-1">
              {table.columns.map((column) => {
                const link = model.relationships.find(
                  (r) => r.from === `${table.name}.${column.name}`,
                )
                return (
                  <li key={column.name}>
                    <button
                      type="button"
                      onClick={() => toggleKey(table.name, column.name)}
                      className={`focus-ring flex w-full items-baseline gap-2 rounded px-2 py-1 text-left font-mono text-xs transition-colors ${
                        column.primaryKey
                          ? 'bg-brass-500/15 text-brass-400'
                          : 'text-parchment-300 hover:bg-ink-800'
                      }`}
                    >
                      <span>{column.name}</span>
                      <span className="text-[10px] text-parchment-400/60">{column.type}</span>
                      {column.primaryKey && <span className="text-[10px]">PK</span>}
                      {link && (
                        <span className="ml-auto text-[10px] text-verify-400/70">→ {link.to}</span>
                      )}
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </div>

      <div className="mt-4 border-t border-ink-700 pt-3">
        {validation.ok ? (
          <p className="text-sm text-verify-400">
            This schema holds up — every table can identify its rows, and every link points at a key.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {validation.errors.map((error) => (
              <li key={error} className="text-sm text-wrong-400">
                {error}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

registerVisualizer('er-builder', ErDiagramBuilder)
export { ErDiagramBuilder }
