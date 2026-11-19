import type { CheckResult, ExerciseResult } from '@conductor/shared'
import { registerGrader, resultFrom, type GradeContext } from './index'

/**
 * Graders that need real CPython.
 *
 * Unlike the SQL graders, these cannot run without the sidecar (or, in CI,
 * the harness's own runner). When no runner is available they say so plainly
 * instead of failing the learner for something that is not their fault — an
 * exercise reported as "wrong" when it was never actually run is the fastest
 * way to lose someone's trust in the grading.
 */

const UNAVAILABLE: ExerciseResult = {
  passed: false,
  checks: [],
  xpAwarded: 0,
  unavailableReason:
    'This could not be checked, because the Python engine is not running. Your answer has not been marked wrong — nothing ran it.',
}

/** Marker the assertion harness uses to report results on stdout. */
const MARKER = '__CONDUCTOR_CHECK__'

function normalize(text: string): string {
  return text
    .split('\n')
    .map((line) => line.replace(/\s+$/, ''))
    .join('\n')
    .replace(/\n+$/, '')
}

registerGrader('python-output', async (submission, config, ctx) => {
  if (config.kind !== 'python-output') throw new Error('wrong config')
  if (!ctx.runCode) return UNAVAILABLE

  const checks: CheckResult[] = []
  const trimTrailing = config.trimTrailing ?? true

  for (const [index, testCase] of config.cases.entries()) {
    const run = await ctx.runCode(submission, testCase.stdin)
    // Nothing executed. Reporting checks here would mark a correct answer
    // wrong for a reason that is not the learner's fault.
    if (run.unavailable) return UNAVAILABLE
    const actual = trimTrailing ? normalize(run.stdout) : run.stdout
    const expected = trimTrailing ? normalize(testCase.expected) : testCase.expected
    const passed = actual === expected

    checks.push({
      id: `case-${index}`,
      label: testCase.label ?? `Input ${JSON.stringify(testCase.stdin ?? '(none)')}`,
      passed,
      detail: passed
        ? undefined
        : run.stderr
          ? run.stderr
          : `Expected:\n${testCase.expected}\n\nYour program printed:\n${run.stdout || '(nothing)'}`,
    })
  }

  return resultFrom(checks, ctx.xp)
})

/**
 * Builds the script that runs the learner's definitions and then each
 * assertion, reporting per-assertion results on stdout.
 *
 * Each assertion is isolated in its own try/except so one failure does not
 * hide the rest — a learner whose first case fails still learns that the other
 * three passed, which is the difference between "nearly there" and "broken".
 *
 * Results come back on stdout behind a marker, with the learner's own stdout
 * captured into a buffer first so ordinary `print` output cannot be mistaken
 * for the protocol.
 *
 * This stops accidental collisions, not a determined forgery: `sys.__stdout__`
 * and the protocol's own `json` module are both still reachable from the
 * learner's namespace, so someone who wants to fake a pass can. That is
 * accepted deliberately — there is no certificate, no grade and no stake here,
 * so the only person a forgery deceives is the forger, and an out-of-band
 * channel would complicate the one path every Python exercise runs through.
 * What the grader must never do is mark a CORRECT answer wrong, which is a
 * different property and is tested.
 */
function buildAssertionScript(submission: string, preamble: string, assertions: string[]): string {
  const encoded = JSON.stringify(assertions)
  return `import io, json, sys, traceback

_real_stdout = sys.stdout
sys.stdout = io.StringIO()   # the learner's prints go here, not into our protocol

_ns = {}
_setup_error = None
try:
    exec(compile(${JSON.stringify(submission)}, "your program", "exec"), _ns)
    exec(compile(${JSON.stringify(preamble)}, "exercise setup", "exec"), _ns)
except BaseException:
    _setup_error = traceback.format_exception_only(*sys.exc_info()[:2])[-1].strip()

_results = []
for _i, _src in enumerate(json.loads(${JSON.stringify(encoded)})):
    if _setup_error is not None:
        _results.append([_i, False, _setup_error])
        continue
    try:
        exec(compile(_src, "check", "exec"), _ns)
        _results.append([_i, True, None])
    except AssertionError:
        _results.append([_i, False, "This did not hold: " + _src])
    except BaseException:
        _results.append([_i, False, traceback.format_exception_only(*sys.exc_info()[:2])[-1].strip()])

sys.stdout = _real_stdout
print("${MARKER}" + json.dumps(_results))
`
}

registerGrader('python-unit', async (submission, config, ctx) => {
  if (config.kind !== 'python-unit') throw new Error('wrong config')
  if (!ctx.runCode) return UNAVAILABLE

  const script = buildAssertionScript(submission, config.preamble ?? '', config.assertions)
  const run = await ctx.runCode(script)
  if (run.unavailable) return UNAVAILABLE

  // Only the LAST marker line counts. The learner's own stdout is captured
  // inside the script, but belt and braces: a forged marker printed before the
  // real one cannot displace it.
  const markerLine = run.stdout
    .split('\n')
    .filter((line) => line.startsWith(MARKER))
    .pop()

  if (!markerLine) {
    return resultFrom(
      config.assertions.map((assertion, index) => ({
        id: `assert-${index}`,
        label: assertion,
        passed: false,
        detail: run.stderr || 'Your code could not be run.',
      })),
      ctx.xp,
    )
  }

  let parsed: [number, boolean, string | null][]
  try {
    parsed = JSON.parse(markerLine.slice(MARKER.length)) as [number, boolean, string | null][]
  } catch {
    return resultFrom(
      config.assertions.map((assertion, index) => ({
        id: `assert-${index}`,
        label: assertion,
        passed: false,
        detail: 'Your code could not be checked.',
      })),
      ctx.xp,
    )
  }

  const checks: CheckResult[] = parsed.map(([index, passed, detail]) => ({
    id: `assert-${index}`,
    label: config.assertions[index] ?? `Check ${index + 1}`,
    passed,
    detail: detail ?? undefined,
  }))

  return resultFrom(checks, ctx.xp)
})
