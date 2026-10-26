# @pls/lens-transcript

Lens for reviewing and annotating learning material transcripts.

## Features

- Display transcript segments with timestamps
- Tag segments as `confused`, `key-point`, or `question`
- Add free-text annotations to segments
- Two modes: **capture** (during recording) and **review** (after)

## Scope

`recordingId: 'target'` - shows the focused lecture, with all its tags and notes even when it is outside the board course. `courseTag: 'filter'` - the course narrows the lecture picker, and the focus clears when the course changes to one it is not in.

## Internal Dependencies

`lens-framework`, `substrate`, `shared-ui`
