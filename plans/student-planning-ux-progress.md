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
