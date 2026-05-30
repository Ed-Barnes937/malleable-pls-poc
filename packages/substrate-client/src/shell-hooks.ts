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

export function useReorderWorkspaces() {
  const utils = trpc.useUtils()
  return trpc.workspaces.reorder.useMutation({
    onMutate: async (ids) => {
      await utils.workspaces.list.cancel()
      const prev = utils.workspaces.list.getData()
      if (prev) {
        const byId = new Map(prev.map((w) => [w.id as string, w]))
        const reordered = ids
          .map((id) => byId.get(id))
          .filter(Boolean) as typeof prev
        utils.workspaces.list.setData(undefined, reordered)
      }
      return { prev }
    },
    onError: (_err, _ids, ctx) => {
      if (ctx?.prev) utils.workspaces.list.setData(undefined, ctx.prev)
    },
    onSettled: () => utils.workspaces.list.invalidate(),
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

export function useUpdatePanelConfig() {
  const utils = trpc.useUtils()
  return trpc.workspaces.updatePanelConfig.useMutation({
    onSuccess: () => utils.workspaces.panels.invalidate(),
  })
}

export function useUpdateWorkspaceBackground() {
  const utils = trpc.useUtils()
  return trpc.workspaces.updateBackground.useMutation({
    onSuccess: () => utils.workspaces.list.invalidate(),
  })
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

export function useWorkflowsForWorkspace(workspaceId: string) {
  return trpc.workflows.forWorkspace.useQuery({ workspaceId })
}

function invalidateWorkflows(utils: ReturnType<typeof trpc.useUtils>) {
  utils.workflows.forLens.invalidate()
  utils.workflows.forWorkspace.invalidate()
}

export function useToggleWorkflow() {
  const utils = trpc.useUtils()
  return trpc.workflows.toggle.useMutation({
    onSuccess: () => invalidateWorkflows(utils),
  })
}

export function useCreateWorkspaceOverride() {
  const utils = trpc.useUtils()
  return trpc.workflows.createOverride.useMutation({
    onSuccess: () => invalidateWorkflows(utils),
  })
}

export function useCreateWorkflow() {
  const utils = trpc.useUtils()
  return trpc.workflows.create.useMutation({
    onSuccess: () => invalidateWorkflows(utils),
  })
}

export function useUpdateWorkflow() {
  const utils = trpc.useUtils()
  return trpc.workflows.update.useMutation({
    onSuccess: () => invalidateWorkflows(utils),
  })
}

export function useDeleteWorkflow() {
  const utils = trpc.useUtils()
  return trpc.workflows.delete.useMutation({
    onSuccess: () => invalidateWorkflows(utils),
  })
}

export interface JobEvent {
  type: 'job:started' | 'job:completed' | 'job:failed' | 'data:changed'
  jobType?: string
}

export interface ServerEventHandlers {
  onJobStarted?: (event: JobEvent) => void
  onJobCompleted?: (event: JobEvent) => void
  onJobFailed?: (event: JobEvent) => void
}

export function useServerEvents(handlers?: ServerEventHandlers) {
  const utils = trpc.useUtils()
  return trpc.events.onDataChange.useSubscription(undefined, {
    onError: () => {},
    onData: (event) => {
      if (event.type === 'job:started') {
        utils.jobs.recent.invalidate()
        utils.jobs.runningCount.invalidate()
        handlers?.onJobStarted?.(event)
      } else if (event.type === 'job:completed') {
        utils.jobs.recent.invalidate()
        utils.jobs.runningCount.invalidate()
        utils.recordings.invalidate()
        utils.transcripts.invalidate()
        utils.tags.invalidate()
        utils.links.invalidate()
        utils.confidence.invalidate()
        utils.aggregates.invalidate()
        handlers?.onJobCompleted?.(event)
      } else if (event.type === 'job:failed') {
        utils.jobs.recent.invalidate()
        utils.jobs.runningCount.invalidate()
        handlers?.onJobFailed?.(event)
      }
    },
  })
}
