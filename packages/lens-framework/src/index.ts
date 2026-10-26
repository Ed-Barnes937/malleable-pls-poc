export type {
  Scope,
  ScopeDim,
  ScopeDeclaration,
  CourseScopeMode,
  RecordingScopeMode,
  DateRange,
  LensProps,
} from './types'
export {
  usesScopeDim,
  narrowScope,
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
} from './substrate-contract'
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
} from './substrate-context'
