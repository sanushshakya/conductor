import { useEffect, useState } from 'react'
import {
  CONDUCTOR_NAME,
  CONDUCTOR_TAGLINE,
  CONDUCTOR_VERSION,
  capabilities,
  capabilityNotice,
  type Profile,
  type SidecarStatus,
} from '@conductor/shared'
import { host, isDesktop } from './host'

/**
 * The application shell.
 *
 * Phase 2 mounts the lesson player into the main region; what is here now is
 * the frame it lives in, plus the one thing the shell must always be honest
 * about: which parts of the app are currently working.
 */
export function App() {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [sidecar, setSidecar] = useState<SidecarStatus>({ state: 'stopped' })

  useEffect(() => {
    const api = host()
    void api.getProfile().then(setProfile)
    void api.getSidecarStatus().then(setSidecar)
    return api.onSidecarStatus(setSidecar)
  }, [])

  const caps = capabilities(sidecar)
  const notice = capabilityNotice(sidecar)

  return (
    <div className="flex h-full flex-col bg-ink-900">
      <header className="flex items-center justify-between border-b border-ink-700 bg-ink-850 px-6 py-3">
        <div className="flex items-baseline gap-3">
          <span className="font-semibold tracking-tight text-parchment-100">{CONDUCTOR_NAME}</span>
          <span className="hidden text-sm text-parchment-400 sm:inline">{CONDUCTOR_TAGLINE}</span>
        </div>
        <div className="flex items-center gap-4 text-xs text-parchment-400">
          <StatusBadge status={sidecar} />
          <span className="font-mono">
            v{CONDUCTOR_VERSION}
            <span className="ml-2 text-parchment-400/60">{isDesktop() ? 'desktop' : 'browser preview'}</span>
          </span>
        </div>
      </header>

      {notice && (
        <div
          role="status"
          className="border-b border-brass-600/30 bg-brass-600/10 px-6 py-2 text-sm text-brass-400"
        >
          {notice}
        </div>
      )}

      <main className="flex-1 overflow-y-auto px-6 py-10">
        <div className="mx-auto max-w-prose animate-fade-up">
          <h1 className="mb-2 text-2xl font-semibold text-parchment-100">Ready when you are.</h1>
          <p className="mb-8 text-parchment-300">
            You cannot direct what you cannot read. Every lesson here ends with you catching a
            mistake an AI made — which is the part of the job that is actually yours.
          </p>

          <dl className="grid grid-cols-2 gap-3 text-sm">
            <Capability label="Boot track" enabled={caps.bootTrack} />
            <Capability label="SQL lessons" enabled={caps.sqlLessons} />
            <Capability label="Python exercises" enabled={caps.pythonExec} />
            <Capability label="API grading" enabled={caps.apiGrading} />
          </dl>

          {profile && (
            <p className="mt-8 text-xs text-parchment-400">
              Level {profile.level} · {profile.xp} XP · {profile.completedLessons.length} lessons done
            </p>
          )}
        </div>
      </main>
    </div>
  )
}

function StatusBadge({ status }: { status: SidecarStatus }) {
  const tone =
    status.state === 'ready'
      ? 'bg-verify-500/15 text-verify-400 border-verify-600/40'
      : status.state === 'failed'
        ? 'bg-wrong-500/15 text-wrong-400 border-wrong-500/40'
        : 'bg-ink-700 text-parchment-300 border-ink-600'

  return (
    <span className={`rounded-full border px-2.5 py-1 font-medium ${tone}`}>
      Python engine: {status.state}
    </span>
  )
}

function Capability({ label, enabled }: { label: string; enabled: boolean }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-ink-700 bg-ink-850 px-3 py-2">
      <span
        aria-hidden
        className={`h-1.5 w-1.5 rounded-full ${enabled ? 'bg-verify-400' : 'bg-parchment-400/40'}`}
      />
      <dt className="text-parchment-200">{label}</dt>
      <dd className="ml-auto text-xs text-parchment-400">{enabled ? 'ready' : 'paused'}</dd>
    </div>
  )
}
