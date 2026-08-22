/**
 * Routing engine — selects a provider+model from a profile based on health,
 * usage, and priority. Orchestrates provider-level fallback.
 *
 * The engine does NOT replace the existing account-level fallback inside
 * handleSingleModelChat; it wraps it. The flow becomes:
 *
 *   handleSingleModelChat(modelStr)
 *     → if modelStr is a profile, run routingEngine.selectProvider(body)
 *         → returns { provider, model, trace }
 *     → handleChatCore({ provider, model })
 *     → if error matches fallbackOn → next candidate → loop
 */

import { loadRoutingConfig, getProfile } from "./profiles.js";
import { getHealth, isEligible, recordSuccess, recordError } from "./usageCache.js";
import { RoutingTrace } from "./trace.js";
import { parseModel } from "../services/model.js";
import { getCapabilitiesForModel } from "../providers/capabilities.js";
import { selectNextSource, markSourceUsed, acquireSource, releaseSource } from "./scheduler.js";
import { buildAggregateCandidates } from "./aggregate.js";

const IS_PROFILE_RE = /^profile:/i;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Check if a model string is a routing profile reference.
 * @param {string} modelStr
 */
export function isRoutingProfile(modelStr) {
  return IS_PROFILE_RE.test(modelStr);
}

/**
 * Select a provider+model from a profile.
 *
 * @param {string} profileName
 * @param {object} body — request body (for capability detection)
 * @param {string[]} [excludeCandidates] — ["provider/model", ...] already tried
 * @returns {Promise<{ provider: string, model: string, trace: RoutingTrace }>}
 * @throws {Error} if no candidate is eligible
 */
export async function selectProvider(profileName, body, excludeCandidates = []) {
  const profile = getProfile(profileName);
  if (!profile) {
    throw new Error(`Routing profile not found: ${profileName}`);
  }

  // Rotation strategy spreads load across healthy sources (abundance model).
  // Default/unknown strategies keep the legacy priority-ordered fallback.
  if (profile.strategy === "rotation") {
    return selectProviderByRotation(profileName, profile, body, excludeCandidates);
  }
  return selectProviderByPriority(profileName, profile, body, excludeCandidates);
}

/**
 * Priority-ordered selection (legacy behavior): sort candidates by priority
 * descending and return the first one that passes health + capability checks.
 */
async function selectProviderByPriority(profileName, profile, body, excludeCandidates) {
  const trace = new RoutingTrace(profileName);
  const candidates = sortCandidates(profile.candidates);
  const requiredCaps = new Set(profile.requiredCapabilities || []);
  const hasImages = detectImages(body);
  const hasTools = detectTools(body);
  if (hasImages) requiredCaps.add("vision");
  if (hasTools) requiredCaps.add("tool_use");

  const tried = new Set(excludeCandidates);

  for (const candidate of candidates) {
    const key = `${candidate.provider}/${candidate.model}`;
    if (tried.has(key)) continue;
    tried.add(key);

    // Health check (best-effort; skip if cache empty)
    const health = getHealth(candidate.provider);
    const eligibility = isEligible(candidate.provider);
    if (!eligibility) {
      trace.recordSkipped(
        candidate.provider,
        candidate.model,
        health?.quotaPercent >= 100
          ? "quota exhausted"
          : health?.errorRate5m > 0.3
          ? "high error rate"
          : "recently errored",
        health?.quotaPercent >= 100
          ? "quota_exhausted"
          : health?.errorRate5m > 0.3
          ? "high_error_rate"
          : "recent_error"
      );
      continue;
    }

    // Verify model exists in registry
    const parsed = parseModel(`${candidate.provider}/${candidate.model}`);
    if (!parsed || !parsed.provider) {
      trace.recordSkipped(candidate.provider, candidate.model, "model not found in registry", "model_not_found");
      continue;
    }

    // Required capabilities check (when capabilities data is available)
    const caps = getCapabilitiesForModel(parsed.provider, parsed.model);
    const missing = [...requiredCaps].filter((cap) => !caps[cap]);
    if (missing.length > 0) {
      trace.recordSkipped(parsed.provider, parsed.model, `missing capabilities: ${missing.join(", ")}`, "missing_capability");
      continue;
    }

    trace.recordSelected(parsed.provider, parsed.model);
    return { provider: parsed.provider, model: parsed.model, trace, candidate };
  }

  throw new Error(
    `No eligible provider for profile '${profileName}' after ${tried.size} candidate(s)`
  );
}

/**
 * Rotation selection: pick the least-recently-used healthy source so load is
 * spread evenly across the pool. Capability checks still apply; sources that
 * lack a required capability are skipped (recorded in the trace). The chosen
 * source is marked used so the next call rotates to a different one.
 */
async function selectProviderByRotation(profileName, profile, body, excludeCandidates) {
  const trace = new RoutingTrace(profileName);
  const requiredCaps = new Set(profile.requiredCapabilities || []);
  if (detectImages(body)) requiredCaps.add("vision");
  if (detectTools(body)) requiredCaps.add("tool_use");

  // Aggregate mode: dynamically discover all sources for a model family.
  // Static candidates serve as optional pinning / extra sources on top.
  let candidates = profile.candidates || [];
  if (profile.aggregate) {
    const discovered = buildAggregateCandidates(profile.aggregate, {
      onlyProviders: profile.aggregateOnly,
      excludeProviders: profile.aggregateExclude,
    });
    // Merge: discovered sources + any explicit candidates not already present
    const seen = new Set(discovered.map((d) => `${d.provider}/${d.model}`));
    for (const c of candidates) {
      if (!seen.has(`${c.provider}/${c.model}`)) discovered.push(c);
    }
    candidates = discovered;
  }

  // Pre-filter by capability so the scheduler only sees usable sources.
  const capable = [];
  for (const candidate of candidates) {
    const parsed = parseModel(`${candidate.provider}/${candidate.model}`);
    if (!parsed || !parsed.provider) {
      trace.recordSkipped(candidate.provider, candidate.model, "model not found in registry", "model_not_found");
      continue;
    }
    const caps = getCapabilitiesForModel(parsed.provider, parsed.model);
    const missing = [...requiredCaps].filter((cap) => !caps[cap]);
    if (missing.length > 0) {
      trace.recordSkipped(parsed.provider, parsed.model, `missing capabilities: ${missing.join(", ")}`, "missing_capability");
      continue;
    }
    capable.push({ ...candidate, provider: parsed.provider, model: parsed.model });
  }

  const selected = selectNextSource(capable, excludeCandidates);
  if (!selected) {
    throw new Error(
      `No eligible provider for profile '${profileName}' (rotation) after ${excludeCandidates.length} excluded`
    );
  }

  markSourceUsed(selected.provider, selected.model);
  trace.recordSelected(selected.provider, selected.model);
  return { provider: selected.provider, model: selected.model, trace, candidate: selected };
}

/**
 * Determine if the model string is a routing profile. If yes, return profile
 * info; otherwise resolve as a regular provider/model and return a trace-less
 * result so the legacy path can run normally.
 *
 * @param {string} modelStr
 * @param {object} body
 * @returns {Promise<{ provider?: string, model?: string, trace?: RoutingTrace }>}
 */
export async function resolveModelInfo(modelStr, body) {
  if (!isRoutingProfile(modelStr)) {
    return {};
  }
  const profileName = modelStr.replace(/^profile:/i, "");
  const result = await selectProvider(profileName, body);
  return {
    provider: result.provider,
    model: result.model,
    trace: result.trace,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sortCandidates(candidates) {
  return [...candidates].sort((a, b) => (b.priority || 0) - (a.priority || 0));
}

function detectImages(body) {
  if (!body) return false;
  const msgs = body.messages || body.input || body.contents || [];
  for (const msg of msgs) {
    const content = msg.content || msg.parts || [];
    if (typeof content === "string") continue;
    for (const part of content) {
      if (part.type === "image_url" || part.type === "image" || part.image_url) return true;
    }
  }
  return false;
}

function detectTools(body) {
  return !!(body?.tools && body.tools.length > 0);
}

export { getHealth, isEligible, recordSuccess, recordError, RoutingTrace };
export { loadRoutingConfig, getProfile, listProfiles } from "./profiles.js";
export { getSourceStats, resetRotationState, acquireSource, releaseSource } from "./scheduler.js";