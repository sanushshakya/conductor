import { describe, expect, it } from 'vitest'
import { grade } from './index'
import './api-graders'

const config = { kind: 'api-suite' as const, suiteId: 'hospital-v1' }

/**
 * The browser build runs real Python on Pyodide but cannot reach a server on
 * the learner's own machine. Telling them "Python is not running" when the
 * banner says it is leaves them debugging the wrong thing.
 */
describe('api-suite grading where no server can be reached', () => {
  it('says the project needs the desktop app, not that Python is down', async () => {
    const host = { gradeApi: async () => ({ reachable: false, checks: [], unsupported: true }) }

    const result = await grade('http://127.0.0.1:8000', config, { host, xp: 40 } as never)

    expect(result.passed).toBe(false)
    expect(result.unavailableReason).toMatch(/desktop app/i)
    expect(result.unavailableReason).not.toMatch(/python engine is not running/i)
  })

  it('still blames the engine when a sidecar build has no engine', async () => {
    const result = await grade('http://127.0.0.1:8000', config, { xp: 40 } as never)

    expect(result.unavailableReason).toMatch(/Python engine/i)
  })

  it('reports an unreachable server as something to start, not a wrong answer', async () => {
    const host = { gradeApi: async () => ({ reachable: false, checks: [] }) }

    const result = await grade('http://127.0.0.1:8000', config, { host, xp: 40 } as never)

    expect(result.passed).toBe(false)
    expect(result.xpAwarded).toBe(0)
  })
})
