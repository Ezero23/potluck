/**
 * Misc usage handlers (Qwen, iFlow, Ollama, GLM, Vercel AI Gateway, Qoder)
 */

import crypto from "node:crypto";

import { proxyAwareFetch } from "../../utils/proxyFetch.js";
import { U } from "./shared.js";

// GLM quota endpoints (region-aware) — url from registry transport.usage
const GLM_QUOTA_URLS = {
  international: U("glm").url,
  china: U("glm-cn").url,
};

// Vercel AI Gateway credits endpoint
// Returns { balance: "95.50", total_used: "4.50" } (USD as decimal strings).
const VERCEL_AI_GATEWAY_CREDITS_URL = U("vercel-ai-gateway").url;

/**
 * Qwen Usage
 */
export async function getQwenUsage(accessToken, providerSpecificData) {
  try {
    const resourceUrl = providerSpecificData?.resourceUrl;
    if (!resourceUrl) {
      return { message: "Qwen connected. No resource URL available." };
    }

    // Qwen may have usage endpoint at resource URL
    return { message: "Qwen connected. Usage tracked per request." };
  } catch (error) {
    return { message: "Unable to fetch Qwen usage." };
  }
}

/**
 * iFlow Usage
 */
export async function getIflowUsage(accessToken) {
  try {
    // iFlow may have usage endpoint
    return { message: "iFlow connected. Usage tracked per request." };
  } catch (error) {
    return { message: "Unable to fetch iFlow usage." };
  }
}

/**
 * Ollama Cloud Usage
 * GET https://ollama.com/api/usage (Bearer apiKey) reports each window's
 * `usage` as a 0..1 ratio (1.0 = limit reached); no reset timestamps.
 * POST /api/me returns the plan label and account email — best-effort, never
 * blocks quota. The email lets the Monitor recognize that this API-key row and
 * a locally probed row are the same Ollama account and merge them.
 */
const OLLAMA_USAGE_URL = "https://ollama.com/api/usage";
const OLLAMA_ME_URL = "https://ollama.com/api/me";

function ollamaWindow(usage) {
  const ratio = Number(usage);
  if (!Number.isFinite(ratio)) return null;
  const usedPercent = Math.max(0, Math.min(100, Math.round(ratio * 1000) / 10));
  return {
    used: null,
    total: null,
    remaining: null,
    remainingPercentage: Math.max(0, Math.min(100, 100 - usedPercent)),
    usedPercent,
    resetAt: null,
    unlimited: false,
  };
}

async function getOllamaAccountInfo(apiKey, proxyOptions) {
  try {
    const response = await proxyAwareFetch(OLLAMA_ME_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json",
        "Content-Length": "0",
      },
    }, proxyOptions);
    if (!response.ok) return {};
    const data = await response.json();
    const rawPlan = String(data?.Plan || "").trim();
    const email = String(data?.Email || "").trim().toLowerCase();
    return {
      ...(rawPlan ? { plan: rawPlan.charAt(0).toUpperCase() + rawPlan.slice(1).toLowerCase() } : {}),
      ...(email.includes("@") ? { email } : {}),
    };
  } catch {
    return {};
  }
}

export async function getOllamaUsage(apiKey, proxyOptions = null) {
  if (!apiKey) {
    return { message: "Ollama API key not available." };
  }
  try {
    const response = await proxyAwareFetch(OLLAMA_USAGE_URL, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json",
      },
    }, proxyOptions);
    if (response.status === 401 || response.status === 403) {
      return { message: "Ollama API key invalid or expired." };
    }
    if (response.status === 429) {
      return { message: "Ollama usage API rate limited (429)." };
    }
    if (!response.ok) {
      return { message: `Ollama usage API error (${response.status}).` };
    }
    const limits = (await response.json())?.limits || {};
    const session = ollamaWindow(limits.session?.usage);
    const weekly = ollamaWindow(limits.weekly?.usage);
    const quotas = {};
    if (session) quotas.Session = session;
    if (weekly) quotas.Weekly = weekly;
    const info = await getOllamaAccountInfo(apiKey, proxyOptions);
    return { ...info, quotas };
  } catch (error) {
    return { message: "Unable to fetch Ollama Cloud usage." };
  }
}

// GLM reports window length as unit × number: unit 5 = minutes, 3 = hours,
// 1 = days, 6 = weeks. Returns minutes, or null when the pair is unusable.
function glmWindowMinutes(limit) {
  const unit = Number(limit?.unit);
  const number = Number(limit?.number);
  if (!Number.isFinite(unit) || !Number.isFinite(number) || number <= 0) return null;
  if (unit === 5) return number;
  if (unit === 3) return number * 60;
  if (unit === 1) return number * 24 * 60;
  if (unit === 6) return number * 7 * 24 * 60;
  return null;
}

function glmNumberOrNull(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function glmUsedPercent(limit) {
  const total = glmNumberOrNull(limit?.usage);
  const remaining = glmNumberOrNull(limit?.remaining);
  const currentValue = glmNumberOrNull(limit?.currentValue ?? limit?.current_value);
  if (total !== null && total > 0) {
    let usedRaw = null;
    if (remaining !== null) {
      const usedFromRemaining = total - remaining;
      usedRaw = currentValue === null ? usedFromRemaining : Math.max(usedFromRemaining, currentValue);
    } else if (currentValue !== null) {
      usedRaw = currentValue;
    }
    if (usedRaw !== null) {
      return Math.max(0, Math.min(100, (Math.max(0, Math.min(total, usedRaw)) / total) * 100));
    }
  }
  const explicit = glmNumberOrNull(limit?.percentage ?? limit?.usedPercent ?? limit?.used_percent);
  return explicit === null ? null : Math.max(0, Math.min(100, explicit));
}

function glmQuota(limit) {
  const usedPercent = glmUsedPercent(limit);
  if (usedPercent === null) return null;
  const resetMs = Number(limit?.nextResetTime ?? limit?.next_reset_time) || 0;
  return {
    used: usedPercent,
    total: 100,
    remaining: Math.max(0, 100 - usedPercent),
    remainingPercentage: Math.max(0, 100 - usedPercent),
    resetAt: resetMs > 0 ? new Date(resetMs).toISOString() : null,
    unlimited: false,
  };
}

/**
 * GLM Coding Plan usage (international + China regions)
 *
 * bigmodel.cn coding plans report quotas as CREDIT_LIMIT with 5-hour + weekly
 * windows; z.ai international uses TOKENS_LIMIT. Parse both.
 */
export async function getGlmUsage(apiKey, provider, proxyOptions = null) {
  if (!apiKey) {
    return { message: "GLM API key not available." };
  }

  const region = provider === "glm-cn" ? "china" : "international";
  const quotaUrl = GLM_QUOTA_URLS[region];

  try {
    const response = await proxyAwareFetch(quotaUrl, {
      headers: {
        // This endpoint expects the raw API key as the Authorization value
        // (matching the official GLM Coding Plan client), not Bearer form.
        Authorization: apiKey,
        "Accept-Language": "en-US,en",
        Accept: "application/json",
      },
    }, proxyOptions);

    if (!response.ok) {
      if (response.status === 401) {
        return { message: "GLM API key invalid or expired." };
      }
      return { message: `GLM quota API error (${response.status}).` };
    }

    const json = await response.json();
    const data = json?.data && typeof json.data === "object" ? json.data : {};
    const limits = Array.isArray(data.limits) ? data.limits : [];

    let tokenLimits = limits.filter((limit) => limit && limit.type === "TOKENS_LIMIT" && glmUsedPercent(limit) !== null);
    const creditLimits = limits.filter((limit) => limit && limit.type === "CREDIT_LIMIT" && glmUsedPercent(limit) !== null);
    if (!tokenLimits.length && creditLimits.length) tokenLimits = creditLimits;
    tokenLimits.sort((a, b) => (glmWindowMinutes(a) ?? Infinity) - (glmWindowMinutes(b) ?? Infinity));

    const quotas = {};
    const session = tokenLimits.length >= 2 ? tokenLimits[0] : null;
    const weekly = tokenLimits.length >= 2 ? tokenLimits[tokenLimits.length - 1] : tokenLimits[0] || null;
    if (session) quotas["Session"] = glmQuota(session);
    if (weekly) quotas["Weekly"] = glmQuota(weekly);

    const levelRaw = typeof data.level === "string" ? data.level : "";
    const plan = levelRaw
      ? levelRaw.charAt(0).toUpperCase() + levelRaw.slice(1).toLowerCase()
      : "Unknown";

    // Opaque account fingerprint: the Monitor hashes the same API key with the
    // same recipe (sha256 of "zai\0<key>\0") for its local zai row, so the web
    // row and the local row can be recognized as the same account and merged.
    const fingerprint = crypto.createHash("sha256")
      .update("zai").update("\0")
      .update(apiKey).update("\0")
      .digest("hex");

    return { plan, email: `glm-${fingerprint}@glm-account.local`, quotas };
  } catch (error) {
    return { message: `GLM error: ${error.message}` };
  }
}

/**
 * Vercel AI Gateway usage — credit balance for the API key
 *
 * Calls GET /v1/credits which returns:
 *   { "balance": "95.50", "total_used": "4.50" }   (USD as decimal strings)
 *
 * We surface this as a single "Balance ($)" quota row so the existing
 * QuotaTable / progress-bar UI can render it. used = total_used,
 * total = balance + total_used (the original credit allotment), so the
 * remaining percentage equals balance / total.
 *
 * Docs: https://vercel.com/docs/ai-gateway/usage
 */
export async function getVercelAiGatewayUsage(apiKey, proxyOptions = null) {
  if (!apiKey) {
    return { message: "Vercel AI Gateway API key not available." };
  }

  try {
    const response = await proxyAwareFetch(VERCEL_AI_GATEWAY_CREDITS_URL, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json",
      },
    }, proxyOptions);

    if (response.status === 401 || response.status === 403) {
      return { message: "Vercel AI Gateway API key invalid or expired." };
    }

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      const trimmed = errorText ? `: ${errorText.slice(0, 200)}` : "";
      return { message: `Vercel AI Gateway credits API error (${response.status})${trimmed}` };
    }

    const data = await response.json();

    // Vercel returns numeric strings; coerce safely.
    const balance = Number(data?.balance) || 0;
    const totalUsed = Number(data?.total_used) || 0;

    // Vercel gives $5/month free credit. The API doesn't return the
    // monthly allocation so we use the known constant as the denominator.
    const MONTHLY_CREDIT = 5;
    const remainingPercentage = (balance / MONTHLY_CREDIT) * 100;

    if (balance <= 0 && totalUsed <= 0) {
      return {
        plan: "Pay-as-you-go",
        message: "Vercel AI Gateway connected. No credit allocation found (BYOK or unfunded account).",
        quotas: {},
      };
    }

    // "Used (USD)": how much has been spent this month (no fixed cap → unlimited).
    // "Remaining (USD)": balance remaining out of the $5 monthly allocation.
    return {
      plan: "Pay-as-you-go",
      quotas: {
        "Used (USD)": {
          used: totalUsed,
          total: 0,
          remaining: 0,
          remainingPercentage: 100,
          unlimited: true,
        },
        "Remaining (USD)": {
          used: balance,
          total: MONTHLY_CREDIT,
          remaining: balance,
          remainingPercentage,
          unlimited: false,
        },
      },
    };
  } catch (error) {
    return { message: `Vercel AI Gateway error: ${error.message}` };
  }
}

export async function getQoderUsage(accessToken, provider = "qoder", proxyOptions = null) {
  if (typeof provider !== "string") {
    proxyOptions = provider;
    provider = "qoder";
  }
  if (!accessToken) {
    return { message: "Qoder usage unavailable: no access token" };
  }
  try {
    const response = await proxyAwareFetch(
      U(provider).url,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/json",
        },
      },
      proxyOptions,
    );
    if (!response.ok) {
      return { message: `Qoder connected. Usage fetch returned ${response.status}.` };
    }
    const body = await response.json().catch(() => null);
    if (!body) {
      return { message: "Qoder connected. Usage response was not JSON." };
    }
    // Quota records live under `quotas`; scalar metadata
    // (totalUsagePercentage, isQuotaExceeded, expiresAt) are surfaced as
    // siblings so the dashboard parser doesn't try to render them as rows.
    const userQuota = body.userQuota || {};
    const orgQuota = body.orgResourcePackage || {};
    // Qoder publishes a single absolute reset timestamp (`expiresAt` in ms);
    // surface it on every quota record as ISO so the table can render
    // "resets at" alongside used/total.
    const expiresAtMs = Number.isFinite(Number(body.expiresAt)) && Number(body.expiresAt) > 0
      ? Number(body.expiresAt)
      : null;
    const resetAt = expiresAtMs ? new Date(expiresAtMs).toISOString() : null;
    const quotas = {
      user: {
        total: Number(userQuota.total) || 0,
        used: Number(userQuota.used) || 0,
        remaining: Number(userQuota.remaining) || 0,
        unit: userQuota.unit || "credits",
        resetAt,
      },
      organization: {
        total: Number(orgQuota.total) || 0,
        used: Number(orgQuota.used) || 0,
        remaining: Number(orgQuota.remaining) || 0,
        unit: orgQuota.unit || "credits",
        resetAt,
      },
    };
    return {
      quotas,
      totalUsagePercentage: Number(body.totalUsagePercentage) || 0,
      isQuotaExceeded: !!body.isQuotaExceeded,
      expiresAt: expiresAtMs,
    };
  } catch (error) {
    return { message: `Qoder connected. Unable to fetch usage: ${error.message}` };
  }
}
