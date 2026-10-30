import { useState, useEffect, useCallback, useRef } from 'react'
import { useBoardId } from '@pls/lens-framework'
import { dayMonthAndTime } from '@pls/shared-ui'
import { LectureGoneError, readAudioDuration, uploadRecording, type UploadRecordingArgs, type UploadedRecording } from './uploadRecording'

export type CaptureState = 'idle' | 'recording' | 'uploading' | 'complete'

// 24 kbps measurably hurt Whisper accuracy; 48 kbps opus keeps an hour of
// lecture around 21 MB, under the 50 MB upload cap.
const RECORDING_BITS_PER_SECOND = 48_000

export interface AudioRecorderOptions {
  /** Course of the new lecture a capture makes when there is no `lectureId`. */
  course?: string | null
  /** The lecture captures and uploads go into; none = each makes a new lecture. */
  lectureId?: string | null
  /** `lectureId`'s title, to say where a recording went once the board has moved on. */
  lectureTitle?: string | null
  /**
   * Called once a recording is uploaded, with it and its lecture, e.g. to
   * select the lecture. `boardMoved`: the board's lecture changed while it
   * was recording or uploading, so it went where it was aimed, not into the
   * lecture the board shows now.
   */
  onRecordingCreated?: (recording: UploadedRecording, info: { boardMoved: boolean }) => void
  /**
   * The lecture an upload was aimed at is gone. Nothing was recorded and the
   * audio is kept (`hasUnsaved`), to save as a new lecture with `saveAsNewLecture`.
   */
  onLectureGone?: (lectureId: string) => void
}

/** Where a capture or upload goes, fixed when it starts. */
interface Target {
  lectureId: string | null
  /** The lecture's title (null for a new lecture, which takes the recording's). */
  title: string | null
  course: string | null
}

type UploadArgs = Omit<UploadRecordingArgs, 'lectureId' | 'boardId'>

/** What `uploadFile` takes: the duration is read here, once the target is fixed. */
export type UploadFileArgs = Omit<UploadArgs, 'durationMs'>

/**
 * MediaRecorder capture + file upload. State machine: idle → recording →
 * uploading → complete (a file upload skips `recording`). `hasAudio` (the
 * board's lecture has a recording to play; undefined while that is still
 * loading, which changes nothing) drives idle/complete whenever no capture
 * is in flight.
 *
 * A capture goes into the lecture the board showed when it started, and a
 * file into the one it showed when the file was submitted, even if the board
 * moves on before the upload lands.
 */
export function useAudioRecorder(hasAudio: boolean | undefined, options: AudioRecorderOptions = {}) {
  const { course, lectureId, lectureTitle, onRecordingCreated, onLectureGone } = options
  const boardId = useBoardId()
  const boardIdRef = useRef(boardId)
  boardIdRef.current = boardId
  const [state, setState] = useState<CaptureState>(hasAudio ? 'complete' : 'idle')
  const [elapsed, setElapsed] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [recordingId, setRecordingId] = useState<string | null>(null)
  // Audio whose lecture went before it landed: kept to save as a new lecture.
  const [unsaved, setUnsaved] = useState<UploadArgs | null>(null)

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Blob[]>([])
  // Where the capture in progress goes, fixed by `start`.
  const captureTargetRef = useRef<Target | null>(null)
  // Latest values without re-creating the upload callbacks on every render.
  const onRecordingCreatedRef = useRef(onRecordingCreated)
  onRecordingCreatedRef.current = onRecordingCreated
  const onLectureGoneRef = useRef(onLectureGone)
  onLectureGoneRef.current = onLectureGone
  const hasAudioRef = useRef(hasAudio)
  hasAudioRef.current = hasAudio
  const lectureIdRef = useRef(lectureId ?? null)
  lectureIdRef.current = lectureId ?? null
  const lectureTitleRef = useRef(lectureTitle ?? null)
  lectureTitleRef.current = lectureTitle ?? null
  const courseRef = useRef(course ?? null)
  courseRef.current = course ?? null

  // Reflect the board's lecture in the state machine unless a capture is in
  // flight. The functional update reads the current state without needing it
  // in deps.
  useEffect(() => {
    if (hasAudio === undefined) return
    setState((s) =>
      s === 'recording' || s === 'uploading' ? s : hasAudio ? 'complete' : 'idle',
    )
  }, [hasAudio, lectureId])

  const stopTimer = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
  }, [])

  useEffect(
    () => () => {
      stopTimer()
      streamRef.current?.getTracks().forEach((t) => t.stop())
    },
    [stopTimer],
  )

  /** Where something started now goes: the board's lecture, else a new one in the board's course. */
  const currentTarget = useCallback((): Target => ({
    lectureId: lectureIdRef.current,
    title: lectureTitleRef.current,
    course: courseRef.current,
  }), [])

  const start = useCallback(async () => {
    stopTimer()
    setError(null)
    setNotice(null)
    chunksRef.current = []
    captureTargetRef.current = currentTarget()

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream

      const recorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
          ? 'audio/webm;codecs=opus'
          : 'audio/webm',
        audioBitsPerSecond: RECORDING_BITS_PER_SECOND,
      })

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }

      mediaRecorderRef.current = recorder
      recorder.start(1000)

      setState('recording')
      setElapsed(0)
      intervalRef.current = setInterval(() => {
        setElapsed((e) => e + 1000)
      }, 1000)
    } catch (err) {
      captureTargetRef.current = null
      setError('Microphone access denied')
      console.error('mic error:', err)
    }
  }, [stopTimer, currentTarget])

  // Shared by mic captures and picked files, into `target`. On failure, fall
  // back to whatever the board's lecture says (the effect above only re-runs
  // when it changes).
  const upload = useCallback(async (args: UploadArgs, target: Target) => {
    setState('uploading')
    try {
      const created = await uploadRecording({ ...args, lectureId: target.lectureId, boardId: boardIdRef.current })
      const boardMoved = lectureIdRef.current !== target.lectureId
      if (boardMoved) {
        // The widget now shows another lecture: say where this one went.
        setNotice(`Saved to ${target.title ?? args.title}`)
        setState(hasAudioRef.current ? 'complete' : 'idle')
      } else {
        setRecordingId(created.id)
        setState('complete')
      }
      onRecordingCreatedRef.current?.(created, { boardMoved })
    } catch (err) {
      if (err instanceof LectureGoneError && target.lectureId) {
        // Keep the audio; the board lets go of the lecture, and the student
        // can save the audio as a new one.
        setUnsaved(args)
        setError("That lecture is gone, so this recording isn't saved yet")
        setState('idle')
        onLectureGoneRef.current?.(target.lectureId)
      } else {
        setError(err instanceof Error && err.message.startsWith('Upload failed') ? err.message : 'Upload failed')
        setState(hasAudioRef.current ? 'complete' : 'idle')
      }
      console.error('upload error:', err)
    }
  }, [])

  const stop = useCallback(async () => {
    stopTimer()
    const recorder = mediaRecorderRef.current
    const target = captureTargetRef.current ?? currentTarget()
    captureTargetRef.current = null
    if (!recorder || recorder.state === 'inactive') {
      setState('idle')
      return
    }

    setState('uploading')

    await new Promise<void>((resolve) => {
      recorder.onstop = () => resolve()
      recorder.stop()
    })

    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    mediaRecorderRef.current = null

    const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
    chunksRef.current = []

    if (blob.size === 0) {
      setError('No audio captured')
      setState('idle')
      return
    }

    await upload({
      audio: blob,
      contentType: 'audio/webm',
      title: recordingTitle(Date.now()),
      durationMs: elapsed,
      course: target.course,
    }, target)
  }, [stopTimer, upload, elapsed, currentTarget])

  /**
   * Upload a picked audio file as a recording: into the board's lecture as
   * it is at this call (if any), else a new lecture under `args.course`.
   */
  const uploadFile = useCallback(
    async (args: UploadFileArgs) => {
      const target = currentTarget()
      stopTimer()
      setError(null)
      setNotice(null)
      setState('uploading')
      const durationMs = await readAudioDuration(args.audio)
      await upload({ ...args, durationMs }, target)
    },
    [stopTimer, upload, currentTarget],
  )

  /** Save the kept audio (`hasUnsaved`) as a new lecture in the board's course. */
  const saveAsNewLecture = useCallback(async () => {
    if (!unsaved) return
    setUnsaved(null)
    setError(null)
    await upload({ ...unsaved, course: courseRef.current }, { lectureId: null, title: null, course: courseRef.current })
  }, [unsaved, upload])

  const discardUnsaved = useCallback(() => {
    setUnsaved(null)
    setError(null)
  }, [])

  const reset = useCallback(() => {
    stopTimer()
    setState('idle')
    setRecordingId(null)
    setNotice(null)
  }, [stopTimer])

  return {
    state, elapsed, error, notice, start, stop, uploadFile, reset, recordingId,
    hasUnsaved: unsaved !== null, saveAsNewLecture, discardUnsaved,
  }
}

/** Title for a new capture, in house style: "Lecture 27 Oct, 00:20". */
export function recordingTitle(now: number): string {
  return `Lecture ${dayMonthAndTime(now)}`
}
