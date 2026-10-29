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
        className={`flex shrink-0 items-center gap-2.5 pt-3.5 pr-3.5 pb-1.5 pl-5 select-none ${onDragHandlePointerDown && !isFullscreen ? 'cursor-grab active:cursor-grabbing' : ''}`}
        style={{ touchAction: 'none' }}
        onPointerDown={onDragHandlePointerDown}
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-item bg-surface-overlay text-text-secondary">
          {Icon ? (
            <Icon data-testid="panel-icon" className="h-4 w-4 shrink-0" />
          ) : (
            <FileText data-testid="panel-icon" size={16} className="shrink-0" aria-hidden />
          )}
        </span>
        <span
          data-testid="panel-title"
          className="min-w-0 flex-1 truncate text-title font-semibold text-text-primary"
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
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-item text-text-muted transition-colors hover:bg-surface-overlay hover:text-text-primary"
            aria-label={isFullscreen ? `Exit fullscreen ${title ?? 'panel'}` : `Fullscreen ${title ?? 'panel'}`}
            title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
          >
            {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
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
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-item text-text-muted transition-colors hover:bg-surface-overlay hover:text-text-primary"
          // Closing removes the widget from the board, so say that.
          aria-label={`Remove ${title ?? 'panel'} from board`}
          title="Remove from board"
        >
          <X size={16} />
        </button>
      </div>

      {/* ── Content area ── */}
      <div
        data-testid="panel-content"
        className="flex-1 overflow-auto px-5 pt-2 pb-5"
      >
        {children}
      </div>
    </div>
  )
}
