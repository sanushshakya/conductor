import { createServer } from 'node:net'
import { EventEmitter } from 'node:events'
import { findFreePort } from './port'
import { SidecarSupervisor, type SupervisorDeps, type ChildLike } from './supervisor'
import { capabilities } from '@conductor/shared'

function fakeChild(): ChildLike & { kill: ReturnType<typeof vi.fn> } {
  const child = new EventEmitter() as unknown as ChildLike & { kill: ReturnType<typeof vi.fn> }
  child.stdout = new EventEmitter() as never
  child.stderr = new EventEmitter() as never
  child.kill = vi.fn()
  child.pid = 4242
  return child
}

function deps(overrides: Partial<SupervisorDeps> = {}) {
  const spawned: { command: string; args: string[] }[] = []
  const requests: { url: string; headers: Record<string, string> }[] = []
  const children: ReturnType<typeof fakeChild>[] = []

  const base: SupervisorDeps = {
    findPython: async () => '/usr/bin/python3',
    provision: async () => ({ python: '/venv/bin/python' }),
    spawn: (command, args) => {
      spawned.push({ command, args })
      const child = fakeChild()
      children.push(child)
      return child
    },
    fetch: async (url, init) => {
      requests.push({ url, headers: (init?.headers ?? {}) as Record<string, string> })
      return { ok: true, status: 200, json: async () => ({ ok: true }) }
    },
    waitForHealth: async () => true,
    ...overrides,
  }
  return { deps: base, spawned, requests, children }
}

test('findFreePort returns the preferred port when it is free', async () => {
  const port = await findFreePort(52987)
  expect(port).toBe(52987)
})

test('findFreePort returns an alternative when the preferred port is bound', async () => {
  const blocker = createServer()
  await new Promise<void>((resolve) => blocker.listen(52988, '127.0.0.1', resolve))
  try {
    const port = await findFreePort(52988)
    expect(port).not.toBe(52988)
    expect(port).toBeGreaterThan(0)
  } finally {
    blocker.close()
  }
})

test('a fresh supervisor reports stopped', () => {
  const supervisor = new SidecarSupervisor(deps().deps)
  expect(supervisor.status().state).toBe('stopped')
})

test('start() reaches ready and reports the port', async () => {
  const supervisor = new SidecarSupervisor(deps().deps)
  const status = await supervisor.start()
  expect(status.state).toBe('ready')
  expect(status.port).toBeGreaterThan(0)
})

test('status becomes failed with a human message when python3 is absent', async () => {
  const supervisor = new SidecarSupervisor(deps({ findPython: async () => null }).deps)
  await supervisor.start()
  const status = supervisor.status()
  expect(status.state).toBe('failed')
  expect(status.message).toBeTruthy()
  expect(status.message).not.toMatch(/Traceback|ENOENT|undefined|\bError:/)
  expect(status.message).toMatch(/python/i)
})

test('a failed sidecar leaves offline-capable tracks reported as available', async () => {
  const supervisor = new SidecarSupervisor(deps({ findPython: async () => null }).deps)
  await supervisor.start()
  const caps = capabilities(supervisor.status())
  expect(caps.sqlLessons).toBe(true)
  expect(caps.bootTrack).toBe(true)
  expect(caps.authoredHints).toBe(true)
  expect(caps.pythonExec).toBe(false)
  expect(caps.apiGrading).toBe(false)
})

test('a provisioning failure is reported without a stack trace', async () => {
  const supervisor = new SidecarSupervisor(
    deps({
      provision: async () => {
        throw new Error('pip failed: ENOENT spawn pip')
      },
    }).deps,
  )
  await supervisor.start()
  expect(supervisor.status().state).toBe('failed')
  expect(supervisor.status().message).not.toMatch(/ENOENT|spawn/)
})

test('start() is idempotent and does not spawn a second process', async () => {
  const d = deps()
  const supervisor = new SidecarSupervisor(d.deps)
  await Promise.all([supervisor.start(), supervisor.start()])
  await supervisor.start()
  expect(d.spawned).toHaveLength(1)
})

test('a crashed sidecar is restarted at most 3 times, then reports failed', async () => {
  const d = deps()
  const supervisor = new SidecarSupervisor({ ...d.deps, restartDelayMs: 0 })
  await supervisor.start()

  for (let i = 0; i < 5; i += 1) {
    const child = d.children[d.children.length - 1]!
    ;(child as unknown as EventEmitter).emit('exit', 1, null)
    await new Promise((r) => setTimeout(r, 5))
  }

  expect(d.spawned.length).toBeLessThanOrEqual(4)
  expect(supervisor.status().state).toBe('failed')
  expect(supervisor.status().message).toMatch(/python engine/i)
})

test('a clean shutdown does not trigger a restart', async () => {
  const d = deps()
  const supervisor = new SidecarSupervisor({ ...d.deps, restartDelayMs: 0 })
  await supervisor.start()
  await supervisor.stop()
  await new Promise((r) => setTimeout(r, 10))
  expect(d.spawned).toHaveLength(1)
  expect(supervisor.status().state).toBe('stopped')
})

test('every sidecar request carries the auth token', async () => {
  const d = deps()
  const supervisor = new SidecarSupervisor(d.deps)
  await supervisor.start()
  await supervisor.request('/run/python', { method: 'POST', body: { code: 'print(1)' } })
  expect(d.requests[0]!.headers['X-Conductor-Token']).toMatch(/^[0-9a-f]{32,}$/)
})

test('requests go to loopback only', async () => {
  const d = deps()
  const supervisor = new SidecarSupervisor(d.deps)
  await supervisor.start()
  await supervisor.request('/health')
  expect(d.requests[0]!.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/health$/)
})

test('requesting before the sidecar is ready throws a message a learner could read', async () => {
  const supervisor = new SidecarSupervisor(deps().deps)
  await expect(supervisor.request('/health')).rejects.toThrow(/not running|not ready/i)
})

test('status changes are pushed to subscribers', async () => {
  const supervisor = new SidecarSupervisor(deps().deps)
  const seen: string[] = []
  supervisor.onStatus((s) => seen.push(s.state))
  await supervisor.start()
  expect(seen).toContain('ready')
  expect(seen[0]).not.toBe('ready')
})

test('unsubscribing stops further notifications', async () => {
  const supervisor = new SidecarSupervisor(deps().deps)
  const seen: string[] = []
  const off = supervisor.onStatus((s) => seen.push(s.state))
  off()
  await supervisor.start()
  expect(seen).toEqual([])
})

test('a health check that never passes is reported as failed, not left starting', async () => {
  const supervisor = new SidecarSupervisor(deps({ waitForHealth: async () => false }).deps)
  await supervisor.start()
  expect(supervisor.status().state).toBe('failed')
  expect(supervisor.status().message).toMatch(/did not start|could not start/i)
})
