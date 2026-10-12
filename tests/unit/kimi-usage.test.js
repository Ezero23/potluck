import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../open-sse/utils/proxyFetch.js", () => ({
  proxyAwareFetch: vi.fn(),
}));

import { proxyAwareFetch } from "../../open-sse/utils/proxyFetch.js";
import { getUsageForProvider } from "../../open-sse/services/usage.js";

// Real /coding/v1/usages shape (observed 2026-10): top-level `usage` is the
// weekly quota, limits[] carries the rolling 5-hour session window, and
// booster_wallet.userId is the account's stable identity.
function kimiResponse(overrides = {}) {
  return new Response(
    JSON.stringify({
      usage: { limit: "100", used: "6", remaining: "94", resetTime: "2026-10-16T12:46:19.216115Z" },
      limits: [
        {
          window: { duration: 300, timeUnit: "TIME_UNIT_MINUTE" },
          detail: { limit: "100", remaining: "90", resetTime: "2026-10-11T15:46:19.216115Z" },
        },
      ],
      booster_wallet: { userId: "cp6uq1qul723lq833j1g" },
      ...overrides,
    }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
}

describe("Kimi coding-plan usage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("maps weekly + 5-hour windows and hashes the booster_wallet userId", async () => {
    proxyAwareFetch.mockResolvedValueOnce(kimiResponse());

    const usage = await getUsageForProvider({
      provider: "kimi",
      authType: "apikey",
      apiKey: "sk-kimi-test",
    });

    expect(usage.plan).toBe("Kimi Coding Plan");
    expect(usage.quotas["Weekly"]).toMatchObject({ used: 6, total: 100, remaining: 94 });
    expect(usage.quotas["Session"]).toMatchObject({ used: 10, total: 100, remaining: 90 });
    // Same hash recipe as the Monitor's local kimi row so both sides merge.
    const crypto = await import("node:crypto");
    const hash = crypto.createHash("sha256");
    hash.update("kimi-account").update("\0").update("cp6uq1qul723lq833j1g").update("\0");
    expect(usage.accountKey).toBe(`sha256:${hash.digest("hex")}`);
  });

  it("still returns quotas when the response carries no wallet identity", async () => {
    proxyAwareFetch.mockResolvedValueOnce(kimiResponse({ booster_wallet: undefined }));

    const usage = await getUsageForProvider({
      provider: "kimi",
      authType: "apikey",
      apiKey: "sk-kimi-test",
    });

    expect(usage.quotas["Weekly"]).toBeTruthy();
    expect(usage.accountKey).toBeUndefined();
  });

  it("reports invalid keys as a plain message (no throw)", async () => {
    proxyAwareFetch.mockResolvedValueOnce(new Response("{}", { status: 401 }));

    const usage = await getUsageForProvider({
      provider: "kimi",
      authType: "apikey",
      apiKey: "sk-kimi-bad",
    });

    expect(usage.message).toContain("invalid or expired");
  });
});
