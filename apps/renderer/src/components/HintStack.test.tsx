import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HintStack } from './HintStack'

const hints = ['What does the error say?', 'Types must match.', 'Use str(hour).']

test('reveals nothing until asked', () => {
  render(<HintStack hints={hints} />)
  expect(screen.queryByText(hints[0]!)).not.toBeInTheDocument()
})

test('HintStack reveals one tier at a time and never skips to the solution', async () => {
  render(<HintStack hints={hints} />)

  await userEvent.click(screen.getByRole('button', { name: /give me a nudge/i }))
  expect(screen.getByText(hints[0]!)).toBeInTheDocument()
  expect(screen.queryByText(hints[2]!)).not.toBeInTheDocument()

  await userEvent.click(screen.getByRole('button', { name: /name what i am missing/i }))
  expect(screen.getByText(hints[1]!)).toBeInTheDocument()
  expect(screen.queryByText(hints[2]!)).not.toBeInTheDocument()

  await userEvent.click(screen.getByRole('button', { name: /show me a worked example/i }))
  expect(screen.getByText(hints[2]!)).toBeInTheDocument()
})

test('offers no further button once every hint is shown', async () => {
  render(<HintStack hints={hints} />)
  for (const name of [/give me a nudge/i, /name what i am missing/i, /show me a worked example/i]) {
    await userEvent.click(screen.getByRole('button', { name }))
  }
  expect(screen.queryByRole('button')).not.toBeInTheDocument()
  expect(screen.getByText(/that is every hint/i)).toBeInTheDocument()
})
