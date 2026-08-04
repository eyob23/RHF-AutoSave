import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  AutosaveRuntimeProvider,
  resolveEntityKeyFromMergeKey,
  useGlobalAutosaveQuery,
} from "../src";

function SummaryProbe() {
  const trackedEntityCount = useGlobalAutosaveQuery(
    (summary) => summary.trackedEntityCount,
  );

  return <div data-testid="tracked-count">{trackedEntityCount}</div>;
}

describe("AutosaveRuntimeProvider", () => {
  it("boots queued entity state from a queue store", async () => {
    const queueStore = {
      list: vi.fn().mockResolvedValue([{ mergeKey: "employee:emp-42" }]),
    };

    render(
      <AutosaveRuntimeProvider
        queueSources={[
          {
            store: queueStore as never,
            resolveEntityKey: resolveEntityKeyFromMergeKey,
          },
        ]}
      >
        <SummaryProbe />
      </AutosaveRuntimeProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("tracked-count").textContent).toBe("1");
    });
  });

  it("extracts the entity key from merge keys", () => {
    expect(resolveEntityKeyFromMergeKey(undefined)).toBeNull();
    expect(resolveEntityKeyFromMergeKey("employee:emp-42")).toBe("emp-42");
    expect(resolveEntityKeyFromMergeKey("plain-key")).toBe("plain-key");
  });
});
