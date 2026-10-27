# Student Planning Demo - Orchestration Report

**Date:** 2026-10-27 (overnight run)
**Plan:** `plans/student-planning-demo.md`
**Integration branch:** `feat/student-planning-demo` -> `main` PR: https://github.com/Ed-Barnes937/malleable-pls-poc/pull/74

## Outcome

Every ticket in the plan landed on `feat/student-planning-demo`, plus tickets the orchestrator added (T10b, T11 split into a/b/c, T13-T15). Nothing was merged to `main`.

| Ticket | PR | Review rounds | Notes |
|---|---|---|---|
| T0 Foundations (AI DI, guardrails, isolation, Whisper) | #59 | 2 | Blocking finding fixed: e2e could reuse a live-mode dev server. AssemblyAI removed. |
| T1 Plan item core type | #58 | 2 | Recurrence limited to commitments; rows carry `series_*` fields. |
| T2 Scope that filters | #60 | 2 | Blocking finding fixed: own tags hidden when focused lecture was in another course. `timeframe` scope removed. |
| T3 Scheduler package | #57 | 2 | 100% coverage. Added `anchor`, later `dailyBudget`/`gapMin`. |
| T4 Student-friendly shell | #63 | 2 | Palette groups via manifest `group`; Tab no longer captured. |
| T5 Calendar widget | #64 | 2 | Moment click-through mechanism (`onShowMoment`). |
| T6 To-do + Coming up | #61 | 2 | |
| T7 Lecture AI + confusion automation | #62 | 3 | Blocking finding fixed (hand-moved review moved after re-mark). Board id now flows through UI writes and job cascades. |
| T9 Help me plan + Auto-fill | #68 | 3 | Daily study budget added (see decisions). |
| T10 Weak topics + re-fit (To-do) | #67 | 2 | |
| T10b Re-fit on Calendar + flake fix | #69 | 2 | Blocking finding fixed (CONFLICT dropped a block). Fixed flaky calendar drag e2e. |
| T11a Demo lecture, mock transcript cache, live smoke | #65 | 1 | |
| T11b Seed Priya's week | #66 | 3 | Also fixed rapid-click widget overlap race. |
| T11c Seed tuning, runbook, rehearsal, demo e2e | #70 | 2 | |
| T12 UX review (read-only) | artifact | - | https://claude.ai/artifact/Rn9kcbsFNFDabgTtsTRD4H |
| T13 Demo-blocking UX bugs (from T12 P0) | #71 | 2 | Amber contrast in light mode (new `text-attention*` tokens), transcribing state, full-board placement, 24h times. Server marks jobs orphaned by a restart as failed. |
| T14 Polish: board scrolls to Transcript on show-moment, test isolation | #72 | 1 | |
| T15 Tall moment opens at its first line | #73 | 1 | |
| Bonus: redesign mock-ups | artifact | - | https://claude.ai/artifact/AUzZKrkUaQbUzeJiDziHby |

## How it went

- Every PR had a fresh-context reviewer who ran all suites and drove the app in headless Chromium on its own DB/ports. Reviewers found 5 blocking bugs, all fixed before merge.
- All AI was mocked throughout. No agent ran `AI_MODE=live` or the live smoke script; nobody read `.env`.
- Flakes found and fixed: `e2e/calendar.e2e.ts` drag test (reloaded before save; reproduced by delaying the request). `journey-6` failed once early on and never again in 10+ runs.
- The Claude Code auto-mode classifier blocked some `gh pr merge` calls as "merge without review"; each merge went through after showing the reviewer's PASS comment and plan line 83 in the transcript.
- Ordering deviations: T1-T3 started in parallel with T0; T11 was split into T11a/b/c; T10's Calendar half became T10b; T12 ran in parallel with the last implementation wave.

## Decisions made along the way (reversible)

1. **Confusion reviews are placed as late as possible in their window** (scheduler `anchor: 'latest'`, spaced review) so editing the automation visibly moves the block. Effect: at Tue 10:30 the review lands Fri 21:30; "30 min by tomorrow" moves it to Wed 21:30. Reverse: `anchor: 'earliest'` in `apps/server/src/planning/review-automation.ts`.
2. **Daily study budget** ("study time per day", default 2h, per Calendar widget, 1-6h) drives capacity and Auto-fill. Raw 08:00-22:00 free time gave ~60h, so an honest over-capacity note was impossible otherwise.
3. **Long to-dos are trimmed, not split across days** (splitting needs one to-do with several blocks: a data-model change). Follow-up.
4. **Recurrence only for commitments** in v1; list rows expose `series_starts_at/ends_at/due_at`.
5. **Scope:** a focused lecture wins over the course filter for that lecture's data; widgets get reader-safe `scope` and styling-only `highlight`; course highlight dims only other-course items (course-less shifts stay full strength). `timeframe` scope removed (never applied).
6. **"+N hidden"** reports "in other courses" and "with no course" separately.
7. **Board-specific automation copies now take effect** (board id passed through UI writes and job cascades) instead of hiding the per-board switch.
8. **Stub jobs removed** from default automations (search related docs, schedule quiz, find connections, generate questions) via migration 013, which also cleans their board copies and pending runs.
9. **Lecture summary** stored as an annotation (`anchor_type = 'recording_summary'`), no schema change.
10. **Demo seed is computed from reseed time** so step 2 reads "About 9 hours ... need 12" at any Mon-Wed reseed 07:00-20:00 (Thu/Fri honestly read less). Test Me stays on the seeded study boards (runbook keeps you on "My week").
11. **Demo wav committed as 7.1 MB wav** (webm would need ffmpeg).
12. **T13 fixed only clear bugs** from the UX review; all design recommendations are left for you.

## Open issues / follow-ups

- UX review recommendations (type scale, softer surfaces, ripple, split-across-days, Day view on phones, etc.): see the T12 artifact and the mock-ups artifact.
- Re-fit preview ignores the daily study budget (server change).
- Stale popover after the automation moves a block (runbook: press Escape first); lingering "added" toast; duplicate "Maternal inheritance" weak-topic row (seeded + today's lecture).
- `key-point` tag yellow has low contrast in light mode; click-added widget can land under the open board menu.
- Escape doesn't close the Automations dialog while a sentence dropdown has focus.
- Live Whisper accepts only webm/wav up to 25 MB (the formats you verified).
- Live Whisper will split the maternal-inheritance passage into different moments from the mock (one 40 s segment at 1:18).
- Study-time-per-day is per Calendar widget, not a user preference.
- The server assumes one instance per database (it fails orphaned "running" jobs on start): keep Fly at 1 machine, and never point `dev:server` and `e2e:server` at the same DB.
- Step 2 reads exactly "About 9 hours ... need 12" only for a Mon-Wed reseed 07:00-20:00; Thu/Fri read less (honestly).

## Steps to merge to `main` and run the demo

1. Review and merge https://github.com/Ed-Barnes937/malleable-pls-poc/pull/74.
2. Apply migrations: `pnpm dev:migrate` (new: `011_plan_items.sql`, `012_drop_timeframe_scope.sql`, `013_lecture_ai_automations.sql`). Also any deployed DB (e.g. Fly) if you use it.
3. Env in `apps/server/.env` (loaded only by `pnpm dev:server`): `AI_MODE=live`, `OPENROUTER_API_KEY`, optionally `OPENROUTER_LLM_MODEL` (default `openai/gpt-4o-mini`). Consider a credit limit on the key.
4. Drop leftover per-ticket databases: `for d in $(docker exec malleable-plc-poc-postgres-1 psql -U pls -Atc "select datname from pg_database where datname like 'malleable_pls_%' and datname <> 'malleable_pls'"); do docker exec malleable-plc-poc-postgres-1 dropdb -U pls "$d"; done`
5. Live smoke test (you only, costs a few cents): `AI_MODE=live pnpm demo:live-smoke`.
6. Within an hour before demoing: `pnpm db:reseed`, then reload the browser tab.
7. Follow `docs/demo-runbook.md` (includes fallbacks: switch the server to `AI_MODE=mock` and the demo wav still yields the real transcript).
