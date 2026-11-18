import { registerHandlers, type IpcMainLike, type HandlerDeps } from './ipc-handlers'
import { IPC, freshProfile, type Profile } from '@conductor/shared'

function fakeIpcMain() {
  const registered = new Map<string, (...a: never[]) => unknown>()
  const ipcMain: IpcMainLike = {
    handle: (channel, handler) => {
      if (registered.has(channel)) throw new Error(`duplicate handler for ${channel}`)
      registered.set(channel, handler as (...a: never[]) => unknown)
    },
  }
  return { ipcMain, registered }
}

function deps(overrides: Partial<HandlerDeps> = {}): HandlerDeps {
  let profile: Profile = freshProfile('2026-11-18T00:00:00.000Z')
  return {
    profileStore: {
      load: () => profile,
      save: (p: Profile) => {
        profile = p
        return p
      },
      reset: () => {
        profile = freshProfile('2026-11-18T00:00:00.000Z')
        return profile
      },
    },
    sidecar: {
      status: () => ({ state: 'stopped' as const }),
      start: async () => ({ state: 'ready' as const, port: 1 }),
      request: async () => ({ ok: true }),
    },
    openExternal: async () => {},
    listContent: async () => ['boot'],
    ...overrides,
  }
}

test('every IPC channel has a main-process handler registered', () => {
  const { ipcMain, registered } = fakeIpcMain()
  registerHandlers(ipcMain, deps())
  expect([...registered.keys()].sort()).toEqual(Object.values(IPC).sort())
})

test('registering twice on the same ipcMain is rejected, not silently doubled', () => {
  const { ipcMain } = fakeIpcMain()
  registerHandlers(ipcMain, deps())
  expect(() => registerHandlers(ipcMain, deps())).toThrow(/duplicate handler/)
})

test('the profile:update handler validates its payload and rejects junk', async () => {
  const { ipcMain, registered } = fakeIpcMain()
  registerHandlers(ipcMain, deps())
  const handler = registered.get(IPC.profileUpdate)!
  await expect(handler({} as never, { xp: 'heaps' } as never)).rejects.toThrow(/profile/i)
})

test('the profile:update handler persists a valid profile', async () => {
  const { ipcMain, registered } = fakeIpcMain()
  const d = deps()
  registerHandlers(ipcMain, d)
  const updated = { ...freshProfile('2026-11-18T00:00:00.000Z'), xp: 120 }
  await registered.get(IPC.profileUpdate)!({} as never, updated as never)
  expect(d.profileStore.load().xp).toBe(120)
})

test('openExternal refuses a non-http scheme', async () => {
  const { ipcMain, registered } = fakeIpcMain()
  const opened: string[] = []
  registerHandlers(ipcMain, deps({ openExternal: async (u) => void opened.push(u) }))
  await expect(registered.get(IPC.openExternal)!({} as never, 'file:///etc/passwd' as never)).rejects.toThrow()
  await expect(registered.get(IPC.openExternal)!({} as never, 'javascript:alert(1)' as never)).rejects.toThrow()
  expect(opened).toEqual([])
})

test('openExternal allows an https documentation link', async () => {
  const { ipcMain, registered } = fakeIpcMain()
  const opened: string[] = []
  registerHandlers(ipcMain, deps({ openExternal: async (u) => void opened.push(u) }))
  await registered.get(IPC.openExternal)!({} as never, 'https://docs.python.org' as never)
  // The handler canonicalises through URL, which is what makes the protocol
  // check trustworthy; the trailing slash is that normalisation showing.
  expect(opened).toEqual(['https://docs.python.org/'])
})

test('python:run reports a clear unavailable result when the sidecar is not ready', async () => {
  const { ipcMain, registered } = fakeIpcMain()
  registerHandlers(ipcMain, deps())
  const result = (await registered.get(IPC.pythonRun)!({} as never, { code: 'print(1)' } as never)) as {
    ok: boolean
    stderr: string
  }
  expect(result.ok).toBe(false)
  expect(result.stderr).toMatch(/not running|unavailable/i)
  expect(result.stderr).not.toMatch(/Traceback|ECONNREFUSED/)
})
