import { useCallback, useEffect, useRef } from 'react'
import { X } from 'lucide-react'
import { useWorkspaces } from '@pls/substrate-client'
import { SectionLabel, useNarrowScreen, useFocusTrap } from '@pls/shared-ui'
import { useActiveWorkspaceId } from './activeBoard'
import { useManifests } from '@pls/lens-framework'
import { WorkflowSettingsPanel } from './WorkflowSettingsPanel'
import { groupWidgets } from './widget-groups'
import { JobStatusIndicator } from './JobStatusIndicator'
import { ThemeToggle } from './ThemeToggle'
import { BoardAppearance } from './BoardAppearance'

/* ── Widget Palette ── */

function WidgetPalette({
  onAdd,
  onDragStart,
}: {
  onAdd: (lensType: string) => void
  onDragStart?: () => void
}) {
  const manifests = useManifests()

  const handleDragStart = useCallback(
    (e: React.DragEvent, lensType: string) => {
      e.dataTransfer.setData('application/x-lens-type', lensType)
      e.dataTransfer.effectAllowed = 'copy'
      onDragStart?.()
    },
    [onDragStart],
  )

  return (
    <div className="flex flex-col gap-3">
      {groupWidgets(manifests).map((group) => (
        <div key={group.id} data-testid={`widget-group-${group.id}`} role="group" aria-label={group.label}>
          <div className="mb-1.5 px-1 text-meta font-semibold text-text-muted">{group.label}</div>
          <div className="flex flex-col gap-1">
            {group.widgets.map((m) => {
              const Icon = m.icon
              return (
                <button
                  key={m.id}
                  type="button"
                  data-lens-type={m.id}
                  draggable
                  onDragStart={(e) => handleDragStart(e, m.id)}
                  onClick={() => onAdd(m.id)}
                  aria-label={`Add ${m.label}`}
                  title={`Add ${m.label} to this board`}
                  className="group flex w-full items-center gap-3 rounded-item bg-surface-raised px-2.5 py-2 text-left ring-1 ring-border-subtle transition-all hover:bg-surface-inset hover:ring-accent-line focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent active:scale-[0.98]"
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-item bg-surface-overlay text-text-secondary transition-colors group-hover:bg-accent-soft group-hover:text-accent">
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-body font-semibold text-text-primary">
                      {m.label}
                    </span>
                    <span className="block truncate text-meta text-text-muted">{m.description}</span>
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}

/* ── Drawer Sidebar ── */

export interface DrawerSidebarProps {
  open: boolean
  onClose: () => void
  /** Adds a widget to the board in the first free area. The drawer stays open. */
  onAddWidget: (lensType: string) => void
}

export function DrawerSidebar({ open, onClose, onAddWidget }: DrawerSidebarProps) {
  const asideRef = useRef<HTMLElement>(null)
  // Modal while open: focus stays in the menu (or in Activity, opened from it).
  useFocusTrap(asideRef, open)
  const previousFocusRef = useRef<Element | null>(null)
  const activeWorkspaceId = useActiveWorkspaceId()
  const { data: boards } = useWorkspaces()
  // On a phone the top bar keeps only the menu, the tabs and the widgets
  // button: Activity, the theme and the board's appearance move in here.
  const narrow = useNarrowScreen()

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      // Activity, opened from in here, closes first.
      if (e.key === 'Escape' && !e.defaultPrevented) onClose()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, onClose])

  // The menu opens at the top, on the widget palette. It stays mounted while
  // closed, so without this it keeps an old scroll position (e.g. from
  // scrolling the palette the last time it was open).
  const scrollRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (open && scrollRef.current) scrollRef.current.scrollTop = 0
  }, [open])

  useEffect(() => {
    if (open) {
      previousFocusRef.current = document.activeElement
      asideRef.current?.focus()
    } else if (previousFocusRef.current) {
      // The opener may be gone (e.g. the empty-board button once a widget is
      // added); fall back to the menu button so focus never drops to <body>.
      const el = previousFocusRef.current as HTMLElement
      const target = el.isConnected
        ? el
        : document.querySelector<HTMLElement>('[data-testid="drawer-trigger"]')
      target?.focus()
      previousFocusRef.current = null
    }
  }, [open])

  // Dragging needs the board uncovered, so the drawer gets out of the way.
  const handleWidgetDragStart = useCallback(() => {
    onClose()
  }, [onClose])

  return (
    <>
      {/* Backdrop */}
      {open && (
        <div
          data-testid="drawer-backdrop"
          onClick={onClose}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 10000,
            background: 'color-mix(in oklab, var(--color-text-primary) 25%, transparent)',
            transition: 'var(--transition-panel)',
          }}
        />
      )}

      {/* Drawer panel */}
      <aside
        ref={asideRef}
        tabIndex={-1}
        data-testid="drawer-sidebar"
        role="dialog"
        aria-modal={open}
        aria-label="Board menu"
        aria-hidden={!open}
        inert={!open}
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          bottom: 0,
          width: 'min(300px, calc(100vw - 48px))',
          zIndex: 10001,
          background: 'var(--color-surface-raised)',
          boxShadow: open ? 'var(--shadow-pop)' : 'none',
          transform: open ? 'translateX(0)' : 'translateX(-100%)',
          transition: `transform var(--transition-panel), box-shadow var(--transition-panel)`,
          borderRadius: '0 var(--radius-widget) var(--radius-widget) 0',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        <div className="flex shrink-0 items-center gap-1 px-5 pt-4 pb-2">
          <h2 className="mr-auto text-title font-semibold text-text-primary">Board menu</h2>
          {narrow && (
            <div data-testid="drawer-app-controls" className="flex items-center gap-1">
              <JobStatusIndicator />
              <ThemeToggle />
            </div>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close board menu"
            title="Close board menu"
            className="flex h-8 w-8 items-center justify-center rounded-item text-text-muted transition-colors hover:bg-surface-overlay hover:text-text-primary"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
          <div className="flex flex-col gap-6 px-4 pt-2 pb-5">
            {/* Widgets, automations and appearance all belong to a board; what it
                shows is chosen in the top bar. */}
            {boards?.length === 0 && (
              <p data-testid="drawer-no-board" className="px-1 text-body text-text-secondary">
                Make a board first, then you can add widgets to it.
              </p>
            )}
            {/* Widgets */}
            {activeWorkspaceId && (
              <section data-testid="widget-palette">
                <SectionLabel className="mb-1 px-1">Add widgets</SectionLabel>
                <p className="mb-3 px-1 text-meta text-text-muted">Click to add, or drag onto your board.</p>
                <WidgetPalette onAdd={onAddWidget} onDragStart={handleWidgetDragStart} />
              </section>
            )}

            {/* Automations */}
            {activeWorkspaceId && (
              <section>
                <SectionLabel className="mb-2 px-1">Automations</SectionLabel>
                <WorkflowSettingsPanel />
              </section>
            )}

            {activeWorkspaceId && narrow && (
              <section data-testid="drawer-appearance">
                <SectionLabel className="mb-2 px-1">Board appearance</SectionLabel>
                <div className="px-1">
                  <BoardAppearance />
                </div>
              </section>
            )}
          </div>
        </div>
      </aside>
    </>
  )
}
