import { grade } from './index'
import './web-graders'
import { createWebRenderer, createHtmlParser } from '../../../../harness/web-renderer'
import type { GraderConfig } from '@conductor/shared'

const renderWeb = createWebRenderer()
const ctx = { exerciseId: 'web-1', xp: 25, renderWeb, parseHtml: createHtmlParser() }

async function run(submission: string, config: GraderConfig) {
  return grade(submission, config, ctx)
}

function web(parts: { html?: string; css?: string; js?: string }) {
  return JSON.stringify(parts)
}

// ── html-structure ────────────────────────────────────────────────────────

test('passes when the required elements are present with the right text', async () => {
  const r = await run(web({ html: '<h1>Ward Board</h1><ul><li>Ana</li><li>Ben</li></ul>' }), {
    kind: 'html-structure',
    expect: [
      { selector: 'h1', label: 'Has a heading', text: 'Ward Board' },
      { selector: 'li', label: 'Lists two patients', count: 2 },
    ],
  })
  expect(r.passed).toBe(true)
})

test('markup written differently from the reference still passes', async () => {
  // A <section> wrapper, different indentation, an extra class: none of that
  // is wrong, and a grader that rejected it would teach copying.
  const r = await run(
    web({ html: '<section>\n  <h1 class="title">Ward Board</h1>\n</section>' }),
    { kind: 'html-structure', expect: [{ selector: 'h1', label: 'Heading', text: 'Ward Board' }] },
  )
  expect(r.passed).toBe(true)
})

test('reports the selector that found nothing', async () => {
  const r = await run(web({ html: '<p>nothing here</p>' }), {
    kind: 'html-structure',
    expect: [{ selector: 'h1', label: 'Has a heading' }],
  })
  expect(r.passed).toBe(false)
  expect(r.checks[0]!.detail).toMatch(/h1/)
})

test('reports a wrong element count with both numbers', async () => {
  const r = await run(web({ html: '<li>only one</li>' }), {
    kind: 'html-structure',
    expect: [{ selector: 'li', label: 'Three items', count: 3 }],
  })
  expect(r.checks[0]!.detail).toMatch(/Expected 3.*found 1/)
})

test('checks attributes', async () => {
  const r = await run(web({ html: '<img alt="A ward">' }), {
    kind: 'html-structure',
    expect: [{ selector: 'img', label: 'Image has alt text', attributes: { alt: 'A ward' } }],
  })
  expect(r.passed).toBe(true)
})

test('a missing attribute is reported as missing, not as wrong', async () => {
  const r = await run(web({ html: '<img>' }), {
    kind: 'html-structure',
    expect: [{ selector: 'img', label: 'Image has alt text', attributes: { alt: 'A ward' } }],
  })
  expect(r.checks[0]!.detail).toMatch(/no such attribute/)
})

test('forbidden selectors catch the shortcut', async () => {
  const r = await run(web({ html: '<ul><li style="color:red">Ana</li></ul>' }), {
    kind: 'html-structure',
    expect: [{ selector: 'li', label: 'Lists a patient' }],
    forbid: [{ selector: '[style]', label: 'Styles live in CSS, not on the element' }],
  })
  expect(r.passed).toBe(false)
})

test('an error thrown by the learner JS fails the check', async () => {
  const r = await run(web({ html: '<h1>Hi</h1>', js: 'nope.missing()' }), {
    kind: 'html-structure',
    expect: [{ selector: 'h1', label: 'Has a heading' }],
  })
  expect(r.passed).toBe(false)
  expect(r.checks.some((c) => c.id === 'no-errors')).toBe(true)
})

test('an invalid selector is reported rather than throwing', async () => {
  const r = await run(web({ html: '<h1>Hi</h1>' }), {
    kind: 'html-structure',
    expect: [{ selector: '>>bad', label: 'Nonsense' }],
  })
  expect(r.passed).toBe(false)
  expect(r.checks[0]!.detail).toMatch(/not a valid selector/)
})

// ── css ───────────────────────────────────────────────────────────────────

test('CSS the learner wrote is applied to the rendered page', async () => {
  const r = await run(
    web({ html: '<p class="note">careful</p>', css: '.note { color: red }' }),
    { kind: 'html-structure', expect: [{ selector: '.note', label: 'The note exists' }] },
  )
  expect(r.passed).toBe(true)
})

// ── js-output ─────────────────────────────────────────────────────────────

test('js-output passes when the logs match exactly', async () => {
  const r = await run(web({ js: 'console.log("Ana"); console.log("Ben")' }), {
    kind: 'js-output',
    expectLogs: ['Ana', 'Ben'],
  })
  expect(r.passed).toBe(true)
})

test('js-output fails on a missing line and shows both sides', async () => {
  const r = await run(web({ js: 'console.log("Ana")' }), {
    kind: 'js-output',
    expectLogs: ['Ana', 'Ben'],
  })
  expect(r.passed).toBe(false)
  expect(r.checks[0]!.detail).toMatch(/Ben/)
})

test('js-output surfaces a thrown error as the detail', async () => {
  const r = await run(web({ js: 'missingFunction()' }), {
    kind: 'js-output',
    expectLogs: ['anything'],
  })
  expect(r.passed).toBe(false)
  expect(r.checks[0]!.detail).toMatch(/missingFunction|not defined/)
})

test('a bare submission is treated as JavaScript for js-output', async () => {
  const r = await run('console.log("direct")', { kind: 'js-output', expectLogs: ['direct'] })
  expect(r.passed).toBe(true)
})

// ── dom-behaviour ─────────────────────────────────────────────────────────

test('dom-behaviour clicks a button and checks what the page now says', async () => {
  const r = await run(
    web({
      html: '<button id="go">Call next</button><p id="out">nobody</p>',
      js: `document.getElementById('go').addEventListener('click', function(){
             document.getElementById('out').textContent = 'Ana'
           })`,
    }),
    {
      kind: 'dom-behaviour',
      steps: [
        { label: 'Clicking calls the next patient', click: '#go', expectSelector: '#out', expectText: 'Ana' },
      ],
    },
  )
  expect(r.passed).toBe(true)
})

test('dom-behaviour fails when the handler was never attached', async () => {
  const r = await run(
    web({ html: '<button id="go">Go</button><p id="out">nobody</p>', js: '' }),
    {
      kind: 'dom-behaviour',
      steps: [{ label: 'Clicking updates it', click: '#go', expectSelector: '#out', expectText: 'Ana' }],
    },
  )
  expect(r.passed).toBe(false)
  expect(r.checks[0]!.detail).toMatch(/nobody/)
})

test('dom-behaviour can type into a field before asserting', async () => {
  const r = await run(
    web({
      html: '<input id="name"><button id="add">Add</button><ul id="list"></ul>',
      js: `document.getElementById('add').addEventListener('click', function(){
             var li = document.createElement('li')
             li.textContent = document.getElementById('name').value
             document.getElementById('list').appendChild(li)
           })`,
    }),
    {
      kind: 'dom-behaviour',
      steps: [
        {
          label: 'Adds the typed name to the list',
          type: { selector: '#name', value: 'Cal' },
          click: '#add',
          expectSelector: '#list li',
          expectText: 'Cal',
        },
      ],
    },
  )
  expect(r.passed).toBe(true)
})

test('each dom-behaviour step runs against a fresh page', async () => {
  const r = await run(
    web({
      html: '<button id="go">Go</button><ul id="list"></ul>',
      js: `document.getElementById('go').addEventListener('click', function(){
             var li = document.createElement('li'); li.textContent = 'x'
             document.getElementById('list').appendChild(li)
           })`,
    }),
    {
      kind: 'dom-behaviour',
      steps: [
        { label: 'One click adds one item', click: '#go', expectSelector: '#list li', expectCount: 1 },
        { label: 'Still one on a fresh page', click: '#go', expectSelector: '#list li', expectCount: 1 },
      ],
    },
  )
  expect(r.passed).toBe(true)
})

test('web graders report unchecked when no renderer is available', async () => {
  const r = await grade(web({ html: '<h1>Hi</h1>' }), {
    kind: 'html-structure',
    expect: [{ selector: 'h1', label: 'Heading' }],
  }, { exerciseId: 'web-1', xp: 25, parseHtml: createHtmlParser() })
  expect(r.checks).toEqual([])
  expect(r.unavailableReason).toBeTruthy()
})
