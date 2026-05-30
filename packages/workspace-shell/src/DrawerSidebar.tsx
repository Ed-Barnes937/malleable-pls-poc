import { useCallback, useEffect, useMemo, useRef } from 'react'
import {
  useWorkspacePanels,
  useWorkspaceScopes,
  useSetWorkspaceScope,
} from '@pls/substrate-client'
import { SectionLabel } from '@pls/shared-ui'
import { ChevronDown } from 'lucide-react'
import { useWorkspaceStore } from './store'
import { useManifests, type ScopeDim } from '@pls/lens-framework'
import { WorkflowSettingsPanel } from './WorkflowSettingsPanel'

/* ── Constants ── */

const COURSES = [
  { value: '', label: 'All courses' },
  { value: 'biology', label: 'Biology' },
  { value: 'chemistry', label: 'Chemistry' },
  { value: 'physics', label: 'Physics' },
]

const TIMEFRAMES = [
  { value: '', label: 'No filter' },
  { value: 'week', label: 'This week' },
  { value: 'all', label: 'All time' },
]

const CATEGORY_ORDER = ['tool', 'view'] as const
const CATEGORY_LABELS: Record<string, string> = {
  tool: 'Tools',
  view: 'Views',
}

/* ── Scope Editor ── */

/**
 * Renders only the scope pickers whose dimensions are declared by at least
 * one lens in the active workspace's manifests. Returns null when no panel
 * declares any filter dimension — the section is hidden entirely.
 */
function ScopeEditor({ workspaceId, activeDims }: { workspaceId: string; activeDims: Set<ScopeDim> }) {
  const { data: scopes } = useWorkspaceScopes(workspaceId)
  const setScope = useSetWorkspaceScope()

  const currentCourse = scopes?.find((s) => s.scope_type === 'tag')?.scope_value ?? ''
  const currentTimeframe = scopes?.find((s) => s.scope_type === 'timeframe')?.scope_value ?? ''

  const handleChange = useCallback(
    (scopeType: string, value: string) => {
      setScope.mutate({ workspaceId, scopeType, scopeValue: value || null })
    },
    [workspaceId, setScope],
  )

  const selectClass =
    'w-full rounded-md border border-border-subtle bg-surface px-2.5 py-1.5 text-xs text-neutral-300 focus:border-accent/40 focus:outline-none focus:ring-1 focus:ring-accent/20 appearance-none cursor-pointer'

  return (
    <div className="flex flex-col gap-2.5">
      {activeDims.has('courseTag') && (
        <div>
          <SectionLabel className="mb-1">Course</SectionLabel>
          <div className="relative">
            <select
              aria-label="Course filter"
              value={currentCourse}
              onChange={(e) => handleChange('tag', e.target.value)}
              className={selectClass}
            >
              {COURSES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3 w-3 -translate-y-1/2 text-neutral-600" />
          </div>
        </div>
      )}

      {activeDims.has('timeframe') && (
        <div>
          <SectionLabel className="mb-1">Timeframe</SectionLabel>
          <div className="relative">
            <select
              aria-label="Timeframe filter"
              value={currentTimeframe}
              onChange={(e) => handleChange('timeframe', e.target.value)}
              className={selectClass}
            >
              {TIMEFRAMES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3 w-3 -translate-y-1/2 text-neutral-600" />
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * Returns the union of `manifest.filters` across all lenses currently in
 * the workspace. Drives both whether to render the Scope section and which
 * pickers to show inside it.
 */
function useActiveScopeDims(workspaceId: string): Set<ScopeDim> {
  const { data: panels } = useWorkspacePanels(workspaceId)
  const manifests = useManifests()
  return useMemo(() => {
    const dims = new Set<ScopeDim>()
    for (const p of panels ?? []) {
      const m = manifests.find((man) => man.id === p.lens_type)
      for (const d of m?.filters ?? []) dims.add(d)
    }
    return dims
  }, [panels, manifests])
}

/* ── Lens Palette ── */

function LensPalette({ onDragStart }: { onDragStart?: () => void }) {
  const manifests = useManifests()

  const handleDragStart = useCallback(
    (e: React.DragEvent, lensType: string) => {
      e.dataTransfer.setData('application/x-lens-type', lensType)
      e.dataTransfer.effectAllowed = 'copy'
      onDragStart?.()
    },
    [onDragStart],
  )

  const grouped = CATEGORY_ORDER.map((cat) => ({
    category: cat,
    label: CATEGORY_LABELS[cat],
    lenses: manifests.filter((m) => m.category === cat),
  })).filter((g) => g.lenses.length > 0)

  return (
    <div className="flex flex-col gap-3">
      {grouped.map((group) => (
        <div key={group.category}>
          <SectionLabel className="mb-1.5 px-1">{group.label}</SectionLabel>
          <div className="grid grid-cols-2 gap-1.5">
            {group.lenses.map((m) => {
              const Icon = m.icon
              return (
                <div
                  key={m.id}
                  data-lens-type={m.id}
                  draggable
                  onDragStart={(e) => handleDragStart(e, m.id)}
                  title={m.description}
                  className="group flex aspect-square cursor-grab flex-col items-center justify-center gap-1.5 rounded-lg bg-surface-overlay/40 p-2 ring-1 ring-border-subtle transition-all hover:bg-surface-overlay/70 hover:ring-accent/30 active:cursor-grabbing active:scale-[0.97]"
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-surface-overlay/80 text-neutral-500 ring-1 ring-border-subtle transition-colors group-hover:text-accent group-hover:ring-accent/30">
                    <Icon className="h-4 w-4" />
                  </div>
                  <p className="w-full truncate text-center text-[10px] font-medium text-neutral-400 group-hover:text-neutral-200">
                    {m.label}
                  </p>
                </div>
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
}

export function DrawerSidebar({ open, onClose }: DrawerSidebarProps) {
  const asideRef = useRef<HTMLElement>(null)
  const previousFocusRef = useRef<Element | null>(null)
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId)
  const activeScopeDims = useActiveScopeDims(activeWorkspaceId)

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
      const el = previousFocusRef.current as HTMLElement
      if (typeof el.focus === 'function') el.focus()
      previousFocusRef.current = null
    }
  }, [open])

  const handleLensDragStart = useCallback(() => {
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
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="flex flex-col gap-5 px-3 py-4">
            {/* Scope — hidden when no lens in this workspace declares a filter dim */}
            {activeScopeDims.size > 0 && (
              <section data-testid="scope-section">
                <SectionLabel className="mb-2 px-1">Scope</SectionLabel>
                <ScopeEditor workspaceId={activeWorkspaceId} activeDims={activeScopeDims} />
              </section>
            )}

            {/* Workflows */}
            <section>
              <SectionLabel className="mb-2 px-1">Workflows</SectionLabel>
              <WorkflowSettingsPanel />
            </section>

            {/* Lenses */}
            <section>
              <SectionLabel className="mb-2 px-1">Lenses</SectionLabel>
              <p className="mb-2 px-1 text-[10px] text-neutral-700">Drag onto the workspace</p>
              <LensPalette onDragStart={handleLensDragStart} />
            </section>
          </div>
        </div>
      </aside>
    </>
  )
}
