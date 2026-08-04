import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import type { ReactNode } from "react";
import type {
  AutosaveQueueRecord,
  AutosaveQueueStore,
  AutosaveState,
} from "../core/types";
import type { FieldValues } from "react-hook-form";

export interface GlobalAutosaveEntitySnapshot {
  entityKey: string;
  state: AutosaveState;
  updatedAt: number;
}

export interface GlobalAutosaveStateSummary {
  entities: GlobalAutosaveEntitySnapshot[];
  trackedEntityCount: number;
  unsavedEntityKeys: string[];
  savingEntityKeys: string[];
  errorEntityKeys: string[];
  queuedEntityKeys: string[];
  queuedMutationCount: number;
  hasUnsavedChanges: boolean;
  hasActiveSaves: boolean;
  hasErrors: boolean;
}

export interface GlobalAutosaveQueueBootstrapSource<
  TFormValues extends FieldValues = FieldValues,
  TPayload = Partial<TFormValues>,
> {
  store: Pick<AutosaveQueueStore<TFormValues, TPayload>, "list">;
  resolveEntityKey: (
    record: AutosaveQueueRecord<TFormValues, TPayload>,
  ) => string | null | undefined;
}

export interface GlobalAutosaveQueueBootstrapOptions {
  clearExisting?: boolean | undefined;
}

interface GlobalAutosaveStateContextValue {
  upsertEntityState: (entityKey: string, state: AutosaveState) => void;
  removeEntityState: (entityKey: string) => void;
  bootstrapFromQueue: (
    sources: GlobalAutosaveQueueBootstrapSource[],
    options?: GlobalAutosaveQueueBootstrapOptions,
  ) => Promise<void>;
  getSummary: () => GlobalAutosaveStateSummary;
  subscribe: (listener: () => void) => () => void;
}

const GlobalAutosaveStateContext =
  createContext<GlobalAutosaveStateContextValue | null>(null);

function buildSummary(
  records: Record<string, GlobalAutosaveEntitySnapshot>,
): GlobalAutosaveStateSummary {
  const entities = Object.values(records).sort(
    (left, right) => right.updatedAt - left.updatedAt,
  );

  const unsavedEntityKeys: string[] = [];
  const savingEntityKeys: string[] = [];
  const errorEntityKeys: string[] = [];
  const queuedEntityKeys: string[] = [];

  let queuedMutationCount = 0;

  for (const entity of entities) {
    if (entity.state.hasPendingChanges) {
      unsavedEntityKeys.push(entity.entityKey);
    }

    if (entity.state.isSaving || entity.state.phase === "scheduled") {
      savingEntityKeys.push(entity.entityKey);
    }

    if (entity.state.phase === "error") {
      errorEntityKeys.push(entity.entityKey);
    }

    if (entity.state.queuedCount > 0) {
      queuedEntityKeys.push(entity.entityKey);
      queuedMutationCount += entity.state.queuedCount;
    }
  }

  return {
    entities,
    trackedEntityCount: entities.length,
    unsavedEntityKeys,
    savingEntityKeys,
    errorEntityKeys,
    queuedEntityKeys,
    queuedMutationCount,
    hasUnsavedChanges: unsavedEntityKeys.length > 0 || queuedMutationCount > 0,
    hasActiveSaves: savingEntityKeys.length > 0,
    hasErrors: errorEntityKeys.length > 0,
  };
}

function areEntitySnapshotsEqual(
  left: GlobalAutosaveEntitySnapshot | undefined,
  right: GlobalAutosaveEntitySnapshot | undefined,
) {
  if (left === right) {
    return true;
  }

  if (!left || !right) {
    return false;
  }

  return (
    left.entityKey === right.entityKey &&
    left.state.phase === right.state.phase &&
    left.state.isSaving === right.state.isSaving &&
    left.state.hasPendingChanges === right.state.hasPendingChanges &&
    left.state.queuedCount === right.state.queuedCount &&
    left.state.lastSavedAt === right.state.lastSavedAt &&
    left.state.lastAttemptAt === right.state.lastAttemptAt &&
    left.state.lastError?.message === right.state.lastError?.message
  );
}

function areRecordMapsEqual(
  left: Record<string, GlobalAutosaveEntitySnapshot>,
  right: Record<string, GlobalAutosaveEntitySnapshot>,
) {
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);

  if (leftKeys.length !== rightKeys.length) {
    return false;
  }

  for (const key of leftKeys) {
    if (!areEntitySnapshotsEqual(left[key], right[key])) {
      return false;
    }
  }

  return true;
}

function areBootstrapSourcesEqual(
  left: GlobalAutosaveQueueBootstrapSource[],
  right: GlobalAutosaveQueueBootstrapSource[],
) {
  if (left === right) {
    return true;
  }

  if (left.length !== right.length) {
    return false;
  }

  for (let index = 0; index < left.length; index += 1) {
    const currentLeft = left[index];
    const currentRight = right[index];
    if (!currentLeft || !currentRight) {
      return false;
    }

    if (
      currentLeft.store !== currentRight.store ||
      currentLeft.resolveEntityKey !== currentRight.resolveEntityKey
    ) {
      return false;
    }
  }

  return true;
}

export function GlobalAutosaveStateProvider(props: { children: ReactNode }) {
  const [records, setRecords] = useState<
    Record<string, GlobalAutosaveEntitySnapshot>
  >({});
  const summary = useMemo(() => buildSummary(records), [records]);
  const summaryRef = useRef(summary);
  const listenersRef = useRef(new Set<() => void>());

  useEffect(() => {
    summaryRef.current = summary;
    for (const listener of listenersRef.current) {
      listener();
    }
  }, [summary]);

  const upsertEntityState = useCallback(
    (entityKey: string, state: AutosaveState) => {
      setRecords((current) => {
        const existing = current[entityKey];
        const nextSnapshot: GlobalAutosaveEntitySnapshot = {
          entityKey,
          state,
          updatedAt: Date.now(),
        };

        if (areEntitySnapshotsEqual(existing, nextSnapshot)) {
          return current;
        }

        return {
          ...current,
          [entityKey]: nextSnapshot,
        };
      });
    },
    [],
  );

  const removeEntityState = useCallback((entityKey: string) => {
    setRecords((current) => {
      if (!current[entityKey]) {
        return current;
      }

      const next = { ...current };
      delete next[entityKey];
      return next;
    });
  }, []);

  const bootstrapFromQueue = useCallback(
    async (
      sources: GlobalAutosaveQueueBootstrapSource[],
      options?: GlobalAutosaveQueueBootstrapOptions,
    ) => {
      const clearExisting = options?.clearExisting ?? true;
      const queueCountsByEntityKey = new Map<string, number>();

      for (const source of sources) {
        const recordsFromSource = await source.store.list();
        for (const record of recordsFromSource) {
          const entityKey = source.resolveEntityKey(record);
          if (!entityKey) {
            continue;
          }

          queueCountsByEntityKey.set(
            entityKey,
            (queueCountsByEntityKey.get(entityKey) ?? 0) + 1,
          );
        }
      }

      setRecords((current) => {
        const next: Record<string, GlobalAutosaveEntitySnapshot> = clearExisting
          ? {}
          : { ...current };
        const now = Date.now();

        for (const [entityKey, queuedCount] of queueCountsByEntityKey) {
          const existing = current[entityKey];
          const candidate: GlobalAutosaveEntitySnapshot = {
            entityKey,
            updatedAt: now,
            state: {
              phase: "scheduled",
              isSaving: false,
              hasPendingChanges: true,
              queuedCount,
              lastSavedAt: existing?.state.lastSavedAt ?? null,
              lastAttemptAt: existing?.state.lastAttemptAt ?? null,
              lastError: existing?.state.lastError ?? null,
            },
          };

          next[entityKey] = areEntitySnapshotsEqual(existing, candidate)
            ? (existing as GlobalAutosaveEntitySnapshot)
            : candidate;
        }

        return areRecordMapsEqual(current, next) ? current : next;
      });
    },
    [],
  );

  const subscribe = useCallback((listener: () => void) => {
    listenersRef.current.add(listener);
    return () => {
      listenersRef.current.delete(listener);
    };
  }, []);

  const getSummary = useCallback(() => summaryRef.current, []);

  const value = useMemo<GlobalAutosaveStateContextValue>(() => {
    return {
      upsertEntityState,
      removeEntityState,
      bootstrapFromQueue,
      getSummary,
      subscribe,
    };
  }, [
    bootstrapFromQueue,
    getSummary,
    removeEntityState,
    subscribe,
    upsertEntityState,
  ]);

  return (
    <GlobalAutosaveStateContext.Provider value={value}>
      {props.children}
    </GlobalAutosaveStateContext.Provider>
  );
}

export function resolveEntityKeyFromMergeKey(
  mergeKey: string | undefined | { mergeKey?: string | null },
) {
  const resolvedMergeKey =
    typeof mergeKey === "string" ? mergeKey : mergeKey?.mergeKey;

  if (!resolvedMergeKey) {
    return null;
  }

  const separatorIndex = resolvedMergeKey.lastIndexOf(":");
  if (separatorIndex < 0 || separatorIndex === resolvedMergeKey.length - 1) {
    return resolvedMergeKey;
  }

  return resolvedMergeKey.slice(separatorIndex + 1);
}

export interface AutosaveRuntimeProviderProps {
  children: ReactNode;
  queueSources: GlobalAutosaveQueueBootstrapSource[];
  clearExisting?: boolean | undefined;
}

function AutosaveRuntimeBootstrap(props: {
  children: ReactNode;
  queueSources: GlobalAutosaveQueueBootstrapSource[];
  clearExisting?: boolean | undefined;
}) {
  useGlobalAutosaveQueueBootstrap(props.queueSources, {
    clearExisting: props.clearExisting,
  });

  return <>{props.children}</>;
}

export function AutosaveRuntimeProvider(props: AutosaveRuntimeProviderProps) {
  return (
    <GlobalAutosaveStateProvider>
      <AutosaveRuntimeBootstrap
        queueSources={props.queueSources}
        clearExisting={props.clearExisting}
      >
        {props.children}
      </AutosaveRuntimeBootstrap>
    </GlobalAutosaveStateProvider>
  );
}

export function useGlobalAutosaveRegistry() {
  const context = useContext(GlobalAutosaveStateContext);
  if (!context) {
    throw new Error(
      "useGlobalAutosaveRegistry must be used within GlobalAutosaveStateProvider",
    );
  }

  return {
    upsertEntityState: context.upsertEntityState,
    removeEntityState: context.removeEntityState,
    bootstrapFromQueue: context.bootstrapFromQueue,
  };
}

export function useGlobalAutosaveQueueBootstrap(
  sources: GlobalAutosaveQueueBootstrapSource[],
  options?: GlobalAutosaveQueueBootstrapOptions,
) {
  const { bootstrapFromQueue } = useGlobalAutosaveRegistry();
  const previousRef = useRef<{
    sources: GlobalAutosaveQueueBootstrapSource[];
    clearExisting: boolean;
  } | null>(null);

  useEffect(() => {
    const clearExisting = options?.clearExisting ?? true;
    const previous = previousRef.current;

    if (
      previous &&
      previous.clearExisting === clearExisting &&
      areBootstrapSourcesEqual(previous.sources, sources)
    ) {
      return;
    }

    previousRef.current = { sources, clearExisting };
    void bootstrapFromQueue(sources, options);
  }, [bootstrapFromQueue, options, sources]);
}

export function useGlobalAutosaveQuery<TSelection>(
  selector: (summary: GlobalAutosaveStateSummary) => TSelection,
  isEqual: (left: TSelection, right: TSelection) => boolean = Object.is,
): TSelection {
  const context = useContext(GlobalAutosaveStateContext);
  if (!context) {
    throw new Error(
      "useGlobalAutosaveQuery must be used within GlobalAutosaveStateProvider",
    );
  }

  const selectorRef = useRef(selector);
  selectorRef.current = selector;

  const isEqualRef = useRef(isEqual);
  isEqualRef.current = isEqual;

  const lastSummaryRef = useRef<GlobalAutosaveStateSummary | null>(null);
  const lastSelectionRef = useRef<TSelection | null>(null);
  const hasSelectionRef = useRef(false);

  const computeSelection = (summary: GlobalAutosaveStateSummary) => {
    if (hasSelectionRef.current && lastSummaryRef.current === summary) {
      return lastSelectionRef.current as TSelection;
    }

    const nextSelection = selectorRef.current(summary);
    if (!hasSelectionRef.current) {
      hasSelectionRef.current = true;
      lastSummaryRef.current = summary;
      lastSelectionRef.current = nextSelection;
      return nextSelection;
    }

    const previousSelection = lastSelectionRef.current as TSelection;
    if (!isEqualRef.current(previousSelection, nextSelection)) {
      lastSelectionRef.current = nextSelection;
    }

    lastSummaryRef.current = summary;
    return lastSelectionRef.current as TSelection;
  };

  const subscribe = (listener: () => void) => {
    let previousSelection = computeSelection(context.getSummary());
    return context.subscribe(() => {
      const nextSelection = computeSelection(context.getSummary());
      if (!isEqualRef.current(previousSelection, nextSelection)) {
        previousSelection = nextSelection;
        listener();
      }
    });
  };

  const getSnapshot = () => computeSelection(context.getSummary());
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
