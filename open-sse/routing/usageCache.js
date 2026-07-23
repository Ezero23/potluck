/**
 * Usage cache — in-memory store of provider health and quota data.
 *
 * The routing engine reads this to decide which candidates are eligible.
 * Data is refreshed asynchronously every `usageCacheTtlMs` (default 60s).
 * On a cache miss or stale entry, callers can trigger a synchronous refresh
 * (throttled to once per provider per 15s to avoid stampeding).
 *
 * Each entry:
 *   {
 *     provider: string,
 *     isHealthy: boolean,         — last request succeeded within 5m
 *     errorRate5m: number,        — 0..1, rolling 5-min error rate
 *     lastErrorAt: number | null, — timestamp ms
 *     lastSuccessAt: number | null,
 *     usedQuota: number | null,   — from usage API (if supported)
 *     totalQuota: number | null,
 *     quotaPercent: number | null,
 *     updatedAt: number,          — cache entry timestamp
 *   }
 */

import { getUsageForProvider } from "../services/usage.js";

const CACHE = new Map();               // provider → HealthEntry
const REFRESHING = new Set();          // provider names currently refreshing
const MIN_REFRESH_INTERVAL_MS = 15_000; // throttle
const ERROR_WINDOW_MS = 5 * 60 * 1000;  // 5-min rolling window
const MAX_ERROR_EVENTS = 100;

// Rolling error events per provider for error-rate calculation
const errorEvents = new Map();         // provider → number[] (timestamps)

let ttlMs = 60_000;

export function setCacheTtl(ms) {
  ttlMs = ms;
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

/**
 * Get cached health entry for a provider. Returns null if no data or stale.
 * @param {string} provider
 * @returns {HealthEntry | null}
 */
export function getHealth(provider) {
  const entry = CACHE.get(provider);
  if (!entry) return null;
  if (Date.now() - entry.updatedAt > ttlMs) return null;
  return entry;
}

/**
 * Check if a provider is eligible for routing.
 * Excludes: quota exhausted, error rate > 30%, or last error < 30s ago.
 * @param {string} provider
 * @returns {boolean}
 */
export function isEligible(provider) {
  const h = getHealth(provider);
  if (!h) return true; // no data → assume healthy (let it try)
  if (h.quotaPercent !== null && h.quotaPercent >= 100) return false;
  if (h.errorRate5m > 0.3) return false;
  if (h.lastErrorAt && Date.now() - h.lastErrorAt < 30_000) return false;
  return true;
}

/**
 * Get all cached entries (for debugging / /status endpoint).
 */
export function getAllHealth() {
  return Object.fromEntries(CACHE);
}

// ---------------------------------------------------------------------------
// Write (called by response handlers and background refresher)
// ---------------------------------------------------------------------------

/**
 * Record a successful request to a provider.
 * @param {string} provider
 */
export function recordSuccess(provider) {
  const now = Date.now();
  pruneErrors(provider, now);
  const existing = CACHE.get(provider);
  CACHE.set(provider, {
    ...existing,
    provider,
    isHealthy: true,
    lastSuccessAt: now,
    lastErrorAt: null,
    errorRate5m: computeErrorRate(provider),
    updatedAt: now,
  });
}

/**
 * Record a failed request to a provider.
 * @param {string} provider
 * @param {number} statusCode — HTTP status or 0 for network error
 */
export function recordError(provider, statusCode) {
  const now = Date.now();
  pushError(provider, now);
  const existing = CACHE.get(provider);
  CACHE.set(provider, {
    ...existing,
    provider,
    isHealthy: false,
    lastErrorAt: now,
    errorRate5m: computeErrorRate(provider),
    updatedAt: now,
  });
}

// ---------------------------------------------------------------------------
// Background refresh — pulls quota data from usage API
// ---------------------------------------------------------------------------

/**
 * Refresh usage data for a single provider (throttled).
 * @param {object} connection — { provider, accessToken, apiKey, providerSpecificData, connectionId }
 */
export async function refreshUsage(connection) {
  const provider = connection.provider;
  if (!provider || REFRESHING.has(provider)) return;
  const last = CACHE.get(provider);
  if (last && Date.now() - last.updatedAt < MIN_REFRESH_INTERVAL_MS) return;

  REFRESHING.add(provider);
  try {
    const usage = await getUsageForProvider(connection, null);
    const now = Date.now();
    const existing = CACHE.get(provider);
    const quotaPercent = usage?.total && usage.total > 0
      ? Math.round((usage.used / usage.total) * 100)
      : null;
    CACHE.set(provider, {
      ...existing,
      provider,
      usedQuota: usage?.used ?? null,
      totalQuota: usage?.total ?? null,
      quotaPercent,
      updatedAt: now,
    });
  } catch {
    // Usage API not supported for this provider — leave health data as-is
  } finally {
    REFRESHING.delete(provider);
  }
}

/**
 * Refresh usage for all given connections (called periodically).
 * @param {object[]} connections
 */
export async function refreshAllUsage(connections) {
  await Promise.allSettled(connections.map(refreshUsage));
}

// ---------------------------------------------------------------------------
// Error event tracking (rolling 5-min window)
// ---------------------------------------------------------------------------

function pushError(provider, ts) {
  if (!errorEvents.has(provider)) errorEvents.set(provider, []);
  const arr = errorEvents.get(provider);
  arr.push(ts);
  if (arr.length > MAX_ERROR_EVENTS) arr.shift();
}

function pruneErrors(provider, now) {
  const arr = errorEvents.get(provider);
  if (!arr) return;
  const cutoff = now - ERROR_WINDOW_MS;
  while (arr.length > 0 && arr[0] < cutoff) arr.shift();
}

function computeErrorRate(provider) {
  const arr = errorEvents.get(provider);
  if (!arr || arr.length === 0) return 0;
  const now = Date.now();
  pruneErrors(provider, now);
  // Need a denominator: we don't track success events (would be too noisy).
  // Approximate: if we have N errors in 5m, rate = min(N / 10, 1).
  // This is a heuristic — real error rate would need success counts too.
  return Math.min(arr.length / 10, 1);
}