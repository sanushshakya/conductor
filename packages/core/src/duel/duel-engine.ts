import type { Duel } from '@conductor/shared'

/**
 * The Agent Duel.
 *
 * This is the product's whole thesis, made into a game. The mentor presents
 * code that is plausible, well-formatted, and wrong in exactly one place — the
 * way an AI agent's output is wrong — and the learner has to find it against a
 * clock.
 *
 * Two design decisions carry the pedagogy:
 *
 *   * **Wrong guesses cost time, never progress.** Nothing is lost by being
 *     wrong, so guessing is cheap and looking carefully is rewarded. A scheme
 *     that deducted points would teach caution about clicking, which is not
 *     the skill.
 *   * **Losing still reveals the bug.** The explanation is the lesson; running
 *     out of time must not withhold it.
 *
 * Everything here is pure and authored — no model is consulted — which is why
 * the differentiating feature works on a machine with no AI configured.
 */

export const DEFAULT_DUEL_SECONDS = 90
export const WRONG_GUESS_PENALTY_MS = 10_000

const BASE_XP = 40
const CLEAN_WIN_BONUS = 10
const PENALTY_PER_WRONG_GUESS = 5
const MIN_WIN_XP = 10

export interface DuelSession {
  duel: Duel
  startedAtMs: number
  /** Total time allowed, already reduced by wrong-guess penalties. */
  allowanceMs: number
  /** Distinct wrong lines, in the order they were tried. */
  wrongGuesses: number[]
  lines: string[]
  state: 'running' | 'won' | 'lost'
}

export function startDuel(duel: Duel, now: Date): DuelSession {
  return {
    duel,
    startedAtMs: now.getTime(),
    allowanceMs: (duel.seconds ?? DEFAULT_DUEL_SECONDS) * 1000,
    wrongGuesses: [],
    lines: duel.code.replace(/\n$/, '').split('\n'),
    state: 'running',
  }
}

export function remainingMs(session: DuelSession, now: Date): number {
  const elapsed = now.getTime() - session.startedAtMs
  return Math.max(0, session.allowanceMs - elapsed)
}

/**
 * Records a guess at the buggy line.
 *
 * Returns the same session object untouched when the duel is already settled,
 * so a stray click after the result cannot alter it.
 */
export function guessLine(session: DuelSession, line: number, now: Date): DuelSession {
  if (session.state !== 'running') return session

  if (remainingMs(session, now) <= 0) {
    return { ...session, state: 'lost' }
  }

  if (line === session.duel.bugLine) {
    return { ...session, state: 'won' }
  }

  // Guessing the same wrong line twice is a misclick, not a second mistake.
  if (session.wrongGuesses.includes(line)) return session

  return {
    ...session,
    wrongGuesses: [...session.wrongGuesses, line],
    allowanceMs: Math.max(0, session.allowanceMs - WRONG_GUESS_PENALTY_MS),
  }
}

/** Marks a duel lost because the clock ran out while nothing was happening. */
export function expireDuel(session: DuelSession, now: Date): DuelSession {
  if (session.state !== 'running') return session
  return remainingMs(session, now) <= 0 ? { ...session, state: 'lost' } : session
}

export interface DuelOutcome {
  won: boolean
  xp: number
  wrongGuesses: number
}

export function resolveDuel(session: DuelSession): DuelOutcome {
  if (session.state !== 'won') {
    return { won: false, xp: 0, wrongGuesses: session.wrongGuesses.length }
  }

  const penalty = session.wrongGuesses.length * PENALTY_PER_WRONG_GUESS
  const bonus = session.wrongGuesses.length === 0 ? CLEAN_WIN_BONUS : 0
  return {
    won: true,
    // A win is always worth something: the learner found the bug, which is the
    // thing being taught, however many lines they tried first.
    xp: Math.max(MIN_WIN_XP, BASE_XP + bonus - penalty),
    wrongGuesses: session.wrongGuesses.length,
  }
}

export interface DuelReveal {
  line: number
  sourceLine: string
  explanation: string
  fixedCode: string
  bugKind: string
}

/** The teaching payload. Shown on a win and on a loss alike. */
export function revealBug(duel: Duel): DuelReveal {
  const lines = duel.code.replace(/\n$/, '').split('\n')
  return {
    line: duel.bugLine,
    sourceLine: lines[duel.bugLine - 1] ?? '',
    explanation: duel.explanation,
    fixedCode: duel.fixedCode,
    bugKind: duel.bugKind,
  }
}
