import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

import { DATA_DIR } from "@/lib/dataDir";
import {
  getProviderConnectionById,
  getProviderConnections,
  updateProviderConnection,
} from "@/lib/db/repos/connectionsRepo";
import { resolveConnectionProxyConfig } from "@/lib/network/connectionProxy";
import { getUsageForProvider } from "open-sse/services/usage.js";
import { getExecutor } from "open-sse/executors/index.js";
import { USAGE_APIKEY_PROVIDERS } from "@/shared/constants/providers";
import { recordMonitorEvent } from "./healthEvents.js";

export const QUOTA_SNAPSHOT_SCHEMA_VERSION = 2;
export const DEFAULT_QUOTA_TTL_MS = 5 * 60 * 1000;
export const DEFAULT_QUOTA_TIMEOUT_MS = 20 * 1000;
export const DEFAULT_QUOTA_CONCURRENCY = 3;

const AUTH_EXPIRED_PATTERNS = ["expired", "authentication", "unauthorized", "401", "re-authorize"];
const UNSUPPORTED_PATTERNS = ["not implemented", "not available", "no public usage", "tracked per request", "usage details require"];
const RATE_LIMIT_PATTERNS = ["rate limit", "rate-limit", "429", "too many requests", "ratelimited"];
const AUTH_PATTERNS = ["invalid", "expired", "unauthorized", "authentication", "401", "403", "re-authorize"];
const UNAVAILABLE_PATTERNS = ["temporarily unavailable", "unable to fetch", "unavailable", "timeout", "network", "502", "503", "500"];

let sourceInstanceId;

function text(value) {
  return String(value || "").trim();
}

function lower(value) {
  return text(value).toLowerCase();
}

function normalizeSourceInstanceId(value) {
  const raw = text(value);
  if (!raw) return "";
  if (raw.startsWith("potluck:")) return raw.slice(0, 128);
  return `potluck:${safeIdentityToken(raw, "instance")}`.slice(0, 128);
}

function nowIso(now = Date.now()) {
  return new Date(now).toISOString();
}

function isAuthExpiredMessage(usage) {
  const message = lower(usage?.message);
  return Boolean(message) && AUTH_EXPIRED_PATTERNS.some((pattern) => message.includes(pattern));
}

function includesAny(message, patterns) {
  return patterns.some((pattern) => message.includes(pattern));
}

export function classifyQuotaStatus({ usage, error, hasLastGood = false } = {}) {
  const message = lower(error?.message || usage?.message);
  if (!message && usage && typeof usage === "object" && normalizeQuotaWindows(usage).length > 0) return "fresh";
  if (!message && usage && typeof usage === "object") return hasLastGood ? "stale" : "unsupported";
  if (includesAny(message, RATE_LIMIT_PATTERNS)) return hasLastGood ? "stale" : "rateLimited";
  if (includesAny(message, AUTH_PATTERNS)) return hasLastGood ? "stale" : "unauthorized";
  if (includesAny(message, UNSUPPORTED_PATTERNS)) return "unsupported";
  if (includesAny(message, UNAVAILABLE_PATTERNS)) return hasLastGood ? "stale" : "unavailable";
  return hasLastGood ? "stale" : "error";
}

function classifyErrorCategory(quotaStatus) {
  if (quotaStatus === "unauthorized") return "auth";
  if (quotaStatus === "rateLimited") return "rate_limit";
  if (quotaStatus === "unavailable") return "unavailable";
  if (quotaStatus === "stale") return "network";
  return "unknown";
}

function classifyErrorCode(quotaStatus, { usage, error } = {}) {
  const message = lower(error?.message || usage?.message);
  if (quotaStatus === "unauthorized") return isAuthExpiredMessage(usage) ? "auth_expired" : "auth_failed";
  if (quotaStatus === "rateLimited") return "rate_limited";
  if (quotaStatus === "unavailable") return includesAny(message, ["timeout"]) ? "provider_timeout" : "provider_unavailable";
  if (quotaStatus === "unsupported") return "quota_unsupported";
  if (quotaStatus === "stale") return "last_good_snapshot";
  if (quotaStatus === "error") return "quota_error";
  return quotaStatus;
}

function safeErrorDetail(quotaStatus) {
  const messages = {
    unauthorized: "Provider quota authorization failed.",
    rateLimited: "Provider quota request was rate limited.",
    unavailable: "Provider quota service is temporarily unavailable.",
    stale: "Showing the last successful quota snapshot.",
    error: "Provider quota request failed.",
  };
  return messages[quotaStatus] || "Provider quota status is unavailable.";
}

function connectionStatus(connection) {
  if (connection?.isActive === false) return "disabled";
  const testStatus = lower(connection?.testStatus);
  const errorCode = lower(connection?.errorCode);
  const lastError = lower(connection?.lastError);
  const combined = `${testStatus} ${errorCode} ${lastError}`;
  if (testStatus === "ok" || (!testStatus && !lastError && !errorCode)) return "ok";
  if (includesAny(combined, RATE_LIMIT_PATTERNS)) return "rateLimited";
  if (includesAny(combined, AUTH_PATTERNS)) return "unauthorized";
  if (includesAny(combined, UNAVAILABLE_PATTERNS)) return "unavailable";
  if (testStatus === "error" || lastError || errorCode) return "error";
  return "ok";
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function isoOrNull(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function inferWindowKind(label, quota) {
  const raw = lower(label);
  if (raw.includes("5h") || raw.includes("5-hour") || raw.includes("session") || raw.includes("interval")) return "session";
  if (raw.includes("7d") || raw.includes("weekly") || raw.includes("week")) return "weekly";
  if (raw.includes("month") || raw.includes("billing") || raw.includes("credit") || raw.includes("balance")) return "billing";
  if (quota?.windowKind === "session" || quota?.windowKind === "weekly" || quota?.windowKind === "billing") return quota.windowKind;
  return "billing";
}

function quotaEntries(quotas) {
  if (Array.isArray(quotas)) return quotas.map((value, index) => [String(value?.label || value?.name || index), value]);
  if (!quotas || typeof quotas !== "object") return [];
  return Object.entries(quotas);
}

export function normalizeQuotaWindows(usage) {
  const windows = [];
  for (const [rawLabel, rawQuota] of quotaEntries(usage?.quotas)) {
    if (!rawQuota || typeof rawQuota !== "object" || Array.isArray(rawQuota)) continue;
    const label = text(rawQuota.label || rawQuota.name || rawLabel).slice(0, 80);
    const amount = numberOrNull(rawQuota.amount ?? rawQuota.balance);
    const used = numberOrNull(rawQuota.used ?? rawQuota.usedCount ?? rawQuota.current);
    const limit = numberOrNull(rawQuota.total ?? rawQuota.limit ?? rawQuota.entitlement);
    const remaining = numberOrNull(rawQuota.remaining ?? rawQuota.remainingCount ?? amount);
    const explicitUsedPercent = numberOrNull(
      rawQuota.usedPercent ?? rawQuota.used_percent ?? rawQuota.utilization
    );
    const remainingPercent = numberOrNull(
      rawQuota.remainingPercentage ?? rawQuota.remainingPercent ?? rawQuota.remaining_percent
    );
    const usedPercent = explicitUsedPercent !== null
      ? Math.max(0, Math.min(100, explicitUsedPercent))
      : (remainingPercent !== null
        ? Math.max(0, Math.min(100, 100 - remainingPercent))
        : (used !== null && limit !== null && limit > 0 ? Math.max(0, Math.min(100, (used / limit) * 100)) : null));
    const resetsAt = isoOrNull(rawQuota.resetAt ?? rawQuota.resetsAt ?? rawQuota.reset_at ?? rawQuota.resets_at);
    const hasData = amount !== null || used !== null || limit !== null || remaining !== null || usedPercent !== null || resetsAt;
    if (!hasData) continue;
    const kind = inferWindowKind(label, rawQuota);
    windows.push({
      kind,
      label,
      used,
      limit,
      remaining,
      usedPercent,
      resetsAt,
      ...(rawQuota.unit === "credits" || rawQuota.metric === "credits" || amount !== null ? { metric: "credits" } : {}),
      ...(rawQuota.unlimited === true ? { detail: "Unlimited" } : {}),
      precision: "providerReported",
    });
  }
  return windows;
}

function proxyOptionsFor(connection) {
  return resolveConnectionProxyConfig(connection?.providerSpecificData).then((proxyConfig) => ({
    connectionProxyEnabled: proxyConfig.connectionProxyEnabled === true,
    connectionProxyUrl: proxyConfig.connectionProxyUrl || "",
    connectionNoProxy: proxyConfig.connectionNoProxy || "",
    vercelRelayUrl: proxyConfig.vercelRelayUrl || "",
    strictProxy: false,
  }));
}

export async function refreshAndUpdateCredentials(connection, force = false, proxyOptions = null) {
  const executor = getExecutor(connection.provider);
  const credentials = {
    accessToken: connection.accessToken,
    refreshToken: connection.refreshToken,
    idToken: connection.idToken,
    expiresAt: connection.expiresAt || connection.tokenExpiresAt,
    lastRefreshAt: connection.lastRefreshAt,
    connectionId: connection.id,
    providerSpecificData: connection.providerSpecificData,
    copilotToken: connection.providerSpecificData?.copilotToken,
    copilotTokenExpiresAt: connection.providerSpecificData?.copilotTokenExpiresAt,
  };

  const needsRefresh = force || executor.needsRefresh(credentials);
  if (!needsRefresh) return { connection, refreshed: false };

  const refreshResult = await executor.refreshCredentials(credentials, console, proxyOptions);
  if (!refreshResult) {
    if (connection.accessToken) return { connection, refreshed: false };
    throw new Error("Failed to refresh credentials. Please re-authorize the connection.");
  }

  const now = new Date().toISOString();
  const updateData = { updatedAt: now };
  if (refreshResult.accessToken) updateData.accessToken = refreshResult.accessToken;
  if (refreshResult.refreshToken) updateData.refreshToken = refreshResult.refreshToken;
  if (refreshResult.idToken) updateData.idToken = refreshResult.idToken;
  if (refreshResult.lastRefreshAt) updateData.lastRefreshAt = refreshResult.lastRefreshAt;
  if (refreshResult.expiresIn) {
    updateData.expiresAt = new Date(Date.now() + refreshResult.expiresIn * 1000).toISOString();
    updateData.expiresIn = refreshResult.expiresIn;
  } else if (refreshResult.expiresAt) {
    updateData.expiresAt = refreshResult.expiresAt;
  }

  const providerSpecificUpdates = {
    ...(refreshResult.providerSpecificData || {}),
    ...(refreshResult.copilotToken ? { copilotToken: refreshResult.copilotToken } : {}),
    ...(refreshResult.copilotTokenExpiresAt ? { copilotTokenExpiresAt: refreshResult.copilotTokenExpiresAt } : {}),
  };
  if (Object.keys(providerSpecificUpdates).length > 0) {
    updateData.providerSpecificData = {
      ...(connection.providerSpecificData || {}),
      ...providerSpecificUpdates,
    };
  }

  const updatedConnection = await updateProviderConnection(connection.id, updateData);
  return { connection: updatedConnection || { ...connection, ...updateData }, refreshed: true };
}

async function fetchUsageUncached(connection) {
  if (connection?.isActive === false) {
    return { usage: null, connection, quotaStatus: "notChecked", error: null };
  }

  const isOAuth = connection.authType === "oauth";
  const isApikeyAuth = connection.authType === "apikey" || connection.authType === "api_key";
  const isApikeyEligible = isApikeyAuth && USAGE_APIKEY_PROVIDERS.includes(connection.provider);
  if (!isOAuth && !isApikeyEligible) {
    return { usage: null, connection, quotaStatus: "unsupported", error: null };
  }

  const proxyOptions = await proxyOptionsFor(connection);
  let working = connection;
  try {
    if (isOAuth) working = (await refreshAndUpdateCredentials(working, false, proxyOptions)).connection;
    let usage = await getUsageForProvider(working, proxyOptions);
    if (isOAuth && isAuthExpiredMessage(usage) && working.refreshToken) {
      try {
        working = (await refreshAndUpdateCredentials(working, true, proxyOptions)).connection;
        usage = await getUsageForProvider(working, proxyOptions);
      } catch (retryError) {
        return {
          usage,
          connection: working,
          quotaStatus: classifyQuotaStatus({ usage, error: retryError }),
          error: retryError,
        };
      }
    }
    return {
      usage,
      connection: working,
      quotaStatus: classifyQuotaStatus({ usage }),
      error: null,
    };
  } catch (error) {
    return {
      usage: null,
      connection: working,
      quotaStatus: classifyQuotaStatus({ error }),
      error,
    };
  }
}

async function withTimeout(promise, timeoutMs) {
  if (!timeoutMs || timeoutMs <= 0) return promise;
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error("quota request timeout")), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function mergeState(previous, attempt, attemptedAt) {
  const hasWindows = normalizeQuotaWindows(attempt?.usage).length > 0;
  const successful = attempt.quotaStatus === "fresh" && hasWindows;
  const lastGood = successful
    ? {
        usage: attempt.usage,
        windows: normalizeQuotaWindows(attempt.usage),
        updatedAt: attemptedAt,
        lastSuccessAt: attemptedAt,
      }
    : previous?.lastGood || null;
  const quotaStatus = successful
    ? "fresh"
    : (attempt.quotaStatus === "unsupported" ? "unsupported" : (lastGood ? "stale" : attempt.quotaStatus));
  return {
    lastGood,
    usage: successful ? attempt.usage : (lastGood?.usage || attempt.usage || null),
    windows: lastGood?.windows || [],
    lastAttemptAt: attemptedAt,
    lastSuccessAt: lastGood?.lastSuccessAt || null,
    quotaStatus,
    error: successful || quotaStatus === "unsupported" ? null : {
      category: classifyErrorCategory(quotaStatus),
      code: classifyErrorCode(quotaStatus, attempt),
      safeDetail: safeErrorDetail(quotaStatus),
      retryAt: isoOrNull(attempt?.error?.retryAt || attempt?.error?.retryAfter),
      recoverable: true,
    },
  };
}

export function createQuotaCoordinator({
  fetchUsage = fetchUsageUncached,
  now = () => Date.now(),
  ttlMs = DEFAULT_QUOTA_TTL_MS,
  timeoutMs = DEFAULT_QUOTA_TIMEOUT_MS,
} = {}) {
  const cache = new Map();
  const inflight = new Map();

  async function fetchConnection(connection, { force = false } = {}) {
    const key = String(connection?.id || "").trim();
    if (!key) throw new Error("connection id is required");
    const timestamp = now();
    const previous = cache.get(key);
    if (!force && previous?.lastAttemptAtMs && timestamp - previous.lastAttemptAtMs < ttlMs) {
      return { ...previous, cached: true };
    }
    if (inflight.has(key)) return inflight.get(key);

    const promise = (async () => {
      const attemptedAt = nowIso(now());
      const attempt = await withTimeout(Promise.resolve().then(() => fetchUsage(connection)), timeoutMs)
        .catch((error) => ({ usage: null, connection, quotaStatus: classifyQuotaStatus({ error }), error }));
      const next = {
        ...mergeState(previous, attempt, attemptedAt),
        connection: attempt.connection || connection,
        lastAttemptAtMs: now(),
        cached: false,
      };
      cache.set(key, next);
      if (!previous || previous.quotaStatus !== next.quotaStatus) {
        recordMonitorEvent({
          type: "health_event",
          occurredAt: attemptedAt,
          provider: connection.provider,
          connectionKey: connectionSnapshotKey(connection),
          status: next.quotaStatus,
          reasonCode: next.error?.code || next.quotaStatus,
          reason: next.error?.safeDetail,
          retryAt: next.error?.retryAt,
        });
      }
      recordMonitorEvent({
        type: "quota_attempt",
        occurredAt: attemptedAt,
        provider: connection.provider,
        connectionKey: connectionSnapshotKey(connection),
        status: next.quotaStatus,
        reasonCode: next.error?.code || next.quotaStatus,
        reason: next.error?.safeDetail,
        retryAt: next.error?.retryAt,
        final: next.quotaStatus === "fresh" || next.quotaStatus === "unsupported",
      });
      return next;
    })().finally(() => inflight.delete(key));

    inflight.set(key, promise);
    return promise;
  }

  async function fetchConnectionById(id, options = {}) {
    const connection = await getProviderConnectionById(id);
    if (!connection) return null;
    return fetchConnection(connection, options);
  }

  function clear(id = "") {
    if (id) cache.delete(String(id));
    else cache.clear();
  }

  return { fetchConnection, fetchConnectionById, clear };
}

const defaultCoordinator = createQuotaCoordinator();

export async function getCachedConnectionQuotaState(connectionId, options = {}) {
  return defaultCoordinator.fetchConnectionById(connectionId, options);
}

export async function getCachedConnectionUsage(connectionId, options = {}) {
  const state = await getCachedConnectionQuotaState(connectionId, options);
  if (!state) return null;
  return state.usage || (state.error ? { message: state.error.safeDetail } : {});
}

function sourceIdFile() {
  return path.join(DATA_DIR, "auth", "monitor-source-id");
}

export function ensureMonitorSourceId() {
  if (sourceInstanceId) return sourceInstanceId;
  const configured = text(process.env.POTLUCK_MONITOR_SOURCE_ID);
  if (configured) {
    sourceInstanceId = normalizeSourceInstanceId(configured);
    return sourceInstanceId;
  }
  const file = sourceIdFile();
  try {
    const existing = text(fs.readFileSync(file, "utf8"));
    if (existing) {
      sourceInstanceId = normalizeSourceInstanceId(existing);
      return sourceInstanceId;
    }
  } catch {
    // Create below.
  }
  sourceInstanceId = normalizeSourceInstanceId(crypto.randomUUID());
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
    fs.writeFileSync(file, `${sourceInstanceId}\n`, { mode: 0o600 });
  } catch (error) {
    console.warn(`[monitor] could not persist source instance id: ${error.message}`);
  }
  return sourceInstanceId;
}

function safeIdentityToken(value, fallback) {
  const token = text(value).replace(/[^A-Za-z0-9._:-]/g, "_").slice(0, 80);
  return token || fallback;
}

function connectionSnapshotKey(connection, sourceId = ensureMonitorSourceId()) {
  const instance = text(sourceId).replace(/^potluck:/, "");
  return `potluck:${safeIdentityToken(instance, "instance")}:${safeIdentityToken(connection?.id, "connection")}`;
}

export function buildProviderSnapshotRow(connection, state, generatedAt = nowIso(), sourceId = ensureMonitorSourceId()) {
  const provider = text(connection.provider);
  const quotaStatus = state.quotaStatus || "notChecked";
  const connStatus = state.quotaStatus === "fresh" && connection.isActive !== false
    ? "ok"
    : connectionStatus(connection);
  const hasWindows = Array.isArray(state.windows) && state.windows.length > 0;
  const status = connStatus === "disabled"
    ? "disabled"
    : (connStatus === "unauthorized" || quotaStatus === "unauthorized"
      ? "unauthorized"
      : (quotaStatus === "rateLimited" || connStatus === "rateLimited"
        ? "rateLimited"
        : (quotaStatus === "unavailable" && !hasWindows
          ? "unavailable"
          : (quotaStatus === "error" && !hasWindows ? "error" : (connStatus === "ok" ? "ok" : connStatus)))));
  return {
    provider,
    connectionKey: connectionSnapshotKey(connection, sourceId),
    accountKey: connectionSnapshotKey(connection, sourceId),
    accountLabel: text(connection.name || connection.displayName || connection.email || provider).slice(0, 64),
    accountName: text(connection.name || connection.displayName).slice(0, 64),
    accountEmail: text(connection.email).slice(0, 254),
    planLabel: text(state.usage?.plan).slice(0, 64),
    status,
    connectionStatus: connStatus,
    quotaStatus: hasWindows && quotaStatus === "fresh" ? "fresh" : quotaStatus,
    source: connection.authType === "oauth" ? "oauth" : "api",
    sourceDetail: "managed",
    managedBy: "potluck",
    authType: connection.authType === "oauth"
      ? "oauth"
      : (["apikey", "api_key"].includes(connection.authType) ? "apikey" : "unknown"),
    identityKind: "connection",
    enabled: connection.isActive !== false,
    updatedAt: generatedAt,
    lastAttemptAt: state.lastAttemptAt,
    lastSuccessAt: state.lastSuccessAt,
    windows: state.windows,
    ...(state.error ? { error: state.error } : {}),
    ...(connection.providerSpecificData?.quotaPoolKey ? { quotaPoolKey: connection.providerSpecificData.quotaPoolKey } : {}),
  };
}

export async function buildQuotaSnapshot({ force = false, concurrency = DEFAULT_QUOTA_CONCURRENCY } = {}) {
  const connections = await getProviderConnections();
  const sourceInstanceIdValue = ensureMonitorSourceId();
  const generatedAt = nowIso();
  const providers = new Array(connections.length);
  const workerCount = Math.max(1, Math.min(Number(concurrency) || DEFAULT_QUOTA_CONCURRENCY, connections.length || 1));
  let nextIndex = 0;
  const worker = async () => {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= connections.length) return;
      const connection = connections[index];
      const state = await defaultCoordinator.fetchConnection(connection, { force });
      providers[index] = buildProviderSnapshotRow(connection, state, generatedAt, sourceInstanceIdValue);
    }
  };
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return {
    schemaVersion: QUOTA_SNAPSHOT_SCHEMA_VERSION,
    snapshotId: `${sourceInstanceIdValue}:${Date.now()}:${crypto.randomUUID()}`,
    snapshotType: "full",
    sourceInstanceId: sourceInstanceIdValue,
    generatedAt,
    updatedAt: generatedAt,
    refreshMs: DEFAULT_QUOTA_TTL_MS,
    capabilities: ["connection_status_v2", "quota_status_v2", "multi_connection", "quota_pool_key"],
    providers,
  };
}

export function resetQuotaCoordinatorForTests() {
  defaultCoordinator.clear();
  sourceInstanceId = undefined;
}
