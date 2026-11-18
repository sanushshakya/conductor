# Conductor — Design Document

**Date:** 2026-11-18
**Status:** Approved by owner (owner delegated all open calls; every "my call" below is the author's decision, not the owner's)

> **Conductor** — *Zero to developer, in the age of AI agents.*
> A conductor cannot play every instrument, but cannot conduct without reading every score.

---

## 1. Intent and the why

The owner's 18-year-old brother wants to be a developer. He is hitting the 2027
problem: AI agents now write most of the code, which makes learning
`for` loops and `SELECT` statements feel like learning longhand division next
to a calculator. The motivation is boredom, not inability — the fundamentals
feel pointless, so he never gets far enough to find out they aren't.

Conductor exists to dissolve that specific feeling. Not by skipping the
fundamentals and not by defending them as homework, but by making every
fundamental immediately load-bearing for directing an agent.

### The pedagogical thesis

**You cannot direct what you cannot read.**

An agent will happily hand you a confident, broken `JOIN`. The 2027 developer's
job is reading it, testing it, locating the lie, and knowing what to ask for
next. Every concept in Conductor is taught in three beats:

1. **Grasp it** — a visual, interactive model of the concept.
2. **Direct it** — how you'd ask an agent to produce this, as a spec.
3. **Verify it** — the *Agent Duel*: the in-app mentor writes a solution
   containing one deliberate, plausible bug. The learner must find it.

The Agent Duel is the product's differentiator. It converts "boring basics"
into the exact skill the industry now pays for, and it is a game.

### Why a desktop app

Everything runs locally and offline: a real SQLite database, a real HTTP
server, a real Python interpreter, and (optionally) a local LLM. No accounts,
no subscription, no cloud dependency that can expire mid-course. A learner on a
bad connection in Kathmandu gets exactly the same product as one in San
Francisco.

---

## 2. Goals

- **G1.** A total beginner reaches "I ran my own code and it did something" in
  under 10 minutes from launch, with no setup, no signup, no terminal.
- **G2.** The four-stage spine is fully playable: programming basics → SQL
  (building a real Hospital DBMS) → REST APIs with CRUD → shipping a prototype
  with a free AI agent.
- **G3.** Every exercise is auto-graded in-app with instant feedback. The
  learner never has to wonder whether they got it right.
- **G4.** Zero recurring cost. The built-in mentor runs on a local model
  (Ollama) or a free API tier; external agents are taught as free tiers only.
- **G5.** Engagement is structural, not decorative: XP, streaks, levels,
  badges, boss projects, and the Agent Duel. The learner has a reason to open
  it tomorrow.
- **G6.** Curriculum is **data, not code** — lessons are validated content
  files, so the course can grow without touching the app.
- **G7.** Adult tone. An 18-year-old is treated as an adult beginner: zero
  assumed knowledge, zero condescension, no cartoon mascots.

## 3. Non-goals

- Not a general-purpose IDE. The editor teaches; it does not replace VS Code.
- Not a multi-user or classroom product. Single learner, local profile.
- Not a cloud service. No backend we operate, no telemetry, no accounts.
- Not a certification or assessment authority.
- Not a frontend/CSS course. UI work appears only as agent-directed work in
  Track 4, deliberately, because that is what agents are best at today.
- Not mobile.

## 4. Anti-goals — what would make this a failure even if it works

- **A1. It feels like school.** Reading walls of text with a quiz at the end.
  If a lesson can't be interacted with, it is rewritten or cut.
- **A2. It teaches AI dependence instead of AI direction.** A learner who
  finishes and still cannot tell whether generated code is correct has been
  harmed, not helped. This is why no lesson ever ends at "the agent did it."
- **A3. It rots.** Hard-coding today's free tiers or model names into lesson
  logic guarantees breakage. All volatile facts live in versioned content with
  a `verified_on` date.
- **A4. Setup defeats him.** If the app ever shows a stack trace, a missing
  dependency, or a terminal command as a prerequisite, it has failed its first
  user.
- **A5. Unsolvable content.** A broken grader or impossible exercise destroys
  trust permanently. Every exercise's reference solution is executed in CI.

## 5. Constraints

| Constraint | Value |
|---|---|
| Host machine | macOS (darwin 25.5), Node **18.17.0**, Python **3.12.2**, Docker, git |
| Node floor | 18.17 — rules out Vite 6/7, Electron 33+; pin Vite 5.x, Electron 31.x |
| Native modules | **Forbidden.** No `better-sqlite3`/node-gyp. Avoids electron-rebuild breakage (A4) |
| Offline | Tracks 0–3 must be fully completable with no network |
| Cost | $0 recurring, forever (G4) |
| Python | Must not require the learner to touch a terminal; app provisions its own venv |
| Content | Every lesson validated against a schema at build time (G6, A5) |
| Tone | Adult, direct, second person. No mascots, no "Great job, superstar!" |

---

## 6. Approaches considered

### Approach A — Web app (rejected)
A Vite + React SPA deployed to a static host, Pyodide for Python, sql.js for
SQL.

*Trades off:* Fastest to build and zero install friction. But a real FastAPI
server cannot run in a browser tab, so Track 3 — REST APIs, the bridge between
SQL and shipping — degrades into a simulation. Teaching a fake HTTP server to
someone who needs to build real ones violates the thesis. Also needs hosting we
pay for or that expires (A3). **Rejected on Track 3 authenticity.**

### Approach B — Tauri + Rust sidecar (rejected)
Tauri 2 shell, Rust backend, embedded SQLite.

*Trades off:* ~10× smaller binaries, better memory, excellent SQLite story. But
Rust is not installed, Tauri 2 wants a newer Node than 18.17, and the learner's
own language is Python — a Rust backend means the app's internals are a
language the curriculum never teaches, so the app can never become a teaching
artifact itself. Highest-risk toolchain for the least curricular payoff.
**Rejected on constraint friction.**

### Approach C — Electron + React/TS + Python FastAPI sidecar (**chosen**)
Electron 31 shell, React 18 + TypeScript renderer via electron-vite, and a
bundled Python FastAPI sidecar that Electron spawns on a random port.

*Trades off:* Heaviest install (~200 MB) and two runtimes to supervise. In
exchange:
- Track 3 is **real** — the learner's FastAPI endpoints run in an actual
  uvicorn process, and the grader hits them over real HTTP.
- Python code execution is real CPython, not a WASM approximation.
- The app is written in exactly the two languages it teaches (Python +
  TypeScript), so its own source becomes a legitimate Track 5 reading exercise.
- Mentor API keys stay in the sidecar, never in the renderer.

Install weight is a one-time cost paid by the author, not the learner. Chosen.

### Chosen hybrid detail: SQL runs in the renderer
SQL lessons use **sql.js** (SQLite compiled to WASM) in the renderer, not the
Python sidecar. Rationale: a SQL playground must feel instantaneous and must
work even if the sidecar is still booting or failed to provision. Track 2 — the
centerpiece — therefore has **zero** dependency on Python. The sidecar becomes
required only at Track 3, by which point the learner is invested enough to
survive a 20-second one-time setup screen.

---

## 7. Architecture

```
┌─────────────────────────────────────────────────────────────┐
│ Electron main (TypeScript)                                  │
│  • window + menu lifecycle                                  │
│  • SidecarSupervisor: provisions venv, spawns uvicorn,       │
│    health-checks, restarts, streams status to renderer       │
│  • ProfileStore: JSON progress/XP/streaks (no native deps)   │
│  • IPC surface, contextIsolation on, nodeIntegration off     │
└───────────────┬──────────────────────┬──────────────────────┘
                │ typed IPC (preload)  │ spawn + HTTP/127.0.0.1
┌───────────────▼──────────────┐ ┌─────▼──────────────────────┐
│ Renderer (React 18 + TS)     │ │ Python sidecar (FastAPI)   │
│  • lesson player / tracks     │ │  • /run/python  sandboxed  │
│  • Monaco editor              │ │  • /hospital/*  live CRUD  │
│  • sql.js SQLite (WASM)       │ │  • /mentor/*    LLM proxy  │
│  • visualizers: loop tracer,  │ │  • /grade/api   hits the   │
│    JOIN animator, HTTP trace, │ │    learner's own server    │
│    ER diagram builder         │ │  • Ollama | free API key   │
│  • graders, XP, Agent Duel    │ └────────────────────────────┘
└──────────────────────────────┘
                │
        ┌───────▼────────┐
        │ content/ (data) │  YAML lessons + fixtures + solutions
        └────────────────┘  validated by Zod at build & in CI
```

### Repository layout

```
course-agent/
├─ apps/
│  ├─ main/          Electron main process (TS)
│  ├─ preload/       typed IPC bridge
│  └─ renderer/      React UI
├─ services/mentor/  Python FastAPI sidecar + pytest
├─ content/          curriculum as data (tracks/*.yaml, fixtures/, solutions/)
├─ packages/shared/  TS types shared by main+preload+renderer, Zod schemas
├─ harness/          content linter, solution runner, CI entrypoints
└─ docs/superpowers/ specs + plans
```

### Key technical decisions (author's calls)

| Decision | Choice | Why |
|---|---|---|
| Shell | Electron 31 + electron-vite 2 | Node 18 compatible; one config for main/preload/renderer |
| UI | React 18.3, TypeScript 5.5, Tailwind 3.4, Framer Motion 11 | Motion is load-bearing for the visualizers, not decoration |
| State | Zustand 4.5 | Small, no boilerplate, easy to persist |
| Editor | Monaco via `@monaco-editor/react` | Real editor affordances; what they'll meet in VS Code |
| SQL engine | sql.js 1.10 (SQLite WASM) | Instant, offline, no native build |
| Progress store | JSON file in `app.getPath('userData')` | No native modules (constraint) |
| Python exec | sidecar subprocess, 5 s CPU cap, no network, temp cwd | Real CPython without shipping a sandbox VM |
| Mentor | Provider interface: Ollama (default, offline) → Gemini/Groq free key → scripted fallback | G4; app still teaches with zero AI configured |
| Content format | YAML + Zod schema | Hand-authorable, diffable, machine-validated |
| Tests | Vitest (TS), pytest (Python), Playwright later | Already available; no new runtimes |

### The scripted-fallback mentor (important)

If no LLM is configured, the mentor must still work. Every lesson's content
ships with authored hints (3 escalating tiers) and an authored Agent Duel
(buggy code + the bug's location + explanation). The LLM, when present,
*enriches* — answering free-form follow-ups and generating fresh duels. It is
never a prerequisite. This is what makes G4 and A4 compatible.

---

## 8. Curriculum

Six tracks, ~45 lessons. Each lesson is `grasp → direct → verify`.
Every track ends in a **boss project** that is auto-graded.

### Track 0 — Boot (~30 min) · "Make the computer do something"
Zero concepts. One goal: the 10-minute win (G1).
`0.1` What a program actually is (animated instruction tape) ·
`0.2` Your first line — runs instantly, confetti ·
`0.3` The real developer loop: write → run → **read the error** → fix (they are
handed a broken program in minute ~8, on purpose) ·
`0.4` Meet your mentor, and your first Agent Duel.

### Track 1 — Fundamentals in Python · "The seven things every program does"
Deliberately compressed to seven ideas so it cannot feel like a slog.
`1.1` Values and variables · `1.2` Text and numbers · `1.3` Decisions
(live flow diagram) · `1.4` Repetition (loop tracer shows every iteration's
state) · `1.5` Collections — **framed as "a table is a list of dicts"**, the
hinge into SQL · `1.6` Functions — "naming a procedure is how you talk to an
agent" · `1.7` Errors and tracebacks — the most underrated skill in the trade.
**Boss:** *Patient Triage Sorter* — pure Python over a list of patient dicts.

### Track 2 — SQL and the Hospital DBMS · the centerpiece
Opens by reusing Track 1's boss data, so the learner *feels* the problem: the
list vanished when the program ended, and it won't scale to 10,000 patients.
`2.1` Why databases exist · `2.2` Tables, rows, columns, types ·
`2.3` SELECT / WHERE · `2.4` ORDER BY, LIMIT, COUNT, AVG — "how busy is the
ER?" · `2.5` INSERT / UPDATE / DELETE — admit, treat, discharge ·
`2.6` Schema design and normalization (drag-to-build ER diagram:
patients, doctors, departments, appointments, prescriptions) ·
`2.7` **JOINs** — animated table merge; "which doctor saw which patient" ·
`2.8` GROUP BY / HAVING — department workload report ·
`2.9` Constraints and indexes — foreign-key rejection taught as a *feature* ·
`2.10` Transactions — "the patient was charged but never admitted."
**Boss:** *Hospital DBMS v1* — full schema plus 12 required queries, graded by
executing them against a fixture database and diffing result sets.

### Track 3 — REST APIs and CRUD
`3.1` What the internet actually is: request → response (packet animation) ·
`3.2` **The mapping that makes it click:** POST=INSERT, GET=SELECT,
PUT=UPDATE, DELETE=DELETE · `3.3` JSON — "a dict that travels" ·
`3.4` Your first endpoint, live in-app · `3.5` Path and query params ·
`3.6` POST bodies and Pydantic validation · `3.7` PUT/PATCH/DELETE —
completing CRUD · `3.8` Status codes and error contracts ·
`3.9` Auth basics — why the client is never trusted ·
`3.10` Testing your API with pytest — *"this is how you verify an agent."*
**Boss:** *Hospital API v1* — full CRUD over the Track 2 schema, graded by a
test suite making real HTTP calls to the learner's running server.

### Track 4 — Building with AI agents · the 2027 track
`4.1` What an agent actually is: model + tools + loop ·
`4.2` The $0 landscape — Antigravity, Claude Code, Gemini CLI, Ollama; how to
get each free (content-dated, per A3) · `4.3` Specs beat prompts ·
`4.4` Reading agent output critically — Agent Duel, final form ·
`4.5` Context engineering · `4.6` Git as your undo button for agent work ·
`4.7` **Guided build:** scaffold the Hospital web UI with a real agent in the
real tool, against a verification checklist · `4.8` Debugging what the agent
wrote · `4.9` Ship it free (Docker locally, or a free tier).
**Boss:** *Hospital Suite* — their own API plus an agent-built frontend,
running.

### Track 5 — Career harness
`5.1` **The Tool Atlas** — the explorable map of languages, databases,
frameworks, agents, cloud and DevOps tooling, each tagged
learn-now / later / skip with a 2027 rationale · `5.2` Turning capstones into
portfolio proof · `5.3` Git and GitHub properly · `5.4` Reading docs and
source (Conductor's own source is the exercise) · `5.5` Interviewing when AI
exists · `5.6` A generated next-90-days plan.

---

## 9. Engagement mechanics

- **XP and levels** — XP for lessons, exercises, duels won, bosses cleared.
- **Streaks** — daily, with one forgiveness token per week (punitive streaks
  make people quit; this is deliberate).
- **Badges** — e.g. *First Blood* (first error fixed), *Bug Hunter* (10 duels),
  *Schema Architect*, *CRUD Complete*, *Conductor* (first agent-built feature).
- **Agent Duel** — timed bug hunt against generated-or-authored buggy code.
  Click the offending line; wrong clicks cost time, not progress.
- **Boss projects** — multi-criteria progress bar; each criterion is a real
  graded check, so the bar cannot lie.
- **Instant grading** — every exercise, no "submit and wait."
- **Visualizers** — loop tracer, JOIN animator, HTTP request trace, ER diagram
  builder. These are the anti-A1 weapons.

---

## 10. The harness

The owner explicitly asked for a harness. It is the machinery that keeps a
45-lesson data-driven course from silently rotting (A3, A5):

1. **Content schema validation** — every lesson YAML parsed against Zod;
   unknown fields, missing hints, or absent grader configs fail the build.
2. **Solution runner** — for every exercise, the authored reference solution is
   executed against that exercise's own grader. If a reference solution fails,
   the exercise is unsolvable and CI goes red. This is the single most
   important harness check in the project.
3. **Duel integrity** — every Agent Duel's "correct" code must pass the
   grader and its buggy variant must fail it. A duel with no detectable bug is
   a broken duel.
4. **Unit tests** — Vitest for graders, XP math, stores; pytest for the
   sidecar, sandbox limits, and hospital CRUD.
5. **Prose linting** — forbidden-tone check (no "Great job!", no mascot
   voice, per G7) and a `verified_on` freshness check on volatile Track 4
   facts.
6. **CI** — GitHub Actions running all of the above on Node 18 and Python 3.12.

---

## 11. What is left to the builder

- Exact Tailwind palette and type scale, within the stated adult tone.
- Internal component decomposition of the renderer beyond the named
  visualizers.
- Precise sandbox enforcement mechanism for `/run/python` (rlimits vs
  subprocess flags vs Docker), provided the stated caps hold.
- Lesson prose wording, provided it passes the tone lint.
- Animation easing and timing.

## 12. Delivery order

| Phase | Outcome |
|---|---|
| **P1** | Scaffold + harness + typed IPC + profile store. App boots, tests run in CI. |
| **P2** | Lesson engine, content schema, Monaco, grader framework, XP/streaks. Track 0 fully playable. |
| **P3** | sql.js playground, JOIN animator, ER builder, SQL graders. **Track 2 playable end-to-end, offline.** |
| **P4** | Python sidecar: provisioning, sandboxed exec, hospital CRUD, API grader. Tracks 1 and 3 playable. |
| **P5** | Mentor providers + Agent Duel engine. |
| **P6** | Tracks 4–5 content, Tool Atlas, packaging (`electron-builder` + PyInstaller), portfolio export. |

P1–P4 is the minimum that delivers the owner's stated spine. P3 before P4 is
deliberate: it front-loads the centerpiece and keeps the first playable
milestone free of Python-provisioning risk.
