import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    include: ['{packages,apps,harness}/**/*.{test,spec}.{ts,tsx}'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/out/**'],
    environmentMatchGlobs: [['**/*.tsx', 'jsdom']],
  },
})
