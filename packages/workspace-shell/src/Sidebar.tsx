import { useCallback, useState, useRef, useEffect } from 'react'
import {
  useWorkspaces,
  useRecordings,
  useWorkspaceScopes,
  useSetWorkspaceScope,
  useCreateWorkspace,
  useDeleteWorkspace,
} from '@pls/substrate-client'
import { cn, SectionLabel, Dialog } from '@pls/shared-ui'
import { BookOpen, Moon, GraduationCap, ChevronDown, Layers, RotateCcw, Plus, Trash2 } from 'lucide-react'
import { useWorkspaceStore } from './store'
import { useManifests } from '@pls/lens-framework'
import { BackgroundPicker } from '@pls/panel-system'
import { ThemeToggle } from './ThemeToggle'
import { JobStatusIndicator } from './JobStatusIndicator'

const WORKSPACE_ICONS: Record<string, typeof BookOpen> = {
  'ws-in-lecture': BookOpen,
  'ws-evening-review': Moon,
  'ws-exam-prep': GraduationCap,
}

const COURSES = [
  { value: '', label: 'All courses' },
  { value: 'biology', label: 'Biology' },
  { value: 'chemistry', label: 'Chemistry' },
  { value: 'physics', label: 'Physics' },
]

const TIMEFRAMES = [
  { value: '', label: 'No filter' },
  { value: 'week', label: 'This week' },
  { value: 'all', label: 'All time' },
]

function ScopeEditor({ workspaceId }: { workspaceId: string }) {
  const { data: scopes } = useWorkspaceScopes(workspaceId)
  const { data: recordings } = useRecordings()
  const setScope = useSetWorkspaceScope()

  const currentCourse = scopes?.find((s) => s.scope_type === 'tag')?.scope_value ?? ''
  const currentRecording = scopes?.find((s) => s.scope_type === 'recording')?.scope_value ?? ''
  const currentTimeframe = scopes?.find((s) => s.scope_type === 'timeframe')?.scope_value ?? ''

  const handleChange = useCallback(
    (scopeType: string, value: string) => {
      setScope.mutate({ workspaceId, scopeType, scopeValue: value || null })
    },
    [workspaceId, setScope]
  )

  const selectClass =
    'w-full rounded-md border border-border-subtle bg-surface px-2.5 py-1.5 text-xs text-neutral-300 focus:border-accent/40 focus:outline-none focus:ring-1 focus:ring-accent/20 appearance-none cursor-pointer'

  return (
    <div className="flex flex-col gap-2.5">
      <div>
        <SectionLabel className="mb-1">Course</SectionLabel>
        <div className="relative">
          <select
            value={currentCourse}
            onChange={(e) => handleChange('tag', e.target.value)}
            className={selectClass}
          >
            {COURSES.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3 w-3 -translate-y-1/2 text-neutral-600" />
        </div>
      </div>

      <div>
        <SectionLabel className="mb-1">Recording</SectionLabel>
        <div className="relative">
          <select
            value={currentRecording}
            onChange={(e) => handleChange('recording', e.target.value)}
            className={selectClass}
          >
            <option value="">All recordings</option>
            {recordings?.map((r) => (
              <option key={r.id} value={r.id}>{r.title}</option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3 w-3 -translate-y-1/2 text-neutral-600" />
        </div>
        <button
          onClick={() => setScope.mutate({ workspaceId, scopeType: 'recording', scopeValue: '' })}
          className="mt-1.5 flex w-full items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-accent transition-colors hover:bg-accent/10"
        >
          <Plus className="h-3 w-3" />
          New Recording
        </button>
      </div>

      <div>
        <SectionLabel className="mb-1">Timeframe</SectionLabel>
        <div className="relative">
          <select
            value={currentTimeframe}
            onChange={(e) => handleChange('timeframe', e.target.value)}
            className={selectClass}
          >
            {TIMEFRAMES.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3 w-3 -translate-y-1/2 text-neutral-600" />
        </div>
      </div>
    </div>
  )
}

function CreateWorkspaceDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [name, setName] = useState('')
  const createWorkspace = useCreateWorkspace()
  const setActiveWorkspaceId = useWorkspaceStore((s) => s.setActiveWorkspaceId)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      setName('')
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [open])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return
    createWorkspace.mutate({ name: trimmed }, {
      onSuccess: (ws) => {
        setActiveWorkspaceId(ws.id)
        onClose()
      },
    })
  }

  return (
    <Dialog open={open} onClose={onClose} title="New Workspace">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div>
          <label htmlFor="ws-name" className="mb-1 block text-xs text-neutral-400">Name</label>
          <input
            ref={inputRef}
            id="ws-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Morning Study"
            className="w-full rounded-md border border-border-subtle bg-surface px-2.5 py-1.5 text-xs text-neutral-200 placeholder:text-neutral-700 focus:border-accent/40 focus:outline-none focus:ring-1 focus:ring-accent/20"
          />
        </div>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-3 py-1.5 text-xs text-neutral-400 transition-colors hover:bg-surface-overlay hover:text-neutral-200"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!name.trim() || createWorkspace.isPending}
            className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-accent/80 disabled:opacity-40"
          >
            {createWorkspace.isPending ? 'Creating…' : 'Create'}
          </button>
        </div>
      </form>
    </Dialog>
  )
}

function DeleteWorkspaceDialog({
  open,
  onClose,
  workspace,
}: {
  open: boolean
  onClose: () => void
  workspace: { id: string; name: string } | null
}) {
  const deleteWorkspace = useDeleteWorkspace()
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId)
  const setActiveWorkspaceId = useWorkspaceStore((s) => s.setActiveWorkspaceId)
  const { data: workspaces } = useWorkspaces()

  const handleDelete = () => {
    if (!workspace) return
    deleteWorkspace.mutate(workspace.id, {
      onSuccess: () => {
        if (activeWorkspaceId === workspace.id && workspaces) {
          const remaining = workspaces.filter((ws) => ws.id !== workspace.id)
          if (remaining.length > 0) setActiveWorkspaceId(remaining[0].id)
        }
        onClose()
      },
    })
  }

  return (
    <Dialog open={open} onClose={onClose} title="Delete Workspace">
      <p className="mb-4 text-xs text-neutral-400">
        Are you sure you want to delete <span className="font-medium text-neutral-200">{workspace?.name}</span>? This will remove all panels and settings for this workspace.
      </p>
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          className="rounded-md px-3 py-1.5 text-xs text-neutral-400 transition-colors hover:bg-surface-overlay hover:text-neutral-200"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleDelete}
          disabled={deleteWorkspace.isPending}
          className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-red-500 disabled:opacity-40"
        >
          {deleteWorkspace.isPending ? 'Deleting…' : 'Delete'}
        </button>
      </div>
    </Dialog>
  )
}

function WorkspaceList() {
  const { data: workspaces } = useWorkspaces()
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId)
  const setActiveWorkspaceId = useWorkspaceStore((s) => s.setActiveWorkspaceId)
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null)

  return (
    <div className="flex flex-col gap-0.5">
      {workspaces?.map((ws) => {
        const Icon = WORKSPACE_ICONS[ws.id] ?? BookOpen
        const isActive = activeWorkspaceId === ws.id
        return (
          <div key={ws.id} className="group relative flex items-center">
            <button
              onClick={() => setActiveWorkspaceId(ws.id)}
              className={cn(
                'flex flex-1 items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-xs font-medium transition-all',
                isActive
                  ? 'bg-accent/10 text-accent ring-1 ring-accent/20'
                  : 'text-neutral-500 hover:bg-surface-overlay/50 hover:text-neutral-300'
              )}
            >
              <Icon className="h-3.5 w-3.5 shrink-0" />
              {ws.name}
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation()
                setDeleteTarget({ id: ws.id, name: ws.name })
              }}
              aria-label={`Delete ${ws.name}`}
              className="absolute right-1 rounded p-1 text-neutral-700 opacity-0 transition-all hover:bg-red-500/10 hover:text-red-400 group-hover:opacity-100"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
        )
      })}
      <button
        onClick={() => setCreateDialogOpen(true)}
        className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-xs font-medium text-neutral-600 transition-all hover:bg-surface-overlay/50 hover:text-neutral-400"
      >
        <Plus className="h-3.5 w-3.5 shrink-0" />
        New workspace
      </button>
      <CreateWorkspaceDialog open={createDialogOpen} onClose={() => setCreateDialogOpen(false)} />
      <DeleteWorkspaceDialog
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        workspace={deleteTarget}
      />
    </div>
  )
}

const CATEGORY_ORDER = ['tool', 'view'] as const
const CATEGORY_LABELS: Record<string, string> = {
  tool: 'Tools',
  view: 'Views',
}

function LensPalette() {
  const manifests = useManifests()

  const handleDragStart = useCallback((e: React.DragEvent, lensType: string) => {
    e.dataTransfer.setData('application/x-lens-type', lensType)
    e.dataTransfer.effectAllowed = 'copy'
  }, [])

  const grouped = CATEGORY_ORDER.map((cat) => ({
    category: cat,
    label: CATEGORY_LABELS[cat],
    lenses: manifests.filter((m) => m.category === cat),
  })).filter((g) => g.lenses.length > 0)

  return (
    <div className="flex flex-col gap-3">
      {grouped.map((group) => (
        <div key={group.category}>
          <SectionLabel className="mb-1 px-1">{group.label}</SectionLabel>
          <div className="flex flex-col gap-0.5">
            {group.lenses.map((m) => {
              const Icon = m.icon
              return (
                <div
                  key={m.id}
                  draggable
                  onDragStart={(e) => handleDragStart(e, m.id)}
                  className="group flex cursor-grab items-center gap-2.5 rounded-lg px-2.5 py-1.5 transition-all hover:bg-surface-overlay/50 active:cursor-grabbing active:scale-[0.98]"
                >
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-surface-overlay/80 text-neutral-500 ring-1 ring-border-subtle transition-colors group-hover:text-accent group-hover:ring-accent/30">
                    <Icon className="h-3 w-3" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[11px] font-medium text-neutral-400 group-hover:text-neutral-200">{m.label}</p>
                    <p className="text-[10px] text-neutral-600">{m.description}</p>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}

export function Sidebar() {
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId)

  return (
    <aside className="flex h-full w-[240px] shrink-0 flex-col border-r border-border-subtle bg-surface">
      <div className="flex items-center gap-2 px-4 py-3">
        <Layers className="h-4 w-4 text-accent" />
        <h1 className="text-sm font-semibold tracking-tight text-neutral-300">Malleable PLS</h1>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="flex flex-col gap-5 px-3 pb-4">
          <section>
            <SectionLabel className="mb-2 px-1">Workspaces</SectionLabel>
            <WorkspaceList />
          </section>

          <section>
            <SectionLabel className="mb-2 px-1">Scope</SectionLabel>
            <ScopeEditor workspaceId={activeWorkspaceId} />
          </section>

          <section>
            <SectionLabel className="mb-2 px-1">Lenses</SectionLabel>
            <p className="mb-2 px-1 text-[10px] text-neutral-700">Drag onto the workspace</p>
            <LensPalette />
          </section>

          <section>
            <BackgroundPicker />
          </section>
        </div>
      </div>

      <div className="flex items-center justify-between border-t border-border-subtle px-3 py-2.5">
        <ThemeToggle />
        <JobStatusIndicator />
        <button
          onClick={() => { window.location.reload() }}
          className="flex items-center gap-1.5 rounded-md px-2 py-1 text-[10px] text-neutral-600 transition-colors hover:bg-surface-overlay hover:text-neutral-400"
          title="Reset demo data"
        >
          <RotateCcw className="h-3 w-3" />
          Reset
        </button>
      </div>
    </aside>
  )
}
