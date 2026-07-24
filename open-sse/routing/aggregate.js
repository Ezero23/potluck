/**
 * Same-model multi-source aggregation ("同模型多源聚合").
 *
 * Given a model query like "claude-sonnet-4", discovers ALL provider/model
 * pairs across the registry that can serve that model family, so the rotation
 * scheduler can pool them into one effectively-unlimited source.
 *
 * Matching: normalize model IDs (strip provider prefix, lowercase, unify
 * separators, strip date suffixes) then segment-boundary prefix-match.
 * "claude-sonnet-4" matches "claude-sonnet-4", "claude-sonnet-4-6" (4.6),
 * but NOT "claude-sonnet-45" (no segment boundary after "4").
 */

import { PROVIDER_MODELS } from "../providers/index.js";

// ---------------------------------------------------------------------------
// Cache — PROVIDER_MODELS is static (loaded at boot), so results are stable.
// ---------------------------------------------------------------------------
const cache = new Map();

export function invalidateAggregateCache() {
  cache.clear();
}

// ---------------------------------------------------------------------------
// Normalization
// ---------------------------------------------------------------------------

/**
 * Normalize a model ID for comparison.
 * "anthropic/claude-sonnet-4-20250514" → "claude-sonnet-4"
 * "claude-sonnet-4.6" → "claude-sonnet-4-6"
 */
export function normalizeModelId(raw) {
  if (!raw) return "";
  let s = raw.toLowerCase();
  // Strip provider prefix (e.g. "anthropic/claude-..." → "claude-...")
  const slash = s.lastIndexOf("/");
  if (slash !== -1) s = s.slice(slash + 1);
  // Unify separators: dots → hyphens
  s = s.replace(/\./g, "-");
  // Strip date suffixes like -20250514 or -20241022
  s = s.replace(/-\d{8}$/, "");
  return s;
}

// ---------------------------------------------------------------------------
// Matching
// ---------------------------------------------------------------------------

/**
 * Segment-boundary prefix match.
 * norm matches normQuery if:
 *   - exact equality, OR
 *   - norm starts with normQuery AND the next char is "-" (segment boundary)
 *
 * This means "claude-sonnet-4" matches "claude-sonnet-4-6" (a 4.x variant)
 * but NOT "claude-sonnet-45" (different model entirely).
 */
function matchesFamily(norm, normQuery) {
  if (norm === normQuery) return true;
  if (norm.startsWith(normQuery) && norm[normQuery.length] === "-") return true;
  return false;
}

// ---------------------------------------------------------------------------
// Discovery
// ---------------------------------------------------------------------------

/**
 * Find all {provider, model} pairs whose model matches the query family.
 * @param {string} query - e.g. "claude-sonnet-4", "qmodel", "kimi-k2"
 * @param {object} [opts]
 * @param {string[]} [opts.onlyProviders] - restrict to these provider IDs
 * @param {string[]} [opts.excludeProviders] - skip these provider IDs
 * @returns {{ provider: string, model: string }[]}
 */
export function findSourcesForModel(query, opts = {}) {
  const normQuery = normalizeModelId(query);
  if (!normQuery) return [];

  // Cache key includes opts (provider filters are part of the query identity)
  const cacheKey = `${normQuery}|${(opts.onlyProviders || []).join(",")}|${(opts.excludeProviders || []).join(",")}`;
  if (cache.has(cacheKey)) return cache.get(cacheKey);

  const { onlyProviders, excludeProviders } = opts;
  const onlySet = onlyProviders ? new Set(onlyProviders) : null;
  const excludeSet = excludeProviders ? new Set(excludeProviders) : null;

  const results = [];

  for (const [providerId, models] of Object.entries(PROVIDER_MODELS)) {
    if (onlySet && !onlySet.has(providerId)) continue;
    if (excludeSet && excludeSet.has(providerId)) continue;
    if (!Array.isArray(models)) continue;

    for (const m of models) {
      const modelId = m.id || m;
      if (typeof modelId !== "string") continue;
      const norm = normalizeModelId(modelId);
      if (matchesFamily(norm, normQuery)) {
        results.push({ provider: providerId, model: modelId });
      }
    }
  }

  cache.set(cacheKey, results);
  return results;
}

/**
 * Build rotation candidates from an aggregate query.
 * Attaches default weight=1 to each discovered source.
 * @param {string} query - model family query
 * @param {object} [opts] - same as findSourcesForModel
 * @returns {{ provider: string, model: string, weight: number }[]}
 */
export function buildAggregateCandidates(query, opts = {}) {
  return findSourcesForModel(query, opts).map((src) => ({
    ...src,
    weight: 1,
  }));
}
