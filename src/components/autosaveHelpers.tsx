import { useState } from "react";
import type { AutosaveController, AutosaveMutationLogEntry } from "../core/types";
import { useAutosaveSelector } from "../hooks/useAutosaveSelector";

type AnyRecord = Record<string, unknown>;

type AutosaveControllerLike<
  TFormValues extends AnyRecord,
  TPayload,
  TResult,
> = Pick<
  AutosaveController<TFormValues, TPayload, TResult>,
  "getState" | "subscribe" | "replayQueuedSaves"
>;

function hasPayload(value: unknown) {
  if (!value) {
    return false;
  }

  if (typeof value !== "object") {
    return true;
  }

  return Object.keys(value as Record<string, unknown>).length > 0;
}

function defaultTimestampFormatter(timestamp: number) {
  return new Date(timestamp).toLocaleString();
}

export function AutosaveStateSummary<
  TFormValues extends AnyRecord,
  TPayload,
  TResult,
>(props: {
  controller: AutosaveControllerLike<TFormValues, TPayload, TResult>;
  title?: string;
  retryLabel?: string;
}) {
  const phase = useAutosaveSelector(props.controller, (state) => state.phase);
  const queuedCount = useAutosaveSelector(props.controller, (state) => state.queuedCount);
  const hasPendingChanges = useAutosaveSelector(props.controller, (state) => state.hasPendingChanges);
  const [isRetrying, setIsRetrying] = useState(false);

  return (
    <section>
      <strong>{props.title ?? "Autosave"}</strong>
      <div>Phase: {phase}</div>
      <div>Queued saves: {queuedCount}</div>
      <div>Pending: {hasPendingChanges ? "Yes" : "No"}</div>

      {queuedCount > 0 ? (
        <div
          style={{
            marginTop: 12,
            padding: 10,
            borderRadius: 8,
            border: "1px solid #f59e0b",
            background: "#fffbeb",
          }}
        >
          <div style={{ marginBottom: 8 }}>Unsaved changes were queued. Retry when ready.</div>
          <button
            type="button"
            onClick={async () => {
              setIsRetrying(true);
              try {
                await props.controller.replayQueuedSaves();
              } finally {
                setIsRetrying(false);
              }
            }}
            disabled={isRetrying}
          >
            {isRetrying ? "Retrying..." : props.retryLabel ?? "Retry now"}
          </button>
        </div>
      ) : null}
    </section>
  );
}

export function AutosaveMutationLog<
  TFormValues extends AnyRecord,
  TPayload,
  TResult,
>(props: {
  controller: AutosaveControllerLike<TFormValues, TPayload, TResult>;
  title?: string;
  emptyMessage?: string;
  maxItems?: number;
  showPayload?: boolean;
  timestampFormatter?: (timestamp: number) => string;
}) {
  const mutationLog = useAutosaveSelector(props.controller, (state) => state.mutationLog);
  const maxItems = props.maxItems ?? 10;
  const logItems = mutationLog.slice(0, maxItems) as AutosaveMutationLogEntry<TPayload>[];
  const formatTimestamp = props.timestampFormatter ?? defaultTimestampFormatter;

  return (
    <section>
      <strong>{props.title ?? "Mutation log"}</strong>
      <ul style={{ margin: "8px 0 0", paddingLeft: 18, display: "grid", gap: 6 }}>
        {logItems.length === 0 ? <li>{props.emptyMessage ?? "No autosave events yet."}</li> : null}
        {logItems.map((entry) => (
          <li
            key={entry.id}
            style={{
              color:
                entry.level === "error"
                  ? "#991b1b"
                  : entry.level === "success"
                    ? "#065f46"
                    : "#374151",
            }}
          >
            <div style={{ fontSize: 11, opacity: 0.8 }}>{formatTimestamp(entry.timestamp)}</div>
            <div>{entry.message}</div>
            {entry.entityId ? <div style={{ fontSize: 12, opacity: 0.9 }}>Entity ID: {entry.entityId}</div> : null}
            <div style={{ fontSize: 12, opacity: 0.85 }}>Retries: {entry.retryCount}</div>
            {entry.merged ? (
              <div style={{ marginTop: 4, fontSize: 12, opacity: 0.9 }}>
                Merged key: {entry.merged.key} ({entry.merged.source})
              </div>
            ) : null}
            {entry.merged ? (
              <pre
                style={{
                  margin: "6px 0 0",
                  padding: 8,
                  borderRadius: 8,
                  background: "#f8fafc",
                  border: "1px dashed #cbd5e1",
                  fontSize: 12,
                  overflowX: "auto",
                }}
              >
                {JSON.stringify(
                  {
                    previousBeforeMerge: entry.merged.previous,
                    nextAfterMerge: entry.merged.next,
                  },
                  null,
                  2,
                )}
              </pre>
            ) : null}
            {props.showPayload !== false && hasPayload(entry.payload) ? (
              <pre
                style={{
                  margin: "6px 0 0",
                  padding: 8,
                  borderRadius: 8,
                  background: "#ffffff",
                  border: "1px solid #e2e8f0",
                  fontSize: 12,
                  overflowX: "auto",
                }}
              >
                {JSON.stringify(entry.payload, null, 2)}
              </pre>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
