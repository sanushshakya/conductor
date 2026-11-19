import { describe, expect, it } from 'vitest'
import { embeddedPython } from './embedded-python'

describe('embeddedPython', () => {
  it('unescapes the template literal the way JavaScript does', () => {
    const source = 'const SETUP = `x = "a\\\\nb"\nprint(x)\n`\n'

    // \\n in the file is the two characters Python wants; a bare \n is a
    // real newline in the source.
    expect(embeddedPython(source)).toBe('x = "a\\nb"\nprint(x)\n')
  })

  it('throws when the worker has no setup block', () => {
    expect(() => embeddedPython('const OTHER = 1')).toThrow(/no SETUP/)
  })
})
