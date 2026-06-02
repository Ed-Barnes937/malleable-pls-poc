import type { ComponentType, ReactNode } from 'react'
import { FileText, X, Maximize2, Minimize2 } from 'lucide-react'

/* ── Props ── */

export interface PanelChromeProps {
  /** Panel ID — used for unique test IDs */
  panelId?: string
  title?: string
  /** Icon component from the lens manifest registry */
  icon?: ComponentType<{ className?: string; size?: number }>
  children?: ReactNode
  onClose?: () => void
  /** Passed down so the header can initiate drag via dragControls */
  onDragHandlePointerDown?: (e: React.PointerEvent) => void
  /** Whether this panel is currently fullscreen */
  isFullscreen?: boolean
  /** Toggle fullscreen for this panel */
  onToggleFullscreen?: () => void
  /** Extra header buttons rendered before the fullscreen/close actions. */
  headerActions?: ReactNode
}

/* ── Component ── */

export function PanelChrome({
  panelId,
  title,
  icon: Icon,
  children,
  onClose,
  onDragHandlePointerDown,
  isFullscreen,
  onToggleFullscreen,
  headerActions,
}: PanelChromeProps) {
  return (
    <div
      data-testid="panel-chrome"
      className="flex h-full w-full flex-col overflow-hidden"
    >
      {/* ── Header (drag handle) ── */}
      <div
        data-testid="panel-header"
        className="flex shrink-0 cursor-grab items-center gap-2 border-b border-border-subtle bg-surface-overlay/50 px-3 py-2 select-none active:cursor-grabbing"
        style={{ touchAction: 'none' }}
        onPointerDown={onDragHandlePointerDown}
      >
        {Icon ? (
          <Icon
            data-testid="panel-icon"
            className="h-3.5 w-3.5 shrink-0 text-text-secondary"
          />
        ) : (
          <FileText
            data-testid="panel-icon"
            size={14}
            className="shrink-0 text-text-secondary"
            aria-hidden
          />
        )}
        <span
          data-testid="panel-title"
          className="min-w-0 flex-1 truncate text-xs font-medium text-text-primary"
        >
          {title ?? 'Untitled'}
        </span>
        {headerActions}
        {onToggleFullscreen && (
          <button
            data-testid={panelId ? `panel-fullscreen-${panelId}` : 'panel-fullscreen'}
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation()
              onToggleFullscreen()
            }}
            className="flex shrink-0 items-center justify-center rounded-md p-0.5 text-text-muted transition-colors hover:bg-surface-overlay hover:text-text-primary"
            aria-label={isFullscreen ? `Exit fullscreen ${title ?? 'panel'}` : `Fullscreen ${title ?? 'panel'}`}
          >
            {isFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          </button>
        )}
        <button
          data-testid={panelId ? `panel-close-${panelId}` : 'panel-close'}
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation()
            onClose?.()
          }}
          className="flex shrink-0 items-center justify-center rounded-md p-0.5 text-text-muted transition-colors hover:bg-surface-overlay hover:text-text-primary"
          aria-label={`Close ${title ?? 'panel'}`}
        >
          <X size={14} />
        </button>
      </div>

      {/* ── Content area ── */}
      <div
        data-testid="panel-content"
        className="flex-1 overflow-auto px-3 pb-3"
      >
        {children}
      </div>
    </div>
  )
}
