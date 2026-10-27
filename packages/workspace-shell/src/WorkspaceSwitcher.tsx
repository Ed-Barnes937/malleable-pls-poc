import { useRef, useState, useCallback, useEffect } from 'react'
import { useWorkspaces, useReorderWorkspaces } from '@pls/substrate-client'
import { cn } from '@pls/shared-ui'
import { useWorkspaceStore } from './store'
import { BookOpen, Moon, GraduationCap, Plus, Trash2 } from 'lucide-react'
import { CreateWorkspaceDialog, DeleteWorkspaceDialog } from './WorkspaceDialogs'

const WORKSPACE_ICONS: Record<string, typeof BookOpen> = {
  'ws-in-lecture': BookOpen,
  'ws-evening-review': Moon,
  'ws-exam-prep': GraduationCap,
}

export function WorkspaceSwitcher() {
  const { data: workspaces } = useWorkspaces()
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId)
  const setActiveWorkspaceId = useWorkspaceStore((s) => s.setActiveWorkspaceId)
  const reorder = useReorderWorkspaces()

  const [dragIdx, setDragIdx] = useState<number | null>(null)
  const [dropIdx, setDropIdx] = useState<number | null>(null)
  const [dragging, setDragging] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const dragStartX = useRef(0)
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([])

  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null)

  const getDropIndex = useCallback(
    (clientX: number) => {
      for (let i = 0; i < tabRefs.current.length; i++) {
        const el = tabRefs.current[i]
        if (!el) continue
        const rect = el.getBoundingClientRect()
        if (clientX < rect.left + rect.width / 2) return i
      }
      return tabRefs.current.length
    },
    [],
  )

  const resetDrag = useCallback(() => {
    setDragIdx(null)
    setDropIdx(null)
    setDragging(false)
  }, [])

  const onPointerDown = useCallback(
    (e: React.PointerEvent, idx: number) => {
      if (e.button !== 0) return
      e.currentTarget.setPointerCapture(e.pointerId)
      dragStartX.current = e.clientX
      setDragIdx(idx)
      setDragging(false)
    },
    [],
  )

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (dragIdx === null) return
      if (!dragging && Math.abs(e.clientX - dragStartX.current) < 5) return
      if (!dragging) setDragging(true)
      setDropIdx(getDropIndex(e.clientX))
    },
    [dragIdx, dragging, getDropIndex],
  )

  const onPointerUp = useCallback(
    (e: React.PointerEvent) => {
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
    },
    [dragIdx, dropIdx, dragging, workspaces, reorder, setActiveWorkspaceId, resetDrag],
  )

  const onLostPointerCapture = useCallback(() => {
    resetDrag()
  }, [resetDrag])

  // Keep the open board's tab visible when the tab strip scrolls (narrow screens).
  const activeIdx = workspaces?.findIndex((ws) => ws.id === activeWorkspaceId) ?? -1
  useEffect(() => {
    tabRefs.current[activeIdx]?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' })
  }, [activeIdx])

  if (!workspaces) return null

  return (
    <>
      <div
        ref={containerRef}
        role="group"
        aria-label="Boards"
        className="flex max-w-full items-center gap-1 overflow-x-auto rounded-[14px] bg-surface-overlay p-1 touch-none [scrollbar-width:none]"
      >
        {workspaces.map((ws, idx) => {
          const Icon = WORKSPACE_ICONS[ws.id] ?? BookOpen
          const isActive = activeWorkspaceId === ws.id
          const isDragging = dragging && dragIdx === idx
          const showDropBefore = dragging && dropIdx === idx && dragIdx !== idx && dragIdx !== idx - 1

          return (
            <div
              key={ws.id}
              data-testid="workspace-tab"
              className={cn(
                'relative flex shrink-0 items-center rounded-[11px] transition-all duration-150',
                isActive && 'bg-surface-raised shadow-sm',
              )}
            >
              {showDropBefore && (
                <div className="absolute -left-0.5 top-1 bottom-1 w-0.5 rounded-full bg-accent" />
              )}
              <button
                ref={(el) => { tabRefs.current[idx] = el }}
                aria-current={isActive ? 'page' : undefined}
                onPointerDown={(e) => onPointerDown(e, idx)}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onLostPointerCapture={onLostPointerCapture}
                className={cn(
                  'relative flex h-9 items-center gap-2 whitespace-nowrap rounded-[11px] text-body transition-all duration-150 select-none',
                  isActive
                    ? 'pl-3.5 pr-1 font-semibold text-text-primary'
                    : 'px-3.5 text-text-secondary hover:bg-surface-raised/60 hover:text-text-primary',
                  isDragging && 'opacity-40',
                  dragging && 'cursor-grabbing',
                )}
              >
                <Icon className="h-4 w-4" />
                {ws.name}
              </button>
              {/* Only the open board can be deleted, so the button sits inside
                  its tab and never overlaps a neighbour. */}
              {isActive && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    setDeleteTarget({ id: ws.id, name: ws.name })
                  }}
                  aria-label={`Delete ${ws.name}`}
                  title="Delete board"
                  className="mr-1.5 rounded-item p-1.5 text-text-muted transition-colors hover:bg-confused-soft hover:text-confused"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
              {dragging && dropIdx === workspaces.length && idx === workspaces.length - 1 && dragIdx !== idx && (
                <div className="absolute -right-0.5 top-1 bottom-1 w-0.5 rounded-full bg-accent" />
              )}
            </div>
          )
        })}
        <button
          type="button"
          onClick={() => setCreateDialogOpen(true)}
          aria-label="New board"
          title="New board"
          className="flex h-9 shrink-0 items-center justify-center rounded-[11px] px-2.5 text-text-muted transition-colors hover:bg-surface-raised/60 hover:text-text-primary"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>
      <CreateWorkspaceDialog open={createDialogOpen} onClose={() => setCreateDialogOpen(false)} />
      <DeleteWorkspaceDialog
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        workspace={deleteTarget}
      />
    </>
  )
}
