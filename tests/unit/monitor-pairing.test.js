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
  // Keep the self-starting push channel quiet (no network) during tests.
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
  const mod = await import("@/lib/monitor/pushToMonitor.js");
  mod.stopMonitorPush();
  return mod;
}

async function seedSettings(updates) {
  const { updateSettings } = await import("@/lib/db/repos/settingsRepo.js");
  await updateSettings(updates);
}

function writeTunnelState(state) {
  const tunnelDir = path.join(tempDir, "tunnel");
  fs.mkdirSync(tunnelDir, { recursive: true });
  fs.writeFileSync(path.join(tunnelDir, "state.json"), JSON.stringify(state));
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

describe("buildDevicePayload monitor fields", () => {
  it("includes tunnel info from state.json and settings", async () => {
    writeTunnelState({ shortId: "abc123", tunnelUrl: "https://x.trycloudflare.com" });
    await seedSettings({ tunnelEnabled: true });

    const { buildDevicePayload } = await importPushModule();
    const payload = await buildDevicePayload();

    expect(payload.tunnel).toEqual({
      enabled: true,
      publicUrl: "https://rabc123.abc-tunnel.us",
      tunnelUrl: "https://x.trycloudflare.com",
    });
  });

  it("reports tunnel disabled when the settings flag is off", async () => {
    const { buildDevicePayload } = await importPushModule();
    const payload = await buildDevicePayload();

    expect(payload.tunnel).toEqual({ enabled: false, publicUrl: "", tunnelUrl: "" });
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
});
