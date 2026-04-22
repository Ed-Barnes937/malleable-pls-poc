import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getTags, getTagsForTarget, createTag, deleteTag } from '../queries/tags'
import type { Scope, NewTag } from '../types'
import { persistDb } from '../db'

export function useTags(scope: Scope) {
  return useQuery({
    queryKey: ['tags', scope],
    queryFn: () => getTags(scope),
  })
}

export function useTagsForTarget(targetType: string, targetId: string) {
  return useQuery({
    queryKey: ['tags', targetType, targetId],
    queryFn: () => getTagsForTarget(targetType, targetId),
    enabled: !!targetId,
  })
}

export function useCreateTag() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationKey: ['tag:create'],
    meta: { eventType: 'tag:created' },
    mutationFn: (tag: NewTag) => {
      createTag(tag)
      persistDb()
      return Promise.resolve(tag)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tags'] })
      queryClient.invalidateQueries({ queryKey: ['weekly_overview'] })
      queryClient.invalidateQueries({ queryKey: ['gap_analysis'] })
      queryClient.invalidateQueries({ queryKey: ['weakest_topics'] })
    },
  })
}

export function useDeleteTag() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationKey: ['tag:delete'],
    meta: { eventType: 'tag:deleted' },
    mutationFn: (id: string) => {
      deleteTag(id)
      persistDb()
      return Promise.resolve()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tags'] })
      queryClient.invalidateQueries({ queryKey: ['weekly_overview'] })
      queryClient.invalidateQueries({ queryKey: ['gap_analysis'] })
      queryClient.invalidateQueries({ queryKey: ['weakest_topics'] })
    },
  })
}
