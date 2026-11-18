# Conductor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Conductor, an offline-first Electron desktop app that takes a zero-knowledge 18-year-old from "what is a program" to shipping an AI-agent-built Hospital application, via programming basics → SQL → REST CRUD → agent direction.

**Architecture:** Electron 31 shell with a React 18 + TypeScript renderer (electron-vite). SQL lessons run entirely in the renderer on sql.js (SQLite WASM) so the centerpiece track is offline and Python-free. A Python 3.12 FastAPI sidecar, provisioned and supervised by the Electron main process, provides real CPython execution, a live Hospital CRUD API, the LLM mentor proxy, and HTTP-level grading of the learner's own server. Curriculum is YAML data validated by Zod and guarded by a harness that executes every reference solution in CI.

**Tech Stack:** Electron 31, electron-vite 2, React 18.3, TypeScript 5.5, Tailwind 3.4, Framer Motion 11, Zustand 4.5, Monaco, sql.js 1.10, Zod 3, Vitest 2 · Python 3.12, FastAPI, uvicorn, Pydantic 2, pytest, httpx

**Spec:** `docs/superpowers/specs/2026-11-18-conductor-design.md`

## Global Constraints

- Node floor is **18.17.0**. Pin Vite **5.x**, Electron **31.x**, electron-vite **2.x**. Never introduce a dependency requiring Node ≥ 20.
- Python is **3.12.2**. Sidecar must not require any other interpreter.
- **No native Node modules.** No `better-sqlite3`, no `node-gyp`, no `electron-rebuild`. Progress persistence is JSON on disk.
- Electron security: `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`. All main-process access goes through the typed preload bridge.
- Tracks 0–3 must be fully completable **with no network access**.
- **$0 recurring cost.** No dependency on a paid API. Mentor must function with zero LLM configured.
- Tone: adult, direct, second person. Forbidden strings in learner-facing copy: `Great job`, `superstar`, `buddy`, `kiddo`, `Awesome sauce`, `You rock`. Enforced by lint.
- Every lesson YAML must carry `id`, `track`, `title`, `estimate_minutes`, `beats`, and for every exercise: three escalating `hints` and a `grader` block.
- Volatile Track 4 facts (free tiers, model names, tool names) must carry a `verified_on: YYYY-MM-DD` field.
- All IPC channel names are declared once in `packages/shared/src/ipc.ts` and imported; no string literals at call sites.

## Review Focus

Failure modes the spec implies that no feature task's happy path exercises. Each has a test pinned to the task that owns the code.

1. **Sidecar unavailable** — port in use, venv provisioning fails, or no Python. The app must enter a labelled offline mode where Tracks 0 and 2 stay fully playable; it must never show a stack trace or block the UI. *(Task 12)*
2. **Learner Python that misbehaves** — infinite loop, huge allocation, megabytes of stdout, or an attempted network call. Must be killed at the cap and output truncated with an explanatory message, not hang the sidecar. *(Task 13)*
3. **Corrupted or partially written profile** — a crash mid-save, or hand-edited JSON. Must recover to the last good profile rather than losing all progress or failing to boot. *(Task 4)*
4. **Malformed or hostile learner SQL** — syntax errors, `DROP TABLE`, a cartesian join over fixtures. Must surface as a teaching-grade error message inside the lesson, with the fixture DB resettable, never a blank screen. *(Task 8)*
5. **Day-boundary and clock behaviour for streaks** — timezone change, clock set backwards, two sessions in one calendar day, a 36-hour gap. Must neither silently void a legitimate streak nor let repeated same-day visits inflate it. *(Task 6)*

---

## Phase 1 — Foundation and harness

### Task 1: Repository scaffold and CI

**Files:**
- Create: `package.json`, `tsconfig.base.json`, `electron.vite.config.ts`, `.gitignore`, `.nvmrc`, `README.md`
- Create: `packages/shared/package.json`, `packages/shared/src/index.ts`
- Create: `vitest.config.ts`, `.github/workflows/ci.yml`
- Test: `packages/shared/src/version.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: npm workspaces `@conductor/shared`, `@conductor/main`, `@conductor/preload`, `@conductor/renderer`. Root scripts `dev`, `build`, `test`, `lint`, `harness`. Exported `CONDUCTOR_VERSION: string` from `@conductor/shared`.

- [ ] **Step 1: Write the failing test**

```ts
// packages/shared/src/version.test.ts
import { CONDUCTOR_VERSION } from './index'
test('exports a semver version string', () => {
  expect(CONDUCTOR_VERSION).toMatch(/^\d+\.\d+\.\d+$/)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/shared` — Expected: FAIL, cannot resolve `./index`.

- [ ] **Step 3: Create the workspace root and `@conductor/shared`**

npm workspaces (no pnpm/bun — not installed). `.nvmrc` pins `18.17.0`. Root `package.json` declares the four workspaces and the scripts in Interfaces. `tsconfig.base.json` sets `strict: true`, `moduleResolution: "bundler"`, `target: "ES2022"`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run packages/shared` — Expected: PASS.

- [ ] **Step 5: Add CI workflow**

`.github/workflows/ci.yml`: matrix-free job on `ubuntu-latest`, Node 18.17 and Python 3.12, running `npm ci`, `npm run lint`, `npm run test`, `npm run harness`.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "chore: scaffold workspaces, vitest, CI"
```

---

### Task 2: Shared domain types and IPC contract

**Files:**
- Create: `packages/shared/src/domain.ts`, `packages/shared/src/ipc.ts`
- Test: `packages/shared/src/ipc.test.ts`

**Interfaces:**
- Consumes: Task 1 workspace.
- Produces:
  - `type TrackId = 'boot' | 'fundamentals' | 'sql' | 'api' | 'agents' | 'career'`
  - `interface LessonRef { id: string; track: TrackId; title: string; estimateMinutes: number }`
  - `interface ExerciseResult { passed: boolean; checks: CheckResult[]; xpAwarded: number }`
  - `interface CheckResult { id: string; label: string; passed: boolean; detail?: string }`
  - `interface Profile { id, displayName, xp, level, streak: StreakState, completedLessons: string[], badges: string[], exerciseResults: Record<string, ExerciseResult>, createdAt, updatedAt }`
  - `interface StreakState { current: number; longest: number; lastActiveDay: string /* YYYY-MM-DD local */; forgivenessTokens: number }`
  - `interface SidecarStatus { state: 'stopped'|'provisioning'|'starting'|'ready'|'failed'; port?: number; message?: string }`
  - `const IPC` — frozen map of every channel name.
  - `interface ConductorApi` — the exact shape exposed on `window.conductor`.

- [ ] **Step 1: Write the failing test**

```ts
test('IPC channel names are unique and namespaced', () => {
  const values = Object.values(IPC)
  expect(new Set(values).size).toBe(values.length)
  values.forEach(v => expect(v).toMatch(/^conductor:[a-z-]+:[a-z-]+$/))
})
```

- [ ] **Step 2: Run it** — Expected: FAIL, `IPC` not exported.

- [ ] **Step 3: Implement `domain.ts` and `ipc.ts`**

`IPC` is `Object.freeze({...})` with channels at minimum: `profile:get`, `profile:update`, `profile:reset`, `sidecar:status`, `sidecar:start`, `python:run`, `mentor:ask`, `grade:api`, `shell:open-external`, `content:list`.

- [ ] **Step 4: Run it** — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(shared): domain types and IPC contract"
```

---

### Task 3: Content schema and the content linter

**Files:**
- Create: `packages/shared/src/content-schema.ts`
- Create: `harness/lint-content.ts`, `harness/tone-rules.ts`
- Create: `content/tracks/boot.yaml` (one real lesson, to validate against)
- Test: `packages/shared/src/content-schema.test.ts`, `harness/lint-content.test.ts`

**Interfaces:**
- Consumes: `TrackId` from Task 2.
- Produces:
  - `LessonSchema`, `TrackSchema`, `ExerciseSchema`, `BeatSchema` (Zod), all `.strict()`
  - `type Lesson = z.infer<typeof LessonSchema>` etc.
  - `function lintContent(dir: string): LintReport`
  - `interface LintReport { ok: boolean; errors: LintError[]; lessonCount: number }`
  - `function checkTone(text: string): string[]` — returns violating phrases.

A `Beat` is a discriminated union on `kind`: `prose` | `visual` | `code` | `sql` | `quiz` | `duel` | `checkpoint`. A `visual` beat names a registered visualizer id. An `exercise` carries `prompt`, `starter`, `solution`, `hints` (exactly 3), and `grader`.

- [ ] **Step 1: Write the failing tests**

```ts
test('rejects a lesson with fewer than three hints', () => {
  expect(LessonSchema.safeParse(lessonWith(2, 'hints')).success).toBe(false)
})
test('rejects unknown top-level keys', () => { /* .strict() */ })
test('requires verified_on when a beat has volatile: true', () => { ... })
test('checkTone flags forbidden praise', () => {
  expect(checkTone('Great job, superstar!')).toEqual(['Great job', 'superstar'])
})
test('lintContent reports the real boot track as ok', () => {
  expect(lintContent('content').ok).toBe(true)
})
```

- [ ] **Step 2: Run them** — Expected: FAIL, module missing.

- [ ] **Step 3: Implement the schemas, `checkTone`, and `lintContent`**

`lintContent` walks `content/tracks/*.yaml`, parses with `yaml`, validates each against `TrackSchema`, runs `checkTone` over every prose/prompt/hint string, and asserts globally unique lesson ids.

- [ ] **Step 4: Run them** — Expected: PASS.

- [ ] **Step 5: Wire `npm run harness` to call the linter and exit non-zero on failure. Commit.**

```bash
git add -A && git commit -m "feat(harness): content schema + tone linter"
```

---

### Task 4: Profile store with atomic writes and recovery

**Files:**
- Create: `apps/main/src/profile-store.ts`
- Test: `apps/main/src/profile-store.test.ts`

**Interfaces:**
- Consumes: `Profile`, `StreakState` from Task 2.
- Produces:
  - `class ProfileStore { constructor(dir: string); load(): Profile; save(p: Profile): void; reset(): Profile }`
  - Writes `profile.json`; keeps `profile.bak.json` as the last known-good.

- [ ] **Step 1: Write the failing tests** — covers Review Focus #3.

```ts
test('load() returns a fresh profile when no file exists', ...)
test('save() then load() round-trips xp and completedLessons', ...)
test('load() recovers from backup when profile.json is truncated JSON', () => {
  writeFileSync(dir+'/profile.json', '{"xp":4')        // crash mid-write
  writeFileSync(dir+'/profile.bak.json', JSON.stringify(goodProfile))
  expect(new ProfileStore(dir).load().xp).toBe(goodProfile.xp)
})
test('load() returns a fresh profile when both files are unreadable', ...)
test('save() never leaves profile.json partially written', () => { /* tmp+rename */ })
```

- [ ] **Step 2: Run them** — Expected: FAIL.

- [ ] **Step 3: Implement `ProfileStore`**

Write to `profile.tmp.json`, `fsync`, then `rename` over `profile.json` (atomic on APFS); promote the previous file to `.bak.json` first. On `load`, try primary → backup → fresh, validating with a Zod `ProfileSchema`.

- [ ] **Step 4: Run them** — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(main): atomic profile store with backup recovery"
```

---

### Task 5: Electron shell, preload bridge, and window lifecycle

**Files:**
- Create: `apps/main/src/index.ts`, `apps/main/src/ipc-handlers.ts`
- Create: `apps/preload/src/index.ts`
- Create: `apps/renderer/index.html`, `apps/renderer/src/main.tsx`, `apps/renderer/src/App.tsx`
- Create: `apps/renderer/src/styles.css`, `tailwind.config.ts`, `postcss.config.js`
- Test: `apps/preload/src/index.test.ts`

**Interfaces:**
- Consumes: `IPC`, `ConductorApi` (Task 2), `ProfileStore` (Task 4).
- Produces: `window.conductor: ConductorApi` in the renderer. Main registers one handler per `IPC` channel.

- [ ] **Step 1: Write the failing test**

```ts
test('exposes exactly the ConductorApi surface, no raw ipcRenderer', () => {
  expect(Object.keys(buildApi(fakeIpc)).sort()).toEqual(expectedApiKeys.sort())
})
test('every IPC channel has a main-process handler registered', () => {
  registerHandlers(fakeIpcMain, deps)
  expect(fakeIpcMain.registered.sort()).toEqual(Object.values(IPC).sort())
})
```

- [ ] **Step 2: Run them** — Expected: FAIL.

- [ ] **Step 3: Implement main, preload, and a minimal renderer**

`BrowserWindow` 1280×860, `minWidth: 1024`, `titleBarStyle: 'hiddenInset'`, security flags per Global Constraints. Preload uses `contextBridge.exposeInMainWorld('conductor', buildApi(ipcRenderer))`. Dark-first Tailwind theme; renderer shows app name, version, and sidecar status badge.

- [ ] **Step 4: Run tests, then `npm run dev` and confirm the window renders with no console errors.**

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(app): electron shell with typed preload bridge"
```

---

## Phase 2 — Lesson engine and Track 0

### Task 6: Progression engine — XP, levels, streaks, badges

**Files:**
- Create: `packages/shared/src/progression.ts`
- Test: `packages/shared/src/progression.test.ts`

**Interfaces:**
- Consumes: `Profile`, `StreakState`, `ExerciseResult`.
- Produces:
  - `function levelForXp(xp: number): { level: number; xpIntoLevel: number; xpForNext: number }`
  - `function awardXp(p: Profile, amount: number): Profile`
  - `function touchStreak(p: Profile, now: Date): Profile`
  - `function evaluateBadges(p: Profile): string[]`
  - `const XP = { lessonComplete: 50, exercisePass: 25, duelWin: 40, bossClear: 250 }`

Level curve: `level = floor(sqrt(xp / 100)) + 1` — pinned here because tests assert exact boundaries.

- [ ] **Step 1: Write the failing tests** — covers Review Focus #5.

```ts
test('levelForXp boundaries', () => {
  expect(levelForXp(0).level).toBe(1)
  expect(levelForXp(100).level).toBe(2)
  expect(levelForXp(400).level).toBe(3)
})
test('two visits on the same local day do not increment the streak', ...)
test('a visit on the next local day increments the streak', ...)
test('a 36-hour gap spends a forgiveness token and keeps the streak', ...)
test('a gap with no tokens resets current but preserves longest', ...)
test('a clock set backwards does not reduce current or longest', ...)
test('crossing a timezone boundary does not double-count a day', ...)
test('evaluateBadges awards first-blood after the first exercise pass', ...)
```

- [ ] **Step 2: Run them** — Expected: FAIL.

- [ ] **Step 3: Implement `progression.ts`**

All day comparisons use local `YYYY-MM-DD` strings, never epoch arithmetic — this is what makes the timezone and clock-skew tests pass. Pure functions only; no I/O.

- [ ] **Step 4: Run them** — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(shared): XP, level, streak and badge engine"
```

---

### Task 7: Lesson player, grader framework, and Track 0 content

**Files:**
- Create: `apps/renderer/src/lesson/LessonPlayer.tsx`, `BeatRenderer.tsx`, `CodeBeat.tsx`, `QuizBeat.tsx`, `ProseBeat.tsx`
- Create: `apps/renderer/src/grading/index.ts`, `apps/renderer/src/grading/graders.ts`
- Create: `apps/renderer/src/store/useProfile.ts`, `useLesson.ts`
- Create: `apps/renderer/src/components/{Editor,TrackMap,XpBar,HintStack,Confetti}.tsx`
- Create: `content/tracks/boot.yaml` (complete: lessons 0.1–0.4)
- Test: `apps/renderer/src/grading/graders.test.ts`, `apps/renderer/src/lesson/LessonPlayer.test.tsx`

**Interfaces:**
- Consumes: progression (Task 6), content schema (Task 3), `window.conductor` (Task 5).
- Produces:
  - `type Grader = (submission: string, config: GraderConfig, ctx: GradeContext) => Promise<ExerciseResult>`
  - `function registerGrader(kind: string, g: Grader): void`
  - `function grade(submission, config, ctx): Promise<ExerciseResult>`
  - Grader kinds registered here: `quiz`, `output-match`, `regex-contains`.
  - `<LessonPlayer lessonId>` — renders beats sequentially with a persistent progress rail.

- [ ] **Step 1: Write the failing tests**

```ts
test('output-match grader passes on exact expected stdout', ...)
test('output-match grader trims trailing whitespace before comparing', ...)
test('output-match grader returns a per-check detail on mismatch', ...)
test('quiz grader marks a multi-select answer wrong when partially correct', ...)
test('grade() throws a named error for an unregistered grader kind', ...)
test('LessonPlayer advances only when the current beat is satisfied', ...)
test('HintStack reveals one tier at a time and never skips to the solution', ...)
```

- [ ] **Step 2: Run them** — Expected: FAIL.

- [ ] **Step 3: Implement the engine and author Track 0**

Lesson 0.3 must hand the learner a program that is already broken and require them to fix it — the spec's minute-8 beat. Track 0 exercises use only `output-match` and `quiz`, so Track 0 has no sidecar dependency (Python beats in Track 0 run via the sidecar when ready, and fall back to a prepared transcript when not — see Task 12).

- [ ] **Step 4: Run tests; then `npm run harness` to confirm `boot.yaml` lints.**

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(renderer): lesson player, grader framework, Track 0"
```

---

## Phase 3 — The centerpiece: SQL and the Hospital DBMS

### Task 8: SQL engine, playground, and resettable fixture database

**Files:**
- Create: `apps/renderer/src/sql/engine.ts`, `SqlPlayground.tsx`, `ResultTable.tsx`, `SchemaPanel.tsx`
- Create: `content/fixtures/hospital.sql` (schema + ~200 seeded rows across 5 tables)
- Test: `apps/renderer/src/sql/engine.test.ts`

**Interfaces:**
- Consumes: sql.js, `CheckResult`.
- Produces:
  - `class SqlEngine { static create(fixtureSql: string): Promise<SqlEngine>; exec(sql: string): SqlRunResult; reset(): void; schema(): TableInfo[] }`
  - `interface SqlRunResult { ok: boolean; tables: ResultSet[]; error?: SqlTeachingError; rowsAffected: number; ms: number }`
  - `interface SqlTeachingError { raw: string; friendly: string; hint?: string }`

- [ ] **Step 1: Write the failing tests** — covers Review Focus #4.

```ts
test('exec runs SELECT and returns typed columns and rows', ...)
test('exec on a syntax error returns ok:false with a friendly message', () => {
  const r = engine.exec('SELCT * FROM patients')
  expect(r.ok).toBe(false)
  expect(r.error!.friendly).toMatch(/near "SELCT"/i)
})
test('a foreign-key violation is reported as a teaching error, not thrown', ...)
test('reset() restores the fixture after DROP TABLE patients', ...)
test('exec truncates result sets above 500 rows and flags truncation', ...)
test('schema() lists all five tables with their foreign keys', ...)
```

- [ ] **Step 2: Run them** — Expected: FAIL.

- [ ] **Step 3: Implement `SqlEngine` and the hospital fixture**

Fixture tables: `departments`, `doctors`, `patients`, `appointments`, `prescriptions`, with `PRAGMA foreign_keys = ON`. `SqlTeachingError.friendly` maps the ~8 most common SQLite messages a beginner hits to plain language; unmapped messages pass through with the raw text preserved.

- [ ] **Step 4: Run them** — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(sql): sql.js engine, hospital fixture, teaching errors"
```

---

### Task 9: SQL graders — result-set equivalence

**Files:**
- Create: `apps/renderer/src/grading/sql-graders.ts`
- Test: `apps/renderer/src/grading/sql-graders.test.ts`

**Interfaces:**
- Consumes: `SqlEngine` (Task 8), `registerGrader` (Task 7).
- Produces: grader kinds `sql-result` (compares the learner's result set to the reference query's), `sql-schema` (asserts tables/columns/constraints exist), `sql-mutation` (runs the learner's DML, then verifies with a reference SELECT).

- [ ] **Step 1: Write the failing tests**

```ts
test('sql-result passes when rows match the reference query', ...)
test('sql-result passes when column order differs but orderSensitive is false', ...)
test('sql-result fails when the learner hardcodes the answer as literals', () => {
  // graded against a second fixture variant, so literals cannot pass
})
test('sql-schema fails when a required foreign key is missing', ...)
test('sql-mutation verifies effect, not the SQL text', ...)
```

- [ ] **Step 2: Run them** — Expected: FAIL.

- [ ] **Step 3: Implement the three graders**

Anti-hardcoding is structural: `sql-result` evaluates against the primary fixture *and* a perturbed variant, and both must match the reference. That test is the reason the grader cannot be gamed.

- [ ] **Step 4: Run them** — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(grading): SQL result, schema and mutation graders"
```

---

### Task 10: Visualizers — JOIN animator, ER builder, loop tracer

**Files:**
- Create: `apps/renderer/src/visualizers/registry.ts`, `JoinAnimator.tsx`, `ErDiagramBuilder.tsx`, `LoopTracer.tsx`, `HttpTrace.tsx`
- Test: `apps/renderer/src/visualizers/registry.test.ts`, `JoinAnimator.test.tsx`

**Interfaces:**
- Consumes: Framer Motion, `SqlEngine`.
- Produces:
  - `function registerVisualizer(id: string, c: React.FC<VisualizerProps>): void`
  - `function getVisualizer(id: string): React.FC<VisualizerProps>`
  - Registered ids: `join-animator`, `er-builder`, `loop-tracer`, `http-trace`, `instruction-tape`.
  - `interface VisualizerProps { config: Record<string, unknown>; onComplete?: () => void }`

- [ ] **Step 1: Write the failing tests**

```ts
test('every visual beat id in content/ resolves to a registered visualizer', () => {
  // reads real content; this is the test that stops content referencing a missing visual
})
test('JoinAnimator renders only matched rows for an INNER join', ...)
test('JoinAnimator renders unmatched left rows with null padding for LEFT join', ...)
test('ErDiagramBuilder reports a validation error for a relationship with no key', ...)
test('LoopTracer emits one frame per iteration with the variable state of that step', ...)
```

- [ ] **Step 2: Run them** — Expected: FAIL.

- [ ] **Step 3: Implement the registry and the five visualizers**

`JoinAnimator` is the highest-value component in the app: two tables slide together, matched keys highlight, the merged row materialises. Honour `prefers-reduced-motion` by rendering final states without transitions.

- [ ] **Step 4: Run them** — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(renderer): visualizer registry and five visualizers"
```

---

### Task 11: Track 2 content and the Hospital DBMS boss project

**Files:**
- Create: `content/tracks/sql.yaml` (lessons 2.1–2.10)
- Create: `content/bosses/hospital-dbms.yaml` (12 graded criteria)
- Create: `content/fixtures/hospital-variant.sql` (perturbed fixture for anti-hardcoding)
- Create: `harness/run-solutions.ts`
- Test: `harness/run-solutions.test.ts`

**Interfaces:**
- Consumes: graders (Tasks 7, 9), `SqlEngine` (Task 8), schema (Task 3).
- Produces: `function runAllSolutions(dir: string): SolutionReport` with `{ ok, total, failures: {lessonId, exerciseId, reason}[] }`. Wired into `npm run harness`.

- [ ] **Step 1: Write the failing test** — the spec's most important harness check.

```ts
test('every authored reference solution passes its own grader', () => {
  const r = runAllSolutions('content')
  expect(r.failures).toEqual([])
  expect(r.total).toBeGreaterThan(20)
})
test('a deliberately wrong reference solution is reported as a failure', ...)
test('every duel ships code that fails its grader and a fix that passes', ...)
```

- [ ] **Step 2: Run it** — Expected: FAIL.

- [ ] **Step 3: Author Track 2 and implement the solution runner**

Lesson 2.1 must open on Track 1's boss data to make the motivation concrete. Boss criteria cover: the five-table normalized schema, foreign keys, a JOIN across three tables, a GROUP BY report, and a transaction.

- [ ] **Step 4: Run `npm run harness`** — Expected: all solutions pass, exit 0.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(content): Track 2 SQL + Hospital DBMS boss + solution runner"
```

---

## Phase 4 — Python sidecar, Tracks 1 and 3

### Task 12: Sidecar supervisor with offline degradation

**Files:**
- Create: `apps/main/src/sidecar/supervisor.ts`, `provision.ts`, `port.ts`
- Create: `services/mentor/pyproject.toml`, `services/mentor/app/main.py`, `app/health.py`
- Create: `apps/renderer/src/components/SidecarBanner.tsx`
- Test: `apps/main/src/sidecar/supervisor.test.ts`, `services/mentor/tests/test_health.py`

**Interfaces:**
- Consumes: `SidecarStatus`, `IPC` (Task 2).
- Produces:
  - `class SidecarSupervisor { start(): Promise<SidecarStatus>; status(): SidecarStatus; stop(): Promise<void>; onStatus(cb): void; request(path, init): Promise<Response> }`
  - `function findFreePort(preferred: number): Promise<number>`
  - `function provisionVenv(root: string, onLog): Promise<{python: string}>`
  - Sidecar `GET /health` → `{ ok: true, version }`; all routes require header `X-Conductor-Token`.

- [ ] **Step 1: Write the failing tests** — covers Review Focus #1.

```ts
test('findFreePort returns an alternative when the preferred port is bound', ...)
test('status becomes failed with a human message when python3 is absent', () => {
  expect(s.status().message).not.toMatch(/Traceback|ENOENT/)
})
test('a failed sidecar leaves offline-capable tracks reported as available', () => {
  expect(capabilities(s.status()).sqlLessons).toBe(true)
  expect(capabilities(s.status()).pythonExec).toBe(false)
})
test('start() is idempotent and does not spawn a second process', ...)
test('a crashed sidecar is restarted at most 3 times, then reports failed', ...)
test('every sidecar request carries the auth token', ...)
```

- [ ] **Step 2: Run them** — Expected: FAIL.

- [ ] **Step 3: Implement the supervisor, provisioning, and the FastAPI app**

Provisioning: `python3 -m venv` into `userData/py`, then `pip install` from a pinned `requirements.txt`, streaming progress to the renderer's setup screen. Token is a per-launch random hex passed via env, never written to disk. The sidecar binds `127.0.0.1` only.

- [ ] **Step 4: Run tests, and `pytest services/mentor` — Expected: PASS.**

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(sidecar): supervisor, venv provisioning, offline degradation"
```

---

### Task 13: Sandboxed Python execution

**Files:**
- Create: `services/mentor/app/runner.py`, `app/sandbox.py`
- Create: `apps/renderer/src/python/usePythonRun.ts`
- Test: `services/mentor/tests/test_runner.py`

**Interfaces:**
- Consumes: FastAPI app (Task 12).
- Produces: `POST /run/python` with `{code, stdin?, timeoutMs?}` → `RunResult{ok, stdout, stderr, exitCode, durationMs, truncated, killedReason?}`. Renderer hook `usePythonRun()` returns `{run, result, running}`.

- [ ] **Step 1: Write the failing tests** — covers Review Focus #2.

```python
def test_runs_hello_world_and_captures_stdout(): ...
def test_infinite_loop_is_killed_at_the_timeout():
    r = run("while True: pass", timeout_ms=1000)
    assert r.killed_reason == "timeout" and r.duration_ms < 3000
def test_megabytes_of_stdout_are_truncated_with_a_flag(): ...
def test_memory_hog_is_killed_rather_than_killing_the_sidecar(): ...
def test_network_access_is_denied(): ...
def test_syntax_error_returns_the_traceback_as_stderr_not_a_500(): ...
def test_each_run_gets_a_clean_temp_cwd(): ...
```

- [ ] **Step 2: Run them** — Expected: FAIL.

- [ ] **Step 3: Implement the runner**

Each run is a fresh `subprocess` of the venv interpreter with `-I` (isolated), a per-run temp cwd, `resource.setrlimit` for CPU and address space, stdout capped at 256 KB, and a 5 s default wall clock. Network denial via a `sitecustomize.py` in the run cwd that stubs `socket.socket`. Caps come from the spec; the mechanism is the builder's call.

- [ ] **Step 4: Run them** — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(sidecar): sandboxed python execution with hard caps"
```

---

### Task 14: Track 1 content and Python graders

**Files:**
- Create: `apps/renderer/src/grading/python-graders.ts`
- Create: `content/tracks/fundamentals.yaml` (lessons 1.1–1.7)
- Create: `content/bosses/patient-triage.yaml`
- Test: `apps/renderer/src/grading/python-graders.test.ts`

**Interfaces:**
- Consumes: `usePythonRun` (Task 13), `registerGrader` (Task 7).
- Produces: grader kinds `python-output` (stdout match over multiple input cases) and `python-unit` (runs authored assertions against the learner's functions).

- [ ] **Step 1: Write the failing tests**

```ts
test('python-output runs every case and reports one check per case', ...)
test('python-output fails the case whose stdout differs, passing the others', ...)
test('python-unit reports the failing assertion message, not the raw traceback', ...)
test('python graders return a clear unavailable result when the sidecar is down', ...)
```

- [ ] **Step 2: Run them** — Expected: FAIL.

- [ ] **Step 3: Implement the graders and author Track 1**

Lesson 1.5 must present a list-of-dicts patient table and name it as a table, setting up Track 2. The boss, *Patient Triage Sorter*, emits the exact dataset Track 2 opens with.

- [ ] **Step 4: Run tests and `npm run harness`.**

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(content): Track 1 fundamentals + python graders"
```

---

### Task 15: Hospital CRUD API, the API grader, and Track 3

**Files:**
- Create: `services/mentor/app/hospital.py`, `app/grade_api.py`, `app/db.py`
- Create: `apps/renderer/src/grading/api-graders.ts`
- Create: `content/tracks/api.yaml` (lessons 3.1–3.10)
- Create: `content/bosses/hospital-api.yaml`
- Test: `services/mentor/tests/test_hospital.py`, `tests/test_grade_api.py`

**Interfaces:**
- Consumes: sidecar (Task 12), runner (Task 13).
- Produces:
  - Reference API under `/hospital/*`: full CRUD for patients, doctors, appointments, with Pydantic models and correct status codes.
  - `POST /grade/api` with `{baseUrl, suiteId}` → runs the authored httpx suite against the learner's own uvicorn server and returns `CheckResult[]`.
  - Renderer grader kind `api-suite`.

- [ ] **Step 1: Write the failing tests**

```python
def test_post_patient_returns_201_and_a_location_header(): ...
def test_get_missing_patient_returns_404_with_an_error_body(): ...
def test_post_patient_with_a_bad_birthdate_returns_422(): ...
def test_delete_then_get_returns_404(): ...
def test_appointment_with_an_unknown_doctor_returns_409_not_500(): ...
def test_grade_api_marks_every_criterion_when_the_learner_server_is_correct(): ...
def test_grade_api_returns_a_connection_check_failure_when_nothing_is_listening(): ...
def test_grade_api_refuses_a_base_url_that_is_not_loopback(): ...
```

- [ ] **Step 2: Run them** — Expected: FAIL.

- [ ] **Step 3: Implement the hospital API, the grader, and author Track 3**

Lesson 3.2 is the verb↔CRUD↔SQL mapping table — the lesson the whole track pivots on. Lesson 3.10 teaches pytest explicitly as agent verification. `grade/api` must reject non-loopback base URLs (that test is a security boundary, not a nicety).

- [ ] **Step 4: Run `pytest services/mentor` and `npm run harness`.**

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(sidecar): hospital CRUD API, HTTP grader, Track 3"
```

---

## Phase 5 — Mentor and the Agent Duel

### Task 16: Mentor providers with a scripted fallback

**Files:**
- Create: `services/mentor/app/mentor/__init__.py`, `providers/ollama.py`, `providers/openai_compat.py`, `providers/scripted.py`, `app/mentor/socratic.py`
- Create: `apps/renderer/src/mentor/MentorPanel.tsx`, `useMentor.ts`
- Test: `services/mentor/tests/test_mentor.py`

**Interfaces:**
- Consumes: sidecar (Task 12).
- Produces:
  - `class MentorProvider(Protocol): async def ask(self, req: MentorRequest) -> MentorReply`
  - `def select_provider(config) -> MentorProvider` — Ollama if reachable, else an OpenAI-compatible free endpoint if a key is configured, else `ScriptedProvider`.
  - `POST /mentor/ask` → `{answer, tier, provider, usedFallback}`.

- [ ] **Step 1: Write the failing tests**

```python
def test_selects_scripted_when_no_provider_is_configured(): ...
def test_scripted_provider_returns_the_authored_tier_1_hint_first(): ...
def test_never_returns_the_solution_when_tier_is_below_3(): ...
def test_falls_back_to_scripted_when_ollama_times_out(): ...
def test_api_key_is_never_echoed_in_a_reply_or_log(): ...
def test_prompt_injection_in_learner_code_does_not_change_the_system_role(): ...
```

- [ ] **Step 2: Run them** — Expected: FAIL.

- [ ] **Step 3: Implement the providers and the Socratic policy**

`socratic.py` enforces the tier contract: tier 1 asks a question, tier 2 names the concept, tier 3 shows a worked analogue — never the learner's own answer. This holds for every provider, LLM or scripted.

- [ ] **Step 4: Run them** — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(mentor): provider selection, Socratic tiers, scripted fallback"
```

---

### Task 17: The Agent Duel

**Files:**
- Create: `apps/renderer/src/duel/DuelArena.tsx`, `duel-engine.ts`, `DuelResult.tsx`
- Create: `content/duels/*.yaml`
- Test: `apps/renderer/src/duel/duel-engine.test.ts`

**Interfaces:**
- Consumes: graders (Task 7), mentor (Task 16), progression (Task 6).
- Produces:
  - `interface Duel { id, lessonId, language, code, bugLine: number, bugKind, explanation, fixedCode }`
  - `function startDuel(d: Duel, now: Date): DuelSession`
  - `function guessLine(s: DuelSession, line: number): DuelSession` — wrong guesses subtract time, never progress.
  - `function resolveDuel(s: DuelSession): { won: boolean; xp: number }`

- [ ] **Step 1: Write the failing tests**

```ts
test('a correct line guess wins and awards duel XP', ...)
test('a wrong guess costs time and leaves progress untouched', ...)
test('running out of time reveals the bug and awards no XP', ...)
test('every authored duel has a bugLine within its code bounds', () => {
  // reads real content/duels
})
test('a duel can be completed with no LLM configured', ...)
```

- [ ] **Step 2: Run them** — Expected: FAIL.

- [ ] **Step 3: Implement the duel engine and arena**

Authored duels cover the bug classes an agent actually produces: off-by-one, wrong `JOIN` type, missing `WHERE`, mutable default argument, unhandled `None`, wrong status code, missing `await`, `==` vs `is`.

- [ ] **Step 4: Run tests and `npm run harness` (duel integrity check from Task 11).**

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(duel): Agent Duel arena and engine"
```

---

## Phase 6 — Tracks 4–5, Tool Atlas, packaging

### Task 18: Track 4 — building with AI agents

**Files:**
- Create: `content/tracks/agents.yaml` (lessons 4.1–4.9)
- Create: `content/bosses/hospital-suite.yaml`
- Create: `apps/renderer/src/components/ChecklistBeat.tsx`
- Create: `harness/check-freshness.ts`
- Test: `harness/check-freshness.test.ts`

**Interfaces:**
- Consumes: content schema (Task 3).
- Produces: `function checkFreshness(dir, today: Date, maxAgeDays = 180): FreshnessReport`; beat kind `checklist` with learner-verifiable items.

- [ ] **Step 1: Write the failing tests**

```ts
test('flags a volatile beat whose verified_on is older than maxAgeDays', ...)
test('passes when every volatile beat was verified within the window', ...)
test('every volatile beat in content/ has a verified_on date', ...)
```

- [ ] **Step 2: Run them** — Expected: FAIL.

- [ ] **Step 3: Author Track 4 and implement the freshness check**

Lesson 4.7 is a guided real-tool build, so it is a `checklist` beat with verification gates rather than an auto-graded exercise — the app cannot grade an external IDE, and pretending otherwise would violate anti-goal A2. Every free-tier claim carries `verified_on`.

- [ ] **Step 4: Run `npm run harness`.**

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(content): Track 4 agents + content freshness harness"
```

---

### Task 19: Track 5 and the Tool Atlas

**Files:**
- Create: `content/tracks/career.yaml` (lessons 5.1–5.6)
- Create: `content/atlas/tools.yaml`
- Create: `apps/renderer/src/atlas/ToolAtlas.tsx`, `AtlasNode.tsx`, `atlas-layout.ts`
- Test: `apps/renderer/src/atlas/atlas-layout.test.ts`

**Interfaces:**
- Consumes: content schema (Task 3), profile (Task 4).
- Produces:
  - `interface AtlasTool { id, name, category, verdict: 'learn-now'|'later'|'skip', why, trackId?, verified_on }`
  - `function layoutAtlas(tools: AtlasTool[]): AtlasLayout` — deterministic category clustering.

- [ ] **Step 1: Write the failing tests**

```ts
test('layoutAtlas is deterministic for the same input', ...)
test('no two nodes overlap at the default canvas size', ...)
test('every tool tagged learn-now maps to a real track or lesson id', ...)
test('atlas covers all seven categories', ...)
```

- [ ] **Step 2: Run them** — Expected: FAIL.

- [ ] **Step 3: Author the atlas and implement the layout**

Categories: languages, databases, backend, frontend, AI agents, cloud/deploy, DevOps. Each entry's `why` is a one-line 2027 rationale. Tools already taught show the learner's own progress.

- [ ] **Step 4: Run tests and `npm run harness`.**

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(career): Track 5 + interactive Tool Atlas"
```

---

### Task 20: Packaging and first-run experience

**Files:**
- Create: `electron-builder.yml`, `scripts/build-sidecar.sh`, `services/mentor/requirements.txt`
- Create: `apps/renderer/src/onboarding/FirstRun.tsx`
- Modify: `apps/main/src/index.ts` (first-run detection)
- Test: `apps/main/src/first-run.test.ts`

**Interfaces:**
- Consumes: supervisor (Task 12), profile store (Task 4).
- Produces: `function isFirstRun(profile: Profile): boolean`; a `dmg` target for arm64 and x64.

- [ ] **Step 1: Write the failing tests**

```ts
test('isFirstRun is true for a fresh profile and false once Track 0 starts', ...)
test('first run reaches a runnable first lesson without any network call', ...)
test('provisioning failure on first run still lands the learner in Track 0', ...)
```

- [ ] **Step 2: Run them** — Expected: FAIL.

- [ ] **Step 3: Implement first run and packaging**

First run must reach lesson 0.1 in under 15 seconds, with sidecar provisioning deferred to the background — goal G1 and anti-goal A4 both depend on this ordering. Sidecar ships via PyInstaller `--onedir` in `extraResources`, with the venv path as the dev fallback.

- [ ] **Step 4: Run tests; `npm run build` and launch the packaged app.**

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(app): first-run flow and macOS packaging"
```

---

## Dependency order

```
1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10 → 11
                                           ↓
                              12 → 13 → 14 → 15 → 16 → 17 → 18 → 19 → 20
```

Tasks 1–11 require no Python. Task 11 is the first milestone worth showing: Tracks 0 and 2 playable, fully offline, with the harness green.
