import type { ProcedureRouter } from '../trpc-protocol'
import type { InMemoryDb, StoredRecording } from '../in-memory-db'
import { recordingCourse, recordingProcessing } from './course-scope'

export function registerRecordingsHandlers(router: ProcedureRouter, db: InMemoryDb): void {
  // A recording's course: its lecture's, as on the server.
  const withCourse = (r: StoredRecording) => ({ ...r, course: recordingCourse(db, r.id) })

  router.register('recordings.list', (input) => {
    const opts = input as { courseTag?: string; lectureId?: string } | undefined
    return db.recordings
      .filter((r) => !opts?.courseTag || recordingCourse(db, r.id) === opts.courseTag)
      .filter((r) => !opts?.lectureId || r.lecture_id === opts.lectureId)
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .map(withCourse)
  })

  router.register('recordings.byId', (input) => {
    const id = input as string
    const recording = db.recordings.find((r) => r.id === id)
    if (!recording) return null
    // Mirrors the server: what the lecture's AI jobs are still doing.
    return { ...withCourse(recording), processing: recordingProcessing(db, id) }
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
