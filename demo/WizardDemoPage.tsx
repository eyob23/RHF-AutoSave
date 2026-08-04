import { Link, useParams } from "react-router-dom";
import { useCallback, useEffect, useRef } from "react";
import { useDispatch } from "react-redux";
import type { AutosaveMutationLogEntry } from "../src";
import {
  createLocalStorageDraftStorage,
  useDraftGuard,
  useGlobalAutosaveQuery,
  useGlobalAutosaveRegistry,
} from "../src";
import { EmployeeOnboardingWizard } from "../examples/EmployeeOnboardingWizard";
import {
  useGetEmployeeOnboardingQuery,
  useUpdateEmploymentMutation,
} from "./api/employeesApi";
import { autosaveLogAdded } from "./autosaveLogsSlice";
import type { AppDispatch } from "./store";
import { useToast } from "./toast";

function isLikelyHtmlMessage(value: string) {
  const trimmed = value.trim();
  return /<!doctype html/i.test(trimmed) || /<html[\s>]/i.test(trimmed);
}

function formatAutosaveErrorMessage(error: Error) {
  const message = error.message.trim();
  if (!message || isLikelyHtmlMessage(message)) {
    return "Wizard autosave failed: demo mock API request did not resolve. Refresh and try again.";
  }

  return `Wizard autosave failed: ${message}`;
}

export function WizardDemoPage() {
  const dispatch = useDispatch<AppDispatch>();
  const params = useParams();
  const employeeId = params.employeeId ?? "emp-2048";
  const { currentData, isLoading, isFetching } =
    useGetEmployeeOnboardingQuery(employeeId);
  const [updateEmployment] = useUpdateEmploymentMutation();
  const { pushToast } = useToast();
  const { upsertEntityState } = useGlobalAutosaveRegistry();
  const updateEmploymentRef = useRef(updateEmployment);
  const pushToastRef = useRef(pushToast);
  const upsertEntityStateRef = useRef(upsertEntityState);

  const globalSummary = useGlobalAutosaveQuery((summary) => ({
    hasUnsavedChanges: summary.hasUnsavedChanges,
    unsavedEmployeeCount: summary.unsavedEntityKeys.length,
    queuedMutationCount: summary.queuedMutationCount,
  }));

  useEffect(() => {
    updateEmploymentRef.current = updateEmployment;
  }, [updateEmployment]);

  useEffect(() => {
    pushToastRef.current = pushToast;
  }, [pushToast]);

  useEffect(() => {
    upsertEntityStateRef.current = upsertEntityState;
  }, [upsertEntityState]);

  const hasUnsavedChanges = globalSummary.hasUnsavedChanges;
  const draftGuard = useDraftGuard({
    form: {
      getValues: () => ({ employeeId, values: currentData?.values ?? null }),
      reset: () => undefined,
    },
    getSnapshot: () => ({ employeeId, values: currentData?.values ?? null }),
    storage: createLocalStorageDraftStorage<{ employeeId: string; values: unknown | null }>(
      `rhf-autosave-draft:${employeeId}`,
    ),
    shouldProtect: () => hasUnsavedChanges,
    onLeave: () => true,
    message:
      "You have unsaved onboarding changes. Select Cancel to stay and continue editing, or OK to leave without saving.",
  });

  const saveEmploymentMutation = useCallback(
    (payload: Parameters<typeof updateEmployment>[0]["payload"]) =>
      updateEmploymentRef.current({ employeeId, payload }).unwrap(),
    [employeeId],
  );
  const handleAutosaveSaved = useCallback(() => {
    pushToastRef.current("Wizard changes saved", "success");
    draftGuard.saveDraft();
  }, [draftGuard]);
  const handleAutosaveError = useCallback((error: Error) => {
    pushToastRef.current(formatAutosaveErrorMessage(error), "error");
  }, []);
  const handleAutosaveStateChange = useCallback(
    (state: Parameters<typeof upsertEntityState>[1]) => {
      upsertEntityStateRef.current(employeeId, state);
    },
    [employeeId],
  );
  const handleAutosaveLog = useCallback(
    (entry: AutosaveMutationLogEntry) => {
      dispatch(autosaveLogAdded(entry));
    },
    [dispatch],
  );
  return (
    <main className="page-shell">
      <section className="hero-card">
        <div>
          <p className="eyebrow">Runnable Demo</p>
          <h1>Employee onboarding wizard</h1>
          <p className="hero-copy">
            This demo uses the autosave library with React Hook Form, React
            Router, Redux Toolkit, RTK Query, and MSW-backed endpoints
            partitioned by form ownership.
          </p>
        </div>
        <div className="hero-meta">
          <span>Employee: {employeeId}</span>
          <span>
            {isLoading
              ? "Loading initial record..."
              : isFetching
                ? "Refreshing..."
                : "Mock API online"}
          </span>
          <span>
            Global autosave:{" "}
            {globalSummary.hasUnsavedChanges
              ? `${globalSummary.unsavedEmployeeCount} employee(s) with unsaved changes, ${globalSummary.queuedMutationCount} queued mutation(s)`
              : "All tracked employees are saved"}
          </span>
          <Link to="/dashboard" className="ghost-link">
            Go to dashboard
          </Link>
        </div>
      </section>

      {isLoading && !currentData ? (
        <section className="dashboard-card">
          <p>Loading employee onboarding record...</p>
        </section>
      ) : null}

      {!isLoading || currentData ? (
        <EmployeeOnboardingWizard
          employeeId={employeeId}
          saveEmploymentMutation={saveEmploymentMutation}
          onAutosaveSaved={handleAutosaveSaved}
          onAutosaveError={handleAutosaveError}
          onAutosaveStateChange={handleAutosaveStateChange}
          onAutosaveLog={handleAutosaveLog}
          {...(currentData?.values
            ? { initialValues: currentData.values }
            : {})}
        />
      ) : null}
    </main>
  );
}
