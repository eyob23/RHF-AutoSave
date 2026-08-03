import { useEffect, useMemo, useRef } from "react";
import type { FieldValues, Path, UseFormReturn } from "react-hook-form";
import { createAutosaveStore } from "../core/store";
import type {
  ArrayFieldDiffHandler,
  AutosaveConfig,
  AutosaveController,
  AutosaveMetrics,
  AutosaveMutationLogEntry,
  AutosaveQueueRecord,
  AutosaveSaveResult,
  AutosaveState,
  AutosaveStatusSnapshot,
  AutosaveTransportContext,
  UseRhfAutosaveOptions,
} from "../core/types";
import { buildDirtyTree, selectDirtyPayload } from "../utils/dirty";
import { applyPaths, cloneDeep, diffArraysBy, findChangedPaths, isDeepEqual } from "../utils/deep";
import { getByPath, mapNestedKeys, normalizePaths, omitPaths } from "../utils/path";

const defaultConfig: AutosaveConfig = {
  debounceMs: 800,
  maxRetries: 0,
  retryDelayMs: 400,
  debug: false,
  enableMetrics: true,
};

const defaultState: AutosaveState = {
  phase: "idle",
  isSaving: false,
  hasPendingChanges: false,
  queuedCount: 0,
  lastSavedAt: null,
  lastAttemptAt: null,
  lastError: null,
};

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

function createMetrics(): AutosaveMetrics {
  return {
    totalSaves: 0,
    successfulSaves: 0,
    failedSaves: 0,
    averageSaveTimeMs: 0,
    lastSaveDurationMs: null,
  };
}

function createRecordId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function createLogId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeLogEntryLimit(value: number | undefined) {
  if (value === undefined || !Number.isFinite(value)) {
    return 20;
  }

  return Math.max(1, Math.floor(value));
}

function updateAverage(currentAverage: number, previousCount: number, nextValue: number) {
  if (previousCount <= 0) {
    return nextValue;
  }
  return (currentAverage * previousCount + nextValue) / (previousCount + 1);
}

function mergeChangedPaths(currentPaths: string[], nextPaths: string[], strategy: "union" | "latest") {
  if (strategy === "latest") {
    return normalizePaths(nextPaths);
  }

  return normalizePaths([...currentPaths, ...nextPaths]);
}

function pickSaveReason(
  currentReason: "debounce" | "flush" | "force" | "replay",
  nextReason: "debounce" | "flush" | "force" | "replay",
) {
  const priority: Record<"debounce" | "flush" | "force" | "replay", number> = {
    debounce: 1,
    replay: 2,
    flush: 3,
    force: 4,
  };

  return priority[nextReason] >= priority[currentReason] ? nextReason : currentReason;
}

function extractEntityIdFromMergeKey(mergeKey: string | null | undefined) {
  if (!mergeKey) {
    return undefined;
  }

  const separatorIndex = mergeKey.lastIndexOf(":");
  if (separatorIndex < 0 || separatorIndex === mergeKey.length - 1) {
    return mergeKey;
  }

  return mergeKey.slice(separatorIndex + 1);
}

async function runArrayDiffHandlers<TFormValues extends FieldValues, TPayload>(
  diffMap: UseRhfAutosaveOptions<TFormValues, TPayload>["diffMap"],
  context: AutosaveTransportContext<TFormValues, TPayload>,
): Promise<string[]> {
  if (!diffMap) {
    return [];
  }

  const handledPaths: string[] = [];
  for (const [path, handler] of Object.entries(diffMap)) {
    const before = (getByPath(context.baseline, path) ?? []) as unknown[];
    const after = (getByPath(context.values, path) ?? []) as unknown[];
    const diff = diffArraysBy(before, after, handler.idOf as (item: unknown) => string | number);
    if (!diff.hasChanges) {
      continue;
    }

    for (const item of diff.added) {
      await handler.onAdd?.(item, context);
    }

    for (const item of diff.removed) {
      await handler.onRemove?.(item, context);
    }

    for (const item of diff.modified) {
      await handler.onChange?.(item, context);
    }

    const hasCustomArrayHandlers = Boolean(handler.onAdd || handler.onRemove || handler.onChange);
    if (handler.excludeFromPayload ?? hasCustomArrayHandlers) {
      handledPaths.push(path);
    }
  }

  return handledPaths;
}

function setFormValues<TFormValues extends FieldValues>(
  form: UseFormReturn<TFormValues>,
  values: TFormValues,
) {
  form.reset(values, {
    keepDefaultValues: false,
    keepDirty: false,
    keepErrors: true,
    keepTouched: true,
    keepIsSubmitted: true,
    keepSubmitCount: true,
  });
}

export function useRhfAutosave<
  TFormValues extends FieldValues,
  TPayload = Partial<TFormValues>,
  TResult = unknown,
>(
  options: UseRhfAutosaveOptions<TFormValues, TPayload, TResult>,
): AutosaveController<TFormValues, TPayload, TResult> {
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const formRef = useRef(options.form);
  formRef.current = options.form;

  const configRef = useRef({ ...defaultConfig, ...options.config });
  configRef.current = { ...defaultConfig, ...options.config };

  const baselineRef = useRef(cloneDeep(options.form.getValues()));
  const latestValuesRef = useRef(options.form.getValues());
  const modifiedPathsRef = useRef(new Set<string>());
  const saveTimerRef = useRef<number | null>(null);
  const saveCounterRef = useRef(0);
  const abortControllerRef = useRef<AbortController | null>(null);
  const isDrainingSaveQueueRef = useRef(false);
  const pendingSaveQueueRef = useRef<
    Array<{
      reason: "debounce" | "flush" | "force" | "replay";
      values: TFormValues;
      payload: TPayload | undefined;
      changedPaths: string[];
      queuedRecordId: string | undefined;
      queuedRetryCount: number;
      mergeKey: string | undefined;
      resolves: Array<(result: AutosaveSaveResult<TResult>) => void>;
    }>
  >([]);
  const mountedRef = useRef(true);
  const historyTimerRef = useRef<number | null>(null);
  const internalMutationRef = useRef(false);
  const metricsRef = useRef(createMetrics());
  const historyRef = useRef<{ past: TFormValues[]; future: TFormValues[] }>({
    past: [cloneDeep(options.form.getValues())],
    future: [],
  });
  const mutationLogRef = useRef<AutosaveMutationLogEntry<TPayload>[]>([]);

  const store = useMemo(
    () =>
      createAutosaveStore({
        ...defaultState,
        metrics: createMetrics(),
        mutationLog: [],
      }),
    [],
  );

  const appendMutationLog = (entry: Omit<AutosaveMutationLogEntry<TPayload>, "id" | "timestamp">) => {
    const nextEntry: AutosaveMutationLogEntry<TPayload> = {
      id: createLogId(),
      timestamp: Date.now(),
      ...entry,
    };

    const logTarget = optionsRef.current.mutationLog?.target ?? "memory";
    const shouldWriteToMemory = logTarget === "memory" || logTarget === "both";
    const shouldWriteToExternal = logTarget === "external" || logTarget === "both";
    const logLimit = normalizeLogEntryLimit(optionsRef.current.mutationLog?.maxEntries);

    if (shouldWriteToMemory) {
      mutationLogRef.current = [nextEntry, ...mutationLogRef.current].slice(0, logLimit);
    }

    if (shouldWriteToExternal && optionsRef.current.mutationLog?.onLog) {
      try {
        optionsRef.current.mutationLog.onLog(nextEntry);
      } catch {
        // Ignore external log sink failures so autosave cannot be blocked by instrumentation.
      }
    }

    updateStore({ mutationLog: shouldWriteToMemory ? [...mutationLogRef.current] : [] });
  };

  const updateStore = (update: Partial<AutosaveStatusSnapshot>) => {
    store.setState((current) => ({
      ...current,
      ...update,
      metrics: update.metrics ?? { ...metricsRef.current },
    }));
    optionsRef.current.onStatusChange?.(store.getState());
  };

  const refreshQueuedCount = async () => {
    if (!optionsRef.current.queue?.enabled || !optionsRef.current.queue.store) {
      updateStore({ queuedCount: 0 });
      return;
    }

    const queuedCount = await optionsRef.current.queue.store.count();
    updateStore({ queuedCount });
  };

  const recomputeModifiedPaths = () => {
    const next = new Set(findChangedPaths(baselineRef.current, latestValuesRef.current));
    modifiedPathsRef.current = next;
    updateStore({
      hasPendingChanges: next.size > 0,
      phase: next.size > 0 && !store.getState().isSaving ? "scheduled" : store.getState().phase,
    });
  };

  const clearSaveTimer = () => {
    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
  };

  const scheduleHistoryCapture = () => {
    if (!optionsRef.current.undo?.enabled) {
      return;
    }

    if (historyTimerRef.current !== null) {
      window.clearTimeout(historyTimerRef.current);
    }

    historyTimerRef.current = window.setTimeout(() => {
      const currentValues = cloneDeep(latestValuesRef.current);
      const lastSnapshot = historyRef.current.past[historyRef.current.past.length - 1];
      if (lastSnapshot && isDeepEqual(lastSnapshot, currentValues)) {
        return;
      }

      historyRef.current.past.push(currentValues);
      historyRef.current.future = [];

      const limit = optionsRef.current.undo?.limit ?? 50;
      if (historyRef.current.past.length > limit) {
        historyRef.current.past.shift();
      }
    }, optionsRef.current.undo?.captureDebounceMs ?? 250);
  };

  const getChangedPaths = () => normalizePaths([...modifiedPathsRef.current]);

  const buildPayload = (values: TFormValues, changedPaths: string[]): TPayload => {
    const selectedPayload = optionsRef.current.selectPayload
      ? optionsRef.current.selectPayload(values, changedPaths)
      : (selectDirtyPayload(values, changedPaths) as TPayload);

    if (!optionsRef.current.keyMap) {
      return selectedPayload;
    }

    return mapNestedKeys(selectedPayload, optionsRef.current.keyMap) as TPayload;
  };

  const validate = async (changedPaths: string[]) => {
    const mode = optionsRef.current.validateBeforeSave ?? "none";
    if (mode === "none") {
      return null;
    }

    if (mode === "all") {
      return formRef.current.trigger();
    }

    return formRef.current.trigger(changedPaths as Path<TFormValues>[]);
  };

  const getMergeStrategy = () => optionsRef.current.merge?.changedPathsStrategy ?? "union";

  const getMergeKey = (
    reason: "debounce" | "flush" | "force" | "replay",
    values: TFormValues,
    payload: TPayload,
    changedPaths: string[],
  ) => {
    const merge = optionsRef.current.merge;
    if (!merge?.enabled) {
      return null;
    }

    return merge.getKey({
      values,
      payload,
      changedPaths,
      reason,
    });
  };

  const queueFailedSave = async (
    record: AutosaveQueueRecord<TFormValues, TPayload>,
    mergeKey: string | null,
    reason: "debounce" | "flush" | "force" | "replay",
  ) => {
    const queue = optionsRef.current.queue;
    if (!queue?.enabled || !queue.store) {
      return false;
    }

    const nextRecord = {
      ...record,
      ...(mergeKey ? { mergeKey } : {}),
    };

    try {
      if (mergeKey) {
        const existingRecords = await queue.store.list();
        const existing = existingRecords.find((queued) => queued.mergeKey === mergeKey);
        if (existing) {
          const strategy = getMergeStrategy();
          const mergedChangedPaths = mergeChangedPaths(existing.changedPaths, nextRecord.changedPaths, strategy);
          const mergedRecord = {
            ...nextRecord,
            id: existing.id,
            createdAt: existing.createdAt,
            retryCount: Math.max(existing.retryCount ?? 0, nextRecord.retryCount ?? 0),
            changedPaths: mergedChangedPaths,
          };

          // Atomic overwrite: keep the same record id and replace via put.
          await queue.store.enqueue(mergedRecord);
          await refreshQueuedCount();

          appendMutationLog({
            level: "info",
            message: "Merged autosave request (queued)",
            retryCount: 0,
            ...(extractEntityIdFromMergeKey(mergeKey) !== undefined
              ? { entityId: extractEntityIdFromMergeKey(mergeKey) }
              : {}),
            reason,
            changedPaths: [...mergedChangedPaths],
            payload: cloneDeep(mergedRecord.payload),
            merged: {
              key: mergeKey,
              source: "queued",
              previous: {
                reason,
                changedPaths: [...existing.changedPaths],
                payload: cloneDeep(existing.payload),
              },
              next: {
                reason,
                changedPaths: [...mergedChangedPaths],
                payload: cloneDeep(mergedRecord.payload),
              },
            },
          });

          return true;
        }
      }

      await queue.store.enqueue(nextRecord);
      await refreshQueuedCount();
      return true;
    } catch {
      return false;
    }
  };

  const queueSnapshot = async (
    reason: "debounce" | "flush" | "force" | "replay",
    values: TFormValues,
    payload: TPayload,
    changedPaths: string[],
    retryCount = 0,
  ) => {
    const mergeKey = getMergeKey(reason, values, payload, changedPaths);

    return queueFailedSave({
      id: createRecordId(),
      createdAt: Date.now(),
      values: cloneDeep(values),
      payload: cloneDeep(payload),
      changedPaths: [...changedPaths],
      retryCount,
    }, mergeKey, reason);
  };

  const executeSave = async (
    reason: "debounce" | "flush" | "force" | "replay",
    values: TFormValues,
    forcedPayload: TPayload | undefined,
    changedPaths: string[],
    queuedRecordId?: string,
    queuedRetryCount = 0,
  ): Promise<AutosaveSaveResult<TResult>> => {
    latestValuesRef.current = values;
    const hasPendingChanges = changedPaths.length > 0 || !isDeepEqual(values, baselineRef.current);
    if (!hasPendingChanges && reason !== "force" && reason !== "replay") {
      updateStore({ phase: "idle", hasPendingChanges: false });
      return { ok: true, skipped: true };
    }

    let payload = forcedPayload ?? buildPayload(values, changedPaths);
    const entityId = extractEntityIdFromMergeKey(getMergeKey(reason, values, payload, changedPaths));
    const isValid = await validate(changedPaths);
    if (isValid === false) {
      updateStore({ phase: "idle", hasPendingChanges: true });
      return { ok: false, skipped: true, error: new Error("Autosave validation failed") };
    }

    const shouldSave = optionsRef.current.shouldSave
      ? await optionsRef.current.shouldSave({
          values,
          payload,
          changedPaths,
          hasPendingChanges,
          isValid,
          reason,
        })
      : true;

    if (!shouldSave) {
      return { ok: true, skipped: true };
    }

    saveCounterRef.current += 1;
    const saveId = saveCounterRef.current;
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    updateStore({
      phase: "saving",
      isSaving: true,
      lastError: null,
      lastAttemptAt: Date.now(),
      hasPendingChanges: true,
    });

    const context: AutosaveTransportContext<TFormValues, TPayload> = {
      values,
      payload,
      changedPaths,
      dirtyFields: buildDirtyTree(changedPaths),
      baseline: cloneDeep(baselineRef.current),
      signal: abortController.signal,
      meta: {
        reason,
        saveId,
        queued: reason === "replay",
      },
    };

    const startedAt = performance.now();

    try {
      const handledPaths = await runArrayDiffHandlers(optionsRef.current.diffMap, context);
      if (handledPaths.length > 0) {
        payload = omitPaths(payload, handledPaths) as TPayload;
        context.payload = payload;
      }

      let result = await optionsRef.current.transport(context);
      let attempt = 0;

      while (!result.ok && attempt < configRef.current.maxRetries) {
        attempt += 1;
        await new Promise((resolve) => {
          window.setTimeout(resolve, configRef.current.retryDelayMs * attempt);
        });
        result = await optionsRef.current.transport(context);
      }

      const duration = performance.now() - startedAt;
      metricsRef.current.totalSaves += 1;
      metricsRef.current.lastSaveDurationMs = duration;

      if (result.ok) {
        metricsRef.current.successfulSaves += 1;
        metricsRef.current.averageSaveTimeMs = updateAverage(
          metricsRef.current.averageSaveTimeMs,
          metricsRef.current.successfulSaves - 1,
          duration,
        );

        baselineRef.current = applyPaths(baselineRef.current, values, changedPaths);
        latestValuesRef.current = formRef.current.getValues();
        recomputeModifiedPaths();

        updateStore({
          phase: modifiedPathsRef.current.size > 0 ? "scheduled" : "saved",
          isSaving: false,
          hasPendingChanges: modifiedPathsRef.current.size > 0,
          lastSavedAt: Date.now(),
        });

        if (queuedRecordId && optionsRef.current.queue?.store) {
          await optionsRef.current.queue.store.remove(queuedRecordId);
          await refreshQueuedCount();
        }

        appendMutationLog({
          level: "success",
          message: `Saved mutation (${reason})`,
          retryCount: queuedRetryCount + attempt,
          ...(entityId !== undefined ? { entityId } : {}),
          reason,
          changedPaths: [...changedPaths],
          payload: cloneDeep(payload),
        });

        optionsRef.current.onSaved?.(result, payload);

        return result;
      }

      metricsRef.current.failedSaves += 1;
      const error = toError(result.error);

      const queued = await queueSnapshot(
        reason,
        values,
        payload,
        changedPaths,
        queuedRetryCount + attempt + 1,
      );

      appendMutationLog({
        level: "error",
        message: queued ? "Save failed and queued for retry" : "Save failed",
        retryCount: queuedRetryCount + attempt,
        ...(entityId !== undefined ? { entityId } : {}),
        reason,
        changedPaths: [...changedPaths],
        payload: cloneDeep(payload),
      });

      updateStore({
        phase: "error",
        isSaving: false,
        hasPendingChanges: true,
        lastError: error,
      });
      optionsRef.current.onError?.(error, payload);
      return { ...result, queued };
    } catch (error) {
      metricsRef.current.totalSaves += 1;
      metricsRef.current.failedSaves += 1;
      const nextError = toError(error);
      const queued = await queueSnapshot(
        reason,
        values,
        payload,
        changedPaths,
        queuedRetryCount + 1,
      );
      appendMutationLog({
        level: "error",
        message: queued ? "Save failed and queued for retry" : "Save failed",
        retryCount: queuedRetryCount,
        ...(entityId !== undefined ? { entityId } : {}),
        reason,
        changedPaths: [...changedPaths],
        payload: cloneDeep(payload),
      });
      updateStore({
        phase: "error",
        isSaving: false,
        hasPendingChanges: true,
        lastError: nextError,
      });
      optionsRef.current.onError?.(nextError, payload);
      return { ok: false, error: nextError, queued };
    } finally {
      abortControllerRef.current = null;
      updateStore({});
    }
  };

  const drainSaveQueue = async () => {
    if (isDrainingSaveQueueRef.current) {
      return;
    }

    isDrainingSaveQueueRef.current = true;
    try {
      while (pendingSaveQueueRef.current.length > 0) {
        const nextRequest = pendingSaveQueueRef.current.shift();
        if (!nextRequest) {
          continue;
        }

        try {
          const result = await executeSave(
            nextRequest.reason,
            nextRequest.values,
            nextRequest.payload,
            nextRequest.changedPaths,
            nextRequest.queuedRecordId,
            nextRequest.queuedRetryCount,
          );
          for (const resolve of nextRequest.resolves) {
            resolve(result);
          }
        } catch (error) {
          for (const resolve of nextRequest.resolves) {
            resolve({ ok: false, error: toError(error) });
          }
        }
      }
    } finally {
      isDrainingSaveQueueRef.current = false;
    }
  };

  const save = (
    reason: "debounce" | "flush" | "force" | "replay",
    forcedValues?: TFormValues,
    forcedPayload?: TPayload,
    forcedPaths?: string[],
    queuedRecordId?: string,
    queuedRetryCount = 0,
  ): Promise<AutosaveSaveResult<TResult>> => {
    clearSaveTimer();

    const values = forcedValues ?? cloneDeep(formRef.current.getValues());
    latestValuesRef.current = values;

    const changedPaths = forcedPaths ?? getChangedPaths();
    const payloadForMerge = forcedPayload ?? buildPayload(values, changedPaths);
    const mergeKey = getMergeKey(reason, values, payloadForMerge, changedPaths);

    return new Promise<AutosaveSaveResult<TResult>>((resolve) => {
      if (mergeKey) {
        const existingIndex = pendingSaveQueueRef.current.findIndex(
          (pending) => pending.mergeKey === mergeKey,
        );

        if (existingIndex >= 0) {
          const existing = pendingSaveQueueRef.current[existingIndex];
          if (existing) {
            const strategy = getMergeStrategy();
            const previousReason = existing.reason;
            const previousChangedPaths = [...existing.changedPaths];
            const mergedReason = pickSaveReason(existing.reason, reason);
            const mergedChangedPaths = mergeChangedPaths(existing.changedPaths, changedPaths, strategy);
            const previousPayload = existing.payload ?? buildPayload(existing.values, existing.changedPaths);
            existing.values = values;
            existing.payload = payloadForMerge;
            existing.changedPaths = mergedChangedPaths;
            existing.queuedRecordId = existing.queuedRecordId ?? queuedRecordId;
            existing.queuedRetryCount = Math.max(existing.queuedRetryCount, queuedRetryCount);
            existing.resolves.push(resolve);

            appendMutationLog({
              level: "info",
              message: "Merged autosave request (pending)",
              retryCount: 0,
              ...(extractEntityIdFromMergeKey(mergeKey) !== undefined
                ? { entityId: extractEntityIdFromMergeKey(mergeKey) }
                : {}),
              reason: mergedReason,
              changedPaths: [...mergedChangedPaths],
              payload: cloneDeep(payloadForMerge),
              merged: {
                key: mergeKey,
                source: "pending",
                previous: {
                  reason: previousReason,
                  changedPaths: previousChangedPaths,
                  payload: cloneDeep(previousPayload),
                },
                next: {
                  reason: mergedReason,
                  changedPaths: [...mergedChangedPaths],
                  payload: cloneDeep(payloadForMerge),
                },
              },
            });

            existing.reason = mergedReason;
            return;
          }
        }
      }

      pendingSaveQueueRef.current.push({
        reason,
        values,
        payload: forcedPayload,
        changedPaths,
        queuedRecordId,
        queuedRetryCount,
        mergeKey: mergeKey ?? undefined,
        resolves: [resolve],
      });

      void drainSaveQueue();
    });
  };

  const scheduleSave = () => {
    clearSaveTimer();
    if (modifiedPathsRef.current.size === 0) {
      return;
    }

    updateStore({
      phase: store.getState().isSaving ? "saving" : "scheduled",
      hasPendingChanges: true,
    });
    saveTimerRef.current = window.setTimeout(() => {
      void save("debounce");
    }, configRef.current.debounceMs);
  };

  const appendHistoryMutationLog = (message: string) => {
    const changedPaths = getChangedPaths();
    const values = cloneDeep(formRef.current.getValues());
    const payload = changedPaths.length > 0
      ? cloneDeep(buildPayload(values, changedPaths))
      : undefined;
    const entityId = payload !== undefined
      ? extractEntityIdFromMergeKey(getMergeKey("debounce", values, payload, changedPaths))
      : undefined;

    appendMutationLog({
      level: "info",
      message,
      retryCount: 0,
      ...(entityId ? { entityId } : {}),
      changedPaths,
      ...(payload !== undefined ? { payload } : {}),
    });
  };

  const scheduleOrMergeHistoryAutosave = () => {
    const changedPaths = getChangedPaths();
    if (changedPaths.length === 0) {
      return;
    }

    const values = cloneDeep(formRef.current.getValues());
    const payload = buildPayload(values, changedPaths);

    if (pendingSaveQueueRef.current.length > 0) {
      void save("debounce", values, payload, changedPaths);
      return;
    }

    scheduleSave();
  };

  useEffect(() => {
    mountedRef.current = true;
    void refreshQueuedCount();
    return () => {
      mountedRef.current = false;

      const hasPendingSnapshot = modifiedPathsRef.current.size > 0;
      if (hasPendingSnapshot) {
        const snapshotValues = cloneDeep(formRef.current.getValues());
        const snapshotPaths = getChangedPaths();
        const snapshotPayload = buildPayload(snapshotValues, snapshotPaths);
        void queueSnapshot("flush", snapshotValues, snapshotPayload, snapshotPaths);
      }

      clearSaveTimer();
      abortControllerRef.current?.abort();
      for (const pending of pendingSaveQueueRef.current.splice(0)) {
        for (const resolve of pending.resolves) {
          resolve({ ok: true, skipped: true });
        }
      }
    };
  }, []);

  useEffect(() => {
    const subscription = formRef.current.watch((_value, info) => {
      latestValuesRef.current = formRef.current.getValues();

      if (internalMutationRef.current) {
        internalMutationRef.current = false;
        return;
      }

      if (info.name) {
        const changedPath = info.name;
        const nextValue = getByPath(latestValuesRef.current, changedPath);
        const baselineValue = getByPath(baselineRef.current, changedPath);
        if (isDeepEqual(nextValue, baselineValue)) {
          modifiedPathsRef.current.delete(changedPath);
        } else {
          modifiedPathsRef.current.add(changedPath);
        }
      } else {
        recomputeModifiedPaths();
      }

      updateStore({
        hasPendingChanges: modifiedPathsRef.current.size > 0,
        phase: store.getState().isSaving ? "saving" : modifiedPathsRef.current.size > 0 ? "scheduled" : "idle",
      });
      scheduleHistoryCapture();
      scheduleSave();
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [store]);

  useEffect(() => {
    if (!options.autoHydrate) {
      return undefined;
    }

    const form = formRef.current;
    const originalReset = form.reset.bind(form);
    form.reset = ((values, resetOptions) => {
      originalReset(values, resetOptions);
      if (values !== undefined) {
        baselineRef.current = cloneDeep(values as TFormValues);
        latestValuesRef.current = cloneDeep(values as TFormValues);
        modifiedPathsRef.current.clear();
        updateStore({
          phase: "idle",
          hasPendingChanges: false,
          lastError: null,
        });
        historyRef.current = { past: [cloneDeep(values as TFormValues)], future: [] };
      }
    }) as typeof form.reset;

    return () => {
      form.reset = originalReset;
    };
  }, [options.autoHydrate]);

  useEffect(() => {
    if (!options.undo?.enabled || !options.undo.keyboardShortcuts) {
      return undefined;
    }

    const handler = (event: KeyboardEvent) => {
      const isUndo = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z" && !event.shiftKey;
      const isRedo =
        (event.metaKey || event.ctrlKey) &&
        (event.key.toLowerCase() === "y" || (event.key.toLowerCase() === "z" && event.shiftKey));

      if (!isUndo && !isRedo) {
        return;
      }

      event.preventDefault();
      if (isUndo) {
        controller.undo();
      } else {
        controller.redo();
      }
    };

    window.addEventListener("keydown", handler);
    return () => {
      window.removeEventListener("keydown", handler);
    };
  }, [options.undo?.enabled, options.undo?.keyboardShortcuts]);

  useEffect(() => {
    if (!options.queue?.enabled || !options.queue.retryOnReconnect) {
      return undefined;
    }

    const handler = () => {
      void controller.replayQueuedSaves();
    };
    window.addEventListener("online", handler);
    return () => {
      window.removeEventListener("online", handler);
    };
  }, [options.queue?.enabled, options.queue?.retryOnReconnect]);

  const controller = useMemo<AutosaveController<TFormValues, TPayload, TResult>>(() => {
    return {
      get phase() {
        return store.getState().phase;
      },
      get isSaving() {
        return store.getState().isSaving;
      },
      get hasPendingChanges() {
        return store.getState().hasPendingChanges;
      },
      get queuedCount() {
        return store.getState().queuedCount;
      },
      get lastSavedAt() {
        return store.getState().lastSavedAt;
      },
      get lastAttemptAt() {
        return store.getState().lastAttemptAt;
      },
      get lastError() {
        return store.getState().lastError;
      },
      get canUndo() {
        return historyRef.current.past.length > 1;
      },
      get canRedo() {
        return historyRef.current.future.length > 0;
      },
      flush: () => save("flush"),
      forceSave: () =>
        save(
          "force",
          cloneDeep(formRef.current.getValues()),
          cloneDeep(formRef.current.getValues()) as unknown as TPayload,
          getChangedPaths(),
        ),
      abort: () => {
        clearSaveTimer();
        abortControllerRef.current?.abort();
        for (const pending of pendingSaveQueueRef.current.splice(0)) {
          for (const resolve of pending.resolves) {
            resolve({ ok: true, skipped: true });
          }
        }
        updateStore({
          phase: modifiedPathsRef.current.size > 0 ? "scheduled" : "idle",
          isSaving: false,
        });
      },
      hydrateFromServer: (values: TFormValues) => {
        internalMutationRef.current = true;
        baselineRef.current = cloneDeep(values);
        latestValuesRef.current = cloneDeep(values);
        modifiedPathsRef.current.clear();
        historyRef.current = { past: [cloneDeep(values)], future: [] };
        setFormValues(formRef.current, values);
        updateStore({
          phase: "idle",
          isSaving: false,
          hasPendingChanges: false,
          lastError: null,
        });
      },
      replayQueuedSaves: async () => {
        if (!optionsRef.current.queue?.store) {
          return;
        }

        const queued = await optionsRef.current.queue.store.list();
        queued.sort((left, right) => {
          if (left.createdAt !== right.createdAt) {
            return left.createdAt - right.createdAt;
          }

          return left.id.localeCompare(right.id);
        });

        let successfulCount = 0;
        let stoppedOnError = false;
        for (const record of queued) {
          const result = await save(
            "replay",
            record.values,
            record.payload,
            record.changedPaths,
            record.id,
            record.retryCount ?? 0,
          );
          if (!result.ok) {
            stoppedOnError = true;
            break;
          }

          successfulCount += 1;
        }
        await refreshQueuedCount();

        const replayMessage = stoppedOnError
          ? `Replay queue partially processed (${successfulCount}/${queued.length} succeeded)`
          : `Replay queue processed (${successfulCount}/${queued.length} succeeded)`;

        appendMutationLog({
          level: stoppedOnError ? "error" : "info",
          message: replayMessage,
          retryCount: 0,
          reason: "replay",
        });
      },
      undo: () => {
        if (historyRef.current.past.length <= 1) {
          return;
        }

        const current = cloneDeep(formRef.current.getValues());
        const previous = historyRef.current.past[historyRef.current.past.length - 2];
        if (!previous) {
          return;
        }
        historyRef.current.future.unshift(current);
        historyRef.current.past.pop();
        internalMutationRef.current = true;
        latestValuesRef.current = cloneDeep(previous);
        setFormValues(formRef.current, previous);
        recomputeModifiedPaths();
        scheduleOrMergeHistoryAutosave();
        appendHistoryMutationLog("Undo mutation applied");
      },
      redo: () => {
        const next = historyRef.current.future.shift();
        if (!next) {
          return;
        }

        historyRef.current.past.push(cloneDeep(next));
        internalMutationRef.current = true;
        latestValuesRef.current = cloneDeep(next);
        setFormValues(formRef.current, next);
        recomputeModifiedPaths();
        scheduleOrMergeHistoryAutosave();
        appendHistoryMutationLog("Redo mutation applied");
      },
      undoLastSave: () => {
        internalMutationRef.current = true;
        latestValuesRef.current = cloneDeep(baselineRef.current);
        setFormValues(formRef.current, baselineRef.current);
        recomputeModifiedPaths();
      },
      getMetrics: () => ({ ...metricsRef.current }),
      getMutationLog: () => [...mutationLogRef.current],
      getPendingPayload: () => {
        const paths = getChangedPaths();
        if (paths.length === 0) {
          return null;
        }
        return buildPayload(cloneDeep(formRef.current.getValues()), paths);
      },
      getState: store.getState,
      subscribe: store.subscribe,
    };
  }, [store]);

  useEffect(() => {
    if (!options.queue?.enabled || !options.queue.store) {
      return;
    }

    void controller.replayQueuedSaves();
  }, [controller, options.queue?.enabled, options.queue?.store]);

  return controller;
}