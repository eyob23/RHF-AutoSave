import { describe, expect, it, vi } from "vitest";
import { createDraftGuardian, createDraftSnapshot } from "../src";

describe("createDraftGuardian", () => {
  it("persists and restores a snapshot through storage", () => {
    const storage = {
      get: vi.fn<() => { name: string } | null>(),
      set: vi.fn(),
      clear: vi.fn(),
    };

    const initialValues = { name: "Ada" };
    const nextValues = { name: "Grace" };
    const reset = vi.fn();

    const guardian = createDraftGuardian({
      form: {
        getValues: () => nextValues,
        reset,
      },
      storage,
      getSnapshot: () => nextValues,
    });

    guardian.saveDraft();

    expect(storage.set).toHaveBeenCalledWith(nextValues);

    storage.get.mockReturnValueOnce(createDraftSnapshot(nextValues));

    guardian.restoreDraft();

    expect(reset).toHaveBeenCalledWith(nextValues);
  });

  it("creates a snapshot clone that does not mutate the original object", () => {
    const values = { profile: { firstName: "Ada" } };
    const snapshot = createDraftSnapshot(values);

    snapshot.profile.firstName = "Grace";

    expect(values.profile.firstName).toBe("Ada");
  });
});
