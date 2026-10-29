# @pls/lens-todo

To-do widget: a view over `task` plan items.

## Features

- Quick add with an optional time estimate; new to-dos inherit the board course
- Tick done: the row strikes through in place with "Done · Undo" for 5 seconds, then fades and moves under "Done today" (untick to restore). Or dismiss ("Not doing this")
- Shows the scheduled time when a to-do is placed in the calendar, or its due day
- Calm wording for anything that slipped: "Still to do from Monday", never "overdue"
- "2 blocks didn't happen. Re-fit them?": a calm offer to re-place study blocks that passed without being ticked off, previewing the new times in the widget (`src/RefitBanner.tsx`, over `useMissedBlocks` from `lens-framework`, shared with the Calendar, which shows them as ghosts). Answering in either widget answers both, until the page is reloaded; while one shows new times, the other stops asking about those blocks. The To-do asks only about its board's course; the Calendar asks about every course, so answering there also covers this widget's blocks.
- Source link for to-dos made from a lecture moment ("from: Mitochondrial DNA, 9:00"); clicking focuses that lecture on the board

## Scope

`courseTag: 'filter'` - only the board course, with "+N in other courses". `recordingId: 'highlight'` - to-dos made from the focused lecture are emphasised.

## Internal Dependencies

`lens-framework`, `substrate`, `shared-ui`
