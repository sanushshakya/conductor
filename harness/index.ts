/**
 * Conductor harness — the machinery that stops a data-driven course from
 * rotting silently.
 *
 * Every check registered here runs in CI. A check that fails means content
 * reached a state a learner must never see: a lesson that cannot be parsed,
 * an exercise whose own reference solution does not pass, a duel with no
 * detectable bug, or a claim about a free tier that has gone stale.
 *
 * Checks are registered rather than hard-coded so each phase of the build can
 * add its own guarantee without touching this file's control flow.
 */

export interface HarnessCheck {
  name: string
  run(contentDir: string): Promise<HarnessResult> | HarnessResult
}

export interface HarnessResult {
  ok: boolean
  summary: string
  failures: string[]
}

const checks: HarnessCheck[] = []

export function registerCheck(check: HarnessCheck): void {
  checks.push(check)
}

export function registeredChecks(): readonly HarnessCheck[] {
  return checks
}

export async function runHarness(contentDir: string): Promise<boolean> {
  let allOk = true
  for (const check of checks) {
    const result = await check.run(contentDir)
    const mark = result.ok ? 'PASS' : 'FAIL'
    process.stdout.write(`[${mark}] ${check.name} — ${result.summary}\n`)
    for (const failure of result.failures) {
      process.stdout.write(`       ${failure}\n`)
    }
    if (!result.ok) allOk = false
  }
  if (checks.length === 0) {
    process.stdout.write('[WARN] no harness checks registered\n')
  }
  return allOk
}
