import { useState, useEffect, useCallback, useRef } from 'react'
import { API_URL, USER_ID, AUTH_TOKEN } from './env'

export type CaptureState = 'idle' | 'recording' | 'uploading' | 'complete'

/**
 * MediaRecorder capture + upload. State machine: idle → recording → uploading
 * → complete. `configRecordingId` (the picker selection) drives idle/complete
 * whenever no capture is in flight.
 */
export function useAudioRecorder(configRecordingId: string) {
  const [state, setState] = useState<CaptureState>(configRecordingId ? 'complete' : 'idle')
  const [elapsed, setElapsed] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [recordingId, setRecordingId] = useState<string | null>(null)

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Blob[]>([])

  // Reflect picker changes in the state machine unless a capture is in flight.
  // The functional update reads the current state without needing it in deps.
  useEffect(() => {
    setState((s) =>
      s === 'recording' || s === 'uploading' ? s : configRecordingId ? 'complete' : 'idle',
    )
  }, [configRecordingId])

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

    try {
      const res = await fetch(`${API_URL}/upload`, {
        method: 'POST',
        headers: {
          'Content-Type': 'audio/webm',
          'x-user-id': USER_ID,
          'x-recording-title': `Recording ${new Date().toLocaleString()}`,
          'x-recording-duration': String(elapsed),
          ...(AUTH_TOKEN ? { Authorization: `Bearer ${AUTH_TOKEN}` } : {}),
        },
        body: blob,
      })

      if (!res.ok) throw new Error(`Upload failed: ${res.status}`)

      const data = await res.json()
      setRecordingId(data.id)
      setState('complete')
    } catch (err) {
      setError('Upload failed')
      setState('idle')
      console.error('upload error:', err)
    }
  }, [stopTimer, elapsed])

  const reset = useCallback(() => {
    stopTimer()
    setState('idle')
    setRecordingId(null)
  }, [stopTimer])

  return { state, elapsed, error, start, stop, reset, recordingId }
}
