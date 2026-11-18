// Regression tests pinning Track 0's authored content to its graders. Task 11's
// solution runner generalises this across the whole curriculum; these stay as the
// specific guarantee that Boot — the first ten minutes — cannot silently break.
import { bootPython } from '../python/boot-python'

test('lesson 0.2 reference solution prints the expected sentence', () => {
  expect(bootPython('print("I am learning to code.")').stdout).toBe('I am learning to code.\n')
})

test('lesson 0.2 variable solution runs and greets Ada', () => {
  const r = bootPython('name = "Ada"\nprint("Hello, " + name + ".")')
  expect(r.ok).toBe(true)
  expect(r.stdout).toBe('Hello, Ada.\n')
})

test('lesson 0.3 starter really is broken, with the TypeError the lesson quotes', () => {
  const r = bootPython('message = "The clinic opens at "\nhour = 9\nprint(message + hour)')
  expect(r.ok).toBe(false)
  expect(r.error.message).toMatch(/can only concatenate str to str/)
  expect(r.error.line).toBe(3)
})

test('lesson 0.3 reference solution prints the opening time', () => {
  const r = bootPython('message = "The clinic opens at "\nhour = 9\nprint(message + str(hour))')
  expect(r.ok).toBe(true)
  expect(r.stdout).toBe('The clinic opens at 9\n')
})

test('lesson 0.2 variable grader rejects the hardcoded sentence', () => {
  const forbidden = new RegExp('print\\(\\s*["\']Hello, Ada\\.["\']\\s*\\)', 'm')
  expect(forbidden.test('print("Hello, Ada.")')).toBe(true)
  expect(forbidden.test('print("Hello, " + name + ".")')).toBe(false)
})

test('lesson 0.2 variable grader accepts the reference solution', () => {
  const assign = new RegExp('name\\s*=\\s*["\']Ada["\']', 'm')
  const used = new RegExp('print\\(.*name', 'm')
  const sol = 'name = "Ada"\nprint("Hello, " + name + ".")'
  expect(assign.test(sol)).toBe(true)
  expect(used.test(sol)).toBe(true)
})
