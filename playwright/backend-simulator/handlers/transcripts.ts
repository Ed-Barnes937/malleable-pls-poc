import type { ProcedureRouter } from '../trpc-protocol'
import type { InMemoryDb } from '../in-memory-db'

export function registerTranscriptsHandlers(router: ProcedureRouter, db: InMemoryDb): void {
  router.register('transcripts.byRecording', (input) => {
    const recordingId = input as string
    return db.transcriptSegments
      .filter((s) => s.recording_id === recordingId)
      .sort((a, b) => a.start_ms - b.start_ms)
  })
}
