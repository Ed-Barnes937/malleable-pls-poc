export { Panel, type PanelProps } from './Panel'
export { CanvasEngine, type CanvasEngineProps } from './CanvasEngine'
export { PanelChrome, type PanelChromeProps } from './PanelChrome'
export { WorkspaceBackground } from './WorkspaceBackground'
export { BackgroundPicker } from './BackgroundPicker'
export {
  useCanvasStore,
  clampDimensions,
  DEFAULT_BACKGROUND,
  DEFAULT_SIZE_CONSTRAINTS,
  type PanelItem,
  type SizeConstraints,
  type BackgroundConfig,
  type BackgroundType,
} from './canvas-store'
export { snapToGrid, GRID_SIZE } from './snap'

// Legacy exports — kept for backwards compatibility during migration
export { PanelGrid, type PanelGridProps, type PanelGridItem } from './PanelGrid'
