export { CanvasEngine, STACK_BREAKPOINT, KEY_SAVE_DELAY, type CanvasEngineProps } from './CanvasEngine'
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
  type PanelArrangement,
} from './canvas-store'
export { tidyLayout } from './layout'
export { GRID_SIZE } from './panel-board'
export { canvasBounds, findFreeSpot, placeNewPanel, layoutGroup, PLACEMENT_GAP, type GroupMember } from './geometry'
export { scrollPanelIntoView } from './reveal'
