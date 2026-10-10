import { beforeEach, describe, expect, it, vi } from "vitest";

const fetchMock = vi.fn();

vi.mock("../../open-sse/utils/proxyFetch.js", () => ({
  proxyAwareFetch: (...args) => fetchMock(...args),
}));

const { getVercelAiGatewayUsage } = await import("../../open-sse/services/usage/misc.js");

describe("Vercel AI Gateway credit truth", () => {
  beforeEach(() => fetchMock.mockReset());

  it("reports balance and lifetime spend without inventing a monthly denominator", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ balance: "95.50", total_used: "4.50" }),
    });

    const usage = await getVercelAiGatewayUsage("key");
    expect(usage.quotas["Credit balance (USD)"]).toMatchObject({ amount: 95.5, remaining: 95.5 });
    expect(usage.quotas["Lifetime spend (USD)"]).toMatchObject({ used: 4.5, total: null });
    expect(usage.quotas["Credit balance (USD)"]).not.toHaveProperty("remainingPercentage");
  });

  it("preserves an explicitly exhausted zero balance", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ balance: "0", total_used: "12" }),
    });

    const usage = await getVercelAiGatewayUsage("key");
    expect(usage.quotas["Credit balance (USD)"].amount).toBe(0);
    expect(usage.quotas["Lifetime spend (USD)"].used).toBe(12);
  });

  it("does not turn missing response fields into zero credits", async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
    const usage = await getVercelAiGatewayUsage("key");
    expect(usage.quotas).toBeUndefined();
    expect(usage.message).toContain("No credit data");
  });
});
