import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useAutosaveWorkflow } from "../src";

describe("useAutosaveWorkflow", () => {
  it("saves drafts and reports success through a single workflow hook", async () => {
    const form = {
      getValues: vi.fn(() => ({ name: "Ada" })),
      reset: vi.fn(),
    };
    const save = vi.fn().mockResolvedValue({ ok: true });
    const onSaved = vi.fn();
    const onError = vi.fn();

    const { result } = renderHook(() =>
      useAutosaveWorkflow({
        form,
        draftKey: "autosave-workflow-test",
        save,
        fallbackMessage: "fallback message",
        onSaved,
        onError,
        shouldProtect: () => true,
      }),
    );

    await act(async () => {
      await result.current.saveAndTrack({ name: "Ada" });
    });

    expect(save).toHaveBeenCalledWith({ name: "Ada" });
    expect(onSaved).toHaveBeenCalledTimes(1);
    expect(window.localStorage.getItem("autosave-workflow-test")).toContain(
      "Ada",
    );
    expect(typeof result.current.handleSuccessfulSave).toBe("function");
    expect(typeof result.current.handleError).toBe("function");
  });

  it("reports an error and rethrows so callers can still react", async () => {
    const form = {
      getValues: vi.fn(() => ({ name: "Grace" })),
      reset: vi.fn(),
    };
    const save = vi.fn().mockRejectedValue(new Error("boom"));
    const onError = vi.fn();

    const { result } = renderHook(() =>
      useAutosaveWorkflow({
        form,
        save,
        fallbackMessage: "fallback message",
        onError,
        shouldProtect: () => true,
      }),
    );

    await expect(
      result.current.saveAndTrack({ name: "Grace" }),
    ).rejects.toThrow("boom");
    expect(onError).toHaveBeenCalledWith("Autosave failed: boom");
  });
});
