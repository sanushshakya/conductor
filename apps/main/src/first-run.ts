import { isFirstRun, type Profile, type SidecarStatus } from '@conductor/shared'

export { isFirstRun }

/**
 * What happens the first time the app opens.
 *
 * The spec's first goal is that a complete beginner runs their own code within
 * ten minutes of launching, with no setup. Its matching anti-goal is that
 * setup defeats them. Both come down to one ordering decision, which is the
 * whole of this module: **the window and the first lesson come first, and
 * Python is provisioned quietly behind them.**
 *
 * Doing it the other way round — provisioning, then showing the app — turns a
 * fifteen-second first run into a forty-second one spent watching a progress
 * bar, which is exactly the experience the product exists to avoid.
 */

export interface FirstRunPlan {
  showWelcome: boolean
  /** Lesson to open immediately, or null to resume where they stopped. */
  openLessonId: string | null
  /** True if anything must be fetched before the learner can begin. */
  needsNetworkBeforeStart: boolean
  /** True if the UI should wait for Python. It never should. */
  blockOnSidecar: boolean
  startSidecarAfterFirstPaint: boolean
}

export function firstRunPlan(profile: Profile, _sidecar?: SidecarStatus): FirstRunPlan {
  const fresh = isFirstRun(profile)
  return {
    showWelcome: fresh,
    // Everything Track 0 needs — content, the Boot interpreter, the grader —
    // is compiled into the bundle, so the sidecar's state is irrelevant here.
    // It is accepted as a parameter purely to document that it is ignored.
    openLessonId: fresh ? '0.1' : null,
    needsNetworkBeforeStart: false,
    blockOnSidecar: false,
    startSidecarAfterFirstPaint: true,
  }
}
