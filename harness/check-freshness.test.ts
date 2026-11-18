import { checkFreshness } from './check-freshness'

const TODAY = new Date('2026-11-18T00:00:00Z')

test('flags a volatile beat whose verified_on is older than maxAgeDays', () => {
  const report = checkFreshness('harness/__fixtures__/stale-claim', TODAY, 180)
  expect(report.ok).toBe(false)
  expect(report.stale[0]!.verifiedOn).toBe('2025-01-01')
  expect(report.stale[0]!.lessonId).toBe('9.2')
})

test('passes when every volatile beat was verified within the window', () => {
  const report = checkFreshness('harness/__fixtures__/stale-claim', TODAY, 10_000)
  expect(report.ok).toBe(true)
  expect(report.stale).toEqual([])
})

test('every volatile beat in content has a verified_on date', () => {
  // The schema enforces this, so a failure here means the schema regressed.
  const report = checkFreshness('content', TODAY, 10_000)
  expect(report.missingDate).toEqual([])
})

test('the real content carries no claim older than six months', () => {
  const report = checkFreshness('content', TODAY, 180)
  expect(report.stale).toEqual([])
})

test('the report counts how many volatile claims exist at all', () => {
  const report = checkFreshness('content', TODAY, 180)
  expect(report.volatileCount).toBeGreaterThan(0)
})

test('a verified_on in the future is reported as an error', () => {
  const report = checkFreshness('harness/__fixtures__/stale-claim', new Date('2024-01-01'), 180)
  expect(report.ok).toBe(false)
  expect(report.future.length).toBeGreaterThan(0)
})
