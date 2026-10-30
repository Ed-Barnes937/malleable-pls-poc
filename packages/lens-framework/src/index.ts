export type { SplitScope } from './scope'
export type {
  Scope,
  ScopeDim,
  ScopeDeclaration,
  CourseScopeMode,
  LectureScopeMode,
  DateRange,
  LensProps,
  Moment,
  FocusedMoment,
  FocusedPlanItem,
  PlanItemRef,
  ShowMomentResult,
  ClassRef,
  FocusClassResult,
  FocusedClassLecture,
  LectureBoardRef,
} from './types'
export {
  usesScopeDim,
  splitScope,
  activeScopeDims,
  canWrite,
  weekRange,
  lookAheadRange,
  inDateRange,
} from './scope'
export type { LensLoader, LensRegistry } from './registry'
export type {
  QueryResult,
  QueryFilter,
  MutationHandle,
  TableName,
  SubstrateReader,
  SubstrateWriter,
  PanelManifest,
  WidgetGroup,
  LiveCapturePhase,
} from './substrate-contract'
export { isConflictError } from './substrate-contract'
export {
  ManifestRegistryProvider,
  LensRegistryProvider,
  useLensRegistry,
  useManifests,
  useManifest,
  getLensComponent,
  PlaceholderLens,
} from './registry'
export {
  SubstrateProvider,
  useSubstrate,
  useSubstrateMutations,
  useBoardId,
} from './substrate-context'
export {
  useMissedBlocks,
  markMissedBlocksHandled,
  missedBlockSignature,
  missedQuestion,
  refitAsk,
  movedNote,
  movedPastThisWeek,
  noFitLabel,
  type MissedBlocks,
} from './missed-blocks'
export { isLinkedToLecture, useLinkedToLecture } from './lecture'
