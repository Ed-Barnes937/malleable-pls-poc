import { useMemo } from 'react'
import { useWorkflowsForWorkspace, useWorkspacePanels } from '@pls/substrate-client'
import { useWorkspaceStore } from './store'
import { WorkflowList } from './WorkflowList'

export function WorkflowSettingsPanel() {
  const workspaceId = useWorkspaceStore((s) => s.activeWorkspaceId)
  const { data: rawWorkflows, isLoading, isError, error } = useWorkflowsForWorkspace(workspaceId)
  const { data: panels } = useWorkspacePanels(workspaceId)

  const workflows = useMemo(() => {
    if (!rawWorkflows || !panels) return rawWorkflows
    const lensTypes = new Set(panels.map((p) => p.lens_type as string))
    return rawWorkflows.filter((wf) => lensTypes.has(wf.source_lens))
  }, [rawWorkflows, panels])

  return (
    <WorkflowList
      workflows={workflows}
      isLoading={isLoading}
      isError={isError}
      error={error}
      workspaceId={workspaceId}
      errorLabel="Couldn’t load workflows"
      emptyLabel="No workflows for the lenses in this workspace"
    />
  )
}
