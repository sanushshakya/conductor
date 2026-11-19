import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { conductorContent } from './tools/vite-content-plugin'

/**
 * One config for all three Electron processes.
 *
 * `@conductor/shared` is aliased rather than externalized so main, preload and
 * renderer each bundle it from source — the package ships TypeScript, and the
 * alternative is a build step that must run before the app can start.
 */
const shared = resolve(__dirname, 'packages/shared/src')
const core = resolve(__dirname, 'packages/core/src')

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: { alias: { '@conductor/shared': shared, '@conductor/core': core } },
    build: {
      lib: { entry: resolve(__dirname, 'apps/main/src/index.ts') },
      outDir: 'out/main',
    },
  },
  preload: {
    // Deliberately NOT externalizeDepsPlugin: the window runs with
    // `sandbox: true`, and a sandboxed preload may only require `electron`,
    // `events`, `timers` and `url`. Leaving a dependency external means the
    // preload throws on load, `contextBridge` never runs, and the renderer
    // silently falls back to its browser host — the app looks fine while
    // writing progress to localStorage and never reaching the sidecar.
    resolve: { alias: { '@conductor/shared': shared, '@conductor/core': core } },
    build: {
      lib: { entry: resolve(__dirname, 'apps/preload/src/index.ts') },
      outDir: 'out/preload',
    },
  },
  renderer: {
    root: resolve(__dirname, 'apps/renderer'),
    plugins: [react(), conductorContent(resolve(__dirname, 'content'))],
    server: {
      // Bound on both interfaces so the preview frame can be served from a
      // DIFFERENT origin to the app (127.0.0.1 against localhost). Without
      // this, every web exercise in `npm run dev` fails with "the preview
      // could not be reached" — Vite binds `localhost` only by default, and
      // Node resolves that to ::1, so 127.0.0.1 answers nothing.
      host: true,
      cors: false,
      fs: { strict: true, allow: [__dirname] },
    },
    resolve: {
      alias: {
        '@conductor/shared': shared,
        '@conductor/core': core,
        '@': resolve(__dirname, 'apps/renderer/src'),
      },
    },
    build: {
      outDir: 'out/renderer',
      rollupOptions: { input: resolve(__dirname, 'apps/renderer/index.html') },
    },
  },
})
