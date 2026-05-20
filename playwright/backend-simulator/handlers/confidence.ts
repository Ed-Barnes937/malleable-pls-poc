import type { ProcedureRouter } from '../trpc-protocol'
import type { InMemoryDb } from '../in-memory-db'

export function registerConfidenceHandlers(router: ProcedureRouter, db: InMemoryDb): void {
  router.register('confidence.list', (input) => {
    const opts = input as { courseTag?: string; recordingId?: string; timeframe?: string } | undefined

    if (opts?.recordingId) {
      const segmentIds = new Set(
        db.transcriptSegments
          .filter((s) => s.recording_id === opts.recordingId)
          .map((s) => s.id),
      )
      return db.confidenceSignals
        .filter((cs) => cs.target_type === 'transcript_segment' && segmentIds.has(cs.target_id))
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
    }

    return [...db.confidenceSignals].sort((a, b) => b.created_at.localeCompare(a.created_at))
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
