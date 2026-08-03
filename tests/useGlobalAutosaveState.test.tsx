import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { useEffect, useRef } from "react";
import { describe, expect, it } from "vitest";
import {
  GlobalAutosaveStateProvider,
  useGlobalAutosaveQuery,
  useGlobalAutosaveRegistry,
} from "../src/hooks/useGlobalAutosaveState";

describe("useGlobalAutosaveState", () => {
  it("hydrates unsaved and queued summary from queue bootstrap sources", async () => {
    const wrapper = ({ children }: { children: ReactNode }) => (
      <GlobalAutosaveStateProvider>{children}</GlobalAutosaveStateProvider>
    );

    const { result } = renderHook(
      () => {
        const summary = useGlobalAutosaveQuery((state) => state);
        const registry = useGlobalAutosaveRegistry();
        return {
          summary,
          bootstrapFromQueue: registry.bootstrapFromQueue,
        };
      },
      { wrapper },
    );

    await act(async () => {
      await result.current.bootstrapFromQueue([
        {
          store: {
            list: async () => [
              {
                id: "a",
                createdAt: Date.now(),
                mergeKey: "employment:emp-1",
                changedPaths: ["name"],
                payload: { name: "A" },
                values: { name: "A", items: [] },
              },
              {
                id: "b",
                createdAt: Date.now(),
                mergeKey: "employment:emp-1",
                changedPaths: ["name"],
                payload: { name: "B" },
                values: { name: "B", items: [] },
              },
              {
                id: "c",
                createdAt: Date.now(),
                mergeKey: "benefits:emp-2",
                changedPaths: ["name"],
                payload: { name: "C" },
                values: { name: "C", items: [] },
              },
            ],
          },
          resolveEntityKey: (record) => {
            if (!record.mergeKey) {
              return null;
            }

            const index = record.mergeKey.lastIndexOf(":");
            return index >= 0
              ? record.mergeKey.slice(index + 1)
              : record.mergeKey;
          },
        },
      ]);
    });

    expect(result.current.summary.hasUnsavedChanges).toBe(true);
    expect(result.current.summary.queuedMutationCount).toBe(3);
    expect(result.current.summary.unsavedEntityKeys.sort()).toEqual([
      "emp-1",
      "emp-2",
    ]);

    const emp1 = result.current.summary.entities.find(
      (entity) => entity.entityKey === "emp-1",
    );
    const emp2 = result.current.summary.entities.find(
      (entity) => entity.entityKey === "emp-2",
    );
    expect(emp1?.state.queuedCount).toBe(2);
    expect(emp2?.state.queuedCount).toBe(1);
  });

  it("keeps bootstrapFromQueue stable and avoids no-op queue bootstrap updates", async () => {
    const wrapper = ({ children }: { children: ReactNode }) => (
      <GlobalAutosaveStateProvider>{children}</GlobalAutosaveStateProvider>
    );

    const queueSource = {
      store: {
        list: async () => [
          {
            id: "a",
            createdAt: 10,
            mergeKey: "employment:emp-1",
            changedPaths: ["name"],
            payload: { name: "A" },
            values: { name: "A", items: [] },
          },
        ],
      },
      resolveEntityKey: (record: { mergeKey?: string }) => {
        if (!record.mergeKey) {
          return null;
        }

        const index = record.mergeKey.lastIndexOf(":");
        return index >= 0 ? record.mergeKey.slice(index + 1) : record.mergeKey;
      },
    };

    const { result } = renderHook(
      () => {
        const summary = useGlobalAutosaveQuery((state) => state);
        const registry = useGlobalAutosaveRegistry();
        return {
          summary,
          bootstrapFromQueue: registry.bootstrapFromQueue,
        };
      },
      { wrapper },
    );

    const firstBootstrapRef = result.current.bootstrapFromQueue;

    await act(async () => {
      await result.current.bootstrapFromQueue([queueSource]);
    });

    const firstUpdatedAt = result.current.summary.entities[0]?.updatedAt;
    expect(firstUpdatedAt).toBeDefined();

    await act(async () => {
      await result.current.bootstrapFromQueue([queueSource]);
    });

    expect(result.current.bootstrapFromQueue).toBe(firstBootstrapRef);
    expect(result.current.summary.entities[0]?.updatedAt).toBe(firstUpdatedAt);
  });

  it("supports selector equality to suppress unrelated updates", async () => {
    const wrapper = ({ children }: { children: ReactNode }) => (
      <GlobalAutosaveStateProvider>{children}</GlobalAutosaveStateProvider>
    );

    const { result } = renderHook(
      () => {
        const unsavedCount = useGlobalAutosaveQuery(
          (state) => state.unsavedEntityKeys.length,
        );
        const registry = useGlobalAutosaveRegistry();
        const valueChangeCountRef = useRef(0);

        useEffect(() => {
          valueChangeCountRef.current += 1;
        }, [unsavedCount]);

        return {
          unsavedCount,
          registry,
          valueChangeCount: valueChangeCountRef.current,
        };
      },
      { wrapper },
    );

    expect(result.current.unsavedCount).toBe(0);
    const baselineValueChangeCount = result.current.valueChangeCount;

    await act(async () => {
      result.current.registry.upsertEntityState("emp-1", {
        phase: "idle",
        isSaving: false,
        hasPendingChanges: false,
        queuedCount: 1,
        lastSavedAt: null,
        lastAttemptAt: null,
        lastError: null,
      });
    });

    expect(result.current.unsavedCount).toBe(0);
    expect(result.current.valueChangeCount).toBe(baselineValueChangeCount);
  });
});
