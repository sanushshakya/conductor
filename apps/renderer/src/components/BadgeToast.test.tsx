import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { freshProfile } from '@conductor/shared'
import { BadgeToast } from './BadgeToast'
import { useProfile } from '../store/useProfile'

function setPending(ids: string[]) {
  useProfile.setState({
    profile: freshProfile('2026-11-18T00:00:00.000Z'),
    loaded: true,
    pendingBadges: ids,
  })
}

test('shows nothing when no badge is pending', () => {
  setPending([])
  const { container } = render(<BadgeToast />)
  expect(container.textContent).toBe('')
})

test('announces a newly earned badge by title and description', () => {
  setPending(['first-blood'])
  render(<BadgeToast />)
  expect(screen.getByText('First Blood')).toBeInTheDocument()
  expect(screen.getByText(/made a program do what you wanted/i)).toBeInTheDocument()
})

test('announces several badges at once', () => {
  setPending(['first-blood', 'bug-hunter'])
  render(<BadgeToast />)
  expect(screen.getByText('First Blood')).toBeInTheDocument()
  expect(screen.getByText('Bug Hunter')).toBeInTheDocument()
})

test('ignores an unknown badge id rather than rendering a blank card', () => {
  setPending(['not-a-real-badge'])
  const { container } = render(<BadgeToast />)
  expect(container.textContent).toBe('')
})

test('clicking acknowledges it', async () => {
  setPending(['first-blood'])
  render(<BadgeToast />)
  await userEvent.click(screen.getByText('First Blood'))
  expect(useProfile.getState().pendingBadges).toEqual([])
})

test('uses a status role so it is announced to screen readers', () => {
  setPending(['first-blood'])
  render(<BadgeToast />)
  expect(screen.getByRole('status')).toBeInTheDocument()
})
