import { useState, useEffect, useCallback, useRef } from 'react'
import { useBoardId } from '@pls/lens-framework'
import { dayMonthAndTime } from '@pls/shared-ui'
import { uploadRecording, type UploadRecordingArgs, type UploadedRecording } from './uploadRecording'

export type CaptureState = 'idle' | 'recording' | 'uploading' | 'complete'

// 24 kbps measurably hurt Whisper accuracy; 48 kbps opus keeps an hour of
// lecture around 21 MB, under the 50 MB upload cap.
const RECORDING_BITS_PER_SECOND = 48_000

export interface AudioRecorderOptions {
  /** Course of the new lecture a capture makes when there is no `lectureId`. */
  course?: string | null
  /** The lecture captures and uploads go into; none = each makes a new lecture. */
  lectureId?: string | null
  /** Called once a recording is uploaded, with it and its lecture, e.g. to select the lecture. */
  onRecordingCreated?: (recording: UploadedRecording) => void
}

/**
 * MediaRecorder capture + file upload. State machine: idle → recording →
 * uploading → complete (a file upload skips `recording`). `hasAudio` (the
 * board's lecture has a recording to play; undefined while that is still
 * loading, which changes nothing) drives idle/complete whenever no capture
 * is in flight.
 */
export function useAudioRecorder(hasAudio: boolean | undefined, options: AudioRecorderOptions = {}) {
  const { course, lectureId, onRecordingCreated } = options
  const boardId = useBoardId()
  const boardIdRef = useRef(boardId)
  boardIdRef.current = boardId
  const [state, setState] = useState<CaptureState>(hasAudio ? 'complete' : 'idle')
  const [elapsed, setElapsed] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [recordingId, setRecordingId] = useState<string | null>(null)

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Blob[]>([])
  // Latest values without re-creating the upload callbacks on every render.
  const onRecordingCreatedRef = useRef(onRecordingCreated)
  onRecordingCreatedRef.current = onRecordingCreated
  const hasAudioRef = useRef(hasAudio)
  hasAudioRef.current = hasAudio
  const lectureIdRef = useRef(lectureId)
  lectureIdRef.current = lectureId

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

  const start = useCallback(async () => {
    stopTimer()
    setError(null)
    chunksRef.current = []

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
      setError('Microphone access denied')
      console.error('mic error:', err)
    }
  }, [stopTimer])

  // Shared by mic captures and picked files, into the board's lecture (read
  // when the upload starts) or a new one. On failure, fall back to whatever
  // the board's lecture says (the effect above only re-runs when it changes).
  const upload = useCallback(async (args: UploadRecordingArgs) => {
    setState('uploading')
    try {
      const created = await uploadRecording({ ...args, lectureId: lectureIdRef.current ?? null, boardId: boardIdRef.current })
      setRecordingId(created.id)
      setState('complete')
      onRecordingCreatedRef.current?.(created)
    } catch (err) {
      setError(err instanceof Error && err.message.startsWith('Upload failed') ? err.message : 'Upload failed')
      setState(hasAudioRef.current ? 'complete' : 'idle')
      console.error('upload error:', err)
    }
  }, [])

  const stop = useCallback(async () => {
    stopTimer()
    const recorder = mediaRecorderRef.current
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
      course,
    })
  }, [stopTimer, upload, elapsed, course])

  /** Upload a picked audio file as a recording (into the board's lecture, if any). */
  const uploadFile = useCallback(
    async (args: UploadRecordingArgs) => {
      stopTimer()
      setError(null)
      await upload(args)
    },
    [stopTimer, upload],
  )

  const reset = useCallback(() => {
    stopTimer()
    setState('idle')
    setRecordingId(null)
  }, [stopTimer])

  return { state, elapsed, error, start, stop, uploadFile, reset, recordingId }
}

/** Title for a new capture, in house style: "Lecture 27 Oct, 00:20". */
export function recordingTitle(now: number): string {
  return `Lecture ${dayMonthAndTime(now)}`
}
