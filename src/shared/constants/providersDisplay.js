// UI display config — all providers derive from registry.display.
import REGISTRY from "open-sse/providers/registry/index.js";

export const RISK_NOTICE = "⚠️ Risk Notice: This provider uses a subscription/OAuth session not officially licensed for proxy/router use. Account may be restricted or banned. Use at your own risk.";

// Verified against provider-owned documentation. Keep these labels factual:
// "free tier" can mean a recurring quota, a development-only trial, temporary
// welcome credit, or availability limited by model and region.
export const FREE_TIER_GUIDANCE = Object.freeze({
  openrouter: {
    kind: "recurring-quota",
    badge: "50 free req/day",
    detail: "Create an OpenRouter API key, then select a model ending in :free or use openrouter/free. No purchase is required for the base free quota (50 requests/day in total). After at least $10 of lifetime credit purchases, the free-model quota rises to 1,000 requests/day. Free capacity is shared and is not intended for reliable production traffic.",
    docsUrl: "https://openrouter.ai/docs/faq",
  },
  gemini: {
    kind: "region-and-model-limited",
    badge: "Quota varies",
    detail: "Create the key in Google AI Studio and check that project's current limits there. Free quotas are per project, not per API key, differ by model, and can be zero for preview, image, or other paid-only models. The free tier is unavailable in some regions; those projects must enable billing. A 429 means an RPM, TPM, RPD, or spend limit was reached.",
    docsUrl: "https://ai.google.dev/gemini-api/docs/rate-limits",
  },
  nvidia: {
    kind: "development-trial",
    badge: "Development only",
    detail: "Join the free NVIDIA Developer Program and create a key on build.nvidia.com. Hosted NIM endpoints are free for prototyping, research, development, and testing, but requests may be throttled and account credits or entitlements can expire. Production use requires an NVIDIA AI Enterprise license.",
    docsUrl: "https://docs.api.nvidia.com/nim/docs/product",
  },
  "cloudflare-ai": {
    kind: "recurring-quota",
    badge: "10K neurons/day",
    detail: "Requires a Cloudflare account, an API token with Workers AI access, and the Account ID entered with the connection. Workers AI includes 10,000 neurons per day at no charge and resets at 00:00 UTC. On the Free plan, requests fail after the daily allocation is exhausted; additional usage requires Workers Paid.",
    docsUrl: "https://developers.cloudflare.com/workers-ai/platform/pricing/",
  },
  ollama: {
    kind: "recurring-quota",
    badge: "1 cloud model",
    detail: "Ollama Cloud requires an ollama.com account and API key. The Free plan permits light cloud usage and one concurrent cloud model, with session limits resetting every 5 hours and weekly limits every 7 days. Exact usage is GPU-time based rather than a fixed token count. Models running on your own hardware remain unlimited and do not use this cloud quota.",
    docsUrl: "https://ollama.com/pricing",
  },
  vertex: {
    kind: "welcome-credit",
    badge: "$300 / 90 days",
    detail: "Vertex AI is pay-as-you-go, not an always-free model API. Eligible new Google Cloud accounts receive $300 of welcome credit for 90 days. Create a GCP project, enable billing and the Vertex AI API, and use a service account with the required permissions. When the credit expires or is exhausted, requests stop unless the account is upgraded and subsequent usage is billable.",
    docsUrl: "https://cloud.google.com/free/docs/free-cloud-features",
  },
  byteplus: {
    kind: "trial-tokens",
    badge: "Account-specific trial",
    detail: "ModelArk free tokens are a one-time, model-specific trial whose amount and expiry depend on the package actually granted to the account. Check Model Activation and Billing Center before use. Without formal service activation, access stops when trial tokens run out; with post-paid activation, later requests can be charged. The API key, model, and regional endpoint must match the activated service.",
    docsUrl: "https://docs.byteplus.com/en/docs/legal/termsandconditions_modelark_free-token_campaign",
  },
});

// Resolve "RISK_NOTICE" token → real notice text (registry stores token to avoid import cycle)
const resolveDisplay = (d) =>
  d.deprecationNotice === "RISK_NOTICE" ? { ...d, deprecationNotice: RISK_NOTICE } : d;

export const PROVIDER_DISPLAY = Object.fromEntries(
  REGISTRY.filter((r) => r.display).map((r) => [r.id, resolveDisplay(r.display)]),
);
