import { z } from 'zod'
import { TrackIdSchema } from './domain'

/**
 * The curriculum is data, not code: 45 lessons live in YAML so the course can
 * grow without touching the app. That trade only holds if broken content
 * cannot reach a learner, which is what this schema and the harness built on
 * it are for. Every object is `.strict()` — a mistyped key is a silent missing
 * feature otherwise, and the learner is the one who finds it.
 *
 * YAML is authored in snake_case because that is what reads naturally by hand.
 * `camelizeKeys` converts once at the boundary so the rest of the TypeScript
 * stays idiomatic; there is exactly one spelling on each side of that line.
 */

type Json = unknown

/** Recursively convert snake_case object keys to camelCase. Values untouched. */
export function camelizeKeys(value: Json): Json {
  if (Array.isArray(value)) return value.map(camelizeKeys)
  if (value === null || typeof value !== 'object') return value
  const out: Record<string, Json> = {}
  for (const [key, v] of Object.entries(value as Record<string, Json>)) {
    const camel = key.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase())
    out[camel] = camelizeKeys(v)
  }
  return out
}

const CalendarDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'expected a calendar date, YYYY-MM-DD')

export const GRADER_KINDS = [
  'quiz',
  'output-match',
  'regex-contains',
  'sql-result',
  'sql-schema',
  'sql-mutation',
  'python-output',
  'python-unit',
  'api-suite',
] as const
export type GraderKind = (typeof GRADER_KINDS)[number]

/** One stdin/stdout pair. Several cases per exercise stop a hardcoded answer passing. */
const IoCaseSchema = z
  .object({
    label: z.string().optional(),
    stdin: z.string().optional(),
    args: z.array(z.string()).optional(),
    expected: z.string(),
  })
  .strict()

const QuizGraderSchema = z
  .object({
    kind: z.literal('quiz'),
    question: z.string().min(1),
    options: z.array(z.string().min(1)).min(2),
    /** Indices into `options`. More than one means it is a multi-select. */
    correct: z.array(z.number().int().nonnegative()).min(1),
    explanation: z.string().optional(),
  })
  .strict()
  .superRefine((g, ctx) => {
    for (const i of g.correct) {
      if (i >= g.options.length) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['correct'],
          message: `correct index ${i} is out of range for ${g.options.length} options`,
        })
      }
    }
  })

const OutputMatchGraderSchema = z
  .object({
    kind: z.literal('output-match'),
    cases: z.array(IoCaseSchema).min(1),
    /** Compare after trimming each line's trailing whitespace. Defaults true. */
    trimTrailing: z.boolean().optional(),
    caseSensitive: z.boolean().optional(),
  })
  .strict()

const RegexContainsGraderSchema = z
  .object({
    kind: z.literal('regex-contains'),
    patterns: z.array(z.string().min(1)).min(1),
    /** Patterns that must NOT appear — e.g. forbidding a hardcoded literal. */
    forbidden: z.array(z.string().min(1)).optional(),
    message: z.string().optional(),
  })
  .strict()

const SqlResultGraderSchema = z
  .object({
    kind: z.literal('sql-result'),
    /** The reference query. The learner's result set must equal this one's. */
    reference: z.string().min(1),
    /** When true, row order must match. Defaults false. */
    orderSensitive: z.boolean().optional(),
    /**
     * Fixtures to evaluate against. Defaults to the primary plus the perturbed
     * variant, which is what stops a learner hardcoding the expected rows.
     */
    fixtures: z.array(z.string().min(1)).optional(),
  })
  .strict()

const SqlSchemaGraderSchema = z
  .object({
    kind: z.literal('sql-schema'),
    tables: z
      .array(
        z
          .object({
            name: z.string().min(1),
            columns: z.array(z.string().min(1)).min(1),
            primaryKey: z.array(z.string()).optional(),
            foreignKeys: z
              .array(
                z
                  .object({ column: z.string(), references: z.string() })
                  .strict(),
              )
              .optional(),
            notNull: z.array(z.string()).optional(),
            unique: z.array(z.string()).optional(),
          })
          .strict(),
      )
      .min(1),
  })
  .strict()

const SqlMutationGraderSchema = z
  .object({
    kind: z.literal('sql-mutation'),
    /** Runs before the learner's statement. */
    setup: z.string().optional(),
    /** Run after the learner's statement; its result set is what is graded. */
    verify: z.string().min(1),
    expectedRows: z.array(z.array(z.union([z.string(), z.number(), z.null()]))).optional(),
    /** Statements the learner's submission must not contain, e.g. `DROP`. */
    forbidden: z.array(z.string()).optional(),
  })
  .strict()

const PythonOutputGraderSchema = z
  .object({
    kind: z.literal('python-output'),
    cases: z.array(IoCaseSchema).min(1),
    trimTrailing: z.boolean().optional(),
  })
  .strict()

const PythonUnitGraderSchema = z
  .object({
    kind: z.literal('python-unit'),
    /** Each is run against the learner's module; the message is shown on failure. */
    assertions: z.array(z.string().min(1)).min(1),
    preamble: z.string().optional(),
  })
  .strict()

const ApiSuiteGraderSchema = z
  .object({
    kind: z.literal('api-suite'),
    suiteId: z.string().min(1),
    /** Shown to the learner before grading so they know what will be checked. */
    criteria: z.array(z.string()).optional(),
  })
  .strict()

export const GraderConfigSchema = z.discriminatedUnion('kind', [
  // `superRefine` on the quiz schema makes it a ZodEffects, which a
  // discriminated union cannot hold, so the quiz branch is the plain object
  // and its range check runs in ExerciseSchema's refinement instead.
  QuizGraderSchema.innerType(),
  OutputMatchGraderSchema,
  RegexContainsGraderSchema,
  SqlResultGraderSchema,
  SqlSchemaGraderSchema,
  SqlMutationGraderSchema,
  PythonOutputGraderSchema,
  PythonUnitGraderSchema,
  ApiSuiteGraderSchema,
]).superRefine((g, ctx) => {
  if (g.kind === 'quiz') {
    for (const i of g.correct) {
      if (i >= g.options.length) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['correct'],
          message: `correct index ${i} is out of range for ${g.options.length} options`,
        })
      }
    }
  }
})

export type GraderConfig = z.infer<typeof GraderConfigSchema>

/**
 * Exactly three hints, always. Fewer and the mentor has nothing to escalate
 * through; more and the tiers stop meaning anything. Tier 1 asks a question,
 * tier 2 names the concept, tier 3 shows a worked analogue — never the
 * learner's own answer.
 */
export const ExerciseSchema = z
  .object({
    id: z.string().min(1),
    prompt: z.string().min(1),
    starter: z.string().optional(),
    solution: z.string().min(1),
    hints: z.array(z.string().min(1)).length(3),
    grader: GraderConfigSchema,
    xp: z.number().int().positive().optional(),
  })
  .strict()
export type Exercise = z.infer<typeof ExerciseSchema>

const BeatBase = {
  /** Marks a claim that goes stale — free tiers, model names, tool names. */
  volatile: z.boolean().optional(),
  verifiedOn: CalendarDate.optional(),
  note: z.string().optional(),
}

const ProseBeatSchema = z.object({ kind: z.literal('prose'), body: z.string().min(1), ...BeatBase }).strict()

const VisualBeatSchema = z
  .object({
    kind: z.literal('visual'),
    /** Must resolve in the renderer's visualizer registry; the harness proves it does. */
    visualizer: z.string().min(1),
    caption: z.string().optional(),
    config: z.record(z.string(), z.unknown()).optional(),
    ...BeatBase,
  })
  .strict()

const CodeBeatSchema = z
  .object({
    kind: z.literal('code'),
    language: z.enum(['python', 'javascript']),
    intro: z.string().optional(),
    exercise: ExerciseSchema,
    ...BeatBase,
  })
  .strict()

const SqlBeatSchema = z
  .object({
    kind: z.literal('sql'),
    intro: z.string().optional(),
    fixture: z.string().optional(),
    exercise: ExerciseSchema,
    ...BeatBase,
  })
  .strict()

const QuizBeatSchema = z.object({ kind: z.literal('quiz'), exercise: ExerciseSchema, ...BeatBase }).strict()

const DuelBeatSchema = z
  .object({ kind: z.literal('duel'), duelId: z.string().min(1), intro: z.string().optional(), ...BeatBase })
  .strict()

/** A pause that states what was just learned and why it matters next. */
const CheckpointBeatSchema = z
  .object({
    kind: z.literal('checkpoint'),
    body: z.string().min(1),
    unlocks: z.string().optional(),
    ...BeatBase,
  })
  .strict()

/**
 * A list of things the learner verifies themselves.
 *
 * Track 4 has the learner drive a real external agent in a real IDE, which
 * this app cannot observe and must not pretend to grade. A checklist is the
 * honest instrument: the learner confirms each gate, and the app takes their
 * word for it rather than inventing a verdict it has no basis for.
 */
const ChecklistBeatSchema = z
  .object({
    kind: z.literal('checklist'),
    intro: z.string().optional(),
    items: z
      .array(
        z
          .object({
            id: z.string().min(1),
            text: z.string().min(1),
            why: z.string().optional(),
          })
          .strict(),
      )
      .min(1),
    ...BeatBase,
  })
  .strict()

export const BeatSchema = z
  .discriminatedUnion('kind', [
    ProseBeatSchema,
    VisualBeatSchema,
    CodeBeatSchema,
    SqlBeatSchema,
    QuizBeatSchema,
    DuelBeatSchema,
    CheckpointBeatSchema,
    ChecklistBeatSchema,
  ])
  .superRefine((beat, ctx) => {
    if (beat.volatile === true && !beat.verifiedOn) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['verifiedOn'],
        message: 'a volatile beat must carry verified_on so the harness can age it out',
      })
    }
  })
export type Beat = z.infer<typeof BeatSchema>

export const LessonSchema = z
  .object({
    id: z.string().min(1),
    track: TrackIdSchema,
    title: z.string().min(1),
    estimateMinutes: z.number().int().positive(),
    /** What the learner can do afterwards, in their words not ours. */
    objectives: z.array(z.string().min(1)).optional(),
    beats: z.array(BeatSchema).min(1),
    xp: z.number().int().positive().optional(),
  })
  .strict()
export type Lesson = z.infer<typeof LessonSchema>

export const TrackSchema = z
  .object({
    track: TrackIdSchema,
    title: z.string().min(1),
    blurb: z.string().optional(),
    lessons: z.array(LessonSchema).min(1),
  })
  .strict()
  .superRefine((track, ctx) => {
    track.lessons.forEach((lesson, i) => {
      if (lesson.track !== track.track) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['lessons', i, 'track'],
          message: `lesson ${lesson.id} declares track "${lesson.track}" inside track "${track.track}"`,
        })
      }
    })
  })
export type Track = z.infer<typeof TrackSchema>

/** A boss project: several real graded criteria, so its progress bar cannot lie. */
export const BossSchema = z
  .object({
    id: z.string().min(1),
    track: TrackIdSchema,
    title: z.string().min(1),
    brief: z.string().min(1),
    estimateMinutes: z.number().int().positive(),
    criteria: z
      .array(
        z
          .object({
            id: z.string().min(1),
            label: z.string().min(1),
            exercise: ExerciseSchema,
          })
          .strict(),
      )
      .min(1),
    xp: z.number().int().positive().optional(),
  })
  .strict()
export type Boss = z.infer<typeof BossSchema>

export const DUEL_BUG_KINDS = [
  'off-by-one',
  'wrong-join-type',
  'missing-where',
  'mutable-default-arg',
  'unhandled-none',
  'wrong-status-code',
  'missing-await',
  'identity-vs-equality',
  'inverted-condition',
  'shadowed-variable',
] as const

/**
 * An Agent Duel: code that looks right and is not. The bug classes above are
 * the ones agents actually produce, which is the whole point — this is target
 * practice for the mistake the learner will have to catch in real work.
 */
export const DuelSchema = z
  .object({
    id: z.string().min(1),
    lessonId: z.string().min(1),
    language: z.enum(['python', 'javascript', 'sql']),
    brief: z.string().min(1),
    code: z.string().min(1),
    /** 1-indexed line within `code`. */
    bugLine: z.number().int().positive(),
    bugKind: z.enum(DUEL_BUG_KINDS),
    explanation: z.string().min(1),
    fixedCode: z.string().min(1),
    seconds: z.number().int().positive().optional(),
  })
  .strict()
export type Duel = z.infer<typeof DuelSchema>

export const AtlasToolSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    category: z.enum([
      'languages',
      'databases',
      'backend',
      'frontend',
      'ai-agents',
      'cloud-deploy',
      'devops',
    ]),
    verdict: z.enum(['learn-now', 'later', 'skip']),
    why: z.string().min(1),
    trackId: TrackIdSchema.optional(),
    lessonId: z.string().optional(),
    verifiedOn: CalendarDate,
  })
  .strict()
export type AtlasTool = z.infer<typeof AtlasToolSchema>

export const AtlasSchema = z.object({ tools: z.array(AtlasToolSchema).min(1) }).strict()

/** Collect every learner-facing string in a lesson, for the tone linter. */
export function lessonProse(lesson: Lesson): string[] {
  const out: string[] = [lesson.title, ...(lesson.objectives ?? [])]
  for (const beat of lesson.beats) {
    if ('body' in beat && beat.body) out.push(beat.body)
    if ('intro' in beat && beat.intro) out.push(beat.intro)
    if ('caption' in beat && beat.caption) out.push(beat.caption)
    if ('exercise' in beat && beat.exercise) {
      out.push(beat.exercise.prompt, ...beat.exercise.hints)
      if (beat.exercise.grader.kind === 'quiz') {
        out.push(beat.exercise.grader.question, ...beat.exercise.grader.options)
      }
    }
  }
  return out
}
