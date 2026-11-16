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
  ReviewMoment,
  ReviewRun,
  LensNotice,
  FocusedPlanItem,
  PlanItemRef,
  ShowMomentResult,
  ClassRef,
  FocusClassResult,
  ClassFocusBoard,
  UndoFocusClassResult,
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
  UploadResourceFile,
  PanelManifest,
  WidgetGroup,
  LiveCapturePhase,
} from './substrate-contract'
export { isConflictError, isNotFoundError } from './substrate-contract'
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
  ANSWERED_STORAGE_KEY,
  missedBlockSignature,
  missedQuestion,
  refitAsk,
  noFitNote,
  noFitLabel,
  type MissedBlocks,
} from './missed-blocks'
export { isLinkedToLecture, useLinkedToLecture } from './lecture'
export { undoNotice, confirmWithUndo, type UndoableChange } from './undo-toast'
export { DRAFT_ACCEPTED_KEY, keptMessage, refitUndoCopy, useDraftUndo, type DraftUndo } from './draft-undo'
export { momentMarksKey, useMomentMarks } from './sorted'
export { requestHelpMePlan, takeHelpMePlanRequest, useHelpMePlanRequest, PLAN_REQUEST_TTL_MS } from './plan-request'
