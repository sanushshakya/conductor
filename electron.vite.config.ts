import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

/**
 * One config for all three Electron processes.
 *
 * `@conductor/shared` is aliased rather than externalized so main, preload and
 * renderer each bundle it from source — the package ships TypeScript, and the
 * alternative is a build step that must run before the app can start.
 */
const shared = resolve(__dirname, 'packages/shared/src')

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: { alias: { '@conductor/shared': shared } },
    build: {
      lib: { entry: resolve(__dirname, 'apps/main/src/index.ts') },
      outDir: 'out/main',
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: { alias: { '@conductor/shared': shared } },
    build: {
      lib: { entry: resolve(__dirname, 'apps/preload/src/index.ts') },
      outDir: 'out/preload',
    },
  },
  renderer: {
    root: resolve(__dirname, 'apps/renderer'),
    plugins: [react()],
    resolve: {
      alias: {
        '@conductor/shared': shared,
        '@': resolve(__dirname, 'apps/renderer/src'),
      },
    },
    build: {
      outDir: 'out/renderer',
      rollupOptions: { input: resolve(__dirname, 'apps/renderer/index.html') },
    },
  },
})
