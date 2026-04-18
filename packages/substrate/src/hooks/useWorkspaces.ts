import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getWorkspaces,
  getWorkspacePanels,
  getWorkspaceScopes,
  addWorkspacePanel,
  removeWorkspacePanel,
  replacePanelLens,
  updatePanelSpan,
  swapPanelSpans,
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

export function useUpdatePanelSpan() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (args: { panelId: string; colSpan: number; rowSpan: number; workspaceId: string }) => {
      updatePanelSpan(args.panelId, args.colSpan, args.rowSpan)
      return Promise.resolve()
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['workspace_panels', vars.workspaceId] })
    },
  })
}

export function useSwapPanelSpans() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (args: { panelIdA: string; panelIdB: string; workspaceId: string }) => {
      swapPanelSpans(args.panelIdA, args.panelIdB)
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
