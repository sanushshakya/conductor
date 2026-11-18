/**
 * SQLite, compiled to WebAssembly, running in the renderer.
 *
 * Track 2 is the centre of this course, so it deliberately depends on nothing
 * that can fail to install: no Python, no server, no network. The learner gets
 * a real SQLite — real foreign keys, real CHECK constraints, real query
 * planner — that resets to a known fixture whenever they wreck it, which they
 * are explicitly encouraged to do.
 */
export type SqlValue = string | number | Uint8Array | null;
export interface ResultSet {
    columns: string[];
    rows: SqlValue[][];
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
    raw: string;
    friendly: string;
    hint?: string;
}
export interface SqlRunResult {
    ok: boolean;
    tables: ResultSet[];
    error?: SqlTeachingError;
    rowsAffected: number;
    ms: number;
    /** True when rows were dropped to keep the table renderable. */
    truncated: boolean;
    /** Rows the query actually produced, before truncation. */
    totalRows: number;
}
export interface ColumnInfo {
    name: string;
    type: string;
    notNull: boolean;
    primaryKey: boolean;
}
export interface ForeignKeyInfo {
    column: string;
    referencesTable: string;
    referencesColumn: string;
}
export interface TableInfo {
    name: string;
    columns: ColumnInfo[];
    foreignKeys: ForeignKeyInfo[];
}
/** Tells sql.js where its .wasm lives. The browser and Node resolve it differently. */
export declare function setSqlWasmLocator(fn: (file: string) => string): void;
/** Translates SQLite's message into something a beginner can act on. */
export declare function explainSqlError(raw: string): SqlTeachingError;
export declare class SqlEngine {
    private db;
    private readonly sql;
    private readonly fixture;
    private constructor();
    static create(fixtureSql: string): Promise<SqlEngine>;
    /**
     * Runs whatever the learner typed.
     *
     * Nothing is forbidden — `DROP TABLE patients` is allowed to work, because
     * discovering that it does, and that `reset` brings it back, teaches more
     * about what a database is than being told would. Errors are returned, not
     * thrown: a thrown error in the renderer is a white screen, and losing the
     * lesson to a typo is the one outcome this must never produce.
     */
    exec(statement: string): SqlRunResult;
    /** Throws the database away and rebuilds it from the fixture. */
    reset(): void;
    /** The live schema, read back from SQLite rather than from the fixture text. */
    schema(): TableInfo[];
    /** Releases the WASM database. */
    close(): void;
}
