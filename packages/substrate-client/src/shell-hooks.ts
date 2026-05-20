import { trpc } from './trpc'

export function useWorkspaces() {
  return trpc.workspaces.list.useQuery()
}

export function useWorkspacePanels(workspaceId: string) {
  return trpc.workspaces.panels.useQuery(workspaceId)
}

export function useWorkspaceScopes(workspaceId: string) {
  return trpc.workspaces.scopes.useQuery(workspaceId)
}

export function useCreateWorkspace() {
  const utils = trpc.useUtils()
  return trpc.workspaces.create.useMutation({
    onSuccess: () => utils.workspaces.list.invalidate(),
  })
}

export function useDeleteWorkspace() {
  const utils = trpc.useUtils()
  return trpc.workspaces.delete.useMutation({
    onSuccess: () => utils.workspaces.list.invalidate(),
  })
}

export function useAddWorkspacePanel() {
  const utils = trpc.useUtils()
  return trpc.workspaces.addPanel.useMutation({
    onSuccess: () => utils.workspaces.panels.invalidate(),
  })
}

export function useRemoveWorkspacePanel() {
  const utils = trpc.useUtils()
  return trpc.workspaces.removePanel.useMutation({
    onSuccess: () => utils.workspaces.panels.invalidate(),
  })
}

export function useUpdatePanelLayouts() {
  return trpc.workspaces.updateLayouts.useMutation()
}

export function useSetWorkspaceScope() {
  const utils = trpc.useUtils()
  return trpc.workspaces.setScope.useMutation({
    onSuccess: () => utils.workspaces.scopes.invalidate(),
  })
}

export function useRecordings() {
  return trpc.recordings.list.useQuery()
}

export function useRecentJobs(limit?: number) {
  return trpc.jobs.recent.useQuery(limit)
}

export function useRunningJobCount() {
  return trpc.jobs.runningCount.useQuery(undefined, { refetchInterval: 3000 })
}

export function useWorkflowsForLens(lensType: string, workspaceId: string) {
  return trpc.workflows.forLens.useQuery({ lensType, workspaceId })
}

export function useToggleWorkflow() {
  const utils = trpc.useUtils()
  return trpc.workflows.toggle.useMutation({
    onSuccess: () => utils.workflows.forLens.invalidate(),
  })
}

export function useCreateWorkspaceOverride() {
  const utils = trpc.useUtils()
  return trpc.workflows.createOverride.useMutation({
    onSuccess: () => utils.workflows.forLens.invalidate(),
  })
}

export function useServerEvents() {
  const utils = trpc.useUtils()
  return trpc.events.onDataChange.useSubscription(undefined, {
    onError: () => {},
    onData: (event) => {
      if (event.type === 'job:completed') {
        utils.jobs.recent.invalidate()
        utils.jobs.runningCount.invalidate()
        utils.recordings.invalidate()
        utils.transcripts.invalidate()
        utils.tags.invalidate()
        utils.links.invalidate()
        utils.confidence.invalidate()
        utils.aggregates.invalidate()
      } else if (event.type === 'job:failed') {
        utils.jobs.recent.invalidate()
        utils.jobs.runningCount.invalidate()
      }
    },
  })
}
