import { describe, expect, it } from 'vitest'
import { planWebBuild, rewriteFrameSrc } from './web-build-plan.mjs'

describe('planWebBuild', () => {
  it('refuses to put the preview on the app origin', () => {
    const plan = planWebBuild({
      APP_ORIGIN: 'https://conductor.example',
      PREVIEW_ORIGIN: 'https://conductor.example',
    })

    expect(plan.ok).toBe(false)
    expect(plan.error).toMatch(/must differ/)
  })

  it('treats a trailing path as the same origin', () => {
    const plan = planWebBuild({
      APP_ORIGIN: 'https://conductor.example',
      PREVIEW_ORIGIN: 'https://conductor.example/preview',
    })

    expect(plan.ok).toBe(false)
  })

  it('refuses one origin without the other', () => {
    expect(planWebBuild({ APP_ORIGIN: 'https://a.example' }).ok).toBe(false)
    expect(planWebBuild({ PREVIEW_ORIGIN: 'https://b.example' }).ok).toBe(false)
  })

  it('builds without the web track when neither is given', () => {
    const plan = planWebBuild({})

    expect(plan.ok).toBe(true)
    expect(plan.webTrackIncluded).toBe(false)
    // Nobody is allowed to frame a preview no app knows about.
    expect(plan.previewFrameAncestors).toBe("frame-ancestors 'none'")
  })

  it('names the app as the only permitted framer', () => {
    const plan = planWebBuild({
      APP_ORIGIN: 'https://conductor.example',
      PREVIEW_ORIGIN: 'https://preview.conductor.example',
    })

    expect(plan).toMatchObject({
      ok: true,
      webTrackIncluded: true,
      appOrigin: 'https://conductor.example',
      previewOrigin: 'https://preview.conductor.example',
      previewFrameAncestors: 'frame-ancestors https://conductor.example',
      appFrameAncestors: "frame-ancestors 'none'",
    })
  })

  it('lets every origin the app is served from frame the preview', () => {
    // A Pages project can answer on more than one name — its assigned
    // *.pages.dev plus any custom domain. Naming only one of them means the
    // web lessons break on the others.
    const plan = planWebBuild({
      APP_ORIGIN: 'https://conductor-c42.pages.dev https://learn.example',
      PREVIEW_ORIGIN: 'https://conductor-preview.pages.dev',
    })

    expect(plan.ok).toBe(true)
    expect(plan.previewFrameAncestors).toBe(
      'frame-ancestors https://conductor-c42.pages.dev https://learn.example',
    )
    // The bundle is built against one app origin; the first is canonical.
    expect(plan.appOrigin).toBe('https://conductor-c42.pages.dev')
  })

  it('refuses a preview origin matching any of the app origins', () => {
    const plan = planWebBuild({
      APP_ORIGIN: 'https://a.example https://b.example',
      PREVIEW_ORIGIN: 'https://b.example',
    })

    expect(plan.ok).toBe(false)
    expect(plan.error).toMatch(/must differ/)
  })

  it('rejects something that is not a URL', () => {
    expect(planWebBuild({ APP_ORIGIN: 'conductor.example', PREVIEW_ORIGIN: 'https://p.example' }).ok).toBe(false)
  })
})

/**
 * The app's own CSP decides what it may frame. In development that list is
 * localhost and 127.0.0.1, which is why a two-origin test on local ports
 * passes while the deployed site refuses to frame its own preview.
 */
describe('rewriteFrameSrc', () => {
  const html = [
    '<meta http-equiv="Content-Security-Policy" content="',
    "default-src 'self'; ",
    'frame-src http://127.0.0.1:* http://localhost:* preview://-; ',
    "worker-src 'self' blob:;",
    '" />',
  ].join('')

  it('narrows frame-src to the deployed preview origin', () => {
    const out = rewriteFrameSrc(html, 'https://preview.example')

    expect(out).toContain('frame-src https://preview.example;')
    // The development hosts are gone: a deployed app has no business
    // framing anything on the visitor's own machine.
    expect(out).not.toContain('127.0.0.1')
    expect(out).not.toContain('localhost')
  })

  it('leaves every other directive alone', () => {
    const out = rewriteFrameSrc(html, 'https://preview.example')

    expect(out).toContain("default-src 'self';")
    expect(out).toContain("worker-src 'self' blob:;")
  })

  it('returns null when there is no frame-src to rewrite', () => {
    expect(rewriteFrameSrc('<meta content="default-src a;" />', 'https://p.example')).toBeNull()
  })
})
