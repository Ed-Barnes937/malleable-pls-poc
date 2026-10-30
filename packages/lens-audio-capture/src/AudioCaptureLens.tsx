import { useRef, useState, type ChangeEvent } from 'react'
import { type LensProps, useSubstrate, useSubstrateMutations } from '@pls/lens-framework'
import { cn, formatTime } from '@pls/shared-ui'
import { Mic, Square, Play, Pause, FilePlus2, Loader2, Upload } from 'lucide-react'
import { API_URL } from './env'
import { useAudioRecorder } from './useAudioRecorder'
import { useAudioPlayback } from './useAudioPlayback'
import { ACCEPTED_AUDIO, audioContentType } from './uploadRecording'
import { UploadRecordingForm, type UploadRecordingDetails } from './UploadRecordingForm'

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
              // Played bars in accent, the rest faded; live input in the
              // recording colour.
              active ? 'bg-confused opacity-60' : isPlayed ? 'bg-accent' : 'bg-accent opacity-30',
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

export default function AudioCaptureLens({ scope, onScopeChange }: LensProps) {
  const substrate = useSubstrate()

  // A lecture the student let go of here (New lecture) while the board's
  // write is on its way: the widget acts as if it were cleared already, so
  // the next capture can't land in it. Dropped once the board shows
  // something else.
  const [letGo, setLetGo] = useState<string | null>(null)
  const [scopeError, setScopeError] = useState<string | null>(null)
  if (letGo && scope.lectureId !== letGo) setLetGo(null)

  // The board's lecture: captures and uploads go into it, and its latest
  // recording plays. Without one, a capture makes a new lecture in the board
  // course as it starts, and the server selects it on the board.
  const lectureId = scope.lectureId === letGo ? undefined : scope.lectureId
  const { data: lecture } = substrate.useLecture(lectureId)
  const shown = lectureId && lecture?.id === lectureId ? lecture : undefined
  const latest = shown?.recordings.at(-1)
  const { data: recording } = substrate.useRecording(latest?.id ?? '')
  // Unknown while the lecture loads, so the widget doesn't flash "Ready".
  const hasAudio = !lectureId ? false : shown ? shown.recordings.length > 0 : undefined
  const recordingAdded = useSubstrateMutations().useRecordingAdded()

  /** Clear the board's lecture, at once here; if the write fails, say so and show it again. */
  const letGoOf = (id: string) => {
    setLetGo(id)
    setScopeError(null)
    void Promise.resolve(onScopeChange?.({ lectureId: undefined })).then((written) => {
      if (written !== false) return
      setLetGo((current) => (current === id ? null : current))
      setScopeError("Couldn't start a new lecture - try again")
    })
  }

  // The server selects any lecture a capture or upload makes (at capture
  // start, or with the upload), so the widget only refreshes what shows
  // recordings, lectures and the board's scope.
  const recorder = useAudioRecorder(hasAudio, {
    course: scope.courseTag,
    lectureId: lectureId ?? null,
    lectureTitle: shown?.title ?? null,
    onRecordingCreated: () => recordingAdded(),
  })
  const { state, elapsed, error } = recorder
  // The board's lecture is still loading: neither "Ready to record" nor its
  // buttons yet, which would flip to "Record more" a moment later.
  const settling = hasAudio === undefined && (state === 'idle' || state === 'complete')

  const fileInputRef = useRef<HTMLInputElement>(null)
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [fileError, setFileError] = useState<string | null>(null)

  const handleFilePicked = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    // Reset so picking the same file again still fires onChange.
    e.target.value = ''
    if (!file) return
    if (!audioContentType(file)) {
      setFileError('Pick a webm, mp3, m4a, wav or ogg audio file')
      return
    }
    setFileError(null)
    setPendingFile(file)
  }

  const handleUpload = async ({ title, course }: UploadRecordingDetails) => {
    const file = pendingFile
    if (!file) return
    setPendingFile(null)
    playback.stop()
    await recorder.uploadFile({
      audio: file,
      contentType: audioContentType(file) as string,
      title,
      course,
    })
  }

  const duration = recording?.duration ?? elapsed
  const activeRecordingId = recorder.recordingId ?? latest?.id

  const playbackUrl =
    state === 'complete' && activeRecordingId && recording?.audio_url
      ? `${API_URL}${recording.audio_url}`
      : null
  const playback = useAudioPlayback(playbackUrl)

  const progress = state === 'complete' && duration > 0
    ? (playback.playing || playback.position > 0 ? Math.min(playback.position / duration, 1) : 1)
    : 0

  if (pendingFile) {
    return (
      <div className="container-size flex h-full min-h-0 flex-col items-center justify-center overflow-hidden px-3">
        <UploadRecordingForm
          file={pendingFile}
          defaultCourse={scope.courseTag}
          intoLecture={shown?.title}
          onSubmit={handleUpload}
          onCancel={() => setPendingFile(null)}
        />
      </div>
    )
  }

  return (
    <div className="container-size flex h-full min-h-0 flex-col overflow-hidden">
      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPTED_AUDIO}
        aria-label="Audio file"
        className="hidden"
        onChange={handleFilePicked}
      />
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 px-3 @tall:gap-4">
        {state === 'recording' && (
          <div className="flex max-w-full items-center gap-1.5">
            <span className="relative flex h-2 w-2 shrink-0">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-confused opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-confused" />
            </span>
            <span className="text-meta font-semibold text-confused">
              REC
            </span>
            {recorder.captureTitle && (
              <span data-testid="recording-into" className="min-w-0 truncate text-meta text-text-secondary">{recorder.captureTitle}</span>
            )}
          </div>
        )}

        {state === 'uploading' && (
          <div className="flex items-center gap-1.5">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-accent" />
            <span className="text-meta text-text-secondary">Uploading & transcribing…</span>
          </div>
        )}

        {state === 'complete' && !settling && (
          <div className="hidden text-center @tall:block">
            <p className="truncate text-body font-semibold text-text-primary">{shown?.title ?? recording?.title ?? 'Recording complete'}</p>
            <p className="mt-0.5 text-meta text-text-muted">
              {shown && shown.recordings.length > 1 ? `Part ${shown.recordings.length} · ` : ''}
              {formatTime(duration)} total
            </p>
          </div>
        )}

        {state === 'idle' && !settling && (
          <p data-testid="ready-to-record" className="max-w-full truncate text-meta text-text-muted @tall:text-body">
            {shown ? <>Ready to record <span className="font-semibold text-text-primary">{shown.title}</span></> : 'Ready to record'}
          </p>
        )}

        {(fileError ?? scopeError ?? error) && (
          <p role="alert" className="text-center text-meta text-confused">{fileError ?? scopeError ?? error}</p>
        )}

        {recorder.notice && (
          <p role="status" className="max-w-full truncate text-center text-meta text-text-muted">{recorder.notice}</p>
        )}

        {recorder.hasUnsaved && (
          <div className="flex flex-col items-center gap-1.5">
            <p data-testid="not-saved" className="text-center text-meta font-semibold text-text-primary">Not saved yet</p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void recorder.retryUnsaved()}
                className="rounded-full bg-accent px-3 py-1 text-meta font-semibold text-accent-foreground transition-all hover:opacity-90 active:scale-95"
              >
                Try again
              </button>
              <button
                type="button"
                onClick={recorder.discardUnsaved}
                className="rounded-full border border-border px-3 py-1 text-meta text-text-secondary transition-all hover:bg-surface-overlay hover:text-text-primary active:scale-95"
              >
                Discard
              </button>
            </div>
          </div>
        )}

        <Waveform active={state === 'recording'} progress={progress} />

        <span data-testid="capture-timer" className="text-body font-semibold tabular-nums text-text-primary @tall:text-heading">
          {state === 'recording'
            ? formatTime(elapsed)
            : state === 'complete' && playback.playing
              ? formatTime(playback.position)
              : state === 'complete'
                ? formatTime(duration)
                : '0:00'}
        </span>

        <div className="flex items-center gap-2 @tall:gap-3">
          {settling || recorder.hasUnsaved ? null : state === 'idle' || state === 'complete' ? (
            <>
              {state === 'complete' && (
                <button
                  type="button"
                  onClick={playback.toggle}
                  aria-label={playback.playing ? 'Pause' : 'Play recording'}
                  title={playback.playing ? 'Pause' : 'Play recording'}
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-accent text-accent-foreground transition-all hover:opacity-90 active:scale-95 @tall:h-11 @tall:w-11"
                >
                  {playback.playing
                    ? <Pause className="h-4 w-4 @tall:h-[18px] @tall:w-[18px]" />
                    : <Play className="ml-0.5 h-4 w-4 @tall:h-[18px] @tall:w-[18px]" />}
                </button>
              )}
              <button
                type="button"
                onClick={recorder.start}
                aria-label={state === 'complete' ? 'Record more' : 'Start recording'}
                title={state === 'complete' ? 'Record more of this lecture' : 'Start recording'}
                className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-surface-raised text-text-secondary transition-all hover:bg-surface-overlay hover:text-text-primary active:scale-95 @tall:h-11 @tall:w-11"
              >
                <Mic className="h-4 w-4 @tall:h-[18px] @tall:w-[18px]" />
              </button>
              <button
                onClick={() => fileInputRef.current?.click()}
                aria-label="Upload a recording"
                title="Upload a recording"
                className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-surface-raised text-text-secondary transition-all hover:bg-surface-overlay hover:text-text-primary active:scale-95 @tall:h-11 @tall:w-11"
              >
                <Upload className="h-4 w-4 @tall:h-[18px] @tall:w-[18px]" />
              </button>
              {state === 'complete' && (
                <button
                  type="button"
                  // Clears the board's lecture, so the next capture is a new one
                  // and every widget on the board moves on with it.
                  onClick={() => {
                    recorder.reset()
                    playback.stop()
                    if (scope.lectureId) letGoOf(scope.lectureId)
                  }}
                  aria-label="New lecture"
                  title="New lecture"
                  className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-surface-raised text-text-secondary transition-all hover:bg-surface-overlay hover:text-text-primary active:scale-95 @tall:h-11 @tall:w-11"
                >
                  <FilePlus2 className="h-4 w-4 @tall:h-[18px] @tall:w-[18px]" />
                </button>
              )}
            </>
          ) : state === 'recording' ? (
            <button
              type="button"
              onClick={recorder.stop}
              aria-label="Stop recording"
              title="Stop recording"
              className="flex h-9 w-9 items-center justify-center rounded-full bg-confused text-surface-raised ring-4 ring-confused-soft transition-all hover:opacity-90 active:scale-95 @tall:h-11 @tall:w-11"
            >
              <Square className="h-4 w-4 @tall:h-[18px] @tall:w-[18px]" />
            </button>
          ) : null}
        </div>
      </div>

      {state === 'complete' && !settling && (
        <div className="pt-2 @tall:pt-3">
          <div className="relative h-1.5 rounded-full bg-surface-overlay">
            <div
              className="absolute inset-y-0 left-0 rounded-full bg-accent transition-all duration-1000"
              style={{ width: `${progress * 100}%` }}
            />
            <div
              className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-accent bg-surface-raised transition-all duration-1000"
              style={{ left: `${progress * 100}%` }}
            />
          </div>
          <div className="mt-1.5 flex justify-between text-meta tabular-nums text-text-muted">
            <span>{playback.playing || playback.position > 0 ? formatTime(playback.position) : '0:00'}</span>
            <span>{formatTime(duration)}</span>
          </div>
        </div>
      )}
    </div>
  )
}
