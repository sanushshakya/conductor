import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { grade } from './index'
import './sql-graders'
import { SqlEngine } from '../sql/engine'
import type { GraderConfig } from '@conductor/shared'

const engines = new Map<string, SqlEngine>()

beforeAll(async () => {
  for (const name of ['hospital', 'hospital-variant']) {
    const sql = readFileSync(resolve(process.cwd(), `content/fixtures/${name}.sql`), 'utf8')
    engines.set(name, await SqlEngine.create(sql))
  }
})

afterEach(() => engines.forEach((e) => e.reset()))

const ctx = {
  exerciseId: 'sql-1',
  xp: 25,
  sqlEngineFor: async (name: string) => {
    const engine = engines.get(name)
    if (!engine) throw new Error(`no fixture ${name}`)
    return engine
  },
}

async function run(submission: string, config: GraderConfig) {
  return grade(submission, config, ctx)
}

// ── sql-result ────────────────────────────────────────────────────────────

test('sql-result passes when rows match the reference query', async () => {
  const r = await run('SELECT full_name FROM patients WHERE discharged_on IS NULL', {
    kind: 'sql-result',
    reference: 'SELECT full_name FROM patients WHERE discharged_on IS NULL',
  })
  expect(r.passed).toBe(true)
})

test('sql-result ignores row order when orderSensitive is false', async () => {
  const r = await run('SELECT name FROM departments ORDER BY name DESC', {
    kind: 'sql-result',
    reference: 'SELECT name FROM departments ORDER BY name ASC',
  })
  expect(r.passed).toBe(true)
})

test('sql-result enforces row order when orderSensitive is true', async () => {
  const r = await run('SELECT name FROM departments ORDER BY name DESC', {
    kind: 'sql-result',
    reference: 'SELECT name FROM departments ORDER BY name ASC',
    orderSensitive: true,
  })
  expect(r.passed).toBe(false)
  expect(r.checks.some((c) => /order/i.test(c.detail ?? ''))).toBe(true)
})

test('sql-result accepts a different column alias for the same values', async () => {
  const r = await run('SELECT name AS department FROM departments', {
    kind: 'sql-result',
    reference: 'SELECT name FROM departments',
  })
  expect(r.passed).toBe(true)
})

test('sql-result fails when the learner selects extra columns', async () => {
  const r = await run('SELECT name, floor FROM departments', {
    kind: 'sql-result',
    reference: 'SELECT name FROM departments',
  })
  expect(r.passed).toBe(false)
  expect(r.checks.some((c) => /column/i.test(c.detail ?? ''))).toBe(true)
})

test('sql-result fails when the learner hardcodes the answer as literals', async () => {
  // Correct for the primary database, and meaningless on the variant.
  const hardcoded = `SELECT 'Emergency' AS name
    UNION ALL SELECT 'Cardiology'
    UNION ALL SELECT 'Paediatrics'
    UNION ALL SELECT 'Orthopaedics'
    UNION ALL SELECT 'Oncology'
    UNION ALL SELECT 'Radiology'`

  const against = await run(hardcoded, {
    kind: 'sql-result',
    reference: 'SELECT name FROM departments',
  })
  // Departments are identical in both fixtures, so this one genuinely passes.
  expect(against.passed).toBe(true)

  // Patient counts are not. A hardcoded answer cannot survive the variant.
  const counted = await run("SELECT 23 AS n", {
    kind: 'sql-result',
    reference: 'SELECT count(*) AS n FROM patients WHERE discharged_on IS NULL',
  })
  expect(counted.passed).toBe(false)
  expect(counted.checks.find((c) => c.id === 'fixture-hospital')!.passed).toBe(true)
  expect(counted.checks.find((c) => c.id === 'fixture-hospital-variant')!.passed).toBe(false)
})

test('sql-result reports one check per fixture it was graded against', async () => {
  const r = await run('SELECT count(*) AS n FROM patients', {
    kind: 'sql-result',
    reference: 'SELECT count(*) AS n FROM patients',
  })
  expect(r.checks.map((c) => c.id)).toEqual(['fixture-hospital', 'fixture-hospital-variant'])
})

test('sql-result surfaces the learner SQL error as the check detail', async () => {
  const r = await run('SELCT name FROM departments', {
    kind: 'sql-result',
    reference: 'SELECT name FROM departments',
  })
  expect(r.passed).toBe(false)
  expect(r.checks[0]!.detail).toMatch(/near "SELCT"/i)
})

test('sql-result fails a submission that returns no result set at all', async () => {
  const r = await run("UPDATE patients SET blood_type = 'O+'", {
    kind: 'sql-result',
    reference: 'SELECT name FROM departments',
  })
  expect(r.passed).toBe(false)
})

// ── sql-schema ────────────────────────────────────────────────────────────

test('sql-schema passes when the required table and columns exist', async () => {
  const r = await run(
    'CREATE TABLE wards (id INTEGER PRIMARY KEY, name TEXT NOT NULL, department_id INTEGER REFERENCES departments(id))',
    {
      kind: 'sql-schema',
      tables: [{ name: 'wards', columns: ['id', 'name', 'department_id'] }],
    },
  )
  expect(r.passed).toBe(true)
})

test('sql-schema fails when a required foreign key is missing', async () => {
  const r = await run('CREATE TABLE wards (id INTEGER PRIMARY KEY, department_id INTEGER)', {
    kind: 'sql-schema',
    tables: [
      {
        name: 'wards',
        columns: ['id', 'department_id'],
        foreignKeys: [{ column: 'department_id', references: 'departments.id' }],
      },
    ],
  })
  expect(r.passed).toBe(false)
  expect(r.checks.some((c) => /foreign key/i.test(c.label))).toBe(true)
})

test('sql-schema passes when the foreign key is declared', async () => {
  const r = await run(
    'CREATE TABLE wards (id INTEGER PRIMARY KEY, department_id INTEGER REFERENCES departments(id))',
    {
      kind: 'sql-schema',
      tables: [
        {
          name: 'wards',
          columns: ['id', 'department_id'],
          foreignKeys: [{ column: 'department_id', references: 'departments.id' }],
        },
      ],
    },
  )
  expect(r.passed).toBe(true)
})

test('sql-schema fails when a required column is missing', async () => {
  const r = await run('CREATE TABLE wards (id INTEGER PRIMARY KEY)', {
    kind: 'sql-schema',
    tables: [{ name: 'wards', columns: ['id', 'name'] }],
  })
  expect(r.passed).toBe(false)
  expect(r.checks.some((c) => /name/.test(c.label))).toBe(true)
})

test('sql-schema fails when a NOT NULL requirement is not declared', async () => {
  const r = await run('CREATE TABLE wards (id INTEGER PRIMARY KEY, name TEXT)', {
    kind: 'sql-schema',
    tables: [{ name: 'wards', columns: ['id', 'name'], notNull: ['name'] }],
  })
  expect(r.passed).toBe(false)
})

// ── sql-mutation ──────────────────────────────────────────────────────────

test('sql-mutation verifies effect, not the SQL text', async () => {
  const config: GraderConfig = {
    kind: 'sql-mutation',
    verify: 'SELECT count(*) AS n FROM patients WHERE discharged_on IS NULL',
    expectedRows: [[22]],
  }
  // Two different statements, same effect: discharge exactly one patient.
  const byId = await run(
    "UPDATE patients SET discharged_on = '2026-11-18' WHERE id = (SELECT min(id) FROM patients WHERE discharged_on IS NULL)",
    config,
  )
  expect(byId.passed).toBe(true)

  const byLimit = await run(
    "UPDATE patients SET discharged_on = '2026-11-18' WHERE id IN (SELECT id FROM patients WHERE discharged_on IS NULL LIMIT 1)",
    config,
  )
  expect(byLimit.passed).toBe(true)
})

test('sql-mutation fails when the effect is wrong', async () => {
  const r = await run("UPDATE patients SET discharged_on = '2026-11-18'", {
    kind: 'sql-mutation',
    verify: 'SELECT count(*) AS n FROM patients WHERE discharged_on IS NULL',
    expectedRows: [[22]],
  })
  expect(r.passed).toBe(false)
})

test('sql-mutation rejects a forbidden statement before running it', async () => {
  const r = await run('DELETE FROM prescriptions', {
    kind: 'sql-mutation',
    verify: 'SELECT count(*) AS n FROM prescriptions',
    expectedRows: [[0]],
    forbidden: ['DELETE'],
  })
  expect(r.passed).toBe(false)
  expect(r.checks.some((c) => /not allowed|forbidden/i.test(c.detail ?? ''))).toBe(true)
})

test('sql-mutation leaves the database reset for the next attempt', async () => {
  await run('DELETE FROM prescriptions', {
    kind: 'sql-mutation',
    verify: 'SELECT count(*) AS n FROM prescriptions',
    expectedRows: [[0]],
  })
  const engine = engines.get('hospital')!
  expect(engine.exec('SELECT count(*) AS n FROM prescriptions').tables[0]!.rows[0]![0]).toBe(59)
})

test('sql-mutation runs its setup before the learner statement', async () => {
  const r = await run("UPDATE wards SET name = 'B' WHERE id = 1", {
    kind: 'sql-mutation',
    setup: "CREATE TABLE wards (id INTEGER PRIMARY KEY, name TEXT); INSERT INTO wards VALUES (1, 'A')",
    verify: 'SELECT name FROM wards WHERE id = 1',
    expectedRows: [['B']],
  })
  expect(r.passed).toBe(true)
})

test('a mutating submission cannot move the expected answer to meet itself', async () => {
  // The learner's statements used to run BEFORE the reference, on the same
  // database, so a submission that deleted most of the table and rewrote the
  // rest passed against a reference it had itself arranged.
  const cheat = `DELETE FROM prescriptions; DELETE FROM appointments;
    DELETE FROM patients WHERE id <> (SELECT MIN(id) FROM patients);
    UPDATE patients SET blood_type = 'O-';
    SELECT full_name FROM patients;`

  const r = await run(cheat, {
    kind: 'sql-result',
    reference: "SELECT full_name FROM patients WHERE blood_type = 'O-'",
  })
  expect(r.passed).toBe(false)
})

test('a genuine query still passes after the reference is computed separately', async () => {
  const r = await run("SELECT full_name FROM patients WHERE blood_type = 'O-'", {
    kind: 'sql-result',
    reference: "SELECT full_name FROM patients WHERE blood_type = 'O-'",
  })
  expect(r.passed).toBe(true)
})

test('an exercise whose correct answer is zero rows can be authored', async () => {
  const r = await run("SELECT full_name FROM patients WHERE blood_type = 'ZZ'", {
    kind: 'sql-result',
    reference: "SELECT full_name FROM patients WHERE blood_type = 'ZZ'",
  })
  expect(r.passed).toBe(true)
})
