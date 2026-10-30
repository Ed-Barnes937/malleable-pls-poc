import { API_URL, USER_ID, AUTH_TOKEN } from './env'

/** File extensions the upload picker accepts, mapped to the MIME type sent to /upload. */
const CONTENT_TYPE_BY_EXTENSION: Record<string, string> = {
  webm: 'audio/webm',
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
}

export const ACCEPTED_AUDIO = Object.keys(CONTENT_TYPE_BY_EXTENSION)
  .map((ext) => `.${ext}`)
  .join(',')

function extensionOf(filename: string): string {
  const dot = filename.lastIndexOf('.')
  return dot > 0 ? filename.slice(dot + 1).toLowerCase() : ''
}

/**
 * MIME type to upload a picked file as. Browsers report inconsistent (or empty)
 * types for m4a/wav, so the extension wins; `null` means unsupported.
 */
export function audioContentType(file: File): string | null {
  return CONTENT_TYPE_BY_EXTENSION[extensionOf(file.name)] ?? null
}

/** "lecture-03_cells.mp3" -> "lecture-03 cells" */
export function titleFromFilename(filename: string): string {
  const dot = filename.lastIndexOf('.')
  const base = dot > 0 ? filename.slice(0, dot) : filename
  return base.replace(/[_]+/g, ' ').trim() || 'Untitled Recording'
}

/** Best-effort duration from the file's metadata; 0 when the browser can't tell. */
export function readAudioDuration(file: Blob, timeoutMs = 3000): Promise<number> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file)
    const audio = new Audio()
    const done = (ms: number) => {
      clearTimeout(timer)
      URL.revokeObjectURL(url)
      resolve(ms)
    }
    const timer = setTimeout(() => done(0), timeoutMs)
    audio.preload = 'metadata'
    audio.onloadedmetadata = () =>
      done(Number.isFinite(audio.duration) ? Math.round(audio.duration * 1000) : 0)
    audio.onerror = () => done(0)
    audio.src = url
  })
}

export interface UploadRecordingArgs {
  audio: Blob
  contentType: string
  title: string
  durationMs: number
  course?: string | null
  /**
   * The lecture to record into (e.g. the board's selected one). Without it
   * the server makes a new lecture for the recording, filed under `course`.
   */
  lectureId?: string | null
  /** The board the upload is made from, so that board's automations run. */
  boardId?: string | null
  /**
   * With no `lectureId`: the server selects the new lecture on `boardId`
   * in the same transaction, if that board still shows no lecture.
   */
  selectOnBoard?: boolean
}

/**
 * The lecture an upload was aimed at is gone (deleted, or never this
 * student's): nothing was recorded, so the audio can still go into a new one.
 */
export class LectureGoneError extends Error {
  constructor() {
    super('Upload failed - that lecture is gone')
    this.name = 'LectureGoneError'
  }
}

/** What /upload made: the recording, the lecture it is in, and whether the server selected that lecture on the board. */
export interface UploadedRecording {
  id: string
  lectureId: string
  selected: boolean
}

/**
 * POST the audio to the server's /upload route, which creates the recording
 * (in `lectureId`, or in a new lecture) and fires `recording:completed`
 * (kicking off transcription). Returns the new recording and its lecture.
 * Throws an Error whose message is safe to show the student.
 */
export async function uploadRecording(args: UploadRecordingArgs): Promise<UploadedRecording> {
  const res = await fetch(`${API_URL}/upload`, {
    method: 'POST',
    headers: {
      'Content-Type': args.contentType,
      'x-user-id': USER_ID,
      // Header values must be ISO-8859-1; the server decodes these.
      'x-recording-title': encodeURIComponent(args.title),
      ...(args.lectureId
        ? { 'x-lecture-id': args.lectureId }
        : args.course ? { 'x-recording-course': encodeURIComponent(args.course) } : {}),
      'x-recording-duration': String(Math.round(args.durationMs)),
      ...(args.boardId ? { 'x-workspace-id': args.boardId } : {}),
      ...(args.boardId && args.selectOnBoard && !args.lectureId ? { 'x-select-on-board': '1' } : {}),
      ...(AUTH_TOKEN ? { Authorization: `Bearer ${AUTH_TOKEN}` } : {}),
    },
    body: args.audio,
  })

  if (!res.ok) {
    if (res.status === 413) throw new Error('Upload failed - that file is too large (50MB max)')
    if (res.status === 415) throw new Error('Upload failed - that file type isn\'t supported')
    if (res.status === 404 && args.lectureId) throw new LectureGoneError()
    throw new Error('Upload failed - please try again')
  }

  const data = (await res.json()) as { id: string; lectureId: string; selected?: boolean }
  return { id: data.id, lectureId: data.lectureId, selected: data.selected === true }
}
