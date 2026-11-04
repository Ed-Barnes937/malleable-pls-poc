export { CanvasEngine, STACK_BREAKPOINT, type CanvasEngineProps } from './CanvasEngine'
export { PanelChrome, type PanelChromeProps } from './PanelChrome'
export { WorkspaceBackground } from './WorkspaceBackground'
export { BackgroundPicker } from './BackgroundPicker'
export {
  useCanvasStore,
  clampDimensions,
  persistableLayout,
  DEFAULT_BACKGROUND,
  DEFAULT_SIZE_CONSTRAINTS,
  type PanelItem,
  type SizeConstraints,
  type BackgroundConfig,
  type BackgroundType,
} from './canvas-store'
export { snapToGrid, GRID_SIZE } from './snap'
export { clampToCanvas, resizeDimensions, anchoredPosition, findFreeSpot, placeNewPanel, PLACEMENT_GAP } from './geometry'
export { scrollPanelIntoView } from './reveal'
// PROTOTYPE p5 (proto/p5-canvas only, never merged)
export { useP5Store, tidyLayout, overlapReport, P5_VARIANTS, type P5Variant } from './proto-p5'
