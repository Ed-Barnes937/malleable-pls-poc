# S1 spike - student-set available times

Date: 2026-10-27. Branch read: `feat/student-planning-ux` @ 877de20 (read-only; `STUDY_DAY` is still 08:00-22:00 here, U3 moves it to 09:00).
Questions from `plans/student-planning-ux-polish.md` section 5 (S1) and section 1 decision 2.

## TL;DR

- **"Available" = the hours I'm willing to study ("study hours"), not the hours I'm free.** Free time is already derived from the calendar (commitments). Anything that makes Priya busy (gym, family dinner) is a commitment she draws on the calendar - that path exists today.
- **Per-weekday shape in storage, one range in the default UI** ("Every day 09:00-22:00", with "Different on some days" to expand to a 7-row editor where a day can also be "no study").
- **Stored as a per-user preference on the server**, not in Calendar panel config: the confusion automation and the Auto-fill router run server-side and must read the same truth as every Calendar on every board ("scope controls what a widget shows, never what is true"). Move the 2h/day budget (today Calendar panel config `studyMinPerDay`) into the same preference, and give the time zone a home there too (migration 013 already says "until users have a time zone preference").
- **Edited from Help me plan** (a "Study 09:00-22:00 · 2h a day · Change" line next to today's "Study time per day" select), with the hours outside study time shaded on the grid while planning.
- **Default: 09:00-22:00 every day** (what U3 already sets). 9-5 is rejected: against the seed it removes 25h of Priya's free time, all of it her free evenings, and breaks anything done after 17:00 (scenario 3 below). 09:00-21:00 is a reasonable "calmer" alternative; open question for Ed.
- **Cost: M.** Scheduler change is small (per-weekday windows in `dayWindows`); the bulk is a new `user_preferences` table + router + substrate/simulator plumbing, and a small editor in Help me plan. Roughly 1 implementer + 1 reviewer run, or 2 small tickets.

## 1. What does "available" mean?

| Option | Meaning | Pros | Cons |
|---|---|---|---|
| **A. Study hours (recommended)** | The window I'm willing to study in; free time = study hours minus commitments | Matches the code exactly (`dayStart`/`dayEnd` is already this); keeps "the data is the thing": busy-ness lives in plan items, preference lives in one setting; one concept, no double entry | Student must add non-study busy time (gym, dinner) as commitments - but that is already supported and is what a calendar is for |
| B. Free hours | I tell the app when I'm free | Familiar from scheduling tools (Calendly) | Duplicates the calendar: Priya would enter "free Mon 12-17" and also have lectures/shifts as commitments; they drift; the scheduler would need both and a rule for conflicts |

Hard or soft? **Hard for anything automatic** (Auto-fill, the confusion automation, re-fit, suggested slots, capacity copy); **ignored for manual actions** (click-to-create, drag) - the student can always put a block at 23:00 herself. That mirrors "AI suggests, code decides" and "commitments stay fixed; study time can move": the window constrains the machine, not the student.

### Per weekday or one range?

**Store per weekday from day one; show one range by default.**

- Priya's week is the case for per-day: weekdays have lectures and shifts, weekends are open. A student who wants Sundays off, or who cannot study before 11:00 on Saturdays, has no way to say it with one range. "No study on Sunday" is also the cleanest expression of a rest day (calm, not guilt).
- The data shape is the expensive thing to change later (migration + every caller); the editor UI can grow. So persist `{ mon..sun: { start, end } | null }` now, render it as one range until the student opts in.
- One range per day, not several. Gaps inside a day ("not 13:00-14:00, lunch") are commitments. This keeps the editor tiny and the scheduler change trivial.

## 2. Where is it set?

| Option | Verdict | Why |
|---|---|---|
| **User preference (server), edited from Help me plan** | **Recommended** | One truth for every Calendar, Help me plan, Auto-fill (`apps/server/src/routers/planning.ts`) and the confusion automation (`apps/server/src/planning/review-automation.ts`), which runs server-side with no panel config in reach |
| Calendar widget (panel config) | No | Two Calendars on two boards could disagree, and the automation can't see it. This is already a latent problem with `studyMinPerDay` (panel config, `CalendarLens.tsx:67`): the automation ignores the budget entirely, and two calendars can show different capacity for the same week |
| Blocks drawn on the calendar | Already exists, for the complementary job | Drawing "Gym", "Dinner" etc. as commitments covers "I'm busy then". Drawing the *study window itself* (drag the shaded edges) is a nice later affordance but collides with click-drag-to-create and is hard to discover; not now |

UX sketch (Help me plan panel, under the capacity headline):

```
Study 09:00-22:00 · 2h a day   [Change]
  ┌ When do you study? ───────────────────────┐
  │ Every day   [09:00] to [22:00]             │
  │ Study time a day  [2h ▾]                   │
  │ ▸ Different on some days                   │
  │   Mon [09:00]-[22:00]  ...  Sun [ ] No study│
  │                       [Cancel] [Save]      │
  └────────────────────────────────────────────┘
```

While planning, hours outside study time get a subtle grey wash on the grid (consistent with U2's "free time shows only while planning"). A first-run question in U5's "Plan my time" starter is a possible later addition, not needed now.

## 3. Relation to the daily budget and the 09:00 start

- **Window = when, budget = how much.** They are independent knobs and both belong in the same preference ("study rhythm"). `place`/`capacity` already take `dailyBudget`; `freeSlots` already takes the window.
- **The 09:00 start becomes the default of the window**, not a constant. `STUDY_DAY` keeps only `bufferMin: 10`; `dayStart`/`dayEnd` move to `DEFAULT_STUDY_HOURS`.
- **Key finding from the seed run (section 4): at a 2h/day budget with earliest-fit, the window almost never changes capacity or where Auto-fill puts blocks.** Every candidate window leaves Priya at least 5.5h free on every day, far above 2h, so the headline ("About 9 hours ... need 11/12") is identical for A-E in the daytime scenarios. The window only bites when (a) the student plans/marks late in the day, (b) a day's window is short, or (c) placement is latest-fit. So the window is mainly a guard against "the app put study at 08:00 / 21:30 where I'd never do it", not a capacity lever.
- **Gaps found while checking (relevant to U3, not S1):**
  1. The confusion automation ignores the daily budget (`findReviewSlots` passes no `dailyBudget`). With earliest placement it stacks on top of Auto-fill: in scenario 1 Tuesday gets 2h Auto-fill + 20m review = 140m against a 2h budget. Decide whether reviews count against the budget (suggest: count, but never be refused by it, since they are short and time-sensitive).
  2. `findReviewSlots` passes no `gapMin` and only pads other *reviews*, so an earliest review lands back to back with an accepted study block (scenario 1: Auto-fill Tue 10:30-12:30, review Tue 12:30-12:50). Help me plan uses `STUDY_BLOCK_GAP_MIN = 10` between blocks; the automation should too.
  3. Earliest-from-now has no lead time: marking at 14:30 places the review at the next quarter hour. Fine for the demo, but a "not before" (e.g. at least 1h after marking, or tomorrow) is closer to spaced review. Separate decision.

## 4. Candidate defaults against the demo seed

Method: ran the real `priyaWeek()` seed (`e2e/seed-week.ts`), `expandPlanItems`, `busyTime`, `studyDays`, `planCapacity`, `rankForPlan`, `draftPlan` and `place` with each candidate window (buffer 10m, budget 2h/day, lab write-up shrunk to 2h as the demo accepts). Week of Mon 2 Nov 2026, Europe/London. Script: `/private/tmp/claude-501/-Users-edward-barnes-glean-co-Code-Genio-playground-malleable-plc-poc/dd699c54-d9b3-4a70-9f50-15323d727cc0/scratchpad/s1/eval.mts`, output `.../scratchpad/s1/out.txt`.

Priya's fixed week: Bio lecture Mon/Wed 10-12, Chem lecture Tue 14-16, cafe shift Tue/Thu 17-22. Sat/Sun empty of commitments (the seed fills them with planned study to make "About 9 hours").

### Free time per day (before the budget), hours (of which after 17:00)

| Window | Mon | Tue | Wed | Thu | Fri | Sat | Sun | Week |
|---|---|---|---|---|---|---|---|---|
| A 08:00-22:00 (today) | 11.7 (5) | 6.5 (0) | 11.7 (5) | 8.8 (0) | 14 (5) | 14 (5) | 14 (5) | 80.7 |
| B 09:00-22:00 (U3) | 10.7 (5) | 5.5 (0) | 10.7 (5) | 7.8 (0) | 13 (5) | 13 (5) | 13 (5) | 73.7 |
| C 09:00-21:00 | 9.7 (4) | 5.5 (0) | 9.7 (4) | 7.8 (0) | 12 (4) | 12 (4) | 12 (4) | 68.7 |
| D 09:00-17:00 | 5.7 (0) | 5.5 (0) | 5.7 (0) | 7.8 (0) | 8 (0) | 8 (0) | 8 (0) | 48.7 |
| E weekdays 09-21, weekends 10-18 | 9.7 (4) | 5.5 (0) | 9.7 (4) | 7.8 (0) | 12 (4) | 8 (1) | 8 (1) | 60.7 |

What each rules out for Priya:
- **A to B**: the 08:00-09:00 hour every day (7h). Tue morning shrinks to 09:00-13:50.
- **B to C**: 21:00-22:00 on Mon/Wed/Fri/Sat/Sun (5h). Tue/Thu unaffected (shifts).
- **D (9-5)**: every free evening - Mon, Wed, Fri, Sat, Sun 17:00-22:00 (25h vs B). Tue/Thu evenings are shifts in every option, and nothing ever allows Tue/Thu after the 22:00 shift end (+10m buffer), so on shift days Priya's only study time is the morning/early afternoon under every candidate.
- **E**: like C on weekdays, and cuts weekends to 10:00-18:00.

### Scenario 1 - demo Tue 10:30 (Help me plan), confused marked Tue 11:00

Identical headline for all five: "About 9 hours of study time left, to-dos need 11" (Tue-Fri 2h each minus seeded planned study, Sun 1h). Auto-fill differs only in the morning start:

| Window | Auto-fill draft | Review 20m / 3 days (earliest) | 30m / by tomorrow (earliest) | (old latest-fit, for reference) |
|---|---|---|---|---|
| A | Tue 10:30-12:30, Wed 12:15-14:15, Thu 08:00-09:00, Fri 08:00-10:00 | Tue 12:30-12:50 | Tue 12:30-13:00 | Fri 21:30 / Wed 21:30 |
| B, C, D, E | same, but Thu 09:00-10:00, Fri 09:00-11:00 | Tue 12:30-12:50 | Tue 12:30-13:00 | B Fri 21:30; C/E Fri 20:30; D Fri 16:30 |

### Scenario 2 - demo Mon 14:00, confused 14:30

All five identical: 9h left; Auto-fill Mon 14:00-16:00 then Tue/Wed/Thu mornings (A at 08:00, others 09:00, Wed flashcards at 12:15 because 09:00-09:50 is too short); review Mon 16:00-16:20 (back to back with the Auto-fill block, see gap 2 above).

### Scenario 3 - Priya at home Mon 18:30, confused 19:00 (her real usage: lectures by day, studies evenings)

| Window | Study left | Auto-fill | Review 20m / 3 days |
|---|---|---|---|
| A, B, C, E | 9h | Mon 18:30-20:30, then Tue/Wed/Thu | Mon 20:30-20:50 |
| **D (9-5)** | **7h** (today is gone) | Tue 09:00-11:00, Wed 12:15, Thu 09:00; **past paper unplaced too** | **Tue 11:00** (next morning, between nothing she asked for) |

Conclusion: 9-5 looks harmless in a daytime demo but is wrong for exactly the student the demo portrays. It also makes the U3 mock-up chip "Review planned · Wed 19:30" impossible. B and C both work; C trades 5h of late-evening time a week for a calmer default and changes nothing in the demo (it only moves latest-fit placements, which U3 removes).

Demo impact of adopting B as the default: none beyond what U3 already does (09:00 start). The runbook's "Monday to Wednesday 07:00-20:00 give About 9 hours" window is unchanged under B; under C, reseeding after ~19:00 loses today's last hour; under D, any reseed after ~15:00 starts eating today's 2h.

## 5. Implementation cost

Overall **M**. Suggested split: **S1a** storage + plumbing + planning wiring (no UI beyond reading the default), **S1b** editor + grid shading. Or one ticket.

### Storage (M)
- No user-level settings table exists today (`user_id` is a bare TEXT column on every table; `lens_data` is generic and unused by the server - don't overload it).
- New migration `packages/db/src/migrations/014_user_preferences.sql`: `user_preferences (user_id TEXT PRIMARY KEY, time_zone TEXT, study_hours JSONB, study_min_per_day INT, updated_at)` with RLS + app-role grants like 011, CHECK on minutes range. Nullable columns mean "use the default", so no backfill.
- `study_hours` shape: `{ "mon": {"start":"09:00","end":"22:00"} | null, ... "sun": ... }` (zod schema in substrate, `HH:MM`, end may be `24:00`; overnight allowed since the scheduler supports it, but the editor need not offer it).
- Server: `apps/server/src/preferences/store.ts` (get with defaults, upsert) + `routers/preferences.ts` (get, update; dispatch a `preferences:updated` event only if an automation should react - probably not now) + `.db.test.ts` incl. RLS.
- Substrate: types in `packages/substrate/src/types.ts`, `TableName`/reader/writer in `packages/lens-framework/src/substrate-contract.ts`, `substrate-trpc.ts` invalidation; backend simulator handler + seed parity in `playwright/backend-simulator/`.
- Migrate `studyMinPerDay` from Calendar panel config: read prefs first, fall back to panel config once, write to prefs on change (or just drop the panel value; it is a demo-era setting).

### Scheduler (S)
- `packages/scheduler/src/free-slots.ts`: add an optional per-weekday override to `FreeSlotPrefs`, e.g. `days?: ReadonlyArray<{ dayStart: string; dayEnd: string } | null>` (index 0 = Monday, local), used by `dayWindows` instead of the single `dayStart`/`dayEnd` when present; `null` = no window that day. `dayWindows` already loops per local date, so this is a weekday lookup inside the loop. Keep `dayStart`/`dayEnd` for existing callers.
- Tests: extend `free-slots.test.ts` and `properties.test.ts` (no free time outside the day's window; null days empty; DST weeks); README table.
- `place`, `capacity`, `budget` unchanged. A null day already means 0 capacity that day, so the copy stays honest.

### Planning and callers (S-M)
- `packages/substrate/src/planning.ts`: `STUDY_DAY` becomes `{ bufferMin: 10 }` + `DEFAULT_STUDY_HOURS`; `weekLayout(rows, week, { timeZone, studyMinPerDay, studyHours })`; the refit path at ~line 564 likewise. Four `freeSlots` call sites total: `planning.ts:118`, `planning.ts:564`, `review-automation.ts:67`, simulator via `weekLayout`.
- `apps/server/src/planning/review-automation.ts`: load the user's prefs inside the transaction and pass the hours (and, if decided, the budget and a 10m `gapMin`).
- `apps/server/src/routers/planning.ts` + `planAutofillInput`: load hours/budget from prefs server-side instead of trusting `studyMinPerDay` from the client (or keep the input for a live draft before save).
- `e2e/seed-week.ts` / `seed-week.test.ts`: seed no prefs (defaults) so step 2 numbers stay as U3 leaves them.

### UX (M)
- `packages/lens-calendar/src/HelpMePlan.tsx`: replace the bare "Study time per day" select with the "Study 09:00-22:00 · 2h a day · Change" line and a `StudyHoursEditor` popover (new file); re-draft on save like the budget does today.
- `packages/lens-calendar/src/CalendarLens.tsx`: read prefs instead of `config.studyMinPerDay`; `TimeGrid.tsx`: grey wash outside study hours while planning.
- Copy through `genio-ux-copy-checker-alpha`. CT for the editor; e2e: set Sunday to "No study" and 10:00 starts, Auto-fill and a new confusion review both respect it; manual drag outside the window still allowed.
- Docs: `packages/lens-calendar/README.md`, `packages/scheduler/README.md`, `docs/terminology.md` (study hours as a user preference), `docs/demo-runbook.md` only if the default changes.

## 6. Open questions for Ed

1. Default end: **22:00 (keep, matches U3) or 21:00** (calmer, costs Priya 5h/week of late evening, no demo impact)?
2. Per-weekday: OK to **store per weekday but show one range** by default, with "Different on some days" and "No study" days?
3. Move the **2h/day budget into the same user preference** (out of Calendar panel config), and add the **time zone** there too?
4. Should the **confusion automation count against the daily budget** and keep the 10m gap from study blocks? (Today it does neither; with earliest placement it lands back to back after an Auto-fill block and can exceed 2h.) Arguably a U3 fix rather than S1.
5. Should earliest review placement have a **lead time** ("not within the next hour" / "not before tomorrow")?
6. Hard for automation, ignored for manual drag/create - agreed?
