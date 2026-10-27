# @pls/lens-calendar

Calendar widget: a view over plan items (classes and other commitments, study time, deadlines).

## Features

- **Week view** (Mon-Sun) and **Day view**, with previous / today / next. The hours grid is sized so 08:00-22:00 fits the panel and opens scrolled there; earlier and later hours scroll.
- **Commitments** (classes, shifts) are fixed, fuller blocks; **study time** (scheduled tasks) is lighter with a dashed outline; **deadlines** sit in a "Due" row and as a marker line at their time (a due time of local 00:00 means "due that day": no time, no marker). Course colours per block; overlapping blocks sit side by side.
- **Create** with the header "Add" button (keyboard friendly), or by clicking (one hour at the half hour) or dragging (15-minute snap) on empty time: title, kind (class / commitment, study time, due), course (defaults to the board's course), "Repeats weekly" for commitments (stored with the browser's time zone so it keeps its wall-clock time across DST).
- **Edit / delete / mark done** from a popover. Editing a weekly occurrence shifts the whole series by the same delta (`movePatch` in `src/drafts.ts`); turning "Repeats weekly" off keeps just that occurrence.
- **Drag** study time to move it (across days in week view) and drag its bottom edge to resize (within its day); `duration_min` follows the block length. A move that doesn't save says so in the header instead of silently snapping back. Commitments do not drag: moving them is an explicit edit. Moving a weekly occurrence shifts the series by the wall-clock difference in its time zone, so it stays put across a DST change.
- **Keyboard**: blocks are focusable; Enter opens the popover with focus inside, Escape closes it and returns focus.
- **Click-through to source**: a block with a lecture moment (`source_type = 'recording'`) calls `onShowMoment` on click, so the Transcript scrolls to and highlights that moment; without a Transcript on the board the popover offers "Open in a board with Transcript". See "Showing a Moment" in `docs/technical-guidance.md`.
- **Help me plan** button in the week view header: `src/HelpMePlan.tsx` is the extension point (placeholder for plan ticket T9).

## Scope

`courseTag: 'highlight'` - shows every course and dims items in other courses ("Biology highlighted"); items with no course (a cafe shift) are not dimmed, and nothing is ever hidden. `recordingId: 'highlight'` - rings items linked to the focused lecture. Neither reaches the reader: the calendar lists everything in the visible date range.

## Internal Dependencies

`lens-framework`, `substrate`, `shared-ui`
