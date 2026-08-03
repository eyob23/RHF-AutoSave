import React, { memo, useEffect } from "react";
import { act, render, renderHook } from "@testing-library/react";
import { useForm } from "react-hook-form";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createIndexedDbQueueStore } from "../src/persistence/indexedDbQueue";
import { useAutosaveSelector } from "../src/hooks/useAutosaveSelector";
import { useRhfAutosave } from "../src/hooks/useRhfAutosave";

type FormValues = {
  name: string;
  items: Array<{ id: string; label: string }>;
};

function createMemoryQueueStore() {
  const records: Array<{
    id: string;
    createdAt: number;
    mergeKey?: string;
    retryCount?: number;
    changedPaths: string[];
    payload: Partial<FormValues>;
    values: FormValues;
  }> = [];

  return {
    enqueue: vi.fn(async (record) => {
      const index = records.findIndex((queued) => queued.id === record.id);
      if (index >= 0) {
        records[index] = record;
        return;
      }

      records.push(record);
    }),
    list: vi.fn(async () => [...records]),
    remove: vi.fn(async (id: string) => {
      const index = records.findIndex((record) => record.id === id);
      if (index >= 0) {
        records.splice(index, 1);
      }
    }),
    clear: vi.fn(async () => {
      records.length = 0;
    }),
    count: vi.fn(async () => records.length),
    getRecords: () => [...records],
  };
}

function useHarness(
  transport: Parameters<typeof useRhfAutosave<FormValues>>[0]["transport"],
  overrides?: Partial<Parameters<typeof useRhfAutosave<FormValues>>[0]>,
) {
  const form = useForm<FormValues>({
    defaultValues: {
      name: "",
      items: [],
    },
  });

  useEffect(() => {
    form.register("name");
    form.register("items");
  }, [form]);

  const autosave = useRhfAutosave<FormValues>({
    form,
    transport,
    config: {
      debounceMs: 20,
    },
    ...overrides,
  });

  return { form, autosave };
}

async function flushTimers() {
  await act(async () => {
    vi.runAllTimers();
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("useRhfAutosave", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    if (vi.isFakeTimers()) {
      vi.runOnlyPendingTimers();
    }
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("autosaves dirty fields after the debounce window", async () => {
    const transport = vi.fn(async ({ payload }) => ({ ok: true, data: payload }));
    const { result } = renderHook(() => useHarness(transport));

    act(() => {
      result.current.form.setValue("name", "Ada", { shouldDirty: true });
    });

    expect(result.current.autosave.hasPendingChanges).toBe(true);

    await flushTimers();

    expect(transport).toHaveBeenCalledTimes(1);
    expect(transport.mock.calls[0]?.[0].payload).toEqual({ name: "Ada" });
    expect(result.current.autosave.hasPendingChanges).toBe(false);
    expect(result.current.autosave.phase).toBe("saved");
  });

  it("stores retry counts in mutation logs", async () => {
    vi.useRealTimers();

    const transport = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, error: new Error("temp-1") })
      .mockResolvedValueOnce({ ok: false, error: new Error("temp-2") })
      .mockResolvedValueOnce({ ok: true });

    const { result } = renderHook(() =>
      useHarness(transport, {
        config: {
          debounceMs: 20,
          maxRetries: 2,
          retryDelayMs: 1,
        },
      }),
    );

    act(() => {
      result.current.form.setValue("name", "Retry Me", { shouldDirty: true });
    });

    await act(async () => {
      await result.current.autosave.flush();
    });

    const latestLog = result.current.autosave.getMutationLog()[0];
    expect(latestLog).toBeDefined();
    expect(latestLog?.level).toBe("success");
    expect(latestLog?.retryCount).toBe(2);
  });

  it("supports external mutation log sink when configured", async () => {
    const transport = vi.fn(async ({ payload }) => ({ ok: true, data: payload }));
    const onLog = vi.fn();

    const { result } = renderHook(() =>
      useHarness(transport, {
        mutationLog: {
          target: "external",
          onLog,
        },
      }),
    );

    act(() => {
      result.current.form.setValue("name", "External", { shouldDirty: true });
    });

    await flushTimers();

    expect(onLog).toHaveBeenCalled();
    expect(result.current.autosave.getMutationLog()).toEqual([]);
  });

  it("queues failed saves and replays them later", async () => {
    const queueStore = createMemoryQueueStore();
    const transport = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, error: new Error("offline") })
      .mockResolvedValueOnce({ ok: true });

    const { result } = renderHook(() =>
      useHarness(transport, {
        queue: {
          enabled: true,
          store: queueStore,
        },
      }),
    );

    act(() => {
      result.current.form.setValue("name", "Queued", { shouldDirty: true });
    });

    await flushTimers();

    expect(queueStore.enqueue).toHaveBeenCalledTimes(1);
    expect(result.current.autosave.queuedCount).toBe(1);
    expect(result.current.autosave.phase).toBe("error");

    await act(async () => {
      await result.current.autosave.replayQueuedSaves();
    });

    await flushTimers();

    expect(transport).toHaveBeenCalledTimes(2);
    expect(result.current.autosave.queuedCount).toBe(0);

    const latestSuccess = result.current.autosave.getMutationLog().find((entry) => entry.level === "success");
    expect(latestSuccess).toBeDefined();
    expect(latestSuccess?.retryCount).toBe(1);
  });

  it("replays queued saves in createdAt order", async () => {
    const replayOrder: string[] = [];
    const queueStore = {
      enqueue: vi.fn(async () => undefined),
      list: vi.fn(async () => [
        {
          id: "r-2",
          createdAt: 20,
          changedPaths: ["name"],
          payload: { name: "Second" },
          values: { name: "Second", items: [] },
        },
        {
          id: "r-1",
          createdAt: 10,
          changedPaths: ["name"],
          payload: { name: "First" },
          values: { name: "First", items: [] },
        },
      ]),
      remove: vi.fn(async () => undefined),
      clear: vi.fn(async () => undefined),
      count: vi.fn(async () => 2),
    };

    const transport = vi.fn(async ({ payload }: { payload: Partial<FormValues> }) => {
      replayOrder.push(String(payload.name ?? ""));
      return { ok: true };
    });

    const { result } = renderHook(() =>
      useHarness(transport, {
        queue: {
          enabled: false,
          store: queueStore,
        },
      }),
    );

    await act(async () => {
      await result.current.autosave.replayQueuedSaves();
    });

    expect(replayOrder).toEqual(["First", "Second"]);
  });

  it("logs partial replay result when replay stops on error", async () => {
    const queueStore = {
      enqueue: vi.fn(async () => undefined),
      list: vi.fn(async () => [
        {
          id: "r-1",
          createdAt: 10,
          changedPaths: ["name"],
          payload: { name: "First" },
          values: { name: "First", items: [] },
        },
        {
          id: "r-2",
          createdAt: 20,
          changedPaths: ["name"],
          payload: { name: "Second" },
          values: { name: "Second", items: [] },
        },
      ]),
      remove: vi.fn(async () => undefined),
      clear: vi.fn(async () => undefined),
      count: vi.fn(async () => 2),
    };

    const transport = vi
      .fn()
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ ok: false, error: new Error("offline") });

    const { result } = renderHook(() =>
      useHarness(transport, {
        queue: {
          enabled: false,
          store: queueStore,
        },
      }),
    );

    await act(async () => {
      await result.current.autosave.replayQueuedSaves();
    });

    const replayEntry = result.current.autosave
      .getMutationLog()
      .find((entry) => entry.reason === "replay" && entry.message.includes("Replay queue"));

    expect(replayEntry?.level).toBe("error");
    expect(replayEntry?.message).toContain("partially processed");
    expect(replayEntry?.message).toContain("1/2");
  });

  it("runs array diff handlers and excludes handled paths from the transport payload", async () => {
    const onAdd = vi.fn(async () => undefined);
    const transport = vi.fn(async ({ payload }) => ({ ok: true, data: payload }));

    const { result } = renderHook(() =>
      useHarness(transport, {
        diffMap: {
          items: {
            idOf: (item) => (item as { id: string }).id,
            onAdd,
          },
        },
      }),
    );

    act(() => {
      result.current.form.setValue("items", [{ id: "1", label: "One" }], { shouldDirty: true });
    });

    await flushTimers();

    expect(onAdd).toHaveBeenCalledTimes(1);
    expect(transport).toHaveBeenCalledTimes(1);
    expect(transport.mock.calls[0]?.[0].payload).toEqual({});
  });

  it("keeps array payload when diff map only provides idOf", async () => {
    const transport = vi.fn(async ({ payload }) => ({ ok: true, data: payload }));

    const { result } = renderHook(() =>
      useHarness(transport, {
        diffMap: {
          items: {
            idOf: (item) => (item as { id: string }).id,
          },
        },
      }),
    );

    act(() => {
      result.current.form.setValue("items", [{ id: "1", label: "One" }], { shouldDirty: true });
    });

    await flushTimers();

    expect(transport).toHaveBeenCalledTimes(1);
    expect(transport.mock.calls[0]?.[0].payload).toEqual({ items: [{ id: "1", label: "One" }] });

    const successLog = result.current.autosave
      .getMutationLog()
      .find((entry) => entry.level === "success" && entry.message.includes("Saved mutation"));

    expect(successLog?.payload).toEqual({ items: [{ id: "1", label: "One" }] });
  });

  it("guarantees FIFO execution order across back-to-back save requests", async () => {
    const payloadOrder: string[] = [];
    const resolvers: Array<() => void> = [];

    const transport = vi.fn(({ payload }: { payload: Partial<FormValues> }) => {
      return new Promise<{ ok: true }>((resolve) => {
        resolvers.push(() => {
          payloadOrder.push(String(payload.name ?? ""));
          resolve({ ok: true });
        });
      });
    });

    const { result } = renderHook(() =>
      useHarness(transport, {
        config: { debounceMs: 5000 },
      }),
    );

    act(() => {
      result.current.form.setValue("name", "First", { shouldDirty: true });
    });

    let firstSave!: Promise<{ ok: boolean }>;
    await act(async () => {
      firstSave = result.current.autosave.flush();
      await Promise.resolve();
    });

    act(() => {
      result.current.form.setValue("name", "Second", { shouldDirty: true });
    });

    let secondSave!: Promise<{ ok: boolean }>;
    await act(async () => {
      secondSave = result.current.autosave.flush();
      await Promise.resolve();
    });

    expect(transport).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolvers[0]?.();
      await firstSave;
    });

    expect(transport).toHaveBeenCalledTimes(2);

    await act(async () => {
      resolvers[1]?.();
      await secondSave;
    });

    expect(payloadOrder).toEqual(["First", "Second"]);
  });

  it("merges pending saves by merge key before execution", async () => {
    const payloadOrder: string[] = [];
    const resolvers: Array<() => void> = [];

    const transport = vi.fn(({ payload }: { payload: Partial<FormValues> }) => {
      return new Promise<{ ok: true }>((resolve) => {
        resolvers.push(() => {
          payloadOrder.push(String(payload.name ?? ""));
          resolve({ ok: true });
        });
      });
    });

    const { result } = renderHook(() =>
      useHarness(transport, {
        config: { debounceMs: 5000 },
        merge: {
          enabled: true,
          getKey: () => "employee:profile",
        },
      }),
    );

    act(() => {
      result.current.form.setValue("name", "First", { shouldDirty: true });
    });

    let firstSave!: Promise<{ ok: boolean }>;
    await act(async () => {
      firstSave = result.current.autosave.flush();
      await Promise.resolve();
    });

    act(() => {
      result.current.form.setValue("name", "Second", { shouldDirty: true });
    });

    let secondSave!: Promise<{ ok: boolean }>;
    await act(async () => {
      secondSave = result.current.autosave.flush();
      await Promise.resolve();
    });

    act(() => {
      result.current.form.setValue("name", "Third", { shouldDirty: true });
    });

    let thirdSave!: Promise<{ ok: boolean }>;
    await act(async () => {
      thirdSave = result.current.autosave.flush();
      await Promise.resolve();
    });

    expect(transport).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolvers[0]?.();
      await firstSave;
    });

    expect(transport).toHaveBeenCalledTimes(2);

    await act(async () => {
      resolvers[1]?.();
      await Promise.all([secondSave, thirdSave]);
    });

    expect(payloadOrder).toEqual(["First", "Third"]);

    const mergeLog = result.current.autosave.getMutationLog().find((entry) => entry.merged?.source === "pending");
    expect(mergeLog).toBeDefined();
    expect(mergeLog?.merged?.previous.payload).toEqual({ name: "Second" });
    expect(mergeLog?.merged?.next.payload).toEqual({ name: "Third" });
  });

  it("merges failed queued saves by merge key", async () => {
    vi.useRealTimers();

    const queueStore = createMemoryQueueStore();
    const transport = vi.fn(async () => ({ ok: false, error: new Error("offline") }));

    const { result } = renderHook(() =>
      useHarness(transport, {
        queue: {
          enabled: true,
          store: queueStore,
        },
        merge: {
          enabled: true,
          getKey: () => "employment:emp-1",
        },
      }),
    );

    act(() => {
      result.current.form.setValue("name", "First queued", { shouldDirty: true });
    });

    await act(async () => {
      await result.current.autosave.flush();
    });

    act(() => {
      result.current.form.setValue("name", "Latest queued", { shouldDirty: true });
    });

    await act(async () => {
      await result.current.autosave.flush();
    });

    expect(queueStore.enqueue).toHaveBeenCalledTimes(2);
    expect(await queueStore.count()).toBe(1);
    const mergedRecord = queueStore.getRecords()[0];
    expect(mergedRecord?.payload).toEqual({ name: "Latest queued" });
    expect(mergedRecord?.mergeKey).toBe("employment:emp-1");

    const mergeLog = result.current.autosave.getMutationLog().find((entry) => entry.merged?.source === "queued");
    expect(mergeLog).toBeDefined();
    expect(mergeLog?.merged?.previous.payload).toEqual({ name: "First queued" });
    expect(mergeLog?.merged?.next.payload).toEqual({ name: "Latest queued" });
  });

  it("does not emit queued merge log when merged queue persistence fails", async () => {
    vi.useRealTimers();

    const records: Array<{
      id: string;
      createdAt: number;
      mergeKey?: string;
      retryCount?: number;
      changedPaths: string[];
      payload: Partial<FormValues>;
      values: FormValues;
    }> = [];

    let enqueueCalls = 0;
    const queueStore = {
      enqueue: vi.fn(async (record) => {
        enqueueCalls += 1;
        if (enqueueCalls === 2) {
          throw new Error("persist failed");
        }

        const index = records.findIndex((queued) => queued.id === record.id);
        if (index >= 0) {
          records[index] = record;
          return;
        }

        records.push(record);
      }),
      list: vi.fn(async () => [...records]),
      remove: vi.fn(async (id: string) => {
        const index = records.findIndex((record) => record.id === id);
        if (index >= 0) {
          records.splice(index, 1);
        }
      }),
      clear: vi.fn(async () => {
        records.length = 0;
      }),
      count: vi.fn(async () => records.length),
    };

    const transport = vi.fn(async () => ({ ok: false, error: new Error("offline") }));

    const { result } = renderHook(() =>
      useHarness(transport, {
        queue: {
          enabled: true,
          store: queueStore,
        },
        merge: {
          enabled: true,
          getKey: () => "employment:emp-1",
        },
      }),
    );

    act(() => {
      result.current.form.setValue("name", "First queued", { shouldDirty: true });
    });

    await act(async () => {
      await result.current.autosave.flush();
    });

    act(() => {
      result.current.form.setValue("name", "Latest queued", { shouldDirty: true });
    });

    await act(async () => {
      await result.current.autosave.flush();
    });

    const mergedQueueLogs = result.current.autosave
      .getMutationLog()
      .filter((entry) => entry.merged?.source === "queued");

    expect(mergedQueueLogs).toHaveLength(0);
    expect(records).toHaveLength(1);
    expect(records[0]?.payload).toEqual({ name: "First queued" });
    expect(result.current.autosave.getMutationLog()[0]?.message).toBe("Save failed");
  });

  it("logs undo and redo mutations", async () => {
    const transport = vi.fn(async () => ({ ok: true }));

    const { result } = renderHook(() =>
      useHarness(transport, {
        config: { debounceMs: 5000 },
        undo: {
          enabled: true,
          captureDebounceMs: 1,
        },
        shouldSave: () => false,
      }),
    );

    act(() => {
      result.current.form.setValue("name", "One", { shouldDirty: true });
    });
    act(() => {
      vi.advanceTimersByTime(2);
    });

    act(() => {
      result.current.form.setValue("name", "Two", { shouldDirty: true });
    });
    act(() => {
      vi.advanceTimersByTime(2);
    });

    act(() => {
      result.current.autosave.undo();
    });

    act(() => {
      result.current.autosave.redo();
    });

    const mutationMessages = result.current.autosave
      .getMutationLog()
      .map((entry) => entry.message);

    expect(mutationMessages).toContain("Undo mutation applied");
    expect(mutationMessages).toContain("Redo mutation applied");
  });

  it("lets undo merge into an existing pending autosave request", async () => {
    const resolvers: Array<() => void> = [];
    const transport = vi.fn(({ payload }: { payload: Partial<FormValues> }) => {
      return new Promise<{ ok: true }>((resolve) => {
        resolvers.push(() => {
          void payload;
          resolve({ ok: true });
        });
      });
    });

    const { result } = renderHook(() =>
      useHarness(transport, {
        config: { debounceMs: 5000 },
        undo: {
          enabled: true,
          captureDebounceMs: 1,
        },
        merge: {
          enabled: true,
          getKey: () => "employee:profile",
        },
      }),
    );

    act(() => {
      result.current.form.setValue("name", "First", { shouldDirty: true });
    });
    act(() => {
      vi.advanceTimersByTime(2);
    });

    let firstSave!: Promise<{ ok: boolean }>;
    await act(async () => {
      firstSave = result.current.autosave.flush();
      await Promise.resolve();
    });

    act(() => {
      result.current.form.setValue("name", "Second", { shouldDirty: true });
    });
    act(() => {
      vi.advanceTimersByTime(2);
    });

    let secondSave!: Promise<{ ok: boolean }>;
    await act(async () => {
      secondSave = result.current.autosave.flush();
      await Promise.resolve();
    });

    act(() => {
      result.current.autosave.undo();
    });

    const mergeLog = result.current.autosave
      .getMutationLog()
      .find((entry) => entry.merged?.source === "pending" && entry.message.includes("Merged autosave request"));

    expect(mergeLog).toBeDefined();
    expect(mergeLog?.entityId).toBe("profile");
    expect(mergeLog?.merged?.next.payload).toEqual({ name: "First" });

    await act(async () => {
      resolvers[0]?.();
      await firstSave;
    });

    await act(async () => {
      resolvers[1]?.();
      await secondSave;
    });
  });

  it("tracks merge snapshots correctly across multiple undo and redo operations", async () => {
    const resolvers: Array<() => void> = [];
    const transport = vi.fn(() => {
      return new Promise<{ ok: true }>((resolve) => {
        resolvers.push(() => {
          resolve({ ok: true });
        });
      });
    });

    const { result } = renderHook(() =>
      useHarness(transport, {
        config: { debounceMs: 5000 },
        undo: {
          enabled: true,
          captureDebounceMs: 1,
        },
        merge: {
          enabled: true,
          getKey: () => "employee:profile",
        },
      }),
    );

    act(() => {
      result.current.form.setValue("name", "A", { shouldDirty: true });
    });
    act(() => {
      vi.advanceTimersByTime(2);
    });

    let firstSave!: Promise<{ ok: boolean }>;
    await act(async () => {
      firstSave = result.current.autosave.flush();
      await Promise.resolve();
    });

    act(() => {
      result.current.form.setValue("name", "B", { shouldDirty: true });
    });
    act(() => {
      vi.advanceTimersByTime(2);
    });

    let secondSave!: Promise<{ ok: boolean }>;
    await act(async () => {
      secondSave = result.current.autosave.flush();
      await Promise.resolve();
    });

    act(() => {
      result.current.autosave.undo();
      result.current.autosave.redo();
      result.current.autosave.undo();
    });

    const pendingMergeLogs = result.current.autosave
      .getMutationLog()
      .filter((entry) => entry.merged?.source === "pending" && entry.message.includes("Merged autosave request"));

    expect(pendingMergeLogs.length).toBeGreaterThanOrEqual(3);

    const first = pendingMergeLogs[2]?.merged;
    const second = pendingMergeLogs[1]?.merged;
    const third = pendingMergeLogs[0]?.merged;

    expect(first?.next.payload).toEqual({ name: "A" });
    expect(second?.previous.payload).toEqual({ name: "A" });
    expect(second?.next.payload).toEqual({ name: "B" });
    expect(third?.previous.payload).toEqual({ name: "B" });
    expect(third?.next.payload).toEqual({ name: "A" });
    expect(pendingMergeLogs[0]?.entityId).toBe("profile");

    await act(async () => {
      resolvers[0]?.();
      await firstSave;
    });

    await act(async () => {
      resolvers[1]?.();
      await secondSave;
    });
  });

  it("lets selector subscribers skip unrelated autosave state updates", async () => {
    const selectorRenders = vi.fn();
    const transport = vi.fn(async () => ({ ok: true }));

    let formApi: ReturnType<typeof useForm<FormValues>> | undefined;
    let autosaveApi: ReturnType<typeof useRhfAutosave<FormValues>> | undefined;

    const QueueCount = memo(function QueueCount(props: { autosave: ReturnType<typeof useRhfAutosave<FormValues>> }) {
      selectorRenders();
      const queuedCount = useAutosaveSelector(props.autosave, (state) => state.queuedCount);
      return <div data-testid="queued-count">{queuedCount}</div>;
    });

    function Harness() {
      const form = useForm<FormValues>({
        defaultValues: {
          name: "",
          items: [],
        },
      });

      useEffect(() => {
        form.register("name");
      }, [form]);

      const autosave = useRhfAutosave<FormValues>({
        form,
        transport,
        config: { debounceMs: 20 },
      });

      useEffect(() => {
        formApi = form;
        autosaveApi = autosave;
      }, [form, autosave]);

      return <QueueCount autosave={autosave} />;
    }

    render(<Harness />);

    expect(selectorRenders).toHaveBeenCalledTimes(1);
    expect(autosaveApi).toBeDefined();
    expect(formApi).toBeDefined();

    act(() => {
      formApi?.setValue("name", "No queue changes", { shouldDirty: true });
    });

    await flushTimers();

    expect(transport).toHaveBeenCalledTimes(1);
    expect(selectorRenders).toHaveBeenCalledTimes(1);
  });

  it("can use the IndexedDB store for persisted queue replay", async () => {
    vi.useRealTimers();

    const store = createIndexedDbQueueStore<FormValues>({
      databaseName: `rhf-autosave-${Date.now()}`,
      storeName: "queue",
    });
    const transport = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, error: new Error("offline") })
      .mockResolvedValueOnce({ ok: true });

    const { result } = renderHook(() =>
      useHarness(transport, {
        queue: {
          enabled: true,
          store,
        },
      }),
    );

    act(() => {
      result.current.form.setValue("name", "Persisted", { shouldDirty: true });
    });

    await act(async () => {
      await new Promise((resolve) => {
        setTimeout(resolve, 50);
      });
    });

    expect(await store.count()).toBe(1);

    await act(async () => {
      await result.current.autosave.replayQueuedSaves();
    });

    await act(async () => {
      await new Promise((resolve) => {
        setTimeout(resolve, 10);
      });
    });

    expect(await store.count()).toBe(0);
  }, 10000);
});