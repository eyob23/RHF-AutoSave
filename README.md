# RHF Enterprise Autosave

Reusable autosave primitives for large React Hook Form workflows with deep objects, dynamic arrays, multi-endpoint save pipelines, and optional IndexedDB-backed queue persistence.

## Highlights

- Debounced autosave with React Hook Form subscriptions instead of render-time watchers
- Stable controller identity plus selector subscriptions to reduce unrelated rerenders
- Partial payload extraction from changed paths
- Array diff handlers for add, remove, and modify flows
- Queue replay support with pluggable stores and IndexedDB persistence
- Transport adapters for fetch, RTK Query, and composed multi-endpoint saves
- Undo, redo, manual flush, force-save, hydration, and unload protection

## Install

```bash
npm install @workspace/rhf-enterprise-autosave
```

Peer dependencies:

- react 18+
- react-dom 18+
- react-hook-form 7+
- react-router-dom 6.22+ or 7+
- @reduxjs/toolkit 2+

## Runnable demo

This repo now includes a runnable Vite demo with React Router, Redux Toolkit + RTK Query, and an MSW-backed mock API.

```bash
npm install
npm run demo
```

Open `http://localhost:4173`.

The demo is also prepared for static hosting on GitHub Pages. The production build keeps the MSW-backed mock API enabled and emits a `404.html` SPA fallback for deep links.

Supporting files:

- Demo app entry: [demo/main.tsx](demo/main.tsx)
- Router shell: [demo/App.tsx](demo/App.tsx)
- RTK Query API slice: [demo/api/employeesApi.ts](demo/api/employeesApi.ts)
- MSW handlers: [demo/mocks/handlers.ts](demo/mocks/handlers.ts)
- Service worker asset: [public/mockServiceWorker.js](public/mockServiceWorker.js)
- Wizard example: [examples/EmployeeOnboardingWizard.tsx](examples/EmployeeOnboardingWizard.tsx)

### GitHub Pages deployment

If this workspace is connected to a GitHub repository, the included workflow publishes the Vite demo to GitHub Pages on pushes to `main`.

```bash
npm run demo:build
```

The Pages artifact is written to `demo-dist/`.

Notes:

- The deployed demo uses `import.meta.env.BASE_URL` so it works from a repository subpath.
- The mock API remains active in the published demo via MSW, so no backend is required.
- `demo-dist/404.html` is generated so direct links like `/employees/:employeeId/onboarding` can reload correctly on GitHub Pages.


### Demo routes

- `/dashboard` — employee directory with create, read, update, and delete actions
- `/employees/:employeeId` — read-only employee details page
- `/employees/:employeeId/onboarding` — full autosave onboarding wizard

### Dashboard UX behavior

- CRUD operations use optimistic cache updates in RTK Query so row changes appear immediately.
- Toast notifications appear for successful and failed create/update/delete actions.
- Employee records are persisted in mock storage and reloaded after refresh.

## Basic usage

```tsx
import { useForm } from "react-hook-form";
import { fetchTransport, useBeforeUnload, useRhfAutosave } from "@workspace/rhf-enterprise-autosave";

type ProfileForm = {
  profile: {
    firstName: string;
    lastName: string;
  };
  contacts: Array<{ id: string; email: string }>;
};

export function ProfileEditor() {
  const form = useForm<ProfileForm>({
    defaultValues: {
      profile: {
        firstName: "",
        lastName: "",
      },
      contacts: [],
    },
  });

  const autosave = useRhfAutosave({
    form,
    transport: fetchTransport("/api/profile"),
    config: {
      debounceMs: 600,
    },
  });

  useBeforeUnload(autosave.hasPendingChanges);

  return (
    <form>
      <input {...form.register("profile.firstName")} />
      <input {...form.register("profile.lastName")} />
      <p>{autosave.isSaving ? "Saving..." : autosave.hasPendingChanges ? "Editing..." : "All changes saved"}</p>
    </form>
  );
}
```

## Selector usage

Use selector subscriptions when only a narrow autosave slice should drive rendering.

```tsx
const autosave = useRhfAutosave({ form, transport });
const queuedCount = useAutosaveSelector(autosave, (state) => state.queuedCount);
```

## Queue persistence

```tsx
import { createIndexedDbQueueStore, useRhfAutosave } from "@workspace/rhf-enterprise-autosave";

const queueStore = createIndexedDbQueueStore({
  databaseName: "customer-profile-autosave",
  storeName: "pending-saves",
});

const autosave = useRhfAutosave({
  form,
  transport,
  queue: {
    enabled: true,
    store: queueStore,
    retryOnReconnect: true,
  },
});
```

## Multi-endpoint saves

```tsx
import { composeTransports, fetchTransport, rtkQueryTransport } from "@workspace/rhf-enterprise-autosave";

const transport = composeTransports([
  {
    transport: fetchTransport("/api/profile"),
    when: ({ changedPaths }) => changedPaths.some((path) => path.startsWith("profile.")),
  },
  {
    transport: rtkQueryTransport(updateContactsTrigger),
    when: ({ changedPaths }) => changedPaths.some((path) => path.startsWith("contacts")),
  },
]);
```

## Strict endpoint partitioning

Use `createPartitionedTransport` when each backend endpoint owns a specific subtree and you want unmatched changes to fail fast instead of silently falling through generic composition.

```tsx
import { createPartitionedTransport, fetchTransport, rtkQueryTransport } from "@workspace/rhf-enterprise-autosave";

const transport = createPartitionedTransport([
  {
    key: "profile",
    paths: ["profile", "address"],
    transport: fetchTransport("/api/employees/emp-42/profile"),
  },
  {
    key: "employment",
    paths: ["employment", "equipmentRequests"],
    transport: rtkQueryTransport(saveEmploymentMutation),
  },
  {
    key: "benefits",
    paths: ["benefits", "dependents", "payroll"],
    transport: fetchTransport("/api/employees/emp-42/benefits-enrollment", { method: "PUT" }),
  },
]);
```

See the full realistic wizard example in [examples/EmployeeOnboardingWizard.tsx](examples/EmployeeOnboardingWizard.tsx).

## Core exports

- `useRhfAutosave`
- `useAutosaveSelector`
- `useBeforeUnload`
- `useAutosaveBlocker`
- `fetchTransport`
- `rtkQueryTransport`
- `composeTransports`
- `withRetry`
- `createIndexedDbQueueStore`
- Nested path and deep-diff utilities from `src/utils`