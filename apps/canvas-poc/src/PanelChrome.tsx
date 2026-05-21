import type { ReactNode } from 'react'
import {
  FileText,
  Mic,
  Tags,
  BarChart3,
  Image,
  StickyNote,
  X,
  Maximize2,
  Minimize2,
  type LucideIcon,
} from 'lucide-react'
import type { PanelType } from './canvas-store'

/* ── Icon map ── */

const PANEL_ICONS: Record<PanelType, LucideIcon> = {
  document: FileText,
  audio: Mic,
  tags: Tags,
  chart: BarChart3,
  image: Image,
  note: StickyNote,
}

/* ── Deterministic waveform heights (avoids Math.random jitter on re-render) ── */

const WAVEFORM_HEIGHTS = [
  35, 68, 42, 75, 28, 82, 55, 90, 38, 72, 48, 85,
  30, 78, 62, 88, 45, 70, 52, 95, 40, 65, 58, 80,
]

/* ── Props ── */

export interface PanelChromeProps {
  title?: string
  type?: PanelType
  children?: ReactNode
  onClose?: () => void
  /** Passed down so the header can initiate drag via dragControls */
  onDragHandlePointerDown?: (e: React.PointerEvent) => void
  /** Whether this panel is currently fullscreen */
  isFullscreen?: boolean
  /** Toggle fullscreen for this panel */
  onToggleFullscreen?: () => void
}

/* ── Component ── */

export function PanelChrome({
  title,
  type,
  children,
  onClose,
  onDragHandlePointerDown,
  isFullscreen,
  onToggleFullscreen,
}: PanelChromeProps) {
  const Icon = type ? PANEL_ICONS[type] : FileText

  return (
    <div
      data-testid="panel-chrome"
      className="flex h-full w-full flex-col overflow-hidden"
    >
      {/* ── Header (drag handle) ── */}
      <div
        data-testid="panel-header"
        className="flex shrink-0 cursor-grab items-center gap-2 px-3 py-2 select-none active:cursor-grabbing"
        style={{ touchAction: 'none' }}
        onPointerDown={onDragHandlePointerDown}
      >
        <Icon
          data-testid="panel-icon"
          size={14}
          className="shrink-0 text-text-secondary"
          aria-hidden
        />
        <span
          data-testid="panel-title"
          className="min-w-0 flex-1 truncate text-xs font-medium text-text-primary"
        >
          {title ?? 'Untitled'}
        </span>
        {onToggleFullscreen && (
          <button
            data-testid="panel-fullscreen"
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
          data-testid="panel-close"
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
        {children ?? (
          <PlaceholderContent type={type} />
        )}
      </div>
    </div>
  )
}

/* ── Placeholder content for POC ── */

function PlaceholderContent({ type }: { type?: PanelType }) {
  switch (type) {
    case 'document':
      return (
        <div className="space-y-2 text-xs leading-relaxed text-text-secondary">
          <p>Discussed Q3 roadmap priorities and resource allocation. Key decisions:</p>
          <ul className="list-inside list-disc space-y-1 text-text-muted">
            <li>Move forward with canvas prototype</li>
            <li>Hire two more frontend engineers</li>
            <li>Deprecate legacy dashboard by September</li>
            <li>Weekly sync moved to Thursdays</li>
          </ul>
          <p>Action items assigned to team leads. Follow-up scheduled for next sprint.</p>
        </div>
      )
    case 'audio':
      return (
        <div className="space-y-2">
          <div className="flex items-center gap-2 rounded-lg bg-surface-overlay p-2">
            <div className="h-2 w-2 rounded-full bg-accent animate-pulse" />
            <span className="text-xs text-text-secondary">Recording — 12:34</span>
          </div>
          <div className="flex h-8 items-end gap-0.5">
            {WAVEFORM_HEIGHTS.map((h, i) => (
              <div
                key={i}
                className="flex-1 rounded-sm bg-accent/30"
                style={{ height: `${h}%` }}
              />
            ))}
          </div>
        </div>
      )
    case 'tags':
      return (
        <div className="flex flex-wrap gap-1.5">
          {['Design', 'Frontend', 'Urgent', 'v2.0', 'Reviewed', 'In Progress', 'Backend', 'UX'].map(
            (tag) => (
              <button
                key={tag}
                type="button"
                className="rounded-full border border-border-subtle px-2.5 py-1 text-xs text-text-secondary transition-colors hover:border-accent hover:text-accent"
              >
                {tag}
              </button>
            ),
          )}
        </div>
      )
    case 'chart':
      return (
        <div className="flex h-full items-end gap-1.5 pb-2">
          {[40, 65, 45, 80, 55, 90, 70, 85, 60, 95, 75, 50].map((h, i) => (
            <div
              key={i}
              className="flex-1 rounded-t bg-accent/40 transition-all hover:bg-accent/70"
              style={{ height: `${h}%` }}
            />
          ))}
        </div>
      )
    case 'image':
      return (
        <div className="grid grid-cols-2 gap-1.5">
          {Array.from({ length: 4 }, (_, i) => (
            <div
              key={i}
              className="aspect-square rounded-lg bg-surface-overlay"
              style={{
                background: `linear-gradient(${135 + i * 45}deg, var(--color-surface-overlay), var(--color-accent) / 0.15)`,
              }}
            />
          ))}
        </div>
      )
    case 'note':
      return (
        <div className="space-y-1.5 text-xs leading-relaxed text-text-secondary">
          <p>Remember to update the design tokens for the new panel system.</p>
          <p className="text-text-muted">Also check if the animation timing feels right on lower-end devices.</p>
        </div>
      )
    default:
      return (
        <p className="text-xs text-text-muted">Panel content goes here.</p>
      )
  }
}
