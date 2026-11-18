import { layoutAtlas, ATLAS_CATEGORIES, DEFAULT_CANVAS } from './atlas-layout'
import { atlas, tracks } from '../content'
import type { AtlasTool } from '@conductor/shared'

test('layoutAtlas is deterministic for the same input', () => {
  const a = layoutAtlas(atlas)
  const b = layoutAtlas(atlas)
  expect(a.nodes.map((n) => [n.id, n.x, n.y])).toEqual(b.nodes.map((n) => [n.id, n.x, n.y]))
})

test('every tool gets exactly one node', () => {
  const layout = layoutAtlas(atlas)
  expect(layout.nodes).toHaveLength(atlas.length)
  expect(new Set(layout.nodes.map((n) => n.id)).size).toBe(atlas.length)
})

test('no two nodes overlap at the default canvas size', () => {
  const { nodes } = layoutAtlas(atlas)
  for (let i = 0; i < nodes.length; i += 1) {
    for (let j = i + 1; j < nodes.length; j += 1) {
      const a = nodes[i]!
      const b = nodes[j]!
      const separated =
        a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y
      expect(separated, `${a.id} overlaps ${b.id}`).toBe(true)
    }
  }
})

test('every node stays inside the canvas', () => {
  const layout = layoutAtlas(atlas)
  for (const node of layout.nodes) {
    expect(node.x).toBeGreaterThanOrEqual(0)
    expect(node.y).toBeGreaterThanOrEqual(0)
    expect(node.x + node.width).toBeLessThanOrEqual(layout.width)
    expect(node.y + node.height).toBeLessThanOrEqual(layout.height)
  }
})

test('tools are clustered with others of their category', () => {
  const layout = layoutAtlas(atlas)
  for (const group of layout.groups) {
    const ys = group.nodeIds.map((id) => layout.nodes.find((n) => n.id === id)!.y)
    // Every member sits within its group's band.
    for (const y of ys) {
      expect(y).toBeGreaterThanOrEqual(group.y)
      expect(y).toBeLessThan(group.y + group.height)
    }
  }
})

test('atlas covers all seven categories', () => {
  const present = new Set(atlas.map((t) => t.category))
  for (const category of ATLAS_CATEGORIES) {
    expect(present, `no tools in ${category}`).toContain(category)
  }
  expect(ATLAS_CATEGORIES).toHaveLength(7)
})

test('every tool tagged learn-now maps to a real track or lesson id', () => {
  const lessonIds = new Set(tracks.flatMap((t) => t.lessons.map((l) => l.id)))
  const trackIds = new Set(tracks.map((t) => t.track))

  for (const tool of atlas.filter((t) => t.verdict === 'learn-now')) {
    const hasPointer = Boolean(tool.lessonId || tool.trackId)
    expect(hasPointer, `${tool.id} is learn-now but points nowhere`).toBe(true)
    if (tool.lessonId) expect(lessonIds, `${tool.id}`).toContain(tool.lessonId)
    if (tool.trackId) expect(trackIds, `${tool.id}`).toContain(tool.trackId)
  }
})

test('every tool has a one-line rationale and a verification date', () => {
  for (const tool of atlas) {
    expect(tool.why.length).toBeGreaterThan(10)
    expect(tool.verifiedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  }
})

test('an empty atlas produces an empty layout rather than throwing', () => {
  expect(layoutAtlas([]).nodes).toEqual([])
})

test('a single oversized category still lays out without overlap', () => {
  const many: AtlasTool[] = Array.from({ length: 24 }, (_, i) => ({
    id: `tool-${i}`,
    name: `Tool ${i}`,
    category: 'languages',
    verdict: 'later',
    why: 'A synthetic tool used to stress the layout algorithm.',
    verifiedOn: '2026-11-18',
  }))
  const { nodes } = layoutAtlas(many, DEFAULT_CANVAS.width)
  for (let i = 0; i < nodes.length; i += 1) {
    for (let j = i + 1; j < nodes.length; j += 1) {
      const a = nodes[i]!
      const b = nodes[j]!
      const separated =
        a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y
      expect(separated).toBe(true)
    }
  }
})
