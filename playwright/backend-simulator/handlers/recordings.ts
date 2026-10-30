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
}
