import { useMemo, useCallback, useState, useRef, useEffect, type ReactNode } from 'react'
import { Responsive, useContainerWidth, type LayoutItem, type DropConfig } from 'react-grid-layout'
import { cn } from '@pls/shared-ui'
import { Plus } from 'lucide-react'

import 'react-grid-layout/css/styles.css'

export interface PanelGridItem {
  id: string
  x: number
  y: number
  w: number
  h: number
}

export interface PanelGridProps {
  items: PanelGridItem[]
  cols?: number
  rowHeight?: number
  margin?: [number, number]
  onLayoutChange?: (layouts: PanelGridItem[]) => void
  onItemDrop?: (data: string, position: { x: number; y: number; w: number; h: number }) => void
  dropMimeType?: string
  renderItem: (id: string) => ReactNode
  className?: string
  transitioning?: boolean
  showGridBackground?: boolean
}

const DROPPING_ITEM = { i: '__dropping__', w: 1, h: 2 }

function GridBackground({
  gridWidth,
  cols,
  rowHeight,
  margin,
  minRows,
}: {
  gridWidth: number
  cols: number
  rowHeight: number
  margin: [number, number]
  minRows: number
}) {
  const colWidth = (gridWidth - margin[0] * (cols - 1)) / cols
  const bgRef = useRef<HTMLDivElement>(null)
  const [rows, setRows] = useState(minRows)

  useEffect(() => {
    const el = bgRef.current?.parentElement
    if (!el) return
    const viewportRows = Math.ceil(el.clientHeight / (rowHeight + margin[1])) + 1
    setRows(Math.max(minRows, viewportRows))
  }, [minRows, rowHeight, margin])

  const cells = useMemo(() => {
    if (colWidth <= 0 || gridWidth <= 0) return null
    const result = []
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        result.push(
          <div
            key={`${col}-${row}`}
            className="absolute rounded-lg border border-dashed border-border-subtle/40"
            style={{
              left: col * (colWidth + margin[0]),
              top: row * (rowHeight + margin[1]),
              width: colWidth,
              height: rowHeight,
            }}
          />
        )
      }
    }
    return result
  }, [cols, rows, colWidth, gridWidth, rowHeight, margin])

  if (!cells) return null

  return (
    <div
      ref={bgRef}
      className="pointer-events-none absolute top-3 right-3 left-3"
      style={{ height: rows * (rowHeight + margin[1]) }}
    >
      {cells}
    </div>
  )
}

function DropZone({
  onDrop,
  isDragOver,
  setDragOver,
  dropMimeType,
}: {
  onDrop: (data: string) => void
  isDragOver: boolean
  setDragOver: (v: boolean) => void
  dropMimeType: string
}) {
  return (
    <div
      className={cn(
        'flex h-full items-center justify-center rounded-xl border-2 border-dashed transition-all duration-200',
        isDragOver
          ? 'border-accent/60 bg-accent/5 text-accent'
          : 'border-border-subtle text-neutral-700 hover:border-border hover:text-neutral-600'
      )}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes(dropMimeType)) {
          e.preventDefault()
          e.dataTransfer.dropEffect = 'copy'
          setDragOver(true)
        }
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        setDragOver(false)
        const data = e.dataTransfer.getData(dropMimeType)
        if (data) onDrop(data)
      }}
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

export function PanelGrid({
  items,
  cols = 3,
  rowHeight = 80,
  margin = [12, 12],
  onLayoutChange,
  onItemDrop,
  dropMimeType = 'application/x-lens-type',
  renderItem,
  className,
  transitioning = false,
  showGridBackground = false,
}: PanelGridProps) {
  const { width: gridWidth, containerRef } = useContainerWidth({ initialWidth: 1200 })
  const [emptyDragOver, setEmptyDragOver] = useState(false)

  const layout = useMemo<LayoutItem[]>(() => {
    return items.map((item, idx) => ({
      i: item.id,
      x: Number.isFinite(item.x) ? item.x : (idx % cols),
      y: Number.isFinite(item.y) ? item.y : Math.floor(idx / cols) * 2,
      w: Number.isFinite(item.w) && item.w > 0 ? item.w : 1,
      h: Number.isFinite(item.h) && item.h > 0 ? item.h : 2,
      minW: 1,
      minH: 1,
      maxW: cols,
    }))
  }, [items, cols])

  const handleLayoutChange = useCallback(
    (currentLayout: LayoutItem[]) => {
      if (!items.length || !onLayoutChange) return
      const changed = currentLayout.some((layoutItem) => {
        const item = items.find((i) => i.id === layoutItem.i)
        if (!item) return false
        return item.x !== layoutItem.x || item.y !== layoutItem.y ||
               item.w !== layoutItem.w || item.h !== layoutItem.h
      })
      if (!changed) return
      onLayoutChange(
        currentLayout
          .filter((layoutItem) => items.some((i) => i.id === layoutItem.i))
          .map((layoutItem) => ({ id: layoutItem.i, x: layoutItem.x, y: layoutItem.y, w: layoutItem.w, h: layoutItem.h }))
      )
    },
    [items, onLayoutChange]
  )

  const handleGridDrop = useCallback(
    (_layout: LayoutItem[], item: LayoutItem, e: DragEvent) => {
      if (!onItemDrop) return
      const data = e.dataTransfer?.getData(dropMimeType)
      if (data) {
        onItemDrop(data, { x: item.x, y: item.y, w: item.w, h: item.h })
      }
    },
    [onItemDrop, dropMimeType]
  )

  const dropConfig = useMemo<DropConfig>(() => ({
    enabled: !!onItemDrop,
    defaultItem: { w: DROPPING_ITEM.w, h: DROPPING_ITEM.h },
  }), [onItemDrop])

  const handleEmptyDrop = useCallback(
    (data: string) => {
      if (onItemDrop) onItemDrop(data, { x: 0, y: 0, w: 1, h: 2 })
    },
    [onItemDrop]
  )

  const contentRows = useMemo(() => {
    if (!items.length) return 0
    return items.reduce((max, item) => Math.max(max, item.y + item.h), 0)
  }, [items])

  return (
    <div
      ref={containerRef}
      className={cn(
        'relative min-h-full overflow-y-auto p-3 transition-opacity duration-150',
        transitioning ? 'opacity-0' : 'opacity-100',
        className
      )}
    >
      {showGridBackground && items.length > 0 && (
        <GridBackground
          gridWidth={gridWidth}
          cols={cols}
          rowHeight={rowHeight}
          margin={margin}
          minRows={contentRows + 4}
        />
      )}
      {items.length > 0 ? (
        <Responsive
          width={gridWidth}
          layouts={{ lg: layout }}
          breakpoints={{ lg: 0 }}
          cols={{ lg: cols }}
          rowHeight={rowHeight}
          margin={margin}
          containerPadding={[0, 0]}
          compactType="vertical"
          draggableHandle=".panel-drag-handle"
          onLayoutChange={handleLayoutChange}
          onDrop={handleGridDrop}
          dropConfig={dropConfig}
          droppingItem={DROPPING_ITEM}
          resizeHandles={['se']}
          useCSSTransforms
        >
          {items.map((item) => (
            <div key={item.id}>
              {renderItem(item.id)}
            </div>
          ))}
        </Responsive>
      ) : (
        <DropZone
          onDrop={handleEmptyDrop}
          isDragOver={emptyDragOver}
          setDragOver={setEmptyDragOver}
          dropMimeType={dropMimeType}
        />
      )}
    </div>
  )
}
