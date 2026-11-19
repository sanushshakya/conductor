import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import type { Duel } from '@conductor/shared'
import {
  startDuel,
  guessLine,
  remainingMs,
  resolveDuel,
  revealBug,
  expireDuel,
  type DuelSession,
} from '@conductor/core'
import { Markdown } from '../components/Markdown'
import { useProfile } from '../store/useProfile'

interface Props {
  duel: Duel
  onFinished?(won: boolean): void
}

/**
 * The Agent Duel.
 *
 * Code that an agent could plausibly have written, one deliberate bug, and a
 * clock. The learner clicks the line they think is wrong.
 *
 * The clock is the only thing a wrong guess costs. That is the whole design:
 * clicking is cheap, so the learner actually engages instead of reading
 * passively — and a learner who runs out of time still gets the explanation,
 * because the explanation is the lesson and withholding it would be a
 * punishment that teaches nothing.
 */
export function DuelArena({ duel, onFinished }: Props) {
  const [session, setSession] = useState<DuelSession>(() => startDuel(duel, new Date()))
  const [now, setNow] = useState(() => new Date())
  const recordDuelWin = useProfile((s) => s.recordDuelWin)
  // A replay is for practice, not for XP: the bug's location is on screen by
  // the time the button appears.
  const alreadyWon = useProfile((s) => s.profile.duelsWonIds.includes(duel.id))
  const reported = useRef(false)

  useEffect(() => {
    setSession(startDuel(duel, new Date()))
    setNow(new Date())
    reported.current = false
  }, [duel])

  useEffect(() => {
    if (session.state !== 'running') return
    const timer = setInterval(() => {
      const current = new Date()
      setNow(current)
      setSession((s) => expireDuel(s, current))
    }, 250)
    return () => clearInterval(timer)
  }, [session.state])

  useEffect(() => {
    if (session.state === 'running' || reported.current) return
    reported.current = true
    const outcome = resolveDuel(session)
    if (outcome.won) void recordDuelWin(outcome.xp, duel.id)
    onFinished?.(outcome.won)
  }, [session, recordDuelWin, onFinished])

  const remaining = remainingMs(session, now)
  const totalMs = (duel.seconds ?? 90) * 1000
  const settled = session.state !== 'running'
  const outcome = resolveDuel(session)
  const reveal = revealBug(duel)

  return (
    <section className="rounded-xl border border-ink-700 bg-ink-850 p-5">
      <header className="mb-4">
        <div className="mb-2 flex items-center justify-between gap-4">
          <span className="font-mono text-[10px] uppercase tracking-wider text-brass-500">
            Agent Duel
          </span>
          <div className="flex items-center gap-3">
            {session.wrongGuesses.length > 0 && (
              <span className="font-mono text-[10px] text-wrong-400">
                −{session.wrongGuesses.length * 10}s
              </span>
            )}
            <span
              className={`font-mono text-sm tabular-nums ${
                remaining < 15_000 && !settled ? 'text-wrong-400' : 'text-parchment-300'
              }`}
              aria-label="Time remaining"
            >
              {Math.ceil(remaining / 1000)}s
            </span>
          </div>
        </div>

        <div className="h-0.5 w-full overflow-hidden rounded-full bg-ink-700">
          <motion.div
            className={remaining < 15_000 && !settled ? 'h-full bg-wrong-500' : 'h-full bg-brass-500'}
            animate={{ width: `${Math.max(0, (remaining / totalMs) * 100)}%` }}
            transition={{ ease: 'linear', duration: 0.25 }}
          />
        </div>

        <p className="mt-3 text-sm text-parchment-300">{duel.brief}</p>
        <p className="mt-1 text-xs text-parchment-400">
          {settled ? 'The bug is highlighted below.' : 'Click the line you think is wrong.'}
        </p>
      </header>

      <ol className="overflow-hidden rounded-lg border border-ink-700 bg-ink-950 font-mono text-sm">
        {session.lines.map((line, index) => {
          const lineNumber = index + 1
          const isBug = lineNumber === duel.bugLine
          const wasGuessedWrong = session.wrongGuesses.includes(lineNumber)

          const tone = settled
            ? isBug
              ? 'bg-verify-600/20 text-verify-400'
              : wasGuessedWrong
                ? 'bg-wrong-500/10 text-parchment-400'
                : 'text-parchment-300'
            : wasGuessedWrong
              ? 'bg-wrong-500/10 text-parchment-400 line-through decoration-wrong-500/40'
              : 'text-parchment-200 hover:bg-ink-800'

          return (
            <li key={index}>
              <button
                type="button"
                disabled={settled || wasGuessedWrong}
                onClick={() => setSession((s) => guessLine(s, lineNumber, new Date()))}
                className={`flex w-full items-start gap-3 px-3 py-1 text-left transition-colors ${tone} ${
                  settled ? 'cursor-default' : 'cursor-pointer'
                }`}
              >
                <span aria-hidden className="w-5 shrink-0 select-none text-right text-parchment-400/40">
                  {lineNumber}
                </span>
                <span className="whitespace-pre-wrap break-words">{line || ' '}</span>
                {settled && isBug && (
                  <span className="ml-auto shrink-0 text-[10px] uppercase">the bug</span>
                )}
              </button>
            </li>
          )
        })}
      </ol>

      {settled && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-4 space-y-3"
        >
          <div
            className={`rounded-lg border px-4 py-3 ${
              outcome.won
                ? 'border-verify-600/40 bg-verify-600/10'
                : 'border-ink-600 bg-ink-800'
            }`}
          >
            <p className={outcome.won ? 'text-verify-400' : 'text-parchment-200'}>
              {outcome.won
                ? alreadyWon
                  ? 'Found it. You have already won this one, so no XP this time.'
                  : session.wrongGuesses.length === 0
                    ? `Found it first time. +${outcome.xp} XP.`
                    : `Found it. +${outcome.xp} XP.`
                : 'Out of time. Here is what it was.'}
            </p>
          </div>

          <div className="rounded-lg border border-ink-700 bg-ink-900 px-4 py-3 text-sm">
            <div className="mb-2 font-mono text-[10px] uppercase tracking-wider text-brass-500">
              {reveal.bugKind.replace(/-/g, ' ')}
            </div>
            <Markdown text={reveal.explanation} />
          </div>

          <div>
            <div className="mb-1 text-xs uppercase tracking-wide text-parchment-400">Fixed</div>
            <pre className="overflow-x-auto rounded-lg border border-verify-600/30 bg-ink-950 px-4 py-3 font-mono text-sm text-parchment-200">
              {reveal.fixedCode.replace(/\n$/, '')}
            </pre>
          </div>

          <button
            type="button"
            onClick={() => {
              reported.current = false
              setSession(startDuel(duel, new Date()))
              setNow(new Date())
            }}
            className="focus-ring rounded-md border border-ink-600 px-3 py-1.5 text-xs text-parchment-300 transition-colors hover:border-parchment-400"
          >
            Try this one again
          </button>
        </motion.div>
      )}
    </section>
  )
}
