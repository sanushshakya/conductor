import type { Profile, SidecarStatus, RunResult, MentorRequest, MentorReply, CheckResult } from './domain'

/**
 * The complete set of channels crossing the preload bridge.
 *
 * Declared once, imported everywhere. A string literal at a call site is a
 * typo waiting to become a silent no-op, so there are none: `registerHandlers`
 * is tested against `Object.values(IPC)` to prove every channel has a handler.
 */
export const IPC = Object.freeze({
  profileGet: 'conductor:profile:get',
  profileUpdate: 'conductor:profile:update',
  profileReset: 'conductor:profile:reset',
  sidecarStatus: 'conductor:sidecar:status',
  sidecarStart: 'conductor:sidecar:start',
  pythonRun: 'conductor:python:run',
  mentorAsk: 'conductor:mentor:ask',
  gradeApi: 'conductor:grade:api',
  openExternal: 'conductor:shell:open-external',
  contentList: 'conductor:content:list',
} as const)

export type IpcChannel = (typeof IPC)[keyof typeof IPC]

/** Event pushed from main to renderer when sidecar state changes. */
export const IPC_EVENTS = Object.freeze({
  sidecarStatusChanged: 'conductor:sidecar:changed',
} as const)

export interface PythonRunRequest {
  code: string
  stdin?: string
  timeoutMs?: number
}

export interface ApiGradeRequest {
  baseUrl: string
  suiteId: string
}

export interface ApiGradeReply {
  checks: CheckResult[]
  reachable: boolean
}

/** Exactly what is exposed on `window.conductor`. Nothing else reaches main. */
export interface ConductorApi {
  getProfile(): Promise<Profile>
  updateProfile(profile: Profile): Promise<Profile>
  resetProfile(): Promise<Profile>
  getSidecarStatus(): Promise<SidecarStatus>
  startSidecar(): Promise<SidecarStatus>
  onSidecarStatus(listener: (status: SidecarStatus) => void): () => void
  runPython(request: PythonRunRequest): Promise<RunResult>
  askMentor(request: MentorRequest): Promise<MentorReply>
  gradeApi(request: ApiGradeRequest): Promise<ApiGradeReply>
  openExternal(url: string): Promise<void>
  listContent(): Promise<string[]>
}
