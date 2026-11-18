import { app, BrowserWindow, ipcMain, shell } from 'electron'
import { spawn } from 'node:child_process'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readdirSync, existsSync } from 'node:fs'
import { CONDUCTOR_NAME, IPC_EVENTS } from '@conductor/shared'
import { ProfileStore } from './profile-store'
import { registerHandlers } from './ipc-handlers'
import { SidecarSupervisor, type ChildLike } from './sidecar/supervisor'
import { findPython, provisionVenv, waitForHealth } from './sidecar/provision'

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

/** Where the sidecar's source lives: packaged as a resource, or in the repo. */
function sidecarRoot(): string {
  const packaged = join(process.resourcesPath ?? '', 'mentor')
  return existsSync(packaged) ? packaged : join(here, '../../../services/mentor')
}

function createSupervisor(userData: string): SidecarSupervisor {
  const root = sidecarRoot()
  return new SidecarSupervisor({
    findPython,
    provision: (systemPython, onLog) =>
      provisionVenv(systemPython, join(userData, 'py'), join(root, 'requirements.txt'), onLog),
    spawn: (command, args, env) =>
      spawn(command, args, {
        cwd: root,
        // The sidecar serves the same hospital fixture the SQL track uses, so
        // Track 3 recognises every column from Track 2.
        env: { ...process.env, ...env, CONDUCTOR_CONTENT_DIR: contentRoot() },
        stdio: ['ignore', 'pipe', 'pipe'],
      }) as unknown as ChildLike,
    fetch: (url, init) => fetch(url, init as RequestInit),
    waitForHealth: (port) => waitForHealth(port),
  })
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
  const userData = app.getPath('userData')
  const store = new ProfileStore(userData)
  const sidecar = createSupervisor(userData)

  registerHandlers(ipcMain, {
    profileStore: store,
    sidecar,
    openExternal: async (url) => shell.openExternal(url),
    listContent: async () => {
      const dir = join(contentRoot(), 'tracks')
      return existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.yaml')) : []
    },
  })

  const window = createWindow()

  // Push status to the renderer so the banner is live rather than polled.
  sidecar.onStatus((status) => {
    if (!window.isDestroyed()) window.webContents.send(IPC_EVENTS.sidecarStatusChanged, status)
  })

  // Deliberately AFTER the window exists: the learner must reach lesson 0.1
  // immediately, with Python arriving quietly in the background. Provisioning
  // before the first paint would turn a 15-second first run into a 35-second
  // one, which is the difference the spec's first goal is about.
  window.webContents.once('did-finish-load', () => {
    void sidecar.start()
  })

  app.on('before-quit', () => void sidecar.stop())

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
