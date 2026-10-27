import { useCallback, useEffect, useRef } from 'react'
import { X } from 'lucide-react'
import {
  useWorkspaceScopes,
  useSetWorkspaceScope,
  useRecordings,
  useFocusedRecording,
  decodeScope,
} from '@pls/substrate-client'
import { COURSES, SectionLabel, Select } from '@pls/shared-ui'
import { useWorkspaceStore } from './store'
import { useManifests, type ScopeDim } from '@pls/lens-framework'
import { useBoardScopeDims } from './useBoardScopeDims'
import { WorkflowSettingsPanel } from './WorkflowSettingsPanel'
import { groupWidgets } from './widget-groups'

/* ── Constants ── */

const COURSE_FILTERS = [{ value: '', label: 'All courses' }, ...COURSES]

/* ── Scope Editor ── */

/**
 * Renders only the scope pickers whose dimensions are used by at least one
 * widget on the board (see `ScopeDeclaration`). The section is hidden
 * entirely when every widget ignores scope.
 */
function ScopeEditor({ workspaceId, activeDims }: { workspaceId: string; activeDims: Set<ScopeDim> }) {
  const { data: scopes } = useWorkspaceScopes(workspaceId)
  const setScope = useSetWorkspaceScope()

  const decodedScope = decodeScope((scopes ?? []) as { scope_type: string; scope_value: string }[])
  const currentCourse = decodedScope.courseTag ?? ''
  const currentRecordingId = decodedScope.recordingId ?? ''
  const { data: courseRecordings } = useRecordings(decodedScope.courseTag)
  // A focused lecture outside the course still appears, so the picker never
  // pretends nothing is focused.
  const { data: focused } = useFocusedRecording(decodedScope.recordingId)
  const recordings = focused && !courseRecordings?.some((r) => r.id === focused.id)
    ? [focused, ...(courseRecordings ?? [])]
    : courseRecordings

  const handleChange = useCallback(
    (scopeType: 'tag' | 'recording', value: string) => {
      setScope.mutate({ workspaceId, scopeType, scopeValue: value || null })
    },
    [workspaceId, setScope],
  )

  return (
    <div className="flex flex-col gap-2.5">
      {activeDims.has('courseTag') && (
        <div>
          <label htmlFor="scope-course" className="mb-1 block text-[11px] text-neutral-400">
            Course
          </label>
          <Select
            id="scope-course"
            value={currentCourse}
            onChange={(e) => handleChange('tag', e.target.value)}
          >
            {COURSE_FILTERS.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </Select>
        </div>
      )}

      {activeDims.has('recordingId') && (
        <div>
          <label htmlFor="scope-lecture" className="mb-1 block text-[11px] text-neutral-400">
            Lecture
          </label>
          <Select
            id="scope-lecture"
            value={currentRecordingId}
            onChange={(e) => handleChange('recording', e.target.value)}
          >
            <option value="">No lecture selected</option>
            {recordings?.map((r) => (
              <option key={r.id} value={r.id}>
                {r.title}
              </option>
            ))}
          </Select>
        </div>
      )}
    </div>
  )
}

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
          <div className="mb-1 px-1 text-[11px] font-medium text-neutral-400">{group.label}</div>
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
                  className="group flex w-full items-center gap-2.5 rounded-lg bg-surface-overlay/40 px-2 py-1.5 text-left ring-1 ring-border-subtle transition-all hover:bg-surface-overlay/70 hover:ring-accent/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 active:scale-[0.98]"
                >
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-surface-overlay/80 text-neutral-500 ring-1 ring-border-subtle transition-colors group-hover:text-accent group-hover:ring-accent/30">
                    <Icon className="h-3.5 w-3.5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-medium text-neutral-300 group-hover:text-neutral-100">
                      {m.label}
                    </span>
                    <span className="block truncate text-[10px] text-neutral-500">{m.description}</span>
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
  const previousFocusRef = useRef<Element | null>(null)
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId)
  const activeScopeDims = useBoardScopeDims(activeWorkspaceId)

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, onClose])

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
            background: 'oklch(0 0 0 / 0.4)',
            transition: 'var(--transition-panel)',
          }}
        />
      )}

      {/* Drawer panel */}
      <aside
        ref={asideRef}
        tabIndex={-1}
        data-testid="drawer-sidebar"
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
          boxShadow: open ? 'var(--shadow-panel-focused)' : 'none',
          transform: open ? 'translateX(0)' : 'translateX(-100%)',
          transition: `transform var(--transition-panel), box-shadow var(--transition-panel)`,
          borderRadius: '0 var(--radius-panel) var(--radius-panel) 0',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-border-subtle px-4 py-2.5">
          <h2 className="text-sm font-semibold text-neutral-200">Board menu</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close board menu"
            title="Close board menu"
            className="flex h-7 w-7 items-center justify-center rounded-md text-neutral-500 transition-colors hover:bg-surface-overlay hover:text-neutral-300"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="flex flex-col gap-5 px-3 py-4">
            {/* Widgets */}
            <section data-testid="widget-palette">
              <SectionLabel className="mb-1 px-1">Add widgets</SectionLabel>
              <p className="mb-2.5 px-1 text-[11px] text-neutral-500">Click to add, or drag onto your board.</p>
              <WidgetPalette onAdd={onAddWidget} onDragStart={handleWidgetDragStart} />
            </section>

            {/* Scope - hidden when every widget on the board ignores scope */}
            {activeScopeDims.size > 0 && (
              <section data-testid="scope-section">
                <SectionLabel className="mb-1 px-1">Showing</SectionLabel>
                <p className="mb-2.5 px-1 text-[11px] text-neutral-500">Choose what the widgets on this board focus on.</p>
                <ScopeEditor workspaceId={activeWorkspaceId} activeDims={activeScopeDims} />
              </section>
            )}

            {/* Automations */}
            <section>
              <SectionLabel className="mb-2 px-1">Automations</SectionLabel>
              <WorkflowSettingsPanel />
            </section>
          </div>
        </div>
      </aside>
    </>
  )
}
