/**
 * Conductor — shared contracts.
 *
 * This package is the single source of truth for every type that crosses a
 * process boundary (main ↔ preload ↔ renderer) or a file boundary (content
 * YAML → app). Nothing here may import from Electron, React, or Node — it is
 * consumed by all three and must stay portable.
 */

export const CONDUCTOR_VERSION = '0.1.0'

/** Shown in the title bar and the about panel. */
export const CONDUCTOR_NAME = 'Conductor'

/** The one-line promise, used on the first-run screen. */
export const CONDUCTOR_TAGLINE = 'Zero to developer, in the age of AI agents.'

export * from './domain'
export * from './capabilities'
export * from './progression'
export * from './content-schema'
export * from './ipc'
