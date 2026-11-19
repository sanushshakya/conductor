import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { bossProgress, type Boss, type ExerciseResult } from '@conductor/shared'
import { ExercisePanel } from './BeatRenderer'
import { Markdown } from '../components/Markdown'
import { Celebrate } from '../components/Celebrate'
import { useProfile } from '../store/useProfile'

/**
 * A boss project: several real graded criteria, worked in any order.
 *
 * The progress bar counts passed criteria and nothing else, so it cannot
 * overstate what has been done — the spec's position is that a bar which moves
 * for effort rather than for passing checks is one the learner learns to
 * ignore.
 *
 * Criteria are collapsible and independent. A boss is an hour of work, and
 * being unable to put one criterion down and come back to it is what makes
 * long tasks feel like a wall.
 */
export function BossPlayer({ boss, onFinished }: { boss: Boss; onFinished?(): void }) {
  const [open, setOpen] = useState<string | null>(boss.criteria[0]?.id ?? null)
  const [celebrate, setCelebrate] = useState(false)
  const profile = useProfile((s) => s.profile)
  const recordExercise = useProfile((s) => s.recordExercise)
  const completeBossFor = useProfile((s) => s.completeBoss)

  const exerciseIds = useMemo(() => boss.criteria.map((c) => c.exercise.id), [boss])
  const progress = bossProgress(profile, exerciseIds)
  const alreadyCleared = profile.completedBosses.includes(boss.id)

  async function handleGraded(exerciseId: string, result: ExerciseResult) {
    await recordExercise(exerciseId, result)

    const after = useProfile.getState().profile
    if (bossProgress(after, exerciseIds).complete && !after.completedBosses.includes(boss.id)) {
      setCelebrate(true)
      setTimeout(() => setCelebrate(false), 1400)
      await completeBossFor(boss.id)
      onFinished?.()
    }
  }

  return (
    <article className="mx-auto max-w-3xl px-8 py-10">
      <Celebrate fire={celebrate} />

      <header className="mb-6">
        <div className="mb-1 font-mono text-xs uppercase tracking-wider text-brass-500">
          Boss project · {boss.estimateMinutes} min
        </div>
        <h1 className="mb-4 text-3xl font-semibold tracking-tight text-parchment-100">
          {boss.title}
        </h1>

        <div
          className="mb-2 h-1.5 w-full overflow-hidden rounded-full bg-ink-700"
          role="progressbar"
          aria-valuenow={progress.passed}
          aria-valuemin={0}
          aria-valuemax={progress.total}
          aria-label={`${boss.title} progress`}
        >
          <motion.div
            className={progress.complete ? 'h-full bg-verify-500' : 'h-full bg-brass-500'}
            initial={false}
            animate={{ width: `${(progress.passed / progress.total) * 100}%` }}
            transition={{ type: 'spring', stiffness: 120, damping: 20 }}
          />
        </div>
        <p className="text-xs text-parchment-400">
          {progress.passed} of {progress.total} criteria passing
          {alreadyCleared && ' · cleared'}
        </p>
      </header>

      <div className="lesson-prose mb-8">
        <Markdown text={boss.brief} />
      </div>

      <ol className="space-y-2">
        {boss.criteria.map((criterion, index) => {
          const passed = profile.exerciseResults[criterion.exercise.id]?.passed === true
          const isOpen = open === criterion.id

          return (
            <li
              key={criterion.id}
              className={`overflow-hidden rounded-xl border ${
                passed ? 'border-verify-600/40 bg-verify-600/5' : 'border-ink-700 bg-ink-850'
              }`}
            >
              <button
                type="button"
                aria-expanded={isOpen}
                onClick={() => setOpen(isOpen ? null : criterion.id)}
                className="focus-ring flex w-full items-center gap-3 px-4 py-3 text-left"
              >
                <span
                  aria-hidden
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px] ${
                    passed
                      ? 'border-verify-500 bg-verify-500 text-ink-950'
                      : 'border-ink-500 text-parchment-400'
                  }`}
                >
                  {passed ? '✓' : index + 1}
                </span>
                <span
                  className={`flex-1 text-sm ${passed ? 'text-verify-400' : 'text-parchment-100'}`}
                >
                  {criterion.label}
                </span>
                <span aria-hidden className="text-xs text-parchment-400">
                  {isOpen ? '−' : '+'}
                </span>
              </button>

              {isOpen && (
                <div className="border-t border-ink-700 px-4 py-4">
                  <ExercisePanel
                    beat={{ kind: 'prose', body: '' }}
                    exercise={criterion.exercise}
                    satisfied={passed}
                    onSatisfied={() => {}}
                    onExerciseGraded={(id, result) => void handleGraded(id, result)}
                  />
                </div>
              )}
            </li>
          )
        })}
      </ol>

      {progress.complete && (
        <motion.p
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-8 rounded-xl border border-verify-600/40 bg-verify-600/10 px-5 py-4 text-verify-400"
        >
          Every criterion passes. This one is finished — and it is yours to show someone.
        </motion.p>
      )}
    </article>
  )
}
