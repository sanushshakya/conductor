import { render, screen } from '@testing-library/react'
import { createRef } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PreviewFrame, type PreviewHandle } from './PreviewFrame'

vi.mock('./preview-host', async () => {
  const actual = await vi.importActual<typeof import('./preview-host')>('./preview-host')
  return { ...actual, previewUrl: vi.fn(() => null as string | null) }
})

const { previewUrl } = await import('./preview-host')

afterEach(() => vi.mocked(previewUrl).mockReset())

describe('PreviewFrame without a preview origin', () => {
  it('explains the web track is unavailable instead of showing an empty frame', () => {
    vi.mocked(previewUrl).mockReturnValue(null)

    render(<PreviewFrame />)

    expect(screen.queryByTitle('Your page')).toBeNull()
    expect(screen.getByRole('status').textContent).toMatch(/desktop app/i)
  })

  it('rejects a render rather than resolving with an empty page', async () => {
    vi.mocked(previewUrl).mockReturnValue(null)
    const ref = createRef<PreviewHandle>()

    render(<PreviewFrame ref={ref} />)

    await expect(ref.current!.render({ html: '<p>hi</p>' })).rejects.toThrow(/not available/i)
  })

  it('renders the frame when an origin exists', () => {
    vi.mocked(previewUrl).mockReturnValue('https://preview.example/preview.html')

    render(<PreviewFrame />)

    expect(screen.getByTitle('Your page')).toHaveAttribute(
      'src',
      'https://preview.example/preview.html',
    )
  })
})
