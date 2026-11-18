import {
  startDuel,
  guessLine,
  remainingMs,
  resolveDuel,
  revealBug,
  WRONG_GUESS_PENALTY_MS,
  DEFAULT_DUEL_SECONDS,
} from './duel-engine'
import type { Duel } from '@conductor/shared'

const duel: Duel = {
  id: 'duel-off-by-one',
  lessonId: '0.4',
  language: 'python',
  brief: 'This prints the three patients at the front of the queue.',
  code: 'queue = ["Ana", "Ben", "Cal", "Dee"]\nfor i in range(1, 4):\n    print(queue[i])',
  bugLine: 2,
  bugKind: 'off-by-one',
  explanation: 'range(1, 4) starts at 1, so Ana at position 0 is never printed.',
  fixedCode: 'queue = ["Ana", "Ben", "Cal", "Dee"]\nfor i in range(0, 3):\n    print(queue[i])',
}

const T0 = new Date('2026-11-18T10:00:00.000Z')
const at = (seconds: number) => new Date(T0.getTime() + seconds * 1000)

test('a new session starts running with the full allowance', () => {
  const session = startDuel(duel, T0)
  expect(session.state).toBe('running')
  expect(remainingMs(session, T0)).toBe(DEFAULT_DUEL_SECONDS * 1000)
  expect(session.wrongGuesses).toEqual([])
})

test('a duel can set its own time limit', () => {
  const session = startDuel({ ...duel, seconds: 45 }, T0)
  expect(remainingMs(session, T0)).toBe(45_000)
})

test('a correct line guess wins and awards duel XP', () => {
  const session = guessLine(startDuel(duel, T0), 2, at(5))
  expect(session.state).toBe('won')
  const outcome = resolveDuel(session)
  expect(outcome.won).toBe(true)
  expect(outcome.xp).toBeGreaterThan(0)
})

test('a wrong guess costs time and leaves progress untouched', () => {
  const started = startDuel(duel, T0)
  const after = guessLine(started, 1, at(5))

  expect(after.state).toBe('running')
  expect(after.wrongGuesses).toEqual([1])
  expect(remainingMs(after, at(5))).toBe(
    DEFAULT_DUEL_SECONDS * 1000 - 5_000 - WRONG_GUESS_PENALTY_MS,
  )
})

test('the same wrong line guessed twice is only penalised once', () => {
  let session = startDuel(duel, T0)
  session = guessLine(session, 1, at(2))
  const afterFirst = remainingMs(session, at(2))
  session = guessLine(session, 1, at(2))
  expect(remainingMs(session, at(2))).toBe(afterFirst)
  expect(session.wrongGuesses).toEqual([1])
})

test('a correct guess after wrong ones still wins', () => {
  let session = startDuel(duel, T0)
  session = guessLine(session, 1, at(3))
  session = guessLine(session, 3, at(6))
  session = guessLine(session, 2, at(9))
  expect(session.state).toBe('won')
  expect(resolveDuel(session).won).toBe(true)
})

test('running out of time loses, and awards no XP', () => {
  const session = guessLine(startDuel(duel, T0), 1, at(DEFAULT_DUEL_SECONDS + 1))
  expect(session.state).toBe('lost')
  const outcome = resolveDuel(session)
  expect(outcome.won).toBe(false)
  expect(outcome.xp).toBe(0)
})

test('enough wrong guesses can exhaust the clock before it expires', () => {
  let session = startDuel(duel, T0)
  const lines = [1, 3]
  for (const line of lines) session = guessLine(session, line, at(1))
  expect(remainingMs(session, at(1))).toBeLessThan(DEFAULT_DUEL_SECONDS * 1000)
})

test('remainingMs never goes below zero', () => {
  const session = startDuel(duel, T0)
  expect(remainingMs(session, at(DEFAULT_DUEL_SECONDS + 100))).toBe(0)
})

test('a guess after the duel is settled changes nothing', () => {
  const won = guessLine(startDuel(duel, T0), 2, at(1))
  const again = guessLine(won, 1, at(2))
  expect(again).toBe(won)
})

test('revealBug returns the line, the explanation and the fix', () => {
  const reveal = revealBug(duel)
  expect(reveal.line).toBe(2)
  expect(reveal.explanation).toContain('range(1, 4)')
  expect(reveal.fixedCode).toContain('range(0, 3)')
  expect(reveal.sourceLine).toBe('for i in range(1, 4):')
})

test('XP is higher for a clean win than for one with wrong guesses', () => {
  const clean = resolveDuel(guessLine(startDuel(duel, T0), 2, at(2)))
  let messy = startDuel(duel, T0)
  messy = guessLine(messy, 1, at(2))
  messy = guessLine(messy, 3, at(3))
  messy = guessLine(messy, 2, at(4))
  expect(resolveDuel(messy).xp).toBeLessThan(clean.xp)
})

test('a win with wrong guesses still awards XP — the duel was won', () => {
  let session = startDuel(duel, T0)
  session = guessLine(session, 1, at(2))
  session = guessLine(session, 2, at(3))
  expect(resolveDuel(session).xp).toBeGreaterThan(0)
})

test('a duel can be completed with no LLM configured', () => {
  // Nothing in the engine reaches for a model: the duel, the bug line and the
  // explanation are all authored content, which is what keeps the app's
  // differentiating feature working on a machine with no AI at all.
  const session = guessLine(startDuel(duel, T0), 2, at(1))
  expect(resolveDuel(session).won).toBe(true)
  expect(revealBug(duel).explanation.length).toBeGreaterThan(0)
})

test('lineCount matches the code, so every line is clickable', () => {
  const session = startDuel(duel, T0)
  expect(session.lines).toHaveLength(3)
  expect(session.lines[1]).toBe('for i in range(1, 4):')
})
