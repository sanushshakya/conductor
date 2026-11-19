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
import { orderedTracks, lessonById, resumeLesson, bossById, bossForTrack } from './content'
import { isFirstRun } from '@conductor/shared'
import { LessonPlayer } from './lesson/LessonPlayer'
import { BossPlayer } from './lesson/BossPlayer'
import { TrackMap } from './components/TrackMap'
import { FirstRun } from './onboarding/FirstRun'
import { ErrorBoundary } from './components/ErrorBoundary'
import { BadgeToast } from './components/BadgeToast'
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
  const [bossId, setBossId] = useState<string | null>(null)
  const [welcomed, setWelcomed] = useState(false)
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

  // The welcome screen appears only on a genuinely untouched profile, and it
  // blocks nothing — Track 0 is already loaded behind it.
  const showWelcome = loaded && !welcomed && isFirstRun(profile)

  const caps = capabilities(sidecar)
  const notice = capabilityNotice(sidecar)
  const tracks = orderedTracks()
  const lesson = lessonId ? lessonById(lessonId) : undefined
  const boss = bossId ? bossById(bossId) : undefined

  /**
   * Tracks whose exercises genuinely cannot be graded right now.
   *
   * Boot, Web, SQL and Frontend all run entirely in the renderer — the Boot
   * interpreter, the preview frame and SQLite-on-WASM — so four of the eight
   * tracks stay open with no Python at all.
   */
  function locked(track: Track): boolean {
    if (track.track === 'fundamentals' || track.track === 'api') return !caps.pythonExec
    return false
  }

  if (showWelcome) {
    return (
      <div className="h-full bg-ink-900">
        <FirstRun
          onStart={() => {
            setWelcomed(true)
            setLessonId('0.1')
          }}
        />
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col bg-ink-900">
      <BadgeToast />
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
            currentLessonId={bossId ? null : lessonId}
            onSelect={(id) => {
              setBossId(null)
              setLessonId(id)
            }}
            locked={locked}
            bossFor={(track) => bossForTrack(track.track)}
            currentBossId={bossId}
            onSelectBoss={setBossId}
          />
        </aside>

        <main className="min-w-0 flex-1 overflow-y-auto">
          {boss ? (
            <ErrorBoundary key={boss.id} what="this project">
              <BossPlayer boss={boss} />
            </ErrorBoundary>
          ) : lesson ? (
            <ErrorBoundary key={lesson.id} what="this lesson">
              <LessonPlayer
                lesson={lesson}
                onFinished={(next) => setLessonId(next ?? lesson.id)}
              />
            </ErrorBoundary>
          ) : (
            <div className="px-8 py-16 text-parchment-400">Loading the course…</div>
          )}
        </main>
      </div>
    </div>
  )
}
