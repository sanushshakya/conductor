import { render, screen } from '@testing-library/react'
import { getVisualizer, registeredVisualizers } from './index'
import { tracks } from '../content'

test('every visual beat id in content resolves to a registered visualizer', () => {
  const used = new Set<string>()
  for (const track of tracks) {
    for (const lesson of track.lessons) {
      for (const beat of lesson.beats) {
        if (beat.kind === 'visual') used.add(beat.visualizer)
      }
    }
  }
  expect(used.size).toBeGreaterThan(0)
  for (const id of used) {
    expect(registeredVisualizers(), `content references "${id}"`).toContain(id)
  }
})

test('the five named visualizers are registered', () => {
  expect(registeredVisualizers().sort()).toEqual(
    ['er-builder', 'http-trace', 'instruction-tape', 'join-animator', 'loop-tracer'].sort(),
  )
})

test('an unknown visualizer renders a placeholder rather than crashing', () => {
  const Unknown = getVisualizer('not-a-real-visualizer')
  render(<Unknown config={{}} />)
  expect(screen.getByText(/still being drawn/i)).toBeInTheDocument()
})
