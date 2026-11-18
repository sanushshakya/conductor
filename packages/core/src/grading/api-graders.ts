import type { ApiGradeReply } from '@conductor/shared'
import { registerGrader, resultFrom } from './index'

/**
 * Grades the learner's own running server.
 *
 * All the work happens in the sidecar, which makes real HTTP requests to
 * whatever address the learner gives. This grader is the thin part: it asks,
 * and it turns "nothing answered" into an instruction rather than a failure,
 * because a server that is not started yet is not a wrong answer.
 */
registerGrader('api-suite', async (submission, config, ctx) => {
  if (config.kind !== 'api-suite') throw new Error('wrong config')

  if (!ctx.host) {
    return {
      passed: false,
      checks: [],
      xpAwarded: 0,
      unavailableReason: 'Grading needs the Python engine, which is not running.',
    }
  }

  // The submission is the base URL the learner's server is listening on.
  const baseUrl = submission.trim() || 'http://127.0.0.1:8000'
  const reply = (await ctx.host.gradeApi({ baseUrl, suiteId: config.suiteId })) as ApiGradeReply

  if (!reply.reachable && reply.checks.length === 0) {
    return {
      passed: false,
      checks: [],
      xpAwarded: 0,
      unavailableReason:
        'The Python engine is not running, so your server could not be contacted yet.',
    }
  }

  return resultFrom(reply.checks, ctx.xp)
})
