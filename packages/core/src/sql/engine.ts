import initSqlJs, { type Database, type SqlJsStatic } from 'sql.js'

/**
 * SQLite, compiled to WebAssembly, running in the renderer.
 *
 * Track 2 is the centre of this course, so it deliberately depends on nothing
 * that can fail to install: no Python, no server, no network. The learner gets
 * a real SQLite — real foreign keys, real CHECK constraints, real query
 * planner — that resets to a known fixture whenever they wreck it, which they
 * are explicitly encouraged to do.
 */

export type SqlValue = string | number | Uint8Array | null

export interface ResultSet {
  columns: string[]
  rows: SqlValue[][]
}

/**
 * An error a beginner can act on.
 *
 * SQLite's messages are precise and completely opaque to someone in their
 * first week ("no such column: naem"). The raw text is always preserved —
 * learning to read real errors is a Track 0 objective and this must not undo
 * it — but a plain-language translation sits in front of it.
 */
export interface SqlTeachingError {
  raw: string
  friendly: string
  hint?: string
}

export interface SqlRunResult {
  ok: boolean
  tables: ResultSet[]
  error?: SqlTeachingError
  rowsAffected: number
  ms: number
  /** True when rows were dropped to keep the table renderable. */
  truncated: boolean
  /** Rows the query actually produced, before truncation. */
  totalRows: number
}

export interface ColumnInfo {
  name: string
  type: string
  notNull: boolean
  primaryKey: boolean
}

export interface ForeignKeyInfo {
  column: string
  referencesTable: string
  referencesColumn: string
}

export interface TableInfo {
  name: string
  columns: ColumnInfo[]
  foreignKeys: ForeignKeyInfo[]
}

/** Rows beyond this are dropped: past a few hundred the table teaches nothing. */
const ROW_CAP = 500

let locateFile: ((file: string) => string) | undefined
let sqlJsPromise: Promise<SqlJsStatic> | null = null

/** Tells sql.js where its .wasm lives. The browser and Node resolve it differently. */
export function setSqlWasmLocator(fn: (file: string) => string): void {
  locateFile = fn
  sqlJsPromise = null
}

async function sqlJs(): Promise<SqlJsStatic> {
  sqlJsPromise ??= initSqlJs(locateFile ? { locateFile } : {})
  return sqlJsPromise
}

const KNOWN_TABLES = ['departments', 'doctors', 'patients', 'appointments', 'prescriptions']

/** Translates SQLite's message into something a beginner can act on. */
export function explainSqlError(raw: string): SqlTeachingError {
  const message = raw.replace(/^Error:\s*/, '')

  let match = /no such table:\s*(\S+)/i.exec(message)
  if (match) {
    const name = match[1]!
    const near = KNOWN_TABLES.find((t) => t.startsWith(name) || name.startsWith(t.slice(0, -1)))
    return {
      raw: message,
      friendly: `There is no table called "${name}" in this database.`,
      hint: near
        ? `Did you mean "${near}"? Table names here are plural: ${KNOWN_TABLES.join(', ')}.`
        : `The tables in this database are: ${KNOWN_TABLES.join(', ')}.`,
    }
  }

  match = /no such column:\s*(\S+)/i.exec(message)
  if (match) {
    return {
      raw: message,
      friendly: `There is no column called "${match[1]}" in the tables you are querying.`,
      hint: 'Check the spelling against the schema panel — and check you are selecting from the table that holds it.',
    }
  }

  match = /near "([^"]+)":\s*syntax error/i.exec(message)
  if (match) {
    return {
      raw: message,
      friendly: `SQL stopped making sense near "${match[1]}".`,
      hint: 'SQLite names the first thing it could not understand, so the real mistake is usually at or just before that word.',
    }
  }

  if (/FOREIGN KEY constraint failed/i.test(message)) {
    return {
      raw: message,
      friendly: 'A foreign key rejected this — you referred to a row that is not there.',
      hint: 'The row you point at must already exist. An appointment cannot belong to a patient who does not exist; that is the database protecting you.',
    }
  }

  match = /NOT NULL constraint failed:\s*(\S+)/i.exec(message)
  if (match) {
    return {
      raw: message,
      friendly: `${match[1]} cannot be empty, so this row was rejected.`,
      hint: 'A NOT NULL column is a promise the table makes. Supply a value for it.',
    }
  }

  match = /UNIQUE constraint failed:\s*(\S+)/i.exec(message)
  if (match) {
    return {
      raw: message,
      friendly: `${match[1]} must be unique, and that value is already in the table.`,
      hint: 'Either this row is a duplicate, or the value belongs to a different row already.',
    }
  }

  if (/CHECK constraint failed/i.test(message)) {
    return {
      raw: message,
      friendly: 'That value is not one of the allowed values for its column.',
      hint: 'The schema restricts this column to a fixed set — check the schema panel for which.',
    }
  }

  if (/incomplete input|unrecognized token/i.test(message)) {
    return {
      raw: message,
      friendly: 'The statement stops before it is finished.',
      hint: 'Something is missing at the end — often a closing quote, a bracket, or the rest of a WHERE.',
    }
  }

  return {
    raw: message,
    friendly: message,
    hint: 'Read it from the left: SQLite describes what it was doing when it gave up.',
  }
}

export class SqlEngine {
  private constructor(
    private db: Database,
    private readonly sql: SqlJsStatic,
    private readonly fixture: string,
  ) {}

  static async create(fixtureSql: string): Promise<SqlEngine> {
    const sql = await sqlJs()
    const db = new sql.Database()
    db.run('PRAGMA foreign_keys = ON;')
    db.run(fixtureSql)
    return new SqlEngine(db, sql, fixtureSql)
  }

  /**
   * Runs whatever the learner typed.
   *
   * Nothing is forbidden — `DROP TABLE patients` is allowed to work, because
   * discovering that it does, and that `reset` brings it back, teaches more
   * about what a database is than being told would. Errors are returned, not
   * thrown: a thrown error in the renderer is a white screen, and losing the
   * lesson to a typo is the one outcome this must never produce.
   */
  exec(statement: string): SqlRunResult {
    const started = performance.now()

    if (statement.trim() === '') {
      return {
        ok: false,
        tables: [],
        rowsAffected: 0,
        ms: 0,
        truncated: false,
        totalRows: 0,
        error: {
          raw: '',
          friendly: 'There is nothing to run yet — the editor is empty.',
          hint: 'Write a statement, then run it.',
        },
      }
    }

    try {
      // Statements are iterated rather than passed to `db.exec`, because
      // `exec` omits a result set entirely when a SELECT matches no rows. That
      // loses the column names, and makes "no rows" indistinguishable from
      // "that was not a SELECT" — which is both a crash in `schema()` when the
      // database is empty and a misleading grader message for any exercise
      // whose correct answer happens to be zero rows.
      const tables: ResultSet[] = []
      let truncated = false
      let totalRows = 0

      for (const prepared of this.db.iterateStatements(statement)) {
        try {
          const columns = prepared.getColumnNames()

          if (columns.length === 0) {
            // DDL or DML: stepping once is what executes it.
            prepared.step()
            continue
          }

          const rows: SqlValue[][] = []
          while (prepared.step()) {
            totalRows += 1
            if (rows.length < ROW_CAP) rows.push(prepared.get() as SqlValue[])
            else truncated = true
          }
          tables.push({ columns, rows })
        } finally {
          prepared.free()
        }
      }

      return {
        ok: true,
        tables,
        rowsAffected: this.db.getRowsModified(),
        ms: Math.round(performance.now() - started),
        truncated,
        totalRows,
      }
    } catch (e) {
      return {
        ok: false,
        tables: [],
        rowsAffected: 0,
        ms: Math.round(performance.now() - started),
        truncated: false,
        totalRows: 0,
        error: explainSqlError((e as Error).message),
      }
    }
  }

  /** Throws the database away and rebuilds it from the fixture. */
  reset(): void {
    this.db.close()
    this.db = new this.sql.Database()
    this.db.run('PRAGMA foreign_keys = ON;')
    this.db.run(this.fixture)
  }

  /** The live schema, read back from SQLite rather than from the fixture text. */
  schema(): TableInfo[] {
    const tables = this.exec(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
    )
    // A database with no tables is a legitimate state — lesson 2.9 invites the
    // learner to drop them — and must not take the screen down with it.
    if (!tables.ok || tables.tables.length === 0) return []

    return tables.tables[0]!.rows.map((row) => {
      const name = String(row[0])
      const columns = this.exec(`PRAGMA table_info(${name})`)
      const keys = this.exec(`PRAGMA foreign_key_list(${name})`)

      return {
        name,
        columns: columns.ok
          ? columns.tables[0]!.rows.map((c) => ({
              name: String(c[1]),
              type: String(c[2]),
              notNull: Number(c[3]) === 1,
              primaryKey: Number(c[5]) === 1,
            }))
          : [],
        foreignKeys: keys.ok
          ? (keys.tables[0]?.rows ?? []).map((k) => ({
              column: String(k[3]),
              referencesTable: String(k[2]),
              referencesColumn: String(k[4]),
            }))
          : [],
      }
    })
  }

  /** Releases the WASM database. */
  close(): void {
    this.db.close()
  }
}
