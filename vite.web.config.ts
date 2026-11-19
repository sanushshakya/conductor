import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { conductorContent } from './tools/vite-content-plugin'

/**
 * Serves the renderer in a plain browser (`npm run dev:web`).
 *
 * Electron is the shipping target, but the renderer is where every lesson, the
 * SQL playground and the visualizers live, and none of Tracks 0 or 2 needs a
 * single Electron capability. Running it in a browser gives a fast feedback
 * loop and — more usefully — forces `window.conductor` to be a real seam
 * rather than an ambient global, which is what makes the UI testable at all.
 */
export default defineConfig({
  root: resolve(__dirname, 'apps/renderer'),
  plugins: [react(), conductorContent(resolve(__dirname, 'content'))],
  resolve: {
    alias: {
      '@conductor/shared': resolve(__dirname, 'packages/shared/src'),
      '@conductor/core': resolve(__dirname, 'packages/core/src'),
      '@': resolve(__dirname, 'apps/renderer/src'),
    },
  },
  server: {
    port: 5178,
    strictPort: false,
    // Bound on all interfaces so BOTH http://localhost:5178 and
    // http://127.0.0.1:5178 answer. They are different origins to the
    // browser, which is what isolates the preview sandbox from the app:
    // a sandboxed iframe inherits the parent's CSP (opaque origins always
    // do), so a separate origin is the only way the preview document can
    // run the inline scripts a learner writes.
    host: true,
  },
  build: { outDir: resolve(__dirname, 'out/web') },
})
