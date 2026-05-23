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
  const containerRef = useRef<HTMLDivElement>(null)
  const dragStartX = useRef(0)
  const didDrag = useRef(false)

  const getDropIndex = useCallback(
    (clientX: number) => {
      if (!containerRef.current || !workspaces) return null
      const buttons = Array.from(containerRef.current.querySelectorAll<HTMLElement>('[data-ws-idx]'))
      for (let i = 0; i < buttons.length; i++) {
        const rect = buttons[i].getBoundingClientRect()
        if (clientX < rect.left + rect.width / 2) return i
      }
      return buttons.length
    },
    [workspaces],
  )

  const onPointerDown = useCallback(
    (e: React.PointerEvent, idx: number) => {
      // Only primary button
      if (e.button !== 0) return
      e.currentTarget.setPointerCapture(e.pointerId)
      dragStartX.current = e.clientX
      didDrag.current = false
      setDragIdx(idx)
    },
    [],
  )

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (dragIdx === null) return
      if (!didDrag.current && Math.abs(e.clientX - dragStartX.current) < 5) return
      didDrag.current = true
      const drop = getDropIndex(e.clientX)
      setDropIdx(drop)
    },
    [dragIdx, getDropIndex],
  )

  const onPointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (dragIdx === null || !workspaces) {
        setDragIdx(null)
        setDropIdx(null)
        return
      }

      if (didDrag.current && dropIdx !== null) {
        const ids = workspaces.map((ws) => ws.id)
        const [moved] = ids.splice(dragIdx, 1)
        const insertAt = dropIdx > dragIdx ? dropIdx - 1 : dropIdx
        ids.splice(insertAt, 0, moved)
        reorder.mutate(ids)
      } else {
        // It was a click, not a drag
        setActiveWorkspaceId(workspaces[dragIdx].id)
      }

      ;(e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId)
      setDragIdx(null)
      setDropIdx(null)
    },
    [dragIdx, dropIdx, workspaces, reorder, setActiveWorkspaceId],
  )

  if (!workspaces) return null

  return (
    <div ref={containerRef} className="flex items-center gap-0.5 rounded-lg bg-surface p-1">
      {workspaces.map((ws, idx) => {
        const Icon = WORKSPACE_ICONS[ws.id] ?? BookOpen
        const isActive = activeWorkspaceId === ws.id
        const isDragging = dragIdx === idx && didDrag.current
        const showDropBefore = didDrag.current && dropIdx === idx && dragIdx !== idx && dragIdx !== idx - 1

        return (
          <div key={ws.id} className="relative flex items-center" data-ws-idx={idx}>
            {showDropBefore && (
              <div className="absolute -left-0.5 top-1 bottom-1 w-0.5 rounded-full bg-accent" />
            )}
            <button
              onPointerDown={(e) => onPointerDown(e, idx)}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              className={cn(
                'relative flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all duration-150 select-none',
                isActive
                  ? 'bg-surface-raised text-neutral-100 shadow-sm shadow-black/20'
                  : 'text-neutral-500 hover:bg-surface-overlay/30 hover:text-neutral-300',
                isDragging && 'opacity-40',
                dragIdx !== null && 'cursor-grabbing',
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {ws.name}
            </button>
            {didDrag.current && dropIdx === workspaces.length && idx === workspaces.length - 1 && dragIdx !== idx && (
              <div className="absolute -right-0.5 top-1 bottom-1 w-0.5 rounded-full bg-accent" />
            )}
          </div>
        )
      })}
    </div>
  )
}
