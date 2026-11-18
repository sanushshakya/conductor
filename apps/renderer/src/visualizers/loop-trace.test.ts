import { traceLoop } from './loop-trace'

test('LoopTracer emits one frame per iteration with the variable state of that step', () => {
  const frames = traceLoop({
    kind: 'for',
    variable: 'i',
    over: [1, 2, 3],
    accumulator: { name: 'total', start: 0, op: 'add' },
  })
  expect(frames).toHaveLength(3)
  expect(frames.map((f) => f.state['i'])).toEqual([1, 2, 3])
  expect(frames.map((f) => f.state['total'])).toEqual([1, 3, 6])
})

test('each frame records the iteration number, counting from one', () => {
  const frames = traceLoop({ kind: 'for', variable: 'x', over: ['a', 'b'] })
  expect(frames.map((f) => f.iteration)).toEqual([1, 2])
})

test('an empty sequence produces no frames, which is the point of the lesson', () => {
  expect(traceLoop({ kind: 'for', variable: 'i', over: [] })).toEqual([])
})

test('a while loop stops when the condition goes false', () => {
  const frames = traceLoop({
    kind: 'while',
    variable: 'n',
    start: 5,
    step: -2,
    whileGreaterThan: 0,
  })
  expect(frames.map((f) => f.state['n'])).toEqual([5, 3, 1])
})

test('a while loop that never terminates is cut off and flagged', () => {
  const frames = traceLoop({
    kind: 'while',
    variable: 'n',
    start: 1,
    step: 0,
    whileGreaterThan: 0,
  })
  expect(frames.length).toBeLessThanOrEqual(50)
  expect(frames[frames.length - 1]!.cutOff).toBe(true)
})

test('frames carry the output a print inside the loop would produce', () => {
  const frames = traceLoop({ kind: 'for', variable: 'i', over: [1, 2], print: '{i}' })
  expect(frames.map((f) => f.output)).toEqual(['1', '2'])
})
