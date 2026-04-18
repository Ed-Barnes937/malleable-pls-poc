import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getAnnotations, createAnnotation } from '../queries/annotations'
import type { Scope, NewAnnotation } from '../types'
import { persistDb } from '../db'

export function useAnnotations(scope: Scope) {
  return useQuery({
    queryKey: ['annotations', scope],
    queryFn: () => getAnnotations(scope),
  })
}

export function useCreateAnnotation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (ann: NewAnnotation) => {
      createAnnotation(ann)
      persistDb()
      return Promise.resolve()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['annotations'] })
    },
  })
}
