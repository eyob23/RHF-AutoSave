import React from "react";
import ReactDOM from "react-dom/client";
import { Provider } from "react-redux";
import { BrowserRouter } from "react-router-dom";
import {
  GlobalAutosaveStateProvider,
  createIndexedDbQueueStore,
  useGlobalAutosaveQueueBootstrap,
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

function resolveEntityKeyFromMergeKey(mergeKey: string | undefined) {
  if (!mergeKey) {
    return null;
  }

  const separatorIndex = mergeKey.lastIndexOf(":");
  if (separatorIndex < 0 || separatorIndex === mergeKey.length - 1) {
    return mergeKey;
  }

  return mergeKey.slice(separatorIndex + 1);
}

function GlobalAutosaveQueueBootstrapper(props: { children: React.ReactNode }) {
  useGlobalAutosaveQueueBootstrap([
    {
      store: bootQueueStore,
      resolveEntityKey: (record) =>
        resolveEntityKeyFromMergeKey(record.mergeKey),
    },
  ]);

  return <>{props.children}</>;
}

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
        <GlobalAutosaveStateProvider>
          <GlobalAutosaveQueueBootstrapper>
            <ToastProvider>
              <BrowserRouter
                basename={getRouterBaseName(import.meta.env.BASE_URL)}
              >
                <App />
              </BrowserRouter>
            </ToastProvider>
          </GlobalAutosaveQueueBootstrapper>
        </GlobalAutosaveStateProvider>
      </Provider>
    </React.StrictMode>,
  );
}

void bootstrap();
