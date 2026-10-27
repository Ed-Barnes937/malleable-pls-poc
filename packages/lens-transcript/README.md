# @pls/lens-transcript

Lens for reviewing and annotating learning material transcripts.

## Features

- Display transcript segments with timestamps
- Tag segments as `confused`, `key-point`, or `question`
- Add free-text annotations to segments
- Two modes: **capture** (during recording) and **review** (after)

## Scope

`recordingId: 'target'` - shows the focused lecture, with all its tags and notes even when it is outside the board course. `courseTag: 'filter'` - the course narrows the lecture picker, and the focus clears when the course changes to one it is not in.

## Moments

Declares `showsMoments`. When another widget calls `onShowMoment` (e.g. a Calendar study block linked to a lecture moment), the shell focuses the lecture and passes `focusedMoment`; the transcript scrolls to the segment containing that offset and highlights it (`aria-current="location"`). Clicking any segment clears the highlight.

## Internal Dependencies

`lens-framework`, `substrate`, `shared-ui`
