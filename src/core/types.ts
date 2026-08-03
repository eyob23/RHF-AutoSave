import type { FieldValues, UseFormReturn } from "react-hook-form";

export type AutosaveReason = "debounce" | "flush" | "force" | "replay";

export type AutosavePhase = "idle" | "scheduled" | "saving" | "saved" | "error";

export interface AutosaveMetrics {
  totalSaves: number;
  successfulSaves: number;
  failedSaves: number;
  averageSaveTimeMs: number;
  lastSaveDurationMs: number | null;
}

export interface AutosaveState {
  phase: AutosavePhase;
  isSaving: boolean;
  hasPendingChanges: boolean;
  queuedCount: number;
  lastSavedAt: number | null;
  lastAttemptAt: number | null;
  lastError: Error | null;
}

export interface AutosaveMutationLogEntry<TPayload = unknown> {
  id: string;
  timestamp: number;
  level: "info" | "success" | "error";
  message: string;
  retryCount: number;
  entityId?: string | undefined;
  reason?: AutosaveReason;
  changedPaths?: string[];
  payload?: TPayload;
  merged?: AutosaveMergeLog<TPayload>;
}

export interface AutosaveMergeStateSnapshot<TPayload> {
  reason: AutosaveReason;
  changedPaths: string[];
  payload: TPayload;
}

export interface AutosaveMergeLog<TPayload> {
  key: string;
  source: "pending" | "queued";
  previous: AutosaveMergeStateSnapshot<TPayload>;
  next: AutosaveMergeStateSnapshot<TPayload>;
}

export interface AutosaveStatusSnapshot extends AutosaveState {
  metrics: AutosaveMetrics;
  mutationLog: AutosaveMutationLogEntry[];
}

export interface AutosaveTransportMeta {
  reason: AutosaveReason;
  saveId: number;
  queued: boolean;
}

export interface AutosaveTransportContext<
  TFormValues extends FieldValues,
  TPayload = Partial<TFormValues>,
> {
  values: TFormValues;
  payload: TPayload;
  changedPaths: string[];
  dirtyFields: Record<string, unknown>;
  baseline: TFormValues;
  signal: AbortSignal;
  meta: AutosaveTransportMeta;
}

export interface AutosaveTransportResult<TResult = unknown> {
  ok: boolean;
  data?: TResult;
  error?: unknown;
  serverValues?: unknown;
}

export type AutosaveTransport<
  TFormValues extends FieldValues,
  TPayload = Partial<TFormValues>,
  TResult = unknown,
> = (
  context: AutosaveTransportContext<TFormValues, TPayload>,
) => Promise<AutosaveTransportResult<TResult>>;

export type KeyMapTransform = string | [string, (value: unknown) => unknown];

export type KeyMap = Record<string, KeyMapTransform>;

export interface ArrayDiffChange<TItem> {
  before: TItem;
  after: TItem;
}

export interface ArrayDiffResult<TItem> {
  added: TItem[];
  removed: TItem[];
  modified: Array<ArrayDiffChange<TItem>>;
  hasChanges: boolean;
}

export interface ArrayFieldDiffHandler<
  TFormValues extends FieldValues,
  TItem = unknown,
  TPayload = Partial<TFormValues>,
> {
  idOf: (item: TItem) => string | number;
  onAdd?: (item: TItem, context: AutosaveTransportContext<TFormValues, TPayload>) => Promise<void> | void;
  onRemove?: (item: TItem, context: AutosaveTransportContext<TFormValues, TPayload>) => Promise<void> | void;
  onChange?: (
    item: ArrayDiffChange<TItem>,
    context: AutosaveTransportContext<TFormValues, TPayload>,
  ) => Promise<void> | void;
  excludeFromPayload?: boolean;
}

export type DiffMap<TFormValues extends FieldValues> = Record<
  string,
  ArrayFieldDiffHandler<TFormValues, unknown, unknown>
>;

export type ValidationMode = "none" | "payload" | "all";

export interface AutosaveConfig {
  debounceMs: number;
  maxRetries: number;
  retryDelayMs: number;
  debug: boolean;
  enableMetrics: boolean;
}

export interface AutosaveShouldSaveContext<
  TFormValues extends FieldValues,
  TPayload,
> {
  values: TFormValues;
  payload: TPayload;
  changedPaths: string[];
  hasPendingChanges: boolean;
  isValid: boolean | null;
  reason: AutosaveReason;
}

export interface AutosaveUndoOptions {
  enabled?: boolean;
  limit?: number;
  captureDebounceMs?: number;
  keyboardShortcuts?: boolean;
}

export interface AutosaveQueueRecord<
  TFormValues extends FieldValues,
  TPayload = Partial<TFormValues>,
> {
  id: string;
  createdAt: number;
  mergeKey?: string;
  retryCount?: number;
  values: TFormValues;
  payload: TPayload;
  changedPaths: string[];
}

export interface AutosaveMergeContext<
  TFormValues extends FieldValues,
  TPayload,
> {
  values: TFormValues;
  payload: TPayload;
  changedPaths: string[];
  reason: AutosaveReason;
}

export interface AutosaveMergeOptions<
  TFormValues extends FieldValues,
  TPayload,
> {
  enabled?: boolean;
  getKey: (context: AutosaveMergeContext<TFormValues, TPayload>) => string | null;
  changedPathsStrategy?: "union" | "latest";
}

export interface AutosaveQueueStore<
  TFormValues extends FieldValues,
  TPayload = Partial<TFormValues>,
> {
  enqueue: (record: AutosaveQueueRecord<TFormValues, TPayload>) => Promise<void>;
  list: () => Promise<Array<AutosaveQueueRecord<TFormValues, TPayload>>>;
  remove: (id: string) => Promise<void>;
  clear: () => Promise<void>;
  count: () => Promise<number>;
}

export interface AutosaveQueueOptions<
  TFormValues extends FieldValues,
  TPayload = Partial<TFormValues>,
> {
  enabled?: boolean;
  persist?: boolean;
  retryOnReconnect?: boolean;
  store?: AutosaveQueueStore<TFormValues, TPayload>;
}

export interface AutosaveMutationLogOptions<TPayload = unknown> {
  target?: "memory" | "external" | "both";
  maxEntries?: number;
  onLog?: (entry: AutosaveMutationLogEntry<TPayload>) => void;
}

export interface UseRhfAutosaveOptions<
  TFormValues extends FieldValues,
  TPayload = Partial<TFormValues>,
  TResult = unknown,
> {
  form: UseFormReturn<TFormValues>;
  transport: AutosaveTransport<TFormValues, TPayload, TResult>;
  config?: Partial<AutosaveConfig>;
  validateBeforeSave?: ValidationMode;
  shouldSave?: (
    context: AutosaveShouldSaveContext<TFormValues, TPayload>,
  ) => boolean | Promise<boolean>;
  selectPayload?: (
    values: TFormValues,
    changedPaths: string[],
  ) => TPayload;
  keyMap?: KeyMap;
  diffMap?: DiffMap<TFormValues>;
  autoHydrate?: boolean;
  undo?: AutosaveUndoOptions;
  queue?: AutosaveQueueOptions<TFormValues, TPayload>;
  merge?: AutosaveMergeOptions<TFormValues, TPayload>;
  mutationLog?: AutosaveMutationLogOptions<TPayload>;
  onSaved?: (result: AutosaveTransportResult<TResult>, payload: TPayload) => void;
  onError?: (error: Error, payload: TPayload | null) => void;
  onStatusChange?: (status: AutosaveStatusSnapshot) => void;
}

export interface AutosaveSaveResult<TResult = unknown> extends AutosaveTransportResult<TResult> {
  skipped?: boolean;
  queued?: boolean;
}

export interface AutosaveController<
  TFormValues extends FieldValues,
  TPayload = Partial<TFormValues>,
  TResult = unknown,
> {
  phase: AutosavePhase;
  isSaving: boolean;
  hasPendingChanges: boolean;
  queuedCount: number;
  lastSavedAt: number | null;
  lastAttemptAt: number | null;
  lastError: Error | null;
  flush: () => Promise<AutosaveSaveResult<TResult>>;
  forceSave: () => Promise<AutosaveSaveResult<TResult>>;
  abort: () => void;
  hydrateFromServer: (values: TFormValues) => void;
  replayQueuedSaves: () => Promise<void>;
  undo: () => void;
  redo: () => void;
  undoLastSave: () => void;
  canUndo: boolean;
  canRedo: boolean;
  getMetrics: () => AutosaveMetrics;
  getMutationLog: () => AutosaveMutationLogEntry<TPayload>[];
  getPendingPayload: () => TPayload | null;
  getState: () => AutosaveStatusSnapshot;
  subscribe: (listener: () => void) => () => void;
}

export type AutosaveSelector<TSelection> = (state: AutosaveStatusSnapshot) => TSelection;