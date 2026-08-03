import { describe, expect, it } from "vitest";
import { createIndexedDbQueueStore } from "../src/persistence/indexedDbQueue";
import {
  cloneDeep,
  diffArraysBy,
  findChangedPaths,
  isDeepEqual,
} from "../src/utils/deep";
import {
  getByPath,
  mapNestedKeys,
  pickPaths,
  setByPath,
} from "../src/utils/path";

describe("utility helpers", () => {
  it("reads and writes nested paths immutably", () => {
    const source = {
      profile: {
        name: "Ada",
      },
      items: [{ value: 1 }],
    };

    const updated = setByPath(source, "items[0].value", 2);

    expect(getByPath(updated, "items[0].value")).toBe(2);
    expect(getByPath(source, "items[0].value")).toBe(1);
  });

  it("maps nested keys and selects only requested paths", () => {
    const values = {
      profile: {
        firstName: "Ada",
        lastName: "Lovelace",
      },
      settings: {
        subscribed: true,
      },
    };

    expect(
      pickPaths(values, ["profile.firstName", "settings.subscribed"]),
    ).toEqual({
      profile: { firstName: "Ada" },
      settings: { subscribed: true },
    });

    expect(
      mapNestedKeys(values, {
        "profile.firstName": "first_name",
        "settings.subscribed": ["notify_enabled", (value) => (value ? 1 : 0)],
      }),
    ).toEqual({
      first_name: "Ada",
      profile: { lastName: "Lovelace" },
      notify_enabled: 1,
    });
  });

  it("diffs deep values and array changes", () => {
    const before = {
      profile: { firstName: "Ada", lastName: "Lovelace" },
      items: [{ id: "1", value: "a" }],
    };
    const after = {
      profile: { firstName: "Ada", lastName: "Byron" },
      items: [
        { id: "1", value: "b" },
        { id: "2", value: "c" },
      ],
    };

    expect(findChangedPaths(before, after)).toEqual([
      "profile.lastName",
      "items",
    ]);
    expect(diffArraysBy(before.items, after.items, (item) => item.id)).toEqual({
      added: [{ id: "2", value: "c" }],
      removed: [],
      modified: [
        { before: { id: "1", value: "a" }, after: { id: "1", value: "b" } },
      ],
      hasChanges: true,
    });
    expect(isDeepEqual(cloneDeep(after), after)).toBe(true);
  });

  it("persists queue records in IndexedDB", async () => {
    const store = createIndexedDbQueueStore<{ id: string; name: string }>({
      databaseName: `autosave-test-${Date.now()}`,
      storeName: "records",
    });

    await store.enqueue({
      id: "record-1",
      createdAt: Date.now(),
      changedPaths: ["name"],
      payload: { name: "Ada" },
      values: { id: "1", name: "Ada" },
    });

    const queued = await store.list();
    expect(queued).toHaveLength(1);
    expect(await store.count()).toBe(1);

    await store.remove("record-1");
    expect(await store.count()).toBe(0);
  });
});
