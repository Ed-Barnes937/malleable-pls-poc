import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { Workspace } from '../types'
import {
  getWorkspaces,
  getWorkspacePanels,
  getWorkspaceScopes,
  addWorkspacePanel,
  removeWorkspacePanel,
  replacePanelLens,
  updatePanelLayouts,
  updateWorkspaceBackground,
  setWorkspaceScope,
  reorderWorkspaces,
} from '../queries/workspaces'

export function useWorkspaces() {
  return useQuery({
    queryKey: ['workspaces'],
    queryFn: () => getWorkspaces(),
  })
}

export function useWorkspacePanels(workspaceId: string) {
  return useQuery({
    queryKey: ['workspace_panels', workspaceId],
    queryFn: () => getWorkspacePanels(workspaceId),
    enabled: !!workspaceId,
  })
}

export function useWorkspaceScopes(workspaceId: string) {
  return useQuery({
    queryKey: ['workspace_scopes', workspaceId],
    queryFn: () => getWorkspaceScopes(workspaceId),
    enabled: !!workspaceId,
  })
}

export function useAddWorkspacePanel() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (args: { workspaceId: string; lensType: string; slotName: string; config?: string }) => {
      addWorkspacePanel(args.workspaceId, args.lensType, args.slotName, args.config)
      return Promise.resolve()
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['workspace_panels', vars.workspaceId] })
    },
  })
}

export function useRemoveWorkspacePanel() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (args: { panelId: string; workspaceId: string }) => {
      removeWorkspacePanel(args.panelId)
      return Promise.resolve()
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['workspace_panels', vars.workspaceId] })
    },
  })
}

export function useReplacePanelLens() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (args: { panelId: string; newLensType: string; workspaceId: string }) => {
      replacePanelLens(args.panelId, args.newLensType)
      return Promise.resolve()
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['workspace_panels', vars.workspaceId] })
    },
  })
}

export function useUpdatePanelLayouts() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (args: { workspaceId: string; layouts: { id: string; pos_x: number; pos_y: number; width: number; height: number; z_index: number }[] }) => {
      updatePanelLayouts(args.layouts)
      return Promise.resolve()
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['workspace_panels', vars.workspaceId] })
    },
  })
}

export function useUpdateWorkspaceBackground() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (args: { workspaceId: string; backgroundType: string; backgroundValue: string }) => {
      updateWorkspaceBackground(args.workspaceId, args.backgroundType, args.backgroundValue)
      return Promise.resolve()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workspaces'] })
    },
  })
}

export function useSetWorkspaceScope() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (args: { workspaceId: string; scopeType: string; scopeValue: string | null }) => {
      setWorkspaceScope(args.workspaceId, args.scopeType, args.scopeValue)
      return Promise.resolve()
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['workspace_scopes', vars.workspaceId] })
    },
  })
}

export function useReorderWorkspaces() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (ids: string[]) => {
      reorderWorkspaces(ids)
      return Promise.resolve()
    },
    onMutate: async (ids) => {
      await queryClient.cancelQueries({ queryKey: ['workspaces'] })
      const prev = queryClient.getQueryData<Workspace[]>(['workspaces'])
      if (prev) {
        const byId = new Map(prev.map((w) => [w.id, w]))
        queryClient.setQueryData(['workspaces'], ids.map((id, i) => {
          const w = byId.get(id)!
          return { ...w, sort_order: i }
        }))
      }
      return { prev }
    },
    onError: (_err, _ids, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(['workspaces'], ctx.prev)
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['workspaces'] })
    },
  })
}
