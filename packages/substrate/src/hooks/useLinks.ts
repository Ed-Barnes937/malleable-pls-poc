import { useQuery } from '@tanstack/react-query'
import { getConnectionsForConcept, getConnectionsForRecording } from '../queries/links'

export function useConnections(conceptSegmentId: string) {
  return useQuery({
    queryKey: ['connections', conceptSegmentId],
    queryFn: () => getConnectionsForConcept(conceptSegmentId),
    enabled: !!conceptSegmentId,
  })
}

export function useRecordingConnections(recordingId: string | undefined) {
  return useQuery({
    queryKey: ['connections_recording', recordingId],
    queryFn: () => getConnectionsForRecording(recordingId!),
    enabled: !!recordingId,
  })
}
