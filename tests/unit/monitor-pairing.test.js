import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ENV_KEYS = [
  "DATA_DIR",
  "POTLUCK_MONITOR_SECRET",
  "POTLUCK_MONITOR_URL",
  "POTLUCK_MONITOR_ENABLED",
  "POTLUCK_MONITOR_DEVICE_ID",
];

let savedEnv;
let tempDir;

beforeEach(() => {
  savedEnv = {};
  for (const key of ENV_KEYS) {
    savedEnv[key] = process.env[key];
    delete process.env[key];
  }
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "potluck-monitor-pairing-"));
  process.env.DATA_DIR = tempDir;
  // Keep an explicitly started push channel quiet (no network) during tests.
  process.env.POTLUCK_MONITOR_ENABLED = "0";
  // The db adapter is cached on global (survives vi.resetModules) — drop it so
  // each test gets a fresh database in its own temp DATA_DIR.
  global._dbAdapter = { instance: null, initPromise: null, logged: false };
  vi.resetModules();
});

afterEach(() => {
  vi.resetModules();
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
  fs.rmSync(tempDir, { recursive: true, force: true });
});

async function importPushModule() {
  return await import("@/lib/monitor/pushToMonitor.js");
}

async function seedSettings(updates) {
  const { updateSettings } = await import("@/lib/db/repos/settingsRepo.js");
  await updateSettings(updates);
}

async function seedApiKey({ key = "sk-potluck-monitor", name = "Monitor", isActive = true } = {}) {
  const { getAdapter } = await import("@/lib/db/driver.js");
  const db = await getAdapter();
  db.run(
    `INSERT INTO apiKeys(id, key, name, machineId, isActive, createdAt) VALUES(?, ?, ?, ?, ?, ?)`,
    ["monitor-key", key, name, "test-machine", isActive ? 1 : 0, new Date().toISOString()]
  );
}

function writeTunnelState(state) {
  const tunnelDir = path.join(tempDir, "tunnel");
  fs.mkdirSync(tunnelDir, { recursive: true });
  fs.writeFileSync(path.join(tunnelDir, "state.json"), JSON.stringify(state));
}

function writeTunnelPid(pid) {
  const tunnelDir = path.join(tempDir, "tunnel");
  fs.mkdirSync(tunnelDir, { recursive: true });
  fs.writeFileSync(path.join(tunnelDir, "cloudflared.pid"), String(pid));
}

function writePasswordCache(plaintext) {
  const authDir = path.join(tempDir, "auth");
  fs.mkdirSync(authDir, { recursive: true });
  fs.writeFileSync(path.join(authDir, "dashboard-password"), plaintext);
}

describe("ensureMonitorSecret", () => {
  it("creates the secret file with 0600 on first use", async () => {
    const { ensureMonitorSecret } = await import("@/lib/monitor/pairing.js");
    const secret = ensureMonitorSecret();

    expect(secret).toMatch(/^[0-9a-f]{64}$/);
    const file = path.join(tempDir, "auth", "monitor-secret");
    expect(fs.readFileSync(file, "utf8")).toBe(secret);
    if (process.platform !== "win32") {
      expect(fs.statSync(file).mode & 0o777).toBe(0o600);
    }
  });

  it("reuses the persisted secret on subsequent calls", async () => {
    const first = (await import("@/lib/monitor/pairing.js")).ensureMonitorSecret();
    vi.resetModules();
    const second = (await import("@/lib/monitor/pairing.js")).ensureMonitorSecret();
    expect(second).toBe(first);
  });

  it("prefers POTLUCK_MONITOR_SECRET over the file", async () => {
    process.env.POTLUCK_MONITOR_SECRET = "  env-secret  ";
    const { ensureMonitorSecret } = await import("@/lib/monitor/pairing.js");

    expect(ensureMonitorSecret()).toBe("env-secret");
    expect(fs.existsSync(path.join(tempDir, "auth", "monitor-secret"))).toBe(false);
  });
});

describe("monitor push lifecycle", () => {
  it("does not register runtime listeners merely by being imported", async () => {
    const { statsEmitter } = await import("@/lib/db/repos/usageRepo.js");
    const listenerCountBefore = statsEmitter.listenerCount("update");

    await importPushModule();

    expect(statsEmitter.listenerCount("update")).toBe(listenerCountBefore);
  });

  it("registers only when explicitly started and can be stopped", async () => {
    const { statsEmitter } = await import("@/lib/db/repos/usageRepo.js");
    const listenerCountBefore = statsEmitter.listenerCount("update");
    const { startMonitorPush, stopMonitorPush } = await importPushModule();

    startMonitorPush();
    expect(statsEmitter.listenerCount("update")).toBe(listenerCountBefore + 1);

    stopMonitorPush();
    expect(statsEmitter.listenerCount("update")).toBe(listenerCountBefore);
  });

  it("refreshes the snapshot so Monitor can start after Potluck", async () => {
    vi.useFakeTimers();
    try {
      const { startMonitorPush, stopMonitorPush } = await importPushModule();
      // Baseline first: imported modules (db driver, usageRepo, …) may already
      // hold timers of their own, so count relative to what exists.
      const before = vi.getTimerCount();
      startMonitorPush();
      expect(vi.getTimerCount() - before).toBe(2);

      await vi.advanceTimersByTimeAsync(500);
      expect(vi.getTimerCount() - before).toBe(1);

      await vi.advanceTimersByTimeAsync(30_000);
      expect(vi.getTimerCount() - before).toBe(1);
      stopMonitorPush();
      expect(vi.getTimerCount() - before).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("buildDevicePayload monitor fields", () => {
  it("includes tunnel info from state.json and settings", async () => {
    writeTunnelState({ shortId: "abc123", tunnelUrl: "https://x.trycloudflare.com" });
    writeTunnelPid(process.pid);
    await seedSettings({ tunnelEnabled: true });

    const { buildDevicePayload } = await importPushModule();
    const payload = await buildDevicePayload();

    expect(payload.tunnel).toEqual({
      enabled: true,
      settingsEnabled: true,
      running: true,
      publicUrl: "https://rabc123.abc-tunnel.us",
      tunnelUrl: "https://x.trycloudflare.com",
    });
  });

  it("does not report a persisted tunnel setting as connected without a live process", async () => {
    writeTunnelState({ shortId: "abc123", tunnelUrl: "https://stale.trycloudflare.com" });
    await seedSettings({ tunnelEnabled: true });

    const { buildDevicePayload } = await importPushModule();
    const payload = await buildDevicePayload();

    expect(payload.tunnel).toMatchObject({
      enabled: false,
      settingsEnabled: true,
      running: false,
    });
  });

  it("reports tunnel disabled when the settings flag is off", async () => {
    const { buildDevicePayload } = await importPushModule();
    const payload = await buildDevicePayload();

    expect(payload.tunnel).toEqual({
      enabled: false,
      settingsEnabled: false,
      running: false,
      publicUrl: "",
      tunnelUrl: "",
    });
  });

  it("includes the default dashboardPassword for loopback URLs when no custom password is set", async () => {
    const { buildDevicePayload } = await importPushModule();
    const payload = await buildDevicePayload();

    expect(payload.dashboardPassword).toBe("123456");
  });

  it("prefers the cached plaintext password over the default", async () => {
    writePasswordCache("s3cret\n");

    const { buildDevicePayload } = await importPushModule();
    const payload = await buildDevicePayload();

    expect(payload.dashboardPassword).toBe("s3cret");
  });

  it("omits dashboardPassword when a custom hash exists but no plaintext cache", async () => {
    await seedSettings({ password: "$2a$10$somebcrypthash" });

    const { buildDevicePayload } = await importPushModule();
    const payload = await buildDevicePayload();

    expect("dashboardPassword" in payload).toBe(false);
  });

  it("omits dashboardPassword for non-loopback monitor URLs", async () => {
    process.env.POTLUCK_MONITOR_URL = "https://monitor.example.com";

    const { buildDevicePayload } = await importPushModule();
    const payload = await buildDevicePayload();

    expect("dashboardPassword" in payload).toBe(false);
  });

  it("includes the first active API key for loopback monitor URLs", async () => {
    await seedApiKey({ key: "sk-active", name: "Local monitor" });

    const { buildDevicePayload } = await importPushModule();
    const payload = await buildDevicePayload();

    expect(payload.apiKey).toEqual({ key: "sk-active", name: "Local monitor" });
  });

  it("does not expose API keys to non-loopback monitor URLs", async () => {
    process.env.POTLUCK_MONITOR_URL = "https://monitor.example.com";
    await seedApiKey({ key: "sk-must-stay-local" });

    const { buildDevicePayload } = await importPushModule();
    const payload = await buildDevicePayload();

    expect("apiKey" in payload).toBe(false);
  });

  it("pushes a versioned full quota snapshot with distinct Connection identities", async () => {
    const { createProviderConnection } = await import("@/lib/db/repos/connectionsRepo.js");
    await createProviderConnection({
      provider: "glm",
      authType: "apikey",
      apiKey: "sk-first-must-stay-local",
      name: "First GLM",
      isActive: false,
    });
    await createProviderConnection({
      provider: "glm",
      authType: "apikey",
      apiKey: "sk-second-must-stay-local",
      name: "Second GLM",
      isActive: false,
    });

    const { buildDevicePayload } = await importPushModule();
    const payload = await buildDevicePayload();
    const rows = payload.limits.providers;

    expect(payload.limits.schemaVersion).toBe(2);
    expect(payload.limits.snapshotType).toBe("full");
    expect(payload.limits.sourceInstanceId).toMatch(/^[0-9a-f-]{36}$/);
    expect(payload.limits.snapshotId).toContain(payload.limits.sourceInstanceId);
    expect(rows).toHaveLength(2);
    expect(new Set(rows.map((row) => row.connectionKey)).size).toBe(2);
    expect(rows.every((row) => row.managedBy === "potluck")).toBe(true);
    expect(JSON.stringify(payload.limits)).not.toMatch(/sk-first|sk-second|accessToken|refreshToken/);
  });
});
