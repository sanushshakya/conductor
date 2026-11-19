import { describe, expect, it } from 'vitest'
import { capabilities, capabilityNotice } from './capabilities'
import type { SidecarStatus } from './domain'

const stopped: SidecarStatus = { state: 'stopped' }
const ready: SidecarStatus = { state: 'ready', port: 8000 }

describe('capabilities', () => {
  it('runs Python on Pyodide when there is no sidecar', () => {
    expect(capabilities(stopped, { pyodide: true }).pythonExec).toBe(true)
  })

  it('never grades the API track without a sidecar, whatever else is running', () => {
    // Grading Track 4 means making HTTP requests to a server on the
    // learner's own machine, which a hosted page cannot reach.
    expect(capabilities(stopped, { pyodide: true, webPreview: true }).apiGrading).toBe(false)
  })

  it('offers the web preview only when a separate preview origin exists', () => {
    expect(capabilities(stopped, { webPreview: true }).webPreview).toBe(true)
    expect(capabilities(stopped, { webPreview: false }).webPreview).toBe(false)
  })

  it('keeps the web preview when the sidecar dies', () => {
    // The desktop app registers its preview:// protocol in the main process,
    // which has nothing to do with Python. A learner whose sidecar failed
    // keeps the whole web track.
    expect(capabilities(stopped).webPreview).toBe(true)
    expect(capabilities(ready).webPreview).toBe(true)
  })

  it('tells a learner when the web track cannot run', () => {
    const notice = capabilityNotice(stopped, { pyodide: true, webPreview: false })

    expect(notice).toMatch(/web lessons/i)
    expect(notice).not.toMatch(/origin|CSP|iframe|sandbox/i)
  })

  it('does not write off the API track, whose lessons all run on Pyodide', () => {
    // Only the Hospital API project needs a server on the learner's machine;
    // every lesson in Track 4 is graded by running Python. Telling a learner
    // the track is unavailable would cost them ten lessons that work.
    const notice = capabilityNotice(stopped, { pyodide: true, webPreview: true })

    expect(notice).toMatch(/Hospital API/)
    expect(notice).not.toMatch(/API track/)
  })
})
