import { useRef, useState, useCallback, useEffect } from 'react'
import { useWorkspaces, useReorderWorkspaces } from '@pls/substrate-client'
import { cn, Sortable, SortableHandle, SortableItem } from '@pls/shared-ui'
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

  const containerRef = useRef<HTMLDivElement>(null)
  const tabRefs = useRef<Map<string, HTMLElement>>(new Map())

  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null)

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
    const tab = activeWorkspaceId ? tabRefs.current.get(activeWorkspaceId)?.parentElement : null
    if (!strip || !tab || strip.scrollWidth <= strip.clientWidth) return
    const s = strip.getBoundingClientRect()
    const t = tab.getBoundingClientRect()
    strip.scrollLeft += t.left + t.width / 2 - (s.left + s.width / 2)
    updateEdges()
  }, [activeIdx, tabCount, updateEdges])

  if (!workspaces) return null

  const byId = new Map(workspaces.map((ws) => [ws.id, ws]))

  return (
    <>
      <Sortable
        ref={containerRef}
        aria-label="Boards"
        orientation="horizontal"
        value={workspaces.map((ws) => ws.id)}
        // One call per drop, with the whole new order: one write to the server.
        onValueChange={(ids) => reorder.mutate(ids)}
        label={(id) => `${byId.get(id)?.name ?? id} board`}
        data-fade-start={edges.start || undefined}
        data-fade-end={edges.end || undefined}
        onScroll={updateEdges}
        // pan-x: a finger swipes the strip sideways; a mouse drag still reorders.
        className="flex max-w-full items-center gap-1 overflow-x-auto rounded-track bg-surface-overlay p-1 touch-pan-x [scrollbar-width:none]"
        style={edges.start || edges.end ? { maskImage: fadeMask(edges), WebkitMaskImage: fadeMask(edges) } : undefined}
      >
        {({ order }) => (
          <>
            {order.map((id) => {
              const ws = byId.get(id)
              if (!ws) return null
              const Icon = WORKSPACE_ICONS[ws.id] ?? BookOpen
              const isActive = activeWorkspaceId === ws.id
              return (
                <SortableItem
                  key={ws.id}
                  value={ws.id}
                  data-testid="workspace-tab"
                  className={cn(
                    'relative flex shrink-0 items-center rounded-tab transition-all duration-150',
                    isActive && 'bg-surface-raised shadow-sm',
                  )}
                >
                  <SortableHandle
                    ref={(el: HTMLElement | null) => {
                      if (el) tabRefs.current.set(ws.id, el)
                      else tabRefs.current.delete(ws.id)
                    }}
                    // Enter opens the board; Space picks the tab up to move it.
                    enterActivates
                    aria-current={isActive ? 'page' : undefined}
                    onClick={() => setActiveWorkspaceId(ws.id)}
                    className={cn(
                      'relative flex h-9 items-center gap-2 whitespace-nowrap rounded-tab text-body transition-all duration-150',
                      isActive
                        ? 'pl-3.5 pr-1 font-semibold text-text-primary'
                        : 'px-3.5 text-text-secondary hover:bg-surface-raised/60 hover:text-text-primary',
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    {ws.name}
                  </SortableHandle>
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
                </SortableItem>
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
          </>
        )}
      </Sortable>
      <CreateWorkspaceDialog open={createDialogOpen} onClose={() => setCreateDialogOpen(false)} />
      <DeleteWorkspaceDialog
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        workspace={deleteTarget}
      />
    </>
  )
}
