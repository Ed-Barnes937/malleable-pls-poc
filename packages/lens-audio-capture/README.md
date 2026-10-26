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

Uses `recordingId` from scope to bind audio to an existing recording entry.

## Internal Dependencies

`lens-framework`, `substrate`, `shared-ui`
