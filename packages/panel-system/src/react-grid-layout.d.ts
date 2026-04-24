declare module 'react-grid-layout' {
  import type { ComponentType, ReactNode, CSSProperties, RefObject } from 'react'

  export interface LayoutItem {
    i: string
    x: number
    y: number
    w: number
    h: number
    minW?: number
    maxW?: number
    minH?: number
    maxH?: number
    static?: boolean
    isDraggable?: boolean
    isResizable?: boolean
  }

  export interface DropConfig {
    enabled?: boolean
    defaultItem?: { w: number; h: number }
    onDragOver?: (e: DragEvent) => { w?: number; h?: number } | false | undefined
  }

  export interface ReactGridLayoutProps {
    layout?: LayoutItem[]
    cols?: number
    rowHeight?: number
    width: number
    margin?: [number, number]
    containerPadding?: [number, number]
    maxRows?: number
    compactType?: 'vertical' | 'horizontal' | null
    draggableHandle?: string
    draggableCancel?: string
    resizeHandles?: ('s' | 'w' | 'e' | 'n' | 'sw' | 'nw' | 'se' | 'ne')[]
    onLayoutChange?: (layout: LayoutItem[]) => void
    onDrop?: (layout: LayoutItem[], item: LayoutItem, e: DragEvent) => void
    onDropDragOver?: (e: DragEvent) => { w?: number; h?: number } | false | undefined
    dropConfig?: DropConfig
    droppingItem?: { i: string; w: number; h: number }
    useCSSTransforms?: boolean
    preventCollision?: boolean
    className?: string
    style?: CSSProperties
    children?: ReactNode
  }

  export interface ResponsiveProps extends Omit<ReactGridLayoutProps, 'layout' | 'cols'> {
    layouts?: Record<string, LayoutItem[]>
    breakpoints?: Record<string, number>
    cols?: Record<string, number>
    onLayoutChange?: (currentLayout: LayoutItem[], allLayouts: Record<string, LayoutItem[]>) => void
  }

  export interface UseContainerWidthOptions {
    measureBeforeMount?: boolean
    initialWidth?: number
  }

  export interface UseContainerWidthResult {
    width: number
    mounted: boolean
    containerRef: RefObject<HTMLDivElement | null>
  }

  export const Responsive: ComponentType<ResponsiveProps>
  export const ResponsiveGridLayout: ComponentType<ResponsiveProps>
  export function useContainerWidth(options?: UseContainerWidthOptions): UseContainerWidthResult

  const ReactGridLayout: ComponentType<ReactGridLayoutProps>
  export default ReactGridLayout
}
