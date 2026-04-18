import { useQuery } from '@tanstack/react-query'
import { getTranscriptSegments } from '../queries/transcripts'

export function useTranscript(recordingId: string) {
  return useQuery({
    queryKey: ['transcript_segments', recordingId],
    queryFn: () => getTranscriptSegments(recordingId),
    enabled: !!recordingId,
  })
}
