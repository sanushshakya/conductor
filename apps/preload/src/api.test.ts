import { buildApi, type IpcRendererLike } from './api'
import { IPC, IPC_EVENTS } from '@conductor/shared'

const API_KEYS = [
  'getProfile',
  'updateProfile',
  'resetProfile',
  'getSidecarStatus',
  'startSidecar',
  'onSidecarStatus',
  'runPython',
  'askMentor',
  'gradeApi',
  'openExternal',
  'listContent',
]

function fakeIpc() {
  const invoked: { channel: string; args: unknown[] }[] = []
  const listeners = new Map<string, Set<(...a: unknown[]) => void>>()
  const ipc: IpcRendererLike = {
    invoke: async (channel, ...args) => {
      invoked.push({ channel, args })
      return { echoed: channel }
    },
    on: (channel, listener) => {
      if (!listeners.has(channel)) listeners.set(channel, new Set())
      listeners.get(channel)!.add(listener)
    },
    removeListener: (channel, listener) => {
      listeners.get(channel)?.delete(listener)
    },
  }
  return { ipc, invoked, listeners }
}

test('exposes exactly the ConductorApi surface, no raw ipcRenderer', () => {
  const { ipc } = fakeIpc()
  const api = buildApi(ipc)
  expect(Object.keys(api).sort()).toEqual(API_KEYS.sort())
})

test('no exposed value leaks the ipc object itself', () => {
  const { ipc } = fakeIpc()
  const api = buildApi(ipc) as unknown as Record<string, unknown>
  for (const value of Object.values(api)) {
    expect(typeof value).toBe('function')
    expect(value).not.toBe(ipc)
  }
})

test('getProfile invokes the profile:get channel', async () => {
  const { ipc, invoked } = fakeIpc()
  await buildApi(ipc).getProfile()
  expect(invoked[0]!.channel).toBe(IPC.profileGet)
})

test('runPython forwards its request on the python:run channel', async () => {
  const { ipc, invoked } = fakeIpc()
  await buildApi(ipc).runPython({ code: 'print(1)' })
  expect(invoked[0]!.channel).toBe(IPC.pythonRun)
  expect(invoked[0]!.args[0]).toEqual({ code: 'print(1)' })
})

test('onSidecarStatus subscribes to the status event and unsubscribes on dispose', () => {
  const { ipc, listeners } = fakeIpc()
  const dispose = buildApi(ipc).onSidecarStatus(() => {})
  expect(listeners.get(IPC_EVENTS.sidecarStatusChanged)!.size).toBe(1)
  dispose()
  expect(listeners.get(IPC_EVENTS.sidecarStatusChanged)!.size).toBe(0)
})

test('onSidecarStatus hands the listener the status, not the electron event', () => {
  const { ipc, listeners } = fakeIpc()
  const seen: unknown[] = []
  buildApi(ipc).onSidecarStatus((s) => seen.push(s))
  const listener = [...listeners.get(IPC_EVENTS.sidecarStatusChanged)!][0]!
  listener({ sender: 'electron-event' }, { state: 'ready', port: 1234 })
  expect(seen).toEqual([{ state: 'ready', port: 1234 }])
})
