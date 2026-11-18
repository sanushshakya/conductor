import { isFirstRun, firstRunPlan } from './first-run'
import { freshProfile, capabilities } from '@conductor/shared'

const NOW = '2026-11-18T10:00:00.000Z'

test('isFirstRun is true for a fresh profile', () => {
  expect(isFirstRun(freshProfile(NOW))).toBe(true)
})

test('isFirstRun is false once a lesson has been completed', () => {
  expect(isFirstRun({ ...freshProfile(NOW), completedLessons: ['0.1'] })).toBe(false)
})

test('isFirstRun is false once any exercise has been attempted', () => {
  const profile = {
    ...freshProfile(NOW),
    exerciseResults: { 'boot-first-line': { passed: false, checks: [], xpAwarded: 0 } },
  }
  expect(isFirstRun(profile)).toBe(false)
})

test('isFirstRun is false once XP has been earned', () => {
  expect(isFirstRun({ ...freshProfile(NOW), xp: 25 })).toBe(false)
})

test('first run reaches a runnable first lesson without any network call', () => {
  const plan = firstRunPlan(freshProfile(NOW))
  expect(plan.openLessonId).toBe('0.1')
  expect(plan.needsNetworkBeforeStart).toBe(false)
  expect(plan.blockOnSidecar).toBe(false)
})

test('provisioning failure on first run still lands the learner in Track 0', () => {
  const plan = firstRunPlan(freshProfile(NOW), { state: 'failed', message: 'no python' })
  expect(plan.openLessonId).toBe('0.1')
  expect(plan.blockOnSidecar).toBe(false)

  const caps = capabilities({ state: 'failed' })
  expect(caps.bootTrack).toBe(true)
  expect(caps.sqlLessons).toBe(true)
})

test('a returning learner is taken to where they stopped, not to 0.1', () => {
  const plan = firstRunPlan({ ...freshProfile(NOW), completedLessons: ['0.1', '0.2'] })
  expect(plan.showWelcome).toBe(false)
  expect(plan.openLessonId).toBeNull()
})

test('the welcome screen is shown only on a genuinely fresh profile', () => {
  expect(firstRunPlan(freshProfile(NOW)).showWelcome).toBe(true)
  expect(firstRunPlan({ ...freshProfile(NOW), xp: 10 }).showWelcome).toBe(false)
})

test('sidecar provisioning is deferred until after the first paint', () => {
  // Goal G1 is a runnable first lesson in under fifteen seconds. Provisioning
  // Python before the window shows would roughly double that.
  expect(firstRunPlan(freshProfile(NOW)).startSidecarAfterFirstPaint).toBe(true)
})
