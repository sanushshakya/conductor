import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { SqlEngine, setSqlWasmLocator } from './engine'

setSqlWasmLocator((file) => resolve(process.cwd(), 'node_modules/sql.js/dist', file))

const fixture = readFileSync(resolve(process.cwd(), 'content/fixtures/hospital.sql'), 'utf8')

let engine: SqlEngine

beforeAll(async () => {
  engine = await SqlEngine.create(fixture)
})

afterEach(() => engine.reset())

test('exec runs SELECT and returns typed columns and rows', () => {
  const r = engine.exec('SELECT id, full_name FROM patients ORDER BY id LIMIT 3')
  expect(r.ok).toBe(true)
  expect(r.tables).toHaveLength(1)
  expect(r.tables[0]!.columns).toEqual(['id', 'full_name'])
  expect(r.tables[0]!.rows).toHaveLength(3)
  expect(typeof r.tables[0]!.rows[0]![0]).toBe('number')
  expect(typeof r.tables[0]!.rows[0]![1]).toBe('string')
})

test('exec reports how long the query took', () => {
  expect(engine.exec('SELECT 1').ms).toBeGreaterThanOrEqual(0)
})

test('exec on a syntax error returns ok:false with a friendly message', () => {
  const r = engine.exec('SELCT * FROM patients')
  expect(r.ok).toBe(false)
  expect(r.error!.friendly).toMatch(/near "SELCT"/i)
})

test('a friendly message is offered for an unknown table, naming the real ones', () => {
  const r = engine.exec('SELECT * FROM patient')
  expect(r.ok).toBe(false)
  expect(r.error!.friendly).toMatch(/no table called "patient"/i)
  expect(r.error!.hint).toMatch(/patients/)
})

test('an unknown column is explained rather than echoed raw', () => {
  const r = engine.exec('SELECT naem FROM patients')
  expect(r.ok).toBe(false)
  expect(r.error!.friendly).toMatch(/column/i)
  expect(r.error!.friendly).toMatch(/naem/)
})

test('an unmapped error still preserves the original SQLite text', () => {
  const r = engine.exec('SELECT * FROM patients WHERE')
  expect(r.ok).toBe(false)
  expect(r.error!.raw.length).toBeGreaterThan(0)
})

test('a foreign-key violation is reported as a teaching error, not thrown', () => {
  const r = engine.exec(
    "INSERT INTO appointments (patient_id, doctor_id, scheduled_for, status) VALUES (99999, 1, '2026-01-01', 'booked')",
  )
  expect(r.ok).toBe(false)
  expect(r.error!.friendly).toMatch(/foreign key/i)
  expect(r.error!.hint).toMatch(/does not exist|must already exist/i)
})

test('a CHECK violation is reported as a teaching error', () => {
  const r = engine.exec(
    "INSERT INTO appointments (patient_id, doctor_id, scheduled_for, status) VALUES (1, 1, '2026-01-01', 'maybe')",
  )
  expect(r.ok).toBe(false)
  expect(r.error!.friendly).toMatch(/not one of the allowed values|CHECK/i)
})

test('a NOT NULL violation is reported as a teaching error', () => {
  const r = engine.exec(
    "INSERT INTO departments (name, floor, phone) VALUES (NULL, 1, '555')",
  )
  expect(r.ok).toBe(false)
  expect(r.error!.friendly).toMatch(/cannot be empty|NOT NULL/i)
})

test('dropping a table other rows depend on is refused, with a teaching error', () => {
  // Real SQLite behaviour under PRAGMA foreign_keys = ON: dropping `patients`
  // implicitly deletes its rows, and the appointments pointing at them refuse.
  // This is lesson 2.9's whole point, so it is pinned as a guarantee here.
  const r = engine.exec('DROP TABLE patients')
  expect(r.ok).toBe(false)
  expect(r.error!.friendly).toMatch(/foreign key/i)
})

test('reset() restores the fixture after DROP TABLE prescriptions', () => {
  expect(engine.exec('DROP TABLE prescriptions').ok).toBe(true)
  expect(engine.exec('SELECT count(*) FROM prescriptions').ok).toBe(false)
  engine.reset()
  const r = engine.exec('SELECT count(*) AS n FROM prescriptions')
  expect(r.ok).toBe(true)
  expect(r.tables[0]!.rows[0]![0]).toBe(59)
})

test('reset() restores patients after every row is deleted', () => {
  engine.exec('DELETE FROM appointments')
  engine.exec('DELETE FROM prescriptions')
  engine.exec('DELETE FROM patients')
  expect(engine.exec('SELECT count(*) AS n FROM patients').tables[0]!.rows[0]![0]).toBe(0)
  engine.reset()
  expect(engine.exec('SELECT count(*) AS n FROM patients').tables[0]!.rows[0]![0]).toBe(60)
})

test('reset() undoes a DELETE', () => {
  engine.exec('DELETE FROM prescriptions')
  engine.reset()
  expect(engine.exec('SELECT count(*) AS n FROM prescriptions').tables[0]!.rows[0]![0]).toBe(59)
})

test('exec reports rowsAffected for a mutation', () => {
  const r = engine.exec("UPDATE patients SET blood_type = 'O+' WHERE id = 1")
  expect(r.ok).toBe(true)
  expect(r.rowsAffected).toBe(1)
})

test('exec truncates result sets above 500 rows and flags truncation', () => {
  // A cartesian join: 60 x 14 is 840 rows, more than any lesson should show.
  const r = engine.exec('SELECT p.id, d.id FROM patients p, doctors d')
  expect(r.ok).toBe(true)
  expect(r.truncated).toBe(true)
  expect(r.tables[0]!.rows).toHaveLength(500)
  expect(r.totalRows).toBe(840)
})

test('a result set under the cap is not flagged as truncated', () => {
  expect(engine.exec('SELECT * FROM departments').truncated).toBe(false)
})

test('exec handles several statements and returns a table per SELECT', () => {
  const r = engine.exec('SELECT 1 AS a; SELECT 2 AS b;')
  expect(r.ok).toBe(true)
  expect(r.tables).toHaveLength(2)
})

test('schema() lists all five tables with their foreign keys', () => {
  const schema = engine.schema()
  expect(schema.map((t) => t.name).sort()).toEqual([
    'appointments',
    'departments',
    'doctors',
    'patients',
    'prescriptions',
  ])
  const appointments = schema.find((t) => t.name === 'appointments')!
  expect(appointments.foreignKeys).toEqual(
    expect.arrayContaining([
      { column: 'patient_id', referencesTable: 'patients', referencesColumn: 'id' },
      { column: 'doctor_id', referencesTable: 'doctors', referencesColumn: 'id' },
    ]),
  )
})

test('schema() reports column types and the primary key', () => {
  const patients = engine.schema().find((t) => t.name === 'patients')!
  expect(patients.columns.find((c) => c.name === 'id')!.primaryKey).toBe(true)
  expect(patients.columns.find((c) => c.name === 'full_name')!.type).toBe('TEXT')
  expect(patients.columns.find((c) => c.name === 'full_name')!.notNull).toBe(true)
})

test('an empty query is rejected politely rather than crashing', () => {
  const r = engine.exec('   ')
  expect(r.ok).toBe(false)
  expect(r.error!.friendly).toMatch(/nothing to run|empty/i)
})

test('NULL values survive into rows as null, not the string "null"', () => {
  const r = engine.exec('SELECT discharged_on FROM patients WHERE discharged_on IS NULL LIMIT 1')
  expect(r.tables[0]!.rows[0]![0]).toBeNull()
})

test('a fresh engine from the variant fixture holds different data', async () => {
  const variant = readFileSync(resolve(process.cwd(), 'content/fixtures/hospital-variant.sql'), 'utf8')
  const other = await SqlEngine.create(variant)
  expect(other.exec('SELECT count(*) AS n FROM patients').tables[0]!.rows[0]![0]).toBe(41)
})

test('schema() returns an empty list when every table has been dropped', () => {
  // Lesson 2.9 invites the learner to drop tables. Dropping the dependants
  // first succeeds, and sqlite_master then returns zero rows — which sql.js
  // reports as NO result set at all, not an empty one.
  for (const table of ['prescriptions', 'appointments', 'patients', 'doctors', 'departments']) {
    engine.exec(`DROP TABLE ${table}`)
  }
  expect(() => engine.schema()).not.toThrow()
  expect(engine.schema()).toEqual([])
})

test('the engine still works after every table is dropped and reset', () => {
  for (const table of ['prescriptions', 'appointments', 'patients', 'doctors', 'departments']) {
    engine.exec(`DROP TABLE ${table}`)
  }
  engine.reset()
  expect(engine.schema()).toHaveLength(5)
  expect(engine.exec('SELECT count(*) AS n FROM patients').tables[0]!.rows[0]![0]).toBe(60)
})

test('a SELECT matching no rows reports ok with an empty result set, not no result set', () => {
  // Several graders index tables[last]; a zero-row SELECT must still produce
  // a table with its columns, or an exercise whose answer is "no rows" cannot
  // be authored and the learner is told their SELECT was not a SELECT.
  const r = engine.exec("SELECT full_name FROM patients WHERE full_name = 'Nobody At All'")
  expect(r.ok).toBe(true)
  expect(r.tables).toHaveLength(1)
  expect(r.tables[0]!.rows).toEqual([])
  expect(r.tables[0]!.columns).toEqual(['full_name'])
})
