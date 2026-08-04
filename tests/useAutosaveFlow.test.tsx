import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useAutosaveFlow } from "../src";

describe("useAutosaveFlow", () => {
  it("exposes feedback and draft helpers from a single hook", () => {
    const form = {
      getValues: vi.fn(() => ({ name: "Ada" })),
      reset: vi.fn(),
    };

    const { result } = renderHook(() =>
      useAutosaveFlow({
        form,
        storage: {
          get: () => null,
          set: vi.fn(),
          clear: vi.fn(),
        },
        shouldProtect: () => true,
        onSaved: vi.fn(),
        onError: vi.fn(),
      }),
    );

    expect(typeof result.current.saveDraft).toBe("function");
    expect(typeof result.current.restoreDraft).toBe("function");
    expect(typeof result.current.reportSaved).toBe("function");
    expect(typeof result.current.reportError).toBe("function");
    expect(typeof result.current.shouldWarnOnLeave).toBe("function");
  });
});
