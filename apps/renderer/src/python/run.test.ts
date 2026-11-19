import { bootPython } from '@conductor/core'

/**
 * The run policy's unavailable path, verified against the Boot interpreter's
 * actual refusal rather than a stub of it.
 */
test('Boot refuses a Track 1 construct rather than guessing', () => {
  const r = bootPython('def double(n):\n    return n * 2')
  expect(r.ok).toBe(false)
  expect(r.error.kind).toBe('unsupported')
})

test('Boot refuses the assertion harness the python-unit grader builds', () => {
  const r = bootPython('import io, json, sys\nprint(1)')
  expect(r.ok).toBe(false)
  expect(r.error.kind).toBe('unsupported')
})

test('Boot still runs what Track 0 needs', () => {
  expect(bootPython('print("hi")').ok).toBe(true)
})
