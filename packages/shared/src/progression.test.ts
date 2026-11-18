import {
  levelForXp,
  awardXp,
  touchStreak,
  evaluateBadges,
  recordExerciseResult,
  completeLesson,
  localDay,
  XP,
  BADGES,
} from './progression'
import { freshProfile, type Profile } from './domain'

function profileAt(day: string, overrides: Partial<Profile> = {}): Profile {
  const base = freshProfile(`${day}T12:00:00.000Z`)
  return { ...base, streak: { ...base.streak, lastActiveDay: day }, ...overrides }
}

/** A Date whose *local* calendar day is `day` and local hour is `hour`. */
function localDate(day: string, hour: number): Date {
  const [y, m, d] = day.split('-').map(Number)
  return new Date(y!, m! - 1, d!, hour, 0, 0)
}

// ── levels ────────────────────────────────────────────────────────────────

test('levelForXp boundaries', () => {
  expect(levelForXp(0).level).toBe(1)
  expect(levelForXp(100).level).toBe(2)
  expect(levelForXp(400).level).toBe(3)
})

test('levelForXp does not advance one XP before the boundary', () => {
  expect(levelForXp(99).level).toBe(1)
  expect(levelForXp(399).level).toBe(2)
})

test('levelForXp reports progress within the current level', () => {
  const at = levelForXp(250)
  expect(at.level).toBe(2)
  expect(at.xpIntoLevel).toBe(150)
  expect(at.xpForNext).toBe(300)
})

test('levelForXp treats negative xp as level 1 rather than NaN', () => {
  expect(levelForXp(-10).level).toBe(1)
  expect(levelForXp(-10).xpIntoLevel).toBe(0)
})

test('awardXp raises level when the award crosses a boundary', () => {
  const p = awardXp(profileAt('2026-11-18', { xp: 90 }), 20)
  expect(p.xp).toBe(110)
  expect(p.level).toBe(2)
})

test('awardXp refuses a negative award', () => {
  expect(() => awardXp(profileAt('2026-11-18'), -5)).toThrow()
})

// ── streaks (Review Focus #5) ─────────────────────────────────────────────

test('localDay formats a date by its local calendar day, not UTC', () => {
  expect(localDay(localDate('2026-11-18', 23))).toBe('2026-11-18')
  expect(localDay(localDate('2026-11-18', 0))).toBe('2026-11-18')
})

test('the first visit of a fresh profile starts the streak at 1', () => {
  const p = { ...profileAt('2026-11-18'), streak: { current: 0, longest: 0, lastActiveDay: '2026-11-18', forgivenessTokens: 1 } }
  const after = touchStreak(p, localDate('2026-11-18', 9))
  expect(after.streak.current).toBe(1)
  expect(after.streak.longest).toBe(1)
})

test('two visits on the same local day do not increment the streak', () => {
  let p = touchStreak(profileAt('2026-11-18'), localDate('2026-11-18', 1))
  const first = p.streak.current
  p = touchStreak(p, localDate('2026-11-18', 23))
  expect(p.streak.current).toBe(first)
})

test('a visit on the next local day increments the streak', () => {
  let p = touchStreak(profileAt('2026-11-18'), localDate('2026-11-18', 9))
  p = touchStreak(p, localDate('2026-11-19', 9))
  expect(p.streak.current).toBe(2)
  expect(p.streak.longest).toBe(2)
})

test('a 36-hour gap spends a forgiveness token and keeps the streak', () => {
  let p = touchStreak(profileAt('2026-11-18'), localDate('2026-11-18', 22))
  p = touchStreak(p, localDate('2026-11-19', 22))
  expect(p.streak.current).toBe(2)
  expect(p.streak.forgivenessTokens).toBe(1)

  // Monday 22:00 → Wednesday 10:00 misses Tuesday entirely.
  p = touchStreak(p, localDate('2026-11-21', 10))
  expect(p.streak.current).toBe(3)
  expect(p.streak.forgivenessTokens).toBe(0)
})

test('a gap with no tokens resets current but preserves longest', () => {
  let p = touchStreak(profileAt('2026-11-18'), localDate('2026-11-18', 9))
  p = touchStreak(p, localDate('2026-11-19', 9))
  p = touchStreak(p, localDate('2026-11-20', 9))
  expect(p.streak.current).toBe(3)

  p = { ...p, streak: { ...p.streak, forgivenessTokens: 0 } }
  p = touchStreak(p, localDate('2026-11-25', 9))
  expect(p.streak.current).toBe(1)
  expect(p.streak.longest).toBe(3)
})

test('a token covers only one missed day, never a week', () => {
  let p = touchStreak(profileAt('2026-11-18'), localDate('2026-11-18', 9))
  p = touchStreak(p, localDate('2026-11-26', 9))
  expect(p.streak.current).toBe(1)
  expect(p.streak.forgivenessTokens).toBe(1)
})

test('a clock set backwards does not reduce current or longest', () => {
  let p = touchStreak(profileAt('2026-11-18'), localDate('2026-11-18', 9))
  p = touchStreak(p, localDate('2026-11-19', 9))
  const before = p.streak
  p = touchStreak(p, localDate('2026-11-17', 9))
  expect(p.streak.current).toBe(before.current)
  expect(p.streak.longest).toBe(before.longest)
  expect(p.streak.lastActiveDay).toBe('2026-11-19')
})

test('crossing a timezone boundary does not double-count a day', () => {
  // Same local calendar day, 23 hours apart: one day of credit, not two.
  let p = touchStreak(profileAt('2026-11-18'), localDate('2026-11-18', 0))
  p = touchStreak(p, localDate('2026-11-18', 23))
  expect(p.streak.current).toBe(1)
})

test('a forgiveness token is granted again after seven clean days', () => {
  let p = touchStreak(profileAt('2026-11-18'), localDate('2026-11-18', 9))
  p = { ...p, streak: { ...p.streak, forgivenessTokens: 0 } }
  for (let d = 19; d <= 25; d += 1) {
    p = touchStreak(p, localDate(`2026-11-${d}`, 9))
  }
  expect(p.streak.current).toBe(8)
  expect(p.streak.forgivenessTokens).toBe(1)
})

// ── badges ────────────────────────────────────────────────────────────────

test('evaluateBadges awards first-blood after the first exercise pass', () => {
  const p = recordExerciseResult(profileAt('2026-11-18'), 'boot-first-line', {
    passed: true,
    checks: [],
    xpAwarded: XP.exercisePass,
  })
  expect(evaluateBadges(p)).toContain('first-blood')
})

test('a failed exercise does not earn first-blood', () => {
  const p = recordExerciseResult(profileAt('2026-11-18'), 'boot-first-line', {
    passed: false,
    checks: [],
    xpAwarded: 0,
  })
  expect(evaluateBadges(p)).not.toContain('first-blood')
})

test('bug-hunter needs ten duels won', () => {
  expect(evaluateBadges(profileAt('2026-11-18', { duelsWon: 9 }))).not.toContain('bug-hunter')
  expect(evaluateBadges(profileAt('2026-11-18', { duelsWon: 10 }))).toContain('bug-hunter')
})

test('schema-architect is earned by finishing the normalisation lesson', () => {
  const p = profileAt('2026-11-18', { completedLessons: ['2.6'] })
  expect(evaluateBadges(p)).toContain('schema-architect')
})

test('every badge in BADGES has an id, title and description', () => {
  for (const badge of BADGES) {
    expect(badge.id).toMatch(/^[a-z-]+$/)
    expect(badge.title.length).toBeGreaterThan(0)
    expect(badge.description.length).toBeGreaterThan(0)
  }
})

test('badge ids are unique', () => {
  const ids = BADGES.map((b) => b.id)
  expect(new Set(ids).size).toBe(ids.length)
})

// ── recording progress ────────────────────────────────────────────────────

test('recordExerciseResult awards XP once, not on every re-run', () => {
  let p = profileAt('2026-11-18')
  const result = { passed: true, checks: [], xpAwarded: XP.exercisePass }
  p = recordExerciseResult(p, 'ex-1', result)
  const afterFirst = p.xp
  p = recordExerciseResult(p, 'ex-1', result)
  expect(p.xp).toBe(afterFirst)
})

test('re-running a passed exercise does not downgrade it to failed', () => {
  let p = recordExerciseResult(profileAt('2026-11-18'), 'ex-1', {
    passed: true,
    checks: [],
    xpAwarded: XP.exercisePass,
  })
  p = recordExerciseResult(p, 'ex-1', { passed: false, checks: [], xpAwarded: 0 })
  expect(p.exerciseResults['ex-1']!.passed).toBe(true)
})

test('completeLesson records the lesson once and awards lesson XP', () => {
  let p = completeLesson(profileAt('2026-11-18'), '0.1')
  expect(p.completedLessons).toEqual(['0.1'])
  expect(p.xp).toBe(XP.lessonComplete)
  p = completeLesson(p, '0.1')
  expect(p.completedLessons).toEqual(['0.1'])
  expect(p.xp).toBe(XP.lessonComplete)
})

test('completeLesson adds newly earned badges to the profile', () => {
  const p = completeLesson(profileAt('2026-11-18'), '2.6')
  expect(p.badges).toContain('schema-architect')
})
