import { create } from 'zustand'
import {
  completeLesson as completeLessonPure,
  recordExerciseResult as recordPure,
  recordDuelWin as recordDuelPure,
  touchStreak,
  freshProfile,
  type ExerciseResult,
  type Profile,
} from '@conductor/shared'
import { host } from '../host'

interface ProfileState {
  profile: Profile
  loaded: boolean
  /** Badges earned since the last time the UI showed them. */
  pendingBadges: string[]
  load(): Promise<void>
  recordExercise(exerciseId: string, result: ExerciseResult): Promise<void>
  completeLesson(lessonId: string): Promise<void>
  recordDuelWin(): Promise<void>
  acknowledgeBadges(): void
  reset(): Promise<void>
}

/**
 * Progress state.
 *
 * Every mutation goes through the pure functions in `@conductor/shared` and is
 * then persisted. Persisting is deliberately awaited rather than fired and
 * forgotten: a learner who finishes a lesson and immediately quits must still
 * have that lesson finished when they come back.
 */
export const useProfile = create<ProfileState>((set, get) => ({
  profile: freshProfile(new Date().toISOString()),
  loaded: false,
  pendingBadges: [],

  async load() {
    const stored = await host().getProfile()
    // Opening the app is the activity that counts for a streak, not finishing
    // something — the aim is to reward showing up.
    const withStreak = touchStreak(stored, new Date())
    set({ profile: withStreak, loaded: true })
    if (withStreak !== stored) await host().updateProfile(withStreak)
  },

  async recordExercise(exerciseId, result) {
    const before = get().profile
    const after = recordPure(before, exerciseId, result)
    set({ profile: after, pendingBadges: newBadges(before, after) })
    await host().updateProfile(after)
  },

  async completeLesson(lessonId) {
    const before = get().profile
    const after = completeLessonPure(before, lessonId)
    if (after === before) return
    set({ profile: after, pendingBadges: newBadges(before, after) })
    await host().updateProfile(after)
  },

  async recordDuelWin() {
    const before = get().profile
    const after = recordDuelPure(before)
    set({ profile: after, pendingBadges: newBadges(before, after) })
    await host().updateProfile(after)
  },

  acknowledgeBadges() {
    set({ pendingBadges: [] })
  },

  async reset() {
    const profile = await host().resetProfile()
    set({ profile, pendingBadges: [] })
  },
}))

function newBadges(before: Profile, after: Profile): string[] {
  return after.badges.filter((b) => !before.badges.includes(b))
}
