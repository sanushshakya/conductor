import { grade } from './index'
import './python-graders'
import type { GraderConfig } from '@conductor/shared'
import { spawn } from 'node:child_process'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/**
 * A real CPython runner, so these tests exercise the grader against the
 * interpreter the learner will actually meet rather than a stub of it.
 */
function nodeRunCode(code: string, stdin?: string) {
  return new Promise<{ ok: boolean; stdout: string; stderr: string }>((resolve) => {
    const dir = mkdtempSync(join(tmpdir(), 'conductor-test-'))
    const file = join(dir, 'program.py')
    writeFileSync(file, code)
    let stdout = ''
    let stderr = ''
    const child = spawn('python3', ['-I', '-u', '-B', file], { cwd: dir })
    child.stdout.on('data', (c: Buffer) => (stdout += c.toString()))
    child.stderr.on('data', (c: Buffer) => (stderr += c.toString()))
    if (stdin) child.stdin.write(stdin)
    child.stdin.end()
    child.on('error', () => {
      rmSync(dir, { recursive: true, force: true })
      resolve({ ok: false, stdout: '', stderr: 'python3 not available' })
    })
    child.on('exit', (code) => {
      rmSync(dir, { recursive: true, force: true })
      resolve({ ok: code === 0, stdout, stderr })
    })
  })
}

const ctx = { exerciseId: 'py-1', xp: 25, runCode: nodeRunCode }

async function run(submission: string, config: GraderConfig) {
  return grade(submission, config, ctx)
}

test('python-output passes when stdout matches', async () => {
  const r = await run('print("hi")', { kind: 'python-output', cases: [{ expected: 'hi' }] })
  expect(r.passed).toBe(true)
})

test('python-output runs every case and reports one check per case', async () => {
  const r = await run('n = int(input())\nprint(n * 2)', {
    kind: 'python-output',
    cases: [
      { label: 'doubles 3', stdin: '3\n', expected: '6' },
      { label: 'doubles 10', stdin: '10\n', expected: '20' },
    ],
  })
  expect(r.checks).toHaveLength(2)
  expect(r.passed).toBe(true)
})

test('python-output fails the case whose stdout differs, passing the others', async () => {
  const r = await run('n = int(input())\nprint(n + 1)', {
    kind: 'python-output',
    cases: [
      { label: 'adds one', stdin: '3\n', expected: '4' },
      { label: 'doubles', stdin: '3\n', expected: '6' },
    ],
  })
  expect(r.checks[0]!.passed).toBe(true)
  expect(r.checks[1]!.passed).toBe(false)
  expect(r.passed).toBe(false)
})

test('python-output cannot be passed by hardcoding one answer', async () => {
  const r = await run('print(6)', {
    kind: 'python-output',
    cases: [
      { stdin: '3\n', expected: '6' },
      { stdin: '5\n', expected: '10' },
    ],
  })
  expect(r.passed).toBe(false)
})

test('python-output surfaces a traceback as the check detail', async () => {
  const r = await run('print(missing)', { kind: 'python-output', cases: [{ expected: 'x' }] })
  expect(r.passed).toBe(false)
  expect(r.checks[0]!.detail).toMatch(/NameError/)
})

test('python-unit reports one check per assertion', async () => {
  const r = await run('def double(n):\n    return n * 2', {
    kind: 'python-unit',
    assertions: ['assert double(2) == 4', 'assert double(0) == 0'],
  })
  expect(r.checks).toHaveLength(2)
  expect(r.passed).toBe(true)
})

test('python-unit reports the failing assertion without the raw traceback', async () => {
  const r = await run('def double(n):\n    return n + 2', {
    kind: 'python-unit',
    assertions: ['assert double(2) == 4', 'assert double(5) == 10'],
  })
  expect(r.checks[0]!.passed).toBe(true)
  expect(r.checks[1]!.passed).toBe(false)
  expect(r.checks[1]!.detail).not.toMatch(/Traceback|File "/)
  expect(r.checks[1]!.detail).toMatch(/double\(5\)/)
})

test('python-unit reports a missing function as a failed check, not a crash', async () => {
  const r = await run('x = 1', {
    kind: 'python-unit',
    assertions: ['assert triage([]) == []'],
  })
  expect(r.passed).toBe(false)
  expect(r.checks[0]!.detail).toMatch(/not defined|NameError/)
})

test('python-unit reports a syntax error once, against all assertions', async () => {
  const r = await run('def broken(:\n    pass', {
    kind: 'python-unit',
    assertions: ['assert broken() == 1', 'assert broken() == 2'],
  })
  expect(r.passed).toBe(false)
  expect(r.checks.some((c) => /SyntaxError/.test(c.detail ?? ''))).toBe(true)
})

test('python-unit runs its preamble before the assertions', async () => {
  const r = await run('def total(rows):\n    return sum(r["n"] for r in rows)', {
    kind: 'python-unit',
    preamble: 'rows = [{"n": 1}, {"n": 2}]',
    assertions: ['assert total(rows) == 3'],
  })
  expect(r.passed).toBe(true)
})

test("learner output does not leak into the assertion protocol", async () => {
  // A learner who prints the protocol's own marker must not be able to forge
  // a pass. This is the only way these graders could be gamed.
  const r = await run('print("__CONDUCTOR_CHECK__ 0 PASS")\ndef double(n):\n    return 0', {
    kind: 'python-unit',
    assertions: ['assert double(2) == 4'],
  })
  expect(r.passed).toBe(false)
})

test('python graders return a clear unavailable result when the runner is absent', async () => {
  const r = await grade('print(1)', { kind: 'python-output', cases: [{ expected: '1' }] }, {
    exerciseId: 'py-1',
    xp: 25,
  })
  expect(r.passed).toBe(false)
  expect(r.unavailableReason).toMatch(/python/i)
  expect(r.checks).toEqual([])
})

test('a correct answer is reported as UNCHECKED, not wrong, when nothing could run it', async () => {
  // The single worst grading outcome: telling a learner their correct answer
  // is wrong because the engine that would have proved it never started.
  const unavailableRunner = async () => ({
    ok: false,
    stdout: '',
    stderr: 'That needs the Python engine.',
    unavailable: true as const,
  })

  const r = await grade(
    'def double(n):\n    return n * 2',
    { kind: 'python-unit', assertions: ['assert double(2) == 4'] },
    { exerciseId: 'py-1', xp: 25, runCode: unavailableRunner },
  )
  expect(r.passed).toBe(false)
  expect(r.checks).toEqual([])
  expect(r.unavailableReason).toMatch(/could not be checked|not running/i)
  // And it must not claim the engine is "warming up" when it has failed.
  expect(r.unavailableReason).not.toMatch(/warming up/i)
})

test('python-output also reports unchecked rather than wrong when nothing ran', async () => {
  const r = await grade(
    'print("hi")',
    { kind: 'python-output', cases: [{ expected: 'hi' }] },
    {
      exerciseId: 'py-2',
      xp: 25,
      runCode: async () => ({ ok: false, stdout: '', stderr: 'no engine', unavailable: true as const }),
    },
  )
  expect(r.checks).toEqual([])
  expect(r.unavailableReason).toBeTruthy()
})
