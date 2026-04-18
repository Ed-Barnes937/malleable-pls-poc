import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getWorkspaces,
  getWorkspacePanels,
  getWorkspaceScopes,
  addWorkspacePanel,
  removeWorkspacePanel,
  replacePanelLens,
  updatePanelLayouts,
  setWorkspaceScope,
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
    mutationFn: (args: { workspaceId: string; layouts: { id: string; x: number; y: number; w: number; h: number }[] }) => {
      updatePanelLayouts(args.layouts)
      return Promise.resolve()
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['workspace_panels', vars.workspaceId] })
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
