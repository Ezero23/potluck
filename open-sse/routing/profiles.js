/**
 * Routing profiles — declarative config for intelligent provider selection.
 *
 * A routing profile defines an ordered list of candidate provider+model pairs
 * and optional constraints (cost ceiling, required capabilities). The routing
 * engine picks the first candidate whose health/usage check passes, and falls
 * through to subsequent candidates on failure.
 *
 * Profiles are loaded from routing.json (project root or ~/.9router/).
 * Default profiles are defined inline below.
 *
 * Usage: request body.model  =  "profile:code"   →  uses "code" profile
 *                        or  "profile:fast"       →  uses "fast" profile
 *                        or  "qoder-cn/qmodel"   →  bypasses routing (legacy)
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

/**
 * @typedef {{ provider: string, model: string, priority?: number, maxCostPer1k?: number }} Candidate
 *
 * @typedef {{
 *   description?: string,
 *   candidates: Candidate[],
 *   fallbackOn?: string[],
 *   sticky?: boolean,
 *   requiredCapabilities?: string[],
 * }} Profile
 *
 * @typedef {{
 *   profiles: Record<string, Profile>,
 *   defaultProfile: string,
 *   fallbackMaxTries: number,
 * }} RoutingConfig
 */

// ---------------------------------------------------------------------------
// Default profiles (ships with the app)
// ---------------------------------------------------------------------------

const PROFILES = {
  code: {
    description: "Code tasks: prefer Qoder CN with fallback to Kimi Coding and Anthropic",
    candidates: [
      { provider: "qoder-cn", model: "qmodel_latest", priority: 100 },
      { provider: "qoder", model: "qmodel_latest", priority: 80 },
      { provider: "kimi-coding", model: "auto", priority: 70 },
      { provider: "anthropic", model: "claude-sonnet-4", priority: 50 },
    ],
    fallbackOn: ["403", "429", "quota_exceeded", "timeout"],
  },

  fast: {
    description: "Fast responses: low latency first, cost second",
    candidates: [
      { provider: "qoder-cn", model: "qmodel_latest", priority: 100 },
      { provider: "qoder", model: "qmodel_latest", priority: 80 },
      { provider: "kimi-coding", model: "auto", priority: 60 },
    ],
    fallbackOn: ["429", "timeout"],
  },

  vision: {
    description: "Vision-capable models only",
    candidates: [
      { provider: "qoder-cn", model: "qmodel_latest", priority: 100 },
    ],
    requiredCapabilities: ["vision"],
    fallbackOn: ["403", "429", "timeout"],
  },

  cheap: {
    description: "Lowest cost providers first (for trivial requests)",
    candidates: [
      { provider: "qoder-cn", model: "qmodel_latest", priority: 100 },
      { provider: "deepseek", model: "deepseek-v3.2-chat", priority: 40 },
    ],
    fallbackOn: ["403", "429", "quota_exceeded"],
  },

  fallback: {
    description: "Last-resort catch-all: try every available provider",
    candidates: [
      { provider: "qoder-cn", model: "qmodel_latest", priority: 100 },
      { provider: "qoder", model: "qmodel_latest", priority: 80 },
      { provider: "kimi-coding", model: "auto", priority: 60 },
      { provider: "anthropic", model: "claude-sonnet-4", priority: 40 },
      { provider: "deepseek", model: "deepseek-chat", priority: 20 },
    ],
    fallbackOn: ["403", "429", "quota_exceeded", "timeout", "5xx"],
  },
};

const DEFAULT_CONFIG = {
  profiles: PROFILES,
  defaultProfile: "code",
  fallbackMaxTries: 3,
  usageCacheTtlMs: 60_000,
};

// ---------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------

const CONFIG_PATHS = [
  join(process.cwd(), "routing.json"),
  join(process.cwd(), ".9router", "routing.json"),
  join(process.env.HOME || "~", ".9router", "routing.json"),
];

let cachedConfig = null;

export function loadRoutingConfig() {
  if (cachedConfig) return cachedConfig;

  for (const p of CONFIG_PATHS) {
    if (existsSync(p)) {
      try {
        const raw = JSON.parse(readFileSync(p, "utf-8"));
        cachedConfig = {
          ...DEFAULT_CONFIG,
          ...raw,
          profiles: { ...DEFAULT_CONFIG.profiles, ...raw.profiles },
          fallbackMaxTries: raw.fallbackMaxTries ?? DEFAULT_CONFIG.fallbackMaxTries,
          usageCacheTtlMs: raw.usageCacheTtlMs ?? DEFAULT_CONFIG.usageCacheTtlMs,
        };
        return cachedConfig;
      } catch (err) {
        console.warn(`[routing] Failed to parse ${p}: ${err.message}. Using defaults.`);
      }
    }
  }

  cachedConfig = { ...DEFAULT_CONFIG };
  return cachedConfig;
}

export function invalidateRoutingConfigCache() {
  cachedConfig = null;
}

// ---------------------------------------------------------------------------
// Profile lookup
// ---------------------------------------------------------------------------

/**
 * Resolve a model string to either a routing profile or a { provider, model } pair.
 * @param {string} modelStr — e.g. "profile:code", "qoder-cn/qmodel_latest"
 * @returns {{ profile?: string, provider?: string, model?: string }}
 */
export function resolveModelOrProfile(modelStr) {
  const profileMatch = modelStr.match(/^profile:(.+)$/);
  if (profileMatch) {
    return { profile: profileMatch[1] };
  }
  const slashIdx = modelStr.indexOf("/");
  if (slashIdx > 0 && slashIdx < modelStr.length - 1) {
    return { provider: modelStr.slice(0, slashIdx), model: modelStr.slice(slashIdx + 1) };
  }
  // Bare model name — treat as a model without a provider (9Router will look up)
  return { model: modelStr };
}

/**
 * Get a profile by name.
 * @param {string} name
 * @returns {Profile | null}
 */
export function getProfile(name) {
  const config = loadRoutingConfig();
  return config.profiles[name] || null;
}

/**
 * List all available profile names with descriptions.
 * @returns {Array<{ name: string, description: string }>}
 */
export function listProfiles() {
  const config = loadRoutingConfig();
  return Object.entries(config.profiles).map(([name, p]) => ({
    name,
    description: p.description || "",
  }));
}
