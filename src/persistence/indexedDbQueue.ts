import { openDB } from "idb";
import type { FieldValues } from "react-hook-form";
import type { AutosaveQueueRecord, AutosaveQueueStore } from "../core/types";

export interface IndexedDbQueueStoreOptions {
  databaseName?: string;
  storeName?: string;
}

export function createIndexedDbQueueStore<
  TFormValues extends FieldValues,
  TPayload = Partial<TFormValues>,
>(options?: IndexedDbQueueStoreOptions): AutosaveQueueStore<TFormValues, TPayload> {
  const databaseName = options?.databaseName ?? "rhf-autosave";
  const storeName = options?.storeName ?? "queue";

  const databasePromise = openDB(databaseName, 1, {
    upgrade(database) {
      if (!database.objectStoreNames.contains(storeName)) {
        database.createObjectStore(storeName, { keyPath: "id" });
      }
    },
  });

  async function transaction() {
    const database = await databasePromise;
    return database.transaction(storeName, "readwrite");
  }

  return {
    enqueue: async (record: AutosaveQueueRecord<TFormValues, TPayload>) => {
      const tx = await transaction();
      await tx.store.put(record);
      await tx.done;
    },
    list: async () => {
      const database = await databasePromise;
      return (await database.getAll(storeName)) as Array<AutosaveQueueRecord<TFormValues, TPayload>>;
    },
    remove: async (id: string) => {
      const tx = await transaction();
      await tx.store.delete(id);
      await tx.done;
    },
    clear: async () => {
      const tx = await transaction();
      await tx.store.clear();
      await tx.done;
    },
    count: async () => {
      const database = await databasePromise;
      return database.count(storeName);
    },
  };
}