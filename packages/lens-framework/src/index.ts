export type { SplitScope } from './scope'
export type {
  Scope,
  ScopeDim,
  ScopeDeclaration,
  CourseScopeMode,
  RecordingScopeMode,
  DateRange,
  LensProps,
  Moment,
  FocusedMoment,
  ShowMomentResult,
  ShowMomentOptions,
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
  noFitLabel,
  type MissedBlocks,
} from './missed-blocks'
