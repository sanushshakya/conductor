import type { AtlasTool } from '@conductor/shared'

/**
 * Lays the Tool Atlas out as bands, one per category.
 *
 * The owner asked for "all the tools, listed". A list is the wrong shape for
 * that question: it implies you need all of them, and it gives no way to tell
 * what to do first. Bands with an explicit verdict on each tool answer the
 * question a beginner actually has — *which of these do I need, and when?*
 *
 * Deterministic by construction: no randomness and no force simulation, so the
 * map looks the same every time it is opened. A layout that shuffles makes it
 * impossible to build a mental picture of it.
 */

export const ATLAS_CATEGORIES = [
  'languages',
  'databases',
  'backend',
  'frontend',
  'ai-agents',
  'cloud-deploy',
  'devops',
] as const

export type AtlasCategory = (typeof ATLAS_CATEGORIES)[number]

export const CATEGORY_LABEL: Record<AtlasCategory, string> = {
  languages: 'Languages',
  databases: 'Databases',
  backend: 'Backend',
  frontend: 'Frontend',
  'ai-agents': 'AI agents',
  'cloud-deploy': 'Cloud & deployment',
  devops: 'DevOps',
}

export const DEFAULT_CANVAS = { width: 900 }

const NODE_WIDTH = 164
const NODE_HEIGHT = 64
const GAP_X = 12
const GAP_Y = 12
const BAND_PADDING_TOP = 34
const BAND_PADDING_BOTTOM = 16
const CANVAS_PADDING = 16

export interface AtlasNode {
  id: string
  tool: AtlasTool
  x: number
  y: number
  width: number
  height: number
}

export interface AtlasGroup {
  category: AtlasCategory
  label: string
  y: number
  height: number
  nodeIds: string[]
}

export interface AtlasLayout {
  width: number
  height: number
  nodes: AtlasNode[]
  groups: AtlasGroup[]
}

export function layoutAtlas(tools: AtlasTool[], canvasWidth = DEFAULT_CANVAS.width): AtlasLayout {
  const usableWidth = canvasWidth - CANVAS_PADDING * 2
  const perRow = Math.max(1, Math.floor((usableWidth + GAP_X) / (NODE_WIDTH + GAP_X)))

  const nodes: AtlasNode[] = []
  const groups: AtlasGroup[] = []
  let cursorY = CANVAS_PADDING

  for (const category of ATLAS_CATEGORIES) {
    // Sorted by verdict then name: what to learn now appears first in every
    // band, so the map reads as advice rather than an inventory.
    const members = tools
      .filter((tool) => tool.category === category)
      .sort((a, b) => verdictRank(a.verdict) - verdictRank(b.verdict) || a.name.localeCompare(b.name))

    if (members.length === 0) continue

    const rows = Math.ceil(members.length / perRow)
    const bandHeight = BAND_PADDING_TOP + rows * NODE_HEIGHT + (rows - 1) * GAP_Y + BAND_PADDING_BOTTOM
    const nodeIds: string[] = []

    members.forEach((tool, index) => {
      const row = Math.floor(index / perRow)
      const column = index % perRow
      nodes.push({
        id: tool.id,
        tool,
        x: CANVAS_PADDING + column * (NODE_WIDTH + GAP_X),
        y: cursorY + BAND_PADDING_TOP + row * (NODE_HEIGHT + GAP_Y),
        width: NODE_WIDTH,
        height: NODE_HEIGHT,
      })
      nodeIds.push(tool.id)
    })

    groups.push({ category, label: CATEGORY_LABEL[category], y: cursorY, height: bandHeight, nodeIds })
    cursorY += bandHeight
  }

  return {
    width: canvasWidth,
    height: cursorY + CANVAS_PADDING,
    nodes,
    groups,
  }
}

function verdictRank(verdict: AtlasTool['verdict']): number {
  return verdict === 'learn-now' ? 0 : verdict === 'later' ? 1 : 2
}
