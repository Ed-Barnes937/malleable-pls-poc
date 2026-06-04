import { useMemo } from 'react'
import { ZapOff, AlertTriangle } from 'lucide-react'
import { Spinner } from '@pls/shared-ui'
import { useWorkflowsForWorkspace, useWorkspacePanels } from '@pls/substrate-client'
import { type WorkflowWithJobs } from '@pls/substrate'
import { useWorkspaceStore } from './store'
import { WorkflowCard } from './WorkflowCard'

export function WorkflowSettingsPanel() {
  const workspaceId = useWorkspaceStore((s) => s.activeWorkspaceId)
  const { data: rawWorkflows, isLoading, isError, error } = useWorkflowsForWorkspace(workspaceId)
  const { data: panels } = useWorkspacePanels(workspaceId)

  const workflows = useMemo(() => {
    const all = rawWorkflows as unknown as WorkflowWithJobs[] | undefined
    if (!all || !panels) return all
    const lensTypes = new Set(panels.map((p) => p.lens_type as string))
    return all.filter((wf) => lensTypes.has(wf.source_lens))
  }, [rawWorkflows, panels])

  return (
    <div className="flex flex-col gap-2">
      {isLoading ? (
        <div className="flex items-center justify-center py-6">
          <Spinner size="sm" />
        </div>
      ) : isError ? (
        <div className="flex flex-col items-center gap-1.5 rounded-lg border border-red-500/30 bg-red-500/5 py-6 text-center">
          <AlertTriangle className="h-5 w-5 text-red-400" />
          <p className="text-[11px] text-red-300">Couldn’t load workflows</p>
          <p className="px-3 text-[10px] text-neutral-600">{error?.message ?? 'Request failed'}</p>
        </div>
      ) : workflows && workflows.length > 0 ? (
        workflows.map((wf) => (
          <WorkflowCard key={wf.id} workflow={wf} workspaceId={workspaceId} />
        ))
      ) : (
        <div className="flex flex-col items-center gap-2 py-6 text-center">
          <ZapOff className="h-5 w-5 text-neutral-700" />
          <p className="text-[11px] text-neutral-600">No workflows for the lenses in this workspace</p>
        </div>
      )}
    </div>
  )
}
