import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { freshProfile, type Boss } from '@conductor/shared'
import { BossPlayer } from './BossPlayer'
import { useProfile } from '../store/useProfile'
import '@conductor/core/grading/graders'

function boss(): Boss {
  return {
    id: 'test-boss',
    track: 'boot',
    title: 'Boss: A test project',
    brief: 'Two criteria.',
    estimateMinutes: 20,
    criteria: [
      {
        id: 'one',
        label: 'The first criterion',
        exercise: {
          id: 'boss-ex-1',
          prompt: 'Print one.',
          starter: '',
          solution: 'print(1)',
          hints: ['a', 'b', 'c'],
          grader: { kind: 'output-match', cases: [{ expected: '1' }] },
        },
      },
      {
        id: 'two',
        label: 'The second criterion',
        exercise: {
          id: 'boss-ex-2',
          prompt: 'Print two.',
          starter: '',
          solution: 'print(2)',
          hints: ['a', 'b', 'c'],
          grader: { kind: 'output-match', cases: [{ expected: '2' }] },
        },
      },
    ],
  }
}

beforeEach(() => {
  useProfile.setState({
    profile: freshProfile('2026-11-18T00:00:00.000Z'),
    loaded: true,
    pendingBadges: [],
  })
})

test('renders the brief and every criterion', () => {
  render(<BossPlayer boss={boss()} />)
  expect(screen.getByText('Two criteria.')).toBeInTheDocument()
  expect(screen.getByText('The first criterion')).toBeInTheDocument()
  expect(screen.getByText('The second criterion')).toBeInTheDocument()
})

test('the progress bar starts at zero of the real criterion count', () => {
  render(<BossPlayer boss={boss()} />)
  expect(screen.getByText('0 of 2 criteria passing')).toBeInTheDocument()
  expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuemax', '2')
})

test('passing one criterion advances the bar by exactly one', async () => {
  render(<BossPlayer boss={boss()} />)
  await userEvent.type(screen.getByRole('textbox', { name: /code editor/i }), 'print(1)')
  await userEvent.click(screen.getByRole('button', { name: /check my answer/i }))

  await waitFor(() => expect(screen.getByText('1 of 2 criteria passing')).toBeInTheDocument())
})

test('the boss is not cleared until every criterion passes', async () => {
  render(<BossPlayer boss={boss()} />)
  await userEvent.type(screen.getByRole('textbox', { name: /code editor/i }), 'print(1)')
  await userEvent.click(screen.getByRole('button', { name: /check my answer/i }))

  await waitFor(() => expect(screen.getByText('1 of 2 criteria passing')).toBeInTheDocument())
  expect(useProfile.getState().profile.completedBosses).toEqual([])
})

test('clearing every criterion completes the boss and awards boss XP', async () => {
  const finished: boolean[] = []
  render(<BossPlayer boss={boss()} onFinished={() => finished.push(true)} />)

  await userEvent.type(screen.getByRole('textbox', { name: /code editor/i }), 'print(1)')
  await userEvent.click(screen.getByRole('button', { name: /check my answer/i }))
  await waitFor(() => expect(screen.getByText('1 of 2 criteria passing')).toBeInTheDocument())

  await userEvent.click(screen.getByRole('button', { name: /the second criterion/i }))
  await userEvent.type(screen.getByRole('textbox', { name: /code editor/i }), 'print(2)')
  await userEvent.click(screen.getByRole('button', { name: /check my answer/i }))

  await waitFor(() =>
    expect(useProfile.getState().profile.completedBosses).toEqual(['test-boss']),
  )
  expect(useProfile.getState().profile.xp).toBeGreaterThanOrEqual(250)
  expect(finished).toHaveLength(1)
})

test('criteria can be collapsed and reopened', async () => {
  render(<BossPlayer boss={boss()} />)
  const header = screen.getByRole('button', { name: /the first criterion/i })
  expect(header).toHaveAttribute('aria-expanded', 'true')
  await userEvent.click(header)
  expect(header).toHaveAttribute('aria-expanded', 'false')
})

test('a boss web criterion gets the editors and starters it declared', async () => {
  // The schema, the harness and the grader all honour `criterion.web`. The UI
  // ignoring it made two whole boss projects impossible to complete, because
  // the learner saw empty editors and the grader checked markup they were
  // never shown.
  const webBoss: Boss = {
    id: 'web-boss',
    track: 'web',
    title: 'Boss: A web project',
    brief: 'One criterion.',
    estimateMinutes: 10,
    criteria: [
      {
        id: 'only',
        label: 'Builds the list',
        web: {
          editors: ['html', 'js'],
          starterHtml: '<ul id="board"></ul>',
          starterJs: '// write your loop here',
        },
        exercise: {
          id: 'web-boss-ex',
          prompt: 'Add one item.',
          solution: 'document.querySelector("#board").innerHTML = "<li>Ana</li>"',
          hints: ['a', 'b', 'c'],
          grader: {
            kind: 'html-structure',
            expect: [{ selector: '#board li', label: 'One item', count: 1 }],
          },
        },
      },
    ],
  }

  render(<BossPlayer boss={webBoss} />)

  // Both declared editors are present…
  expect(screen.getByRole('button', { name: 'HTML' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'JavaScript' })).toBeInTheDocument()

  // …and the HTML editor holds the starter the criterion supplied, not the
  // exercise's (absent) one.
  expect(screen.getByRole('textbox', { name: /HTML editor/i })).toHaveValue(
    '<ul id="board"></ul>',
  )
})
