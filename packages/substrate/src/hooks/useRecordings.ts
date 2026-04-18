import { useQuery } from '@tanstack/react-query'
import { getRecordings, getRecordingById } from '../queries/recordings'
import type { Scope } from '../types'

export function useRecordings(scope?: Scope) {
  return useQuery({
    queryKey: ['recordings', scope],
    queryFn: () => getRecordings(scope),
  })
}

export function useRecording(id: string) {
  return useQuery({
    queryKey: ['recording', id],
    queryFn: () => getRecordingById(id),
  })
}
