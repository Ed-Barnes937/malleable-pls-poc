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
export { clampToCanvas, resizeDimensions, anchoredPosition, findFreeSpot, PLACEMENT_GAP } from './geometry'
export { scrollPanelIntoView } from './reveal'
