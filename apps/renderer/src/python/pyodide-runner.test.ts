import { describe, expect, it } from 'vitest'
import { cleanTraceback } from './pyodide-runner'

/**
 * Lessons 0.3 and 1.7 teach reading a traceback. The first traceback a
 * beginner ever reads must describe their program and nothing else — spec
 * anti-goal A4 is that the app's plumbing never becomes their problem.
 */
describe('cleanTraceback', () => {
  it('passes a learner traceback through untouched', () => {
    const theirs = [
      'Traceback (most recent call last):',
      '  File "your program", line 2, in <module>',
      '    print(undefined_name)',
      "NameError: name 'undefined_name' is not defined",
    ].join('\n')

    expect(cleanTraceback(theirs)).toBe(theirs)
  })

  it('keeps a plain error message', () => {
    expect(cleanTraceback('EOFError: this program asked for input, and none was given')).toBe(
      'EOFError: this program asked for input, and none was given',
    )
  })

  it('never shows the learner a Pyodide bridge failure', () => {
    // What Pyodide's JavaScript wrapper produces when it reports the error
    // itself. Every line of this is the runner, not the learner.
    const bridge = [
      'Traceback (most recent call last):',
      '  File "/lib/python312.zip/_pyodide/_base.py", line 573, in eval_code_async',
      '    await CodeRunner(',
      '    ...<9 lines>...',
      '    .run_async(globals, locals)',
      '  File "/lib/python312.zip/_pyodide/_base.py", line 394, in run_async',
      '    coroutine = eval(self.code, globals, locals)',
      'EOFError: this program asked for input, and none was given',
      'PythonError',
    ].join('\n')

    const cleaned = cleanTraceback(bridge)

    expect(cleaned).not.toMatch(/pyodide|_base\.py|run_async|PythonError|<9 lines>/i)
    // And it still says something the learner can act on.
    expect(cleaned).toContain('asked for input')
  })

  it('reports an unrecognisable internal failure without pasting it', () => {
    const cleaned = cleanTraceback('PythonError: __pyodide_core failed to initialise')

    expect(cleaned).not.toMatch(/pyodide|PythonError/i)
    expect(cleaned).toBe('Python ran into a problem inside the app, not in your code. Try running it again.')
  })

  it('keeps a syntax error in the shape Python prints it', () => {
    // The worker reports these with format_exception_only, which has no
    // "Traceback" header — adding one would describe a call stack that
    // never ran, which is the opposite of what lesson 0.3 is teaching.
    const syntax = [
      '  File "your program", line 1',
      '    print("hi"',
      '         ^',
      "SyntaxError: '(' was never closed",
    ].join('\n')

    expect(cleanTraceback(syntax)).toBe(syntax)
  })

  it('drops the chained exception Pyodide adds around the real one', () => {
    const chained = [
      'Traceback (most recent call last):',
      '  File "/lib/python312.zip/_pyodide/_base.py", line 573, in eval_code_async',
      '    await CodeRunner(',
      '',
      'During handling of the above exception, another exception occurred:',
      '',
      'Traceback (most recent call last):',
      '  File "your program", line 3, in <module>',
      '    total = total / count',
      'ZeroDivisionError: division by zero',
    ].join('\n')

    expect(cleanTraceback(chained)).toBe(
      [
        'Traceback (most recent call last):',
        '  File "your program", line 3, in <module>',
        '    total = total / count',
        'ZeroDivisionError: division by zero',
      ].join('\n'),
    )
  })

  it('is empty for no error', () => {
    expect(cleanTraceback('')).toBe('')
  })
})
