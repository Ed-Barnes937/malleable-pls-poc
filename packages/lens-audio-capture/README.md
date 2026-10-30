# @pls/lens-audio-capture

Lens for recording and playing back audio during learning sessions.

## Features

- Record, pause, and resume audio
- Upload an existing audio file (webm, mp3, m4a, wav, ogg): with a title and course, or, with a lecture selected, into that lecture ("Adds to <lecture>")
- With a lecture selected and no recording: "Ready to record <lecture>", and captures go into it. With a recording: plays the latest part, **Record more** adds another part, **New lecture** clears the board's lecture (at once in the widget; it says so if the board couldn't be changed)
- Without a lecture, a capture or upload is a new lecture in the board course, and it becomes the board's lecture
- A capture goes into the lecture the board showed when it started (a file: when it was submitted), even if the board moves on meanwhile; the widget then says where it was saved
- If that lecture is gone by the time the upload lands, the audio is kept: **Save as a new lecture** or **Discard**
- Waveform visualisation with animation
- Playback controls (play, pause, reset)
- Elapsed time and progress tracking

## States

`idle` → `recording` → `uploading` → `complete` (a file upload skips `recording`)

## Scope

`lectureId: 'target'` - records into the board's lecture. `courseTag: 'filter'` - files a new lecture under the board course.

## Internal Dependencies

`lens-framework`, `substrate`, `shared-ui`
