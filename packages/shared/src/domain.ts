import { z } from 'zod'

/**
 * Domain types are defined as Zod schemas and the TypeScript types are derived
 * from them. The alternative — a hand-written interface plus a separate
 * validator — gives two things that drift. The profile is read back from disk
 * after arbitrary crashes and hand edits, so it must be validated at runtime;
 * deriving the type from the validator is what keeps the two honest.
 */

export const TRACK_IDS = ['boot', 'fundamentals', 'sql', 'api', 'agents', 'career'] as const
export const TrackIdSchema = z.enum(TRACK_IDS)
export type TrackId = z.infer<typeof TrackIdSchema>

/** Human-facing track names and the order they are presented in. */
export const TRACK_META: Record<TrackId, { index: number; name: string; blurb: string }> = {
  boot: {
    index: 0,
    name: 'Boot',
    blurb: 'Make the computer do something. Thirty minutes, no setup.',
  },
  fundamentals: {
    index: 1,
    name: 'Fundamentals',
    blurb: 'The seven things every program does.',
  },
  sql: {
    index: 2,
    name: 'SQL',
    blurb: 'Build a hospital database that survives being switched off.',
  },
  api: {
    index: 3,
    name: 'REST APIs',
    blurb: 'Put your database on the internet, safely.',
  },
  agents: {
    index: 4,
    name: 'AI Agents',
    blurb: 'Direct an agent, then verify what it wrote.',
  },
  career: {
    index: 5,
    name: 'Career',
    blurb: 'The tool atlas, your portfolio, and the next ninety days.',
  },
}

export const LessonRefSchema = z.object({
  id: z.string().min(1),
  track: TrackIdSchema,
  title: z.string().min(1),
  estimateMinutes: z.number().int().positive(),
})
export type LessonRef = z.infer<typeof LessonRefSchema>

/** One graded criterion inside an exercise. Exercises report a list of these. */
export const CheckResultSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  passed: z.boolean(),
  detail: z.string().optional(),
})
export type CheckResult = z.infer<typeof CheckResultSchema>

export const ExerciseResultSchema = z.object({
  passed: z.boolean(),
  checks: z.array(CheckResultSchema),
  xpAwarded: z.number().int().nonnegative(),
  /** Set when grading could not run at all, e.g. the sidecar is down. */
  unavailableReason: z.string().optional(),
})
export type ExerciseResult = z.infer<typeof ExerciseResultSchema>

/** A local calendar day, `YYYY-MM-DD`. Streaks compare these, never timestamps. */
export const LocalDaySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'expected YYYY-MM-DD')

export const StreakStateSchema = z.object({
  current: z.number().int().nonnegative(),
  longest: z.number().int().nonnegative(),
  lastActiveDay: LocalDaySchema,
  /**
   * Spent to survive a single missed day. Punitive streaks make people quit,
   * which is the one outcome this app cannot afford.
   */
  forgivenessTokens: z.number().int().nonnegative(),
})
export type StreakState = z.infer<typeof StreakStateSchema>

export const ProfileSchema = z.object({
  id: z.string().min(1),
  displayName: z.string(),
  xp: z.number().int().nonnegative(),
  level: z.number().int().positive(),
  streak: StreakStateSchema,
  completedLessons: z.array(z.string()),
  badges: z.array(z.string()),
  exerciseResults: z.record(z.string(), ExerciseResultSchema),
  duelsWon: z.number().int().nonnegative(),
  createdAt: z.string(),
  updatedAt: z.string(),
})
export type Profile = z.infer<typeof ProfileSchema>

/** A profile with nothing achieved yet. `now` is an ISO timestamp. */
export function freshProfile(now: string): Profile {
  return {
    id: 'local',
    displayName: '',
    xp: 0,
    level: 1,
    streak: {
      current: 0,
      longest: 0,
      lastActiveDay: now.slice(0, 10),
      forgivenessTokens: 1,
    },
    completedLessons: [],
    badges: [],
    exerciseResults: {},
    duelsWon: 0,
    createdAt: now,
    updatedAt: now,
  }
}

export const SIDECAR_STATES = ['stopped', 'provisioning', 'starting', 'ready', 'failed'] as const
export const SidecarStateSchema = z.enum(SIDECAR_STATES)
export type SidecarState = z.infer<typeof SidecarStateSchema>

export const SidecarStatusSchema = z.object({
  state: SidecarStateSchema,
  port: z.number().int().positive().optional(),
  /** Always written for a human, never a stack trace. */
  message: z.string().optional(),
  /** Provisioning progress, 0-1, while state is 'provisioning'. */
  progress: z.number().min(0).max(1).optional(),
})
export type SidecarStatus = z.infer<typeof SidecarStatusSchema>

export const RunResultSchema = z.object({
  ok: z.boolean(),
  stdout: z.string(),
  stderr: z.string(),
  exitCode: z.number().int().nullable(),
  durationMs: z.number().nonnegative(),
  truncated: z.boolean(),
  killedReason: z.enum(['timeout', 'memory', 'output']).optional(),
})
export type RunResult = z.infer<typeof RunResultSchema>

export const MentorRequestSchema = z.object({
  question: z.string(),
  lessonId: z.string().optional(),
  exerciseId: z.string().optional(),
  /** 1 asks a question back, 2 names the concept, 3 shows a worked analogue. */
  tier: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  learnerCode: z.string().optional(),
  authoredHints: z.array(z.string()).optional(),
})
export type MentorRequest = z.infer<typeof MentorRequestSchema>

export const MentorReplySchema = z.object({
  answer: z.string(),
  tier: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  provider: z.string(),
  usedFallback: z.boolean(),
})
export type MentorReply = z.infer<typeof MentorReplySchema>
