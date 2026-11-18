import { checkTone, FORBIDDEN_PHRASES } from './tone-rules'
import { lintContent } from './lint-content'

test('checkTone flags forbidden praise', () => {
  expect(checkTone('Great job, superstar!')).toEqual(['Great job', 'superstar'])
})

test('checkTone is case-insensitive', () => {
  expect(checkTone('GREAT JOB')).toEqual(['Great job'])
})

test('checkTone passes adult, direct copy', () => {
  expect(checkTone('That works. Now make it handle an empty list.')).toEqual([])
})

test('checkTone does not flag a forbidden word inside a larger word', () => {
  expect(checkTone('The buddybot library is unrelated.')).toEqual([])
})

test('every forbidden phrase is detected by checkTone', () => {
  for (const phrase of FORBIDDEN_PHRASES) {
    expect(checkTone(`prefix ${phrase} suffix`), `${phrase} not detected`).toContain(phrase)
  }
})

test('lintContent reports the real boot track as ok', () => {
  const report = lintContent('content')
  expect(report.errors).toEqual([])
  expect(report.ok).toBe(true)
  expect(report.lessonCount).toBeGreaterThan(0)
})

test('lintContent reports a parse error for malformed yaml', () => {
  const report = lintContent('harness/__fixtures__/broken-yaml')
  expect(report.ok).toBe(false)
  expect(report.errors[0]!.message).toMatch(/yaml|parse/i)
})

test('lintContent reports a schema error with the lesson id and field path', () => {
  const report = lintContent('harness/__fixtures__/bad-schema')
  expect(report.ok).toBe(false)
  expect(report.errors.some((e) => /hints/.test(e.message))).toBe(true)
})

test('lintContent reports duplicate lesson ids across tracks', () => {
  const report = lintContent('harness/__fixtures__/duplicate-ids')
  expect(report.ok).toBe(false)
  expect(report.errors.some((e) => /duplicate/i.test(e.message))).toBe(true)
})

test('lintContent reports tone violations with the offending phrase', () => {
  const report = lintContent('harness/__fixtures__/bad-tone')
  expect(report.ok).toBe(false)
  expect(report.errors.some((e) => /Great job/.test(e.message))).toBe(true)
})

test('lintContent reports an empty content directory as an error, not a pass', () => {
  const report = lintContent('harness/__fixtures__/empty')
  expect(report.ok).toBe(false)
})
