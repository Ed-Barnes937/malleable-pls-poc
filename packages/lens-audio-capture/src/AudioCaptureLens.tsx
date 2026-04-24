import { useState, useEffect, useCallback, useRef } from 'react'
import { useRecording } from '@pls/substrate'
import { type LensProps } from '@pls/lens-framework'
import { cn } from '@pls/shared-ui'
import { Mic, Square, Play, Pause, RotateCcw } from 'lucide-react'

function formatTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

function Waveform({ active, progress }: { active: boolean; progress: number }) {
  const bars = 48
  return (
    <div className="flex h-8 w-full items-end justify-center gap-[2px] @tall:h-16 @tall:gap-[3px]">
      {Array.from({ length: bars }).map((_, i) => {
        const position = i / bars
        const isPlayed = position < progress
        const seed = Math.sin(i * 12.9898 + 78.233) * 43758.5453
        const baseHeight = 0.15 + (seed - Math.floor(seed)) * 0.85
        const height = `${baseHeight * 100}%`

        return (
          <div
            key={i}
            className={cn(
              'w-[2px] rounded-full transition-all duration-300 @tall:w-[3px]',
              active && !isPlayed && 'animate-pulse',
              isPlayed
                ? 'bg-accent/70'
                : active
                  ? 'bg-tag-confused/40'
                  : 'bg-neutral-700'
            )}
            style={{
              height,
              animationDelay: active ? `${i * 50}ms` : undefined,
              animationDuration: active ? '800ms' : undefined,
            }}
          />
        )
      })}
    </div>
  )
}

type CaptureState = 'idle' | 'recording' | 'paused' | 'complete'

export default function AudioCaptureLens({ scope, config }: LensProps) {
  const recordingId = (config.recordingId as string) ?? scope.recordingId ?? ''
  const { data: recording } = useRecording(recordingId)

  const [state, setState] = useState<CaptureState>('complete')
  const [elapsed, setElapsed] = useState(0)
  const [playback, setPlayback] = useState(false)
  const [playbackPos, setPlaybackPos] = useState(0)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const duration = recording?.duration ?? 0

  const cleanup = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
  }, [])

  useEffect(() => () => cleanup(), [cleanup])

  const startRecording = useCallback(() => {
    cleanup()
    setState('recording')
    setElapsed(0)
    setPlayback(false)
    setPlaybackPos(0)
    intervalRef.current = setInterval(() => {
      setElapsed((e) => e + 1000)
    }, 1000)
  }, [cleanup])

  const stopRecording = useCallback(() => {
    cleanup()
    setState('complete')
  }, [cleanup])

  const togglePlayback = useCallback(() => {
    if (state !== 'complete') return
    if (playback) {
      cleanup()
      setPlayback(false)
    } else {
      setPlayback(true)
      setPlaybackPos(0)
      intervalRef.current = setInterval(() => {
        setPlaybackPos((p) => {
          if (p >= duration) {
            cleanup()
            setPlayback(false)
            return 0
          }
          return p + 1000
        })
      }, 1000)
    }
  }, [state, playback, duration, cleanup])

  const progress = state === 'complete' && duration > 0
    ? (playback ? playbackPos / duration : 1)
    : 0

  return (
    <div className="container-size flex h-full min-h-0 flex-col overflow-hidden">
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 px-3 @tall:gap-4">
        {state === 'recording' && (
          <div className="flex items-center gap-1.5">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-tag-confused opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-tag-confused" />
            </span>
            <span className="font-mono text-[10px] font-medium tracking-wider text-tag-confused">
              REC
            </span>
          </div>
        )}

        {state === 'complete' && (
          <div className="hidden text-center @tall:block">
            <p className="truncate text-sm font-medium text-neutral-300">{recording?.title ?? 'No recording'}</p>
            <p className="mt-0.5 text-[10px] text-neutral-600">{formatTime(duration)} total</p>
          </div>
        )}

        {state === 'idle' && (
          <p className="text-[10px] text-neutral-500 @tall:text-sm">Ready to record</p>
        )}

        <Waveform active={state === 'recording'} progress={progress} />

        <span className="font-mono text-sm font-semibold tabular-nums text-neutral-300 @tall:text-2xl">
          {state === 'recording'
            ? formatTime(elapsed)
            : state === 'complete' && playback
              ? formatTime(playbackPos)
              : state === 'complete'
                ? formatTime(duration)
                : '0:00'}
        </span>

        <div className="flex items-center gap-2 @tall:gap-3">
          {state === 'idle' || state === 'complete' ? (
            <>
              {state === 'complete' && (
                <button
                  onClick={togglePlayback}
                  className="flex h-7 w-7 items-center justify-center rounded-full bg-surface-overlay text-neutral-400 ring-1 ring-border transition-all hover:ring-accent/40 hover:text-neutral-200 @tall:h-10 @tall:w-10"
                >
                  {playback
                    ? <Pause className="h-3 w-3 @tall:h-4 @tall:w-4" />
                    : <Play className="ml-px h-3 w-3 @tall:ml-0.5 @tall:h-4 @tall:w-4" />}
                </button>
              )}
              <button
                onClick={startRecording}
                className="flex h-9 w-9 items-center justify-center rounded-full bg-tag-confused/15 text-tag-confused ring-2 ring-tag-confused/30 transition-all hover:bg-tag-confused/25 hover:ring-tag-confused/50 active:scale-95 @tall:h-12 @tall:w-12"
              >
                <Mic className="h-3.5 w-3.5 @tall:h-5 @tall:w-5" />
              </button>
              {state === 'complete' && (
                <button
                  onClick={() => { setState('idle'); setPlayback(false); cleanup() }}
                  className="flex h-7 w-7 items-center justify-center rounded-full bg-surface-overlay text-neutral-400 ring-1 ring-border transition-all hover:ring-accent/40 hover:text-neutral-200 @tall:h-10 @tall:w-10"
                >
                  <RotateCcw className="h-3 w-3 @tall:h-4 @tall:w-4" />
                </button>
              )}
            </>
          ) : (
            <button
              onClick={stopRecording}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-tag-confused/15 text-tag-confused ring-2 ring-tag-confused/30 transition-all hover:bg-tag-confused/25 hover:ring-tag-confused/50 active:scale-95 @tall:h-12 @tall:w-12"
            >
              <Square className="h-3 w-3 @tall:h-4 @tall:w-4" />
            </button>
          )}
        </div>
      </div>

      {state === 'complete' && (
        <div className="border-t border-border-subtle px-3 py-1.5 @tall:py-2.5">
          <div className="relative h-1.5 rounded-full bg-neutral-800">
            <div
              className="absolute inset-y-0 left-0 rounded-full bg-accent/60 transition-all duration-1000"
              style={{ width: `${progress * 100}%` }}
            />
            <div
              className="absolute top-1/2 h-3 w-3 -translate-y-1/2 rounded-full border-2 border-accent bg-surface-raised shadow-[0_0_6px_var(--color-accent)] transition-all duration-1000"
              style={{ left: `${progress * 100}%` }}
            />
          </div>
          <div className="mt-1 flex justify-between font-mono text-[10px] text-neutral-600">
            <span>{playback ? formatTime(playbackPos) : '0:00'}</span>
            <span>{formatTime(duration)}</span>
          </div>
        </div>
      )}
    </div>
  )
}
