import { registerCheck } from '../index'
import { lintContent } from '../lint-content'

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
