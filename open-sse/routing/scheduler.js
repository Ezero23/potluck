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
 *   2. Among what's left, pick the least-recently-used source. Weight breaks
 *      ties (higher weight wins when two sources were last used equally long
 *      ago), but weight never overrides recency — a high-weight source still
 *      waits its turn.
 *
 * Rotation state is in-memory and process-local. It is deliberately NOT
 * persisted: on restart the rotation simply starts fresh, which is fine
 * because the goal is even spread over time, not exact accounting.
 */

import { getHealth } from "./usageCache.js";

// source key ("provider/model") → { lastUsedAt, lastUsedSeq, useCount }
const sourceState = new Map();

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

  // Least-recently-used first; weight breaks ties (higher weight preferred).
  available.sort((a, b) => {
    const sa = sourceState.get(`${a.provider}/${a.model}`);
    const sb = sourceState.get(`${b.provider}/${b.model}`);
    const seqA = sa?.lastUsedSeq ?? -1;
    const seqB = sb?.lastUsedSeq ?? -1;
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
 * Snapshot of rotation state (for /status endpoints and the dashboard).
 * @returns {Record<string, { lastUsedAt: number|null, useCount: number }>}
 */
export function getSourceStats() {
  const out = {};
  for (const [key, s] of sourceState) {
    out[key] = { lastUsedAt: s.lastUsedAt ?? null, useCount: s.useCount };
  }
  return out;
}

/**
 * Clear all rotation state. Intended for tests and config reloads.
 */
export function resetRotationState() {
  sourceState.clear();
  seq = 0;
}
