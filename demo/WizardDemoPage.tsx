import { Link, useParams } from "react-router-dom";
import { useCallback, useEffect, useRef } from "react";
import { useDispatch } from "react-redux";
import type { AutosaveMutationLogEntry } from "../src";
import { useGlobalAutosaveQuery, useGlobalAutosaveRegistry } from "../src";
import { EmployeeOnboardingWizard } from "../examples/EmployeeOnboardingWizard";
import { useGetEmployeeOnboardingQuery, useUpdateEmploymentMutation } from "./api/employeesApi";
import { autosaveLogAdded } from "./autosaveLogsSlice";
import type { AppDispatch } from "./store";
import { useToast } from "./toast";

export function WizardDemoPage() {
  const dispatch = useDispatch<AppDispatch>();
  const params = useParams();
  const employeeId = params.employeeId ?? "emp-2048";
  const { currentData, isLoading, isFetching } = useGetEmployeeOnboardingQuery(employeeId);
  const [updateEmployment] = useUpdateEmploymentMutation();
  const { pushToast } = useToast();
  const { upsertEntityState } = useGlobalAutosaveRegistry();
  const updateEmploymentRef = useRef(updateEmployment);
  const pushToastRef = useRef(pushToast);
  const upsertEntityStateRef = useRef(upsertEntityState);

  useEffect(() => {
    updateEmploymentRef.current = updateEmployment;
  }, [updateEmployment]);

  useEffect(() => {
    pushToastRef.current = pushToast;
  }, [pushToast]);

  useEffect(() => {
    upsertEntityStateRef.current = upsertEntityState;
  }, [upsertEntityState]);

  const saveEmploymentMutation = useCallback(
    (payload: Parameters<typeof updateEmployment>[0]["payload"]) =>
      updateEmploymentRef.current({ employeeId, payload }).unwrap(),
    [employeeId],
  );
  const handleAutosaveSaved = useCallback(() => {
    pushToastRef.current("Wizard changes saved", "success");
  }, []);
  const handleAutosaveError = useCallback((error: Error) => {
    pushToastRef.current(`Wizard autosave failed: ${error.message}`, "error");
  }, []);
  const handleAutosaveStateChange = useCallback((state: Parameters<typeof upsertEntityState>[1]) => {
    upsertEntityStateRef.current(employeeId, state);
  }, [employeeId]);
  const handleAutosaveLog = useCallback((entry: AutosaveMutationLogEntry) => {
    dispatch(autosaveLogAdded(entry));
  }, [dispatch]);
  const globalSummary = useGlobalAutosaveQuery((summary) => ({
    hasUnsavedChanges: summary.hasUnsavedChanges,
    unsavedEmployeeCount: summary.unsavedEntityKeys.length,
    queuedMutationCount: summary.queuedMutationCount,
  }));

  return (
    <main className="page-shell">
      <section className="hero-card">
        <div>
          <p className="eyebrow">Runnable Demo</p>
          <h1>Employee onboarding wizard</h1>
          <p className="hero-copy">
            This demo uses the autosave library with React Hook Form, React Router, Redux Toolkit,
            RTK Query, and MSW-backed endpoints partitioned by form ownership.
          </p>
        </div>
        <div className="hero-meta">
          <span>Employee: {employeeId}</span>
          <span>{isLoading ? "Loading initial record..." : isFetching ? "Refreshing..." : "Mock API online"}</span>
          <span>
            Global autosave: {globalSummary.hasUnsavedChanges
              ? `${globalSummary.unsavedEmployeeCount} employee(s) with unsaved changes, ${globalSummary.queuedMutationCount} queued mutation(s)`
              : "All tracked employees are saved"}
          </span>
          <Link to="/dashboard" className="ghost-link">Go to dashboard</Link>
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
          {...(currentData?.values ? { initialValues: currentData.values } : {})}
        />
      ) : null}
    </main>
  );
}