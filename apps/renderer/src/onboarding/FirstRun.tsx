import { motion } from 'framer-motion'
import { CONDUCTOR_NAME } from '@conductor/shared'

/**
 * The first screen.
 *
 * One idea, one button. No account, no setup wizard, no tour. The learner is
 * eighteen and has been put off programming once already — anything that
 * stands between opening the app and running something is a chance to lose
 * them, and the product's first goal is measured in minutes.
 */
export function FirstRun({ onStart }: { onStart(): void }) {
  return (
    <div className="flex h-full items-center justify-center px-8">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
        className="max-w-xl"
      >
        <p className="mb-2 font-mono text-xs uppercase tracking-[0.2em] text-brass-500">
          {CONDUCTOR_NAME}
        </p>

        <h1 className="mb-5 text-3xl font-semibold leading-tight tracking-tight text-parchment-100">
          You cannot direct what you cannot read.
        </h1>

        <div className="lesson-prose mb-8">
          <p>
            AI writes most of the code now. That makes one skill scarce and
            valuable: being able to look at what it wrote and tell whether it is
            right.
          </p>
          <p>
            That is what this teaches. Programming from nothing, a real database,
            a real API — and at the end of every lesson, a piece of code an AI
            got wrong, for you to find.
          </p>
          <p className="text-parchment-400">
            No account. Nothing to install. Your first program runs in about five
            minutes.
          </p>
        </div>

        <button
          type="button"
          onClick={onStart}
          className="focus-ring rounded-md bg-brass-500 px-5 py-2.5 font-medium text-ink-950 transition-colors hover:bg-brass-400"
        >
          Start
        </button>
      </motion.div>
    </div>
  )
}
