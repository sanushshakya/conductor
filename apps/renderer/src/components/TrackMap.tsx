import { TRACK_META, type Profile, type Track } from '@conductor/shared'

interface Props {
  tracks: Track[]
  profile: Profile
  currentLessonId: string | null
  onSelect(lessonId: string): void
  locked(track: Track): boolean
}

/**
 * The course, as a navigable spine.
 *
 * Everything is visible from the start, including tracks not yet unlocked.
 * Hiding what comes later makes a course feel endless; seeing that there are
 * six tracks and roughly where you are is what makes finishing feel possible.
 */
export function TrackMap({ tracks, profile, currentLessonId, onSelect, locked }: Props) {
  return (
    <nav aria-label="Course" className="space-y-6 p-4">
      {tracks.map((track) => {
        const meta = TRACK_META[track.track]
        const done = track.lessons.filter((l) => profile.completedLessons.includes(l.id)).length
        const isLocked = locked(track)

        return (
          <section key={track.track}>
            <header className="mb-2 px-2">
              <div className="flex items-baseline justify-between">
                <h2 className="text-sm font-semibold text-parchment-100">
                  <span className="mr-2 font-mono text-xs text-brass-600">{meta.index}</span>
                  {track.title}
                </h2>
                <span className="font-mono text-[10px] text-parchment-400">
                  {done}/{track.lessons.length}
                </span>
              </div>
              <p className="mt-0.5 text-[11px] leading-snug text-parchment-400">{meta.blurb}</p>
            </header>

            <ul className="space-y-0.5">
              {track.lessons.map((lesson) => {
                const complete = profile.completedLessons.includes(lesson.id)
                const current = lesson.id === currentLessonId
                return (
                  <li key={lesson.id}>
                    <button
                      type="button"
                      disabled={isLocked}
                      onClick={() => onSelect(lesson.id)}
                      aria-current={current ? 'page' : undefined}
                      className={`focus-ring flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors ${
                        current
                          ? 'bg-brass-500/15 text-brass-400'
                          : isLocked
                            ? 'cursor-not-allowed text-parchment-400/40'
                            : 'text-parchment-300 hover:bg-ink-800'
                      }`}
                    >
                      <span
                        aria-hidden
                        className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                          complete ? 'bg-verify-400' : current ? 'bg-brass-500' : 'bg-ink-600'
                        }`}
                      />
                      <span className="font-mono text-[10px] text-parchment-400">{lesson.id}</span>
                      <span className="truncate">{lesson.title}</span>
                      {complete && <span className="sr-only">(completed)</span>}
                    </button>
                  </li>
                )
              })}
            </ul>

            {isLocked && (
              <p className="mt-1 px-2 text-[11px] text-parchment-400/60">
                Opens when the Python engine is ready.
              </p>
            )}
          </section>
        )
      })}
    </nav>
  )
}
