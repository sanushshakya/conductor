import { grade, registerGrader, registeredKinds, UnknownGraderError } from './index'
import './graders'
import type { GraderConfig } from '@conductor/shared'

const ctx = { exerciseId: 'ex-1', xp: 25 }

async function run(submission: string, config: GraderConfig) {
  return grade(submission, config, ctx)
}

test('output-match grader passes on exact expected stdout', async () => {
  const r = await run('print("Sushil")', { kind: 'output-match', cases: [{ expected: 'Sushil' }] })
  expect(r.passed).toBe(true)
  expect(r.xpAwarded).toBe(25)
})

test('output-match grader trims trailing whitespace before comparing', async () => {
  const r = await run('print("Sushil   ")', { kind: 'output-match', cases: [{ expected: 'Sushil' }] })
  expect(r.passed).toBe(true)
})

test('output-match grader is not fooled by missing output', async () => {
  const r = await run('x = 1', { kind: 'output-match', cases: [{ expected: 'Sushil' }] })
  expect(r.passed).toBe(false)
})

test('output-match grader returns a per-check detail on mismatch', async () => {
  const r = await run('print("Nope")', { kind: 'output-match', cases: [{ expected: 'Sushil' }] })
  expect(r.passed).toBe(false)
  expect(r.checks[0]!.detail).toMatch(/Sushil/)
  expect(r.checks[0]!.detail).toMatch(/Nope/)
})

test('output-match grader reports one check per case and fails only the wrong one', async () => {
  const r = await run('print(2 + 2)', {
    kind: 'output-match',
    cases: [
      { label: 'adds', expected: '4' },
      { label: 'impossible', expected: '5' },
    ],
  })
  expect(r.checks).toHaveLength(2)
  expect(r.checks[0]!.passed).toBe(true)
  expect(r.checks[1]!.passed).toBe(false)
  expect(r.passed).toBe(false)
})

test('output-match grader surfaces a Python error as the check detail', async () => {
  const r = await run('print(missing)', { kind: 'output-match', cases: [{ expected: 'x' }] })
  expect(r.passed).toBe(false)
  expect(r.checks[0]!.detail).toMatch(/NameError/)
})

test('output-match awards no XP when it fails', async () => {
  const r = await run('print("no")', { kind: 'output-match', cases: [{ expected: 'yes' }] })
  expect(r.xpAwarded).toBe(0)
})

test('quiz grader passes on the correct single answer', async () => {
  const r = await run('[1]', {
    kind: 'quiz',
    question: 'q',
    options: ['a', 'b', 'c'],
    correct: [1],
  })
  expect(r.passed).toBe(true)
})

test('quiz grader marks a multi-select answer wrong when partially correct', async () => {
  const r = await run('[0]', {
    kind: 'quiz',
    question: 'q',
    options: ['a', 'b', 'c'],
    correct: [0, 2],
  })
  expect(r.passed).toBe(false)
})

test('quiz grader ignores the order the options were selected in', async () => {
  const r = await run('[2,0]', {
    kind: 'quiz',
    question: 'q',
    options: ['a', 'b', 'c'],
    correct: [0, 2],
  })
  expect(r.passed).toBe(true)
})

test('quiz grader rejects an extra selection beyond the correct set', async () => {
  const r = await run('[0,1,2]', {
    kind: 'quiz',
    question: 'q',
    options: ['a', 'b', 'c'],
    correct: [0, 2],
  })
  expect(r.passed).toBe(false)
})

test('quiz grader returns the authored explanation as the check detail', async () => {
  const r = await run('[0]', {
    kind: 'quiz',
    question: 'q',
    options: ['a', 'b'],
    correct: [1],
    explanation: 'Step 2 runs before step 3.',
  })
  expect(r.checks[0]!.detail).toBe('Step 2 runs before step 3.')
})

test('quiz grader treats an empty submission as unanswered, not correct', async () => {
  const r = await run('[]', { kind: 'quiz', question: 'q', options: ['a', 'b'], correct: [0] })
  expect(r.passed).toBe(false)
})

test('regex-contains passes when every pattern appears', async () => {
  const r = await run('for x in items:', { kind: 'regex-contains', patterns: ['for\\s', 'in\\s'] })
  expect(r.passed).toBe(true)
})

test('regex-contains fails and names the pattern that was missing', async () => {
  const r = await run('print(1)', {
    kind: 'regex-contains',
    patterns: ['for\\s'],
    message: 'Use a loop here.',
  })
  expect(r.passed).toBe(false)
  expect(r.checks[0]!.detail).toBe('Use a loop here.')
})

test('regex-contains fails when a forbidden pattern appears', async () => {
  const r = await run('print("42")', {
    kind: 'regex-contains',
    patterns: ['print'],
    forbidden: ['"42"'],
  })
  expect(r.passed).toBe(false)
})

test('grade() throws a named error for an unregistered grader kind', async () => {
  await expect(grade('x', { kind: 'api-suite', suiteId: 'nope' }, ctx)).rejects.toThrow(
    UnknownGraderError,
  )
})

test('the error for an unregistered kind names the kind', async () => {
  await expect(grade('x', { kind: 'api-suite', suiteId: 'nope' }, ctx)).rejects.toThrow(/api-suite/)
})

test('registerGrader makes a new kind available to grade()', async () => {
  registerGrader('test-only' as never, async () => ({ passed: true, checks: [], xpAwarded: 1 }))
  expect(registeredKinds()).toContain('test-only')
})

test('the three Phase 2 grader kinds are registered on import', () => {
  expect(registeredKinds()).toEqual(expect.arrayContaining(['quiz', 'output-match', 'regex-contains']))
})

test('quiz check label is a verdict, not the first line of a multi-line question', async () => {
  const config = {
    kind: 'quiz' as const,
    question: '1. put 10 in a box\n2. show the box\n\nWhat does it show?',
    options: ['a', 'b'],
    correct: [1],
  }
  const wrong = await grade('[0]', config, ctx)
  const right = await grade('[1]', config, ctx)
  expect(wrong.checks[0]!.label).toBe('Not that one')
  expect(right.checks[0]!.label).toBe('Correct')
})
