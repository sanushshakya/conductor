# Conductor

**Zero to developer, in the age of AI agents.**

### [Try it → course-coding.pages.dev](https://course-coding.pages.dev)

No account, nothing to install. Real Python and a real SQL database, both
running in your browser.

> A conductor cannot play every instrument, but cannot conduct without reading
> every score.

Conductor is an offline-first desktop app that takes someone with no
programming knowledge to shipping a real application built with AI agents. It
exists because the fundamentals now *feel* pointless next to an agent that
writes code for you — so every fundamental here is taught as the thing that
lets you direct and verify one.

## The thesis

**You cannot direct what you cannot read.** An agent will hand you a
confident, broken `JOIN`. Finding it is the job. So every lesson runs:

1. **Grasp it** — an interactive, visual model of the concept.
2. **Direct it** — how you would ask an agent to produce this, as a spec.
3. **Verify it** — the **Agent Duel**: the mentor writes a solution with one
   deliberate, plausible bug. You have to find it.

## The path

| Track | What you build |
|---|---|
| **0 · Boot** | Your first running program, in under 10 minutes |
| **1 · Fundamentals** | The seven things every program does → a patient triage sorter |
| **2 · The Web** | HTML, CSS and JavaScript → a live ward board |
| **3 · SQL** | A real Hospital DBMS: five normalised tables, joins, transactions |
| **4 · REST APIs** | Full CRUD over that schema, graded by real HTTP calls |
| **5 · Frontend** | React, TypeScript and Tailwind over your own API |
| **6 · AI agents** | Ship a prototype with a free agent, then debug what it wrote |
| **7 · Career** | The Tool Atlas, a portfolio from your capstones, next 90 days |

The order is deliberate. The web comes before databases so there is something
to *look at* before there is something to persist; React comes after the API so
there is a real backend to put an interface on — and after hand-writing the
same screen in Track 2, so the learner has felt the problem React solves.

Tracks 0, 2, 3 and 5 run entirely in the app, with **no Python and no network**.
Nothing here needs a subscription, ever.

## Running it

```bash
nvm use          # Node 22 (Electron 45 and Wrangler need >=22.12)
npm install
npm run dev
```

| Command | What it does |
|---|---|
| `npm run dev` | Launch the desktop app with hot reload |
| `npm run dev:web` | Run the whole course in a browser — no Electron needed |
| `npm test` | Vitest unit suite |
| `npm run harness` | Validate all curriculum content and run every reference solution |
| `npm run lint` | Typecheck every workspace |
| `npm run build` | Package the desktop app |
| `npm run build:web` | Build the static site — see [docs/deploying.md](docs/deploying.md) |

## Shipping it

Conductor runs as a static site as well as a desktop app: real Python (via
Pyodide) and a real SQL database (via sql.js) both run in the browser, so
there is nothing to install and nothing to sign.

```bash
APP_ORIGIN=https://conductor.example \
PREVIEW_ORIGIN=https://preview.conductor.example \
npm run build:web
```

The two output directories go to two different origins — the learner's own
web code has to run somewhere it cannot reach the app, and a sandboxed
iframe is not enough, because an opaque origin inherits the embedder's CSP.
[docs/deploying.md](docs/deploying.md) explains it, and what a one-origin
deployment loses.

## Layout

```
apps/main        Electron main process — windows, IPC, sidecar supervision
apps/preload     the only bridge between renderer and main
apps/renderer    React UI — lessons, SQL playground, web preview, duels
services/mentor  Python FastAPI sidecar — code execution, hospital API, mentor
content/         the curriculum, as validated data
packages/shared  types and contracts shared across every boundary
harness/         the checks that keep content honest
docs/superpowers the design doc and implementation plan
```

## Design

- [Design document](docs/superpowers/specs/2026-11-18-conductor-design.md) — intent, goals, anti-goals, approaches considered
- [Implementation plan](docs/superpowers/plans/2026-11-18-conductor.md) — the 20 tasks, phase by phase
