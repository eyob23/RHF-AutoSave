import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createLocalStorageDraftStorage, useDraftGuard } from "../src";

describe("useDraftGuard", () => {
  afterEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it("exposes save and restore helpers while attaching guards", () => {
    const form = {
      getValues: vi.fn(() => ({ name: "Ada" })),
      reset: vi.fn(),
    };

    const addEventListenerSpy = vi.spyOn(window, "addEventListener");
    const removeEventListenerSpy = vi.spyOn(window, "removeEventListener");

    const storage = createLocalStorageDraftStorage<{ name: string }>(
      "draft-guard-hook-test",
    );

    const { result, unmount } = renderHook(() =>
      useDraftGuard({ form, storage, shouldProtect: () => true }),
    );

    act(() => {
      result.current.saveDraft();
    });

    expect(storage.get()).toEqual({ name: "Ada" });

    act(() => {
      result.current.restoreDraft();
    });

    expect(form.reset).toHaveBeenCalledWith({ name: "Ada" });
    expect(addEventListenerSpy).toHaveBeenCalledWith(
      "beforeunload",
      expect.any(Function),
    );

    unmount();

    expect(removeEventListenerSpy).toHaveBeenCalledWith(
      "beforeunload",
      expect.any(Function),
    );
  });
});
