/**
 * Same-model multi-source aggregation ("同模型多源聚合").
 *
 * Given a model query like "claude-sonnet-4", discovers ALL provider/model
 * pairs across the registry that can serve that model family, so the rotation
 * scheduler can pool them into one effectively-unlimited source.
 *
 * Matching: normalize model IDs (strip provider prefix, lowercase, unify
 * separators, strip date suffixes) then prefix-match against the query.
 */

import { PROVIDER_MODELS } from "../providers/index.js";

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
  // Strip trailing version-like suffix for family matching
  // "claude-sonnet-4-6" → keep as-is (it's a sub-version, still matches prefix "claude-sonnet-4")
  return s;
}

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
      if (norm.startsWith(normQuery) || normQuery.startsWith(norm)) {
        results.push({ provider: providerId, model: modelId });
      }
    }
  }

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
