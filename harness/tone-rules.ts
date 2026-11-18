/**
 * Tone is a product requirement, not a style preference.
 *
 * The learner this is built for is 18 and has been put off programming by
 * things that talk down to him. Cheerleading copy reads as a children's app
 * and costs the course its credibility on the first screen, so the phrases
 * below cannot appear in learner-facing text and CI enforces that.
 */
export const FORBIDDEN_PHRASES = [
  'Great job',
  'Awesome sauce',
  'You rock',
  'superstar',
  'buddy',
  'kiddo',
  'Way to go',
  'Good boy',
  'Yay',
] as const

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Returns the forbidden phrases present in `text`, spelled as they appear in
 * FORBIDDEN_PHRASES. Matching is case-insensitive and respects word
 * boundaries, so "buddybot" is not a violation but "Hey buddy" is.
 */
export function checkTone(text: string): string[] {
  const found: string[] = []
  for (const phrase of FORBIDDEN_PHRASES) {
    const re = new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(phrase)}(?![\\p{L}\\p{N}])`, 'iu')
    if (re.test(text)) found.push(phrase)
  }
  return found
}
