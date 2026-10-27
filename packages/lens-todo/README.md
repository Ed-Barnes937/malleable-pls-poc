# @pls/lens-todo

To-do widget: a view over `task` plan items.

## Features

- Quick add with an optional time estimate; new to-dos inherit the board course
- Tick done (stays visible under "Done today", untick to restore) or dismiss ("Not doing this")
- Shows the scheduled time when a to-do is placed in the calendar, or its due day
- Calm wording for anything that slipped: "Still to do from Monday", never "overdue"
- Source link for to-dos made from a lecture moment ("from: Mitochondrial DNA, 9:00"); clicking focuses that lecture on the board

## Scope

`courseTag: 'filter'` - only the board course, with "+N in other courses". `recordingId: 'highlight'` - to-dos made from the focused lecture are emphasised.

## Internal Dependencies

`lens-framework`, `substrate`, `shared-ui`
