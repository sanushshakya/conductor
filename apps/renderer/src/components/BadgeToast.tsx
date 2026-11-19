import { useEffect } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { BADGES } from '@conductor/shared'
import { useProfile } from '../store/useProfile'

/**
 * Tells the learner when they have earned something.
 *
 * Badges were being computed, awarded and persisted with nothing ever showing
 * them — which made them an entirely private achievement, and the spec lists
 * them as a structural engagement mechanic rather than a bookkeeping field.
 *
 * It is a toast rather than a modal: the reward is the moment, and a dialog
 * that has to be dismissed taxes the learner for succeeding.
 */
export function BadgeToast() {
  const pending = useProfile((s) => s.pendingBadges)
  const acknowledge = useProfile((s) => s.acknowledgeBadges)

  useEffect(() => {
    if (pending.length === 0) return
    const timer = setTimeout(acknowledge, 6000)
    return () => clearTimeout(timer)
  }, [pending, acknowledge])

  const earned = pending
    .map((id) => BADGES.find((b) => b.id === id))
    .filter((b): b is (typeof BADGES)[number] => Boolean(b))

  return (
    <div className="pointer-events-none fixed bottom-5 right-5 z-40 flex flex-col gap-2">
      <AnimatePresence>
        {earned.map((badge) => (
          <motion.div
            key={badge.id}
            initial={{ opacity: 0, y: 16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ type: 'spring', stiffness: 260, damping: 24 }}
            role="status"
            className="pointer-events-auto w-72 cursor-pointer rounded-xl border border-brass-500/50 bg-ink-850 px-4 py-3 shadow-lg"
            onClick={acknowledge}
          >
            <div className="mb-0.5 font-mono text-[10px] uppercase tracking-wider text-brass-500">
              Badge earned
            </div>
            <div className="text-sm font-medium text-parchment-100">{badge.title}</div>
            <p className="mt-0.5 text-xs text-parchment-400">{badge.description}</p>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}
