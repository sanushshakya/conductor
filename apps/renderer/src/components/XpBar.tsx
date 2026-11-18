import { motion } from 'framer-motion'
import { levelForXp, type Profile } from '@conductor/shared'

export function XpBar({ profile }: { profile: Profile }) {
  const { level, xpIntoLevel, xpForNext } = levelForXp(profile.xp)
  const percent = Math.min(100, Math.round((xpIntoLevel / xpForNext) * 100))

  return (
    <div className="flex items-center gap-3">
      <span className="font-mono text-xs text-parchment-400">L{level}</span>
      <div
        className="h-1.5 w-28 overflow-hidden rounded-full bg-ink-700"
        role="progressbar"
        aria-valuenow={xpIntoLevel}
        aria-valuemin={0}
        aria-valuemax={xpForNext}
        aria-label={`Level ${level} progress`}
      >
        <motion.div
          className="h-full bg-brass-500"
          initial={false}
          animate={{ width: `${percent}%` }}
          transition={{ type: 'spring', stiffness: 120, damping: 20 }}
        />
      </div>
      <span className="font-mono text-xs text-parchment-400">{profile.xp} XP</span>
      {profile.streak.current > 1 && (
        <span
          className="font-mono text-xs text-brass-400"
          title={`${profile.streak.current} days in a row`}
        >
          {profile.streak.current}d
        </span>
      )}
    </div>
  )
}
