import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getConfidenceSignals, createConfidenceSignal } from '../queries/confidence'
import type { Scope, NewConfidenceSignal } from '../types'
import { persistDb } from '../db'

export function useConfidence(scope: Scope) {
  return useQuery({
    queryKey: ['confidence_signals', scope],
    queryFn: () => getConfidenceSignals(scope),
  })
}

export function useRecordConfidence() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationKey: ['confidence:record'],
    meta: { eventType: 'confidence:recorded' },
    mutationFn: (signal: NewConfidenceSignal) => {
      createConfidenceSignal(signal)
      persistDb()
      return Promise.resolve(signal)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['confidence_signals'] })
      queryClient.invalidateQueries({ queryKey: ['weekly_overview'] })
      queryClient.invalidateQueries({ queryKey: ['gap_analysis'] })
      queryClient.invalidateQueries({ queryKey: ['weakest_topics'] })
    },
  })
}
