# Student Planning UX Polish - Orchestration Plan

**Date:** 2026-10-27
**Status:** Ready to orchestrate
**Owner:** Ed
**Goal:** Bring the app in line with the redesign mock-ups (T12 follow-up) for the student planning demo, as fast as possible, then roll the same design language out to the rest of the app.

Inputs:
- Mock-ups: `plans/student-planning-demo-artifacts/mockups/` (`site/template.html` holds the annotations and P0/P1/P2 references; `base.css` holds the token values; `png/` the renders). Published: https://claude.ai/artifact/AUzZKrkUaQbUzeJiDziHby
- UX review the mock-ups are based on: https://claude.ai/artifact/Rn9kcbsFNFDabgTtsTRD4H
- Previous plan and its ground rules: `plans/student-planning-demo.md`; handover: `plans/student-planning-demo-report.md`

## 1. Decisions (Ed, 2026-10-27)

1. **No "Split across days".** Over-capacity to-dos keep "Shrink" only. No data-model change to let one to-do own several blocks. The Help me plan panel copies the mock-up minus the split button and the "1 of 3" drafts.
2. **Confusion reviews go in the earliest free slot, not the latest.** Reverse report decision 1 (`anchor: 'latest'` in `apps/server/src/planning/review-automation.ts`) to `'earliest'`, with the study day starting at 09:00 (the shared `STUDY_DAY` in `@pls/substrate`). Student-set available times are a separate spike (S1), not part of this plan's tickets.
3. **The automation that made a block gets recorded** on the plan item (new column or field; the implementer picks the shape, consistent with existing provenance columns) so the popover can name it with an Edit link.
4. **Two passes.** First, a demo-polish pass on the widgets and screens the demo uses, shipped as soon as possible. Then a separate PR that brings the rest of the app onto the same design language.

## 2. What "design language" covers today

Updating the shared design language already reaches every widget for:
- surface, border, text and shadow colours, and the panel radius (`@theme` and `[data-theme="light"]` in `apps/web/src/index.css`)
- widget chrome (`packages/workspace-shell/src/PanelContainer.tsx`)
- course colours (`COURSE_COLORS`, `COURSE_PILL_COLORS` in `packages/shared-ui/src/constants.ts`)
- the shared components in `packages/shared-ui` (Badge, Dialog, EmptyState, TagPill, TextField, ...)

It does **not** reach:
- **Type sizes.** Widgets hard-code arbitrary sizes (about 88 `text-[10px]`, 74 `text-[11px]`, plus 9px and 13px), so a scale change means editing every widget.
- **Per-widget spacing and radius.** These use raw Tailwind classes (`rounded-md/lg/full`).

U1 therefore adds named type and radius tokens (e.g. `text-meta/body/title/heading` for 12/14/16/20, item radius) and course tint/ink/stripe tokens. It moves the demo widgets onto them. U7 moves every other widget onto them. After U7, a scale change is one edit.

## 3. Ground rules

Section 3 of `plans/student-planning-demo.md` applies unchanged: hygiene, no real AI in tests, per-ticket DB and ports (use `UNN`, e.g. U3 -> `malleable_pls_u3`, 3123/5223 is fine as long as it doesn't collide), browser verification by implementer and reviewer, and the fresh-context reviewer lifecycle. Changes to the branching rules:
- Integration branch `feat/student-planning-ux` from `main`. Ticket PRs target it. The orchestrator never merges to `main`.
- **Light and dark, 1440 and ~400 widths** in every browser verification. Compare side by side with the matching mock-up PNG and include both in the PR.
- Copy changes break CT and e2e selectors (e.g. "Plan this week" -> "Plan your time"). Update the tests and POMs in the same PR. Never loosen an assertion to get past a copy change.
- Use the `genio-ux-copy-checker-alpha` skill for any new copy.
- Contrast: extend `apps/web/src/theme-contrast.test.ts` to cover every new token pair in both themes.

## 4. Tickets - pass 1: demo polish

```
U1 ──┬── U2
     ├── U3
     ├── U4
     ├── U5
     └── U6
```
U1 merges first; U2-U6 run in parallel after it.

### U1 - Design tokens and demo-widget restyle
- Port the mock-up palette (`mockups/base.css`) into `apps/web/src/index.css`, both themes: paper ground, panels, lines, ink levels, accent, fixed amber (`attn*`, replacing or aliasing the `text-attention*` tokens from T13), "confused", "good", course tint/soft/ink/stripe per course, shift colours, shadows.
- Type tokens on four steps (12 meta, 14 body, 16 item title, 20 heading); no text under 12px; drop almost all uppercase mono labels.
- Radius tokens: 20px widget, ~10px item. Widget chrome: no header divider, softer shadow (`PanelContainer.tsx`).
- Course colours in `shared-ui/constants.ts` become token-based (tint, ink, stripe), so every pill and block picks them up.
- Restyle onto the tokens: shell (TopBar, tabs, drawer), Calendar, To-do, Coming up, Transcript, Audio capture. Other widgets will look partly updated (colours, chrome) until U7; that's acceptable for the demo but must not break.
- 24-hour times everywhere these widgets show times.

Acceptance: demo boards at 1440 in both themes match the mock-ups' type, surfaces and colours; contrast test covers the new tokens; all suites green.

### U2 - Calendar and Help me plan (mock-up screen 1)
- Block language: class = solid course tint; shift = neutral with a cup icon; study time = light tint, solid left bar, grab handle; ghost draft = hatched with a dashed outline.
- While planning only: free time shows as dotted gaps labelled with their length ("1h 30m free") instead of the blue wash.
- The Help me plan panel floats over the weekend columns instead of squeezing Mon-Fri, so weekday titles no longer truncate.
- Capacity headline names the cap and agrees with what Auto-fill uses (review P0-4): "About 9 hours of study time left this week (2h a day). Your to-dos need 12." The bar shows the shortfall hatched.
- Over-capacity call-out offers **Shrink only** (decision 1). Draft list as in the mock-up. Names anything that didn't fit, with "Pick a time".
- Copy: "Plan your time", "Do by Fri 30 Oct", "How long?", "Accept draft", "Keep my plan".

Acceptance: e2e for capacity agreeing with the Auto-fill draft in an over-capacity week; CT for each block type; screenshot vs `01-my-week-help-me-plan.png` (no split button).

### U3 - Earliest placement and the confused-to-calendar ripple (screen 2)
- Placement (decision 2): the confusion automation places reviews in the earliest free slot in its window, after 09:00. The study-day start moves to 09:00 in the shared `STUDY_DAY`, so Help me plan follows. Update the comments and tests that describe "latest-first / spaced review". Re-check demo seed timings (`e2e/seed-week.ts`) and drop the "block visibly moves" beat from demo step 5 (section 6).
- "Review planned · Wed 19:30 · 20 min" chip on the moment: fixed amber, 24h, links to the block.
- Toast gets a "See it" action. The calendar scrolls to the new block and it glows once in its course colour. The block carries "From Mitochondrial DNA · 1:18".
- One signature motion: a review card lifts off the moment toward the calendar, the To-do row slides in. Respect `prefers-reduced-motion`.
- Transcript summary collapses to one line, expandable.

Acceptance: e2e - mark confused, the review lands in the earliest free slot after 09:00 in its window and avoids shifts and accepted blocks; "See it" scrolls to and highlights the block; reduced motion skips the animation.

### U4 - Study block popover and landing on the moment (screen 4)
- Record which automation created a plan item (decision 3). Migration + store + substrate types + simulator parity; existing rows stay null.
- Popover leads with the source: "From Mitochondrial DNA · 1:18", the quoted line, "You marked this confusing". Primary "Go to moment"; then "Mark done", "Edit time" (date/time pickers move behind it). Footer: "Made by: When I mark something confusing ... · Edit", which opens that automation.
- Landing: collapsed one-line summary, the moment outlined in course colour, coloured gutter marks per tag, a scroll rail showing every tagged moment.
- No Transcript on the board: switch to a board that has one (In Lecture), with a toast that says so and offers "Back to My week". Replaces "This board has no Transcript." Escalate if picking the target board turns out to be ambiguous.
- Fix while here (report open issue): stale popover after an automation moves a block.

Acceptance: e2e - click a review block, "Go to moment" lands on the moment on the same board, and on a board with no Transcript lands on another board with a way back; footer edit opens the right automation.

### U5 - First run and the today line (screen 3)
- An empty board shows one sentence and three starters by intent: "Plan my time" (Calendar, To-do, Coming up), "Capture a lecture" (Audio capture, Transcript), "Find what to revise" (Weakest topics, Your progress), each showing widget icons and names; "Add widgets" stays. Starters only add widgets (tools, not workflows). Reuses the click-to-add placement from T4.
- Top-bar today line from plan items: "Tuesday · Chemistry 14:00 · shift 17:00-22:00 · 2h free". Hides gracefully when narrow or when the day is empty.

Acceptance: e2e - new board, click "Plan my time", three widgets added in a good layout; today line matches seeded data.

### U6 - Phone (screen 5)
- Below 640px the Calendar opens in Day view with prev/next day.
- Board tabs scroll sideways with edge fades; active tab scrolled into view.
- To-do: a ticked item strikes through and shows "Done · Undo" before it fades.
- Re-fit banner in fixed amber; meta text 12-13px passing contrast in both themes.

Acceptance: e2e at 400px for Day view default and Done/Undo; screenshots vs `05-phone-light.png` / `05-phone-dark.png`.

### Pass 1 wrap-up
Dress rehearsal of the demo script (section 2 of the previous plan) in mock mode at 1440, both themes, producing a storyboard; update `docs/demo-runbook.md`. Open the `feat/student-planning-ux` -> `main` PR for Ed.

## 5. Pass 2: rest of the app (separate PR, after pass 1 merges)

### U7 - Design language for every other widget
- Move every remaining widget (Connections, Test me, Weekly overview / This week, Gap analysis / All courses, Weakest topics, Automations dialog, workflow editor, settings) onto the U1 tokens. No arbitrary `text-[Npx]` sizes left anywhere outside tokens.
- Add a lint rule or test that fails on arbitrary text sizes and raw colour classes in `packages/lens-*` and `packages/workspace-shell`, so future restyles stay one edit.
- Light/dark and 1440/400 screenshots of every widget.

Own branch from `main`, own PR to `main` for Ed.

### S1 - Spike: student-set available times
Questions to answer (write-up only, plus a mock-up if useful; no production code):
- What does "available" mean: hours I'm willing to study, or hours I'm free? Per weekday pattern, or one range?
- Where is it set: a user preference, the Calendar widget, or blocks drawn on the calendar?
- How it relates to the daily study budget (2h/day) and the 09:00 study-day start.
- The default. 9-5 would rule out evenings, which is when Priya is free most days (shifts Tue/Thu 17:00-22:00, lectures in the day). Evaluate against the demo seed.
- Implementation cost: the scheduler already takes `dayStart`/`dayEnd` (`packages/scheduler/src/free-slots.ts`), so the cost is mostly UX and storage.

## 6. Further decisions (Ed, 2026-10-27)

- **Demo step 5 loses the "block visibly moves" beat.** With earliest placement, editing the automation params usually just changes the block's length. U3 updates `docs/demo-runbook.md`, the demo e2e (`e2e/journey-demo.e2e.ts`) and any seed tuning that existed only to make the block move. Step 5 keeps editing the automation sentence and adding or removing a widget.
- **Mock-ups are strong direction, not pixel-perfect targets.** Match their structure, hierarchy, block language, copy and tokens. Deviate where the real app's data, layout or accessibility needs it, and say why in the PR next to the side-by-side screenshot.

## 7. Estimated cost
Pass 1: 6 implementers + 6 reviewers + fix-ups + rehearsal, roughly 14-18 agent runs, at most 5 in parallel after U1. Pass 2: U7 plus reviewer, and S1 as one research run. All AI mocked.
