import type { ExerciseResult, Profile } from './domain'

/**
 * Progression: XP, levels, streaks and badges.
 *
 * Everything here is a pure function over a Profile. No I/O, no clock of its
 * own — `now` is always passed in — which is what makes the day-boundary and
 * clock-skew behaviour testable at all.
 */

export const XP = {
  lessonComplete: 50,
  exercisePass: 25,
  duelWin: 40,
  bossClear: 250,
} as const

/** XP at which `level` begins. Quadratic, so later levels take real work. */
function xpAtLevelStart(level: number): number {
  return (level - 1) ** 2 * 100
}

export interface LevelInfo {
  level: number
  xpIntoLevel: number
  /** Total XP spanned by this level — the denominator for a progress bar. */
  xpForNext: number
}

export function levelForXp(xp: number): LevelInfo {
  const safe = Math.max(0, Math.floor(xp))
  const level = Math.floor(Math.sqrt(safe / 100)) + 1
  const start = xpAtLevelStart(level)
  return {
    level,
    xpIntoLevel: safe - start,
    xpForNext: xpAtLevelStart(level + 1) - start,
  }
}

export function awardXp(profile: Profile, amount: number): Profile {
  if (amount < 0) throw new Error(`refusing to award negative XP (${amount})`)
  const xp = profile.xp + Math.floor(amount)
  return { ...profile, xp, level: levelForXp(xp).level }
}

// ── streaks ───────────────────────────────────────────────────────────────

/**
 * The learner's *local* calendar day.
 *
 * Streaks compare these strings and never subtract timestamps. A learner who
 * flies from Kathmandu to London has not skipped a day, and one who studies at
 * 00:30 and again at 23:30 has not done two — both of which epoch arithmetic
 * gets wrong in a way that silently destroys a streak somebody cared about.
 */
export function localDay(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** Whole days from `from` to `to`, both local day keys. Negative if `to` is earlier. */
function daysBetween(from: string, to: string): number {
  const [fy, fm, fd] = from.split('-').map(Number)
  const [ty, tm, td] = to.split('-').map(Number)
  // UTC midnights of two local day keys: the difference is exact whole days,
  // immune to the DST shifts that break naive local-time subtraction.
  const a = Date.UTC(fy!, fm! - 1, fd!)
  const b = Date.UTC(ty!, tm! - 1, td!)
  return Math.round((b - a) / 86_400_000)
}

/** Clean days required to earn another forgiveness token. */
const TOKEN_REGRANT_DAYS = 7
const MAX_FORGIVENESS_TOKENS = 1

/**
 * Registers activity at `now` and returns the updated profile.
 *
 * The forgiveness token is deliberate design, not leniency for its own sake: a
 * streak that punishes one missed day is a streak people abandon, and an
 * abandoned streak stops motivating anyone. One token covers exactly one
 * missed day and is re-granted after a clean week.
 */
export function touchStreak(profile: Profile, now: Date): Profile {
  const today = localDay(now)
  const { lastActiveDay, current, longest, forgivenessTokens } = profile.streak
  const gap = daysBetween(lastActiveDay, today)

  // Clock moved backwards (timezone change, manual set, NTP correction). Credit
  // cannot be withdrawn for time that already counted.
  if (gap < 0) return profile

  if (gap === 0) {
    // Same local day. A fresh profile has current 0 and must still get credit
    // for showing up today.
    if (current > 0) return profile
    return {
      ...profile,
      streak: { ...profile.streak, current: 1, longest: Math.max(longest, 1) },
    }
  }

  const continues = gap === 1
  const forgiven = gap === 2 && forgivenessTokens > 0

  if (continues || forgiven) {
    const nextCurrent = current + 1
    const tokensAfterSpend = forgiven ? forgivenessTokens - 1 : forgivenessTokens
    // Earned by a CLEAN week — `forgiven` is excluded, so a token cannot be
    // handed back in the same step it was spent, which is what happened when
    // the streak length alone decided it.
    const earnedToken =
      !forgiven &&
      tokensAfterSpend < MAX_FORGIVENESS_TOKENS &&
      nextCurrent % TOKEN_REGRANT_DAYS === 1 &&
      nextCurrent > 1
    return {
      ...profile,
      streak: {
        current: nextCurrent,
        longest: Math.max(longest, nextCurrent),
        lastActiveDay: today,
        forgivenessTokens: earnedToken ? tokensAfterSpend + 1 : tokensAfterSpend,
      },
    }
  }

  // The streak is broken. Today still counts as day one, and `longest` is the
  // record of what they did achieve — it is never taken away.
  return {
    ...profile,
    streak: {
      current: 1,
      longest: Math.max(longest, current),
      lastActiveDay: today,
      forgivenessTokens,
    },
  }
}

// ── badges ────────────────────────────────────────────────────────────────

export interface BadgeDefinition {
  id: string
  title: string
  description: string
  earned(profile: Profile): boolean
}

function passedCount(profile: Profile): number {
  return Object.values(profile.exerciseResults).filter((r) => r.passed).length
}

function hasLesson(profile: Profile, id: string): boolean {
  return profile.completedLessons.includes(id)
}

/**
 * Badges mark moments that actually meant something, not participation. Each
 * one names a capability the learner did not have an hour earlier.
 */
export const BADGES: readonly BadgeDefinition[] = [
  {
    id: 'first-blood',
    title: 'First Blood',
    description: 'You made a program do what you wanted.',
    earned: (p) => passedCount(p) >= 1,
  },
  {
    id: 'error-reader',
    title: 'Error Reader',
    description: 'You fixed a program someone else broke.',
    earned: (p) => hasLesson(p, '0.3'),
  },
  {
    id: 'bug-hunter',
    title: 'Bug Hunter',
    description: 'Ten duels won. You can spot a confident lie in code.',
    earned: (p) => p.duelsWon >= 10,
  },
  {
    id: 'table-thinker',
    title: 'Table Thinker',
    description: 'You saw that a table is just a list of records.',
    earned: (p) => hasLesson(p, '1.5'),
  },
  {
    id: 'schema-architect',
    title: 'Schema Architect',
    description: 'You normalised a database that a hospital could actually use.',
    earned: (p) => hasLesson(p, '2.6'),
  },
  {
    id: 'join-master',
    title: 'Join Master',
    description: 'You connected two tables and got the rows you meant to.',
    earned: (p) => hasLesson(p, '2.7'),
  },
  {
    id: 'crud-complete',
    title: 'CRUD Complete',
    description: 'Create, read, update, delete — over HTTP, all four.',
    earned: (p) => hasLesson(p, '3.7'),
  },
  {
    id: 'verifier',
    title: 'Verifier',
    description: 'You wrote the tests that prove an agent told the truth.',
    earned: (p) => hasLesson(p, '3.10'),
  },
  {
    id: 'conductor',
    title: 'Conductor',
    description: 'You directed an agent to build something real, and checked its work.',
    earned: (p) => hasLesson(p, '4.7'),
  },
  {
    id: 'week-one',
    title: 'Seven Days',
    description: 'A full week without missing a day.',
    earned: (p) => p.streak.longest >= 7,
  },
] as const

/** Every badge the profile currently qualifies for. */
export function evaluateBadges(profile: Profile): string[] {
  return BADGES.filter((b) => b.earned(profile)).map((b) => b.id)
}

function withEarnedBadges(profile: Profile): Profile {
  const earned = evaluateBadges(profile)
  const merged = [...new Set([...profile.badges, ...earned])]
  return merged.length === profile.badges.length ? profile : { ...profile, badges: merged }
}

// ── recording progress ────────────────────────────────────────────────────

/**
 * Stores a graded result.
 *
 * XP is awarded only the first time an exercise passes, and a pass is never
 * downgraded by a later failed attempt: the learner is encouraged to keep
 * playing with working code, and nothing they already earned can evaporate
 * because they experimented afterwards.
 */
export function recordExerciseResult(
  profile: Profile,
  exerciseId: string,
  result: ExerciseResult,
): Profile {
  const previous = profile.exerciseResults[exerciseId]
  const alreadyPassed = previous?.passed === true

  const stored: ExerciseResult = alreadyPassed
    ? { ...result, passed: true, xpAwarded: previous.xpAwarded }
    : result

  let next: Profile = {
    ...profile,
    exerciseResults: { ...profile.exerciseResults, [exerciseId]: stored },
  }

  if (result.passed && !alreadyPassed) {
    next = awardXp(next, result.xpAwarded)
  }

  return withEarnedBadges(next)
}

/** Marks a lesson finished, once, and awards lesson XP the first time. */
export function completeLesson(profile: Profile, lessonId: string): Profile {
  if (profile.completedLessons.includes(lessonId)) return profile
  const next = awardXp(
    { ...profile, completedLessons: [...profile.completedLessons, lessonId] },
    XP.lessonComplete,
  )
  return withEarnedBadges(next)
}

/**
 * Marks a duel won and awards the XP the duel actually earned.
 *
 * `xp` is passed in rather than taken from `XP.duelWin` because the arena
 * computes it from how cleanly the duel was won, and a constant here meant the
 * learner was shown "+50 XP" and granted 40. The spec's position is that the
 * progress bar cannot lie.
 *
 * `duelId` makes a win idempotent. Without it, the settled view — which has
 * just highlighted the buggy line — plus "Try this one again" was ten clicks
 * for a badge and 400 XP.
 */
export function recordDuelWin(profile: Profile, xp: number = XP.duelWin, duelId?: string): Profile {
  if (duelId && profile.duelsWonIds.includes(duelId)) return profile

  const next: Profile = {
    ...profile,
    duelsWon: profile.duelsWon + 1,
    duelsWonIds: duelId ? [...profile.duelsWonIds, duelId] : profile.duelsWonIds,
  }
  return withEarnedBadges(awardXp(next, xp))
}

// ── boss projects ─────────────────────────────────────────────────────────

export interface BossProgress {
  passed: number
  total: number
  complete: boolean
}

/**
 * How far through a boss the learner is.
 *
 * Each criterion is a real graded exercise, so the progress bar built on this
 * cannot overstate anything — which is the point. A bar that moves for effort
 * rather than for passing checks is a bar the learner learns to distrust.
 */
export function bossProgress(profile: Profile, exerciseIds: string[]): BossProgress {
  const passed = exerciseIds.filter((id) => profile.exerciseResults[id]?.passed).length
  return {
    passed,
    total: exerciseIds.length,
    complete: exerciseIds.length > 0 && passed === exerciseIds.length,
  }
}

/** Marks a boss project cleared, once, and awards its XP. */
export function completeBoss(profile: Profile, bossId: string): Profile {
  if (profile.completedBosses.includes(bossId)) return profile
  const next = awardXp(
    { ...profile, completedBosses: [...profile.completedBosses, bossId] },
    XP.bossClear,
  )
  return withEarnedBadges(next)
}
