import { describe, expect, it } from 'vitest'
import { planWebBuild } from './web-build-plan.mjs'

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

  it('rejects something that is not a URL', () => {
    expect(planWebBuild({ APP_ORIGIN: 'conductor.example', PREVIEW_ORIGIN: 'https://p.example' }).ok).toBe(false)
  })
})
