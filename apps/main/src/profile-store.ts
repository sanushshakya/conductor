import {
  mkdirSync,
  openSync,
  writeSync,
  fsyncSync,
  closeSync,
  renameSync,
  readFileSync,
  existsSync,
  copyFileSync,
  unlinkSync,
} from 'node:fs'
import { join } from 'node:path'
import { ProfileSchema, freshProfile, type Profile } from '@conductor/shared'

export interface SaveHooks {
  /** Test seam: called after the temp file is written, before the rename. */
  afterTempWrite?: () => void
}

/**
 * The learner's entire progress, on disk, as JSON.
 *
 * Progress is the one thing in this app that cannot be regenerated. Losing it
 * does not cost a feature, it costs the learner's reason to come back — so
 * this class is deliberately paranoid in a way the rest of the codebase is
 * not:
 *
 *   - **Atomic writes.** Content goes to a temp file, is fsynced, and is then
 *     renamed over the real path. `rename` is atomic on APFS and ext4, so a
 *     crash at any instant leaves either the old file or the new one, never a
 *     half-written document.
 *   - **A backup generation.** The previous good file is kept as
 *     `profile.bak.json`, so even a corrupted primary costs one session rather
 *     than everything.
 *   - **Validation on read.** The file is parsed against ProfileSchema, not
 *     trusted. It has survived crashes, hand edits, and older app versions.
 *
 * JSON rather than SQLite is a project constraint: no native Node modules, so
 * no `better-sqlite3` and no `electron-rebuild` for a first-time user to hit.
 */
export class ProfileStore {
  private readonly primary: string
  private readonly backup: string
  private readonly temp: string

  constructor(private readonly dir: string) {
    this.primary = join(dir, 'profile.json')
    this.backup = join(dir, 'profile.bak.json')
    this.temp = join(dir, 'profile.tmp.json')
  }

  /**
   * Returns the learner's profile, falling back through
   * primary → backup → fresh. Never throws: a profile that cannot be read is a
   * recoverable state, and refusing to boot over it would be the worse failure.
   */
  load(): Profile {
    const fromPrimary = this.readValid(this.primary)
    if (fromPrimary) return fromPrimary

    const fromBackup = this.readValid(this.backup)
    if (fromBackup) return fromBackup

    return freshProfile(new Date().toISOString())
  }

  /** Persists `profile`, stamping `updatedAt`. Returns what was written. */
  save(profile: Profile, hooks: SaveHooks = {}): Profile {
    const toWrite: Profile = { ...profile, updatedAt: new Date().toISOString() }
    mkdirSync(this.dir, { recursive: true })

    const body = JSON.stringify(toWrite, null, 2)
    const fd = openSync(this.temp, 'w')
    try {
      writeSync(fd, body)
      // Without the fsync, the rename can land before the bytes do, which on a
      // power loss yields an empty file that is "atomically" wrong.
      fsyncSync(fd)
    } finally {
      closeSync(fd)
    }

    hooks.afterTempWrite?.()

    if (existsSync(this.primary)) copyFileSync(this.primary, this.backup)
    renameSync(this.temp, this.primary)

    return toWrite
  }

  /** Wipes progress back to a new profile and persists it. */
  reset(): Profile {
    return this.save(freshProfile(new Date().toISOString()))
  }

  /** Removes the stored files entirely. Used by first-run tests and support. */
  clear(): void {
    for (const path of [this.primary, this.backup, this.temp]) {
      if (existsSync(path)) unlinkSync(path)
    }
  }

  private readValid(path: string): Profile | null {
    if (!existsSync(path)) return null
    try {
      const parsed = ProfileSchema.safeParse(JSON.parse(readFileSync(path, 'utf8')))
      return parsed.success ? parsed.data : null
    } catch {
      return null
    }
  }
}
