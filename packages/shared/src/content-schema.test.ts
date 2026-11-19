import {
  LessonSchema,
  TrackSchema,
  GraderConfigSchema,
  camelizeKeys,
  GRADER_KINDS,
} from './content-schema'

const validExercise = {
  id: 'boot-first-line',
  prompt: 'Make the program print your name.',
  starter: 'print("")',
  solution: 'print("Sushil")',
  hints: ['What goes between the quotes?', 'Strings hold text.', 'print("your name")'],
  grader: { kind: 'output-match', cases: [{ expected: 'Sushil' }] },
}

const validLesson = {
  id: '0.1',
  track: 'boot',
  title: 'What a program actually is',
  estimate_minutes: 6,
  beats: [{ kind: 'prose', body: 'A program is a list of instructions.' }],
}

function lessonWithHints(count: number) {
  return {
    ...validLesson,
    beats: [
      {
        kind: 'code',
        language: 'python',
        exercise: { ...validExercise, hints: Array.from({ length: count }, (_, i) => `hint ${i}`) },
      },
    ],
  }
}

test('camelizeKeys converts nested snake_case keys and preserves arrays', () => {
  expect(camelizeKeys({ estimate_minutes: 6, a: [{ verified_on: 'x' }] })).toEqual({
    estimateMinutes: 6,
    a: [{ verifiedOn: 'x' }],
  })
})

test('camelizeKeys leaves string values untouched', () => {
  expect(camelizeKeys({ body: 'snake_case stays in prose' })).toEqual({
    body: 'snake_case stays in prose',
  })
})

test('accepts a minimal valid lesson', () => {
  expect(LessonSchema.safeParse(camelizeKeys(validLesson)).success).toBe(true)
})

test('rejects a lesson with fewer than three hints', () => {
  expect(LessonSchema.safeParse(camelizeKeys(lessonWithHints(2))).success).toBe(false)
})

test('rejects a lesson with more than three hints', () => {
  expect(LessonSchema.safeParse(camelizeKeys(lessonWithHints(4))).success).toBe(false)
})

test('accepts a lesson with exactly three hints', () => {
  expect(LessonSchema.safeParse(camelizeKeys(lessonWithHints(3))).success).toBe(true)
})

test('rejects unknown top-level keys', () => {
  const r = LessonSchema.safeParse(camelizeKeys({ ...validLesson, extra_thing: true }))
  expect(r.success).toBe(false)
})

test('rejects a lesson with no beats', () => {
  expect(LessonSchema.safeParse(camelizeKeys({ ...validLesson, beats: [] })).success).toBe(false)
})

test('requires verified_on when a beat has volatile: true', () => {
  const volatileNoDate = {
    ...validLesson,
    beats: [{ kind: 'prose', body: 'Antigravity has a free tier.', volatile: true }],
  }
  expect(LessonSchema.safeParse(camelizeKeys(volatileNoDate)).success).toBe(false)

  const volatileWithDate = {
    ...validLesson,
    beats: [
      { kind: 'prose', body: 'Antigravity has a free tier.', volatile: true, verified_on: '2026-11-18' },
    ],
  }
  expect(LessonSchema.safeParse(camelizeKeys(volatileWithDate)).success).toBe(true)
})

test('rejects a verified_on that is not a calendar date', () => {
  const bad = {
    ...validLesson,
    beats: [{ kind: 'prose', body: 'x', volatile: true, verified_on: 'last tuesday' }],
  }
  expect(LessonSchema.safeParse(camelizeKeys(bad)).success).toBe(false)
})

test('a visual beat must name a visualizer', () => {
  const bad = { ...validLesson, beats: [{ kind: 'visual' }] }
  expect(LessonSchema.safeParse(camelizeKeys(bad)).success).toBe(false)
})

test('every declared grader kind parses', () => {
  const samples: Record<string, unknown> = {
    quiz: { kind: 'quiz', question: 'Which runs first?', options: ['a', 'b'], correct: [0] },
    'output-match': { kind: 'output-match', cases: [{ expected: 'hi' }] },
    'regex-contains': { kind: 'regex-contains', patterns: ['for\\s'] },
    'sql-result': { kind: 'sql-result', reference: 'SELECT 1' },
    'sql-schema': { kind: 'sql-schema', tables: [{ name: 'patients', columns: ['id'] }] },
    'sql-mutation': { kind: 'sql-mutation', verify: 'SELECT count(*) FROM patients' },
    'python-output': { kind: 'python-output', cases: [{ expected: 'hi' }] },
    'python-unit': { kind: 'python-unit', assertions: ['assert triage([]) == []'] },
    'api-suite': { kind: 'api-suite', suite_id: 'hospital-crud' },
    'html-structure': {
      kind: 'html-structure',
      expect: [{ selector: 'h1', label: 'Has a heading', text: 'Ward B' }],
    },
    'js-output': { kind: 'js-output', expect_logs: ['Ana'] },
    'dom-behaviour': {
      kind: 'dom-behaviour',
      steps: [{ label: 'Click adds a row', click: '#add', expect_selector: 'li' }],
    },
  }
  for (const kind of GRADER_KINDS) {
    const parsed = GraderConfigSchema.safeParse(camelizeKeys(samples[kind]))
    expect(parsed.success, `grader kind ${kind} failed to parse`).toBe(true)
  }
})

test('rejects an unknown grader kind', () => {
  expect(GraderConfigSchema.safeParse({ kind: 'vibes' }).success).toBe(false)
})

test('a quiz grader with a correct index out of range is rejected', () => {
  const bad = { kind: 'quiz', question: 'q', options: ['a', 'b'], correct: [5] }
  expect(GraderConfigSchema.safeParse(bad).success).toBe(false)
})

test('TrackSchema requires at least one lesson and a matching track id', () => {
  expect(
    TrackSchema.safeParse(camelizeKeys({ track: 'boot', title: 'Boot', lessons: [] })).success,
  ).toBe(false)
  const mismatched = { track: 'boot', title: 'Boot', lessons: [{ ...validLesson, track: 'sql' }] }
  expect(TrackSchema.safeParse(camelizeKeys(mismatched)).success).toBe(false)
})
