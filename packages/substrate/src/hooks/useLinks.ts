import { useQuery } from '@tanstack/react-query'
import { getConnectionsForConcept } from '../queries/links'

export function useConnections(conceptSegmentId: string) {
  return useQuery({
    queryKey: ['connections', conceptSegmentId],
    queryFn: () => getConnectionsForConcept(conceptSegmentId),
    enabled: !!conceptSegmentId,
  })
}
