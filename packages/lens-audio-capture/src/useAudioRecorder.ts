import { useState, useEffect, useCallback, useRef } from 'react'
import { useBoardId, useSubstrateMutations, type LiveCapturePhase } from '@pls/lens-framework'
import { dayMonthAndTime } from '@pls/shared-ui'
import { LectureGoneError, readAudioDuration, uploadRecording, type UploadRecordingArgs, type UploadedRecording } from './uploadRecording'

export type CaptureState = 'idle' | 'recording' | 'uploading' | 'complete'

// 24 kbps measurably hurt Whisper accuracy; 48 kbps opus keeps an hour of
// lecture around 21 MB, under the 50 MB upload cap.
const RECORDING_BITS_PER_SECOND = 48_000

/**
 * How long Stop waits for the lecture Record started making before the
 * audio goes without it: the upload then makes (and the server selects) a
 * lecture of its own.
 */
export const START_LECTURE_WAIT_MS = 10_000

export interface AudioRecorderOptions {
  /** Course of the new lecture a capture makes when there is no `lectureId`. */
  course?: string | null
  /** The lecture captures and uploads go into; none = each makes a new lecture. */
  lectureId?: string | null
  /** `lectureId`'s title, to say where a recording went once the board has moved on. */
  lectureTitle?: string | null
  /**
   * Called once a recording is uploaded, with it and its lecture (the
   * server has already selected a lecture it made, where the board still
   * allowed it). `boardMoved`: the board's lecture changed while it was
   * recording or uploading, so it went where it was aimed, not into the
   * lecture the board shows now.
   */
  onRecordingCreated?: (recording: UploadedRecording, info: { boardMoved: boolean }) => void
}

/** Where a capture or upload goes, fixed when it starts. */
interface Target {
  lectureId: string | null
  /** The lecture's title (null for a new lecture, which takes the recording's). */
  title: string | null
  course: string | null
  /** The board's lecture when it started (for a capture that made its lecture: none). */
  boardLecture: string | null
  /**
   * The board has shown `lectureId` since this started. A capture that made
   * its lecture at start is "moved" once the board stops showing it, but
   * not before the board has caught up with it.
   */
  shown: boolean
  /** Stop gave up waiting for the lecture being made at start: it is not used if it comes. */
  gaveUpOnStart?: boolean
}

type UploadArgs = Omit<UploadRecordingArgs, 'lectureId' | 'boardId' | 'selectOnBoard'> & { uploadId: string }

/** What `uploadFile` takes: the duration is read here, once the target is fixed. */
export type UploadFileArgs = Omit<UploadArgs, 'durationMs' | 'uploadId'>

/** The board has moved on from where `target` was aimed: it shows another lecture, or none. */
function boardMovedFrom(target: Target, boardLecture: string | null): boolean {
  if (boardLecture === target.lectureId) return false
  // A lecture made at start that the board hasn't shown yet: it is still on
  // its way to the board, unless the board shows another lecture already.
  if (!target.shown) return boardLecture !== null
  return true
}

/**
 * MediaRecorder capture + file upload. State machine: idle → recording →
 * uploading → complete (a file upload skips `recording`). `hasAudio` (the
 * board's lecture has a recording to play; undefined while that is still
 * loading, which changes nothing) drives idle/complete whenever no capture
 * is in flight.
 *
 * A capture goes into the lecture the board showed when it started. With
 * none, the lecture is made the moment capture starts (`useStartLecture`:
 * the server selects it on the board, and joins a class that is on), so
 * every widget knows it while the class is still going; the capture is
 * reported as live (`useSetLiveCapture`) for e.g. the Transcript's
 * "Recording...". A file goes into the board's lecture when it was
 * submitted, else a new lecture the server makes and selects with the
 * upload. Either way the board can move on meanwhile; nothing snaps it back.
 */
export function useAudioRecorder(hasAudio: boolean | undefined, options: AudioRecorderOptions = {}) {
  const { course, lectureId, lectureTitle, onRecordingCreated } = options
  const boardId = useBoardId()
  const boardIdRef = useRef(boardId)
  boardIdRef.current = boardId
  const writer = useSubstrateMutations()
  const startLecture = writer.useStartLecture()
  const setLiveCapture = writer.useSetLiveCapture()
  const [state, setState] = useState<CaptureState>(hasAudio ? 'complete' : 'idle')
  const [elapsed, setElapsed] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [recordingId, setRecordingId] = useState<string | null>(null)
  // The lecture the capture in progress goes into, once known (to show it).
  const [captureTitle, setCaptureTitle] = useState<string | null>(null)
  // Audio whose upload failed: kept (in this page only) to try again.
  const [unsaved, setUnsaved] = useState<{ args: UploadArgs; target: Target } | null>(null)

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Blob[]>([])
  // Where the capture in progress goes, fixed by `start`.
  const captureTargetRef = useRef<Target | null>(null)
  // The capture's lecture being made (`useStartLecture`), until it settles.
  const startingRef = useRef<Promise<void> | null>(null)
  // The live capture reported (lecture and phase), so it can be moved on or cleared.
  const liveRef = useRef<{ lectureId: string; phase: LiveCapturePhase } | null>(null)
  // Latest values without re-creating the upload callbacks on every render.
  const onRecordingCreatedRef = useRef(onRecordingCreated)
  onRecordingCreatedRef.current = onRecordingCreated
  const hasAudioRef = useRef(hasAudio)
  hasAudioRef.current = hasAudio
  const lectureIdRef = useRef(lectureId ?? null)
  lectureIdRef.current = lectureId ?? null
  const lectureTitleRef = useRef(lectureTitle ?? null)
  lectureTitleRef.current = lectureTitle ?? null
  const courseRef = useRef(course ?? null)
  courseRef.current = course ?? null
  const startLectureRef = useRef(startLecture)
  startLectureRef.current = startLecture
  // Captures and uploads not settled yet, to note when the board shows their lecture.
  const inFlightRef = useRef(new Set<Target>())

  useEffect(() => {
    if (!lectureId) return
    for (const target of inFlightRef.current) if (target.lectureId === lectureId) target.shown = true
  }, [lectureId])

  /** Reports the capture into `target`'s lecture as `phase` (null: over). */
  const reportLive = useCallback((target: Target | null, phase: LiveCapturePhase | null) => {
    const previous = liveRef.current
    const next = target?.lectureId && phase ? { lectureId: target.lectureId, phase } : null
    if (previous && previous.lectureId !== next?.lectureId) setLiveCapture(previous.lectureId, null)
    if (next) setLiveCapture(next.lectureId, next.phase)
    liveRef.current = next
  }, [setLiveCapture])

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
      captureTargetRef.current = null
      if (liveRef.current) setLiveCapture(liveRef.current.lectureId, null)
      liveRef.current = null
    },
    [stopTimer, setLiveCapture],
  )

  // Audio only this page holds (a capture, or a failed upload) is lost on a
  // reload: the browser asks first.
  const holdingAudio = state === 'recording' || state === 'uploading' || unsaved !== null
  useEffect(() => {
    if (!holdingAudio) return
    const warn = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [holdingAudio])

  /** Where something started now goes: the board's lecture, else a new one in the board's course. */
  const currentTarget = useCallback((): Target => ({
    lectureId: lectureIdRef.current,
    title: lectureTitleRef.current,
    course: courseRef.current,
    boardLecture: lectureIdRef.current,
    shown: lectureIdRef.current !== null,
  }), [])

  const start = useCallback(async () => {
    stopTimer()
    setError(null)
    setNotice(null)
    chunksRef.current = []
    const target = currentTarget()
    captureTargetRef.current = target
    inFlightRef.current.add(target)
    setCaptureTitle(target.title)
    startingRef.current = null
    if (target.lectureId) {
      reportLive(target, 'recording')
    } else {
      // The lecture exists from now: the server makes it (or finds the
      // class that is on) and selects it on the board. If that fails, the
      // capture goes on regardless and its upload makes the lecture.
      startingRef.current = startLectureRef.current.mutateAsync({ course: target.course }).then(
        (lecture) => {
          // Too late: Stop has sent the audio without it.
          if (target.gaveUpOnStart) return
          target.lectureId = lecture.id
          target.title = lecture.title
          target.course = lecture.course
          if (lectureIdRef.current === lecture.id) target.shown = true
          // Only while this capture is still recording: the mic may have
          // been refused, or it stopped (its upload reports it as saving).
          if (captureTargetRef.current !== target) return
          setCaptureTitle(lecture.title)
          reportLive(target, 'recording')
        },
        (err) => console.error('start lecture error:', err),
      )
    }

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
      // The lecture (made above, if it was) stays: an empty lecture is a
      // valid one ("I was there, no audio").
      captureTargetRef.current = null
      inFlightRef.current.delete(target)
      setCaptureTitle(null)
      reportLive(null, null)
      setError('Microphone access denied')
      console.error('mic error:', err)
    }
  }, [stopTimer, currentTarget, reportLive])

  // Shared by mic captures and picked files, into `target`. On failure, fall
  // back to whatever the board's lecture says (the effect above only re-runs
  // when it changes).
  const upload = useCallback(async (args: UploadArgs, target: Target) => {
    inFlightRef.current.add(target)
    setState('uploading')
    reportLive(target, 'saving')
    const send = (into: string | null) => uploadRecording({
      ...args,
      lectureId: into,
      boardId: boardIdRef.current,
      selectOnBoard: into === null,
    })
    const settle = (created: UploadedRecording, boardMoved: boolean, savedTo: string) => {
      if (boardMoved) {
        // The widget now shows another lecture: say where this one went.
        setNotice(`Saved to ${savedTo}`)
        setState(hasAudioRef.current ? 'complete' : 'idle')
      } else {
        setRecordingId(created.id)
        setState('complete')
      }
      onRecordingCreatedRef.current?.(created, { boardMoved })
    }
    try {
      try {
        const created = await send(target.lectureId)
        const boardMoved = target.lectureId === null
          ? !created.selected
          : boardMovedFrom(target, lectureIdRef.current)
        settle(created, boardMoved, target.title ?? args.title)
      } catch (err) {
        if (!(err instanceof LectureGoneError)) throw err
        // The lecture went while this was recording (deleted elsewhere): the
        // audio is saved straight away as a new lecture in the same course,
        // which the server selects on the board unless the board shows
        // another (existing) lecture by now. Nothing waits on a choice.
        const created = await send(null)
        settle(created, !created.selected, args.title)
        setNotice(created.selected
          ? 'That lecture was gone, so this was saved as a new lecture'
          : `That lecture was gone, so this was saved as a new lecture: ${args.title}`)
      }
      setUnsaved(null)
    } catch (err) {
      // Kept, so it can be tried again; the widget says it isn't saved.
      setUnsaved({ args, target })
      setError(err instanceof Error && err.message.startsWith('Upload failed') ? err.message : 'Upload failed')
      setState(hasAudioRef.current ? 'complete' : 'idle')
      console.error('upload error:', err)
    } finally {
      inFlightRef.current.delete(target)
      if (liveRef.current?.lectureId === target.lectureId) reportLive(null, null)
    }
  }, [reportLive])

  const stop = useCallback(async () => {
    stopTimer()
    const recorder = mediaRecorderRef.current
    const target = captureTargetRef.current ?? currentTarget()
    captureTargetRef.current = null
    setCaptureTitle(null)
    if (!recorder || recorder.state === 'inactive') {
      reportLive(null, null)
      setState('idle')
      return
    }

    setState('uploading')
    reportLive(target, 'saving')

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
      inFlightRef.current.delete(target)
      reportLive(null, null)
      setError('No audio captured')
      setState(hasAudioRef.current ? 'complete' : 'idle')
      return
    }

    // The lecture made at start, if that is still on its way, for a while:
    // past that the audio goes without it, and the upload makes (and the
    // server selects) a lecture of its own.
    const starting = startingRef.current
    startingRef.current = null
    if (starting && !(await settlesWithin(starting, START_LECTURE_WAIT_MS))) target.gaveUpOnStart = true

    await upload({
      audio: blob,
      contentType: 'audio/webm',
      title: recordingTitle(Date.now()),
      durationMs: elapsed,
      course: target.course,
      uploadId: newUploadId(),
    }, target)
  }, [stopTimer, upload, elapsed, currentTarget, reportLive])

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
      setUnsaved(null)
      setState('uploading')
      const durationMs = await readAudioDuration(args.audio)
      await upload({ ...args, durationMs, uploadId: newUploadId() }, target)
    },
    [stopTimer, upload, currentTarget],
  )

  /** Try the failed upload (`hasUnsaved`) again, to where it was aimed. */
  const retryUnsaved = useCallback(async () => {
    if (!unsaved) return
    setError(null)
    setNotice(null)
    await upload(unsaved.args, unsaved.target)
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
    /** The lecture the capture in progress goes into, once known. */
    captureTitle,
    hasUnsaved: unsaved !== null, retryUnsaved, discardUnsaved,
  }
}

/** Whether `promise` settles within `ms`. */
function settlesWithin(promise: Promise<unknown>, ms: number): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined
  return Promise.race([
    promise.then(() => true, () => true),
    new Promise<boolean>((resolve) => { timer = setTimeout(() => resolve(false), ms) }),
  ]).finally(() => clearTimeout(timer))
}

/** One id per capture or file, sent with every try of its upload. */
function newUploadId(): string {
  return crypto.randomUUID()
}

/** Title for a new capture, in house style: "Lecture 27 Oct, 00:20". */
export function recordingTitle(now: number): string {
  return `Lecture ${dayMonthAndTime(now)}`
}
