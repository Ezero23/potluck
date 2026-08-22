import os from "node:os";
import { getAdapter } from "../db/driver.js";
import { parseJson, stringifyJson } from "../db/helpers/jsonCol.js";
import { statsEmitter } from "../db/repos/usageRepo.js";
import { getApiKeys } from "../localDb.js";
import { isCloudflaredRunning } from "../tunnel/cloudflare/cloudflared.js";
import { loadState } from "../tunnel/shared/state.js";
import { ensureMonitorSecret, readDashboardPasswordPlain } from "./pairing.js";
import { buildQuotaSnapshot } from "./quotaCoordinator.js";
import { acknowledgeMonitorEvents, buildMonitorEnvelope } from "./healthEvents.js";
import pkg from "../../../package.json" with { type: "json" };

const DEFAULT_URL = "http://127.0.0.1:17321";
const DEFAULT_DEVICE_ID = "potluck";
const DEFAULT_DASHBOARD_PASSWORD = "123456";
const PUSH_DEBOUNCE_MS = 500;
const FAILURE_COOLDOWN_MS = 30_000;
const QUOTA_REFRESH_INTERVAL_MS = 60_000;
const PUSH_REQUEST_TIMEOUT_MS = 15_000;

let lastPushAt = 0;
let pushTimer = null;
let failureBackoffUntil = 0;
let loggedDisabled = false;
let loggedMissingSecret = false;
let quotaRefreshTimer = null;

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

async function buildProvidersPayload() {
  try {
    return await buildQuotaSnapshot();
  } catch (e) {
    // An empty full snapshot means "all Connections were deleted" to Monitor.
    // Preserve the last accepted snapshot by omitting limits from this push.
    console.error("[monitor] Failed to build quota snapshot; preserving last snapshot:", e.message);
    return null;
  }
}

function buildTunnelInfo(settingsRaw) {
  const state = loadState();
  const shortId = state?.shortId || "";
  const settingsEnabled = settingsRaw?.tunnelEnabled === true;
  const running = settingsEnabled && isCloudflaredRunning();
  return {
    enabled: running,
    settingsEnabled,
    running,
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

async function buildApiKeyField() {
  try {
    const keys = await getApiKeys();
    const active = Array.isArray(keys) ? keys.find((k) => k.isActive !== false) : null;
    if (active && active.key) return { apiKey: { key: active.key, name: active.name || "" } };
  } catch (e) {
    console.warn(`[monitor] could not read api key: ${e.message}`);
  }
  return {};
}

// Today's per-hour token/cost buckets (local hours 0-23), derived from the
// per-request usageHistory rows so the Monitor can render an hourly view for
// the DAY tab instead of a single degenerate day cell.
function buildTodayHours(db) {
  const hours = {};
  try {
    const midnight = new Date();
    midnight.setHours(0, 0, 0, 0);
    const rows = db.all(
      `SELECT timestamp, promptTokens, completionTokens, cost FROM usageHistory WHERE timestamp >= ? AND status = 'ok'`,
      [midnight.toISOString()]
    );
    for (const row of rows) {
      const ms = Date.parse(row.timestamp || "");
      if (!Number.isFinite(ms)) continue;
      const h = new Date(ms).getHours();
      if (!hours[h]) hours[h] = { tokens: 0, costUsd: 0 };
      hours[h].tokens += Math.max(0, Math.round(Number(row.promptTokens || 0) + Number(row.completionTokens || 0)));
      hours[h].costUsd += Number(row.cost || 0);
    }
  } catch (e) {
    console.warn(`[monitor] could not build today hours: ${e.message}`);
  }
  return { date: getLocalDateKey(), hours };
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
    ...(limits ? { limits } : {}),
    monitor: buildMonitorEnvelope(limits),
    tunnel: buildTunnelInfo(settingsRaw),
    todayHours: buildTodayHours(db),
    ...(isLoopbackMonitorUrl() ? buildDashboardPasswordField(settingsRaw) : {}),
    ...(isLoopbackMonitorUrl() ? await buildApiKeyField() : {}),
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
    const targetUrl = monitorUrl();
    const target = new URL(targetUrl);
    if (!isLoopbackMonitorUrl() && target.protocol !== "https:") {
      throw new Error("Remote Monitor URL must use HTTPS");
    }
    const payload = await buildDevicePayload();
    const url = `${targetUrl}/api/ingest`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), PUSH_REQUEST_TIMEOUT_MS);
    let res;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "authorization": `Bearer ${secret}`,
        },
        body: stringifyJson(payload),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
    }

    lastPushAt = Date.now();
    failureBackoffUntil = 0;
    acknowledgeMonitorEvents(payload.monitor?.events?.map((event) => event.id) || []);
    console.log(`[monitor] Pushed usage to ${url} (deviceId=${payload.deviceId}, events=${payload.monitor?.events?.length || 0})`);
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
  if (!quotaRefreshTimer) {
    quotaRefreshTimer = setInterval(() => schedulePush(), QUOTA_REFRESH_INTERVAL_MS);
    quotaRefreshTimer.unref?.();
  }
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
  if (quotaRefreshTimer) {
    clearInterval(quotaRefreshTimer);
    quotaRefreshTimer = null;
  }
}
