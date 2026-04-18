import { useCallback } from 'react'
import {
  useWorkspaces,
  useRecordings,
  useWorkspaceScopes,
  useSetWorkspaceScope,
} from '@pls/substrate'
import { cn } from '@pls/shared-ui'
import { BookOpen, Moon, GraduationCap, ChevronDown, Layers } from 'lucide-react'
import { useWorkspaceStore } from './store'
import { useLensRegistry } from './LensRegistry'
import { LENS_META } from './lens-meta'
import { ThemeToggle } from './ThemeToggle'
import { resetDb } from '@pls/substrate'
import { RotateCcw } from 'lucide-react'

const WORKSPACE_ICONS: Record<string, typeof BookOpen> = {
  'ws-in-lecture': BookOpen,
  'ws-evening-review': Moon,
  'ws-exam-prep': GraduationCap,
}

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

function ScopeEditor({ workspaceId }: { workspaceId: string }) {
  const { data: scopes } = useWorkspaceScopes(workspaceId)
  const { data: recordings } = useRecordings()
  const setScope = useSetWorkspaceScope()

  const currentCourse = scopes?.find((s) => s.scope_type === 'tag')?.scope_value ?? ''
  const currentRecording = scopes?.find((s) => s.scope_type === 'recording')?.scope_value ?? ''
  const currentTimeframe = scopes?.find((s) => s.scope_type === 'timeframe')?.scope_value ?? ''

  const handleChange = useCallback(
    (scopeType: string, value: string) => {
      setScope.mutate({ workspaceId, scopeType, scopeValue: value || null })
    },
    [workspaceId, setScope]
  )

  const selectClass =
    'w-full rounded-md border border-border-subtle bg-surface px-2.5 py-1.5 text-xs text-neutral-300 focus:border-accent/40 focus:outline-none focus:ring-1 focus:ring-accent/20 appearance-none cursor-pointer'

  return (
    <div className="flex flex-col gap-2.5">
      <div>
        <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-neutral-600">
          Course
        </label>
        <div className="relative">
          <select
            value={currentCourse}
            onChange={(e) => handleChange('tag', e.target.value)}
            className={selectClass}
          >
            {COURSES.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3 w-3 -translate-y-1/2 text-neutral-600" />
        </div>
      </div>

      <div>
        <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-neutral-600">
          Recording
        </label>
        <div className="relative">
          <select
            value={currentRecording}
            onChange={(e) => handleChange('recording', e.target.value)}
            className={selectClass}
          >
            <option value="">All recordings</option>
            {recordings?.map((r) => (
              <option key={r.id} value={r.id}>{r.title}</option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3 w-3 -translate-y-1/2 text-neutral-600" />
        </div>
      </div>

      <div>
        <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-neutral-600">
          Timeframe
        </label>
        <div className="relative">
          <select
            value={currentTimeframe}
            onChange={(e) => handleChange('timeframe', e.target.value)}
            className={selectClass}
          >
            {TIMEFRAMES.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3 w-3 -translate-y-1/2 text-neutral-600" />
        </div>
      </div>
    </div>
  )
}

function WorkspaceList() {
  const { data: workspaces } = useWorkspaces()
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId)
  const setActiveWorkspaceId = useWorkspaceStore((s) => s.setActiveWorkspaceId)

  if (!workspaces) return null

  return (
    <div className="flex flex-col gap-0.5">
      {workspaces.map((ws) => {
        const Icon = WORKSPACE_ICONS[ws.id] ?? BookOpen
        const isActive = activeWorkspaceId === ws.id
        return (
          <button
            key={ws.id}
            onClick={() => setActiveWorkspaceId(ws.id)}
            className={cn(
              'flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-xs font-medium transition-all',
              isActive
                ? 'bg-accent/10 text-accent ring-1 ring-accent/20'
                : 'text-neutral-500 hover:bg-surface-overlay/50 hover:text-neutral-300'
            )}
          >
            <Icon className="h-3.5 w-3.5 shrink-0" />
            {ws.name}
          </button>
        )
      })}
    </div>
  )
}

function LensPalette() {
  const registry = useLensRegistry()
  const lensTypes = Object.keys(registry)

  const handleDragStart = useCallback((e: React.DragEvent, lensType: string) => {
    e.dataTransfer.setData('application/x-lens-type', lensType)
    e.dataTransfer.effectAllowed = 'copy'
  }, [])

  return (
    <div className="flex flex-col gap-1">
      {lensTypes.map((type) => {
        const meta = LENS_META[type]
        if (!meta) return null
        const Icon = meta.icon
        return (
          <div
            key={type}
            draggable
            onDragStart={(e) => handleDragStart(e, type)}
            className="group flex cursor-grab items-center gap-2.5 rounded-lg px-2.5 py-2 transition-all hover:bg-surface-overlay/50 active:cursor-grabbing active:scale-[0.98]"
          >
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-surface-overlay/80 text-neutral-500 ring-1 ring-border-subtle transition-colors group-hover:text-accent group-hover:ring-accent/30">
              <Icon className="h-3.5 w-3.5" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-medium text-neutral-400 group-hover:text-neutral-200">{meta.label}</p>
              <p className="text-[10px] text-neutral-600">{meta.description}</p>
            </div>
          </div>
        )
      })}
    </div>
  )
}

export function Sidebar() {
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId)

  return (
    <aside className="flex h-full w-[240px] shrink-0 flex-col border-r border-border-subtle bg-surface">
      <div className="flex items-center gap-2 px-4 py-3">
        <Layers className="h-4 w-4 text-accent" />
        <h1 className="text-sm font-semibold tracking-tight text-neutral-300">Malleable PLS</h1>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="flex flex-col gap-5 px-3 pb-4">
          <section>
            <h2 className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-widest text-neutral-600">
              Workspaces
            </h2>
            <WorkspaceList />
          </section>

          <section>
            <h2 className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-widest text-neutral-600">
              Scope
            </h2>
            <ScopeEditor workspaceId={activeWorkspaceId} />
          </section>

          <section>
            <h2 className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-widest text-neutral-600">
              Lenses
            </h2>
            <p className="mb-2 px-1 text-[10px] text-neutral-700">Drag onto the workspace</p>
            <LensPalette />
          </section>
        </div>
      </div>

      <div className="flex items-center justify-between border-t border-border-subtle px-3 py-2.5">
        <ThemeToggle />
        <button
          onClick={() => { resetDb(); window.location.reload() }}
          className="flex items-center gap-1.5 rounded-md px-2 py-1 text-[10px] text-neutral-600 transition-colors hover:bg-surface-overlay hover:text-neutral-400"
          title="Reset demo data"
        >
          <RotateCcw className="h-3 w-3" />
          Reset
        </button>
      </div>
    </aside>
  )
}
