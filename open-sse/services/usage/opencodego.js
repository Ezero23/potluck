/**
 * OpenCode Go usage handler
 *
 * GET https://opencode.ai/zen/go/v1/usage with the account API key returns
 * percent-only rolling / weekly / monthly windows:
 *   { usage: { rolling: { status, percent, resetsAt }, weekly: ..., monthly: ... } }
 * "percent" is used percent (100 = fully consumed, rate-limited).
 */

import { proxyAwareFetch } from "../../utils/proxyFetch.js";

const USAGE_URL = "https://opencode.ai/zen/go/v1/usage";

const WINDOW_LABELS = {
  rolling: "Rolling",
  weekly: "Weekly",
  monthly: "Monthly",
};

function toWindowQuota(entry) {
  if (!entry || typeof entry !== "object") return null;
  const usedPercent = Number(entry.percent);
  if (!Number.isFinite(usedPercent)) return null;
  return {
    used: null,
    total: null,
    remaining: null,
    remainingPercentage: Math.max(0, Math.min(100, 100 - usedPercent)),
    resetAt: entry.resetsAt || null,
    unlimited: false,
  };
}

export async function getOpencodeGoUsage(apiKey, proxyOptions = null) {
  if (!apiKey) return { message: "OpenCode Go API key missing" };
  try {
    const response = await proxyAwareFetch(USAGE_URL, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json",
      },
    }, proxyOptions);

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        return { message: "OpenCode Go API key invalid or expired." };
      }
      return { message: `OpenCode Go usage API error (${response.status}).` };
    }

    const payload = await response.json().catch(() => null);
    const usage = payload?.usage;
    if (!usage || typeof usage !== "object") {
      return { message: "OpenCode Go usage API returned no usage data" };
    }
    const quotas = {};
    for (const [key, label] of Object.entries(WINDOW_LABELS)) {
      const quota = toWindowQuota(usage[key]);
      if (quota) quotas[label] = quota;
    }
    if (Object.keys(quotas).length === 0) {
      return { message: "OpenCode Go usage API returned no quota windows" };
    }
    return { quotas };
  } catch (error) {
    return { message: `OpenCode Go connected. Unable to fetch usage: ${error.message}` };
  }
}
