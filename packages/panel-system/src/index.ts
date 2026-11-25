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
export { GRID_SIZE } from './panel-board'
export { canvasBounds, findFreeSpot, placeNewPanel, PLACEMENT_GAP } from './geometry'
export { scrollPanelIntoView } from './reveal'
