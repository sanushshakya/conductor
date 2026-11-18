import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Lesson } from '@conductor/shared'
import { LessonPlayer } from './LessonPlayer'
import { useProfile } from '../store/useProfile'
import { freshProfile } from '@conductor/shared'
import '@conductor/core/grading/graders'
import '../visualizers'

function lesson(overrides: Partial<Lesson> = {}): Lesson {
  return {
    id: 'test.1',
    track: 'boot',
    title: 'A test lesson',
    estimateMinutes: 3,
    beats: [
      { kind: 'prose', body: 'First beat.' },
      {
        kind: 'quiz',
        exercise: {
          id: 'test-quiz',
          prompt: 'Pick the right one.',
          solution: '[0]',
          hints: ['First nudge.', 'Second nudge.', 'Worked example.'],
          grader: { kind: 'quiz', question: 'Which?', options: ['Right', 'Wrong'], correct: [0] },
        },
      },
      { kind: 'prose', body: 'Final beat.' },
    ],
    ...overrides,
  }
}

beforeEach(() => {
  useProfile.setState({
    profile: freshProfile('2026-11-18T00:00:00.000Z'),
    loaded: true,
    pendingBadges: [],
  })
})

test('shows only the first beat initially', () => {
  render(<LessonPlayer lesson={lesson()} onFinished={() => {}} />)
  expect(screen.getByText('First beat.')).toBeInTheDocument()
  expect(screen.queryByText('Final beat.')).not.toBeInTheDocument()
})

test('a prose beat can be continued past without doing anything', async () => {
  render(<LessonPlayer lesson={lesson()} onFinished={() => {}} />)
  await userEvent.click(screen.getByRole('button', { name: /continue/i }))
  expect(screen.getByRole('button', { name: 'Right' })).toBeInTheDocument()
})

test('LessonPlayer advances only when the current beat is satisfied', async () => {
  render(<LessonPlayer lesson={lesson()} onFinished={() => {}} />)
  await userEvent.click(screen.getByRole('button', { name: /continue/i }))

  // The quiz is unanswered: the advance control refuses and says why.
  const blocked = screen.getByRole('button', { name: /finish this exercise to continue/i })
  expect(blocked).toBeDisabled()

  await userEvent.click(screen.getByRole('button', { name: 'Right' }))
  await userEvent.click(screen.getByRole('button', { name: /check my answer/i }))

  await waitFor(() => {
    expect(screen.getByRole('button', { name: /^continue$/i })).toBeEnabled()
  })
})

test('a wrong answer does not unlock the next beat', async () => {
  render(<LessonPlayer lesson={lesson()} onFinished={() => {}} />)
  await userEvent.click(screen.getByRole('button', { name: /continue/i }))
  await userEvent.click(screen.getByRole('button', { name: 'Wrong' }))
  await userEvent.click(screen.getByRole('button', { name: /check my answer/i }))

  await waitFor(() => expect(screen.getByText('Not that one')).toBeInTheDocument())
  expect(screen.getByRole('button', { name: /finish this exercise to continue/i })).toBeDisabled()
  expect(screen.queryByText('Final beat.')).not.toBeInTheDocument()
})

test('finishing the last beat reports the lesson complete', async () => {
  const finished: (string | undefined)[] = []
  render(
    <LessonPlayer
      lesson={lesson({ beats: [{ kind: 'prose', body: 'Only beat.' }] })}
      onFinished={(next) => finished.push(next)}
    />,
  )
  await userEvent.click(screen.getByRole('button', { name: /finish lesson/i }))
  await waitFor(() => expect(finished).toHaveLength(1))
  expect(useProfile.getState().profile.completedLessons).toContain('test.1')
})

test('a completed lesson reopens with every beat visible', () => {
  useProfile.setState({
    profile: { ...freshProfile('2026-11-18T00:00:00.000Z'), completedLessons: ['test.1'] },
    loaded: true,
    pendingBadges: [],
  })
  render(<LessonPlayer lesson={lesson()} onFinished={() => {}} />)
  expect(screen.getByText('Final beat.')).toBeInTheDocument()
})

test('the beat counter reports position within the lesson', () => {
  render(<LessonPlayer lesson={lesson()} onFinished={() => {}} />)
  expect(screen.getByText('Beat 1 of 3')).toBeInTheDocument()
})

test('objectives are listed in the header', () => {
  render(<LessonPlayer lesson={lesson({ objectives: ['Do the thing'] })} onFinished={() => {}} />)
  expect(screen.getByText('Do the thing')).toBeInTheDocument()
})

test('editing the code clears the previous run output', async () => {
  const codeLesson = lesson({
    beats: [
      {
        kind: 'code',
        language: 'python',
        exercise: {
          id: 'test-code',
          prompt: 'Print hi.',
          starter: 'print(oops)',
          solution: 'print("hi")',
          hints: ['a', 'b', 'c'],
          grader: { kind: 'output-match', cases: [{ expected: 'hi' }] },
        },
      },
    ],
  })
  render(<LessonPlayer lesson={codeLesson} onFinished={() => {}} />)

  await userEvent.click(screen.getByRole('button', { name: /^run$/i }))
  expect(await screen.findByText(/NameError/)).toBeInTheDocument()

  const editor = screen.getByRole('textbox', { name: /code editor/i })
  await userEvent.clear(editor)
  expect(screen.queryByText(/NameError/)).not.toBeInTheDocument()
})

test('a passing code exercise unlocks the lesson', async () => {
  const codeLesson = lesson({
    beats: [
      {
        kind: 'code',
        language: 'python',
        exercise: {
          id: 'test-code-2',
          prompt: 'Print hi.',
          starter: '',
          solution: 'print("hi")',
          hints: ['a', 'b', 'c'],
          grader: { kind: 'output-match', cases: [{ expected: 'hi' }] },
        },
      },
    ],
  })
  render(<LessonPlayer lesson={codeLesson} onFinished={() => {}} />)
  await userEvent.type(screen.getByRole('textbox', { name: /code editor/i }), 'print("hi")')
  await userEvent.click(screen.getByRole('button', { name: /check my answer/i }))
  await waitFor(() =>
    expect(screen.getByRole('button', { name: /finish lesson/i })).toBeEnabled(),
  )
})

test('Track 0 code exercises still grade when no Python engine is available', async () => {
  // The browser host reports the sidecar absent. Boot's interpreter must pick
  // this up, or the first ten minutes of the course stop working.
  const codeLesson = lesson({
    beats: [
      {
        kind: 'code',
        language: 'python',
        exercise: {
          id: 'offline-code',
          prompt: 'Print hi.',
          starter: '',
          solution: 'print("hi")',
          hints: ['a', 'b', 'c'],
          grader: { kind: 'output-match', cases: [{ expected: 'hi' }] },
        },
      },
    ],
  })
  render(<LessonPlayer lesson={codeLesson} onFinished={() => {}} />)
  await userEvent.type(screen.getByRole('textbox', { name: /code editor/i }), 'print("hi")')
  await userEvent.click(screen.getByRole('button', { name: /check my answer/i }))
  await waitFor(() => expect(screen.getByRole('button', { name: /finish lesson/i })).toBeEnabled())
})

test('a real crash is reported, not retried against the Boot interpreter', async () => {
  const codeLesson = lesson({
    beats: [
      {
        kind: 'code',
        language: 'python',
        exercise: {
          id: 'offline-crash',
          prompt: 'Print hi.',
          starter: 'print(missing)',
          solution: 'print("hi")',
          hints: ['a', 'b', 'c'],
          grader: { kind: 'output-match', cases: [{ expected: 'hi' }] },
        },
      },
    ],
  })
  render(<LessonPlayer lesson={codeLesson} onFinished={() => {}} />)
  await userEvent.click(screen.getByRole('button', { name: /^run$/i }))
  expect(await screen.findByText(/NameError/)).toBeInTheDocument()
})
