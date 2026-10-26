import { useState, useEffect, useCallback, useRef } from 'react'
import { uploadRecording, type UploadRecordingArgs } from './uploadRecording'

export type CaptureState = 'idle' | 'recording' | 'uploading' | 'complete'

// 24 kbps measurably hurt Whisper accuracy; 48 kbps opus keeps an hour of
// lecture around 21 MB, under the 50 MB upload cap.
const RECORDING_BITS_PER_SECOND = 48_000

export interface AudioRecorderOptions {
  /** Course tag applied to new recordings (mic captures and file uploads). */
  course?: string | null
  /** Called with the new recording's id once it is uploaded, e.g. to focus it. */
  onRecordingCreated?: (recordingId: string) => void
}

/**
 * MediaRecorder capture + file upload. State machine: idle → recording →
 * uploading → complete (a file upload skips `recording`). `focusedRecordingId`
 * (the workspace recording focus) drives idle/complete whenever no capture is
 * in flight.
 */
export function useAudioRecorder(focusedRecordingId: string, options: AudioRecorderOptions = {}) {
  const { course, onRecordingCreated } = options
  const [state, setState] = useState<CaptureState>(focusedRecordingId ? 'complete' : 'idle')
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
  const focusedRecordingIdRef = useRef(focusedRecordingId)
  focusedRecordingIdRef.current = focusedRecordingId

  // Reflect focus changes in the state machine unless a capture is in flight.
  // The functional update reads the current state without needing it in deps.
  useEffect(() => {
    setState((s) =>
      s === 'recording' || s === 'uploading' ? s : focusedRecordingId ? 'complete' : 'idle',
    )
  }, [focusedRecordingId])

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

  // Shared by mic captures and picked files. On failure, fall back to whatever
  // the workspace focus says (the effect above only re-runs on focus change).
  const upload = useCallback(async (args: UploadRecordingArgs) => {
    setState('uploading')
    try {
      const id = await uploadRecording(args)
      setRecordingId(id)
      setState('complete')
      onRecordingCreatedRef.current?.(id)
    } catch (err) {
      setError(err instanceof Error && err.message.startsWith('Upload failed') ? err.message : 'Upload failed')
      setState(focusedRecordingIdRef.current ? 'complete' : 'idle')
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
      title: `Recording ${new Date().toLocaleString()}`,
      durationMs: elapsed,
      course,
    })
  }, [stopTimer, upload, elapsed, course])

  /** Upload a picked audio file as a new recording. */
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
