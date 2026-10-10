import { describe, it, expect, afterEach } from "vitest";
import { proxyAwareFetch } from "../../open-sse/utils/proxyFetch.js";

// The env-proxy burst cooldown: after 3 consecutive double-failures the proxy
// is skipped for 30s. Drive it with a proxy port nothing listens on; the
// target uses the .invalid TLD (never resolves) so the direct fallback throws
// too — the assertion is on the warning cadence, not the response.
describe("proxyAwareFetch env-proxy cooldown", () => {
  const prevProxy = process.env.HTTP_PROXY;
  const prevHttpsProxy = process.env.HTTPS_PROXY;

  afterEach(() => {
    if (prevProxy === undefined) delete process.env.HTTP_PROXY; else process.env.HTTP_PROXY = prevProxy;
    if (prevHttpsProxy === undefined) delete process.env.HTTPS_PROXY; else process.env.HTTPS_PROXY = prevHttpsProxy;
  });

  it("stops hammering a dead env proxy after the failure threshold", async () => {
    const warnings = [];
    const origWarn = console.warn;
    console.warn = (...args) => { warnings.push(String(args[0] || "")); };

    try {
      // Port 9 (discard) — nothing listens; connection refused immediately.
      process.env.HTTP_PROXY = "http://127.0.0.1:9";
      process.env.HTTPS_PROXY = "http://127.0.0.1:9";
      const target = "http://cooldown-probe.invalid/";

      const attempt = () => proxyAwareFetch(target).catch((e) => e); // both paths fail; count warnings

      // 3 double-failures arm the cooldown.
      for (let i = 0; i < 3; i++) await attempt();
      expect(warnings.filter((w) => w.includes("Proxy failed twice")).length).toBe(3);

      // …subsequent calls skip the proxy entirely — no further burst warnings.
      for (let i = 0; i < 3; i++) await attempt();
      expect(warnings.filter((w) => w.includes("Proxy failed twice")).length).toBe(3);
      expect(warnings.some((w) => w.includes("cooldown"))).toBe(true);
    } finally {
      console.warn = origWarn;
    }
  }, 20_000);
});
