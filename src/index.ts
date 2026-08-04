export type {
  ArrayDiffChange,
  ArrayDiffResult,
  ArrayFieldDiffHandler,
  AutosaveConfig,
  AutosaveController,
  AutosaveMetrics,
  AutosaveMergeContext,
  AutosaveMergeOptions,
  AutosaveMutationLogEntry,
  AutosaveMutationLogOptions,
  AutosavePhase,
  AutosaveQueueOptions,
  AutosaveQueueRecord,
  AutosaveQueueStore,
  AutosaveReason,
  AutosaveSaveResult,
  AutosaveSelector,
  AutosaveState,
  AutosaveStatusSnapshot,
  AutosaveTransport,
  AutosaveTransportContext,
  AutosaveTransportMeta,
  AutosaveTransportResult,
  DiffMap,
  KeyMap,
  UseRhfAutosaveOptions,
  ValidationMode,
} from "./core/types";
export { createIndexedDbQueueStore } from "./persistence/indexedDbQueue";
export {
  AutosaveMutationLog,
  AutosaveStateSummary,
} from "./components/autosaveHelpers";
export { useAutosaveBlocker } from "./hooks/useAutosaveBlocker";
export {
  createDraftGuardian,
  createDraftSnapshot,
  createLocalStorageDraftStorage,
  normalizeAutosaveError,
  shouldWarnOnLeave,
  useAutosaveFeedback,
  useAutosaveFlow,
  useAutosaveWorkflow,
  useDraftGuard,
} from "./hooks/draftGuardian";
export type {
  AutosaveFeedbackHandlers,
  DraftGuardDecisionContext,
  DraftGuardianController,
  DraftGuardianFormAdapter,
  DraftGuardianOptions,
  DraftGuardianStorage,
  UseAutosaveWorkflowOptions,
  UseAutosaveWorkflowResult,
  UseDraftGuardOptions,
} from "./hooks/draftGuardian";
export {
  AutosaveRuntimeProvider,
  GlobalAutosaveStateProvider,
  resolveEntityKeyFromMergeKey,
  useGlobalAutosaveQueueBootstrap,
  useGlobalAutosaveQuery,
  useGlobalAutosaveRegistry,
} from "./hooks/useGlobalAutosaveState";
export type { AutosaveRuntimeProviderProps } from "./hooks/useGlobalAutosaveState";
export {
  autosaveLogAdded,
  autosaveLogsCleared,
  autosaveLogsReducer,
} from "./hooks/autosaveLogs";
export type { AutosaveLogsState } from "./hooks/autosaveLogs";
export type {
  GlobalAutosaveEntitySnapshot,
  GlobalAutosaveQueueBootstrapOptions,
  GlobalAutosaveQueueBootstrapSource,
  GlobalAutosaveStateSummary,
} from "./hooks/useGlobalAutosaveState";
export { useAutosaveSelector } from "./hooks/useAutosaveSelector";
export { useBeforeUnload } from "./hooks/useBeforeUnload";
export { useRhfAutosave } from "./hooks/useRhfAutosave";
export { composeTransports } from "./transports/compositeTransport";
export { fetchTransport } from "./transports/fetchTransport";
export type {
  PartitionRouteContext,
  PartitionTransportOptions,
  PartitionTransportRoute,
  PartitionTransportRouteResult,
} from "./transports/partitionedTransport";
export { createPartitionedTransport } from "./transports/partitionedTransport";
export { rtkQueryTransport } from "./transports/rtkQueryTransport";
export { withRetry } from "./transports/withRetry";
export { buildDirtyTree, selectDirtyPayload } from "./utils/dirty";
export {
  applyPaths,
  cloneDeep,
  deepMerge,
  diffArraysBy,
  findChangedPaths,
  isDeepEqual,
} from "./utils/deep";
export {
  deleteByPath,
  flattenObject,
  getAllPaths,
  getByPath,
  hasPath,
  joinPath,
  mapNestedKeys,
  normalizePaths,
  omitPaths,
  parsePath,
  pickPaths,
  setByPath,
  unflattenObject,
} from "./utils/path";
