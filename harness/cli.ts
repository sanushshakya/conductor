/** Harness entrypoint for `npm run harness`. Registers every check, then runs them. */
import { runHarness } from './index'
import './checks/content'

const contentDir = process.argv[2] ?? 'content'

runHarness(contentDir).then((ok) => {
  process.exit(ok ? 0 : 1)
})
