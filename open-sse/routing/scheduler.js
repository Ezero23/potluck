/**
 * Rotation scheduler — quota-aware fair rotation across provider/model sources.
 *
 * This is the "abundance" alternative to the priority-ordered selection in
 * engine.js. Instead of "use priority:100 until it dies, then fall back",
 * rotation spreads load across every healthy source so no single source is
 * hammered and no quota is drained prematurely.
 *
 * Selection rule:
 *   1. Hard-filter sources that are unavailable (quota exhausted, high error
 *      rate, recently errored). These mirror usageCache.isEligible semantics.
 *   2. Among what's left, pick the source with the lowest effective recency:
 *      effectiveSeq = lastUsedSeq + (inFlightCount * INFLIGHT_PENALTY).
 *      This means a source handling 2 active requests looks 6 turns "newer",
 *      so idle sources get picked first (concurrency-aware least-busy).
 *      Weight breaks remaining ties (higher weight preferred), but weight
 *      never overrides recency — a high-weight source still waits its turn.
 *
 * Rotation state is in-memory and process-local. It is deliberately NOT
 * persisted: on restart the rotation simply starts fresh, which is fine
 * because the goal is even spread over time, not exact accounting.
 */

import { getHealth } from "./usageCache.js";

// source key ("provider/model") → { lastUsedAt, lastUsedSeq, useCount }
const sourceState = new Map();

// source key → number of currently in-flight requests
const inFlight = new Map();

// Each active request pushes a source back by this many "virtual turns" in the
// LRU ordering. With 10 sources, a penalty of 3 means 1 in-flight request makes
// a source look as if it was used 3 turns more recently — enough to prefer idle
// sources without starving busy ones entirely.
const INFLIGHT_PENALTY = 3;

// Monotonic counter so recency comparisons survive equal timestamps.
let seq = 0;

/**
 * @typedef {{ provider: string, model: string, weight?: number, priority?: number }} RotationSource
 */

/**
 * Pick the next source to use from a pool.
 *
 * @param {RotationSource[]} sources
 * @param {string[]} [excludeKeys] — "provider/model" already tried this request
 * @returns {RotationSource | null} — null when every source is unavailable
 */
export function selectNextSource(sources, excludeKeys = []) {
  if (!Array.isArray(sources) || sources.length === 0) return null;

  const excluded = new Set(excludeKeys);
  const now = Date.now();

  const available = sources.filter((src) => {
    const key = `${src.provider}/${src.model}`;
    if (excluded.has(key)) return false;

    const health = getHealth(src.provider);
    if (!health) return true; // no data → assume healthy, let it try
    if (health.quotaPercent !== null && health.quotaPercent >= 100) return false;
    if (health.errorRate5m > 0.3) return false;
    if (health.lastErrorAt && now - health.lastErrorAt < 30_000) return false;
    return true;
  });

  if (available.length === 0) return null;

  // Least-recently-used first, penalized by in-flight concurrency.
  // effectiveSeq = lastUsedSeq + (inFlight * INFLIGHT_PENALTY)
  // A source handling 2 active requests looks 6 turns "newer", so idle sources
  // get picked first. Weight breaks remaining ties (higher weight preferred).
  available.sort((a, b) => {
    const keyA = `${a.provider}/${a.model}`;
    const keyB = `${b.provider}/${b.model}`;
    const sa = sourceState.get(keyA);
    const sb = sourceState.get(keyB);
    const seqA = (sa?.lastUsedSeq ?? -1) + (inFlight.get(keyA) ?? 0) * INFLIGHT_PENALTY;
    const seqB = (sb?.lastUsedSeq ?? -1) + (inFlight.get(keyB) ?? 0) * INFLIGHT_PENALTY;
    if (seqA !== seqB) return seqA - seqB;
    return (b.weight ?? 1) - (a.weight ?? 1);
  });

  return available[0];
}

/**
 * Record that a source was actually used (call on selection or on success).
 * Advances its recency so the next pick rotates to a different source.
 *
 * @param {string} provider
 * @param {string} model
 */
export function markSourceUsed(provider, model) {
  const key = `${provider}/${model}`;
  const existing = sourceState.get(key);
  sourceState.set(key, {
    lastUsedAt: Date.now(),
    lastUsedSeq: seq++,
    useCount: (existing?.useCount ?? 0) + 1,
  });
}

/**
 * Mark a source as having an active in-flight request. Call when a request is
 * dispatched to the source. The scheduler will deprioritize this source until
 * the request completes.
 *
 * @param {string} provider
 * @param {string} model
 */
export function acquireSource(provider, model) {
  const key = `${provider}/${model}`;
  inFlight.set(key, (inFlight.get(key) ?? 0) + 1);
}

/**
 * Release a source's in-flight slot. Call when the request completes (success
 * or failure). Must be called exactly once per acquireSource call.
 *
 * @param {string} provider
 * @param {string} model
 */
export function releaseSource(provider, model) {
  const key = `${provider}/${model}`;
  const current = inFlight.get(key) ?? 0;
  if (current <= 1) {
    inFlight.delete(key);
  } else {
    inFlight.set(key, current - 1);
  }
}

/**
 * Snapshot of rotation state (for /status endpoints and the dashboard).
 * @returns {Record<string, { lastUsedAt: number|null, useCount: number, inFlight: number }>}
 */
export function getSourceStats() {
  const out = {};
  for (const [key, s] of sourceState) {
    out[key] = { lastUsedAt: s.lastUsedAt ?? null, useCount: s.useCount, inFlight: inFlight.get(key) ?? 0 };
  }
  // Include sources that have in-flight but no recorded use yet
  for (const [key, count] of inFlight) {
    if (!out[key]) out[key] = { lastUsedAt: null, useCount: 0, inFlight: count };
  }
  return out;
}

/**
 * Clear all rotation state. Intended for tests and config reloads.
 */
export function resetRotationState() {
  sourceState.clear();
  inFlight.clear();
  seq = 0;
}
