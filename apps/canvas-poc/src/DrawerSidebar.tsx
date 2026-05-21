import { useCallback } from 'react'
import {
  FileText,
  Mic,
  Tags,
  BarChart3,
  Image,
  StickyNote,
  type LucideIcon,
} from 'lucide-react'
import type { PanelType } from './canvas-store'

/* ── Lens definitions ── */

export interface LensDefinition {
  type: PanelType
  label: string
  icon: LucideIcon
}

export const LENS_PALETTE: LensDefinition[] = [
  { type: 'document', label: 'Transcript', icon: FileText },
  { type: 'audio', label: 'Audio', icon: Mic },
  { type: 'tags', label: 'Tags', icon: Tags },
  { type: 'chart', label: 'Chart', icon: BarChart3 },
  { type: 'image', label: 'Image', icon: Image },
  { type: 'note', label: 'Note', icon: StickyNote },
]

/* ── Props ── */

export interface DrawerSidebarProps {
  open: boolean
  onClose: () => void
}

/* ── Component ── */

export function DrawerSidebar({ open, onClose }: DrawerSidebarProps) {
  const handleBackdropClick = useCallback(() => {
    onClose()
  }, [onClose])

  const handleDragStart = useCallback(
    (e: React.DragEvent<HTMLDivElement>, lens: LensDefinition) => {
      e.dataTransfer.setData('application/x-lens-type', lens.type)
      e.dataTransfer.setData('application/x-lens-label', lens.label)
      e.dataTransfer.effectAllowed = 'copy'
    },
    [],
  )

  return (
    <>
      {/* Backdrop */}
      {open && (
        <div
          data-testid="drawer-backdrop"
          onClick={handleBackdropClick}
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
        {/* Drawer header */}
        <div
          data-testid="drawer-header"
          className="px-4 py-4"
        >
          <h2 className="text-sm font-semibold text-text-primary">Panels</h2>
        </div>

        {/* Lens palette */}
        <nav
          data-testid="lens-palette"
          className="flex-1 overflow-auto px-3 pb-4"
          aria-label="Lens palette"
        >
          <div className="grid grid-cols-2 gap-2">
            {LENS_PALETTE.map((lens) => (
              <div
                key={lens.type}
                data-testid={`lens-item-${lens.type}`}
                draggable
                onDragStart={(e) => handleDragStart(e, lens)}
                className="flex cursor-grab flex-col items-center gap-1.5 rounded-[var(--radius-panel)] p-3 text-text-secondary active:cursor-grabbing"
                style={{
                  background: 'var(--color-surface-overlay)',
                  transition: 'var(--transition-panel)',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'var(--color-border)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'var(--color-surface-overlay)'
                }}
              >
                <lens.icon size={20} />
                <span className="text-xs font-medium">{lens.label}</span>
              </div>
            ))}
          </div>
        </nav>

        {/* Placeholder sections */}
        <div
          data-testid="drawer-placeholder-sections"
          className="border-t border-border-subtle px-4 py-4"
          style={{ transition: 'var(--transition-panel)' }}
        >
          <p className="text-xs text-text-muted">More options coming soon...</p>
        </div>
      </aside>
    </>
  )
}
