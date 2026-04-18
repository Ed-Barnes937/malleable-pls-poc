import { useEffect, useRef, useMemo, useCallback, useState } from 'react'
import { createSwapy } from 'swapy'
import {
  useWorkspacePanels,
  useWorkspaceScopes,
  useAddWorkspacePanel,
  useRemoveWorkspacePanel,
  useReplacePanelLens,
  useUpdatePanelSpan,
  useSwapPanelSpans,
  type Scope,
} from '@pls/substrate'
import { useWorkspaceStore } from './store'
import { getLensComponent, useLensRegistry } from './LensRegistry'
import { PanelContainer } from './PanelContainer'
import { Sidebar } from './Sidebar'
import { cn } from '@pls/shared-ui'
import { Plus } from 'lucide-react'

const MAX_COLS = 3
const GRID_ROWS = 6

function scopesFromDb(scopes: { scope_type: string; scope_value: string }[]): Scope {
  const scope: Scope = {}
  for (const s of scopes) {
    if (s.scope_type === 'tag') scope.courseTag = s.scope_value
    if (s.scope_type === 'recording') scope.recordingId = s.scope_value
    if (s.scope_type === 'timeframe') scope.timeframe = s.scope_value as 'week' | 'all'
  }
  return scope
}

function useMinWidth(minPx: number) {
  const [ok, setOk] = useState(() => window.innerWidth >= minPx)
  useEffect(() => {
    const check = () => setOk(window.innerWidth >= minPx)
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [minPx])
  return ok
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
        'flex min-h-[80px] items-center justify-center rounded-xl border-2 border-dashed transition-all duration-200',
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

  const { data: panels } = useWorkspacePanels(activeWorkspaceId)
  const { data: dbScopes } = useWorkspaceScopes(activeWorkspaceId)

  const addPanel = useAddWorkspacePanel()
  const removePanel = useRemoveWorkspacePanel()
  const replacePanel = useReplacePanelLens()
  const updateSpan = useUpdatePanelSpan()
  const swapSpans = useSwapPanelSpans()

  const swapyContainerRef = useRef<HTMLDivElement>(null)
  const swapyRef = useRef<ReturnType<typeof createSwapy> | null>(null)

  const [transitioning, setTransitioning] = useState(false)
  const prevWorkspaceRef = useRef(activeWorkspaceId)
  const [dropZoneDragOver, setDropZoneDragOver] = useState(false)

  const wideEnough = useMinWidth(1024)

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

  const gridRows = GRID_ROWS

  const swapSpansRef = useRef(swapSpans)
  swapSpansRef.current = swapSpans

  // Swapy: init / teardown when panels or workspace change
  useEffect(() => {
    if (!swapyContainerRef.current || !panels?.length) return

    const timer = setTimeout(() => {
      if (swapyRef.current) {
        swapyRef.current.destroy()
      }
      swapyRef.current = createSwapy(swapyContainerRef.current!, {
        animation: 'spring',
        swapMode: 'hover',
      })
      swapyRef.current.onSwap((event) => {
        swapSpansRef.current.mutate({
          panelIdA: event.draggingItem,
          panelIdB: event.swappedWithItem,
          workspaceId: activeWorkspaceId,
        })
      })
    }, 50)

    return () => {
      clearTimeout(timer)
      if (swapyRef.current) {
        swapyRef.current.destroy()
        swapyRef.current = null
      }
    }
  }, [activeWorkspaceId, panels])

  const destroySwapy = useCallback(() => {
    if (swapyRef.current) {
      swapyRef.current.destroy()
      swapyRef.current = null
    }
  }, [])

  const handleAddPanel = useCallback(
    (lensType: string) => {
      destroySwapy()
      const slotName = `slot-${Date.now()}`
      addPanel.mutate({ workspaceId: activeWorkspaceId, lensType, slotName })
    },
    [activeWorkspaceId, addPanel, destroySwapy]
  )

  const handleRemovePanel = useCallback(
    (panelId: string) => {
      destroySwapy()
      removePanel.mutate({ panelId, workspaceId: activeWorkspaceId })
    },
    [activeWorkspaceId, removePanel, destroySwapy]
  )

  const handleReplacePanel = useCallback(
    (panelId: string, newLensType: string) => {
      destroySwapy()
      replacePanel.mutate({ panelId, newLensType, workspaceId: activeWorkspaceId })
    },
    [activeWorkspaceId, replacePanel, destroySwapy]
  )

  const handleResizeStart = useCallback(() => {
    destroySwapy()
  }, [destroySwapy])

  const handleResizeEnd = useCallback(
    (panelId: string, colSpan: number, rowSpan: number) => {
      updateSpan.mutate({ panelId, colSpan, rowSpan, workspaceId: activeWorkspaceId })
    },
    [activeWorkspaceId, updateSpan]
  )

  if (!wideEnough) {
    return (
      <div className="flex h-dvh flex-col items-center justify-center gap-3 bg-surface p-8 text-center">
        <p className="text-sm text-neutral-400">This demo requires a wider viewport</p>
        <p className="text-xs text-neutral-600">Minimum 1024px — resize your browser or use a larger screen</p>
      </div>
    )
  }

  return (
    <div className="flex h-dvh overflow-hidden bg-surface">
      <Sidebar />

      <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <div
          data-panel-grid
          className={cn(
            'grid min-h-0 flex-1 gap-3 overflow-hidden p-3 transition-opacity duration-150',
            transitioning ? 'opacity-0' : 'opacity-100'
          )}
          style={{
            gridTemplateColumns: `repeat(${MAX_COLS}, 1fr)`,
            gridTemplateRows: `repeat(${gridRows}, 1fr)`,
            gridAutoFlow: 'dense',
          }}
        >
          <div ref={swapyContainerRef} className="contents">
            {panels?.map((panel) => {
              const LensComponent = getLensComponent(panel.lens_type, lensRegistry)
              const config = panelConfigs.get(panel.id) ?? { lensType: panel.lens_type }
              const cs = panel.col_span ?? 1
              const rs = panel.row_span ?? 1

              return (
                <div
                  key={panel.id}
                  data-swapy-slot={panel.slot_name}
                  className="min-h-0"
                  style={{
                    gridColumn: `span ${cs}`,
                    gridRow: `span ${rs}`,
                  }}
                >
                  <div data-swapy-item={panel.id} className="h-full min-h-0">
                    <PanelContainer
                      panelId={`${activeWorkspaceId}-${panel.slot_name}`}
                      lensType={panel.lens_type}
                      dbPanelId={panel.id}
                      colSpan={cs}
                      rowSpan={rs}
                      onRemove={() => handleRemovePanel(panel.id)}
                      onReplace={(newType: string) => handleReplacePanel(panel.id, newType)}
                      onResizeStart={handleResizeStart}
                      onResizeEnd={(newCs, newRs) => handleResizeEnd(panel.id, newCs, newRs)}
                    >
                      <LensComponent
                        panelId={`${activeWorkspaceId}-${panel.slot_name}`}
                        scope={scope}
                        config={config}
                      />
                    </PanelContainer>
                  </div>
                </div>
              )
            })}
          </div>

          <DropZone
            onDrop={handleAddPanel}
            isDragOver={dropZoneDragOver}
            setDragOver={setDropZoneDragOver}
          />
        </div>
      </main>
    </div>
  )
}
