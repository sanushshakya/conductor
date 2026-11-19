import { describe, expect, it } from 'vitest'
import type { Exercise } from '@conductor/shared'
import { sampleInput } from './sample-input'

function exercise(grader: Exercise['grader']): Exercise {
  return { id: 'x', prompt: 'p', solution: 's', hints: ['a', 'b', 'c'], grader }
}

/**
 * Pressing Run on a program that reads input() must run the program, not
 * raise EOFError. The lesson already states the inputs it will check — Run
 * uses the first of them, so Run and Check agree about what the program sees.
 */
describe('sampleInput', () => {
  it('takes the first case stdin from an output-match grader', () => {
    const grader = {
      kind: 'output-match' as const,
      cases: [
        { label: 'Severity 5', stdin: '5\n', expected: 'Resuscitation' },
        { label: 'Severity 4', stdin: '4\n', expected: 'Emergency' },
      ],
    }

    expect(sampleInput(exercise(grader))).toEqual({ stdin: '5\n', label: 'Severity 5' })
  })

  it('falls back to the case index when a case has no label', () => {
    const grader = {
      kind: 'output-match' as const,
      cases: [{ stdin: '7\n', expected: 'seven' }],
    }

    expect(sampleInput(exercise(grader))).toEqual({ stdin: '7\n', label: 'case 1' })
  })

  it('is undefined when no case supplies input', () => {
    const grader = {
      kind: 'output-match' as const,
      cases: [{ expected: 'hello' }],
    }

    expect(sampleInput(exercise(grader))).toBeUndefined()
  })

  it('is undefined for a grader with no cases at all', () => {
    const grader = {
      kind: 'regex-contains' as const,
      patterns: ['for'],
    }

    expect(sampleInput(exercise(grader))).toBeUndefined()
  })
})
