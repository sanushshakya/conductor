import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { conductorContent } from './tools/vite-content-plugin'

export default defineConfig({
  plugins: [react(), conductorContent(resolve(__dirname, 'content'))],
  resolve: {
    alias: {
      '@conductor/shared': resolve(__dirname, 'packages/shared/src'),
      '@conductor/core': resolve(__dirname, 'packages/core/src'),
    },
  },
  test: {
    setupFiles: ['./vitest.setup.ts'],
    globals: true,
    include: ['{packages,apps,harness,scripts}/**/*.{test,spec}.{ts,tsx,mts,mjs}'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/out/**'],
    environmentMatchGlobs: [
      ['**/*.tsx', 'jsdom'],
      // Reads window.location to decide the preview origin.
      ['**/web/preview-host.test.ts', 'jsdom'],
    ],
  },
})
