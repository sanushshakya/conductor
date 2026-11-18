import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import type { ExerciseResult, Lesson } from '@conductor/shared'
import { BeatRenderer } from './BeatRenderer'
import { Celebrate } from '../components/Celebrate'
import { useProfile } from '../store/useProfile'
import { nextLesson } from '../content'

/** Beats the learner must actually do, rather than read. */
function isGated(lesson: Lesson, index: number): boolean {
  const beat = lesson.beats[index]
  if (!beat) return false
  return beat.kind === 'code' || beat.kind === 'sql' || beat.kind === 'quiz' || beat.kind === 'duel'
}

export interface LessonPlayerProps {
  lesson: Lesson
  onFinished(nextLessonId: string | undefined): void
}

/**
 * Plays one lesson, beat by beat.
 *
 * Beats are revealed in sequence rather than shown as one long page. A wall of
 * text with the exercise at the bottom is the shape of a textbook, and the
 * learner this is built for has already decided textbooks are not for him. One
 * thing at a time, with the next unlocked by finishing this one, is the same
 * content with a completely different feel.
 *
 * Exercise beats gate progress; prose and visuals do not.
 */
export function LessonPlayer({ lesson, onFinished }: LessonPlayerProps) {
  const [visible, setVisible] = useState(1)
  const [satisfied, setSatisfied] = useState<Set<number>>(new Set())
  const [celebrate, setCelebrate] = useState(false)
  const recordExercise = useProfile((s) => s.recordExercise)
  const completeLesson = useProfile((s) => s.completeLesson)
  const alreadyDone = useProfile((s) => s.profile.completedLessons.includes(lesson.id))

  // Returning to a finished lesson should show it whole, not replay the gates.
  useEffect(() => {
    setVisible(alreadyDone ? lesson.beats.length : 1)
    setSatisfied(new Set())
    setCelebrate(false)
  }, [lesson.id, lesson.beats.length, alreadyDone])

  const currentIndex = visible - 1
  const canAdvance = useMemo(
    () => !isGated(lesson, currentIndex) || satisfied.has(currentIndex),
    [lesson, currentIndex, satisfied],
  )
  const atEnd = visible >= lesson.beats.length
  const following = nextLesson(lesson.id)

  function markSatisfied(index: number) {
    setSatisfied((current) => new Set(current).add(index))
  }

  async function handleGraded(exerciseId: string, result: ExerciseResult) {
    const firstPass = result.passed && !useProfile.getState().profile.exerciseResults[exerciseId]?.passed
    await recordExercise(exerciseId, result)
    if (firstPass) {
      setCelebrate(true)
      setTimeout(() => setCelebrate(false), 1200)
    }
  }

  async function finish() {
    await completeLesson(lesson.id)
    onFinished(following?.id)
  }

  return (
    <article className="mx-auto max-w-3xl px-8 py-10">
      <Celebrate fire={celebrate} />

      <header className="mb-8">
        <div className="mb-1 font-mono text-xs uppercase tracking-wider text-brass-500">
          Lesson {lesson.id} · {lesson.estimateMinutes} min
        </div>
        <h1 className="text-3xl font-semibold tracking-tight text-parchment-100">{lesson.title}</h1>
        {lesson.objectives && lesson.objectives.length > 0 && (
          <ul className="mt-4 space-y-1 text-sm text-parchment-400">
            {lesson.objectives.map((objective) => (
              <li key={objective} className="flex gap-2">
                <span aria-hidden className="text-brass-600">
                  →
                </span>
                {objective}
              </li>
            ))}
          </ul>
        )}
      </header>

      <div className="space-y-8">
        {lesson.beats.slice(0, visible).map((beat, index) => (
          <motion.section
            key={index}
            initial={index === 0 ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.28, ease: 'easeOut' }}
          >
            <BeatRenderer
              beat={beat}
              satisfied={satisfied.has(index)}
              onSatisfied={() => markSatisfied(index)}
              onExerciseGraded={(id, result) => void handleGraded(id, result)}
            />
          </motion.section>
        ))}
      </div>

      <div className="mt-10 border-t border-ink-700 pt-6">
        {!atEnd ? (
          <button
            type="button"
            disabled={!canAdvance}
            onClick={() => setVisible((n) => n + 1)}
            className="focus-ring rounded-md bg-brass-500 px-4 py-2 text-sm font-medium text-ink-950 transition-colors hover:bg-brass-400 disabled:cursor-not-allowed disabled:bg-ink-700 disabled:text-parchment-400"
          >
            {canAdvance ? 'Continue' : 'Finish this exercise to continue'}
          </button>
        ) : (
          <div className="flex items-center gap-3">
            <button
              type="button"
              disabled={!canAdvance}
              onClick={() => void finish()}
              className="focus-ring rounded-md bg-verify-500 px-4 py-2 text-sm font-medium text-ink-950 transition-colors hover:bg-verify-400 disabled:cursor-not-allowed disabled:bg-ink-700 disabled:text-parchment-400"
            >
              {canAdvance
                ? following
                  ? `Finish · next: ${following.title}`
                  : 'Finish lesson'
                : 'Finish this exercise to continue'}
            </button>
            {alreadyDone && <span className="text-xs text-parchment-400">Already completed</span>}
          </div>
        )}

        <p className="mt-3 text-xs text-parchment-400">
          Beat {Math.min(visible, lesson.beats.length)} of {lesson.beats.length}
        </p>
      </div>
    </article>
  )
}
