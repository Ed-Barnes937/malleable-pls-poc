# @pls/lens-audio-capture

Lens for recording and playing back audio during learning sessions.

## Features

- Record, pause, and resume audio
- Upload an existing audio file (webm, mp3, m4a, wav, ogg) with a title and course
- New recordings become the workspace's focused recording
- Waveform visualisation with animation
- Playback controls (play, pause, reset)
- Elapsed time and progress tracking

## States

`idle` → `recording` → `paused` → `complete`

## Scope

`recordingId: 'target'` - binds audio to the focused recording. `courseTag: 'label'` - files a new lecture under the board course.

## Internal Dependencies

`lens-framework`, `substrate`, `shared-ui`
