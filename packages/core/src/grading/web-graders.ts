import type { CheckResult, ExerciseResult } from '@conductor/shared'
import { registerGrader, resultFrom, type GradeContext } from './index'

/**
 * Graders for the web track.
 *
 * Everything here asserts on the **rendered document**, never on the source
 * text. Two reasons, and both matter more than they sound:
 *
 *   - There is no single correct way to write markup. A learner who puts the
 *     class on a different element, or indents differently, or uses a `<section>`
 *     where the reference used a `<div>`, has not got it wrong — and a grader
 *     that says otherwise teaches them to copy rather than to think.
 *   - Asserting on what a person would actually see is how real frontend tests
 *     are written. By Track 5 the learner writes these themselves, so being
 *     graded this way is the same habit, applied to them first.
 *
 * The rendering happens in a cross-origin preview document; `ctx.renderWeb`
 * is how this module reaches it. Parsing and assertion happen HERE, in trusted
 * code, on the HTML that comes back.
 */

const UNAVAILABLE: ExerciseResult = {
  passed: false,
  checks: [],
  xpAwarded: 0,
  unavailableReason: 'The preview could not be reached, so this could not be checked.',
}

export interface WebRunRequest {
  html?: string
  css?: string
  js?: string
  settleMs?: number
}

export interface WebRunResult {
  logs: string[]
  errors: string[]
  html: string
  text: string
}

/** Splits a submission carrying all three languages back into its parts. */
export function parseWebSubmission(submission: string): WebRunRequest {
  try {
    const parsed = JSON.parse(submission) as WebRunRequest
    if (parsed && typeof parsed === 'object') return parsed
  } catch {
    // Not JSON: treat the whole thing as markup, which is what a single-editor
    // exercise submits.
  }
  return { html: submission }
}

function parseDocument(html: string, ctx: GradeContext): Document {
  const wrapped = `<!doctype html><body>${html}</body>`
  if (ctx.parseHtml) return ctx.parseHtml(wrapped)
  return new DOMParser().parseFromString(wrapped, 'text/html')
}

function describe(selector: string): string {
  return `\`${selector}\``
}

registerGrader('html-structure', async (submission, config, ctx) => {
  if (config.kind !== 'html-structure') throw new Error('wrong config')
  if (!ctx.renderWeb) return UNAVAILABLE

  const run = await ctx.renderWeb({
    ...parseWebSubmission(submission),
    measureStyles: (config.styles ?? []).map(({ selector, property }) => ({ selector, property })),
  })
  const document_ = parseDocument(run.html, ctx)
  const checks: CheckResult[] = []

  for (const [index, wanted] of (config.styles ?? []).entries()) {
    const measured = (run.styles ?? []).find(
      (s) => s.selector === wanted.selector && s.property === wanted.property,
    )
    const actual = (measured?.value ?? '').trim()
    const matched = wanted.oneOf.some(
      (candidate) => candidate.trim().toLowerCase() === actual.toLowerCase(),
    )
    checks.push({
      id: `style-${index}`,
      label: wanted.label,
      passed: matched,
      detail: matched
        ? undefined
        : `Expected ${wanted.property} to be ${wanted.oneOf.join(' or ')}, found ${
            actual || '(nothing — is the CSS written?)'
          }.`,
    })
  }

  for (const [index, expectation] of config.expect.entries()) {
    let matches: Element[]
    try {
      matches = Array.from(document_.querySelectorAll(expectation.selector))
    } catch {
      checks.push({
        id: `expect-${index}`,
        label: expectation.label,
        passed: false,
        detail: `${describe(expectation.selector)} is not a valid selector.`,
      })
      continue
    }

    const wanted = expectation.count
    if (wanted !== undefined && matches.length !== wanted) {
      checks.push({
        id: `expect-${index}`,
        label: expectation.label,
        passed: false,
        detail: `Expected ${wanted} element(s) matching ${describe(expectation.selector)}, found ${matches.length}.`,
      })
      continue
    }

    if (matches.length === 0) {
      checks.push({
        id: `expect-${index}`,
        label: expectation.label,
        passed: false,
        detail: `Nothing on the page matches ${describe(expectation.selector)} yet.`,
      })
      continue
    }

    const first = matches[0]!
    const actualText = (first.textContent ?? '').trim()

    if (expectation.text !== undefined && actualText !== expectation.text.trim()) {
      checks.push({
        id: `expect-${index}`,
        label: expectation.label,
        passed: false,
        detail: `Expected the text "${expectation.text}", found "${actualText || '(nothing)'}".`,
      })
      continue
    }

    if (
      expectation.textContains !== undefined &&
      !actualText.toLowerCase().includes(expectation.textContains.toLowerCase())
    ) {
      checks.push({
        id: `expect-${index}`,
        label: expectation.label,
        passed: false,
        detail: `Expected the text to contain "${expectation.textContains}", found "${actualText || '(nothing)'}".`,
      })
      continue
    }

    let attributeProblem: string | undefined
    for (const [name, value] of Object.entries(expectation.attributes ?? {})) {
      const actual = first.getAttribute(name)
      if (actual !== value) {
        attributeProblem = `Expected ${name}="${value}", found ${
          actual === null ? 'no such attribute' : `${name}="${actual}"`
        }.`
        break
      }
    }

    checks.push({
      id: `expect-${index}`,
      label: expectation.label,
      passed: attributeProblem === undefined,
      detail: attributeProblem,
    })
  }

  for (const [index, forbidden] of (config.forbid ?? []).entries()) {
    let present = false
    try {
      present = document_.querySelector(forbidden.selector) !== null
    } catch {
      present = false
    }
    checks.push({
      id: `forbid-${index}`,
      label: forbidden.label,
      passed: !present,
      detail: present ? 'That shortcut skips the part the exercise is about.' : undefined,
    })
  }

  if (run.errors.length > 0) {
    checks.push({
      id: 'no-errors',
      label: 'The page runs without errors',
      passed: false,
      detail: run.errors.join('\n'),
    })
  }

  return resultFrom(checks, ctx.xp)
})

registerGrader('js-output', async (submission, config, ctx) => {
  if (config.kind !== 'js-output') throw new Error('wrong config')
  if (!ctx.renderWeb) return UNAVAILABLE

  const request = parseWebSubmission(submission)
  const run = await ctx.renderWeb({ ...request, js: request.js ?? submission })

  if (run.errors.length > 0) {
    return resultFrom(
      [
        {
          id: 'runs',
          label: 'Your code runs',
          passed: false,
          // The browser's own wording is the most useful thing here, and
          // Track 1 spent a lesson teaching them to read it.
          detail: run.errors.join('\n'),
        },
      ],
      ctx.xp,
    )
  }

  const exact = config.exact ?? true
  const actual = run.logs.map((line) => line.trim())
  const expected = config.expectLogs.map((line) => line.trim())

  const passed = exact
    ? actual.length === expected.length && expected.every((line, i) => actual[i] === line)
    : expected.every((line) => actual.includes(line))

  return resultFrom(
    [
      {
        id: 'logs',
        label: `Prints ${expected.length} line(s)`,
        passed,
        detail: passed
          ? undefined
          : `Expected:\n${expected.join('\n')}\n\nYour code printed:\n${
              actual.join('\n') || '(nothing)'
            }`,
      },
    ],
    ctx.xp,
  )
})

registerGrader('dom-behaviour', async (submission, config, ctx) => {
  if (config.kind !== 'dom-behaviour') throw new Error('wrong config')
  if (!ctx.renderWeb) return UNAVAILABLE

  const request = parseWebSubmission(submission)
  const checks: CheckResult[] = []

  // Each step is a fresh render: a step that depends on the previous one's
  // side effects would make a failure impossible to localise, which is the
  // thing the learner is here to get good at.
  for (const [index, step] of config.steps.entries()) {
    const driver = buildDriver(step)
    const run = await ctx.renderWeb({
      html: config.html ?? request.html,
      css: request.css,
      js: `${request.js ?? ''}\n;(function(){try{${driver}}catch(e){console.error('step failed: '+e.message)}})();`,
      settleMs: 20,
    })

    if (run.errors.length > 0) {
      checks.push({
        id: `step-${index}`,
        label: step.label,
        passed: false,
        detail: run.errors.join('\n'),
      })
      continue
    }

    const document_ = parseDocument(run.html, ctx)
    checks.push(assertStep(index, step, document_, run.values ?? []))
  }

  return resultFrom(checks, ctx.xp)
})

/** Generates the interaction a step performs, as source the preview will run. */
function buildDriver(step: {
  click?: string
  type?: { selector: string; value: string }
}): string {
  const parts: string[] = []
  if (step.type) {
    parts.push(
      `var field = document.querySelector(${JSON.stringify(step.type.selector)});`,
      `if (field) { field.value = ${JSON.stringify(step.type.value)};`,
      `field.dispatchEvent(new Event('input', {bubbles:true}));`,
      `field.dispatchEvent(new Event('change', {bubbles:true})); }`,
    )
  }
  if (step.click) {
    parts.push(
      `var target = document.querySelector(${JSON.stringify(step.click)});`,
      `if (target) target.click();`,
    )
  }
  return parts.join('\n')
}

function assertStep(
  index: number,
  step: {
    label: string
    expectSelector?: string
    expectText?: string
    expectTextContains?: string
    expectCount?: number
    expectValue?: string
  },
  document_: Document,
  values: { id: string | null; name: string | null; value: string }[],
): CheckResult {
  const id = `step-${index}`
  const selector = step.expectSelector

  if (selector && step.expectValue !== undefined) {
    // A field's value never appears in innerHTML, so it is read back from the
    // live page instead. Asserting text against an input always passes.
    const fieldId = selector.startsWith('#') ? selector.slice(1) : null
    const field = values.find((v) => v.id === fieldId || v.name === fieldId)
    if (!field) {
      return { id, label: step.label, passed: false, detail: `No form field matched ${describe(selector)}.` }
    }
    if (field.value !== step.expectValue) {
      return {
        id,
        label: step.label,
        passed: false,
        detail: `Expected the field to contain "${step.expectValue}", found "${field.value}".`,
      }
    }
    return { id, label: step.label, passed: true }
  }

  if (selector) {
    const matches = Array.from(document_.querySelectorAll(selector))

    if (step.expectCount !== undefined && matches.length !== step.expectCount) {
      return {
        id,
        label: step.label,
        passed: false,
        detail: `Expected ${step.expectCount} element(s) matching ${describe(selector)}, found ${matches.length}.`,
      }
    }
    if (matches.length === 0) {
      return {
        id,
        label: step.label,
        passed: false,
        detail: `Nothing matched ${describe(selector)} afterwards.`,
      }
    }

    const text = (matches[0]!.textContent ?? '').trim()
    if (step.expectText !== undefined && text !== step.expectText.trim()) {
      return {
        id,
        label: step.label,
        passed: false,
        detail: `Expected "${step.expectText}", found "${text || '(nothing)'}".`,
      }
    }
    if (
      step.expectTextContains !== undefined &&
      !text.toLowerCase().includes(step.expectTextContains.toLowerCase())
    ) {
      return {
        id,
        label: step.label,
        passed: false,
        detail: `Expected the text to contain "${step.expectTextContains}", found "${text || '(nothing)'}".`,
      }
    }
  }

  return { id, label: step.label, passed: true }
}

export type { GradeContext }
