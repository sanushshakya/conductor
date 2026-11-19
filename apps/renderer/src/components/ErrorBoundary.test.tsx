import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { ErrorBoundary } from './ErrorBoundary'

function Boom({ explode }: { explode: boolean }): JSX.Element {
  if (explode) throw new Error('kaboom')
  return <p>working</p>
}

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

test('renders its children when nothing throws', () => {
  render(
    <ErrorBoundary>
      <Boom explode={false} />
    </ErrorBoundary>,
  )
  expect(screen.getByText('working')).toBeInTheDocument()
})

test('shows a plain message instead of a blank screen when a child throws', () => {
  render(
    <ErrorBoundary what="this lesson">
      <Boom explode />
    </ErrorBoundary>,
  )
  expect(screen.getByText(/this lesson stopped working/i)).toBeInTheDocument()
})

test('never shows the learner the error text or a stack trace', () => {
  const { container } = render(
    <ErrorBoundary>
      <Boom explode />
    </ErrorBoundary>,
  )
  expect(container.textContent).not.toMatch(/kaboom|Error:|at /)
})

test('reassures the learner their progress is safe', () => {
  render(
    <ErrorBoundary>
      <Boom explode />
    </ErrorBoundary>,
  )
  expect(screen.getByText(/progress is saved/i)).toBeInTheDocument()
})

test('Try again re-renders the children', async () => {
  function Harness() {
    const [explode, setExplode] = useState(true)
    return (
      <ErrorBoundary onReset={() => setExplode(false)}>
        <Boom explode={explode} />
      </ErrorBoundary>
    )
  }
  render(<Harness />)
  await userEvent.click(screen.getByRole('button', { name: /try again/i }))
  expect(screen.getByText('working')).toBeInTheDocument()
})
