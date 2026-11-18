import {
  IPC,
  ProfileSchema,
  MentorRequestSchema,
  capabilities,
  type Profile,
  type SidecarStatus,
  type RunResult,
  type MentorReply,
  type PythonRunRequest,
  type ApiGradeRequest,
  type ApiGradeReply,
} from '@conductor/shared'

/** The slice of Electron's ipcMain used here, so handlers test without Electron. */
export interface IpcMainLike {
  handle(channel: string, handler: (event: unknown, ...args: unknown[]) => unknown): void
}

export interface ProfileStoreLike {
  load(): Profile
  save(profile: Profile): Profile
  reset(): Profile
}

export interface SidecarLike {
  status(): SidecarStatus
  start(): Promise<SidecarStatus>
  request(path: string, init?: { method?: string; body?: unknown }): Promise<unknown>
}

export interface HandlerDeps {
  profileStore: ProfileStoreLike
  sidecar: SidecarLike
  openExternal(url: string): Promise<void>
  listContent(): Promise<string[]>
}

/** Links the learner may be sent to. Anything else is a bug or an attack. */
const ALLOWED_EXTERNAL_PROTOCOLS = new Set(['http:', 'https:'])

/**
 * A run result for when Python simply is not available.
 *
 * The learner must never meet `ECONNREFUSED` or a stack trace: an app that
 * shows its own plumbing has already lost the beginner it was built for. This
 * is the one place that message is phrased, so it is phrased once and kindly.
 */
function sidecarUnavailableRun(status: SidecarStatus): RunResult {
  return {
    ok: false,
    stdout: '',
    stderr:
      status.state === 'provisioning' || status.state === 'starting'
        ? 'The Python engine is still starting up. Give it a few seconds and run this again.'
        : 'The Python engine is not running, so this code cannot be run yet. Everything in Boot and SQL still works.',
    exitCode: null,
    durationMs: 0,
    truncated: false,
  }
}

/**
 * Registers one handler per IPC channel.
 *
 * The companion test asserts the registered set equals `Object.values(IPC)`,
 * so a channel added to the contract without a handler fails the build rather
 * than becoming a promise that never resolves in the UI.
 */
export function registerHandlers(ipcMain: IpcMainLike, deps: HandlerDeps): void {
  ipcMain.handle(IPC.profileGet, () => deps.profileStore.load())

  // async so a rejected payload always reaches the renderer as a rejected
  // promise, the same shape as every other failure it can see.
  ipcMain.handle(IPC.profileUpdate, async (_event, raw) => {
    // The renderer is not trusted to send a well-formed profile: a malformed
    // one written to disk is corrupted progress, which is the one loss this
    // app cannot undo.
    const parsed = ProfileSchema.safeParse(raw)
    if (!parsed.success) {
      throw new Error(`rejected an invalid profile update: ${parsed.error.issues[0]?.message ?? 'unknown field'}`)
    }
    return deps.profileStore.save(parsed.data)
  })

  ipcMain.handle(IPC.profileReset, () => deps.profileStore.reset())

  ipcMain.handle(IPC.sidecarStatus, () => deps.sidecar.status())
  ipcMain.handle(IPC.sidecarStart, () => deps.sidecar.start())

  ipcMain.handle(IPC.pythonRun, async (_event, raw) => {
    const status = deps.sidecar.status()
    if (!capabilities(status).pythonExec) return sidecarUnavailableRun(status)
    const request = raw as PythonRunRequest
    return (await deps.sidecar.request('/run/python', { method: 'POST', body: request })) as RunResult
  })

  ipcMain.handle(IPC.mentorAsk, async (_event, raw) => {
    const parsed = MentorRequestSchema.safeParse(raw)
    if (!parsed.success) throw new Error('rejected an invalid mentor request')
    const status = deps.sidecar.status()
    if (!capabilities(status).liveMentor) {
      // Authored hints are shipped with every exercise precisely so this path
      // still teaches. The renderer falls back to them on `usedFallback`.
      const hints = parsed.data.authoredHints ?? []
      const index = Math.min(parsed.data.tier - 1, Math.max(hints.length - 1, 0))
      return {
        answer: hints[index] ?? 'Re-read the prompt and say out loud what the program should do first.',
        tier: parsed.data.tier,
        provider: 'authored',
        usedFallback: true,
      } satisfies MentorReply
    }
    return (await deps.sidecar.request('/mentor/ask', {
      method: 'POST',
      body: parsed.data,
    })) as MentorReply
  })

  ipcMain.handle(IPC.gradeApi, async (_event, raw) => {
    const request = raw as ApiGradeRequest
    const status = deps.sidecar.status()
    if (!capabilities(status).apiGrading) {
      return { reachable: false, checks: [] } satisfies ApiGradeReply
    }
    return (await deps.sidecar.request('/grade/api', { method: 'POST', body: request })) as ApiGradeReply
  })

  ipcMain.handle(IPC.openExternal, async (_event, raw) => {
    const url = String(raw)
    let parsed: URL
    try {
      parsed = new URL(url)
    } catch {
      throw new Error(`refused to open a malformed URL: ${url}`)
    }
    if (!ALLOWED_EXTERNAL_PROTOCOLS.has(parsed.protocol)) {
      throw new Error(`refused to open ${parsed.protocol} — only http and https links are allowed`)
    }
    await deps.openExternal(parsed.toString())
  })

  ipcMain.handle(IPC.contentList, () => deps.listContent())
}
