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

  it("returns Monthly and stable account/pool keys only when subscription identity is explicit", async () => {
    proxyAwareFetch
      .mockResolvedValueOnce(
        glmResponse([
          { type: "TOKENS_LIMIT", unit: 6, number: 1, percentage: 25 },
          { type: "TIME_LIMIT", percentage: 100 },
        ])
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({
        data: [{ id: "subscription-shared", product_name: "GLM Coding Pro", next_renew_time: "2026-09-01T00:00:00Z" }],
      }), { status: 200, headers: { "Content-Type": "application/json" } }));

    const usage = await getUsageForProvider({
      provider: "glm",
      authType: "apikey",
      apiKey: "sk-shared",
    });

    expect(usage.plan).toBe("GLM Coding Pro");
    expect(usage.quotas.Monthly.remainingPercentage).toBe(0);
    expect(usage.quotas.Monthly.resetAt).toBe("2026-09-01T00:00:00.000Z");
    expect(usage.accountKey).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(usage.quotaPoolKey).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it("treats one short token window as Session and ignores an invalid renewal timestamp", async () => {
    proxyAwareFetch
      .mockResolvedValueOnce(glmResponse([
        { type: "tokens_limit", unit: 3, number: 5, percentage: 40 },
        { type: "time_limit", percentage: 100 },
      ]))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        data: [{ id: "subscription-shared", next_renew_time: "not-a-date" }],
      }), { status: 200, headers: { "Content-Type": "application/json" } }));

    const usage = await getUsageForProvider({
      provider: "glm",
      authType: "apikey",
      apiKey: "sk-shared",
    });

    expect(usage.quotas.Session.remainingPercentage).toBe(60);
    expect(usage.quotas.Weekly).toBeUndefined();
    expect(usage.quotas.Monthly.resetAt).toBeNull();
  });
});
