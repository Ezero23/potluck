import { beforeEach, describe, expect, it, vi } from "vitest";

const fetchMock = vi.fn();

vi.mock("../../open-sse/utils/proxyFetch.js", () => ({
  proxyAwareFetch: (...args) => fetchMock(...args),
}));

const { getCodexUsage } = await import("../../open-sse/services/usage/codex.js");
const { getCodeBuddyCnUsage } = await import("../../open-sse/services/usage/codebuddy-cn.js");

function response(body) {
  return {
    ok: true,
    status: 200,
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

describe("Codex and CodeBuddy quota truth", () => {
  beforeEach(() => fetchMock.mockReset());

  it("Codex omits a reset-only window instead of inventing 0% used", async () => {
    fetchMock.mockResolvedValue(response({
      rate_limit: {
        primary_window: { reset_at: "2026-09-01T00:00:00Z" },
        secondary_window: { used_percent: 100, reset_at: "2026-09-02T00:00:00Z" },
      },
    }));

    const usage = await getCodexUsage("token");
    expect(Object.keys(usage.quotas)).toEqual(["weekly"]);
    expect(usage.quotas.weekly.used).toBe(100);
  });

  it("CodeBuddy drops incomplete packages but preserves a true zero-used package", async () => {
    const cycleEnd = Date.parse("2026-09-01T00:00:00Z");
    const deductionEnd = cycleEnd + 7 * 86400000;
    fetchMock.mockResolvedValue(response({
      code: 0,
      data: {
        Response: {
          Data: {
            Accounts: [
              { CycleEndTime: cycleEnd, DeductionEndTime: deductionEnd },
              {
                CycleEndTime: cycleEnd,
                DeductionEndTime: deductionEnd,
                CycleCapacityUsedPrecise: "0",
                CycleCapacitySizePrecise: "500",
              },
            ],
          },
        },
      },
    }));

    const usage = await getCodeBuddyCnUsage("token", null, null);
    expect(Object.keys(usage.quotas)).toEqual(["Monthly"]);
    expect(usage.quotas.Monthly).toMatchObject({ used: 0, total: 500 });
  });
});
