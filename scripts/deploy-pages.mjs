/**
 * Deploys Conductor to Cloudflare Pages, as the two sites it needs.
 *
 * The two origins have to know about each other before either is built: the
 * app is compiled with the preview's origin baked in, and the preview is
 * served with a frame-ancestors header naming the app. So the projects are
 * created FIRST — a Pages project's URL is `https://<name>.pages.dev`, which
 * is knowable as soon as the name is claimed — and only then is anything
 * built or uploaded.
 *
 *   NAME=conductor npm run deploy
 *
 * Needs `npx wrangler login` first; this script never handles credentials.
 */

import { execFileSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const wrangler = join(root, 'node_modules/.bin/wrangler')

const name = process.env.NAME ?? 'conductor'
const appProject = name
const previewProject = `${name}-preview`
const appOrigin = `https://${appProject}.pages.dev`
const previewOrigin = `https://${previewProject}.pages.dev`

if (!/^[a-z0-9][a-z0-9-]{0,56}[a-z0-9]$/.test(name)) {
  exit(`NAME must be lowercase letters, digits and hyphens: ${name}`)
}

function exit(message) {
  console.error(`\ndeploy — ${message}\n`)
  process.exit(1)
}

function run(args, options = {}) {
  return execFileSync(wrangler, args, { cwd: root, encoding: 'utf8', ...options })
}

function loggedIn() {
  try {
    return run(['whoami'], { stdio: ['pipe', 'pipe', 'pipe'] }).includes('@')
  } catch {
    return false
  }
}

if (!loggedIn()) {
  exit(
    'not logged in to Cloudflare. Run this yourself first, then re-run the deploy:\n\n' +
      '    npx wrangler login',
  )
}

/** Claims a project name, or accepts one this account already owns. */
function ensureProject(project) {
  try {
    run(['pages', 'project', 'create', project, '--production-branch', 'main'], {
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    console.log(`  created  ${project}`)
  } catch (error) {
    const output = `${error.stdout ?? ''}${error.stderr ?? ''}`
    if (/already exists|already in use/i.test(output)) {
      console.log(`  existing ${project}`)
      return
    }
    // A name taken by SOMEONE ELSE is the common first failure, and the fix
    // is a different NAME rather than anything about this repository.
    exit(
      `could not create the project "${project}":\n\n${output.trim()}\n\n` +
        `If the name is taken, pick another: NAME=something-else npm run deploy`,
    )
  }
}

console.log(`\nProjects:\n  ${appOrigin}\n  ${previewOrigin}\n`)
ensureProject(appProject)
ensureProject(previewProject)

console.log('\nBuilding both origins…')
execFileSync('npm', ['run', 'build:web'], {
  cwd: root,
  stdio: 'inherit',
  env: { ...process.env, APP_ORIGIN: appOrigin, PREVIEW_ORIGIN: previewOrigin },
})

// The preview goes up first. If the app went first it would be live and
// pointing at an origin that does not answer yet.
console.log('\nUploading the preview…')
run(['pages', 'deploy', 'out/web/preview', '--project-name', previewProject, '--branch', 'main'], {
  stdio: 'inherit',
})

console.log('\nUploading the app…')
run(['pages', 'deploy', 'out/web/app', '--project-name', appProject, '--branch', 'main'], {
  stdio: 'inherit',
})

console.log(
  [
    '',
    `  Conductor is live at ${appOrigin}`,
    '',
    '  Worth checking once, in that page:',
    '    - the banner names only the Hospital API project',
    '    - lesson 0.2 runs a program',
    `    - lesson 2.1 shows your page, framed from ${previewOrigin}`,
    '',
  ].join('\n'),
)
