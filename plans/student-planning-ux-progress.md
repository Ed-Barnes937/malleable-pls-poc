# Student Planning UX Polish - Progress

Run settings: integration branch `feat/student-planning-ux` (from `main` @ 4865dcc); ticket PRs target it; orchestrator merges reviewed, green ticket PRs into it and never into `main`. Worktree isolation per agent, at most 4 implementers in parallel. Ports: implementer U<N> uses 312N/522N and DB `malleable_pls_u<N>`; reviewer U<N> uses 313N/523N and DB `malleable_pls_u<N>r`.

## 2026-10-27
- Integration branch created and pushed with the plan.
- U1 (design tokens): implementer running (Opus).
- S1 (available times spike): research run started early because it has no dependencies (Opus, write-up only).
- U2-U6: blocked on U1.
- S1 done: write-up in `plans/student-planning-s1-available-times.md`. Recommends study hours as a per-user, per-weekday preference, default 09:00-22:00. It also found three U3-relevant gaps in the confusion automation (daily budget, 10m gap, lead time); questions batched for Ed.
- Ed answered the U3 questions: see `plans/student-planning-ux-decisions.md`.
- U1 PR #78 opened (all suites green); fresh reviewer running. Questions for Ed: default theme (dark vs light), violet for physics, course on recordings in reader contract (matters for U4).
- U1 review round 1: CHANGES NEEDED (non-restyled widgets clipped by new chrome, Activity drawer and error state not restyled, one contrast pair). Sent back to implementer with Ed's light-default decision.
- U1 re-review PASS (d851c51), Vercel checks green. Merge into integration branch blocked by the auto-mode classifier; waiting for Ed. Follow-up: 'answering wrong in TestMe' e2e isn't repeatable under --repeat-each (no per-test reseed); candidate for U7 or a chore.
- U1 merged into `feat/student-planning-ux` (54a708f, PR #78). `main` untouched by Ed's request ("keep main stable"); everything lands on the feature branch.
- U2, U3, U4, U5 implementers dispatched in parallel (Opus), told to leave `malleable_pls` alone (Ed demoing). U6 queued for the next free slot.
- U5 PR #79 opened (suites green); fresh reviewer running. U6 implementer dispatched.
- Orchestrator call (cheap to reverse): today line says "2h to study" rather than the mock-up's "2h free", because "free" already means all unbooked time in Help me plan. Logged in decisions.
- For Ed, non-blocking: widget name casing is mixed (Title Case vs sentence case); copy guide lists it as undecided.
- U2 PR #80 opened (suites green); fresh reviewer running. Answered: "Do by"/"How long?" stay in U2 (U6 told not to duplicate). For Ed: P0-4 handled by an extra draft sentence explaining short leftover gaps, rather than retuning the seed.
- Watch: `journey-6-upload-recording` timed out once under multi-agent load (U2), and U5 fixed a separate double-match flake in the same test.
- U2 review round 1: CHANGES NEEDED (leftover sentence wrong outside demo week, Pick a time defaults onto a ghost, panel focus, e2e coverage, nits). Sent back. journey-6 e2e failed again under load for the U2 reviewer; re-check after U5's fix merges, else assign a dedicated fix.
- U5 merged into `feat/student-planning-ux` (a8f2185, PR #79) after reviewer PASS and small fixes.
- U2 fixes pushed (de0a7ab); re-review running.
- U3 PR #83, U6 PR #82 opened (suites green); fresh reviewers running.
- U4 review round 1: CHANGES NEEDED (toast keyboard/focus, scroll rail a11y, tag legend, simulator delete parity, tests). Sent back with Ed's answers.
- Open for Ed: U3 Q1 (reviews unscheduled when the whole window is at budget), U3 Q2 (server only knows default 2h/day), U6 phone top bar menu.
- U2 merged into `feat/student-planning-ux` (b34052a, PR #80) after re-review PASS. Nit left: Shrink/Undo from the keyboard drops focus (pre-existing).
- U3 review: CHANGES NEEDED (merge conflict, step-5 copy, misleading ripple when unscheduled, clock-dependent e2e). Sent back with Ed's answers (decisions 11-12).
- U6 review: CHANGES NEEDED (tick/Undo/tick ordering race). Sent back.
- U4 fixes pushed (2d497c2); re-review running.
- U5 follow-up: `first-run.e2e.ts` crowded today line test flaky under load; U5 implementer fixing on `fix/u5-first-run-flake`.
- Queued: U6b phone top bar + today line on phone (decision 13).
- U4 merged into `feat/student-planning-ux` (7ae5fae, PR #81) after re-review PASS. "Go to moment" order: review-mode Transcript, then a board already showing the lecture, then tab order (middle tiebreaker added by the implementer; same result on seed data). Nits for later: rail marks overlap past ~11 tags, `aria-controls` dangling while collapsed, the no-timeout toast covers the bottom of the board on a phone (fold into U6b).
- U3 told to adopt U4's toast API and summary toggle.
- New flake ticket (Sonnet): scheduler `time.test.ts` timeouts and an unidentified `expected 4 to be 3` unit failure under load.
- PR #84 (test flake fixes: scheduler time/property tests, DB test timeouts) merged into `feat/student-planning-ux` (e82fe9c) after reviewer PASS. `expected 4 to be 3` not reproduced; likely follow-on from DB test timeouts.
- INCIDENT: the #84 reviewer ran `pnpm dev:migrate` with only `DATABASE_URL` set; the script builds its URL from `PG_DB` (default `malleable_pls`), so migrations 014 and 015 were applied to Ed's default DB at 22:35 UTC. Reported to Ed; no revert without his say. Footgun to fix: agents must set `PG_DB`, and `dev:migrate` should honour `DATABASE_URL` or refuse.
- U6 re-review: fix confirmed; still needs U4 merge and stuck-status fix. Sent back.

## 2026-10-28
- U3 merged into `feat/student-planning-ux` (9638103, PR #83) after re-review PASS. Nits for later: runbook line 34 still says "More"; `aria-controls` dangles while summary collapsed; `savedMessage` reports only moves when an edit both moves and resizes.
- U6 round 3 pushed (039c764: U4 merge, stuck-status fix via `usePlanItemMutation` resolving after refetch - affects every plan item save). Merging U3 next, then final re-review.
- PR #85 (first-run flake: `flushSync` in TodayLine + painted-frame test reads) opened; reviewer running.
- DB URL footgun fix ticket dispatched (Sonnet).
