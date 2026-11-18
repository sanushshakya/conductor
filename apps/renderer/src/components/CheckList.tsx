import type { CheckResult } from '@conductor/shared'
import { Markdown } from './Markdown'

/**
 * Graded criteria, shown individually.
 *
 * A single pass/fail verdict tells a learner they are wrong without telling
 * them where. One row per check turns "it failed" into "these three worked and
 * this one did not", which is the difference between a dead end and a next step.
 */
export function CheckList({ checks }: { checks: CheckResult[] }) {
  if (checks.length === 0) return null

  return (
    <ul className="mt-4 space-y-2">
      {checks.map((check) => (
        <li
          key={check.id}
          className={`animate-fade-up rounded-lg border px-4 py-3 text-sm ${
            check.passed
              ? 'border-verify-600/40 bg-verify-600/10'
              : 'border-wrong-500/40 bg-wrong-500/10'
          }`}
        >
          <div className="flex items-start gap-2">
            <span aria-hidden className={check.passed ? 'text-verify-400' : 'text-wrong-400'}>
              {check.passed ? '✓' : '✗'}
            </span>
            <div className="min-w-0 flex-1">
              <div className={check.passed ? 'text-verify-400' : 'text-wrong-400'}>
                <span className="sr-only">{check.passed ? 'Passed: ' : 'Failed: '}</span>
                {check.label}
              </div>
              {check.detail && (
                <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-words font-mono text-xs text-parchment-300">
                  {check.detail}
                </pre>
              )}
            </div>
          </div>
        </li>
      ))}
    </ul>
  )
}
