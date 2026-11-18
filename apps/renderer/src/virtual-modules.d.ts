declare module 'virtual:conductor-content' {
  import type { Track, Boss, Duel, AtlasTool } from '@conductor/shared'
  export const tracks: Track[]
  export const bosses: Boss[]
  export const duels: Duel[]
  export const atlas: AtlasTool[]
  /** SQL fixtures keyed by filename without the extension. */
  export const fixtures: Record<string, string>
}
