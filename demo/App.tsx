import { useState } from "react";
import { useSelector } from "react-redux";
import {
  Link,
  Navigate,
  Route,
  Routes,
  useNavigate,
  useParams,
} from "react-router-dom";
import { useGlobalAutosaveQuery, useGlobalAutosaveRegistry } from "../src";
import { WizardDemoPage } from "./WizardDemoPage";
import {
  useCreateEmployeeMutation,
  useDeleteEmployeeMutation,
  useGetEmployeeOnboardingQuery,
  useListEmployeesQuery,
  useUpdateEmployeeSummaryMutation,
  type CreateEmployeeRequest,
  type EmployeeSummary,
} from "./api/employeesApi";
import type { RootState } from "./store";
import { useToast } from "./toast";

const emptyEmployee: CreateEmployeeRequest = {
  firstName: "",
  lastName: "",
  title: "",
  department: "",
  locationCode: "",
  startDate: "2026-10-01",
};

function EmployeeForm(props: {
  submitLabel: string;
  initialValues: CreateEmployeeRequest;
  onSubmit: (values: CreateEmployeeRequest) => Promise<void>;
  onCancel?: () => void;
}) {
  const [values, setValues] = useState<CreateEmployeeRequest>(
    props.initialValues,
  );
  const [isSubmitting, setIsSubmitting] = useState(false);

  const update = <TKey extends keyof CreateEmployeeRequest>(
    key: TKey,
    value: CreateEmployeeRequest[TKey],
  ) => {
    setValues((current) => ({ ...current, [key]: value }));
  };

  return (
    <div className="employee-form-card">
      <div className="employee-form-grid">
        <input
          value={values.firstName}
          onChange={(event) => update("firstName", event.target.value)}
          placeholder="First name"
        />
        <input
          value={values.lastName}
          onChange={(event) => update("lastName", event.target.value)}
          placeholder="Last name"
        />
        <input
          value={values.title}
          onChange={(event) => update("title", event.target.value)}
          placeholder="Job title"
        />
        <input
          value={values.department}
          onChange={(event) => update("department", event.target.value)}
          placeholder="Department"
        />
        <input
          value={values.locationCode}
          onChange={(event) => update("locationCode", event.target.value)}
          placeholder="Location code"
        />
        <input
          type="date"
          value={values.startDate}
          onChange={(event) => update("startDate", event.target.value)}
        />
      </div>
      <div className="employee-form-actions">
        <button
          type="button"
          onClick={async () => {
            setIsSubmitting(true);
            try {
              await props.onSubmit(values);
            } catch {
              return;
            } finally {
              setIsSubmitting(false);
            }
          }}
          disabled={isSubmitting}
        >
          {isSubmitting ? "Saving..." : props.submitLabel}
        </button>
        {props.onCancel ? (
          <button
            type="button"
            className="secondary-button"
            onClick={props.onCancel}
          >
            Cancel
          </button>
        ) : null}
      </div>
    </div>
  );
}

function EmployeeRow(props: { employee: EmployeeSummary }) {
  const navigate = useNavigate();
  const { pushToast } = useToast();
  const { removeEntityState } = useGlobalAutosaveRegistry();
  const [isEditing, setIsEditing] = useState(false);
  const [updateEmployeeSummary] = useUpdateEmployeeSummaryMutation();
  const [deleteEmployee, deleteState] = useDeleteEmployeeMutation();

  return (
    <article className="employee-row">
      <div className="employee-row-main">
        <div>
          <h3>
            {props.employee.firstName} {props.employee.lastName}
          </h3>
          <p>
            {props.employee.title} · {props.employee.department} ·{" "}
            {props.employee.locationCode}
          </p>
          <span>Start date: {props.employee.startDate}</span>
        </div>
        <div className="employee-row-actions">
          <button
            type="button"
            className="secondary-button"
            onClick={() => navigate(`/employees/${props.employee.employeeId}`)}
          >
            Read
          </button>
          <button
            type="button"
            onClick={() =>
              navigate(`/employees/${props.employee.employeeId}/onboarding`)
            }
          >
            Open wizard
          </button>
          <button
            type="button"
            className="secondary-button"
            onClick={() => setIsEditing((value) => !value)}
          >
            {isEditing ? "Close edit" : "Quick edit"}
          </button>
          <button
            type="button"
            className="danger-button"
            onClick={async () => {
              try {
                await deleteEmployee(props.employee.employeeId).unwrap();
                removeEntityState(props.employee.employeeId);
                pushToast(
                  `Deleted employee ${props.employee.employeeId}`,
                  "success",
                );
              } catch {
                pushToast("Failed to delete employee", "error");
              }
            }}
            disabled={deleteState.isLoading}
          >
            {deleteState.isLoading ? "Deleting..." : "Delete"}
          </button>
        </div>
      </div>
      {isEditing ? (
        <EmployeeForm
          submitLabel="Save summary"
          initialValues={{
            firstName: props.employee.firstName,
            lastName: props.employee.lastName,
            title: props.employee.title,
            department: props.employee.department,
            locationCode: props.employee.locationCode,
            startDate: props.employee.startDate,
          }}
          onCancel={() => setIsEditing(false)}
          onSubmit={async (values) => {
            try {
              await updateEmployeeSummary({
                employeeId: props.employee.employeeId,
                ...values,
              }).unwrap();
              pushToast(
                `Updated ${values.firstName} ${values.lastName}`,
                "success",
              );
              setIsEditing(false);
            } catch {
              pushToast("Failed to update employee summary", "error");
              throw new Error("update failed");
            }
          }}
        />
      ) : null}
    </article>
  );
}

function GlobalSaveStatePanel() {
  const trackedEntityCount = useGlobalAutosaveQuery(
    (state) => state.trackedEntityCount,
  );
  const unsavedCount = useGlobalAutosaveQuery(
    (state) => state.unsavedEntityKeys.length,
  );
  const savingCount = useGlobalAutosaveQuery(
    (state) => state.savingEntityKeys.length,
  );
  const errorCount = useGlobalAutosaveQuery(
    (state) => state.errorEntityKeys.length,
  );
  const queuedMutationCount = useGlobalAutosaveQuery(
    (state) => state.queuedMutationCount,
  );
  const unsavedEmployeeIdsText = useGlobalAutosaveQuery((state) =>
    state.unsavedEntityKeys.length > 0
      ? state.unsavedEntityKeys.join(", ")
      : "None",
  );
  const queuedEmployeeIdsText = useGlobalAutosaveQuery((state) =>
    state.queuedEntityKeys.length > 0
      ? state.queuedEntityKeys.join(", ")
      : "None",
  );
  const errorEmployeeIdsText = useGlobalAutosaveQuery((state) =>
    state.errorEntityKeys.length > 0
      ? state.errorEntityKeys.join(", ")
      : "None",
  );
  const hasUnsavedChanges = unsavedCount > 0;

  return (
    <section className="dashboard-card dashboard-stack">
      <div>
        <p className="eyebrow">Global Save State Query</p>
        <h2>Autosave across tracked employees</h2>
        <p>
          {hasUnsavedChanges
            ? `Unsaved work exists across ${unsavedCount} employee(s).`
            : "No unsaved work across tracked employees."}
        </p>
      </div>

      <div className="save-state-grid">
        <div className="save-state-tile">
          <strong>{trackedEntityCount}</strong>
          <span>Tracked</span>
        </div>
        <div className="save-state-tile">
          <strong>{unsavedCount}</strong>
          <span>Unsaved</span>
        </div>
        <div className="save-state-tile">
          <strong>{savingCount}</strong>
          <span>Saving/Scheduled</span>
        </div>
        <div className="save-state-tile">
          <strong>{errorCount}</strong>
          <span>Errors</span>
        </div>
        <div className="save-state-tile">
          <strong>{queuedMutationCount}</strong>
          <span>Queued Mutations</span>
        </div>
      </div>

      <div className="save-state-row">
        <span className="save-state-label">Unsaved employee IDs</span>
        <span>{unsavedEmployeeIdsText}</span>
      </div>
      <div className="save-state-row">
        <span className="save-state-label">Employees with queued retries</span>
        <span>{queuedEmployeeIdsText}</span>
      </div>
      <div className="save-state-row">
        <span className="save-state-label">Employees with save errors</span>
        <span>{errorEmployeeIdsText}</span>
      </div>
    </section>
  );
}

function GlobalSaveStateWidget() {
  const trackedEntityCount = useGlobalAutosaveQuery(
    (state) => state.trackedEntityCount,
  );
  const unsavedCount = useGlobalAutosaveQuery(
    (state) => state.unsavedEntityKeys.length,
  );
  const queuedMutationCount = useGlobalAutosaveQuery(
    (state) => state.queuedMutationCount,
  );
  const savingCount = useGlobalAutosaveQuery(
    (state) => state.savingEntityKeys.length,
  );
  const errorCount = useGlobalAutosaveQuery(
    (state) => state.errorEntityKeys.length,
  );
  const hasUnsavedChanges = unsavedCount > 0;

  const statusAnnouncement = hasUnsavedChanges
    ? `${unsavedCount} unsaved, ${queuedMutationCount} queued`
    : "All tracked entities are saved";

  return (
    <aside
      className="global-save-widget"
      role="region"
      aria-label="Global save state summary"
    >
      <p
        className="sr-only"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {statusAnnouncement}
      </p>
      <div className="global-save-widget-title">Global Save State</div>
      <div className="global-save-widget-line">{statusAnnouncement}</div>
      <div className="global-save-widget-metrics">
        <span>Tracked: {trackedEntityCount}</span>
        <span>Saving: {savingCount}</span>
        <span>Errors: {errorCount}</span>
      </div>
      <Link to="/dashboard" className="global-save-widget-link">
        Open full query
      </Link>
    </aside>
  );
}

function GlobalAutosaveLogWidget() {
  const recentEntries = useSelector((state: RootState) =>
    state.autosaveLogs.entries.slice(0, 6),
  );

  return (
    <aside
      className="global-log-widget"
      role="region"
      aria-label="Global autosave mutation log"
    >
      <div className="global-log-widget-title">Autosave Log Stream</div>
      {recentEntries.length === 0 ? (
        <div className="global-log-widget-empty">No events yet.</div>
      ) : (
        <ul className="global-log-widget-list">
          {recentEntries.map((entry) => (
            <li
              key={entry.id}
              className={`global-log-widget-item global-log-widget-item-${entry.level}`}
            >
              <span className="global-log-widget-message">{entry.message}</span>
              <span className="global-log-widget-meta">
                {entry.entityId ? `entity ${entry.entityId}` : "no entity"}
                {entry.reason ? ` • ${entry.reason}` : ""}
              </span>
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}

function EmployeeDetailsPage() {
  const params = useParams();
  const employeeId = params.employeeId ?? "";
  const { data, isLoading } = useGetEmployeeOnboardingQuery(employeeId);

  if (!employeeId) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <main className="page-shell">
      <section className="dashboard-card dashboard-stack">
        <div>
          <p className="eyebrow">Read-only View</p>
          <h1>Employee details</h1>
          <p>Employee ID: {employeeId}</p>
        </div>
        <div className="employee-row-actions">
          <Link to="/dashboard" className="ghost-link">
            Back to dashboard
          </Link>
          <Link
            to={`/employees/${employeeId}/onboarding`}
            className="primary-link"
          >
            Open wizard
          </Link>
        </div>
      </section>

      {isLoading ? (
        <section className="dashboard-card">
          <p>Loading employee details...</p>
        </section>
      ) : null}

      {!isLoading && data ? (
        <section className="dashboard-card dashboard-stack">
          <div className="detail-grid">
            <div className="detail-card">
              <h2>Profile</h2>
              <p>
                {data.values.profile.firstName} {data.values.profile.lastName}
              </p>
              <p>{data.values.profile.personalEmail}</p>
              <p>{data.values.profile.mobilePhone}</p>
            </div>
            <div className="detail-card">
              <h2>Employment</h2>
              <p>{data.values.employment.title}</p>
              <p>
                {data.values.employment.department} ·{" "}
                {data.values.employment.locationCode}
              </p>
              <p>Work mode: {data.values.employment.workMode}</p>
            </div>
            <div className="detail-card">
              <h2>Address</h2>
              <p>{data.values.address.line1}</p>
              <p>
                {data.values.address.city}, {data.values.address.state}{" "}
                {data.values.address.postalCode}
              </p>
              <p>{data.values.address.country}</p>
            </div>
            <div className="detail-card">
              <h2>Collections</h2>
              <p>Dependents: {data.values.dependents.length}</p>
              <p>Emergency contacts: {data.values.emergencyContacts.length}</p>
              <p>Equipment requests: {data.values.equipmentRequests.length}</p>
            </div>
          </div>
        </section>
      ) : null}
    </main>
  );
}

function DashboardPage() {
  const navigate = useNavigate();
  const { pushToast } = useToast();
  const { data: employees = [], isLoading } = useListEmployeesQuery();
  const [createEmployee] = useCreateEmployeeMutation();

  return (
    <main className="dashboard-layout">
      <section className="dashboard-card">
        <div>
          <p className="eyebrow">Employee Directory</p>
          <h1>Internal dashboard</h1>
          <p>
            The demo now persists employee records across reloads and routes
            each wizard to an explicit employee id.
          </p>
        </div>
        <Link to="/employees/emp-2048/onboarding" className="ghost-link">
          Open seeded demo employee
        </Link>
      </section>

      <section className="dashboard-card dashboard-stack">
        <div>
          <p className="eyebrow">Create</p>
          <h2>Add employee</h2>
        </div>
        <EmployeeForm
          submitLabel="Create employee"
          initialValues={emptyEmployee}
          onSubmit={async (values) => {
            try {
              const created = await createEmployee(values).unwrap();
              pushToast(`Created employee ${created.employeeId}`, "success");
              navigate(`/employees/${created.employeeId}`);
            } catch {
              pushToast("Failed to create employee", "error");
              throw new Error("create failed");
            }
          }}
        />
      </section>

      <GlobalSaveStatePanel />

      <section className="dashboard-card dashboard-stack">
        <div>
          <p className="eyebrow">Existing Employees</p>
          <h2>Directory</h2>
          <p>
            Use the actions below to read, update, and delete employees. The
            wizard route remains `/employees/:employeeId/onboarding`.
          </p>
        </div>
        {isLoading ? <p>Loading employees...</p> : null}
        {!isLoading && employees.length === 0 ? (
          <p>No employees available.</p>
        ) : null}
        <div className="employee-list">
          {employees.map((employee) => (
            <EmployeeRow key={employee.employeeId} employee={employee} />
          ))}
        </div>
      </section>
    </main>
  );
}

export default function App() {
  return (
    <>
      <GlobalSaveStateWidget />
      <GlobalAutosaveLogWidget />
      <Routes>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route
          path="/employees/:employeeId"
          element={<EmployeeDetailsPage />}
        />
        <Route
          path="/employees/:employeeId/onboarding"
          element={<WizardDemoPage />}
        />
      </Routes>
    </>
  );
}
