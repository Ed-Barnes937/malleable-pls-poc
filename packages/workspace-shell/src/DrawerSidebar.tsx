import { useCallback, useEffect, useRef, useState } from 'react'
import {
  useWorkspaces,
  useRecordings,
  useWorkspaceScopes,
  useSetWorkspaceScope,
  useCreateWorkspace,
  useDeleteWorkspace,
  useReorderWorkspaces,
} from '@pls/substrate-client'
import { cn, SectionLabel, Dialog } from '@pls/shared-ui'
import {
  BookOpen,
  Moon,
  GraduationCap,
  ChevronDown,
  Plus,
  Trash2,
  RotateCcw,
} from 'lucide-react'
import { useWorkspaceStore } from './store'
import { useManifests } from '@pls/lens-framework'
import { BackgroundPicker } from '@pls/panel-system'
import { WorkflowSettingsPanel } from './WorkflowSettingsPanel'

/* ── Constants ── */

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

const CATEGORY_ORDER = ['tool', 'view'] as const
const CATEGORY_LABELS: Record<string, string> = {
  tool: 'Tools',
  view: 'Views',
}

/* ── Scope Editor ── */

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
    [workspaceId, setScope],
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
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
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
              <option key={r.id} value={r.id}>
                {r.title}
              </option>
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
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3 w-3 -translate-y-1/2 text-neutral-600" />
        </div>
      </div>
    </div>
  )
}

/* ── Create Workspace Dialog ── */

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
    createWorkspace.mutate(
      { name: trimmed },
      {
        onSuccess: (ws) => {
          setActiveWorkspaceId(ws.id)
          onClose()
        },
      },
    )
  }

  return (
    <Dialog open={open} onClose={onClose} title="New Workspace">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div>
          <label htmlFor="ws-name" className="mb-1 block text-xs text-neutral-400">
            Name
          </label>
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
            {createWorkspace.isPending ? 'Creating...' : 'Create'}
          </button>
        </div>
      </form>
    </Dialog>
  )
}

/* ── Delete Workspace Dialog ── */

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
        Are you sure you want to delete{' '}
        <span className="font-medium text-neutral-200">{workspace?.name}</span>? This will remove
        all panels and settings for this workspace.
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
          {deleteWorkspace.isPending ? 'Deleting...' : 'Delete'}
        </button>
      </div>
    </Dialog>
  )
}

/* ── Workspace List ── */

function WorkspaceList() {
  const { data: workspaces } = useWorkspaces()
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId)
  const setActiveWorkspaceId = useWorkspaceStore((s) => s.setActiveWorkspaceId)
  const reorder = useReorderWorkspaces()
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null)

  const [dragIdx, setDragIdx] = useState<number | null>(null)
  const [dropIdx, setDropIdx] = useState<number | null>(null)
  const [dragging, setDragging] = useState(false)
  const dragStartY = useRef(0)
  const rowRefs = useRef<(HTMLDivElement | null)[]>([])

  const getDropIndex = useCallback((clientY: number) => {
    for (let i = 0; i < rowRefs.current.length; i++) {
      const el = rowRefs.current[i]
      if (!el) continue
      const rect = el.getBoundingClientRect()
      if (clientY < rect.top + rect.height / 2) return i
    }
    return rowRefs.current.length
  }, [])

  const resetDrag = useCallback(() => {
    setDragIdx(null)
    setDropIdx(null)
    setDragging(false)
  }, [])

  const onPointerDown = useCallback((e: React.PointerEvent, idx: number) => {
    if (e.button !== 0) return
    e.currentTarget.setPointerCapture(e.pointerId)
    dragStartY.current = e.clientY
    setDragIdx(idx)
    setDragging(false)
  }, [])

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (dragIdx === null) return
    if (!dragging && Math.abs(e.clientY - dragStartY.current) < 5) return
    if (!dragging) setDragging(true)
    setDropIdx(getDropIndex(e.clientY))
  }, [dragIdx, dragging, getDropIndex])

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    if (dragIdx === null || !workspaces) {
      resetDrag()
      return
    }
    if (dragging && dropIdx !== null) {
      const insertAt = dropIdx > dragIdx ? dropIdx - 1 : dropIdx
      if (insertAt !== dragIdx) {
        const ids = workspaces.map((ws) => ws.id)
        const [moved] = ids.splice(dragIdx, 1)
        ids.splice(insertAt, 0, moved)
        reorder.mutate(ids)
      }
    } else {
      setActiveWorkspaceId(workspaces[dragIdx].id)
    }
    try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId) } catch {}
    resetDrag()
  }, [dragIdx, dropIdx, dragging, workspaces, reorder, setActiveWorkspaceId, resetDrag])

  const onLostPointerCapture = useCallback(() => { resetDrag() }, [resetDrag])

  return (
    <div className="flex flex-col gap-0.5">
      {workspaces?.map((ws, idx) => {
        const Icon = WORKSPACE_ICONS[ws.id] ?? BookOpen
        const isActive = activeWorkspaceId === ws.id
        const isDragging = dragging && dragIdx === idx
        const showDropBefore = dragging && dropIdx === idx && dragIdx !== idx && dragIdx !== idx - 1
        const showDropAfter = dragging && dropIdx === workspaces.length && idx === workspaces.length - 1 && dragIdx !== idx

        return (
          <div
            key={ws.id}
            ref={(el) => { rowRefs.current[idx] = el }}
            className="group relative flex items-center"
          >
            {showDropBefore && (
              <div className="absolute -top-0.5 left-2 right-2 h-0.5 rounded-full bg-accent" />
            )}
            <button
              onPointerDown={(e) => onPointerDown(e, idx)}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onLostPointerCapture={onLostPointerCapture}
              className={cn(
                'flex flex-1 items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-xs font-medium transition-all select-none',
                isActive
                  ? 'bg-accent/10 text-accent ring-1 ring-accent/20'
                  : 'text-neutral-500 hover:bg-surface-overlay/50 hover:text-neutral-300',
                isDragging && 'opacity-40',
                dragging && 'cursor-grabbing',
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
            {showDropAfter && (
              <div className="absolute -bottom-0.5 left-2 right-2 h-0.5 rounded-full bg-accent" />
            )}
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

/* ── Lens Palette ── */

function LensPalette({ onDragStart }: { onDragStart?: () => void }) {
  const manifests = useManifests()

  const handleDragStart = useCallback(
    (e: React.DragEvent, lensType: string) => {
      e.dataTransfer.setData('application/x-lens-type', lensType)
      e.dataTransfer.effectAllowed = 'copy'
      onDragStart?.()
    },
    [onDragStart],
  )

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
                    <p className="text-[11px] font-medium text-neutral-400 group-hover:text-neutral-200">
                      {m.label}
                    </p>
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

/* ── Drawer Sidebar ── */

export interface DrawerSidebarProps {
  open: boolean
  onClose: () => void
}

export function DrawerSidebar({ open, onClose }: DrawerSidebarProps) {
  const asideRef = useRef<HTMLElement>(null)
  const previousFocusRef = useRef<Element | null>(null)
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId)

  // Close on Escape
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, onClose])

  // Focus management — focus aside on open, restore focus on close
  useEffect(() => {
    if (open) {
      previousFocusRef.current = document.activeElement
      asideRef.current?.focus()
    } else if (previousFocusRef.current) {
      const el = previousFocusRef.current as HTMLElement
      if (typeof el.focus === 'function') el.focus()
      previousFocusRef.current = null
    }
  }, [open])

  // Close drawer when a lens drag starts (POC pattern)
  const handleLensDragStart = useCallback(() => {
    onClose()
  }, [onClose])

  return (
    <>
      {/* Backdrop */}
      {open && (
        <div
          data-testid="drawer-backdrop"
          onClick={onClose}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 10000,
            background: 'oklch(0 0 0 / 0.4)',
            transition: 'var(--transition-panel)',
          }}
        />
      )}

      {/* Drawer panel */}
      <aside
        ref={asideRef}
        tabIndex={-1}
        data-testid="drawer-sidebar"
        aria-label="Drawer sidebar"
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          bottom: 0,
          width: 280,
          zIndex: 10001,
          background: 'var(--color-surface-raised)',
          boxShadow: open ? 'var(--shadow-panel-focused)' : 'none',
          transform: open ? 'translateX(0)' : 'translateX(-100%)',
          transition: `transform var(--transition-panel), box-shadow var(--transition-panel)`,
          borderRadius: '0 var(--radius-panel) var(--radius-panel) 0',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Scrollable content */}
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="flex flex-col gap-5 px-3 py-4">
            {/* Workspaces */}
            <section>
              <SectionLabel className="mb-2 px-1">Workspaces</SectionLabel>
              <WorkspaceList />
            </section>

            {/* Scope */}
            <section>
              <SectionLabel className="mb-2 px-1">Scope</SectionLabel>
              <ScopeEditor workspaceId={activeWorkspaceId} />
            </section>

            {/* Background */}
            <section>
              <BackgroundPicker />
            </section>

            {/* Workflows */}
            <section>
              <SectionLabel className="mb-2 px-1">Workflows</SectionLabel>
              <WorkflowSettingsPanel />
            </section>

            {/* Lenses */}
            <section>
              <SectionLabel className="mb-2 px-1">Lenses</SectionLabel>
              <p className="mb-2 px-1 text-[10px] text-neutral-700">Drag onto the workspace</p>
              <LensPalette onDragStart={handleLensDragStart} />
            </section>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end border-t border-border-subtle px-3 py-2.5">
          <button
            onClick={() => {
              window.location.reload()
            }}
            className="flex items-center gap-1.5 rounded-md px-2 py-1 text-[10px] text-neutral-600 transition-colors hover:bg-surface-overlay hover:text-neutral-400"
            title="Reset demo data"
          >
            <RotateCcw className="h-3 w-3" />
            Reset
          </button>
        </div>
      </aside>
    </>
  )
}
