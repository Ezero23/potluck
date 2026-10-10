import { beforeEach, describe, expect, it, vi } from "vitest";

const fetchMock = vi.fn();

vi.mock("../../open-sse/utils/proxyFetch.js", () => ({
  proxyAwareFetch: (...args) => fetchMock(...args),
}));

const { getGitHubUsage } = await import("../../open-sse/services/usage/github.js");

function jsonResponse(body) {
  return { ok: true, status: 200, json: async () => body };
}

describe("GitHub Copilot quota truth", () => {
  beforeEach(() => fetchMock.mockReset());

  it("omits absent paid quota buckets instead of inventing unlimited quotas", async () => {
    fetchMock.mockImplementation(async (url) => String(url) === "https://api.github.com/user"
      ? jsonResponse({ id: 42, login: "octocat" })
      : jsonResponse({
          copilot_plan: "pro",
          quota_snapshots: {
            premium_interactions: { entitlement: 300, remaining: 0 },
          },
        }));

    const usage = await getGitHubUsage("token", {});
    expect(Object.keys(usage.quotas)).toEqual(["premium_interactions"]);
    expect(usage.quotas.premium_interactions).toMatchObject({ used: 300, total: 300, remaining: 0 });
    expect(usage.accountKey).toMatch(/^sha256:/);
    expect(usage.quotaPoolKey).toMatch(/^sha256:/);
  });

  it("omits incomplete free quota buckets but preserves a real exhausted quota", async () => {
    fetchMock.mockImplementation(async (url) => String(url) === "https://api.github.com/user"
      ? jsonResponse({ id: 42 })
      : jsonResponse({
          copilot_plan: "free",
          monthly_quotas: { chat: 50 },
          limited_user_quotas: { chat: 0, completions: 0 },
        }));

    const usage = await getGitHubUsage("token", {});
    expect(Object.keys(usage.quotas)).toEqual(["chat"]);
    expect(usage.quotas.chat).toMatchObject({ used: 50, total: 50, remaining: 0 });
  });
});
