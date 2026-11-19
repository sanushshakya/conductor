import { describe, expect, it } from 'vitest'
import { frameAncestorsFor, APP_SCHEME, PREVIEW_SCHEME } from './frame-headers'

/**
 * `frame-ancestors` is ignored inside a <meta> CSP — browsers honour it only
 * as a response header. preview.html carried it in its meta tag, so the
 * restriction it advertised was never actually enforced anywhere.
 */
describe('frameAncestorsFor', () => {
  it('lets only the app frame the preview', () => {
    expect(frameAncestorsFor(PREVIEW_SCHEME)).toBe("frame-ancestors app://-")
  })

  it('lets nothing frame the app itself', () => {
    expect(frameAncestorsFor(APP_SCHEME)).toBe("frame-ancestors 'none'")
  })
})
