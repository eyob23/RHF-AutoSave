import { useCallback, useEffect, useMemo } from "react";
import { cloneDeep } from "../utils/deep";

export interface DraftGuardDecisionContext<TValues> {
  shouldProtect: boolean;
  message: string;
  snapshot: TValues | null;
}

function shouldWarnOnLeaveDecision<TValues>(
  context: DraftGuardDecisionContext<TValues>,
): boolean {
  return context.shouldProtect;
}

export const shouldWarnOnLeave = shouldWarnOnLeaveDecision;

export function normalizeAutosaveError(
  error: unknown,
  fallbackMessage: string,
) {
  if (error instanceof Error) {
    const message = error.message?.trim();
    if (
      !message ||
      /<!doctype html/i.test(message) ||
      /<html[\s>]/i.test(message)
    ) {
      return fallbackMessage;
    }

    return `Autosave failed: ${message}`;
  }

  return fallbackMessage;
}

export interface AutosaveFeedbackHandlers {
  onSaved?: (() => void) | undefined;
  onError?: ((message: string) => void) | undefined;
}

export function useAutosaveFeedback(handlers: AutosaveFeedbackHandlers) {
  return {
    reportSaved: () => handlers.onSaved?.(),
    reportError: (error: unknown, fallbackMessage: string) => {
      handlers.onError?.(normalizeAutosaveError(error, fallbackMessage));
    },
  };
}

export interface DraftGuardianStorage<TValues> {
  get: () => TValues | null;
  set: (snapshot: TValues) => void;
  clear: () => void;
}

export interface DraftGuardianFormAdapter<TValues> {
  getValues: () => TValues;
  reset: (values: TValues) => void;
}

export interface DraftGuardianOptions<TValues> {
  form: DraftGuardianFormAdapter<TValues>;
  getSnapshot?: () => TValues;
  restoreSnapshot?: (snapshot: TValues) => void;
  shouldProtect?: () => boolean;
  onLeave?: () => boolean | void;
  storage?: DraftGuardianStorage<TValues>;
  message?: string;
}

export interface DraftGuardianController<TValues> {
  attachWindowGuard: () => () => void;
  attachRouteGuard: () => () => void;
  saveDraft: () => TValues | null;
  restoreDraft: () => TValues | null;
  clearDraft: () => void;
}

export function createDraftSnapshot<TValue>(value: TValue): TValue {
  return cloneDeep(value);
}

export function createLocalStorageDraftStorage<TValue>(
  key: string,
): DraftGuardianStorage<TValue> {
  return {
    get: () => {
      if (typeof window === "undefined") {
        return null;
      }

      const rawValue = window.localStorage.getItem(key);
      if (!rawValue) {
        return null;
      }

      return JSON.parse(rawValue) as TValue;
    },
    set: (snapshot) => {
      if (typeof window === "undefined") {
        return;
      }

      window.localStorage.setItem(key, JSON.stringify(snapshot));
    },
    clear: () => {
      if (typeof window === "undefined") {
        return;
      }

      window.localStorage.removeItem(key);
    },
  };
}

function createMemoryDraftStorage<TValue>(): DraftGuardianStorage<TValue> {
  let snapshot: TValue | null = null;

  return {
    get: () => snapshot,
    set: (nextSnapshot) => {
      snapshot = nextSnapshot;
    },
    clear: () => {
      snapshot = null;
    },
  };
}

export function createDraftGuardian<TValues>(
  options: DraftGuardianOptions<TValues>,
): DraftGuardianController<TValues> {
  const storage = options.storage ?? createMemoryDraftStorage<TValues>();
  const message =
    options.message ??
    "You have unsaved changes. Select Cancel to stay on this page, or OK to leave without saving.";

  const shouldProtect = () => {
    if (options.shouldProtect) {
      return options.shouldProtect();
    }

    return true;
  };

  const getSnapshot = () => {
    const source = options.getSnapshot
      ? options.getSnapshot()
      : options.form.getValues();

    return createDraftSnapshot(source);
  };

  const saveDraft = () => {
    const snapshot = getSnapshot();
    storage.set(snapshot);
    return snapshot;
  };

  const restoreDraft = () => {
    const snapshot = storage.get();
    if (!snapshot) {
      return null;
    }

    if (options.restoreSnapshot) {
      options.restoreSnapshot(snapshot);
    } else {
      options.form.reset(snapshot);
    }

    return snapshot;
  };

  const clearDraft = () => {
    storage.clear();
  };

  const resolveLeaveDecision = () => {
    if (!shouldProtect()) {
      return true;
    }

    if (options.onLeave) {
      const decision = options.onLeave();
      if (typeof decision === "boolean") {
        return decision;
      }
    }

    if (typeof window === "undefined") {
      return true;
    }

    return window.confirm(message);
  };

  const attachWindowGuard = () => {
    if (typeof window === "undefined") {
      return () => undefined;
    }

    const handler = (event: BeforeUnloadEvent) => {
      if (!shouldProtect()) {
        return undefined;
      }

      event.preventDefault();
      event.returnValue = message;
      return message;
    };

    window.addEventListener("beforeunload", handler);
    return () => {
      window.removeEventListener("beforeunload", handler);
    };
  };

  const attachRouteGuard = () => {
    if (typeof window === "undefined" || typeof document === "undefined") {
      return () => undefined;
    }

    const onPopState = () => {
      if (!shouldProtect()) {
        return;
      }

      const shouldLeave = resolveLeaveDecision();
      if (!shouldLeave) {
        const target = `${window.location.pathname}${window.location.search}${window.location.hash}`;
        window.history.pushState(window.history.state, "", target);
      }
    };

    const onClick = (event: MouseEvent) => {
      if (!shouldProtect()) {
        return;
      }

      if (event.defaultPrevented || event.button !== 0) {
        return;
      }

      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
        return;
      }

      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }

      const anchor = target.closest("a[href]");
      if (!(anchor instanceof HTMLAnchorElement)) {
        return;
      }

      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("#")) {
        return;
      }

      if (anchor.target && anchor.target !== "_self") {
        return;
      }

      const nextUrl = new URL(anchor.href, window.location.href);
      const currentUrl = new URL(window.location.href);
      const nextPath = `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`;
      const currentPath = `${currentUrl.pathname}${currentUrl.search}${currentUrl.hash}`;

      if (nextPath === currentPath) {
        return;
      }

      event.preventDefault();
      const shouldLeave = resolveLeaveDecision();
      if (!shouldLeave) {
        return;
      }

      if (nextUrl.origin === currentUrl.origin) {
        window.location.assign(nextPath);
        return;
      }

      window.location.assign(nextUrl.toString());
    };

    window.addEventListener("popstate", onPopState);
    document.addEventListener("click", onClick, true);

    return () => {
      window.removeEventListener("popstate", onPopState);
      document.removeEventListener("click", onClick, true);
    };
  };

  return {
    attachWindowGuard,
    attachRouteGuard,
    saveDraft,
    restoreDraft,
    clearDraft,
  };
}

export interface UseDraftGuardOptions<TValues> extends Omit<
  DraftGuardianOptions<TValues>,
  "getSnapshot" | "restoreSnapshot"
> {
  getSnapshot?: () => TValues;
  restoreSnapshot?: (snapshot: TValues) => void;
}

export function useDraftGuard<TValues>(
  options: UseDraftGuardOptions<TValues>,
): DraftGuardianController<TValues> {
  const controller = useMemo(() => createDraftGuardian(options), [options]);

  useEffect(() => {
    const cleanupWindow = controller.attachWindowGuard();
    const cleanupRoute = controller.attachRouteGuard();

    return () => {
      cleanupWindow();
      cleanupRoute();
    };
  }, [controller]);

  return controller;
}

export interface UseAutosaveFlowOptions<
  TValues,
> extends UseDraftGuardOptions<TValues> {
  onSaved?: (() => void) | undefined;
  onError?: ((message: string) => void) | undefined;
}

export interface UseAutosaveFlowResult<
  TValues,
> extends DraftGuardianController<TValues> {
  reportSaved: () => void;
  reportError: (error: unknown, fallbackMessage: string) => void;
  shouldWarnOnLeave: () => boolean;
}

export function useAutosaveFlow<TValues>(
  options: UseAutosaveFlowOptions<TValues>,
): UseAutosaveFlowResult<TValues> {
  const controller = useDraftGuard(options);
  const feedback = useAutosaveFeedback({
    onSaved: options.onSaved,
    onError: options.onError,
  });

  const shouldWarnOnLeave = () =>
    shouldWarnOnLeaveDecision({
      shouldProtect: options.shouldProtect ? options.shouldProtect() : true,
      message: options.message ?? "You have unsaved changes.",
      snapshot: null,
    });

  return {
    ...controller,
    reportSaved: feedback.reportSaved,
    reportError: feedback.reportError,
    shouldWarnOnLeave,
  };
}

export interface UseAutosaveWorkflowOptions<
  TValues,
  TPayload = unknown,
> extends UseDraftGuardOptions<TValues> {
  draftKey?: string;
  fallbackMessage?: string;
  save: (payload: TPayload) => Promise<unknown> | unknown;
  onSaved?: () => void;
  onError?: (message: string) => void;
}

export interface UseAutosaveWorkflowResult<
  TValues,
  TPayload = unknown,
> extends UseAutosaveFlowResult<TValues> {
  saveAndTrack: (payload: TPayload) => Promise<unknown>;
  handleSuccessfulSave: () => void;
  handleError: (error: unknown) => void;
}

export function useAutosaveWorkflow<TValues, TPayload = unknown>(
  options: UseAutosaveWorkflowOptions<TValues, TPayload>,
): UseAutosaveWorkflowResult<TValues, TPayload> {
  const {
    save,
    draftKey,
    fallbackMessage = "Autosave failed. Please try again.",
    storage,
    onSaved,
    onError,
    ...draftOptions
  } = options;

  const workflowStorage = useMemo(() => {
    if (storage) {
      return storage;
    }

    if (!draftKey) {
      return undefined;
    }

    return createLocalStorageDraftStorage<TValues>(draftKey);
  }, [draftKey, storage]);

  const flow = useAutosaveFlow<TValues>({
    ...draftOptions,
    ...(workflowStorage ? { storage: workflowStorage } : {}),
    onSaved,
    onError,
  });

  const handleSuccessfulSave = useCallback(() => {
    flow.saveDraft();
    flow.reportSaved();
  }, [flow]);

  const handleError = useCallback(
    (error: unknown) => {
      flow.reportError(error, fallbackMessage);
    },
    [fallbackMessage, flow],
  );

  const saveAndTrack = useCallback(
    async (payload: TPayload) => {
      try {
        const result = await save(payload);
        handleSuccessfulSave();
        return result;
      } catch (error) {
        handleError(error);
        throw error;
      }
    },
    [handleError, handleSuccessfulSave, save],
  );

  return {
    ...flow,
    saveAndTrack,
    handleSuccessfulSave,
    handleError,
  };
}
