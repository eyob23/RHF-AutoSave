import { describe, expect, it } from "vitest";
import {
  normalizeAutosaveError,
  shouldWarnOnLeave,
  useAutosaveFeedback,
} from "../src";

describe("draft guard helpers", () => {
  it("uses a shared leave decision helper", () => {
    expect(
      shouldWarnOnLeave({ shouldProtect: true, message: "leave", snapshot: null }),
    ).toBe(true);

    expect(
      shouldWarnOnLeave({ shouldProtect: false, message: "leave", snapshot: null }),
    ).toBe(false);
  });

  it("normalizes autosave errors", () => {
    expect(normalizeAutosaveError(new Error("boom"), "fallback")).toBe(
      "Autosave failed: boom",
    );
    expect(normalizeAutosaveError("bad", "fallback")).toBe("fallback");
  });

  it("reports saved and error outcomes through feedback handlers", () => {
    let saved = false;
    let message = "";

    const feedback = useAutosaveFeedback({
      onSaved: () => {
        saved = true;
      },
      onError: (nextMessage) => {
        message = nextMessage;
      },
    });

    feedback.reportSaved();
    feedback.reportError(new Error("boom"), "fallback");

    expect(saved).toBe(true);
    expect(message).toBe("Autosave failed: boom");
  });
});
