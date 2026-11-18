import { bootPython, BootPythonUnsupported } from './boot-python'

function out(code: string): string {
  const r = bootPython(code)
  if (!r.ok) throw new Error(r.error.message)
  return r.stdout
}

test('prints a string literal', () => {
  expect(out('print("hello")')).toBe('hello\n')
})

test('prints single-quoted strings', () => {
  expect(out("print('hello')")).toBe('hello\n')
})

test('prints an integer', () => {
  expect(out('print(42)')).toBe('42\n')
})

test('evaluates arithmetic in the order Python does', () => {
  expect(out('print(2 + 3 * 4)')).toBe('14\n')
  expect(out('print((2 + 3) * 4)')).toBe('20\n')
  expect(out('print(2 ** 3)')).toBe('8\n')
})

test('integer division and modulo behave like Python', () => {
  expect(out('print(7 // 2)')).toBe('3\n')
  expect(out('print(7 % 2)')).toBe('1\n')
  expect(out('print(7 / 2)')).toBe('3.5\n')
})

test('floor division rounds towards negative infinity, as Python does', () => {
  expect(out('print(-7 // 2)')).toBe('-4\n')
})

test('assigns a variable and prints it', () => {
  expect(out('name = "Sushil"\nprint(name)')).toBe('Sushil\n')
})

test('reassignment takes effect in program order', () => {
  expect(out('x = 10\nprint(x)\nx = 99')).toBe('10\n')
})

test('concatenates strings with +', () => {
  expect(out('print("a" + "b")')).toBe('ab\n')
})

test('prints several comma-separated values separated by a space', () => {
  expect(out('print("age", 18)')).toBe('age 18\n')
})

test('supports f-strings with a variable', () => {
  expect(out('name = "Sushil"\nprint(f"hi {name}")')).toBe('hi Sushil\n')
})

test('supports f-strings with an expression', () => {
  expect(out('print(f"{2 + 2}")')).toBe('4\n')
})

test('ignores comments and blank lines', () => {
  expect(out('# a comment\n\nprint("x")  # trailing\n')).toBe('x\n')
})

test('str() and int() and len() work', () => {
  expect(out('print(str(5) + "!")')).toBe('5!\n')
  expect(out('print(int("5") + 1)')).toBe('6\n')
  expect(out('print(len("abcd"))')).toBe('4\n')
})

test('True and False print with Python capitalisation', () => {
  expect(out('print(True)')).toBe('True\n')
  expect(out('print(1 == 1)')).toBe('True\n')
  expect(out('print(1 == 2)')).toBe('False\n')
})

test('a float that is whole still prints with a decimal point', () => {
  expect(out('print(4 / 2)')).toBe('2.0\n')
})

test('an undefined variable reports a NameError the way Python does', () => {
  const r = bootPython('print(nope)')
  expect(r.ok).toBe(false)
  expect(r.error.message).toMatch(/NameError/)
  expect(r.error.message).toMatch(/nope/)
})

test('a missing closing parenthesis reports a SyntaxError with the line number', () => {
  const r = bootPython('print("hi"')
  expect(r.ok).toBe(false)
  expect(r.error.message).toMatch(/SyntaxError/)
  expect(r.error.line).toBe(1)
})

test('an unsupported construct refuses honestly instead of guessing', () => {
  const r = bootPython('for i in range(3):\n    print(i)')
  expect(r.ok).toBe(false)
  expect(r.error.kind).toBe(BootPythonUnsupported)
  expect(r.error.message).toMatch(/needs the Python engine/i)
})

test('an unsupported construct never reports a plausible wrong answer', () => {
  const r = bootPython('import os\nprint("x")')
  expect(r.ok).toBe(false)
  expect(r.stdout).toBe('')
})

test('dividing by zero reports ZeroDivisionError', () => {
  const r = bootPython('print(1 / 0)')
  expect(r.ok).toBe(false)
  expect(r.error.message).toMatch(/ZeroDivisionError/)
})

test('reports the line number of a later failing statement', () => {
  const r = bootPython('print("ok")\nprint(missing)')
  expect(r.error.line).toBe(2)
})

test('output produced before an error is still returned', () => {
  const r = bootPython('print("first")\nprint(missing)')
  expect(r.stdout).toBe('first\n')
})
