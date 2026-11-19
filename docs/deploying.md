# Deploying Conductor as a website

Conductor runs as a static site. There is nothing to install, no account, and
no server to operate — the whole course, including real Python and a real
SQL database, runs in the learner's browser.

```bash
APP_ORIGIN=https://conductor.example \
PREVIEW_ORIGIN=https://preview.conductor.example \
npm run build:web
```

That produces two directories, which go to **two different origins**:

| Directory | Deploy to | What it is |
|---|---|---|
| `out/web/app` | `APP_ORIGIN` | The app itself |
| `out/web/preview` | `PREVIEW_ORIGIN` | One page, where the learner's own HTML/CSS/JS runs |

Any static host works: Netlify, Cloudflare Pages, GitHub Pages, Vercel, S3.
Two sites on a free tier is enough.

## Why two origins

This is the part that looks like overkill and is not.

The web lessons run code the learner wrote — or that an agent wrote for
them — in a real browser. That code must not be able to touch the app, where
their progress is stored and where the IPC bridge lives.

The obvious answer is `<iframe sandbox="allow-scripts">`. **It does not
work.** A sandboxed frame without `allow-same-origin` gets an *opaque*
origin, and a document with an opaque origin **inherits the embedder's CSP**.
The app is served under `script-src 'self'`, so every inline `<script>` a
learner writes would be silently blocked. Verified in a browser, not inferred
from the spec.

So the isolation comes from the origin instead. On a second origin, the
preview keeps its own CSP (which permits inline scripts, because that is the
whole point) while the same-origin policy keeps it away from the app's page,
storage and bridge.

Elsewhere this comes for free:

- **Development** — `localhost` and `127.0.0.1` are different origins to a
  browser but the same Vite server.
- **The desktop app** — the main process registers a separate `preview://`
  protocol.

A static host gives neither, so the two origins are a deployment decision,
and each side is told about the other: the app learns where the preview
lives, and the preview learns who is allowed to frame it.

### Deploying without the second origin

```bash
npm run build:web
```

This is supported and safe. Tracks 0, 1, 3, 6 and 7 work — including real
Python — and the web lessons tell the learner they need the desktop app
instead of failing silently. The build prints a warning saying so.

What is **not** supported is pointing both at the same origin. The build
refuses it: same origin means the code a learner writes can reach the app.

## Headers

`frame-ancestors` is the one CSP directive a `<meta>` tag cannot carry —
browsers parse it there and ignore it — so it has to be a response header.
The build writes `_headers` (Netlify, Cloudflare Pages) and `vercel.json`
into both directories:

- the app: `frame-ancestors 'none'` — nothing may frame Conductor
- the preview: `frame-ancestors <APP_ORIGIN>` — only Conductor may frame it

On a host that serves neither file, everything still works; that one
restriction is simply not enforced. It is defence in depth rather than the
isolation itself, which comes from the origin boundary above.

## What the browser build cannot do

| | Browser | Desktop |
|---|---|---|
| Tracks 0, 1, 3, 6, 7 | yes | yes |
| Tracks 2 and 5 (web) | with a preview origin | yes |
| Python | real CPython, via Pyodide | real CPython, via a local interpreter |
| Hospital API project | no | yes |
| Live AI mentor | no | yes |

The Hospital API project asks the learner to run a server on their own
machine. A web page cannot reach one, so that project — and only that
project — needs the desktop app. Every lesson in Track 4 works in the
browser, because they are graded by running Python rather than by calling a
server. The authored hints work everywhere; it is only free-form mentor
conversation that needs the desktop app.

The app says all of this in a banner on first load rather than letting a
learner discover it by failing.

## Size

The app is a few hundred KB. Python is about 12MB, downloaded in the
background when the app opens and cached by the browser afterwards — Track 0
never needs it, so it has usually arrived before the learner reaches Track 1.

## Checking a deployment

1. Open `APP_ORIGIN`. The banner should name only what is genuinely missing.
2. Do lesson 0.2 — the first program should run.
3. Do lesson 2.1 — the preview panel should show the page you typed.
4. In the browser console on the app's page, confirm the preview frame's
   `src` points at `PREVIEW_ORIGIN`. If it points back at the app, the build
   did not receive the origin and the web lessons are not isolated.
