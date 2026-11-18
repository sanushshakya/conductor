import type { ResultSet, SqlValue } from './engine'

/**
 * A query's rows.
 *
 * NULL is rendered as a dimmed literal `NULL` rather than an empty cell: the
 * difference between "no value" and "empty text" is a real idea in Track 2,
 * and a blank cell hides it at exactly the moment the learner needs to see it.
 */
export function ResultTable({
  result,
  truncated,
  totalRows,
}: {
  result: ResultSet
  truncated?: boolean
  totalRows?: number
}) {
  if (result.rows.length === 0) {
    return (
      <p className="rounded-lg border border-ink-700 bg-ink-950 px-4 py-3 text-sm text-parchment-400">
        The query ran and matched no rows. That is an answer, not an error.
      </p>
    )
  }

  return (
    <div>
      <div className="overflow-x-auto rounded-lg border border-ink-700">
        <table className="w-full border-collapse text-left font-mono text-xs">
          <thead>
            <tr className="bg-ink-800">
              {result.columns.map((column) => (
                <th
                  key={column}
                  scope="col"
                  className="whitespace-nowrap border-b border-ink-700 px-3 py-2 font-semibold text-brass-400"
                >
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {result.rows.map((row, i) => (
              <tr key={i} className={i % 2 ? 'bg-ink-900' : 'bg-ink-950'}>
                {row.map((cell, j) => (
                  <td
                    key={j}
                    className="whitespace-nowrap border-b border-ink-800 px-3 py-1.5 text-parchment-200"
                  >
                    {renderCell(cell)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-2 text-xs text-parchment-400">
        {truncated
          ? `Showing the first ${result.rows.length} of ${totalRows} rows.`
          : `${result.rows.length} ${result.rows.length === 1 ? 'row' : 'rows'}.`}
      </p>
    </div>
  )
}

function renderCell(value: SqlValue) {
  if (value === null) return <span className="italic text-parchment-400/50">NULL</span>
  if (value instanceof Uint8Array) return <span className="text-parchment-400">{value.length} bytes</span>
  return String(value)
}
