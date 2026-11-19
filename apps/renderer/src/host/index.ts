import {
  freshProfile,
  ProfileSchema,
  type ConductorApi,
  type Profile,
  type SidecarStatus,
} from '@conductor/shared'

/**
 * How the renderer reaches its host.
 *
 * Under Electron the host is `window.conductor`, installed by the preload
 * bridge. In a browser (`npm run dev:web`) there is no main process, so a
 * local host stands in: progress goes to localStorage and the sidecar reports
 * `stopped`, which `capabilities()` already translates into "Boot and SQL
 * work, Python does not".
 *
 * This is a second real host rather than a mock. It costs one small adapter
 * and buys three things: a feedback loop that does not need a packaged desktop
 * app, a renderer whose only route to privileged work is an injectable
 * interface, and continuous proof that the offline-degraded path actually
 * renders — the failure mode a learner is most likely to meet.
 */

declare global {
  interface Window {
    conductor?: ConductorApi
  }
}

const STORAGE_KEY = 'conductor.profile.v1'

function loadLocalProfile(): Profile {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = ProfileSchema.safeParse(JSON.parse(raw))
      if (parsed.success) return parsed.data
    }
  } catch {
    // A private window, cleared site data, or a browser blocking storage. A
    // fresh profile is the correct answer, not an error screen.
  }
  return freshProfile(new Date().toISOString())
}

function saveLocalProfile(profile: Profile): Profile {
  const stamped = { ...profile, updatedAt: new Date().toISOString() }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stamped))
  } catch {
    // Progress is in memory for this session either way; failing the save must
    // not fail the lesson the learner is in the middle of.
  }
  return stamped
}

const BROWSER_SIDECAR: SidecarStatus = {
  state: 'stopped',
  message:
    'Running in the browser, so Python and API lessons are paused. Boot and SQL lessons are fully playable.',
}

/** The browser host. Everything privileged degrades honestly rather than throwing. */
export function createBrowserHost(): ConductorApi {
  return {
    getProfile: async () => loadLocalProfile(),
    updateProfile: async (profile) => saveLocalProfile(profile),
    resetProfile: async () => saveLocalProfile(freshProfile(new Date().toISOString())),

    getSidecarStatus: async () => BROWSER_SIDECAR,
    startSidecar: async () => BROWSER_SIDECAR,
    onSidecarStatus: () => () => {},

    runPython: async () => ({
      ok: false,
      stdout: '',
      stderr:
        'Python runs in the desktop app. In the browser preview, SQL exercises and quizzes still grade normally.',
      exitCode: null,
      durationMs: 0,
      truncated: false,
    }),

    askMentor: async (request) => {
      const hints = request.authoredHints ?? []
      const index = Math.min(request.tier - 1, Math.max(hints.length - 1, 0))
      return {
        answer: hints[index] ?? 'Say out loud what the program should do first, in one sentence.',
        tier: request.tier,
        provider: 'authored',
        usedFallback: true,
      }
    },

    // Not a failure to reach a server — no server is reachable from here.
    gradeApi: async () => ({ reachable: false, checks: [], unsupported: true }),
    openExternal: async (url) => {
      window.open(url, '_blank', 'noopener,noreferrer')
    },
    listContent: async () => [],
  }
}

let cached: ConductorApi | null = null

/** The host for this runtime. Electron's bridge wins when it is present. */
export function host(): ConductorApi {
  if (window.conductor) return window.conductor
  cached ??= createBrowserHost()
  return cached
}

/** True when running under Electron's preload bridge. */
export function isDesktop(): boolean {
  return Boolean(window.conductor)
}
