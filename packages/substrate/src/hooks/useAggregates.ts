import { useQuery } from '@tanstack/react-query'
import { getWeeklyOverview, getGapAnalysis, getWeakestTopics } from '../queries/aggregates'
import type { Scope } from '../types'

export function useWeeklyOverview(scope: Scope) {
  return useQuery({
    queryKey: ['weekly_overview', scope],
    queryFn: () => getWeeklyOverview(scope),
  })
}

export function useGapAnalysis() {
  return useQuery({
    queryKey: ['gap_analysis'],
    queryFn: () => getGapAnalysis(),
  })
}

export function useWeakestTopics(limit?: number) {
  return useQuery({
    queryKey: ['weakest_topics', limit],
    queryFn: () => getWeakestTopics(limit),
  })
}
