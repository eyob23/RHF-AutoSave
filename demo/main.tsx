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

async function bootstrap() {
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
              <BrowserRouter basename={import.meta.env.BASE_URL}>
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
