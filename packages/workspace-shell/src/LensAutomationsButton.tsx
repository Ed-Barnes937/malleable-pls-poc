import { useState } from 'react'
import { Zap, ZapOff, Plus, AlertTriangle } from 'lucide-react'
import { Dialog, Spinner } from '@pls/shared-ui'
import { useManifest } from '@pls/lens-framework'
import { useWorkflowsForLens } from '@pls/substrate-client'
import { type WorkflowWithJobs } from '@pls/substrate'
import { WorkflowCard } from './WorkflowCard'
import { WorkflowEditor } from './WorkflowEditor'

interface LensAutomationsButtonProps {
  panelId: string
  lensType: string
  workspaceId: string
}

type EditorState = { mode: 'closed' } | { mode: 'create' } | { mode: 'edit'; workflow: WorkflowWithJobs }

export function LensAutomationsButton({ panelId, lensType, workspaceId }: LensAutomationsButtonProps) {
  const manifest = useManifest(lensType)
  const [open, setOpen] = useState(false)
  const [editor, setEditor] = useState<EditorState>({ mode: 'closed' })

  if (!manifest?.emits || manifest.emits.length === 0) return null

  return (
    <>
      <button
        data-testid={`panel-automations-${panelId}`}
        type="button"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation()
          setOpen(true)
        }}
        className="flex shrink-0 items-center justify-center rounded-md p-0.5 text-text-muted transition-colors hover:bg-surface-overlay hover:text-text-primary"
        aria-label={`Automations for ${manifest.label}`}
      >
        <Zap size={14} />
      </button>

      {open && (
        <Dialog
          open
          onClose={() => setOpen(false)}
          title={`Automations · ${manifest.label}`}
          className="w-full max-w-md"
        >
          <AutomationsList
            lensType={lensType}
            workspaceId={workspaceId}
            onEdit={(workflow) => setEditor({ mode: 'edit', workflow })}
            onCreate={() => setEditor({ mode: 'create' })}
          />
        </Dialog>
      )}

      {editor.mode !== 'closed' && (
        <WorkflowEditor
          key={editor.mode === 'edit' ? editor.workflow.id : 'create'}
          open
          onClose={() => setEditor({ mode: 'closed' })}
          workspaceId={workspaceId}
          sourceLens={lensType}
          workflow={editor.mode === 'edit' ? editor.workflow : undefined}
        />
      )}
    </>
  )
}

function AutomationsList({
  lensType,
  workspaceId,
  onEdit,
  onCreate,
}: {
  lensType: string
  workspaceId: string
  onEdit: (workflow: WorkflowWithJobs) => void
  onCreate: () => void
}) {
  const { data: rawWorkflows, isLoading, isError, error } = useWorkflowsForLens(lensType, workspaceId)
  const workflows = rawWorkflows as unknown as WorkflowWithJobs[] | undefined

  return (
    <div className="flex max-h-[70vh] flex-col gap-2 overflow-y-auto">
      {isLoading ? (
        <div className="flex items-center justify-center py-6">
          <Spinner size="sm" />
        </div>
      ) : isError ? (
        <div className="flex flex-col items-center gap-1.5 rounded-lg border border-red-500/30 bg-red-500/5 py-6 text-center">
          <AlertTriangle className="h-5 w-5 text-red-400" />
          <p className="text-[11px] text-red-300">Couldn’t load automations</p>
          <p className="px-3 text-[10px] text-neutral-600">{error?.message ?? 'Request failed'}</p>
        </div>
      ) : workflows && workflows.length > 0 ? (
        workflows.map((wf) => (
          <WorkflowCard
            key={wf.id}
            workflow={wf}
            workspaceId={workspaceId}
            showEditDelete
            onEdit={onEdit}
          />
        ))
      ) : (
        <div className="flex flex-col items-center gap-2 py-6 text-center">
          <ZapOff className="h-5 w-5 text-neutral-700" />
          <p className="text-[11px] text-neutral-600">No automations for this lens</p>
        </div>
      )}

      <button
        onClick={onCreate}
        className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-xs font-medium text-neutral-600 transition-all hover:bg-surface-overlay/50 hover:text-neutral-400"
      >
        <Plus className="h-3.5 w-3.5 shrink-0" />
        New automation
      </button>
    </div>
  )
}
