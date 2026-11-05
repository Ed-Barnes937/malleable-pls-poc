import { useRef, useState, useCallback, useEffect } from 'react'
import { useWorkspaces, useReorderWorkspaces } from '@pls/substrate-client'
import { cn, useListGlide } from '@pls/shared-ui'
import { useWorkspaceStore } from './store'
import { useActiveWorkspaceId } from './activeBoard'
import { BookOpen, Moon, GraduationCap, Plus, Trash2 } from 'lucide-react'
import { CreateWorkspaceDialog, DeleteWorkspaceDialog } from './WorkspaceDialogs'

const WORKSPACE_ICONS: Record<string, typeof BookOpen> = {
  'ws-in-lecture': BookOpen,
  'ws-evening-review': Moon,
  'ws-exam-prep': GraduationCap,
}

/** Fades the strip's edges that have more tabs past them. */
function fadeMask({ start, end }: { start: boolean; end: boolean }): string {
  return `linear-gradient(to right, transparent, #000 ${start ? 28 : 0}px, #000 calc(100% - ${end ? 28 : 0}px), transparent)`
}

export function WorkspaceSwitcher() {
  const { data: workspaces } = useWorkspaces()
  const activeWorkspaceId = useActiveWorkspaceId()
  const setActiveWorkspaceId = useWorkspaceStore((s) => s.setActiveWorkspaceId)
  const reorder = useReorderWorkspaces()

  const [dragIdx, setDragIdx] = useState<number | null>(null)
  const [dropIdx, setDropIdx] = useState<number | null>(null)
  const [dragging, setDragging] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  // A board added, deleted or dragged to a new place: the others glide aside rather than jump.
  useListGlide(containerRef, workspaces?.map((ws) => ws.id) ?? [], 'x')
  // After the first render, an open tab's delete button arrives with the shared motion.
  const shown = useRef(false)
  useEffect(() => { shown.current = true }, [])
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

  // On a narrow screen the strip scrolls sideways; each edge with more tabs
  // past it fades out, so the strip reads as "there's more".
  const [edges, setEdges] = useState({ start: false, end: false })
  const updateEdges = useCallback(() => {
    const el = containerRef.current
    if (!el) return
    const start = el.scrollLeft > 1
    const end = el.scrollLeft + el.clientWidth < el.scrollWidth - 1
    setEdges((prev) => (prev.start === start && prev.end === end ? prev : { start, end }))
  }, [])
  const tabCount = workspaces?.length ?? 0
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    updateEdges()
    const observer = new ResizeObserver(updateEdges)
    observer.observe(el)
    return () => observer.disconnect()
  }, [updateEdges, tabCount])

  // Keep the open board's tab in view, centred clear of the fades. Scrolls
  // the strip only, never the page.
  const activeIdx = workspaces?.findIndex((ws) => ws.id === activeWorkspaceId) ?? -1
  useEffect(() => {
    const strip = containerRef.current
    const tab = tabRefs.current[activeIdx]?.parentElement
    if (!strip || !tab || strip.scrollWidth <= strip.clientWidth) return
    const s = strip.getBoundingClientRect()
    const t = tab.getBoundingClientRect()
    strip.scrollLeft += t.left + t.width / 2 - (s.left + s.width / 2)
    updateEdges()
  }, [activeIdx, tabCount, updateEdges])

  if (!workspaces) return null

  return (
    <>
      <div
        ref={containerRef}
        role="group"
        aria-label="Boards"
        data-fade-start={edges.start || undefined}
        data-fade-end={edges.end || undefined}
        onScroll={updateEdges}
        // pan-x: a finger swipes the strip sideways; a mouse drag still reorders.
        className="flex max-w-full items-center gap-1 overflow-x-auto rounded-track bg-surface-overlay p-1 touch-pan-x [scrollbar-width:none]"
        style={edges.start || edges.end ? { maskImage: fadeMask(edges), WebkitMaskImage: fadeMask(edges) } : undefined}
      >
        {workspaces.map((ws, idx) => {
          const Icon = WORKSPACE_ICONS[ws.id] ?? BookOpen
          const isActive = activeWorkspaceId === ws.id
          const isDragging = dragging && dragIdx === idx
          const showDropBefore = dragging && dropIdx === idx && dragIdx !== idx && dragIdx !== idx - 1

          return (
            <div
              key={ws.id}
              data-glide-key={ws.id}
              data-testid="workspace-tab"
              className={cn(
                'relative flex shrink-0 items-center rounded-tab transition-[background-color,box-shadow] duration-150',
                isActive && 'bg-surface-raised shadow-sm',
              )}
            >
              {showDropBefore && (
                <div className="absolute -left-0.5 top-1 bottom-1 w-0.5 rounded-full bg-accent" />
              )}
              <button
                ref={(el) => { tabRefs.current[idx] = el }}
                aria-current={isActive ? 'page' : undefined}
                data-board-id={ws.id}
                onPointerDown={(e) => onPointerDown(e, idx)}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onLostPointerCapture={onLostPointerCapture}
                className={cn(
                  'relative flex h-9 items-center gap-1.5 whitespace-nowrap rounded-tab pl-2 pr-0 text-body transition-[background-color,color,opacity] duration-150 select-none',
                  isActive
                    ? 'font-semibold text-text-primary'
                    : 'text-text-secondary hover:bg-surface-raised/60 hover:text-text-primary',
                  isDragging && 'opacity-40',
                  dragging && 'cursor-grabbing',
                )}
              >
                <Icon className="h-4 w-4" />
                <TabName name={ws.name} />
              </button>
              {/* Only the open board can be deleted, so the button sits inside
                  its tab and never overlaps a neighbour. Every tab keeps its
                  room, so opening a board never changes a tab's width. */}
              <span className={cn(TAB_ACTION_ROOM, 'flex items-center justify-center')}>
                {isActive && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      setDeleteTarget({ id: ws.id, name: ws.name })
                    }}
                    aria-label={`Delete ${ws.name}`}
                    title="Delete board"
                    className={cn(
                      'flex h-6 w-6 items-center justify-center rounded-item text-text-muted transition-colors hover:bg-confused-soft hover:text-confused',
                      shown.current && 'motion-safe:animate-enter',
                    )}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </span>
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
          className="flex h-9 shrink-0 items-center justify-center rounded-tab px-2.5 text-text-muted transition-colors hover:bg-surface-raised/60 hover:text-text-primary"
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

/**
 * The delete button's room at a tab's end: a 24px target, then the tab's
 * edge. With the icon and its gap on the left (8 + 16 + 6) it mirrors the
 * room on the right (24 + 6), so every tab's name sits in its middle.
 */
const TAB_ACTION_ROOM = 'mr-1.5 h-6 w-6 shrink-0'

/**
 * A tab's name, as wide as it is in bold whether it is or not: an invisible
 * bold copy (drawn by CSS, so it is never read out or counted as text) sets
 * the width, so opening a board never changes a tab's width.
 */
function TabName({ name }: { name: string }) {
  return (
    <span
      data-tab-name={name}
      className="inline-grid after:invisible after:h-0 after:overflow-hidden after:font-semibold after:content-[attr(data-tab-name)]"
    >
      {name}
    </span>
  )
}
