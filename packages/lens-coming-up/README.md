# @pls/lens-coming-up

Coming up widget: open `deadline` plan items in a look-ahead window, grouped by day.

## Features

- Look-ahead defaults to 14 days; the "Next N days" picker saves `lookAheadDays` to the panel config (a layer-2 knob)
- Open deadlines from earlier are always shown first, gently ("Still to do from Friday")
- Clicking a deadline focuses the board on its course

## Scope

`courseTag: 'filter'` - only the board course, with "+N in other courses". `lectureId: 'highlight'` - deadlines made from a moment of any of the board lecture's recordings are emphasised; none without a lecture.

## Internal Dependencies

`lens-framework`, `substrate`, `shared-ui`
