import type { ProcedureRouter } from '../trpc-protocol'
import type { InMemoryDb } from '../in-memory-db'
import { inScope, isScoped, segmentRecordingId } from './course-scope'

export function registerConfidenceHandlers(router: ProcedureRouter, db: InMemoryDb): void {
  router.register('confidence.list', (input) => {
    const opts = input as { courseTag?: string; lectureId?: string; recordingId?: string } | undefined
    const scoped = isScoped(opts)

    return db.confidenceSignals
      .filter((cs) => {
        if (!scoped) return true
        if (cs.target_type !== 'transcript_segment') return false
        const recordingId = segmentRecordingId(db, cs.target_id)
        return !!recordingId && inScope(db, opts, recordingId)
      })
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
  })

  router.register('confidence.record', (input) => {
    const { target_type, target_id, score, source_lens_id } = input as {
      target_type: string; target_id: string; score: number; source_lens_id: string
    }
    const signal = {
      id: `cs-${crypto.randomUUID().slice(0, 8)}`,
      target_type,
      target_id,
      score,
      source_lens_id,
      created_at: new Date().toISOString(),
      decay_curve: null,
    }
    db.confidenceSignals.push(signal)
    return signal
  })
}
