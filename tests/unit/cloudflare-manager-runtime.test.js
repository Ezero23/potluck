import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/localDb", () => ({
  getSettings: vi.fn(async () => ({ tunnelEnabled: false })),
  updateSettings: vi.fn(async () => ({})),
}));

vi.mock("@/lib/monitor/pushToMonitor.js", () => ({
  notifyMonitorContentChanged: vi.fn(),
}));

vi.mock("@/lib/tunnel/cloudflare/cloudflared.js", () => ({
  spawnQuickTunnel: vi.fn(),
  killCloudflared: vi.fn(),
  isCloudflaredRunning: vi.fn(() => false),
  setUnexpectedExitHandler: vi.fn(),
  registerGracefulShutdown: vi.fn(),
}));

afterEach(() => {
  delete globalThis.__potluckTunnelRuntime;
  vi.resetModules();
});

describe("cloudflare manager runtime state", () => {
  it("shares one service state across separately loaded server bundles", async () => {
    const first = await import("@/lib/tunnel/cloudflare/manager.js");
    first.getTunnelService().healthStatus = "healthy";

    vi.resetModules();
    const second = await import("@/lib/tunnel/cloudflare/manager.js");

    expect(second.getTunnelService()).toBe(first.getTunnelService());
    expect(second.getTunnelService().healthStatus).toBe("healthy");
  });
});
