import { useEffect, useState } from 'react'
import {
  CONDUCTOR_NAME,
  capabilities,
  capabilityNotice,
  type SidecarStatus,
  type Track,
} from '@conductor/shared'
import { host, isDesktop } from './host'
import { useProfile } from './store/useProfile'
import { orderedTracks, lessonById, resumeLesson } from './content'
import { LessonPlayer } from './lesson/LessonPlayer'
import { TrackMap } from './components/TrackMap'
import { XpBar } from './components/XpBar'
import './visualizers'
import '@conductor/core/grading/graders'
import '@conductor/core/grading/sql-graders'
import '@conductor/core/grading/python-graders'
import '@conductor/core/grading/api-graders'

/**
 * The application shell: course spine on the left, the current lesson on the
 * right, and a header that is always honest about what currently works.
 */
export function App() {
  const [sidecar, setSidecar] = useState<SidecarStatus>({ state: 'stopped' })
  const [lessonId, setLessonId] = useState<string | null>(null)
  const { profile, loaded, load } = useProfile()

  useEffect(() => {
    void load()
    void host().getSidecarStatus().then(setSidecar)
    return host().onSidecarStatus(setSidecar)
  }, [load])

  // Open where they left off, rather than asking them to choose first.
  useEffect(() => {
    if (loaded && lessonId === null) {
      setLessonId(resumeLesson(profile.completedLessons)?.id ?? null)
    }
  }, [loaded, lessonId, profile.completedLessons])

  const caps = capabilities(sidecar)
  const notice = capabilityNotice(sidecar)
  const tracks = orderedTracks()
  const lesson = lessonId ? lessonById(lessonId) : undefined

  /** Tracks whose exercises genuinely cannot be graded right now. */
  function locked(track: Track): boolean {
    if (track.track === 'fundamentals' || track.track === 'api') return !caps.pythonExec
    return false
  }

  return (
    <div className="flex h-full flex-col bg-ink-900">
      <header className="flex shrink-0 items-center justify-between border-b border-ink-700 bg-ink-850 px-5 py-2.5">
        <div className="flex items-baseline gap-3">
          <span className="font-semibold tracking-tight text-parchment-100">{CONDUCTOR_NAME}</span>
          <span className="hidden text-xs text-parchment-400 lg:inline">
            You cannot direct what you cannot read.
          </span>
        </div>
        <div className="flex items-center gap-5">
          {loaded && <XpBar profile={profile} />}
          <span className="font-mono text-[10px] text-parchment-400/70">
            {isDesktop() ? 'desktop' : 'browser preview'}
          </span>
        </div>
      </header>

      {notice && (
        <div
          role="status"
          className="shrink-0 border-b border-brass-600/25 bg-brass-600/10 px-5 py-1.5 text-xs text-brass-400"
        >
          {notice}
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        <aside className="w-72 shrink-0 overflow-y-auto border-r border-ink-700 bg-ink-850">
          <TrackMap
            tracks={tracks}
            profile={profile}
            currentLessonId={lessonId}
            onSelect={setLessonId}
            locked={locked}
          />
        </aside>

        <main className="min-w-0 flex-1 overflow-y-auto">
          {lesson ? (
            <LessonPlayer
              key={lesson.id}
              lesson={lesson}
              onFinished={(next) => setLessonId(next ?? lesson.id)}
            />
          ) : (
            <div className="px-8 py-16 text-parchment-400">Loading the course…</div>
          )}
        </main>
      </div>
    </div>
  )
}
