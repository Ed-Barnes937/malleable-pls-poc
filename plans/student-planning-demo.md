# Student Planning Demo - Orchestration Plan

**Date:** 2026-10-26
**Status:** Ready to orchestrate
**Owner:** Ed (drives the demo live in a 1:1)
**Goal:** Turn the POC from a proof of technology into a proof of product for students: capture a lecture, mark what confused you, and see it turn into planned study time around your real week. Prove that "composable widgets over shared data" is worth exploring further.

---

## 1. Product principles (read before every ticket)

1. **Tools, not prescribed workflows.** We build capable, low-friction widgets. The student arranges them into their own boards. No pre-built "My Week" board, no dedicated planning flow. In the demo, Ed builds a week-style board live - that act *is* the malleability pitch.
2. **The data is the thing; widgets are views of it.** A deadline, a class and a to-do are one shared **plan item** type. Calendar, To-do and Coming up are three views over it. Widgets only meet through data (plus workspace scope).
3. **Scope controls what a widget shows, never what is true.** A Biology-filtered calendar still schedules around Chemistry lectures and work shifts.
4. **Never hide silently.** A filtered widget says what it is leaving out ("+1 in other courses").
5. **Commitments stay fixed; study time can move.** Nothing automatic ever moves a commitment.
6. **AI suggests, code decides.** The LLM writes content (task wording, summaries, plan priorities). A deterministic scheduler places blocks in time.
7. **Calm, not guilt.** No red overdue piles. Missed work gets a gentle "re-fit these?".
8. **Student language in the UI.** Code keeps its names; users see:

| Code | UI |
|---|---|
| lens | widget |
| workspace | board |
| scope | "Showing" course and lecture pills in the top bar |
| workflow | automation, phrased as "When ... then ..." |
| segment | moment |
| recording | lecture (where it is one) |
| confidence | "how sure you feel" |
| plan item kinds | class / commitment, due, to-do |

## 2. The demo script (acceptance target for the whole plan)

1. **Build a board live.** On a new empty board, add Calendar, To-do and Coming up with one click each. The calendar shows Priya's seeded week: lectures and two cafe shifts as fixed blocks. Coming up shows a Biology quiz (Thu) and a Chemistry lab report (Fri).
2. **Plan the week.** In the calendar's week view, press **Help me plan**: unscheduled to-dos on one side, free time on the other. Assign one by hand, then press **Auto-fill** - the AI drafts the rest as ghost blocks with an honest capacity note ("About 9 free hours. This needs 12. Shrink the lab report write-up?"). Accept, then drag one block to a new slot.
3. **Scope.** Switch to the Biology board: the same calendar widget highlights Biology; Coming up shows "Biology quiz · +1 in other courses".
4. **Lecture.** Upload the prepared lecture. Transcript and a 3-line summary appear. Tap "confused" on the maternal-inheritance moment. A to-do "Review: maternal inheritance · 20m" appears, linked to that moment, and slots itself into Wednesday evening around the Thursday shift without disturbing accepted blocks. Click the block: you land on that transcript moment.
5. **Malleability.** Open the automation "When I mark something confusing, add a 20-min review within 3 days", change it to "30 min by tomorrow" - the block visibly moves. Add or remove a widget with a click.
6. **Encores (should-haves).** Weak topics: click one, jump to the moment. Missed blocks: "2 blocks didn't happen. Re-fit them?"

## 3. Ground rules for every agent

### 3.1 Hygiene
- Never use the em dash character anywhere (code, comments, commits, PRs). Use "-".
- **Never read, print, grep, cat or source any `.env` file** (`apps/server/.env` holds Ed's OpenRouter key).
- Don't edit CHANGELOG or generated files. Match surrounding code style, naming and comment density.
- No `Co-Authored-By` lines in commit messages. Conventional commit style (`feat:`, `fix:`, `chore:`), matching `git log`.
- Each implementer works in its own git worktree, branches from `feat/student-planning-demo` and opens a PR against it (see 3.5). Never push to or merge into `main`.
- Bug fixes start by reproducing the bug end to end as a user would.
- Lint, typecheck, unit (`pnpm test`), component (`pnpm test:ct`) and e2e (`pnpm test:e2e`) must be green. Flaky tests are bugs - fix or report them, never retry-until-green.
- Keep docs honest: if a ticket changes a concept described in `docs/` (tool/view, lens spectrum, scope, core types), update the doc in the same PR.

### 3.2 No real AI in tests, ever (cost guardrail)
Ed must not wake up to a bill. Enforced by design, not by discipline:
- **Dependency injection.** Every AI call goes through an injected interface (`Transcriber`, `LlmClient` - see T0). Executors and routers receive these via a deps/context object; nothing imports a real provider client directly.
- **Fakes by default.** The real OpenRouter clients are only constructed when `AI_MODE=live` **and** `OPENROUTER_API_KEY` is set. Any other value, or a missing key, gets deterministic fakes. Default `AI_MODE` is `mock`.
- **Test entry points force mock.** `vitest.setup.ts`, the CT backend simulator and the `e2e:server` script set `AI_MODE=mock` and unset `OPENROUTER_API_KEY`. A unit test asserts the factory returns fakes under test env.
- **Only `dev:server` loads `apps/server/.env`** (via `tsx --env-file-if-exists=.env`). `start`, `migrate-and-start` and `e2e:server` never load it.
- **No agent ever runs with `AI_MODE=live`.** Ed runs the live smoke tests himself (T11 provides a script). Agents that need realistic AI output use the fakes, which should return plausible, content-aware fixture text (e.g. derived from the transcript) so the UI looks real in screenshots.
- Ed: consider setting a credit limit on the OpenRouter key in the OpenRouter dashboard as a backstop.

### 3.3 Isolation between parallel agents
Parallel agents share one Postgres container. To avoid trampling each other (and Ed's dev data):
- T0 makes the database name configurable (`PG_DB`, default `malleable_pls`) across `package.json` scripts, `e2e/reseed.ts`, migrations and docs.
- Each ticket uses its own database `malleable_pls_<ticket>` (e.g. `malleable_pls_t5`), created on the existing container, and its own ports: `API_PORT=31<NN>`, `WEB_PORT=52<NN>` where NN is the ticket number (e.g. T5 -> 3105/5205). Playwright already honours `API_PORT`/`WEB_PORT`.
- Never reseed or migrate the default `malleable_pls` database. Drop your ticket database when the ticket is merged.
- Stop every process you start.

### 3.4 Browser verification (implementer and reviewer)
Tests are necessary but not sufficient. Every ticket with user-visible change is verified in a real headless Chromium:
- **Implementer:** before opening the PR, boot the app on the ticket's DB/ports (`AI_MODE=mock`), drive the ticket's acceptance scenario with a throwaway Playwright script (1440x900; `--use-fake-ui-for-media-stream --use-fake-device-for-media-stream` for capture), and save screenshots. Scripts and screenshots live in the session scratchpad, not the repo. Reference the key screenshots in the PR description.
- **Reviewer:** independently boots the PR branch and drives the same scenario *without* reusing the implementer's script, plus at least one unhappy path (empty state, error, narrow viewport ~400px where relevant). Reports what it saw with screenshots.
- T0 adds a small reusable helper (`scripts/browse.ts` or similar: boot-check, open board, screenshot) so each agent doesn't reinvent it. Keep it minimal.

### 3.5 Ticket lifecycle
1. Orchestrator spawns an implementer (worktree isolation) with the ticket text, this section, and section 1.
2. Implementer: reproduce/understand -> tests first where practical -> implement -> all suites green -> browser verification -> PR.
3. Orchestrator spawns a **fresh-context reviewer** with only the PR link and the ticket text (not the implementer's summary). Reviewer checks: correctness, ticket acceptance criteria, principles in section 1, the AI guardrail (3.2), test quality (fakes via DI, no network), and browser verification (3.4). Reviewer posts findings on the PR.
4. Implementer addresses findings; reviewer re-checks. Max 2 rounds, then escalate to Ed.
5. Merge policy (decided by Ed):
   - At the start, the orchestrator creates the integration branch `feat/student-planning-demo` from `main` and pushes it.
   - Every ticket branches from `feat/student-planning-demo` and opens its PR **against `feat/student-planning-demo`**, never `main`.
   - The orchestrator may merge a ticket PR into the feature branch once it is reviewed and all suites are green. Later tickets merge the updated feature branch in before review.
   - **The orchestrator never merges to `main`.** At the end it opens one PR `feat/student-planning-demo` -> `main` and leaves it for Ed to merge.
   - When everything is done, write the handover note (section 8).
6. Escalate to Ed (don't guess) on: product/UX decisions not covered here, schema changes beyond the ticket, anything touching `.env` or live AI, any test that needs the network.

## 4. Current state (as of `main` @ 8f662c7)

Useful pointers so agents don't re-explore:
- Lens contract: `packages/lens-framework/src/substrate-contract.ts` (`PanelManifest`, `TableName`), `types.ts` (`LensProps` incl. new `onScopeChange`, `Scope`). Registry in `apps/web/src/App.tsx`.
- Writer access granted only to `category: 'tool'` in `packages/workspace-shell/src/PanelContainer.tsx`.
- Scope is workspace-level rows (`workspace_scopes`), decoded in `packages/substrate-client/src/shell-hooks.ts`. `timeframe` is not applied server-side; `courseTag` only filters `recordings.list`.
- Workflows: engine `packages/workflows/src/engine.ts`, pg adapter `apps/server/src/workflows/pg-adapter.ts` (delays now honoured), executors `apps/server/src/workflows/executors.ts` (most are `delay()` stubs), UI catalogue `packages/substrate/src/workflows/executors.ts` (kept in sync by hand). Seeded workflows in `packages/db/src/migrations/002_seed.sql`.
- Transcriber seam: `apps/server/src/workflows/transcriber.ts` (`Transcriber`, `mockTranscriber`, AssemblyAI impl, `createTranscriber()`).
- Server does **not** load any `.env` today.
- Course list: `packages/shared-ui/src/constants.ts` (plus hardcoded SQL in the aggregates router).
- Tests: Vitest + jsdom; Playwright CT with in-memory backend simulator (`playwright/backend-simulator`, has known drift); Playwright e2e journeys `e2e/journey-*.e2e.ts` with POMs, reseed via `pnpm db:reseed` / `e2e/reseed.ts`.
- Known demo hazards (fix if you touch them): low-confidence workflow can never fire (`lowConfidence` never sent); "Week 1" hardcoded in `weakestTopics`; fullscreen panel renders under others (z-index) and persists across reload; Test Me questions are a static array (keep Test Me off demo boards).

## 5. Tickets

Dependency graph:

```
T0 ──┬── T1 ──┬── T5 ──┬── T9 ──┐
     │        ├── T6 ──┤        │
     ├── T2 ──┤        ├── T10 ─┼── T11 ── T12 (UX review)
     ├── T3 ──┴── T7 ──┘        │
     └── T4 (after T2 merges) ──┘
```

Parallel waves: **Wave 0:** T0. **Wave 1:** T1, T2, T3. **Wave 2:** T4, T5, T6, T7. **Wave 3:** T9, T10. **Wave 4:** T11. **Wave 5:** T12.
(T8 intentionally unused.)

---

### T0 - Foundations: AI DI, test guardrails, isolation, Whisper transcriber
**Why first:** every later ticket depends on these seams and guardrails.

Scope:
- **AI deps container.** Introduce a server-side `AiDeps` (or similar) holding `transcriber: Transcriber` and `llm: LlmClient`, created once in `index.ts` by a factory and passed to executors/routers (no module-level singletons). `LlmClient` is a small interface: `complete({ system, prompt, schema? }) -> parsed JSON or text`, with `name`. Provide a `fakeLlmClient` that returns deterministic, content-aware fixtures keyed by a `task` name (e.g. `review-task`, `lecture-summary`, `plan-autofill`), registered by later tickets.
- **Factory and guardrails** exactly as in 3.2 (`AI_MODE`, key check, test entry points force mock, unit test asserting fakes under test).
- **OpenRouter Whisper transcriber:** `POST https://openrouter.ai/api/v1/audio/transcriptions`, JSON body `{ model: 'openai/whisper-large-v3-turbo', input_audio: { data: <raw base64>, format }, language: 'en', response_format: 'verbose_json', timestamp_granularities: ['segment'], provider: { order: ['groq'], allow_fallbacks: false } }`. Map `segments[{start,end,text}]` (seconds) to `TranscribedSegment` (ms). Verified by Ed on 2026-10-26: webm and wav both return segments in under 1s. Unit-test the mapping with a recorded fixture response, never the network.
- **OpenRouter LLM client** (chat completions, JSON mode/structured output). Model configurable via `OPENROUTER_LLM_MODEL`, defaulting to a cheap fast model. Request timeout and max tokens capped.
- **`dev:server`** loads `apps/server/.env` via `--env-file-if-exists` (do not read the file).
- **Recording bitrate:** set `MediaRecorder` `audioBitsPerSecond: 48000` (24 kbps measurably hurt Whisper accuracy).
- **Isolation:** configurable `PG_DB` per 3.3; document the per-ticket DB/port convention in `docs/` or the root of the e2e folder.
- **Browser helper** per 3.4.

Acceptance: all suites green with no network access; unit test proves fakes are selected under test env; e2e journey 6 still passes; a short README note on `AI_MODE`.

---

### T1 - Plan item core type
Scope:
- Migration: `plan_items` table - `id`, `user_id`, `kind` (`commitment | deadline | task`), `title`, `starts_at`/`ends_at` (commitments, scheduled tasks), `due_at` (deadlines, optional for tasks), `duration_min` (tasks), `status` (`open | done | dismissed`), `recurrence` (nullable; v1 supports weekly only, e.g. `{ freq: 'weekly', until? }`), `subtype` (free text label like class/shift/study for commitments), `source_type`/`source_id`/`source_offset_ms` (provenance, e.g. a recording moment or tag), `created_at`/`updated_at`. RLS + app-role grant per existing migrations. Course attaches via the existing `tags` table (`target_type = 'plan_item'`), consistent with how recordings carry course.
- Server router `planItems`: list (by date range, kind, course, status; expands weekly recurrences into occurrences for the requested range), create, update, complete, dismiss, delete. Mutations dispatch workflow events (`plan-item:created`, `plan-item:completed`, `plan-item:updated`). Add events to the trigger catalogue.
- Substrate: TS types in `packages/substrate/src/types.ts`; extend `TableName`, `SubstrateReader`/`Writer`, `substrate-trpc.ts` with correct invalidation; `useServerEvents` invalidates plan items on job completion.
- Backend simulator handler + seed parity for CT.
- Update `docs/terminology.md` (core primitives) and the lens spectrum note in `docs/technical-guidance.md` (planner moves from micro-app to lens over core data).

Acceptance: unit/integration tests for recurrence expansion across week boundaries and DST; RLS test; CT simulator parity.

---

### T2 - Scope that actually filters
Scope:
- Replace the binary `category: 'tool' | 'view'` with per-dimension declarations on the manifest, e.g. `scope: { courseTag: 'filter' | 'highlight' | 'ignore', recordingId: 'target' | 'highlight' | 'ignore', ... }` plus `writes` for permissions. Writer access is granted when a lens declares `writes`, not by category. Migrate all existing lenses (see table below).
- Apply `courseTag` server-side across every reader that should respect it (aggregates, weakest topics, connections, confidence, plan items once T1 lands - coordinate via a shared helper).
- Add a `dateRange` scope primitive available to widgets (planning widgets own their own look-ahead/navigation and mostly ignore the workspace timeframe; keep `timeframe` for review widgets but make it actually filter or remove it if unused).
- A small shared "hidden elsewhere" helper/component: given scoped and unscoped counts, renders "+N in other courses".
- Sidebar scope pickers and the TopBar chip read the new declarations.
- Update `docs/` where tool/view is described.

Target behaviour:

| Widget | Course | Focused recording | Unset scope |
|---|---|---|---|
| Audio capture | tags new lecture | target | ready to record |
| Transcript | narrows picker | target | "pick a lecture" |
| Connections | filter | target | prompt to focus a lecture |
| Test me | filter | ignore | all material |
| This week / overview | filter | ignore | all courses |
| All courses (gap analysis) | highlight | ignore | all courses |
| Weakest topics | filter | ignore | all |
| Coming up (T6) | filter + "+N elsewhere"; overdue always shown | highlight linked | all, next 14 days |
| To-do (T6) | filter; new to-dos inherit course | highlight linked | all open |
| Calendar (T5) | highlight (dim other courses, never hide commitments) | highlight its lecture | current week, everything |

Acceptance: e2e - set a board to Biology; each existing widget shows only Biology data; All courses highlights Biology. Existing journeys still pass.

---

### T3 - Scheduler package
Pure, deterministic, framework-free package `packages/scheduler` (no DB, no AI, no clock - "now" is a parameter).
- `freeSlots(commitments, range, prefs)` - prefs: day start/end (default 08:00-22:00), min slot length, buffer around commitments.
- `place(tasks, freeSlots, { window, existingPlacements, policy })` - fits tasks into free time inside each task's window (e.g. "within 3 days", "by tomorrow", "before due_at"), never overlapping commitments or accepted blocks, never moving commitments; earliest-fit with sensible tie-breaks; reports unplaced tasks with a reason.
- `capacity(freeSlots, tasks)` - free minutes vs needed minutes, for honest copy.
- `refit(missedBlocks, ...)` - re-places blocks whose time passed without completion (for T10).
- Exhaustive unit tests including property-style tests (no overlaps with commitments, all placements inside windows, idempotence).

Acceptance: >95% branch coverage on the package; README with examples.

---

### T4 - Student-friendly shell (after T2 merges)
- Apply the vocabulary table (section 1) across shell UI copy: tabs/boards, drawer, chip ("Showing: Biology · This week · Lecture 4"), empty states, toasts, activity panel. Code identifiers stay.
- Add widgets with a click (and keep drag): clicking a palette tile places the widget in the first free area with good default size; drawer stays open for multi-add; clear grouping by what a student wants to do (Capture, Study, Plan, Review) rather than tool/view.
- Board creation: name + optional course.
- Label every icon-only button (tooltip + aria-label); fix tab trash icon overlap; fix fullscreen z-index and don't persist fullscreen across reload.
- Use `genio-ux-copy-checker-alpha` skill if available for copy.

Acceptance: e2e - create board, add three widgets by clicking without the drawer closing; screenshot set at 1440 and 400 widths.

---

### T5 - Calendar widget (needs T1, T2, T3)
New `packages/lens-calendar`.
- **Week view** (Mon-Sun, hours grid) and **Today view**; navigate prev/next/today.
- Render commitments (fixed, distinct style), scheduled tasks (movable), deadlines (marker at due time / all-day row). Course colour + highlight per scope; out-of-scope items dimmed, never hidden.
- **Create events** by click or click-drag on empty time: title, kind (class/commitment, study time, due), optional course, "repeats weekly" for commitments. Edit and delete via a popover.
- **Drag** scheduled tasks to move/resize; commitments are not draggable (moving them is an explicit edit).
- **Click-through to source:** a block with provenance (e.g. a lecture moment) sets workspace focus via `onScopeChange` and, if the board has a Transcript widget, it scrolls to that moment (if not, offer "Open in a board with Transcript").
- Leave a clearly named slot/button for **Help me plan** (implemented in T9).

Acceptance: CT for rendering, create, drag; e2e - create a weekly class, see it repeat next week; drag a task; click a task with provenance lands on the transcript moment.

---

### T6 - To-do and Coming up widgets (needs T1, T2)
- **To-do:** quick add (inherits board course), optional duration estimate, tick done, dismiss, show source link ("from: Mitochondrial DNA lecture, 9:00") that sets focus; show scheduled time if placed. Calm handling of overdue (no red piles).
- **Coming up:** deadlines in look-ahead (default 14 days, configurable as a layer-2 knob), grouped by day, "+N in other courses" via T2 helper, overdue always shown gently; click to focus course.
- Both scope-aware per T2 table.

Acceptance: CT + e2e - add a to-do on a Biology board, it appears on an unscoped board's To-do and in the Calendar's unscheduled list.

---

### T7 - Lecture AI jobs and the confusion automation (needs T0, T1, T3)
- **Transcription:** `ai:transcribe` uses the injected transcriber (Whisper in live mode).
- **Lecture summary:** new job after transcription, cascade from `recording:completed`/transcribe completion; stores a 3-line summary (decide storage: annotation on the recording or a recording column - prefer existing primitives; escalate if a new column seems needed). Transcript widget shows it at the top.
- **Confused -> review to-do:** new executor `plan:review-task` triggered by `tag:created` where label = confused. LLM (via injected `llm`, fake in tests) writes a short task title from the surrounding transcript moments; creates a `task` plan item with provenance (recording + offset), course from the recording, duration and window from the automation's params; places it via the scheduler around all commitments and accepted blocks; emits `plan-item:created`.
- **Default automation** replacing the stub `schedule:quiz` seed: "When I mark something confusing, add a 20-min review within 3 days". Params: duration, window. Editing params re-places any open, not-yet-started tasks it created.
- **Automation editor as sentences:** in the per-widget Automations dialog, render and edit this automation as "When I mark something **confusing**, add a **20**-min review within **3 days**" with inline editable fields. Keep the generic builder for advanced use but make it student-readable (labelled delay, triggers filter jobs sensibly).
- Remove or hide stub jobs that report success while doing nothing (search related docs, find connections, generate questions) from default automations, or make their output visible. Escalate if unsure which.
- Keep `packages/substrate/src/workflows/executors.ts` catalogue in sync.

Acceptance: e2e (mock AI) - upload fixture lecture, summary appears; tag a moment confused, a to-do appears with source link and a scheduled block within the window avoiding a seeded shift; change automation to 30 min / by tomorrow, block moves.

---

### T9 - Help me plan + Auto-fill (needs T5, T6, T7)
- In Calendar week view, **Help me plan** opens a side panel: unscheduled open to-dos (with estimates; prompt for an estimate if missing) and the week's free time with a capacity bar ("About 9 free hours this week. Your to-dos need 12.").
- Student assigns to-dos by dragging onto the grid or clicking a suggested slot (suggestions from the scheduler).
- **Auto-fill:** LLM ranks/prioritises the unscheduled to-dos given deadlines and weak topics and proposes duration trims when over capacity; the scheduler places them; result shown as **ghost blocks** with an honest capacity note. Actions: Accept all, accept individually, adjust by dragging, Dismiss ("Keep my plan").
- Accepted blocks are not moved by later automatic placements (T7 respects them).

Acceptance: e2e (mock AI) - over-capacity week produces the honest note and trim suggestion; accept places blocks; dismiss leaves the calendar unchanged.

---

### T10 - Should-haves: weak topics and re-fit (needs T3, T5, T7)
- **Weak topics** shows readable topic labels (LLM-generated short label per segment cluster via fake in tests, or a sensible non-AI fallback like the segment's key phrase), fixes hardcoded "Week 1", and each item is clickable -> focus lecture + transcript moment.
- **Re-fit missed blocks:** when scheduled tasks pass without being done, Calendar (and To-do) show a calm "2 blocks didn't happen. Re-fit them?" -> scheduler `refit` -> preview as ghosts -> accept/dismiss.
- Make the "This week" and "All courses" counts consistent and labelled in student language.

Acceptance: e2e for both flows using seeded past-dated tasks.

---

### T11 - Demo kit (needs everything above)
- **Prepared lecture:** write a ~3-5 min Biology lecture script on mitochondrial DNA with one deliberately confusing passage on maternal inheritance; generate audio with macOS `say` (16 kHz wav, a natural voice) via a committed script `scripts/demo/make-lecture.sh`; commit the wav under `demo/` (keep it small). Also commit the script text.
- **Seed Priya's week** relative to the current date (so a reseed always looks like "this week"): Biology and Chemistry weekly lectures, two cafe shifts (incl. Thursday evening), Biology quiz Thursday, Chemistry lab report Friday, 3-4 open to-dos with estimates, the existing seeded lectures/tags. **No pre-built planning board** - only the existing study boards. `pnpm db:reseed` restores exactly this.
- **Live smoke script for Ed** (`scripts/demo/live-smoke.ts`, run by Ed only with `AI_MODE=live`): transcribes the demo wav and runs one LLM call per task type, printing results and `usage.cost`. Agents must not run it.
- **Runbook** `docs/demo-runbook.md`: setup, reseed, the demo script from section 2 step by step, fallback paths (e.g. if live transcription fails, use the cached transcript of the demo wav - implement this cache in mock mode keyed by file hash, so mock mode on the demo wav returns the real script text with correct timings).
- **Dress rehearsal:** an agent drives the full section 2 script in headless Chromium in mock mode and produces a screenshot storyboard; fixes or files anything broken.

Acceptance: storyboard of every demo step; e2e journey covering the section 2 script in mock mode.

---

### T12 - UX review (after T11; read-only, no code changes)
A dedicated UX/visual design reviewer. The UI today is utilitarian; Ed wants it softened and the UX made genuinely good for students.
- Run the app (mock mode, seeded demo data), walk the section 2 demo script and free-explore as a first-time student, at 1440 and ~400 widths, light and dark.
- Load the `artifact-design` and `genio-ux-copy-checker-alpha` skills if available.
- Produce a prioritised report with screenshots covering: visual softness (type scale, spacing, radius, colour, contrast, density, motion), warmth and personality appropriate for students, empty states and first-run experience, affordances and discoverability, copy tone, accessibility (focus states, labels, contrast), and moments that should delight (e.g. the confused-to-calendar ripple). For each recommendation: what, why, effort (S/M/L), and a before/mock-after where useful.
- Publish the report as an Artifact for Ed. Do not implement; Ed will pick items for a follow-up plan.

## 6. Out of scope (for now)
Golden journeys 2, 3, 6, 7 (quick-gap suggestions, quiz-from-own-lectures, assignment breakdown, exam run-up); chat/assistant bar; board sharing and templates; generated Test Me questions; Mediabunny client-side transcoding and long-lecture chunking; one-off exceptions to weekly recurrence; mobile-first layout.

## 7. Estimated orchestration cost
~11 implementer agents + ~11 reviewer agents + fix-up rounds + 1 UX reviewer + 1 dress rehearsal: roughly 25-35 subagent runs, most of them long-running (implement + full test suites + browser verification). Waves keep at most 4 implementers in parallel. All AI calls in this process are mocked; the only OpenRouter spend is Ed's own live smoke tests.

## 8. Handover note for Ed (orchestrator's final step)

Write `plans/student-planning-demo-report.md` (and link it in the final PR description). Keep it concise:
- **Outcome:** which tickets landed, which didn't (and why), link to the final `feat/student-planning-demo` -> `main` PR and each ticket PR.
- **How it went:** review rounds per ticket, anything flaky, any test or verification that could not be run.
- **Decisions made along the way:** every judgement call not explicitly covered by this plan, with the reasoning and how to reverse it.
- **Open issues / follow-ups:** known bugs, deferred items, T12 UX review artifact link.
- **Steps to merge to `main` and run the demo:** in order, e.g. new migrations to apply (`pnpm dev:migrate`, and any deployed DB such as Fly), env vars to add (`AI_MODE=live`, `OPENROUTER_API_KEY`, `OPENROUTER_LLM_MODEL`), `pnpm db:reseed`, dropping leftover per-ticket databases (`malleable_pls_t*`), the live smoke test command, and the demo runbook location.
