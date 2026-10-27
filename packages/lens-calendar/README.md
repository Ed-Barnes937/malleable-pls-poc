# @pls/lens-calendar

Calendar widget: a view over plan items (classes and other commitments, study time, deadlines).

## Features

- **Week view** (Mon-Sun) and **Day view**, with previous / today / next. The hours grid is sized so 08:00-22:00 fits the panel and opens scrolled there; earlier and later hours scroll.
- **Commitments** (classes, shifts) are fixed, fuller blocks; **study time** (scheduled tasks) is lighter with a dashed outline; **deadlines** (`kind = 'deadline'` only) sit in a "Due" row and as a marker line at their time (a due time of local 00:00 means "due that day": no time, no marker). A to-do's own due date shows in its popover, the To-do widget and Help me plan, not as a marker. Course colours per block; overlapping blocks sit side by side.
- **Create** with the header "Add" button (keyboard friendly), or by clicking (one hour at the half hour) or dragging (15-minute snap) on empty time: title, kind (class / commitment, study time, due), course (defaults to the board's course), "Repeats weekly" for commitments (stored with the browser's time zone so it keeps its wall-clock time across DST).
- **Edit / delete / mark done** from a popover. Editing a weekly occurrence shifts the whole series by the same delta (`movePatch` in `src/drafts.ts`); turning "Repeats weekly" off keeps just that occurrence.
- **Drag** study time to move it (across days in week view) and drag its bottom edge to resize (within its day); `duration_min` follows the block length. A move that doesn't save says so in the header instead of silently snapping back. Commitments do not drag: moving them is an explicit edit. Moving a weekly occurrence shifts the series by the wall-clock difference in its time zone, so it stays put across a DST change.
- **Keyboard**: blocks are focusable; Enter opens the popover with focus inside, Escape closes it and returns focus.
- **Click-through to source**: a block with a lecture moment (`source_type = 'recording'`) calls `onShowMoment` on click, so the Transcript scrolls to and highlights that moment; without a Transcript on the board the popover offers "Open in a board with Transcript". See "Showing a Moment" in `docs/technical-guidance.md`.
- **Help me plan** (week view header): see below.

## Help me plan

`src/HelpMePlan.tsx`, a side panel beside the grid (over it in a narrow panel):

- **To-dos without a time** (open tasks with no block, every course), most important first. A to-do with no estimate offers 30m / 1h / 2h (saved on the to-do). Each row offers up to three **suggested slots** (`suggestTaskSlots`; clicking one saves the block) and can be **dragged onto the grid** (a preview shows where it lands; dropping saves it).
- **Study time left**: free time is shaded on the grid, and the panel shows per-day study time left and an honest capacity line from code: "About 9 hours of study time left this week. Your to-dos need 12." **Study time per day** (default 2h, 1h-6h) is a layer-2 setting stored in the panel config (`studyMinPerDay`); it caps what counts and what Auto-fill places on each day, minus study blocks already there.
- **Auto-fill**: asks the server for advice (`useAutofillPlan` -> `planning.autofill`: an LLM priority order, trims, a short note) and places the to-dos itself with `draftPlan` (`src/autofill.ts`), so every block comes from `@pls/scheduler`. Missing estimates are asked for first; skipping assumes 1h each and the draft says so. Trims ("Shrink "Lab report write-up" to 2h?") are offers: applying one re-drafts, keeping ghosts the student dragged. To-dos that still don't fit are listed with a calm reason.

All numbers and placements use the shared planning module in `@pls/substrate` (`src/planning.ts`: `STUDY_DAY`, `weekLayout`, `planCapacity`, `draftPlan`, ...), the same one the server uses.

## Proposals (ghost blocks)

A reusable layer for any feature that drafts study time without saving it (Auto-fill here; re-fitting missed blocks can use it too). `src/proposals.ts`:

```ts
const layer = useProposalLayer({
  save: (p) => updateItem.mutateAsync({ id: p.taskId, patch: acceptPatch(p) }), // what accepting writes
  rows: items, // the calendar's rows: an accepted ghost stays drawn until its real block arrives
})
layer.propose('refit', [{ id: 'refit:t1', taskId: 't1', title: 'Revise respiration', startsAt, endsAt, course }])
```

- `Proposal`: `{ id, taskId, title, startsAt, endsAt, course?, note?, adjusted? }` (ISO times). Client state only: nothing is written until it is accepted.
- `TimeGrid` draws `proposals` as ghost blocks (striped, dashed, sparkle) laid out with real blocks; each has **Accept** and **Dismiss** buttons and can be **dragged or resized** to adjust (`layer.move`, which marks it `adjusted`). Clicking a ghost opens nothing.
- `layer.accept(id)` / `layer.acceptAll()` save through `save` one at a time (a failure keeps the ghost and sets `layer.error`); `layer.dismiss(id)` / `layer.dismissAll()` ("Keep my plan") drop them and write nothing. `propose` replaces the layer's proposals; `layer.source` says who proposed them.
- `ProposalTray` (`src/ProposalTray.tsx`) is the calendar-level bar ("3 suggested blocks - Accept all / Keep my plan"). `CalendarLens` shows it whenever the layer is not Auto-fill's open draft (that one has its own summary in the panel).

There is one layer per calendar (`CalendarLens` owns it). A new source adds its trigger (e.g. a "Re-fit them?" banner) in `CalendarLens` and calls `layer.propose`.

## Scope

`courseTag: 'highlight'` - shows every course and dims items in other courses ("Biology highlighted"); items with no course (a cafe shift) are not dimmed, and nothing is ever hidden. `recordingId: 'highlight'` - rings items linked to the focused lecture. Neither reaches the reader: the calendar lists everything in the visible date range.

## Internal Dependencies

`lens-framework`, `substrate`, `shared-ui`
