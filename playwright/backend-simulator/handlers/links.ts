import type { ProcedureRouter } from '../trpc-protocol'
import type { InMemoryDb } from '../in-memory-db'
import { inCourse, segmentRecordingId } from './course-scope'

export function registerLinksHandlers(router: ProcedureRouter, db: InMemoryDb): void {
  router.register('links.connections', (input) => {
    const { segmentId, courseTag } = input as { segmentId: string; courseTag?: string }
    const matching = db.links.filter(
      (l) => l.target_id === segmentId || l.source_id === segmentId,
    )

    return matching
      .filter((l) => l.source_type === 'transcript_segment')
      .filter((l) => !courseTag || inCourse(db, courseTag, 'recording', segmentRecordingId(db, l.source_id)))
      .map((l) => {
        const seg = db.transcriptSegments.find((s) => s.id === l.source_id)
        const rec = seg ? db.recordings.find((r) => r.id === seg.recording_id) : undefined
        return {
          sourceType: l.source_type,
          sourceId: l.source_id,
          sourceTitle: seg?.text ?? '',
          sourceDate: rec?.created_at ?? '',
          relationship: l.relationship,
        }
      })
  })

  router.register('links.byRecording', (input) => {
    const { recordingId, courseTag } = input as { recordingId: string; courseTag?: string }
    const segmentIds = new Set(
      db.transcriptSegments
        .filter((s) => s.recording_id === recordingId)
        .map((s) => s.id),
    )
    const otherEndRecording = (l: { target_type: string; target_id: string }) =>
      l.target_type === 'transcript_segment'
        ? segmentRecordingId(db, l.target_id)
        : l.target_type === 'recording' ? l.target_id : undefined

    return db.links
      .filter((l) => l.source_type === 'transcript_segment' && segmentIds.has(l.source_id))
      .filter((l) => !courseTag || inCourse(db, courseTag, 'recording', otherEndRecording(l)))
      .map((l) => {
        const seg = db.transcriptSegments.find((s) => s.id === l.source_id)
        const rec = seg ? db.recordings.find((r) => r.id === seg.recording_id) : undefined
        return {
          sourceType: l.source_type,
          sourceId: l.source_id,
          sourceTitle: seg?.text ?? '',
          sourceDate: rec?.created_at ?? '',
          relationship: l.relationship,
        }
      })
  })
}
