import type { ProcedureRouter } from '../trpc-protocol'
import type { InMemoryDb, StoredRecording } from '../in-memory-db'

/** Mirrors `recordingCourse` on the server (apps/server/src/routers/_shared.ts). */
const COURSE_LABELS = new Set(['biology', 'chemistry', 'physics'])

export function registerRecordingsHandlers(router: ProcedureRouter, db: InMemoryDb): void {
  // A lecture's course: its first course tag, as on the server.
  const withCourse = (r: StoredRecording) => {
    const tag = db.tags
      .filter((t) => t.target_type === 'recording' && t.target_id === r.id && COURSE_LABELS.has(t.label))
      .sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id))[0]
    // One lecture per recording, as the server's lectures migration backfills them.
    return { ...r, lecture_id: `lec-${r.id}`, course: tag?.label ?? null }
  }

  router.register('recordings.list', (input) => {
    const opts = input as { courseTag?: string; recordingId?: string } | undefined

    if (opts?.recordingId) {
      return db.recordings.filter((r) => r.id === opts.recordingId).map(withCourse)
    }

    if (opts?.courseTag) {
      const taggedIds = new Set(
        db.tags
          .filter((t) => t.target_type === 'recording' && t.label === opts.courseTag)
          .map((t) => t.target_id),
      )
      return db.recordings
        .filter((r) => taggedIds.has(r.id))
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
        .map(withCourse)
    }

    return [...db.recordings].sort((a, b) => b.created_at.localeCompare(a.created_at)).map(withCourse)
  })

  router.register('recordings.byId', (input) => {
    const id = input as string
    const recording = db.recordings.find((r) => r.id === id)
    if (!recording) return null
    // Mirrors the server: what the lecture's AI jobs are still doing.
    const busy = db.jobRuns.filter((j) => {
      if (j.status !== 'pending' && j.status !== 'running') return false
      const input = j.input ? (JSON.parse(j.input) as { recording_id?: string; target_id?: string }) : {}
      return (input.recording_id ?? input.target_id) === id
    })
    const processing = busy.some((j) => j.job_type === 'ai:transcribe')
      ? 'transcribing'
      : busy.some((j) => j.job_type === 'ai:summarize-lecture') ? 'summarising' : null
    return { ...withCourse(recording), processing }
  })

  // Mirrors the server: queue the transcription unless it was transcribed or one is on its way.
  router.register('recordings.transcribe', (input) => {
    const { recordingId } = input as { recordingId: string }
    if (!db.recordings.some((r) => r.id === recordingId)) throw new Error('Lecture not found')
    const hasTranscript = db.recordings.some((r) => r.id === recordingId && r.status === 'ready')
      || db.transcriptSegments.some((s) => s.recording_id === recordingId)
    const onItsWay = db.jobRuns.some((j) => j.job_type === 'ai:transcribe'
      && (j.status === 'pending' || j.status === 'running')
      && (JSON.parse(j.input ?? '{}') as { recording_id?: string }).recording_id === recordingId)
    if (hasTranscript || onItsWay) return { queued: false }
    db.jobRuns.push({
      id: `jr-${crypto.randomUUID()}`, workflow_id: 'manual', workflow_job_id: 'manual', job_type: 'ai:transcribe',
      status: 'pending', input: JSON.stringify({ recording_id: recordingId }), output: null, error: null,
      depth: 0, retry_count: 0, created_at: new Date().toISOString(), started_at: null, completed_at: null,
    } as never)
    return { queued: true }
  })
}
