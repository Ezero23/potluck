/**
 * GitHub Copilot usage handler
 */

import crypto from "node:crypto";
import { proxyAwareFetch } from "../../utils/proxyFetch.js";
import { PROVIDER_OAUTH } from "../../providers/index.js";
import { U, parseResetTime } from "./shared.js";

// GitHub API config — single source from registry oauth block
const GITHUB_CONFIG = {
  apiVersion: PROVIDER_OAUTH.github?.apiVersion,
  userAgent: PROVIDER_OAUTH.github?.userAgent,
  userInfoUrl: PROVIDER_OAUTH.github?.userInfoUrl,
};

function numberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function opaqueKey(namespace, identity) {
  if (!identity) return "";
  const hash = crypto.createHash("sha256");
  hash.update(namespace).update("\0").update(String(identity)).update("\0");
  return `sha256:${hash.digest("hex")}`;
}

function formatLimitedQuota(remainingValue, totalValue, resetAt) {
  const remaining = numberOrNull(remainingValue);
  const total = numberOrNull(totalValue);
  if (remaining === null || total === null || total <= 0) return null;
  return {
    used: Math.max(0, total - remaining),
    total,
    remaining: Math.max(0, remaining),
    unlimited: false,
    resetAt,
  };
}

async function getGitHubIdentity(accessToken, proxyOptions) {
  if (!GITHUB_CONFIG.userInfoUrl) return null;
  try {
    const response = await proxyAwareFetch(GITHUB_CONFIG.userInfoUrl, {
      headers: {
        Authorization: `token ${accessToken}`,
        Accept: "application/json",
        "X-GitHub-Api-Version": GITHUB_CONFIG.apiVersion,
        "User-Agent": GITHUB_CONFIG.userAgent,
      },
    }, proxyOptions);
    if (!response.ok) return null;
    const user = await response.json();
    const identity = user?.id ?? user?.node_id ?? user?.login;
    return identity === null || identity === undefined || identity === "" ? null : identity;
  } catch {
    return null;
  }
}

/**
 * GitHub Copilot Usage
 * Uses GitHub accessToken (not copilotToken) to call copilot_internal/user API
 */
export async function getGitHubUsage(accessToken, providerSpecificData, proxyOptions = null) {
  try {
    if (!accessToken) {
      throw new Error("No GitHub access token available. Please re-authorize the connection.");
    }

    // copilot_internal/user API requires GitHub OAuth token, not copilotToken
    const identityPromise = getGitHubIdentity(accessToken, proxyOptions);
    const response = await proxyAwareFetch(U("github").url, {
      headers: {
        "Authorization": `token ${accessToken}`,
        "Accept": "application/json",
        "X-GitHub-Api-Version": GITHUB_CONFIG.apiVersion,
        "User-Agent": GITHUB_CONFIG.userAgent,
        "Editor-Version": "vscode/1.100.0",
        "Editor-Plugin-Version": "copilot-chat/0.26.7",
      },
    }, proxyOptions);

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`GitHub API error: ${error}`);
    }

    const data = await response.json();
    const identity = await identityPromise;
    const accountKey = opaqueKey("copilot-account", identity);
    const quotaPoolKey = opaqueKey("copilot-pool", identity);

    // Handle different response formats (paid vs free)
    if (data.quota_snapshots) {
      // Paid plan format
      const snapshots = data.quota_snapshots;
      const resetAt = parseResetTime(data.quota_reset_date);

      const quotas = Object.fromEntries(Object.entries({
        chat: formatGitHubQuotaSnapshot(snapshots.chat),
        completions: formatGitHubQuotaSnapshot(snapshots.completions),
        premium_interactions: formatGitHubQuotaSnapshot(snapshots.premium_interactions),
      }).filter(([, quota]) => quota));
      return {
        plan: data.copilot_plan,
        resetDate: data.quota_reset_date,
        ...(accountKey ? { accountKey, quotaPoolKey } : {}),
        quotas: Object.fromEntries(Object.entries(quotas).map(([name, quota]) => [name, { ...quota, resetAt }])),
      };
    } else if (data.monthly_quotas || data.limited_user_quotas) {
      // Free/limited plan format
      const monthlyQuotas = data.monthly_quotas || {};
      const usedQuotas = data.limited_user_quotas || {};
      const resetAt = parseResetTime(data.limited_user_reset_date);

      const quotas = Object.fromEntries(Object.entries({
        chat: formatLimitedQuota(usedQuotas.chat, monthlyQuotas.chat, resetAt),
        completions: formatLimitedQuota(usedQuotas.completions, monthlyQuotas.completions, resetAt),
      }).filter(([, quota]) => quota));
      return {
        plan: data.copilot_plan || data.access_type_sku,
        resetDate: data.limited_user_reset_date,
        ...(accountKey ? { accountKey, quotaPoolKey } : {}),
        quotas,
      };
    }

    return { message: "GitHub Copilot connected. Unable to parse quota data." };
  } catch (error) {
    throw new Error(`Failed to fetch GitHub usage: ${error.message}`);
  }
}

function formatGitHubQuotaSnapshot(quota) {
  if (!quota || typeof quota !== "object") return null;

  const entitlement = numberOrNull(quota.entitlement);
  const remaining = numberOrNull(quota.remaining);
  const unlimited = quota.unlimited === true;
  if (!unlimited && (entitlement === null || remaining === null || entitlement <= 0)) return null;

  return {
    used: unlimited ? null : Math.max(0, entitlement - remaining),
    total: unlimited ? null : entitlement,
    remaining: unlimited ? null : remaining,
    ...(unlimited ? { remainingPercentage: 100 } : {}),
    unlimited,
  };
}
