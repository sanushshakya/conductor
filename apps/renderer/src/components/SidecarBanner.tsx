import { capabilityNotice, type SidecarStatus } from '@conductor/shared'

/**
 * One line telling the learner what currently works.
 *
 * Deliberately not a modal and not an error: the spec's position is that a
 * missing Python engine pauses two tracks and blocks nothing else, so the
 * banner states that calmly and the app carries on.
 */
export function SidecarBanner({ status }: { status: SidecarStatus }) {
  const notice = capabilityNotice(status)
  if (!notice) return null

  const provisioning = status.state === 'provisioning' || status.state === 'starting'

  return (
    <div
      role="status"
      className={`flex shrink-0 items-center gap-2 border-b px-5 py-1.5 text-xs ${
        status.state === 'failed'
          ? 'border-ink-700 bg-ink-800 text-parchment-300'
          : 'border-brass-600/25 bg-brass-600/10 text-brass-400'
      }`}
    >
      {provisioning && (
        <span
          aria-hidden
          className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-brass-500"
        />
      )}
      <span>{notice}</span>
    </div>
  )
}
