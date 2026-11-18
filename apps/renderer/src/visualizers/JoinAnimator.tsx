import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { registerVisualizer, type VisualizerProps } from './registry'
import { computeJoin, type JoinKind, type JoinTable } from './join'

const DEFAULT_LEFT: JoinTable = {
  name: 'doctors',
  columns: ['id', 'full_name'],
  rows: [
    [1, 'Dr Rai'],
    [2, 'Dr Lama'],
    [3, 'Dr Thapa'],
  ],
}

const DEFAULT_RIGHT: JoinTable = {
  name: 'appointments',
  columns: ['id', 'doctor_id', 'reason'],
  rows: [
    [10, 1, 'Chest pain'],
    [11, 1, 'Follow-up'],
    [12, 2, 'Headache'],
  ],
}

/**
 * The JOIN, shown happening.
 *
 * This is the highest-value diagram in the app. The learner steps through one
 * left row at a time and watches it search the right table for partners, so
 * three things become visible that a written explanation never makes stick:
 * a row with two partners appears twice, a row with none vanishes under INNER,
 * and the same row survives with NULLs under LEFT. Switching the join type
 * re-runs the same data, which is what makes the difference concrete.
 */
function JoinAnimator({ config }: VisualizerProps) {
  const left = (config.left as JoinTable | undefined) ?? DEFAULT_LEFT
  const right = (config.right as JoinTable | undefined) ?? DEFAULT_RIGHT
  const leftColumn = (config.leftColumn as string | undefined) ?? 'id'
  const rightColumn = (config.rightColumn as string | undefined) ?? 'doctor_id'

  const [kind, setKind] = useState<JoinKind>((config.kind as JoinKind | undefined) ?? 'inner')
  const [step, setStep] = useState(0)

  const result = useMemo(
    () => computeJoin(left, right, leftColumn, rightColumn, kind),
    [left, right, leftColumn, rightColumn, kind],
  )

  const leftIndex = left.columns.indexOf(leftColumn)
  const rightIndex = right.columns.indexOf(rightColumn)
  const activeLeftRow = step > 0 ? left.rows[step - 1] : undefined
  const activeKey = activeLeftRow?.[leftIndex]
  const visibleRows = result.rows.filter(
    (row) => step >= left.rows.findIndex((r) => r[leftIndex] === row.key) + 1,
  )

  return (
    <div className="rounded-xl border border-ink-700 bg-ink-850 p-5">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {(['inner', 'left'] as JoinKind[]).map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => {
              setKind(option)
              setStep(0)
            }}
            className={`focus-ring rounded-md border px-2.5 py-1 font-mono text-xs transition-colors ${
              kind === option
                ? 'border-brass-500 bg-brass-500/10 text-brass-400'
                : 'border-ink-600 text-parchment-300 hover:border-ink-500'
            }`}
          >
            {option === 'inner' ? 'INNER JOIN' : 'LEFT JOIN'}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            disabled={step === 0}
            className="focus-ring rounded-md border border-ink-600 px-2 py-1 text-xs text-parchment-300 disabled:opacity-40"
          >
            Back
          </button>
          <button
            type="button"
            onClick={() => setStep((s) => Math.min(left.rows.length, s + 1))}
            disabled={step >= left.rows.length}
            className="focus-ring rounded-md bg-brass-500 px-2.5 py-1 text-xs font-medium text-ink-950 disabled:opacity-40"
          >
            {step === 0 ? 'Start' : 'Next row'}
          </button>
        </div>
      </div>

      <p className="mb-4 font-mono text-xs text-parchment-400">
        SELECT * FROM {left.name} {kind === 'left' ? 'LEFT JOIN' : 'JOIN'} {right.name} ON {left.name}
        .{leftColumn} = {right.name}.{rightColumn}
      </p>

      <div className="grid gap-4 md:grid-cols-2">
        <MiniTable
          table={left}
          keyIndex={leftIndex}
          highlightRow={step - 1}
          caption="For each row here…"
        />
        <MiniTable
          table={right}
          keyIndex={rightIndex}
          highlightKey={activeKey}
          caption="…look for partners here"
        />
      </div>

      <div className="mt-5 border-t border-ink-700 pt-4">
        <div className="mb-2 text-xs uppercase tracking-wide text-parchment-400">Result</div>
        {visibleRows.length === 0 ? (
          <p className="text-sm text-parchment-400">
            {step === 0 ? 'Press Start.' : 'Nothing yet — this row found no partner.'}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left font-mono text-xs">
              <thead>
                <tr className="bg-ink-800">
                  {result.columns.map((column) => (
                    <th key={column} className="whitespace-nowrap px-2.5 py-1.5 text-brass-400">
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((row, i) => (
                  <motion.tr
                    key={i}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    className={row.matched ? 'bg-ink-900' : 'bg-brass-600/10'}
                  >
                    {row.left.map((cell, j) => (
                      <td key={`l${j}`} className="px-2.5 py-1 text-parchment-200">
                        {String(cell)}
                      </td>
                    ))}
                    {(row.right ?? right.columns.map(() => null)).map((cell, j) => (
                      <td key={`r${j}`} className="px-2.5 py-1 text-parchment-200">
                        {cell === null ? (
                          <span className="italic text-parchment-400/50">NULL</span>
                        ) : (
                          String(cell)
                        )}
                      </td>
                    ))}
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {step >= left.rows.length && (
          <p className="mt-3 text-sm text-parchment-300">
            {kind === 'inner'
              ? 'Rows with no partner are gone entirely. That silent disappearance is what makes a wrong join type so hard to spot.'
              : 'Every left row survived. The ones with no partner are padded with NULL rather than dropped.'}
          </p>
        )}
      </div>
    </div>
  )
}

function MiniTable({
  table,
  keyIndex,
  highlightRow,
  highlightKey,
  caption,
}: {
  table: JoinTable
  keyIndex: number
  highlightRow?: number
  highlightKey?: string | number | null
  caption: string
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-baseline gap-2">
        <span className="font-mono text-xs font-semibold text-brass-400">{table.name}</span>
        <span className="text-[11px] text-parchment-400">{caption}</span>
      </div>
      <table className="w-full border-collapse overflow-hidden rounded-lg text-left font-mono text-xs">
        <thead>
          <tr className="bg-ink-800">
            {table.columns.map((column, i) => (
              <th
                key={column}
                className={`px-2.5 py-1.5 ${i === keyIndex ? 'text-brass-400' : 'text-parchment-300'}`}
              >
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row, i) => {
            const isActive =
              highlightRow === i || (highlightKey !== undefined && row[keyIndex] === highlightKey)
            return (
              <tr
                key={i}
                className={isActive ? 'bg-brass-500/15' : i % 2 ? 'bg-ink-900' : 'bg-ink-950'}
              >
                {row.map((cell, j) => (
                  <td
                    key={j}
                    className={`px-2.5 py-1 ${
                      j === keyIndex && isActive ? 'text-brass-400' : 'text-parchment-200'
                    }`}
                  >
                    {String(cell)}
                  </td>
                ))}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

registerVisualizer('join-animator', JoinAnimator)
export { JoinAnimator }
