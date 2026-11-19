export type JoinValue = string | number | null

export interface JoinTable {
  name: string
  columns: string[]
  rows: JoinValue[][]
}

export type JoinKind = 'inner' | 'left'

export interface JoinRow {
  left: JoinValue[]
  /** Null when the left row matched nothing and the join is a LEFT JOIN. */
  right: JoinValue[] | null
  matched: boolean
  key: JoinValue
}

export interface JoinResult {
  columns: string[]
  rows: JoinRow[]
  /** Keys that found a partner — used to highlight them in the animation. */
  matchedKeys: JoinValue[]
}

/**
 * The join, computed as data so the animation can be driven from it.
 *
 * JOIN is where most people stall in SQL, and the reason is almost always the
 * same: the mental model is "glue two tables side by side", when what actually
 * happens is a row-by-row search for partners. That is why this returns rows
 * tagged with whether they matched — the animation shows the *search*, which
 * is the part a static diagram cannot convey, and then shows the duplicate
 * left row that appears when one doctor has two appointments.
 */
export function computeJoin(
  left: JoinTable,
  right: JoinTable,
  leftColumn: string,
  rightColumn: string,
  kind: JoinKind,
): JoinResult {
  const leftIndex = left.columns.indexOf(leftColumn)
  if (leftIndex === -1) throw new Error(`${left.name} has no column "${leftColumn}"`)
  const rightIndex = right.columns.indexOf(rightColumn)
  if (rightIndex === -1) throw new Error(`${right.name} has no column "${rightColumn}"`)

  const columns = [
    ...left.columns.map((c) => `${left.name}.${c}`),
    ...right.columns.map((c) => `${right.name}.${c}`),
  ]

  const rows: JoinRow[] = []
  const matchedKeys: JoinValue[] = []

  for (const leftRow of left.rows) {
    const key = leftRow[leftIndex]!
    // NULL never matches anything, including another NULL — the same rule
    // lesson 2.3 spends a page on. Matching them here would have the diagram
    // contradict the text it illustrates.
    const partners = key === null ? [] : right.rows.filter((r) => r[rightIndex] === key)

    if (partners.length > 0) {
      matchedKeys.push(key)
      for (const partner of partners) {
        rows.push({ left: leftRow, right: partner, matched: true, key })
      }
    } else if (kind === 'left') {
      rows.push({ left: leftRow, right: null, matched: false, key })
    }
  }

  return { columns, rows, matchedKeys }
}
