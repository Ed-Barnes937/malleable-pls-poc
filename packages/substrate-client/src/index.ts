export { trpc, createTRPCClient } from './trpc'
export { substrateTrpc } from './substrate-trpc'
export {
  useWorkspaces,
  useWorkspacePanels,
  useWorkspaceScopes,
  useCreateWorkspace,
  useDeleteWorkspace,
  useReorderWorkspaces,
  useAddWorkspacePanel,
  useRemoveWorkspacePanel,
  useUpdatePanelLayouts,
  useUpdateWorkspaceBackground,
  useSetWorkspaceScope,
  useRecordings,
  useRecentJobs,
  useRunningJobCount,
  useWorkflowsForLens,
  useToggleWorkflow,
  useCreateWorkspaceOverride,
  useServerEvents,
} from './shell-hooks'
export type { AppRouter } from './trpc'
