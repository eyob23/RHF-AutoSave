import { describe, expect, it, vi } from "vitest";
import { createPartitionedTransport } from "../src/transports/partitionedTransport";

describe("createPartitionedTransport", () => {
  it("routes changed paths to their owning endpoints with partition payloads", async () => {
    const profileTransport = vi.fn(async ({ payload }) => ({
      ok: true,
      data: payload,
    }));
    const employmentTransport = vi.fn(async ({ payload }) => ({
      ok: true,
      data: payload,
    }));

    const transport = createPartitionedTransport([
      {
        key: "profile",
        paths: ["profile", "address"],
        transport: profileTransport,
      },
      {
        key: "employment",
        paths: ["employment", "equipmentRequests"],
        transport: employmentTransport,
      },
    ]);

    const result = await transport({
      values: {
        profile: { firstName: "Ada" },
        address: { city: "London" },
        employment: { title: "Architect" },
        equipmentRequests: [{ id: "eq-1", type: "monitor" }],
      },
      payload: {},
      changedPaths: ["profile.firstName", "equipmentRequests[0].type"],
      dirtyFields: {},
      baseline: {
        profile: { firstName: "Grace" },
        address: { city: "London" },
        employment: { title: "Architect" },
        equipmentRequests: [{ id: "eq-1", type: "laptop" }],
      },
      signal: new AbortController().signal,
      meta: {
        reason: "debounce",
        saveId: 1,
        queued: false,
      },
    });

    expect(result.ok).toBe(true);
    expect(profileTransport).toHaveBeenCalledWith(
      expect.objectContaining({
        changedPaths: ["profile.firstName"],
        payload: { profile: { firstName: "Ada" }, address: { city: "London" } },
      }),
    );
    expect(employmentTransport).toHaveBeenCalledWith(
      expect.objectContaining({
        changedPaths: ["equipmentRequests[0].type"],
        payload: {
          employment: { title: "Architect" },
          equipmentRequests: [{ id: "eq-1", type: "monitor" }],
        },
      }),
    );
  });

  it("supports changed-path-only payload selection for patch-style endpoints", async () => {
    const transportSpy = vi.fn(async ({ payload }) => ({
      ok: true,
      data: payload,
    }));
    const transport = createPartitionedTransport([
      {
        key: "profilePatch",
        paths: ["profile"],
        transport: transportSpy,
        payloadStrategy: "changed",
      },
    ]);

    await transport({
      values: {
        profile: { firstName: "Ada", lastName: "Byron" },
      },
      payload: {},
      changedPaths: ["profile.firstName"],
      dirtyFields: {},
      baseline: {
        profile: { firstName: "Grace", lastName: "Byron" },
      },
      signal: new AbortController().signal,
      meta: {
        reason: "debounce",
        saveId: 2,
        queued: false,
      },
    });

    expect(transportSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: { profile: { firstName: "Ada" } },
      }),
    );
  });

  it("fails fast when a changed path has no owning route", async () => {
    const transportSpy = vi.fn(async ({ payload }) => ({
      ok: true,
      data: payload,
    }));
    const transport = createPartitionedTransport([
      {
        key: "profile",
        paths: ["profile"],
        transport: transportSpy,
      },
    ]);

    const result = await transport({
      values: {
        profile: { firstName: "Ada" },
        payroll: { taxId: "123" },
      },
      payload: {},
      changedPaths: ["payroll.taxId"],
      dirtyFields: {},
      baseline: {
        profile: { firstName: "Ada" },
        payroll: { taxId: "000" },
      },
      signal: new AbortController().signal,
      meta: {
        reason: "debounce",
        saveId: 3,
        queued: false,
      },
    });

    expect(result.ok).toBe(false);
    expect(result.error).toEqual(expect.any(Error));
    expect((result.error as Error).message).toContain("payroll.taxId");
    expect(transportSpy).not.toHaveBeenCalled();
  });
});
