import { useEffect, useRef, useMemo, useCallback, useState } from 'react'
import { Responsive, useContainerWidth, type LayoutItem } from 'react-grid-layout'
import {
  useWorkspacePanels,
  useWorkspaceScopes,
  useAddWorkspacePanel,
  useRemoveWorkspacePanel,
  useReplacePanelLens,
  useUpdatePanelLayouts,
  useJobRunner,
  type Scope,
} from '@pls/substrate'
import { useWorkspaceStore } from './store'
import { getLensComponent, useLensRegistry } from './LensRegistry'
import { PanelContainer } from './PanelContainer'
import { Sidebar } from './Sidebar'
import { cn } from '@pls/shared-ui'
import { Plus } from 'lucide-react'

import 'react-grid-layout/css/styles.css'

const COLS = 3
const GRID_ROWS = 6
const MARGIN: [number, number] = [12, 12]

function scopesFromDb(scopes: { scope_type: string; scope_value: string }[]): Scope {
  const scope: Scope = {}
  for (const s of scopes) {
    if (s.scope_type === 'tag') scope.courseTag = s.scope_value
    if (s.scope_type === 'recording') scope.recordingId = s.scope_value
    if (s.scope_type === 'timeframe') scope.timeframe = s.scope_value as 'week' | 'all'
  }
  return scope
}


function DropZone({
  onDrop,
  isDragOver,
  setDragOver,
}: {
  onDrop: (lensType: string) => void
  isDragOver: boolean
  setDragOver: (v: boolean) => void
}) {
  return (
    <div
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
        const lensType = e.dataTransfer.getData('application/x-lens-type')
        if (lensType) onDrop(lensType)
      }}
      className={cn(
        'flex items-center justify-center rounded-xl border-2 border-dashed transition-all duration-200',
        isDragOver
          ? 'border-accent/60 bg-accent/5 text-accent'
          : 'border-border-subtle text-neutral-700 hover:border-border hover:text-neutral-600'
      )}
    >
      <div className="flex flex-col items-center gap-1.5">
        <Plus className={cn('h-5 w-5', isDragOver && 'scale-125 transition-transform')} />
        <span className="text-[10px] font-medium">
          {isDragOver ? 'Release to add' : 'Drop lens here'}
        </span>
      </div>
    </div>
  )
}

export function WorkspaceShell() {
  const lensRegistry = useLensRegistry()
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId)

  useJobRunner(activeWorkspaceId)

  const { data: panels } = useWorkspacePanels(activeWorkspaceId)
  const { data: dbScopes } = useWorkspaceScopes(activeWorkspaceId)

  const addPanel = useAddWorkspacePanel()
  const removePanel = useRemoveWorkspacePanel()
  const replacePanel = useReplacePanelLens()
  const updateLayouts = useUpdatePanelLayouts()

  const [transitioning, setTransitioning] = useState(false)
  const prevWorkspaceRef = useRef(activeWorkspaceId)
  const [dropZoneDragOver, setDropZoneDragOver] = useState(false)

  const { width: gridWidth, containerRef } = useContainerWidth({ initialWidth: 1200 })
  const [containerHeight, setContainerHeight] = useState(600)


  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const observer = new ResizeObserver(([entry]) => {
      setContainerHeight(entry.contentRect.height)
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [containerRef])

  useEffect(() => {
    if (prevWorkspaceRef.current !== activeWorkspaceId) {
      setTransitioning(true)
      const timer = setTimeout(() => setTransitioning(false), 150)
      prevWorkspaceRef.current = activeWorkspaceId
      return () => clearTimeout(timer)
    }
  }, [activeWorkspaceId])

  const scope = useMemo(() => scopesFromDb(dbScopes ?? []), [dbScopes])

  const panelConfigs = useMemo(() => {
    if (!panels) return new Map<string, Record<string, unknown>>()
    const map = new Map<string, Record<string, unknown>>()
    for (const p of panels) {
      map.set(p.id, { ...JSON.parse(p.config), lensType: p.lens_type })
    }
    return map
  }, [panels])

  const layout = useMemo<LayoutItem[]>(() => {
    if (!panels) return []
    return panels.map((p, idx) => ({
      i: p.id,
      x: Number.isFinite(p.grid_x) ? p.grid_x : (idx % COLS),
      y: Number.isFinite(p.grid_y) ? p.grid_y : Math.floor(idx / COLS) * 2,
      w: Number.isFinite(p.grid_w) && p.grid_w > 0 ? p.grid_w : 1,
      h: Number.isFinite(p.grid_h) && p.grid_h > 0 ? p.grid_h : 2,
      minW: 1,
      minH: 1,
      maxW: COLS,
    }))
  }, [panels])

  const rowHeight = useMemo(() => {
    const totalMargin = MARGIN[1] * (GRID_ROWS - 1)
    return (containerHeight - totalMargin) / GRID_ROWS
  }, [containerHeight])

  const handleLayoutChange = useCallback(
    (currentLayout: LayoutItem[]) => {
      if (!panels?.length) return
      const changed = currentLayout.some((item) => {
        const panel = panels.find(p => p.id === item.i)
        if (!panel) return false
        return panel.grid_x !== item.x || panel.grid_y !== item.y ||
               panel.grid_w !== item.w || panel.grid_h !== item.h
      })
      if (!changed) return
      updateLayouts.mutate({
        workspaceId: activeWorkspaceId,
        layouts: currentLayout
          .filter(item => panels.some(p => p.id === item.i))
          .map(item => ({ id: item.i, x: item.x, y: item.y, w: item.w, h: item.h })),
      })
    },
    [activeWorkspaceId, panels, updateLayouts]
  )

  const handleAddPanel = useCallback(
    (lensType: string) => {
      const slotName = `slot-${Date.now()}`
      addPanel.mutate({ workspaceId: activeWorkspaceId, lensType, slotName })
    },
    [activeWorkspaceId, addPanel]
  )

  const handleRemovePanel = useCallback(
    (panelId: string) => {
      removePanel.mutate({ panelId, workspaceId: activeWorkspaceId })
    },
    [activeWorkspaceId, removePanel]
  )

  const handleReplacePanel = useCallback(
    (panelId: string, newLensType: string) => {
      replacePanel.mutate({ panelId, newLensType, workspaceId: activeWorkspaceId })
    },
    [activeWorkspaceId, replacePanel]
  )

  return (
    <div className="flex h-dvh overflow-hidden bg-surface">
      <Sidebar />

      <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <div
          ref={containerRef}
          className={cn(
            'relative min-h-0 flex-1 overflow-y-auto p-3 transition-opacity duration-150',
            transitioning ? 'opacity-0' : 'opacity-100'
          )}
          onDragOver={(e) => {
            if (e.dataTransfer.types.includes('application/x-lens-type')) {
              e.preventDefault()
              e.dataTransfer.dropEffect = 'copy'
              setDropZoneDragOver(true)
            }
          }}
          onDragLeave={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node)) {
              setDropZoneDragOver(false)
            }
          }}
          onDrop={(e) => {
            if (e.dataTransfer.types.includes('application/x-lens-type')) {
              e.preventDefault()
              setDropZoneDragOver(false)
              const lensType = e.dataTransfer.getData('application/x-lens-type')
              if (lensType) handleAddPanel(lensType)
            }
          }}
        >
          {dropZoneDragOver && (
            <div className="pointer-events-none absolute inset-3 z-50 flex items-center justify-center rounded-xl border-2 border-dashed border-accent/60 bg-accent/5">
              <div className="flex flex-col items-center gap-1.5 text-accent">
                <Plus className="h-8 w-8" />
                <span className="text-sm font-medium">Drop to add lens</span>
              </div>
            </div>
          )}
          {panels?.length ? (
            <Responsive
              width={gridWidth}
              layouts={{ lg: layout }}
              breakpoints={{ lg: 0 }}
              cols={{ lg: COLS }}
              rowHeight={rowHeight}
              margin={MARGIN}
              containerPadding={[0, 0]}
              compactType="vertical"
              draggableHandle=".panel-drag-handle"
              onLayoutChange={handleLayoutChange}
              resizeHandles={['se']}
              useCSSTransforms
            >
              {panels.map((panel) => {
                const LensComponent = getLensComponent(panel.lens_type, lensRegistry)
                const config = panelConfigs.get(panel.id) ?? { lensType: panel.lens_type }

                return (
                  <div key={panel.id}>
                    <PanelContainer
                      panelId={`${activeWorkspaceId}-${panel.slot_name}`}
                      lensType={panel.lens_type}
                      dbPanelId={panel.id}
                      onRemove={() => handleRemovePanel(panel.id)}
                      onReplace={(newType: string) => handleReplacePanel(panel.id, newType)}
                    >
                      <LensComponent
                        panelId={`${activeWorkspaceId}-${panel.slot_name}`}
                        scope={scope}
                        config={config}
                      />
                    </PanelContainer>
                  </div>
                )
              })}
            </Responsive>
          ) : (
            <DropZone
              onDrop={handleAddPanel}
              isDragOver={dropZoneDragOver}
              setDragOver={setDropZoneDragOver}
            />
          )}
        </div>
      </main>
    </div>
  )
}
