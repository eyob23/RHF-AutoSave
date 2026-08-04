import React from "react";
import ReactDOM from "react-dom/client";
import { Provider } from "react-redux";
import { BrowserRouter } from "react-router-dom";
import {
  AutosaveRuntimeProvider,
  createIndexedDbQueueStore,
  resolveEntityKeyFromMergeKey,
} from "../src";
import type { EmployeeOnboardingFormValues } from "../examples/employeeOnboardingModel";
import App from "./App";
import { store } from "./store";
import { ToastProvider } from "./toast";
import "./styles.css";

const bootQueueStore = createIndexedDbQueueStore<EmployeeOnboardingFormValues>({
  databaseName: "employee-onboarding-autosave",
  storeName: "pending-saves",
});

function getRouterBaseName(baseUrl: string) {
  if (baseUrl === "/") {
    return "/";
  }

  return baseUrl.replace(/\/$/, "");
}

function normalizeDuplicatedRepoPath(baseUrl: string) {
  if (typeof window === "undefined" || baseUrl === "/") {
    return;
  }

  const normalizedBase = baseUrl.replace(/\/$/, "");
  const doubledBase = `${normalizedBase}${normalizedBase}`;
  if (
    window.location.pathname !== doubledBase &&
    !window.location.pathname.startsWith(`${doubledBase}/`)
  ) {
    return;
  }

  const normalizedPathname = window.location.pathname.slice(
    normalizedBase.length,
  );
  window.history.replaceState(
    window.history.state,
    "",
    `${normalizedPathname}${window.location.search}${window.location.hash}`,
  );
}

async function bootstrap() {
  normalizeDuplicatedRepoPath(import.meta.env.BASE_URL);

  if (typeof window !== "undefined") {
    const { worker } = await import("./mocks/browser");
    await worker.start({
      onUnhandledRequest: "bypass",
      serviceWorker: {
        url: `${import.meta.env.BASE_URL}mockServiceWorker.js`,
      },
    });
  }

  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <Provider store={store}>
        <AutosaveRuntimeProvider
          queueSources={[
            {
              store: bootQueueStore,
              resolveEntityKey: (record) =>
                resolveEntityKeyFromMergeKey(record.mergeKey),
            },
          ]}
        >
          <ToastProvider>
            <BrowserRouter basename={getRouterBaseName(import.meta.env.BASE_URL)}>
              <App />
            </BrowserRouter>
          </ToastProvider>
        </AutosaveRuntimeProvider>
      </Provider>
    </React.StrictMode>,
  );
}

void bootstrap();
