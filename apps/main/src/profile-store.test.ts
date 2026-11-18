import { mkdtempSync, writeFileSync, readFileSync, existsSync, chmodSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ProfileStore } from './profile-store'
import { freshProfile, type Profile } from '@conductor/shared'

function tempDir(): string {
  return mkdtempSync(join(tmpdir(), 'conductor-profile-'))
}

function goodProfile(): Profile {
  return {
    ...freshProfile('2026-11-01T10:00:00.000Z'),
    xp: 475,
    level: 3,
    completedLessons: ['0.1', '0.2', '2.7'],
    badges: ['first-blood'],
  }
}

test('load() returns a fresh profile when no file exists', () => {
  const store = new ProfileStore(tempDir())
  const p = store.load()
  expect(p.xp).toBe(0)
  expect(p.level).toBe(1)
  expect(p.completedLessons).toEqual([])
})

test('save() then load() round-trips xp and completedLessons', () => {
  const dir = tempDir()
  const store = new ProfileStore(dir)
  store.save(goodProfile())
  const loaded = new ProfileStore(dir).load()
  expect(loaded.xp).toBe(475)
  expect(loaded.completedLessons).toEqual(['0.1', '0.2', '2.7'])
})

test('load() recovers from backup when profile.json is truncated JSON', () => {
  const dir = tempDir()
  writeFileSync(join(dir, 'profile.json'), '{"xp":4')
  writeFileSync(join(dir, 'profile.bak.json'), JSON.stringify(goodProfile()))
  expect(new ProfileStore(dir).load().xp).toBe(475)
})

test('load() recovers from backup when profile.json is valid JSON but not a profile', () => {
  const dir = tempDir()
  writeFileSync(join(dir, 'profile.json'), JSON.stringify({ xp: 'lots' }))
  writeFileSync(join(dir, 'profile.bak.json'), JSON.stringify(goodProfile()))
  expect(new ProfileStore(dir).load().xp).toBe(475)
})

test('load() returns a fresh profile when both files are unreadable', () => {
  const dir = tempDir()
  writeFileSync(join(dir, 'profile.json'), 'not json at all')
  writeFileSync(join(dir, 'profile.bak.json'), '{{{')
  const p = new ProfileStore(dir).load()
  expect(p.xp).toBe(0)
  expect(p.completedLessons).toEqual([])
})

test('save() promotes the previous profile to the backup', () => {
  const dir = tempDir()
  const store = new ProfileStore(dir)
  store.save(goodProfile())
  store.save({ ...goodProfile(), xp: 999 })
  expect(JSON.parse(readFileSync(join(dir, 'profile.bak.json'), 'utf8')).xp).toBe(475)
  expect(store.load().xp).toBe(999)
})

test('save() leaves no temp file behind', () => {
  const dir = tempDir()
  new ProfileStore(dir).save(goodProfile())
  expect(existsSync(join(dir, 'profile.tmp.json'))).toBe(false)
})

test('save() writes to a temp path and renames, so a reader never sees a partial file', () => {
  const dir = tempDir()
  const store = new ProfileStore(dir)
  const seen: string[] = []
  store.save(goodProfile(), {
    afterTempWrite: () => {
      // At this instant the real file must still hold the OLD contents (here:
      // nothing), never a half-written document.
      seen.push(existsSync(join(dir, 'profile.json')) ? 'exists' : 'absent')
    },
  })
  expect(seen).toEqual(['absent'])
  expect(store.load().xp).toBe(475)
})

test('save() bumps updatedAt', () => {
  const dir = tempDir()
  const store = new ProfileStore(dir)
  const saved = store.save({ ...goodProfile(), updatedAt: '2020-01-01T00:00:00.000Z' })
  expect(saved.updatedAt).not.toBe('2020-01-01T00:00:00.000Z')
})

test('reset() clears progress and keeps the file loadable', () => {
  const dir = tempDir()
  const store = new ProfileStore(dir)
  store.save(goodProfile())
  const reset = store.reset()
  expect(reset.xp).toBe(0)
  expect(store.load().xp).toBe(0)
})

test('load() creates the directory when it does not exist', () => {
  const dir = join(tempDir(), 'nested', 'deeper')
  const store = new ProfileStore(dir)
  expect(() => store.save(goodProfile())).not.toThrow()
  expect(store.load().xp).toBe(475)
})

test('save() surfaces a write failure rather than silently losing progress', () => {
  const dir = tempDir()
  const store = new ProfileStore(dir)
  store.save(goodProfile())
  chmodSync(dir, 0o500)
  try {
    expect(() => store.save({ ...goodProfile(), xp: 1 })).toThrow()
  } finally {
    chmodSync(dir, 0o700)
    rmSync(dir, { recursive: true, force: true })
  }
})
