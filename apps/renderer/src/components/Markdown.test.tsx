import { render, screen } from '@testing-library/react'
import { Markdown } from './Markdown'

test('renders bold', () => {
  render(<Markdown text="a **program** runs" />)
  expect(screen.getByText('program').tagName).toBe('STRONG')
})

test('renders italics rather than leaving asterisks visible', () => {
  render(<Markdown text="it means *this is what I did*" />)
  expect(screen.getByText('this is what I did').tagName).toBe('EM')
  expect(screen.queryByText(/\*/)).not.toBeInTheDocument()
})

test('renders inline code', () => {
  render(<Markdown text="use `str()` here" />)
  expect(screen.getByText('str()').tagName).toBe('CODE')
})

test('bold wins over italics for a doubled asterisk', () => {
  render(<Markdown text="**really**" />)
  expect(screen.getByText('really').tagName).toBe('STRONG')
})

test('renders an indented block as code', () => {
  const { container } = render(<Markdown text={'text\n\n    print(1)\n    print(2)\n'} />)
  expect(container.querySelector('pre code')?.textContent).toBe('print(1)\nprint(2)')
})

test('renders a bulleted list', () => {
  const { container } = render(<Markdown text={'- one\n- two'} />)
  expect(container.querySelectorAll('ul li')).toHaveLength(2)
})

test('does not render raw HTML from content', () => {
  const { container } = render(<Markdown text={'<img src=x onerror=alert(1)>'} />)
  expect(container.querySelector('img')).toBeNull()
  expect(container.textContent).toContain('<img')
})

test('an unmatched asterisk is left as text, not swallowed', () => {
  render(<Markdown text="2 * 3 is six" />)
  expect(screen.getByText('2 * 3 is six')).toBeInTheDocument()
})
