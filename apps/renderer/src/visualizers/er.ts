export interface ErColumn {
  name: string
  type: string
  primaryKey?: boolean
}

export interface ErTable {
  name: string
  columns: ErColumn[]
}

export interface ErRelationship {
  /** "table.column" */
  from: string
  /** "table.column" */
  to: string
  kind: 'many-to-one' | 'one-to-one'
}

export interface ErModel {
  tables: ErTable[]
  relationships: ErRelationship[]
}

export interface ErValidation {
  ok: boolean
  errors: string[]
}

function split(reference: string): [string, string] {
  const [table, column] = reference.split('.')
  return [table ?? '', column ?? '']
}

/**
 * Checks a learner-built schema the way a database would.
 *
 * Normalisation is taught by drawing, but a drawing that cannot be wrong
 * teaches nothing — so every rule here is one SQLite itself would enforce: a
 * relationship must point at columns that exist, the target must be a primary
 * key, and every table needs one.
 */
export function validateErModel(model: ErModel): ErValidation {
  const errors: string[] = []
  const byName = new Map<string, ErTable>()

  for (const table of model.tables) {
    if (byName.has(table.name)) errors.push(`There are two tables called "${table.name}" — duplicate table name.`)
    byName.set(table.name, table)
    if (!table.columns.some((c) => c.primaryKey)) {
      errors.push(`"${table.name}" has no primary key, so its rows cannot be told apart.`)
    }
  }

  for (const relationship of model.relationships) {
    const [fromTable, fromColumn] = split(relationship.from)
    const [toTable, toColumn] = split(relationship.to)

    const source = byName.get(fromTable)
    const target = byName.get(toTable)

    if (!source) {
      errors.push(`The relationship starts at "${fromTable}", which is not a table here.`)
      continue
    }
    if (!target) {
      errors.push(`The relationship points at "${toTable}", which is not a table here.`)
      continue
    }
    if (!source.columns.some((c) => c.name === fromColumn)) {
      errors.push(`"${fromTable}" has no column "${fromColumn}" to hold the relationship.`)
      continue
    }

    const targetColumn = target.columns.find((c) => c.name === toColumn)
    if (!targetColumn) {
      errors.push(`"${toTable}" has no column "${toColumn}" to point at.`)
      continue
    }
    if (!targetColumn.primaryKey) {
      errors.push(
        `"${toTable}.${toColumn}" is not a primary key, so it cannot identify one row for the relationship to mean anything.`,
      )
    }
  }

  return { ok: errors.length === 0, errors }
}
