import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../open-sse/utils/proxyFetch.js", () => ({
  proxyAwareFetch: vi.fn(),
}));

import { proxyAwareFetch } from "../../open-sse/utils/proxyFetch.js";
import { getUsageForProvider } from "../../open-sse/services/usage.js";

function glmResponse(limits) {
  return new Response(
    JSON.stringify({ data: { level: "lite", limits } }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
}

describe("GLM coding-plan usage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("parses bigmodel.cn CREDIT_LIMIT 5-hour + weekly windows", async () => {
    proxyAwareFetch.mockResolvedValueOnce(
      glmResponse([
        { type: "CREDIT_LIMIT", unit: 5, number: 5, usage: 100, remaining: 19.95, nextResetTime: 1766036400000 },
        { type: "CREDIT_LIMIT", unit: 6, number: 1, usage: 1000, remaining: 515.3, nextResetTime: 1766122800000 },
      ])
    );

    const usage = await getUsageForProvider({
      provider: "glm-cn",
      authType: "apikey",
      apiKey: "sk-test",
    });

    expect(usage.plan).toBe("Lite");
    expect(usage.quotas.Session.remainingPercentage).toBeCloseTo(19.95, 1);
    expect(usage.quotas.Weekly.remainingPercentage).toBeCloseTo(51.53, 1);
    expect(usage.quotas.Session.resetAt).toBe(new Date(1766036400000).toISOString());
    // Opaque fingerprint so the Monitor can match this row to a local probe of
    // the same API key.
    expect(usage.email).toMatch(/^glm-[0-9a-f]{64}@glm-account\.local$/);
  });

  it("sends the raw API key as the Authorization value", async () => {
    proxyAwareFetch.mockResolvedValueOnce(glmResponse([]));

    await getUsageForProvider({ provider: "glm-cn", authType: "apikey", apiKey: "sk-raw" });

    const [, init] = proxyAwareFetch.mock.calls[0];
    expect(init.headers.Authorization).toBe("sk-raw");
  });

  it("still parses z.ai international TOKENS_LIMIT rows", async () => {
    proxyAwareFetch.mockResolvedValueOnce(
      glmResponse([
        { type: "TOKENS_LIMIT", percentage: 42, nextResetTime: 1766036400000 },
      ])
    );

    const usage = await getUsageForProvider({
      provider: "glm",
      authType: "apikey",
      apiKey: "sk-test",
    });

    expect(usage.quotas.Weekly.remainingPercentage).toBeCloseTo(58, 0);
    expect(usage.quotas.Session).toBeUndefined();
  });
});
