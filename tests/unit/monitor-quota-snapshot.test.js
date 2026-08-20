import { describe, expect, it } from "vitest";

import {
  buildProviderSnapshotRow,
  classifyQuotaStatus,
  createQuotaCoordinator,
  normalizeQuotaWindows,
} from "@/lib/monitor/quotaCoordinator.js";

describe("quota snapshot normalization", () => {
  it("normalizes session, weekly, and billing windows without credentials", () => {
    const usage = {
      plan: "GLM Pro",
      quotas: {
        session: {
          used: 25,
          total: 100,
          remaining: 75,
          resetAt: "2026-08-20T12:00:00.000Z",
        },
        weekly: {
          used: 40,
          total: 200,
          remaining: 160,
          resetAt: "2026-08-24T00:00:00.000Z",
        },
        balance: {
          amount: 12,
          currency: "USD",
        },
      },
      apiKey: "sk-must-never-be-copied",
      accessToken: "Bearer must-never-be-copied",
    };

    const windows = normalizeQuotaWindows(usage);

    expect(windows).toHaveLength(3);
    expect(windows.map((window) => window.kind)).toEqual(["session", "weekly", "billing"]);
    expect(windows[0]).toMatchObject({ used: 25, limit: 100, remaining: 75, usedPercent: 25 });
    expect(JSON.stringify(windows)).not.toMatch(/sk-must|Bearer|"(accessToken|refreshToken|apiKey|cookie)"\s*:/i);
  });

  it("classifies unsupported and stale quota states without turning unknown into zero", () => {
    expect(classifyQuotaStatus({ usage: { message: "Usage tracked per request." } })).toBe("unsupported");
    expect(classifyQuotaStatus({ usage: { message: "GLM API key invalid or expired." } })).toBe("unauthorized");
    expect(classifyQuotaStatus({ usage: { message: "quota endpoint 429 rate limit" }, hasLastGood: true })).toBe("stale");
    expect(normalizeQuotaWindows({ quotas: { unknown: { message: "not a quota" } } })).toEqual([]);
  });
});

describe("connection quota coordinator", () => {
  function connection(id, provider = "glm") {
    return {
      id,
      provider,
      authType: "apikey",
      name: `Connection ${id}`,
      isActive: true,
    };
  }

  it("deduplicates concurrent calls for the same connection", async () => {
    let calls = 0;
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    const coordinator = createQuotaCoordinator({
      timeoutMs: 1000,
      fetchUsage: async () => {
        calls += 1;
        await gate;
        return { usage: { plan: "Pro", quotas: { session: { used: 1, total: 10 } } }, quotaStatus: "fresh" };
      },
    });
    const item = connection("a");
    const first = coordinator.fetchConnection(item);
    const second = coordinator.fetchConnection(item);
    release();
    const [one, two] = await Promise.all([first, second]);

    expect(calls).toBe(1);
    expect(one.windows).toEqual(two.windows);
    expect(one.quotaStatus).toBe("fresh");
  });

  it("uses TTL cache and retains Last Good windows after a transient failure", async () => {
    let now = 1_000;
    let calls = 0;
    const coordinator = createQuotaCoordinator({
      now: () => now,
      ttlMs: 5_000,
      timeoutMs: 1000,
      fetchUsage: async () => {
        calls += 1;
        if (calls === 1) {
          return { usage: { quotas: { session: { used: 2, total: 10 } } }, quotaStatus: "fresh" };
        }
        return { usage: { message: "quota endpoint timeout" }, quotaStatus: "unavailable", error: new Error("timeout") };
      },
    });
    const item = connection("a");

    const first = await coordinator.fetchConnection(item);
    now += 1_000;
    const cached = await coordinator.fetchConnection(item);
    now += 6_000;
    const stale = await coordinator.fetchConnection(item);

    expect(calls).toBe(2);
    expect(cached.cached).toBe(true);
    expect(stale.quotaStatus).toBe("stale");
    expect(stale.windows).toEqual(first.windows);
    expect(stale.lastSuccessAt).toBe(first.lastSuccessAt);
  });

  it("keeps two connections under the same provider as distinct rows", () => {
    const first = buildProviderSnapshotRow(connection("a"), {
      quotaStatus: "fresh",
      windows: [{ kind: "session", used: 10, limit: 100 }],
      lastAttemptAt: "2026-08-20T01:00:00.000Z",
      lastSuccessAt: "2026-08-20T01:00:00.000Z",
    }, "2026-08-20T01:00:00.000Z", "instance-a");
    const second = buildProviderSnapshotRow(connection("b"), {
      quotaStatus: "fresh",
      windows: [{ kind: "session", used: 20, limit: 100 }],
      lastAttemptAt: "2026-08-20T01:00:00.000Z",
      lastSuccessAt: "2026-08-20T01:00:00.000Z",
    }, "2026-08-20T01:00:00.000Z", "instance-a");

    expect(first.provider).toBe("glm");
    expect(first.connectionKey).toBe("potluck:instance-a:a");
    expect(second.connectionKey).toBe("potluck:instance-a:b");
    expect(first.managedBy).toBe("potluck");
    expect(first.sourceDetail).toBe("managed");
    expect(first.windows[0].used).toBe(10);
    expect(second.windows[0].used).toBe(20);
    expect(JSON.stringify([first, second])).not.toMatch(/"(accessToken|refreshToken|apiKey|cookie)"\s*:/i);
  });
});
