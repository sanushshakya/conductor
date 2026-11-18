import { app, BrowserWindow, ipcMain, shell } from 'electron'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readdirSync, existsSync } from 'node:fs'
import { CONDUCTOR_NAME } from '@conductor/shared'
import { ProfileStore } from './profile-store'
import { registerHandlers, type SidecarLike } from './ipc-handlers'

const here = dirname(fileURLToPath(import.meta.url))

/**
 * Resolves the curriculum directory. Packaged builds ship `content/` as an
 * extra resource; in development it sits at the repository root.
 */
function contentRoot(): string {
  const packaged = join(process.resourcesPath ?? '', 'content')
  if (existsSync(packaged)) return packaged
  return join(here, '../../../content')
}

/**
 * A sidecar that is not there yet.
 *
 * Phase 4 replaces this with the real supervisor. Until then the app reports
 * `stopped` honestly, and `capabilities()` turns that into "Boot and SQL work,
 * Python does not" — which is a true statement about the app today, not a
 * placeholder that lies.
 */
const absentSidecar: SidecarLike = {
  status: () => ({
    state: 'stopped',
    message: 'The Python engine arrives in a later build. Boot and SQL lessons are fully playable.',
  }),
  start: async () => absentSidecar.status(),
  request: async () => {
    throw new Error('sidecar not installed')
  },
}

function createWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 1024,
    minHeight: 700,
    show: false,
    title: CONDUCTOR_NAME,
    backgroundColor: '#0b0e14',
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: join(here, '../preload/index.mjs'),
      // The three flags that make the preload bridge the only way out of the
      // renderer. Nothing in this app needs them relaxed.
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  // Showing only once painted avoids the white flash a dark app cannot afford.
  window.once('ready-to-show', () => window.show())

  // A learner clicking a documentation link should get their real browser, and
  // nothing should ever be able to navigate the app window itself away.
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://') || url.startsWith('http://')) void shell.openExternal(url)
    return { action: 'deny' }
  })

  const devServer = process.env['ELECTRON_RENDERER_URL']
  if (devServer) void window.loadURL(devServer)
  else void window.loadFile(join(here, '../renderer/index.html'))

  return window
}

void app.whenReady().then(() => {
  const store = new ProfileStore(app.getPath('userData'))

  registerHandlers(ipcMain, {
    profileStore: store,
    sidecar: absentSidecar,
    openExternal: async (url) => shell.openExternal(url),
    listContent: async () => {
      const dir = join(contentRoot(), 'tracks')
      return existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.yaml')) : []
    },
  })

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
