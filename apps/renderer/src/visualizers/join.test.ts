import { computeJoin, type JoinTable } from './join'

const doctors: JoinTable = {
  name: 'doctors',
  columns: ['id', 'name'],
  rows: [
    [1, 'Dr Rai'],
    [2, 'Dr Lama'],
    [3, 'Dr Thapa'],
  ],
}

const appointments: JoinTable = {
  name: 'appointments',
  columns: ['id', 'doctor_id', 'reason'],
  rows: [
    [10, 1, 'Chest pain'],
    [11, 1, 'Follow-up'],
    [12, 2, 'Headache'],
    [13, 99, 'Orphan row'],
  ],
}

test('JoinAnimator renders only matched rows for an INNER join', () => {
  const result = computeJoin(doctors, appointments, 'id', 'doctor_id', 'inner')
  expect(result.rows).toHaveLength(3)
  expect(result.rows.every((r) => r.matched)).toBe(true)
  expect(result.rows.map((r) => r.right![0])).toEqual([10, 11, 12])
})

test('an INNER join drops the row whose key matches nothing', () => {
  const result = computeJoin(doctors, appointments, 'id', 'doctor_id', 'inner')
  expect(result.rows.some((r) => r.right?.[2] === 'Orphan row')).toBe(false)
})

test('JoinAnimator renders unmatched left rows with null padding for a LEFT join', () => {
  const result = computeJoin(doctors, appointments, 'id', 'doctor_id', 'left')
  const unmatched = result.rows.filter((r) => !r.matched)
  expect(unmatched).toHaveLength(1)
  expect(unmatched[0]!.left[1]).toBe('Dr Thapa')
  expect(unmatched[0]!.right).toBeNull()
  expect(result.rows).toHaveLength(4)
})

test('a doctor with two appointments appears twice, which is the lesson', () => {
  const result = computeJoin(doctors, appointments, 'id', 'doctor_id', 'inner')
  expect(result.rows.filter((r) => r.left[1] === 'Dr Rai')).toHaveLength(2)
})

test('the merged column list is left columns then right columns, qualified', () => {
  const result = computeJoin(doctors, appointments, 'id', 'doctor_id', 'inner')
  expect(result.columns).toEqual([
    'doctors.id',
    'doctors.name',
    'appointments.id',
    'appointments.doctor_id',
    'appointments.reason',
  ])
})

test('computeJoin reports which keys matched, for highlighting', () => {
  const result = computeJoin(doctors, appointments, 'id', 'doctor_id', 'inner')
  expect(result.matchedKeys).toEqual([1, 2])
})

test('computeJoin throws a named error when the join column does not exist', () => {
  expect(() => computeJoin(doctors, appointments, 'nope', 'doctor_id', 'inner')).toThrow(/nope/)
})

test('an empty right table yields no rows for INNER and all rows for LEFT', () => {
  const empty: JoinTable = { name: 'appointments', columns: ['id', 'doctor_id'], rows: [] }
  expect(computeJoin(doctors, empty, 'id', 'doctor_id', 'inner').rows).toHaveLength(0)
  expect(computeJoin(doctors, empty, 'id', 'doctor_id', 'left').rows).toHaveLength(3)
})

test('NULL never joins to NULL, the way lesson 2.3 says', () => {
  const withNulls: JoinTable = {
    name: 'doctors',
    columns: ['id', 'name'],
    rows: [[null, 'No department']],
  }
  const others: JoinTable = {
    name: 'appointments',
    columns: ['id', 'doctor_id'],
    rows: [[10, null]],
  }
  expect(computeJoin(withNulls, others, 'id', 'doctor_id', 'inner').rows).toHaveLength(0)
  const left = computeJoin(withNulls, others, 'id', 'doctor_id', 'left')
  expect(left.rows).toHaveLength(1)
  expect(left.rows[0]!.matched).toBe(false)
})
