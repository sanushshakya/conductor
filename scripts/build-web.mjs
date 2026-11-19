/**
 * Builds the static site, as two separate deployments.
 *
 * The learner's HTML/CSS/JS has to run somewhere that is not the app's own
 * origin. A sandboxed iframe is not enough: a sandboxed frame without
 * `allow-same-origin` has an opaque origin, and an opaque origin INHERITS THE
 * EMBEDDER'S CSP, so the app's `script-src 'self'` would block every inline
 * script a learner writes. Verified in a browser, not inferred.
 *
 * In development the two origins come free (`localhost` and `127.0.0.1` are
 * different origins to a browser, same server). The desktop app registers a
 * `preview://` protocol. A static host gives neither, so the second origin is
 * a deployment decision — and the two sides have to be told about each other:
 *
 *   out/web/app      → deploy to APP_ORIGIN,     built knowing PREVIEW_ORIGIN
 *   out/web/preview  → deploy to PREVIEW_ORIGIN, built knowing APP_ORIGIN
 *                      (frame-ancestors, so only the app may frame it)
 *
 * Built with neither, the site still works: Tracks 0, 1, 3, 6 and 7 run, and
 * the web lessons say they need the desktop app instead of failing silently.
 */

import { execFileSync } from 'node:child_process'
import { cpSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { planWebBuild, rewriteFrameSrc } from './web-build-plan.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const out = join(root, 'out/web')
const appOut = join(out, 'app')
const previewOut = join(out, 'preview')

const plan = planWebBuild(process.env)
if (!plan.ok) {
  console.error(`\nbuild:web — ${plan.error}\n`)
  process.exit(1)
}
const { appOrigin, previewOrigin } = plan

// Pyodide is ~12MB copied out of node_modules, and is gitignored. Without
// it the site builds, loads, looks correct, and has no Python — Tracks 1
// and 4 would quietly go dark on a fresh clone.
const pyodideDir = join(root, 'apps/renderer/public/pyodide')
if (!existsSync(join(pyodideDir, 'pyodide.asm.wasm'))) {
  console.error(
    '\nbuild:web — Python is missing from apps/renderer/public/pyodide.\n' +
      'Run `node scripts/sync-pyodide.mjs` (npm install does this too).\n',
  )
  process.exit(1)
}

rmSync(out, { recursive: true, force: true })

execFileSync('npx', ['vite', 'build', '--config', 'vite.web.config.ts', '--outDir', appOut], {
  cwd: root,
  stdio: 'inherit',
  env: { ...process.env, VITE_PREVIEW_ORIGIN: previewOrigin ?? '' },
})

// The preview origin reaches the app through a build-time substitution,
// and a substitution that does not happen is not an error: the value becomes
// undefined, the app falls back to its development guess, and the web track
// renders on an origin nobody deployed. The unit tests pass either way,
// because they supply the value directly. So the bundle is checked.
if (plan.webTrackIncluded) {
  const bundles = readdirSync(join(appOut, 'assets')).filter((f) => f.endsWith('.js'))
  const baked = bundles.some((f) =>
    readFileSync(join(appOut, 'assets', f), 'utf8').includes(previewOrigin),
  )
  if (!baked) {
    console.error(
      `\nbuild:web — PREVIEW_ORIGIN (${previewOrigin}) did not reach the bundle.\n` +
        'The web track would silently render on the wrong origin, so this build is refused.\n',
    )
    process.exit(1)
  }
}

// The app's own CSP decides what it is allowed to frame, and the source
// list names the development hosts and the desktop app's preview:// scheme
// — none of which a deployed app uses. Without this the deployed app
// refuses to frame its own preview and the web lessons show an empty panel.
if (plan.webTrackIncluded) {
  const indexPath = join(appOut, 'index.html')
  const rewritten = rewriteFrameSrc(readFileSync(indexPath, 'utf8'), previewOrigin)
  if (rewritten === null) {
    console.error(
      '\nbuild:web — no frame-src found in the built index.html.\n' +
        "The app's CSP has changed shape; the deployed app would refuse to frame the preview.\n",
    )
    process.exit(1)
  }
  writeFileSync(indexPath, rewritten)
}

// The preview document is served from the OTHER origin, so it must not also
// be sitting on the app's.
const strayPreview = join(appOut, 'preview.html')
if (existsSync(strayPreview)) rmSync(strayPreview)

mkdirSync(previewOut, { recursive: true })
cpSync(join(root, 'apps/renderer/public/preview.html'), join(previewOut, 'preview.html'))

// Hosts that serve a single-page app need the entry point; the preview site
// is one file and wants an index of its own rather than a 404.
cpSync(join(root, 'scripts/preview-index.html'), join(previewOut, 'index.html'))

/**
 * Who may frame each site.
 *
 * This has to be a response header: `frame-ancestors` is the one CSP
 * directive a <meta> tag cannot carry — browsers parse it there and ignore
 * it — so a static host has to be configured, and a host that serves no
 * custom headers cannot enforce it at all.
 *
 * `_headers` covers Netlify and Cloudflare Pages; `vercel.json` covers
 * Vercel. Both are inert on hosts that do not read them.
 */
function writeHeaders(dir, policy) {
  writeFileSync(join(dir, '_headers'), `/*\n  Content-Security-Policy: ${policy}\n`)
  writeFileSync(
    join(dir, 'vercel.json'),
    JSON.stringify(
      {
        headers: [
          {
            source: '/(.*)',
            headers: [{ key: 'Content-Security-Policy', value: policy }],
          },
        ],
      },
      null,
      2,
    ) + '\n',
  )
}

// Nothing frames the app; only the app frames the preview. Without a
// configured app origin there is no one to allow, so nobody is.
writeHeaders(appOut, plan.appFrameAncestors)
writeHeaders(previewOut, plan.previewFrameAncestors)

if (appOrigin === null) {
  console.warn(
    [
      '',
      'Built WITHOUT a preview origin.',
      '',
      'Tracks 0, 1, 3, 6 and 7 work. The web lessons (Tracks 2 and 5) will tell',
      'learners they need the desktop app, because the code they write has',
      'nowhere safe to run: on the app\'s own origin it could reach the app.',
      '',
      'To include them, deploy out/web/preview to a second origin and rebuild:',
      '',
      '    APP_ORIGIN=https://conductor.example \\',
      '    PREVIEW_ORIGIN=https://preview.conductor.example \\',
      '    npm run build:web',
      '',
    ].join('\n'),
  )
} else {
  console.log(
    [
      '',
      `  out/web/app      → ${appOrigin}`,
      `  out/web/preview  → ${previewOrigin}`,
      '',
    ].join('\n'),
  )
}
