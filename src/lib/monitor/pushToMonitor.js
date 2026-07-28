import os from "node:os";
import { getAdapter } from "../db/driver.js";
import { parseJson, stringifyJson } from "../db/helpers/jsonCol.js";
import { statsEmitter } from "../db/repos/usageRepo.js";
import { getProviderConnections } from "../db/repos/connectionsRepo.js";
import { loadState } from "../tunnel/shared/state.js";
import { ensureMonitorSecret, readDashboardPasswordPlain } from "./pairing.js";
import pkg from "../../../package.json" with { type: "json" };

const DEFAULT_URL = "http://127.0.0.1:17321";
const DEFAULT_DEVICE_ID = "potluck";
const DEFAULT_DASHBOARD_PASSWORD = "123456";
const PUSH_DEBOUNCE_MS = 500;
const FAILURE_COOLDOWN_MS = 30_000;

let lastPushAt = 0;
let pushTimer = null;
let failureBackoffUntil = 0;
let loggedDisabled = false;
let loggedMissingSecret = false;

function isEnabled() {
  const env = process.env.POTLUCK_MONITOR_ENABLED;
  if (env === "0" || env === "false" || env === "no") return false;
  if (env === "1" || env === "true" || env === "yes") return true;
  // Zero-config local pairing: the monitor secret auto-provisions into
  // DATA_DIR/auth/monitor-secret and the default target is loopback, so the
  // push channel is on unless explicitly disabled.
  return true;
}

function monitorUrl() {
  return (process.env.POTLUCK_MONITOR_URL || DEFAULT_URL).replace(/\/$/, "");
}

function isLoopbackMonitorUrl() {
  try {
    const host = new URL(monitorUrl()).hostname.replace(/^\[|\]$/g, "").toLowerCase();
    return host === "127.0.0.1" || host === "localhost" || host === "::1";
  } catch {
    return false;
  }
}

function getLocalDateKey(timestamp) {
  const d = timestamp ? new Date(timestamp) : new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function dateKeyBefore(daysAgo) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function emptyPeriod() {
  return {
    totalTokens: 0,
    costUsd: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    outputTokens: 0,
    clients: {},
    clientCosts: {},
    clientCacheReads: {},
    clientCacheWrites: {},
    clientOutputs: {},
    models: {},
    modelCosts: {},
    modelCacheReads: {},
    modelCacheWrites: {},
    modelOutputs: {},
    clientModels: {},
    clientModelCosts: {},
    projects: {},
    sessions: {},
  };
}

function addDayIntoPeriod(period, day) {
  if (!day) return;
  const promptTokens = day.promptTokens || 0;
  const completionTokens = day.completionTokens || 0;
  const cachedTokens = day.cachedTokens || 0;
  const cost = day.cost || 0;

  period.totalTokens += Math.max(0, promptTokens + completionTokens);
  period.outputTokens += Math.max(0, completionTokens);
  period.cacheReadTokens += Math.max(0, cachedTokens);
  period.costUsd += cost;

  const clientKey = "potluck";
  period.clients[clientKey] = (period.clients[clientKey] || 0) + Math.max(0, promptTokens + completionTokens);
  period.clientCosts[clientKey] = (period.clientCosts[clientKey] || 0) + cost;
  if (cachedTokens > 0) period.clientCacheReads[clientKey] = (period.clientCacheReads[clientKey] || 0) + Math.max(0, cachedTokens);
  if (completionTokens > 0) period.clientOutputs[clientKey] = (period.clientOutputs[clientKey] || 0) + Math.max(0, completionTokens);

  for (const [mk, m] of Object.entries(day.byModel || {})) {
    const model = m.rawModel || mk.split("|")[0] || "unknown";
    const modelTokens = Math.max(0, (m.promptTokens || 0) + (m.completionTokens || 0));
    if (modelTokens > 0) {
      period.models[model] = (period.models[model] || 0) + modelTokens;
      period.modelCosts[model] = (period.modelCosts[model] || 0) + (m.cost || 0);
      if (m.cachedTokens > 0) period.modelCacheReads[model] = (period.modelCacheReads[model] || 0) + m.cachedTokens;
      if (m.completionTokens > 0) period.modelOutputs[model] = (period.modelOutputs[model] || 0) + m.completionTokens;

      if (!period.clientModels[clientKey]) period.clientModels[clientKey] = {};
      period.clientModels[clientKey][model] = (period.clientModels[clientKey][model] || 0) + modelTokens;
      if (!period.clientModelCosts[clientKey]) period.clientModelCosts[clientKey] = {};
      period.clientModelCosts[clientKey][model] = (period.clientModelCosts[clientKey][model] || 0) + (m.cost || 0);
    }
  }
}

function normalizeConnectionStatus(conn) {
  if (conn.isActive === false) return "disabled";

  const testStatus = String(conn.testStatus || "").trim().toLowerCase();
  const errorCode = String(conn.errorCode || "").trim().toLowerCase();
  const lastError = String(conn.lastError || "").trim();

  if (testStatus === "ok") return "ok";
  if (testStatus === "error" || lastError) {
    if (/rate.?limit|429|too many/.test(errorCode + " " + lastError.toLowerCase())) {
      return errorCode.includes("source") || lastError.toLowerCase().includes("source")
        ? "sourceRateLimited"
        : "rateLimited";
    }
    if (/auth|unauth|401|403|forbidden/.test(errorCode + " " + lastError.toLowerCase())) {
      return "unauthorized";
    }
    if (/unavailable|503|502|500|timeout/.test(errorCode + " " + lastError.toLowerCase())) {
      return "unavailable";
    }
    return "error";
  }

  // Active connection with no explicit test result yet: treat as ok so it appears in Monitor.
  return "ok";
}

function providerRegion(providerId) {
  const p = String(providerId || "").toLowerCase();
  if (p.endsWith("-cn")) return "cn";
  if (p === "qoder") return "cn";
  return "en";
}

function providerDisplayLabel(providerId) {
  const p = String(providerId || "").toLowerCase();
  const known = {
    "gemini-cli": "Gemini CLI",
    "qoder-cn": "Qoder CN",
    kimchi: "Kimi (kimchi)",
    kimi: "Kimi",
    "opencode-go": "OpenCode Go",
    "brave-search": "Brave Search",
    tavily: "Tavily",
    nvidia: "NVIDIA",
    codex: "Codex",
    openrouter: "OpenRouter",
    ollama: "Ollama",
  };
  return known[p] || p[0]?.toUpperCase() + p.slice(1);
}

const MONITOR_COLLAPSIBLE_PROVIDERS = new Set([
  "claude", "codex", "cursor", "openrouter", "mimo", "qoder", "kimi", "ollama",
]);

function stableAccountKey(conn) {
  const provider = String(conn.provider || "").toLowerCase();
  // For providers that Monitor may also track locally, use a stable identity
  // (email or name) so aggregateLimits merges Potluck and local entries and
  // the best status (usually ok from Potluck) wins.
  if (MONITOR_COLLAPSIBLE_PROVIDERS.has(provider)) {
    return conn.email || conn.name || conn.displayName || conn.id;
  }
  return conn.id;
}

async function buildProvidersPayload() {
  try {
    const connections = await getProviderConnections();
    const providers = connections.map((conn) => {
      const name = conn.name || conn.displayName || "";
      const email = conn.email || "";
      const label = name || providerDisplayLabel(conn.provider);
      const status = normalizeConnectionStatus(conn);
      return {
        provider: conn.provider,
        accountKey: stableAccountKey(conn),
        accountLabel: label,
        accountName: name,
        accountEmail: email,
        status,
        source: conn.authType || "api",
        sourceDetail: "web",
        // Use the current push time as updatedAt: a live Potluck connection should
        // win over a stale notConfigured local observation in aggregateLimits.
        updatedAt: new Date().toISOString(),
        region: providerRegion(conn.provider),
      };
    });

    return {
      updatedAt: new Date().toISOString(),
      providers,
    };
  } catch (e) {
    console.error("[monitor] Failed to build providers payload:", e.message);
    return { updatedAt: new Date().toISOString(), providers: [] };
  }
}

function buildTunnelInfo(settingsRaw) {
  const state = loadState();
  const shortId = state?.shortId || "";
  return {
    enabled: settingsRaw?.tunnelEnabled === true,
    publicUrl: shortId ? `https://r${shortId}.abc-tunnel.us` : "",
    tunnelUrl: state?.tunnelUrl || "",
  };
}

// Only sent to loopback monitor targets — the plaintext never leaves the machine.
function buildDashboardPasswordField(settingsRaw) {
  const plain = readDashboardPasswordPlain();
  if (plain) return { dashboardPassword: plain };
  // No custom password hash → the default password is in effect.
  if (!settingsRaw?.password) return { dashboardPassword: DEFAULT_DASHBOARD_PASSWORD };
  // Custom password set but not cached locally yet → omit until the next change.
  return {};
}

export async function buildDevicePayload() {
  const db = await getAdapter();
  const todayKey = getLocalDateKey();
  const weekStartKey = dateKeyBefore(6);
  const monthStartKey = dateKeyBefore(29);

  const todayRow = db.get(`SELECT data FROM usageDaily WHERE dateKey = ?`, [todayKey]);
  const weekRows = db.all(`SELECT dateKey, data FROM usageDaily WHERE dateKey >= ?`, [weekStartKey]);
  const monthRows = db.all(`SELECT dateKey, data FROM usageDaily WHERE dateKey >= ?`, [monthStartKey]);
  const allRows = db.all(`SELECT dateKey, data FROM usageDaily`);
  const settingsRow = db.get(`SELECT data FROM settings WHERE id = 1`);
  const settingsRaw = settingsRow ? parseJson(settingsRow.data, {}) : {};

  const periods = {
    today: emptyPeriod(),
    week: emptyPeriod(),
    month: emptyPeriod(),
    allTime: emptyPeriod(),
  };

  const add = (periodName, day) => addDayIntoPeriod(periods[periodName], day);

  if (todayRow) add("today", parseJson(todayRow.data, {}));
  for (const r of weekRows) add("week", parseJson(r.data, {}));
  for (const r of monthRows) add("month", parseJson(r.data, {}));
  for (const r of allRows) add("allTime", parseJson(r.data, {}));

  const limits = await buildProvidersPayload();

  return {
    deviceId: process.env.POTLUCK_MONITOR_DEVICE_ID || DEFAULT_DEVICE_ID,
    hostname: os.hostname(),
    platform: process.platform,
    agentVersion: pkg.version || "0.0.0",
    agentRuntime: `node-${process.version}`,
    updatedAt: new Date().toISOString(),
    trackedClients: ["potluck"],
    clientStatus: { potluck: "active" },
    projectsEnabled: false,
    periods,
    limits,
    tunnel: buildTunnelInfo(settingsRaw),
    ...(isLoopbackMonitorUrl() ? buildDashboardPasswordField(settingsRaw) : {}),
  };
}

async function pushOnce() {
  if (!isEnabled()) {
    if (!loggedDisabled) {
      loggedDisabled = true;
      console.log("[monitor] Potluck → Monitor push disabled (set POTLUCK_MONITOR_ENABLED=1 to enable).");
    }
    return;
  }

  const secret = ensureMonitorSecret();
  if (!secret) {
    if (!loggedMissingSecret) {
      loggedMissingSecret = true;
      console.warn("[monitor] no monitor secret available; cannot push to monitor.");
    }
    return;
  }

  if (Date.now() < failureBackoffUntil) return;

  try {
    const payload = await buildDevicePayload();
    const url = `${monitorUrl()}/api/ingest`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "authorization": `Bearer ${secret}`,
      },
      body: stringifyJson(payload),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
    }

    lastPushAt = Date.now();
    failureBackoffUntil = 0;
    console.log(`[monitor] Pushed usage to ${url} (deviceId=${payload.deviceId})`);
  } catch (e) {
    failureBackoffUntil = Date.now() + FAILURE_COOLDOWN_MS;
    console.error(`[monitor] Push failed: ${e.message}; cooling off ${FAILURE_COOLDOWN_MS}ms`);
  }
}

function schedulePush() {
  if (pushTimer) return;
  pushTimer = setTimeout(() => {
    pushTimer = null;
    pushOnce().catch(() => {});
  }, PUSH_DEBOUNCE_MS);
  pushTimer.unref?.();
}

// Trigger a debounced push from other modules (settings change, tunnel toggle, …)
// so the Monitor sees fresh tunnel URL / dashboard password info immediately.
export function notifyMonitorContentChanged() {
  schedulePush();
}

let listenerInstalled = false;

export function startMonitorPush() {
  if (listenerInstalled) return;
  listenerInstalled = true;
  statsEmitter.on("update", schedulePush);
  // Also push once at startup so the monitor immediately shows current totals.
  schedulePush();
}

export function stopMonitorPush() {
  statsEmitter.off("update", schedulePush);
  listenerInstalled = false;
  if (pushTimer) {
    clearTimeout(pushTimer);
    pushTimer = null;
  }
}
