import { app, BrowserWindow, ipcMain, net, protocol, shell } from 'electron'
import { spawn } from 'node:child_process'
import { join, dirname, resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import { fileURLToPath } from 'node:url'
import { readdirSync, existsSync } from 'node:fs'
import { CONDUCTOR_NAME, IPC_EVENTS } from '@conductor/shared'
import { ProfileStore } from './profile-store'
import { registerHandlers } from './ipc-handlers'
import { buildNavigationGuard } from './navigation'
import { SidecarSupervisor, type ChildLike } from './sidecar/supervisor'
import { findPython, provisionVenv, waitForHealth } from './sidecar/provision'

const here = dirname(fileURLToPath(import.meta.url))

/**
 * The renderer is served over custom protocols rather than `file://`.
 *
 * Two reasons, and the second is the one that forced it:
 *
 *   - `file://` has a quirky origin that breaks `fetch`, workers and storage
 *     in ways no browser does, so bugs appear only in the packaged build.
 *   - The web track runs the learner's own HTML, CSS and JavaScript, and that
 *     has to happen on a DIFFERENT origin from the app — otherwise it could
 *     reach `parent.conductor`, the IPC bridge. A sandboxed iframe cannot do
 *     the job, because an opaque origin inherits the embedder's CSP and the
 *     learner's inline scripts would be blocked. Two schemes, two origins.
 */
const APP_SCHEME = 'app'
const PREVIEW_SCHEME = 'preview'

protocol.registerSchemesAsPrivileged([
  { scheme: APP_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true } },
  { scheme: PREVIEW_SCHEME, privileges: { standard: true, secure: true } },
])

/**
 * Files the preview origin is allowed to serve.
 *
 * Deliberately a short list rather than the whole renderer directory: the
 * preview origin exists to run the learner's own code, and the less that lives
 * there the less an escape would reach. In particular the app's own
 * `index.html` must not be loadable from it.
 */
const PREVIEW_FILES = new Set(['preview.html'])

/** Serves the built renderer over both schemes, from the same directory. */
function registerRendererProtocols(): void {
  const root = resolve(join(here, '../renderer'))

  function serve(scheme: string, request: Request): Response | Promise<Response> {
    const { pathname } = new URL(request.url)

    // Decode BEFORE validating. Validating the encoded form and then handing
    // the decoded one to the loader is how `..%2f..%2f` walks out of the root.
    let relative: string
    try {
      relative = decodeURIComponent(pathname).replace(/^\/+/, '')
    } catch {
      return new Response('Not found', { status: 404 })
    }
    if (relative === '') relative = scheme === PREVIEW_SCHEME ? 'preview.html' : 'index.html'

    if (scheme === PREVIEW_SCHEME && !PREVIEW_FILES.has(relative)) {
      return new Response('Not found', { status: 404 })
    }

    const resolved = resolve(root, relative)
    // `root + sep` rather than `root`, so a sibling directory whose name
    // merely starts with the same characters cannot pass.
    if (resolved !== root && !resolved.startsWith(root + sep)) {
      return new Response('Not found', { status: 404 })
    }

    // pathToFileURL, not string concatenation: an install path containing a
    // space, `#` or `%` would otherwise produce a malformed URL.
    return net.fetch(pathToFileURL(resolved).toString())
  }

  protocol.handle(APP_SCHEME, (request) => serve(APP_SCHEME, request))
  protocol.handle(PREVIEW_SCHEME, (request) => serve(PREVIEW_SCHEME, request))
}

/**
 * Resolves the curriculum directory. Packaged builds ship `content/` as an
 * extra resource; in development it sits at the repository root.
 */
function contentRoot(): string {
  const packaged = join(process.resourcesPath ?? '', 'content')
  if (existsSync(packaged)) return packaged
  // `here` is out/main/ in both dev and the packaged build, so the repository
  // root is two levels up — NOT three, which was written against the source
  // layout and pointed outside the project entirely.
  return join(here, '../../content')
}

/** Where the sidecar's source lives: packaged as a resource, or in the repo. */
function sidecarRoot(): string {
  const packaged = join(process.resourcesPath ?? '', 'mentor')
  return existsSync(packaged) ? packaged : join(here, '../../services/mentor')
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
      // electron-vite emits `.js` here, not `.mjs`. A wrong path fails
      // silently: the bridge never loads, `window.conductor` is undefined, and
      // the renderer quietly falls back to its browser host — so progress goes
      // to localStorage instead of disk and the sidecar is never reachable.
      preload: join(here, '../preload/index.js'),
      // The three flags that make the preload bridge the only way out of the
      // renderer. Nothing in this app needs them relaxed.
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  // Showing only once painted avoids the white flash a dark app cannot afford.
  window.once('ready-to-show', () => window.show())

  // A learner clicking a documentation link should get their real browser.
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://') || url.startsWith('http://')) void shell.openExternal(url)
    return { action: 'deny' }
  })

  // And nothing may navigate the app window itself away. The window has no
  // address bar and no reload control, so a page that replaced it would have
  // nowhere to go back to — and the web track runs code the learner pasted in.
  const allowDestination = buildNavigationGuard(APP_SCHEME, process.env['ELECTRON_RENDERER_URL'])

  window.webContents.on('will-navigate', (event, url) => {
    if (allowDestination(url)) return
    event.preventDefault()
    if (url.startsWith('https://') || url.startsWith('http://')) void shell.openExternal(url)
  })

  // Nothing in this app needs the camera, microphone or location.
  window.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => {
    callback(false)
  })

  const devServer = process.env['ELECTRON_RENDERER_URL']
  if (devServer) void window.loadURL(devServer)
  else void window.loadURL(`${APP_SCHEME}://-/index.html`)

  return window
}

void app.whenReady().then(() => {
  registerRendererProtocols()

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
