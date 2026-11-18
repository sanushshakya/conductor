import { tracks, bosses, duels, atlas, fixtures } from 'virtual:conductor-content'
import { TRACK_META, type Lesson, type Track, type TrackId } from '@conductor/shared'

/** The curriculum, validated at build time by the content plugin. */
export { tracks, bosses, duels, atlas, fixtures }

/** Tracks in the order a learner meets them. */
export function orderedTracks(): Track[] {
  return [...tracks].sort((a, b) => TRACK_META[a.track].index - TRACK_META[b.track].index)
}

export function allLessons(): Lesson[] {
  return orderedTracks().flatMap((t) => t.lessons)
}

export function lessonById(id: string): Lesson | undefined {
  return allLessons().find((l) => l.id === id)
}

export function trackOf(lessonId: string): TrackId | undefined {
  return allLessons().find((l) => l.id === lessonId)?.track
}

/** The next lesson after `id` in course order, or undefined at the end. */
export function nextLesson(id: string): Lesson | undefined {
  const all = allLessons()
  const index = all.findIndex((l) => l.id === id)
  return index >= 0 ? all[index + 1] : undefined
}

/**
 * The lesson a learner should open right now: the first they have not
 * completed. A returning learner lands exactly where they stopped, with no
 * "continue?" screen to navigate first.
 */
export function resumeLesson(completed: string[]): Lesson | undefined {
  const all = allLessons()
  return all.find((l) => !completed.includes(l.id)) ?? all[all.length - 1]
}

export function bossForTrack(track: TrackId) {
  return bosses.find((b) => b.track === track)
}

export function duelById(id: string) {
  return duels.find((d) => d.id === id)
}
