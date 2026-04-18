import { Suspense, Component, useState, useCallback, useRef, type ReactNode, type ErrorInfo } from 'react'
import { cn } from '@pls/shared-ui'
import { GripVertical, FileText, AlertTriangle, RefreshCw, X } from 'lucide-react'
import { useWorkspaceStore } from './store'
import { LENS_META } from './lens-meta'

interface ErrorBoundaryProps { children: ReactNode; lensType: string }
interface ErrorBoundaryState { error: Error | null }

class PanelErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null }
  static getDerivedStateFromError(error: Error) { return { error } }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error(`[${this.props.lensType}]`, error, info) }
  render() {
    if (this.state.error) {
      return (
        <div className="flex h-full flex-col items-center justify-center gap-3 p-4 text-center">
          <AlertTriangle className="h-6 w-6 text-tag-confused/60" />
          <p className="text-xs text-neutral-500">Something went wrong in this lens</p>
          <button
            onClick={() => this.setState({ error: null })}
            className="flex items-center gap-1.5 rounded-md bg-surface-overlay px-3 py-1.5 text-xs text-neutral-400 transition-colors hover:text-neutral-200"
          >
            <RefreshCw className="h-3 w-3" />
            Retry
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

function LoadingSkeleton() {
  return (
    <div className="flex h-full flex-col gap-3 p-1">
      <div className="h-3 w-2/3 animate-pulse rounded bg-neutral-800" />
      <div className="h-3 w-full animate-pulse rounded bg-neutral-800/60" />
      <div className="h-3 w-5/6 animate-pulse rounded bg-neutral-800/40" />
      <div className="h-3 w-3/4 animate-pulse rounded bg-neutral-800/30" />
    </div>
  )
}

function ResizeHandle({
  colSpan,
  rowSpan,
  onResizeStart,
  onResizeEnd,
}: {
  colSpan: number
  rowSpan: number
  onResizeStart: () => void
  onResizeEnd: (colSpan: number, rowSpan: number) => void
}) {
  const handleRef = useRef<HTMLDivElement>(null)

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()

    const startX = e.clientX
    const startY = e.clientY
    const startColSpan = colSpan
    const startRowSpan = rowSpan

    const slotEl = handleRef.current?.closest('[data-swapy-slot]') as HTMLElement | null
    const gridEl = slotEl?.closest('[data-panel-grid]') as HTMLElement | null
    if (!slotEl || !gridEl) return

    onResizeStart()

    const gridStyle = getComputedStyle(gridEl)
    const gap = parseFloat(gridStyle.gap) || 12
    const colTracks = gridStyle.gridTemplateColumns.split(/\s+/)
    const rowTracks = gridStyle.gridTemplateRows.split(/\s+/)
    const cellWidth = parseFloat(colTracks[0]) || 200
    const cellHeight = parseFloat(rowTracks[0]) || 200

    const slotRect = slotEl.getBoundingClientRect()

    const overlay = document.createElement('div')
    Object.assign(overlay.style, {
      position: 'fixed',
      left: `${slotRect.left}px`,
      top: `${slotRect.top}px`,
      width: `${slotRect.width}px`,
      height: `${slotRect.height}px`,
      border: '2px solid oklch(0.623 0.214 259.815 / 0.6)',
      borderRadius: '12px',
      background: 'oklch(0.623 0.214 259.815 / 0.05)',
      pointerEvents: 'none',
      zIndex: '100',
      transition: 'width 150ms ease-out, height 150ms ease-out',
    })

    const label = document.createElement('span')
    Object.assign(label.style, {
      position: 'absolute',
      bottom: '6px',
      right: '8px',
      fontSize: '10px',
      fontFamily: 'var(--font-mono)',
      fontWeight: '600',
      color: 'oklch(0.623 0.214 259.815 / 0.8)',
    })
    label.textContent = `${startColSpan}×${startRowSpan}`
    overlay.appendChild(label)
    document.body.appendChild(overlay)

    let currentColSpan = startColSpan
    let currentRowSpan = startRowSpan

    const onMouseMove = (me: MouseEvent) => {
      const dx = me.clientX - startX
      const dy = me.clientY - startY
      currentColSpan = Math.max(1, Math.min(3, startColSpan + Math.round(dx / (cellWidth + gap))))
      currentRowSpan = Math.max(1, Math.min(6, startRowSpan + Math.round(dy / (cellHeight + gap))))

      const targetWidth = cellWidth * currentColSpan + gap * (currentColSpan - 1)
      const targetHeight = cellHeight * currentRowSpan + gap * (currentRowSpan - 1)
      overlay.style.width = `${targetWidth}px`
      overlay.style.height = `${targetHeight}px`
      label.textContent = `${currentColSpan}×${currentRowSpan}`
    }

    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      overlay.remove()
      onResizeEnd(currentColSpan, currentRowSpan)
    }

    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
    document.body.style.cursor = 'nwse-resize'
    document.body.style.userSelect = 'none'
  }, [colSpan, rowSpan, onResizeStart, onResizeEnd])

  return (
    <div
      ref={handleRef}
      onMouseDown={onMouseDown}
      className="absolute bottom-1.5 right-1.5 z-20 flex h-5 w-5 cursor-nwse-resize items-center justify-center rounded-md bg-surface-overlay/90 text-neutral-600 opacity-0 ring-1 ring-border-subtle backdrop-blur-sm transition-all group-hover/panel:opacity-100 hover:text-accent hover:ring-accent/40 hover:bg-surface-overlay"
    >
      <svg width="8" height="8" viewBox="0 0 8 8">
        <path d="M6 1v5.5H.5" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
        <path d="M6 4.5v2H4" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
      </svg>
    </div>
  )
}

interface PanelContainerProps {
  panelId: string
  lensType: string
  dbPanelId?: string
  colSpan: number
  rowSpan: number
  onRemove?: () => void
  onReplace?: (newLensType: string) => void
  onResizeStart?: () => void
  onResizeEnd?: (colSpan: number, rowSpan: number) => void
  children: ReactNode
}

export function PanelContainer({
  panelId,
  lensType,
  colSpan,
  rowSpan,
  onRemove,
  onReplace,
  onResizeStart,
  onResizeEnd,
  children,
}: PanelContainerProps) {
  const focusedPanelId = useWorkspaceStore((s) => s.focusedPanelId)
  const setFocusedPanelId = useWorkspaceStore((s) => s.setFocusedPanelId)
  const isFocused = focusedPanelId === panelId
  const [dragOver, setDragOver] = useState(false)

  const meta = LENS_META[lensType]
  const Icon = meta?.icon ?? FileText

  return (
    <div
      className={cn(
        'group/panel relative flex h-full flex-col overflow-hidden rounded-xl border bg-surface-raised transition-[border-color,box-shadow] duration-150',
        dragOver
          ? 'border-accent/60 ring-2 ring-accent/20'
          : isFocused
            ? 'border-accent/40 ring-1 ring-accent/20'
            : 'border-border-subtle'
      )}
      onClick={() => setFocusedPanelId(panelId)}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes('application/x-lens-type')) {
          e.preventDefault()
          e.dataTransfer.dropEffect = 'copy'
          setDragOver(true)
        }
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        setDragOver(false)
        const newLensType = e.dataTransfer.getData('application/x-lens-type')
        if (newLensType && onReplace) onReplace(newLensType)
      }}
    >
      <div className="flex items-center gap-2 border-b border-border-subtle px-3 py-2" data-swapy-handle>
        <GripVertical className="h-3.5 w-3.5 shrink-0 cursor-grab text-neutral-700 transition-colors hover:text-neutral-500 active:cursor-grabbing" />
        <Icon className="h-3.5 w-3.5 text-neutral-600" />
        <span className="text-xs font-medium text-neutral-400">
          {meta?.label ?? lensType}
        </span>
        {onRemove && (
          <button
            onClick={(e) => { e.stopPropagation(); onRemove() }}
            className="ml-auto flex h-5 w-5 items-center justify-center rounded text-neutral-700 transition-colors hover:bg-surface-overlay hover:text-neutral-400"
            title="Remove panel"
          >
            <X className="h-3 w-3" />
          </button>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-3">
        <PanelErrorBoundary lensType={lensType}>
          <Suspense fallback={<LoadingSkeleton />}>
            {children}
          </Suspense>
        </PanelErrorBoundary>
      </div>
      {onResizeEnd && onResizeStart && (
        <ResizeHandle
          colSpan={colSpan}
          rowSpan={rowSpan}
          onResizeStart={onResizeStart}
          onResizeEnd={onResizeEnd}
        />
      )}
    </div>
  )
}
