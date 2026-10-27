# @pls/lens-calendar

Calendar widget: a view over plan items (classes and other commitments, study time, deadlines).

## Features

- **Week view** (Mon-Sun) and **Day view**, with previous / today / next. The hours grid is sized so 08:00-22:00 fits the panel and opens scrolled there; earlier and later hours scroll. On a phone (below 640px) it opens in Day view with the day between previous and next buttons; a view picked there is not saved, so the wide screen keeps its own.
- **Commitments** (classes, shifts) are fixed, fuller blocks; **study time** (scheduled tasks) is lighter with a dashed outline; **deadlines** (`kind = 'deadline'` only) sit in a "Due" row and as a marker line at their time (a due time of local 00:00 means "due that day": no time, no marker). A to-do's own due date shows in its popover, the To-do widget and Help me plan, not as a marker. Course colours per block; overlapping blocks sit side by side.
- **Create** with the header "Add" button (keyboard friendly), or by clicking (one hour at the half hour) or dragging (15-minute snap) on empty time: title, kind (class / commitment, study time, due), course (defaults to the board's course), "Repeats weekly" for commitments (stored with the browser's time zone so it keeps its wall-clock time across DST).
- **Edit / delete / mark done** from a popover. Editing a weekly occurrence shifts the whole series by the same delta (`movePatch` in `src/drafts.ts`); turning "Repeats weekly" off keeps just that occurrence.
- **Drag** study time to move it (across days in week view) and drag its bottom edge to resize (within its day); `duration_min` follows the block length. A move that doesn't save says so in the header instead of silently snapping back. Commitments do not drag: moving them is an explicit edit. Moving a weekly occurrence shifts the series by the wall-clock difference in its time zone, so it stays put across a DST change.
- **Keyboard**: blocks are focusable; Enter opens the popover with focus inside, Escape closes it and returns focus.
- **Click-through to source**: a block with a lecture moment (`source_type = 'recording'`) calls `onShowMoment` on click, so the Transcript scrolls to and highlights that moment; without a Transcript on the board the popover offers "Open in a board with Transcript". See "Showing a Moment" in `docs/technical-guidance.md`.
- **Help me plan** (week view header): see below.
- **Re-fit missed blocks**: see below.

## Help me plan

`src/HelpMePlan.tsx`, a side panel beside the grid (over it in a narrow panel):

- **To-dos without a time** (open tasks with no block, every course), most important first. A to-do with no estimate offers 30m / 1h / 2h (saved on the to-do). Each row offers up to three **suggested slots** (`suggestTaskSlots`; clicking one saves the block), **Pick a time** / **Other time** (a keyboard-friendly date-time field, starting at the first free gap long enough for the to-do, else the first free moment: `firstFreeStart` in `src/time.ts`), and can be **dragged onto the grid** (a preview shows where it lands). A hand placement that would overlap a commitment or other study time is refused with a note; nothing is saved.
- **Study time left**: free time is shaded on the grid, and the panel shows per-day study time left and an honest capacity line from code: "About 9 hours of study time left this week. Your to-dos need 12." **Study time per day** (default 2h, 1h-6h) is a layer-2 setting stored in the panel config (`studyMinPerDay`); it caps what counts and what Auto-fill places on each day, minus study blocks already there. Changing it during a draft re-drafts it. Copy rounds free time down and needed time up, so a small gap never reads as "fits".
- **Auto-fill**: asks the server for advice (`useAutofillPlan` -> `planning.autofill`: an LLM priority order, trims, a short note) and places the to-dos itself with `draftPlan` (`src/autofill.ts`), so every block comes from `@pls/scheduler`. Missing estimates are asked for first; skipping assumes 1h each and the draft says so. Trims ("Shrink "Lab report write-up" to 2h?") are offers: applying one re-drafts, keeping ghosts the student dragged. Every to-do longer than a day's study time gets one, to exactly the day's study time in force (`completeTrims`), so none is left with no way forward and a new study time per day offers its own length ("Shrink to 3h?"). The draft's own numbers ("Drafted 6h of study time. 2h 30m didn't fit.", `draftCopy`) come from what was placed; the LLM's note only names priorities (sentences with amounts of time are dropped). To-dos that still don't fit are listed with a calm reason.
- The draft state (note, trims, what didn't fit) lives in `CalendarLens`, so closing and reopening the panel keeps it. In a narrow calendar the panel overlays the grid; "Hide" tucks it away (a "Show plan" pill in the grid's bottom corner, clear of the day headers, brings it back) so the ghosts can be reviewed.

All numbers and placements use the shared planning module in `@pls/substrate` (`src/planning.ts`: `STUDY_DAY`, `weekLayout`, `planCapacity`, `draftPlan`, ...), the same one the server uses.

## Proposals (ghost blocks)

A reusable layer for any feature that drafts study time without saving it (Auto-fill and re-fitting missed blocks). `src/proposals.ts`:

```ts
const layer = useProposalLayer({
  save: (p) => updateItem.mutateAsync({ id: p.taskId, patch: acceptPatch(p) }), // what accepting writes
  rows: items, // the calendar's rows: an accepted ghost stays drawn until its real block arrives
})
layer.propose('refit', [{ id: 'refit:t1', taskId: 't1', title: 'Revise respiration', startsAt, endsAt, course }])
```

- `Proposal`: `{ id, taskId, title, startsAt, endsAt, course?, note?, adjusted? }` (ISO times). Client state only: nothing is written until it is accepted.
- `TimeGrid` draws `proposals` as ghost blocks (striped, dashed, sparkle) laid out with real blocks; each has **Accept** and **Dismiss** buttons and can be **dragged or resized** to adjust (`layer.move`, which marks it `adjusted`). Clicking a ghost opens nothing.
- `validate(proposal, source)` (optional; `CalendarLens` passes one) returns why a proposal no longer holds, e.g. "it already has a time" (an Auto-fill to-do placed by hand meanwhile) or "that time overlaps Biology lecture", else null. It is checked against the current data on every render (a failing ghost is taken out), before a move (refused), and again for each proposal at the moment it is accepted, together with the blocks accepted just before it in the batch (skipped, never saved). Each case sets `layer.notice` with a calm line; the calendar shows it in its header.
- Keyboard: a ghost is focusable; arrow keys move it by 15 minutes (up / down, within its day) or a day (left / right), hopping past anything in the way (a commitment, another ghost) to the next position that holds (`layer.nudge`); Enter accepts, Delete dismisses.
- `layer.accept(id)` / `layer.acceptAll()` save through `save` one at a time (a failure keeps the ghost and sets `layer.error`), or, for a source listed in `saveTogether`, in one call, all or nothing (re-fit uses this); `layer.dismiss(id)` / `layer.dismissAll()` ("Keep my plan") drop them and write nothing, and tell `onDismiss` (the student's answer; a ghost the layer takes out itself because `validate` failed is not reported). `propose` replaces the layer's proposals; `layer.source` says who proposed them.
- `ProposalTray` (`src/ProposalTray.tsx`) is the calendar-level bar ("3 suggested blocks - Accept all / Keep my plan"). `CalendarLens` shows it whenever the layer is not Auto-fill's open draft (that one has its own summary in the panel).

There is one layer per calendar (`CalendarLens` owns it), so there is one draft at a time. A new source adds its trigger in `CalendarLens` and calls `layer.propose`.

## Re-fit missed blocks

`src/RefitBanner.tsx`. When study blocks ended without being ticked off, the calendar asks, calmly, above the grid: "2 blocks didn't happen. Re-fit them?" (**Re-fit** / **Not now**). It uses `useMissedBlocks` from `@pls/lens-framework`, shared with the To-do widget: the same copy, the server's preview (`planItems.refitPreview`, rules in `@pls/substrate` planning), and the same answers - "Not now", "Keep my plan" or moving them holds in every widget until the page is reloaded; only a newly missed block asks again. A block whose ghost was taken out because something now covers its time is not an answer: it is asked about again.

The calendar asks about every course's missed blocks (it shows every course; its course scope only highlights), while the To-do asks only about its board's course. So on a course board the two can show different counts at once ("2 blocks didn't happen" in the Calendar, "1 block" in the To-do), and answering in the Calendar answers for every course, which also quiets the To-do on other course boards. That is intended: the Calendar's question was about all of them.

- **Re-fit** shows the new times as ghosts (source `'refit'`) and switches to the week of the first one if needed. The banner becomes their tray: "Here is where they could go - drag to adjust, nothing moves until you accept." with **Move them** / **Keep my plan**; blocks with no free time are named ("No free time before it is due. It stays on your list.").
- Accepting (all, or one ghost with Enter or its button) writes through `planItems.refit` (`saveTogether`), never per-item updates, so the server's atomic, stale-preview check applies. If it refuses (the week changed), every block of the preview the student hasn't answered for and that is still missed gets the fresh preview's time ("Your week changed, so here are fresh times."), including one whose ghost was just taken out because a commitment landed on it. A ghost whose to-do is no longer a missed block, or whose time has started, is taken out.
- When the preview ends: "Moved 2 blocks. They're in your calendar." (plus any that didn't fit). "Keep my plan" moves nothing.
- One draft at a time: while Auto-fill's ghosts are waiting, **Re-fit** waits ("Accept or keep the suggested blocks first - one draft at a time."), and Auto-fill likewise waits for re-fit ghosts.
- The re-fit preview does not apply Help me plan's study time per day (the server places missed blocks in the earliest free time, 08:00-22:00).

## Scope

`courseTag: 'highlight'` - shows every course and dims items in other courses ("Biology highlighted"); items with no course (a cafe shift) are not dimmed, and nothing is ever hidden. `recordingId: 'highlight'` - rings items linked to the focused lecture. Neither reaches the reader: the calendar lists everything in the visible date range.

## Internal Dependencies

`lens-framework`, `substrate`, `shared-ui`
