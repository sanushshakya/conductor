import {
  IPC,
  IPC_EVENTS,
  type ConductorApi,
  type SidecarStatus,
  type Profile,
  type MentorRequest,
  type PythonRunRequest,
  type ApiGradeRequest,
} from '@conductor/shared'

/**
 * The subset of Electron's ipcRenderer this bridge needs. Narrowing it here is
 * what lets the bridge be unit-tested in plain Node, and it documents exactly
 * how much power the preload script actually takes.
 */
export interface IpcRendererLike {
  invoke(channel: string, ...args: unknown[]): Promise<unknown>
  on(channel: string, listener: (...args: any[]) => void): void
  removeListener(channel: string, listener: (...args: any[]) => void): void
}

/**
 * Builds the object exposed as `window.conductor`.
 *
 * Every entry is a function. The renderer never receives `ipcRenderer`, a
 * channel name, or anything else it could use to reach a channel this bridge
 * did not intend — which is the entire reason the preload layer exists. Adding
 * a capability means adding a method here and a handler in main; there is no
 * generic `invoke` escape hatch, by design.
 */
export function buildApi(ipc: IpcRendererLike): ConductorApi {
  return {
    getProfile: () => ipc.invoke(IPC.profileGet) as Promise<Profile>,
    updateProfile: (profile) => ipc.invoke(IPC.profileUpdate, profile) as Promise<Profile>,
    resetProfile: () => ipc.invoke(IPC.profileReset) as Promise<Profile>,

    getSidecarStatus: () => ipc.invoke(IPC.sidecarStatus) as Promise<SidecarStatus>,
    startSidecar: () => ipc.invoke(IPC.sidecarStart) as Promise<SidecarStatus>,

    onSidecarStatus: (listener) => {
      // The Electron event object is deliberately dropped: handing a renderer
      // an IpcRendererEvent gives it `sender`, and with it a way back out.
      const wrapped = (_event: unknown, status: SidecarStatus) => listener(status)
      ipc.on(IPC_EVENTS.sidecarStatusChanged, wrapped)
      return () => ipc.removeListener(IPC_EVENTS.sidecarStatusChanged, wrapped)
    },

    runPython: (request: PythonRunRequest) => ipc.invoke(IPC.pythonRun, request) as never,
    askMentor: (request: MentorRequest) => ipc.invoke(IPC.mentorAsk, request) as never,
    gradeApi: (request: ApiGradeRequest) => ipc.invoke(IPC.gradeApi, request) as never,

    openExternal: (url) => ipc.invoke(IPC.openExternal, url) as Promise<void>,
    listContent: () => ipc.invoke(IPC.contentList) as Promise<string[]>,
  }
}
