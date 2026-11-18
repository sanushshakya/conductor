import { lintContent } from './lint-content'

/**
 * Ages out claims that go stale.
 *
 * Track 4 describes a landscape that changes every few months: which agents
 * have free tiers, what the tools are called, how you sign up. The spec names
 * content rot as an anti-goal, because a course that confidently tells a
 * beginner to use a product that no longer exists destroys its own
 * credibility at the exact moment it is asking for trust.
 *
 * So every volatile claim carries the date it was last checked, and this turns
 * "someone should review that" into a failing build.
 */

export interface StaleClaim {
  lessonId: string
  verifiedOn: string
  ageDays: number
  excerpt: string
}

export interface FreshnessReport {
  ok: boolean
  volatileCount: number
  stale: StaleClaim[]
  missingDate: { lessonId: string; excerpt: string }[]
  future: { lessonId: string; verifiedOn: string }[]
}

const DAY_MS = 86_400_000

function excerptOf(beat: Record<string, unknown>): string {
  const text = (beat['body'] ?? beat['intro'] ?? beat['caption'] ?? '') as string
  return text.slice(0, 80).replace(/\s+/g, ' ').trim()
}

export function checkFreshness(
  contentDir: string,
  today: Date = new Date(),
  maxAgeDays = 180,
): FreshnessReport {
  const content = lintContent(contentDir)
  const stale: StaleClaim[] = []
  const missingDate: { lessonId: string; excerpt: string }[] = []
  const future: { lessonId: string; verifiedOn: string }[] = []
  let volatileCount = 0

  for (const track of content.tracks) {
    for (const lesson of track.lessons) {
      for (const beat of lesson.beats) {
        if (beat.volatile !== true) continue
        volatileCount += 1

        const verifiedOn = beat.verifiedOn
        if (!verifiedOn) {
          missingDate.push({ lessonId: lesson.id, excerpt: excerptOf(beat) })
          continue
        }

        const ageDays = Math.floor(
          (Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()) -
            Date.parse(`${verifiedOn}T00:00:00Z`)) /
            DAY_MS,
        )

        if (ageDays < 0) {
          future.push({ lessonId: lesson.id, verifiedOn })
        } else if (ageDays > maxAgeDays) {
          stale.push({ lessonId: lesson.id, verifiedOn, ageDays, excerpt: excerptOf(beat) })
        }
      }
    }
  }

  return {
    ok: stale.length === 0 && missingDate.length === 0 && future.length === 0,
    volatileCount,
    stale,
    missingDate,
    future,
  }
}
