import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../../src/lib/tunnel/shared/dnsResolver.js", () => ({
  resolveDns: vi.fn().mockResolvedValue(true),
}));

import { probeUrlAlive } from "../../src/lib/tunnel/cloudflare/healthCheck.js";

const realFetch = globalThis.fetch;

function stubFetch(status) {
  globalThis.fetch = vi.fn().mockResolvedValue({ ok: status >= 200 && status < 300, status });
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  globalThis.fetch = realFetch;
  vi.useRealTimers();
});

describe("probeUrlAlive", () => {
  it("treats 2xx as alive", async () => {
    stubFetch(200);
    expect(await probeUrlAlive("https://es.potluck.top")).toBe(true);
  });

  it("treats a WAF 403/challenge as alive — the edge answered, tunnel path works", async () => {
    stubFetch(403);
    expect(await probeUrlAlive("https://es.potluck.top")).toBe(true);
  });

  it("treats edge origin-unreachable answers (502/504/530) as dead", async () => {
    for (const status of [502, 504, 530]) {
      stubFetch(status);
      expect(await probeUrlAlive("https://es.potluck.top")).toBe(false);
    }
  });

  it("treats fetch failures (timeout/reset) as dead", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("fetch failed"));
    expect(await probeUrlAlive("https://es.potluck.top")).toBe(false);
  });

  it("returns false for empty urls", async () => {
    expect(await probeUrlAlive("")).toBe(false);
  });
});
