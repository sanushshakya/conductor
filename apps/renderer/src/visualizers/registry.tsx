import type { ComponentType } from 'react'

export interface VisualizerProps {
  config: Record<string, unknown>
  onComplete?: () => void
}

const registry = new Map<string, ComponentType<VisualizerProps>>()

export function registerVisualizer(id: string, component: ComponentType<VisualizerProps>): void {
  registry.set(id, component)
}

export function registeredVisualizers(): string[] {
  return [...registry.keys()]
}

/**
 * A visual beat names its visualizer by id. A missing one is an authoring
 * error, and it renders as a visible placeholder rather than a crash — a
 * learner losing the whole lesson to one missing diagram is the worse outcome.
 * The harness asserts every id in content resolves, so this should never ship.
 */
export function getVisualizer(id: string): ComponentType<VisualizerProps> {
  return (
    registry.get(id) ??
    (() => (
      <div className="rounded-lg border border-dashed border-ink-600 px-4 py-6 text-center text-sm text-parchment-400">
        This diagram is still being drawn.
      </div>
    ))
  )
}
