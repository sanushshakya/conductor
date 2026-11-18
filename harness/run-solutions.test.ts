import { runAllSolutions } from './run-solutions'

test('every authored reference solution passes its own grader', async () => {
  const report = await runAllSolutions('content')
  expect(report.failures).toEqual([])
  expect(report.ok).toBe(true)
  expect(report.total).toBeGreaterThan(20)
}, 60_000)

test('a deliberately wrong reference solution is reported as a failure', async () => {
  const report = await runAllSolutions('harness/__fixtures__/wrong-solution')
  expect(report.ok).toBe(false)
  expect(report.failures).toHaveLength(1)
  expect(report.failures[0]!.exerciseId).toBe('broken-ex')
  expect(report.failures[0]!.reason).toMatch(/did not pass|expected/i)
}, 30_000)

test('the report names the lesson a failing solution belongs to', async () => {
  const report = await runAllSolutions('harness/__fixtures__/wrong-solution')
  expect(report.failures[0]!.lessonId).toBe('9.1')
})

test('every duel is internally consistent', async () => {
  const report = await runAllSolutions('content')
  expect(report.duelFailures).toEqual([])
})

test('a duel whose bugLine is outside its code is reported', async () => {
  const report = await runAllSolutions('harness/__fixtures__/bad-duel')
  expect(report.duelFailures.some((f) => /bugLine/i.test(f.reason))).toBe(true)
})

test('a duel whose fix is identical to its buggy code is reported', async () => {
  const report = await runAllSolutions('harness/__fixtures__/bad-duel')
  expect(report.duelFailures.some((f) => /identical|same/i.test(f.reason))).toBe(true)
})

test('the transaction criteria cannot be passed by discharging alone', async () => {
  // A criterion that its own half-solution also passes is testing nothing.
  // These two are the only exercises in the course requiring two coordinated
  // writes, so they are pinned explicitly.
  const { gradeExercise } = await import('./run-solutions')
  for (const [lessonFile, exerciseId, halfAnswer] of [
    ['content', 'sql-transaction', "UPDATE patients SET discharged_on = '2026-11-18' WHERE id = 1;"],
    ['content', 'boss-dbms-safe-discharge', "UPDATE patients SET discharged_on = '2026-11-18' WHERE id = 2;"],
  ] as const) {
    const result = await gradeExercise(lessonFile, exerciseId, halfAnswer)
    expect(result.passed, `${exerciseId} was satisfied by half the work`).toBe(false)
  }
}, 30_000)

test('an api-suite exercise naming an unknown suite is reported', async () => {
  const report = await runAllSolutions('harness/__fixtures__/bad-api-suite')
  expect(report.ok).toBe(false)
  expect(report.failures.some((f) => /does not provide/.test(f.reason))).toBe(true)
})

test('api-suite exercises are not counted as reference solutions', async () => {
  // Their "solution" is a running server, so there is nothing to execute.
  const withApi = await runAllSolutions('content')
  expect(withApi.ok).toBe(true)
})

test('a duel whose bugLine points at a blank line is reported', async () => {
  const report = await runAllSolutions('harness/__fixtures__/blank-bug-line')
  expect(report.duelFailures.some((f) => /blank line/.test(f.reason))).toBe(true)
})
