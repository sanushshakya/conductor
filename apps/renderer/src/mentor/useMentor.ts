import { useCallback, useState } from 'react'
import type { MentorReply } from '@conductor/shared'
import { host } from '../host'

export interface MentorTurn {
  question: string
  reply: MentorReply
}

/**
 * The mentor conversation for one exercise.
 *
 * Tier rises with each ask and stops at 3, so a learner who keeps pressing
 * gets steadily more help and never the answer. Resetting on a new exercise
 * is deliberate: tier 3 earned on a previous problem should not carry over.
 */
export function useMentor(authoredHints: string[]) {
  const [turns, setTurns] = useState<MentorTurn[]>([])
  const [tier, setTier] = useState<1 | 2 | 3>(1)
  const [asking, setAsking] = useState(false)

  const askMentor = useCallback(
    async (question: string, lessonId?: string, learnerCode?: string, solution?: string) => {
      setAsking(true)
      try {
        const reply = await host().askMentor({
          question,
          tier,
          lessonId,
          learnerCode,
          authoredHints,
          solution,
        })
        setTurns((current) => [...current, { question, reply }])
        setTier((current) => (current < 3 ? ((current + 1) as 2 | 3) : 3))
        return reply
      } finally {
        setAsking(false)
      }
    },
    [tier, authoredHints],
  )

  const reset = useCallback(() => {
    setTurns([])
    setTier(1)
  }, [])

  return { turns, tier, asking, askMentor, reset }
}
