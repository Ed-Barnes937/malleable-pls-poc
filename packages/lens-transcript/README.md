# @pls/lens-transcript

Lens for reviewing and annotating learning material transcripts.

## Features

- Display transcript segments with timestamps
- Tag segments as `confused`, `key-point`, or `question`
- Add free-text annotations to segments
- Two modes: **capture** (during recording) and **review** (after)
- The lecture summary shows one line; **More** opens all of it
- A moment marked confusing shows what its review became ("Review planned · Wed 19:30 · 20 min", fixed amber). With a Calendar on the board the chip is a button that reveals the block there (`onShowPlanItem`). A review that arrives while the lecture is open lifts off the moment toward the Calendar once (`motion-safe` only; never under reduced motion)

## Scope

`lectureId: 'target'` - shows the board's lecture one part at a time ("Part 1", "Part 2"; a moment opens the part it is in), or "No recording yet" when it has none. Without a lecture: "Pick a lecture", with the course's 5 latest lectures as one-click choices. `courseTag: 'filter'` - narrows that list; the board keeps its lecture inside its course (choosing a lecture brings its course, and a course change clears a lecture outside it).

## Moments

Declares `showsMoments`. When another widget calls `onShowMoment` (e.g. a Calendar study block linked to a lecture moment), the shell focuses the lecture and passes `focusedMoment`; the transcript scrolls to the segment containing that offset and highlights it (`aria-current="location"`). Clicking any segment clears the highlight.

## Internal Dependencies

`lens-framework`, `substrate`, `shared-ui`
