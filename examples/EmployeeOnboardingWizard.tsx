import { memo, useCallback, useEffect, useMemo, useRef } from "react";
import {
  FormProvider,
  useFieldArray,
  useForm,
  useFormContext,
} from "react-hook-form";
import { useLocation, useSearchParams } from "react-router-dom";
import {
  AutosaveMutationLog,
  AutosaveStateSummary,
  type AutosaveMutationLogEntry,
  createIndexedDbQueueStore,
  isDeepEqual,
  useAutosaveSelector,
  useAutosaveBlocker,
  useRhfAutosave,
} from "../src";
import type { AutosaveState } from "../src";
import {
  createEmployeeOnboardingTransport,
  defaultEmployeeOnboardingValues,
  type EmployeeOnboardingFormValues,
  type SaveEmploymentMutation,
} from "./employeeOnboardingModel";

const queueStore = createIndexedDbQueueStore<EmployeeOnboardingFormValues>({
  databaseName: "employee-onboarding-autosave",
  storeName: "pending-saves",
});

function Field(props: { label: string; children: React.ReactNode }) {
  return (
    <label className="wizard-field">
      <span className="wizard-field-label">{props.label}</span>
      {props.children}
    </label>
  );
}

function StepHeader(props: { title: string; description: string }) {
  return (
    <header className="wizard-step-header">
      <h2>{props.title}</h2>
      <p>{props.description}</p>
    </header>
  );
}

function ProfileStep() {
  const { register } = useFormContext<EmployeeOnboardingFormValues>();

  return (
    <section className="wizard-step">
      <StepHeader
        title="Profile"
        description="Identity, start-date, and personal contact information."
      />
      <div className="wizard-grid-2">
        <Field label="First name">
          <input {...register("profile.firstName")} />
        </Field>
        <Field label="Last name">
          <input {...register("profile.lastName")} />
        </Field>
        <Field label="Preferred name">
          <input {...register("profile.preferredName")} />
        </Field>
        <Field label="Birth date">
          <input type="date" {...register("profile.birthDate")} />
        </Field>
        <Field label="Personal email">
          <input type="email" {...register("profile.personalEmail")} />
        </Field>
        <Field label="Mobile phone">
          <input type="tel" {...register("profile.mobilePhone")} />
        </Field>
        <Field label="Citizenship status">
          <select {...register("profile.citizenshipStatus")}>
            <option value="citizen">Citizen</option>
            <option value="permanent_resident">Permanent resident</option>
            <option value="visa">Visa</option>
          </select>
        </Field>
        <Field label="Start date">
          <input type="date" {...register("profile.startDate")} />
        </Field>
      </div>
      <StepHeader
        title="Address"
        description="Home address used for payroll and employment records."
      />
      <div className="wizard-grid-2">
        <Field label="Line 1">
          <input {...register("address.line1")} />
        </Field>
        <Field label="Line 2">
          <input {...register("address.line2")} />
        </Field>
        <Field label="City">
          <input {...register("address.city")} />
        </Field>
        <Field label="State">
          <input {...register("address.state")} />
        </Field>
        <Field label="Postal code">
          <input {...register("address.postalCode")} />
        </Field>
        <Field label="Country">
          <input {...register("address.country")} />
        </Field>
      </div>
    </section>
  );
}

function EmploymentStep() {
  const { register } = useFormContext<EmployeeOnboardingFormValues>();
  const equipment = useFieldArray({ name: "equipmentRequests" });

  return (
    <section className="wizard-step">
      <StepHeader
        title="Employment"
        description="Role assignment, compensation, and workstation requests."
      />
      <div className="wizard-grid-2">
        <Field label="Job title">
          <input {...register("employment.title")} />
        </Field>
        <Field label="Department">
          <input {...register("employment.department")} />
        </Field>
        <Field label="Manager ID">
          <input {...register("employment.managerId")} />
        </Field>
        <Field label="Location code">
          <input {...register("employment.locationCode")} />
        </Field>
        <Field label="Base salary">
          <input
            type="number"
            {...register("employment.salary", { valueAsNumber: true })}
          />
        </Field>
        <Field label="Work mode">
          <div className="wizard-choice-row">
            <label>
              <input
                type="radio"
                value="remote"
                {...register("employment.workMode")}
              />{" "}
              Remote
            </label>
            <label>
              <input
                type="radio"
                value="hybrid"
                {...register("employment.workMode")}
              />{" "}
              Hybrid
            </label>
            <label>
              <input
                type="radio"
                value="onsite"
                {...register("employment.workMode")}
              />{" "}
              Onsite
            </label>
          </div>
        </Field>
        <Field label="Bonus eligible">
          <input type="checkbox" {...register("employment.bonusEligible")} />
        </Field>
        <Field label="Employment notes">
          <textarea rows={4} {...register("employment.notes")} />
        </Field>
      </div>

      <StepHeader
        title="Equipment requests"
        description="Dynamic line items routed to the employment provisioning endpoint."
      />
      {equipment.fields.map((field, index) => (
        <div
          key={field.id}
          className="wizard-collection-row wizard-collection-row-equipment"
        >
          <Field label="Type">
            <select {...register(`equipmentRequests.${index}.type`)}>
              <option value="laptop">Laptop</option>
              <option value="monitor">Monitor</option>
              <option value="keyboard">Keyboard</option>
              <option value="dock">Dock</option>
              <option value="phone">Phone</option>
            </select>
          </Field>
          <Field label="Justification">
            <input {...register(`equipmentRequests.${index}.justification`)} />
          </Field>
          <Field label="Required by">
            <input
              type="date"
              {...register(`equipmentRequests.${index}.requiredBy`)}
            />
          </Field>
          <button
            type="button"
            onClick={() => equipment.remove(index)}
            className="wizard-row-action"
          >
            Remove
          </button>
        </div>
      ))}
      <button
        className="wizard-secondary-action"
        type="button"
        onClick={() =>
          equipment.append({
            id: crypto.randomUUID(),
            type: "laptop",
            justification: "",
            requiredBy: "",
          })
        }
      >
        Add equipment request
      </button>
    </section>
  );
}

function BenefitsStep() {
  const { register } = useFormContext<EmployeeOnboardingFormValues>();
  const dependents = useFieldArray({ name: "dependents" });

  return (
    <section className="wizard-step">
      <StepHeader
        title="Benefits and payroll"
        description="Plan enrollment, dependents, and payroll configuration."
      />
      <div className="wizard-grid-2">
        <Field label="Medical plan">
          <select {...register("benefits.medicalPlan")}>
            <option value="basic">Basic</option>
            <option value="plus">Plus</option>
            <option value="family">Family</option>
          </select>
        </Field>
        <Field label="T-shirt size">
          <select {...register("benefits.tshirtSize")}>
            <option value="xs">XS</option>
            <option value="s">S</option>
            <option value="m">M</option>
            <option value="l">L</option>
            <option value="xl">XL</option>
          </select>
        </Field>
        <Field label="Dental">
          <input type="checkbox" {...register("benefits.dental")} />
        </Field>
        <Field label="Vision">
          <input type="checkbox" {...register("benefits.vision")} />
        </Field>
        <Field label="Tax ID">
          <input {...register("payroll.taxId")} />
        </Field>
        <Field label="Bank name">
          <input {...register("payroll.bankName")} />
        </Field>
        <Field label="Account last 4">
          <input {...register("payroll.accountLast4")} />
        </Field>
        <Field label="Retirement contribution %">
          <input
            type="number"
            {...register("payroll.retirementContributionPct", {
              valueAsNumber: true,
            })}
          />
        </Field>
      </div>

      <StepHeader
        title="Dependents"
        description="Complex array payload routed with benefits enrollment."
      />
      {dependents.fields.map((field, index) => (
        <div
          key={field.id}
          className="wizard-collection-row wizard-collection-row-dependents"
        >
          <Field label="First name">
            <input {...register(`dependents.${index}.firstName`)} />
          </Field>
          <Field label="Last name">
            <input {...register(`dependents.${index}.lastName`)} />
          </Field>
          <Field label="Relationship">
            <select {...register(`dependents.${index}.relationship`)}>
              <option value="child">Child</option>
              <option value="spouse">Spouse</option>
              <option value="domestic_partner">Domestic partner</option>
            </select>
          </Field>
          <Field label="Birth date">
            <input type="date" {...register(`dependents.${index}.birthDate`)} />
          </Field>
          <Field label="Covered">
            <input
              type="checkbox"
              {...register(`dependents.${index}.covered`)}
            />
          </Field>
          <button
            type="button"
            onClick={() => dependents.remove(index)}
            className="wizard-row-action"
          >
            Remove
          </button>
        </div>
      ))}
      <button
        className="wizard-secondary-action"
        type="button"
        onClick={() =>
          dependents.append({
            id: crypto.randomUUID(),
            firstName: "",
            lastName: "",
            relationship: "child",
            birthDate: "",
            covered: false,
          })
        }
      >
        Add dependent
      </button>
    </section>
  );
}

function ContactsStep() {
  const { register } = useFormContext<EmployeeOnboardingFormValues>();
  const contacts = useFieldArray({ name: "emergencyContacts" });

  return (
    <section className="wizard-step">
      <StepHeader
        title="Emergency contacts"
        description="Dedicated collection endpoint with primary contact flags."
      />
      {contacts.fields.map((field, index) => (
        <div
          key={field.id}
          className="wizard-collection-row wizard-collection-row-contacts"
        >
          <Field label="Name">
            <input {...register(`emergencyContacts.${index}.name`)} />
          </Field>
          <Field label="Relationship">
            <input {...register(`emergencyContacts.${index}.relationship`)} />
          </Field>
          <Field label="Phone">
            <input
              type="tel"
              {...register(`emergencyContacts.${index}.phone`)}
            />
          </Field>
          <Field label="Email">
            <input
              type="email"
              {...register(`emergencyContacts.${index}.email`)}
            />
          </Field>
          <Field label="Primary">
            <input
              type="checkbox"
              {...register(`emergencyContacts.${index}.primary`)}
            />
          </Field>
          <button
            type="button"
            onClick={() => contacts.remove(index)}
            className="wizard-row-action"
          >
            Remove
          </button>
        </div>
      ))}
      <button
        className="wizard-secondary-action"
        type="button"
        onClick={() =>
          contacts.append({
            id: crypto.randomUUID(),
            name: "",
            relationship: "",
            phone: "",
            email: "",
            primary: false,
          })
        }
      >
        Add emergency contact
      </button>

      <StepHeader
        title="Acknowledgements"
        description="Required confirmations saved with benefits and compliance state."
      />
      <div className="wizard-check-grid">
        <label>
          <input
            type="checkbox"
            {...register("acknowledgements.handbookAccepted")}
          />{" "}
          Employee handbook accepted
        </label>
        <label>
          <input
            type="checkbox"
            {...register("acknowledgements.dataPolicyAccepted")}
          />{" "}
          Data policy accepted
        </label>
        <label>
          <input
            type="checkbox"
            {...register("acknowledgements.codeOfConductAccepted")}
          />{" "}
          Code of conduct accepted
        </label>
      </div>
    </section>
  );
}

type WizardStepKey = "profile" | "employment" | "benefits" | "contacts";

interface WizardStepConfig {
  key: WizardStepKey;
  label: string;
}

const WIZARD_STEP_CONFIG: readonly WizardStepConfig[] = [
  { key: "profile", label: "Profile" },
  { key: "employment", label: "Employment" },
  { key: "benefits", label: "Benefits" },
  { key: "contacts", label: "Contacts" },
] as const;

const WIZARD_STEP_KEYS = WIZARD_STEP_CONFIG.map((step) => step.key);

function WizardStepContent(props: { stepKey: WizardStepKey }) {
  switch (props.stepKey) {
    case "profile":
      return <ProfileStep />;
    case "employment":
      return <EmploymentStep />;
    case "benefits":
      return <BenefitsStep />;
    case "contacts":
      return <ContactsStep />;
    default:
      return <ProfileStep />;
  }
}

const WizardContentCard = memo(function WizardContentCard(props: {
  currentStepKey: WizardStepKey;
  stepIndex: number;
  stepCount: number;
  onStepChange: React.Dispatch<React.SetStateAction<number>>;
}) {
  return (
    <section className="wizard-content-card">
      <WizardStepContent stepKey={props.currentStepKey} />
      <div className="wizard-pagination">
        <button
          className="wizard-secondary-action"
          type="button"
          onClick={() => props.onStepChange((value) => Math.max(0, value - 1))}
          disabled={props.stepIndex === 0}
        >
          Previous
        </button>
        <button
          className="wizard-primary-action"
          type="button"
          onClick={() =>
            props.onStepChange((value) =>
              Math.min(props.stepCount - 1, value + 1),
            )
          }
          disabled={props.stepIndex === props.stepCount - 1}
        >
          Next
        </button>
      </div>
    </section>
  );
});

function WizardStatus(props: {
  autosave: ReturnType<typeof useRhfAutosave<EmployeeOnboardingFormValues>>;
}) {
  return (
    <aside className="wizard-status-panel">
      <div className="wizard-status-section">
        <AutosaveStateSummary controller={props.autosave} title="Autosave" />
      </div>

      <div className="wizard-status-section">
        <AutosaveMutationLog
          controller={props.autosave}
          title="Mutation log"
          maxItems={12}
        />
      </div>
    </aside>
  );
}

function WizardAutosaveBlocker(props: {
  autosave: ReturnType<typeof useRhfAutosave<EmployeeOnboardingFormValues>>;
}) {
  const hasPendingChanges = useAutosaveSelector(
    props.autosave,
    (state) => state.hasPendingChanges,
  );
  useAutosaveBlocker(
    hasPendingChanges,
    "You have unsaved onboarding changes. Select Cancel to stay and continue editing, or OK to leave without saving.",
  );

  return null;
}

function WizardNav(props: {
  autosave: ReturnType<typeof useRhfAutosave<EmployeeOnboardingFormValues>>;
  steps: Array<{ key: string; label: string }>;
  stepIndex: number;
  setStepIndex: React.Dispatch<React.SetStateAction<number>>;
}) {
  // Subscribe locally so autosave updates rerender only navigation, not the whole form shell.
  const isSaving = useAutosaveSelector(
    props.autosave,
    (state) => state.isSaving,
  );
  const hasPendingChanges = useAutosaveSelector(
    props.autosave,
    (state) => state.hasPendingChanges,
  );

  return (
    <nav className="wizard-nav">
      {props.steps.map((step, index) => (
        <button
          key={step.key}
          type="button"
          onClick={() => props.setStepIndex(index)}
          className={`wizard-nav-step ${index === props.stepIndex ? "wizard-nav-step-active" : ""}`}
        >
          {step.label}
        </button>
      ))}
      <button
        className="wizard-primary-action"
        type="button"
        onClick={() => void props.autosave.flush()}
        disabled={isSaving}
      >
        Save now
      </button>
      <button
        className="wizard-secondary-action"
        type="button"
        onClick={() => props.autosave.undo()}
        disabled={!props.autosave.canUndo || isSaving}
      >
        Undo change
      </button>
      <button
        className="wizard-secondary-action"
        type="button"
        onClick={() => props.autosave.redo()}
        disabled={!props.autosave.canRedo || isSaving}
      >
        Redo change
      </button>
      <button
        className="wizard-secondary-action"
        type="button"
        onClick={() => props.autosave.undoLastSave()}
        disabled={!hasPendingChanges}
      >
        Revert to last save
      </button>
    </nav>
  );
}

function resolveOnboardingEndpoint(changedPaths: string[]) {
  if (
    changedPaths.some(
      (path) =>
        path === "profile" ||
        path.startsWith("profile.") ||
        path === "address" ||
        path.startsWith("address."),
    )
  ) {
    return "profile";
  }

  if (
    changedPaths.some(
      (path) =>
        path === "employment" ||
        path.startsWith("employment.") ||
        path === "equipmentRequests" ||
        path.startsWith("equipmentRequests."),
    )
  ) {
    return "employment";
  }

  if (
    changedPaths.some(
      (path) =>
        path === "benefits" ||
        path.startsWith("benefits.") ||
        path === "dependents" ||
        path.startsWith("dependents.") ||
        path === "payroll" ||
        path.startsWith("payroll.") ||
        path === "acknowledgements" ||
        path.startsWith("acknowledgements."),
    )
  ) {
    return "benefits";
  }

  if (
    changedPaths.some(
      (path) =>
        path === "emergencyContacts" || path.startsWith("emergencyContacts."),
    )
  ) {
    return "emergencyContacts";
  }

  return "unknown";
}

function resolvePrimaryObjectId(
  values: EmployeeOnboardingFormValues,
  changedPaths: string[],
  fallbackEmployeeId: string,
) {
  const dependentIds = new Set<string>();

  for (const path of changedPaths) {
    const segments = path.split(".");
    const collection = segments[0];
    const index = Number(segments[1]);
    if (!Number.isFinite(index) || index < 0) {
      continue;
    }

    if (collection === "dependents") {
      const id = values.dependents[index]?.id;
      if (id) {
        dependentIds.add(id);
      }
      continue;
    }

    if (collection === "emergencyContacts") {
      const id = values.emergencyContacts[index]?.id;
      if (id) {
        dependentIds.add(id);
      }
      continue;
    }

    if (collection === "equipmentRequests") {
      const id = values.equipmentRequests[index]?.id;
      if (id) {
        dependentIds.add(id);
      }
    }
  }

  if (dependentIds.size === 1) {
    return [...dependentIds][0] ?? fallbackEmployeeId;
  }

  return fallbackEmployeeId;
}

function EmployeeOnboardingWizardInner(props: {
  employeeId: string;
  saveEmploymentMutation: SaveEmploymentMutation;
  initialValues?: EmployeeOnboardingFormValues;
  onAutosaveSaved?: () => void;
  onAutosaveError?: (error: Error) => void;
  onAutosaveStateChange?: (state: AutosaveState) => void;
  onAutosaveLog?: (
    entry: AutosaveMutationLogEntry<Partial<EmployeeOnboardingFormValues>>,
  ) => void;
}) {
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const previousEmployeeIdRef = useRef<string | null>(null);
  const previousInitialValuesRef = useRef<EmployeeOnboardingFormValues | null>(
    null,
  );
  const previousLastSavedAtRef = useRef<number | null>(null);
  const previousErrorRef = useRef<string | null>(null);
  const hasUserInteractedRef = useRef(false);
  const form = useForm<EmployeeOnboardingFormValues>({
    defaultValues: props.initialValues ?? defaultEmployeeOnboardingValues,
    mode: "onChange",
  });
  const steps = WIZARD_STEP_CONFIG;
  const stepKeys = WIZARD_STEP_KEYS;
  const tabParam = searchParams.get("tab");
  const stepIndex = tabParam
    ? stepKeys.indexOf(tabParam as (typeof stepKeys)[number])
    : -1;
  const resolvedStepIndex = stepIndex >= 0 ? stepIndex : 0;
  const resolvedInitialValues =
    props.initialValues ?? defaultEmployeeOnboardingValues;

  const setStepIndex = useCallback(
    (updater: React.SetStateAction<number>) => {
      const nextIndex =
        typeof updater === "function" ? updater(resolvedStepIndex) : updater;

      const clamped = Math.min(Math.max(nextIndex, 0), steps.length - 1);
      const nextKey = stepKeys[clamped] ?? stepKeys[0];
      if (!nextKey) {
        return;
      }

      const nextParams = new URLSearchParams(location.search);
      nextParams.set("tab", nextKey);
      setSearchParams(nextParams);
    },
    [
      location.search,
      resolvedStepIndex,
      setSearchParams,
      stepKeys,
      steps.length,
    ],
  );

  useEffect(() => {
    const employeeChanged = previousEmployeeIdRef.current !== props.employeeId;
    const initialValuesChanged =
      previousInitialValuesRef.current === null ||
      !isDeepEqual(previousInitialValuesRef.current, resolvedInitialValues);

    if (!employeeChanged && !initialValuesChanged) {
      return;
    }

    if (employeeChanged) {
      hasUserInteractedRef.current = false;
      previousLastSavedAtRef.current = null;
      previousErrorRef.current = null;
      setSearchParams({ tab: "profile" }, { replace: true });
    }

    form.reset(resolvedInitialValues);
    previousEmployeeIdRef.current = props.employeeId;
    previousInitialValuesRef.current = resolvedInitialValues;
  }, [form, props.employeeId, resolvedInitialValues, setSearchParams]);

  useEffect(() => {
    if (form.formState.isDirty) {
      hasUserInteractedRef.current = true;
    }
  }, [form.formState.isDirty]);

  const transport = useMemo(
    () =>
      createEmployeeOnboardingTransport(
        props.employeeId,
        props.saveEmploymentMutation,
      ),
    [props.employeeId, props.saveEmploymentMutation],
  );

  const navSteps = useMemo(
    () => steps.map(({ key, label }) => ({ key, label })),
    [steps],
  );

  const autosave = useRhfAutosave({
    form,
    transport,
    validateBeforeSave: "payload",
    onStatusChange: (state) => {
      props.onAutosaveStateChange?.(state);

      const nextSavedAt = state.lastSavedAt ?? null;
      if (
        hasUserInteractedRef.current &&
        state.phase === "saved" &&
        nextSavedAt &&
        previousLastSavedAtRef.current !== nextSavedAt
      ) {
        previousLastSavedAtRef.current = nextSavedAt;
        props.onAutosaveSaved?.();
      }

      const nextErrorMessage = state.lastError?.message ?? null;
      if (
        hasUserInteractedRef.current &&
        state.phase === "error" &&
        state.lastError &&
        previousErrorRef.current !== nextErrorMessage
      ) {
        previousErrorRef.current = nextErrorMessage;
        props.onAutosaveError?.(state.lastError);
      }

      if (state.phase !== "error") {
        previousErrorRef.current = null;
      }
    },
    config: {
      debounceMs: 900,
      maxRetries: 2,
      retryDelayMs: 500,
    },
    queue: {
      enabled: true,
      retryOnReconnect: true,
      store: queueStore,
    },
    undo: {
      enabled: true,
      keyboardShortcuts: true,
      captureDebounceMs: 200,
      limit: 100,
    },
    merge: {
      enabled: true,
      getKey: ({ values, changedPaths }) => {
        const endpoint = resolveOnboardingEndpoint(changedPaths);
        const primaryId = resolvePrimaryObjectId(
          values,
          changedPaths,
          props.employeeId,
        );
        return `${endpoint}:${primaryId}`;
      },
      changedPathsStrategy: "union",
    },
    diffMap: {
      dependents: {
        idOf: (item) => (item as { id: string }).id,
      },
      emergencyContacts: {
        idOf: (item) => (item as { id: string }).id,
      },
      equipmentRequests: {
        idOf: (item) => (item as { id: string }).id,
      },
    },
    ...(props.onAutosaveLog
      ? {
          mutationLog: {
            target: "both" as const,
            onLog: props.onAutosaveLog,
          },
        }
      : {}),
  });

  const currentStepKey = steps[resolvedStepIndex]?.key ?? "profile";

  return (
    <FormProvider {...form}>
      <WizardAutosaveBlocker autosave={autosave} />
      <form className="wizard-shell">
        <WizardNav
          autosave={autosave}
          steps={navSteps}
          stepIndex={resolvedStepIndex}
          setStepIndex={setStepIndex}
        />

        <WizardContentCard
          currentStepKey={currentStepKey}
          stepIndex={resolvedStepIndex}
          stepCount={steps.length}
          onStepChange={setStepIndex}
        />

        <WizardStatus autosave={autosave} />
      </form>
    </FormProvider>
  );
}

export const EmployeeOnboardingWizard = memo(EmployeeOnboardingWizardInner);
