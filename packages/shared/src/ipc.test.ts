import { IPC } from './ipc'
import { capabilities } from './capabilities'
import { ProfileSchema, freshProfile } from './domain'

test('IPC channel names are unique and namespaced', () => {
  const values = Object.values(IPC)
  expect(new Set(values).size).toBe(values.length)
  values.forEach((v) => expect(v).toMatch(/^conductor:[a-z-]+:[a-z-]+$/))
})

test('IPC covers every channel the app depends on', () => {
  expect(Object.keys(IPC).sort()).toEqual(
    [
      'contentList',
      'gradeApi',
      'mentorAsk',
      'openExternal',
      'profileGet',
      'profileReset',
      'profileUpdate',
      'pythonRun',
      'sidecarStart',
      'sidecarStatus',
    ].sort(),
  )
})

test('ProfileSchema accepts a fresh profile', () => {
  expect(ProfileSchema.safeParse(freshProfile('2026-11-18T00:00:00.000Z')).success).toBe(true)
})

test('ProfileSchema rejects a profile with negative xp', () => {
  const bad = { ...freshProfile('2026-11-18T00:00:00.000Z'), xp: -5 }
  expect(ProfileSchema.safeParse(bad).success).toBe(false)
})

test('ProfileSchema rejects a lastActiveDay that is not YYYY-MM-DD', () => {
  const p = freshProfile('2026-11-18T00:00:00.000Z')
  const bad = { ...p, streak: { ...p.streak, lastActiveDay: '18/11/2026' } }
  expect(ProfileSchema.safeParse(bad).success).toBe(false)
})

test('a ready sidecar enables every capability', () => {
  const caps = capabilities({ state: 'ready', port: 51234 })
  expect(caps.sqlLessons).toBe(true)
  expect(caps.pythonExec).toBe(true)
  expect(caps.apiGrading).toBe(true)
  expect(caps.liveMentor).toBe(true)
})

test('a failed sidecar still leaves SQL lessons available', () => {
  const caps = capabilities({ state: 'failed', message: 'Python 3 was not found' })
  expect(caps.sqlLessons).toBe(true)
  expect(caps.pythonExec).toBe(false)
  expect(caps.apiGrading).toBe(false)
  expect(caps.liveMentor).toBe(false)
})

test('offline capabilities still allow the boot track and authored hints', () => {
  const caps = capabilities({ state: 'failed' })
  expect(caps.bootTrack).toBe(true)
  expect(caps.authoredHints).toBe(true)
})
