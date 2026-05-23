import { useRef, useState, useCallback } from 'react'
import { useWorkspaces, useReorderWorkspaces } from '@pls/substrate-client'
import { cn } from '@pls/shared-ui'
import { useWorkspaceStore } from './store'
import { BookOpen, Moon, GraduationCap } from 'lucide-react'

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

  if (!workspaces) return null

  return (
    <div ref={containerRef} className="flex items-center gap-0.5 rounded-lg bg-surface p-1 touch-none">
      {workspaces.map((ws, idx) => {
        const Icon = WORKSPACE_ICONS[ws.id] ?? BookOpen
        const isActive = activeWorkspaceId === ws.id
        const isDragging = dragging && dragIdx === idx
        const showDropBefore = dragging && dropIdx === idx && dragIdx !== idx && dragIdx !== idx - 1

        return (
          <div key={ws.id} className="relative flex items-center">
            {showDropBefore && (
              <div className="absolute -left-0.5 top-1 bottom-1 w-0.5 rounded-full bg-accent" />
            )}
            <button
              ref={(el) => { tabRefs.current[idx] = el }}
              onPointerDown={(e) => onPointerDown(e, idx)}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onLostPointerCapture={onLostPointerCapture}
              className={cn(
                'relative flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all duration-150 select-none',
                isActive
                  ? 'bg-surface-raised text-neutral-100 shadow-sm shadow-black/20'
                  : 'text-neutral-500 hover:bg-surface-overlay/30 hover:text-neutral-300',
                isDragging && 'opacity-40',
                dragging && 'cursor-grabbing',
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {ws.name}
            </button>
            {dragging && dropIdx === workspaces.length && idx === workspaces.length - 1 && dragIdx !== idx && (
              <div className="absolute -right-0.5 top-1 bottom-1 w-0.5 rounded-full bg-accent" />
            )}
          </div>
        )
      })}
    </div>
  )
}
