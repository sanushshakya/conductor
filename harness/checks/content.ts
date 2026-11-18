import { registerCheck } from '../index'
import { lintContent } from '../lint-content'
import { runAllSolutions } from '../run-solutions'

registerCheck({
  name: 'content-schema',
  run(contentDir) {
    const report = lintContent(contentDir)
    return {
      ok: report.ok,
      summary: report.ok
        ? `${report.lessonCount} lessons, ${report.bosses.length} bosses, ${report.duels.length} duels validated`
        : `${report.errors.length} problem(s) in ${contentDir}`,
      failures: report.errors.map((e) => `${e.file} — ${e.message}`),
    }
  },
})

registerCheck({
  name: 'reference-solutions',
  async run(contentDir) {
    const report = await runAllSolutions(contentDir)
    return {
      ok: report.ok,
      summary: report.ok
        ? `all ${report.total} reference solutions pass their own graders`
        : `${report.failures.length} unsolvable exercise(s), ${report.duelFailures.length} broken duel(s)`,
      failures: [
        ...report.failures.map((f) => `${f.lessonId} / ${f.exerciseId} — ${f.reason}`),
        ...report.duelFailures.map((f) => `duel ${f.duelId} — ${f.reason}`),
      ],
    }
  },
})
