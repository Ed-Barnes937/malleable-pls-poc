import { useMemo } from 'react'
import { useWorkflowsForWorkspace, useWorkspacePanels } from '@pls/substrate-client'
import { useActiveWorkspaceId } from './activeBoard'
import { WorkflowList } from './WorkflowList'

export function WorkflowSettingsPanel() {
  const workspaceId = useActiveWorkspaceId()
  const { data: rawWorkflows, isLoading, isError, error } = useWorkflowsForWorkspace(workspaceId)
  const { data: panels } = useWorkspacePanels(workspaceId)

  const workflows = useMemo(() => {
    if (!rawWorkflows || !panels) return rawWorkflows
    const lensTypes = new Set(panels.map((p) => p.lens_type as string))
    return rawWorkflows.filter((wf) => lensTypes.has(wf.source_lens))
  }, [rawWorkflows, panels])

  if (!workspaceId) return null
  return (
    <WorkflowList
      workflows={workflows}
      isLoading={isLoading}
      isError={isError}
      error={error}
      workspaceId={workspaceId}
      errorLabel="Couldn’t load automations"
      emptyLabel="No automations for the widgets on this board yet"
    />
  )
}
