import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { parse as parseYaml } from 'yaml'
import {
  TrackSchema,
  BossSchema,
  DuelSchema,
  AtlasSchema,
  camelizeKeys,
  lessonProse,
  type Track,
  type Boss,
  type Duel,
} from '@conductor/shared/content-schema'
import { checkTone } from './tone-rules'

export interface LintError {
  file: string
  message: string
}

export interface LintReport {
  ok: boolean
  errors: LintError[]
  lessonCount: number
  tracks: Track[]
  bosses: Boss[]
  duels: Duel[]
}

function yamlFilesIn(dir: string): string[] {
  if (!existsSync(dir) || !statSync(dir).isDirectory()) return []
  return readdirSync(dir)
    .filter((f) => f.endsWith('.yaml') || f.endsWith('.yml'))
    .sort()
    .map((f) => join(dir, f))
}

function formatZodIssues(file: string, issues: { path: (string | number)[]; message: string }[]): LintError[] {
  return issues.map((issue) => ({
    file,
    message: `${issue.path.join('.') || '(root)'}: ${issue.message}`,
  }))
}

/**
 * Validates every curriculum file under `dir`. This is the gate that keeps a
 * data-driven course honest: schema conformance, globally unique lesson ids,
 * and tone. An empty directory is a failure rather than a pass — a linter that
 * reports success on nothing is the exact shape of a silently broken build.
 */
export function lintContent(dir: string): LintReport {
  const errors: LintError[] = []
  const tracks: Track[] = []
  const bosses: Boss[] = []
  const duels: Duel[] = []

  const trackFiles = yamlFilesIn(join(dir, 'tracks'))
  const bossFiles = yamlFilesIn(join(dir, 'bosses'))
  const duelFiles = yamlFilesIn(join(dir, 'duels'))
  const atlasFiles = yamlFilesIn(join(dir, 'atlas'))

  if (trackFiles.length === 0) {
    errors.push({ file: dir, message: `no track files found under ${join(dir, 'tracks')}` })
  }

  for (const file of trackFiles) {
    let raw: unknown
    try {
      raw = parseYaml(readFileSync(file, 'utf8'))
    } catch (e) {
      errors.push({ file, message: `yaml parse failed: ${(e as Error).message}` })
      continue
    }
    const parsed = TrackSchema.safeParse(camelizeKeys(raw))
    if (!parsed.success) {
      errors.push(...formatZodIssues(file, parsed.error.issues))
      continue
    }
    tracks.push(parsed.data)
  }

  for (const file of bossFiles) {
    try {
      const parsed = BossSchema.safeParse(camelizeKeys(parseYaml(readFileSync(file, 'utf8'))))
      if (!parsed.success) errors.push(...formatZodIssues(file, parsed.error.issues))
      else bosses.push(parsed.data)
    } catch (e) {
      errors.push({ file, message: `yaml parse failed: ${(e as Error).message}` })
    }
  }

  for (const file of duelFiles) {
    try {
      const raw = camelizeKeys(parseYaml(readFileSync(file, 'utf8'))) as { duels?: unknown[] }
      const list = Array.isArray(raw?.duels) ? raw.duels : [raw]
      for (const entry of list) {
        const parsed = DuelSchema.safeParse(entry)
        if (!parsed.success) errors.push(...formatZodIssues(file, parsed.error.issues))
        else duels.push(parsed.data)
      }
    } catch (e) {
      errors.push({ file, message: `yaml parse failed: ${(e as Error).message}` })
    }
  }

  for (const file of atlasFiles) {
    try {
      const parsed = AtlasSchema.safeParse(camelizeKeys(parseYaml(readFileSync(file, 'utf8'))))
      if (!parsed.success) errors.push(...formatZodIssues(file, parsed.error.issues))
    } catch (e) {
      errors.push({ file, message: `yaml parse failed: ${(e as Error).message}` })
    }
  }

  // Lesson ids address progress on disk and deep links between tracks, so a
  // collision silently merges two lessons' completion state.
  const seen = new Map<string, string>()
  let lessonCount = 0
  for (const track of tracks) {
    for (const lesson of track.lessons) {
      lessonCount += 1
      const previous = seen.get(lesson.id)
      if (previous) {
        errors.push({
          file: previous,
          message: `duplicate lesson id "${lesson.id}" (also in track ${track.track})`,
        })
      } else {
        seen.set(lesson.id, track.track)
      }
      for (const text of lessonProse(lesson)) {
        for (const phrase of checkTone(text)) {
          errors.push({
            file: `${track.track}/${lesson.id}`,
            message: `forbidden phrase "${phrase}" in learner-facing copy`,
          })
        }
      }
    }
  }

  // Exercise ids key graded results in the profile; the same collision risk.
  const exerciseIds = new Set<string>()
  for (const track of tracks) {
    for (const lesson of track.lessons) {
      for (const beat of lesson.beats) {
        if ('exercise' in beat && beat.exercise) {
          if (exerciseIds.has(beat.exercise.id)) {
            errors.push({
              file: `${track.track}/${lesson.id}`,
              message: `duplicate exercise id "${beat.exercise.id}"`,
            })
          }
          exerciseIds.add(beat.exercise.id)
        }
      }
    }
  }

  return { ok: errors.length === 0, errors, lessonCount, tracks, bosses, duels }
}
