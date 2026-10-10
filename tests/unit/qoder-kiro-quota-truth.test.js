import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../open-sse/utils/proxyFetch.js", () => ({
  proxyAwareFetch: vi.fn(),
}));

import { proxyAwareFetch } from "../../open-sse/utils/proxyFetch.js";
import { getKiroUsage } from "../../open-sse/services/usage/kiro.js";
import { getQoderUsage } from "../../open-sse/services/usage/misc.js";

function jsonResponse(body) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

describe("Qoder and Kiro quota truthfulness", () => {
  beforeEach(() => vi.clearAllMocks());

  it("does not invent Qoder zero quotas when quota objects are absent", async () => {
    proxyAwareFetch.mockResolvedValueOnce(jsonResponse({ expiresAt: 1788134400000 }));

    const usage = await getQoderUsage("token");

    expect(usage.quotas).toBeUndefined();
    expect(usage.message).toMatch(/No quota data/);
  });

  it("preserves a real exhausted Qoder quota", async () => {
    proxyAwareFetch.mockResolvedValueOnce(jsonResponse({
      userQuota: { total: 100, used: 100, remaining: 0, unit: "credits" },
      totalUsagePercentage: 100,
    }));

    const usage = await getQoderUsage("token");

    expect(usage.quotas.user).toMatchObject({ total: 100, used: 100, remaining: 0 });
    expect(usage.quotas.organization).toBeUndefined();
    expect(usage.totalUsagePercentage).toBe(100);
  });

  it("drops incomplete Kiro breakdowns while preserving a real zero-used quota", async () => {
    proxyAwareFetch.mockResolvedValueOnce(jsonResponse({
      subscriptionInfo: { subscriptionTitle: "Kiro Pro" },
      usageBreakdownList: [
        { resourceType: "AGENTIC_REQUEST", currentUsageWithPrecision: 0, usageLimitWithPrecision: 100 },
        { resourceType: "BROKEN", currentUsageWithPrecision: 0 },
      ],
    }));

    const usage = await getKiroUsage("token", { authMethod: "builder-id" });

    expect(usage.quotas.agentic_request).toMatchObject({ used: 0, total: 100, remaining: 100 });
    expect(usage.quotas.broken).toBeUndefined();
  });
});
