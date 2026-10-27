import { useState } from 'react'
import { Dialog } from '@pls/shared-ui'
import { useWorkflow } from '@pls/substrate-client'
import { type WorkflowWithJobs } from '@pls/substrate'
import { WorkflowEditor } from './WorkflowEditor'
import { WorkflowList } from './WorkflowList'

interface AutomationDialogProps {
  workflowId: string
  workspaceId: string
  onClose: () => void
}

/**
 * One automation, opened from something it made (e.g. "Made by ... Edit" on
 * a Calendar study block): the same card the widget's Automations dialog
 * shows, so the confusion automation's sentence can be edited in place.
 */
export function AutomationDialog({ workflowId, workspaceId, onClose }: AutomationDialogProps) {
  const { data: workflow, isLoading, isError, error } = useWorkflow(workflowId)
  const [editing, setEditing] = useState<WorkflowWithJobs | null>(null)

  return (
    <>
      <Dialog open onClose={onClose} title="Automation" className="w-full max-w-md">
        <WorkflowList
          workflows={workflow ? [workflow] : []}
          isLoading={isLoading}
          isError={isError}
          error={error}
          workspaceId={workspaceId}
          showEditDelete
          onEdit={setEditing}
          errorLabel="Couldn't load this automation"
          emptyLabel="This automation has been deleted"
        />
      </Dialog>
      {editing && (
        <WorkflowEditor
          key={editing.id}
          open
          onClose={() => setEditing(null)}
          workspaceId={workspaceId}
          sourceLens={editing.source_lens}
          workflow={editing}
        />
      )}
    </>
  )
}
