import "open-sse/index.js";

import {
  getProviderCredentials,
  markAccountUnavailable,
  clearAccountError,
  extractApiKey,
  isValidApiKey,
} from "../services/auth.js";
import { cacheClaudeHeaders } from "open-sse/utils/claudeHeaderCache.js";
import { getSettings } from "@/lib/localDb";
import { getModelInfo, getComboModels } from "../services/model.js";
import { handleChatCore } from "open-sse/handlers/chatCore.js";
import { DEFAULT_HEADROOM_URL } from "@/lib/headroom/detect";
import { errorResponse, unavailableResponse } from "open-sse/utils/error.js";
import { handleComboChat, handleFusionChat } from "open-sse/services/combo.js";
import { handleBypassRequest } from "open-sse/utils/bypassHandler.js";
import { HTTP_STATUS } from "open-sse/config/runtimeConfig.js";
import { detectFormatByEndpoint } from "open-sse/translator/formats.js";
import * as log from "../utils/logger.js";
import { updateProviderCredentials, checkAndRefreshToken } from "../services/tokenRefresh.js";
import { getProjectIdForConnection } from "open-sse/services/projectId.js";
import {
  isRoutingProfile,
  selectProvider,
  getProfile,
  recordSuccess,
  recordError,
  RoutingTrace,
  loadRoutingConfig,
  acquireSource,
  releaseSource,
} from "open-sse/routing/engine.js";
import { recordMonitorEvent } from "@/lib/monitor/healthEvents.js";

/**
 * Handle chat completion request
 * Supports: OpenAI, Claude, Gemini, OpenAI Responses API formats
 * Format detection and translation handled by translator
 */
export async function handleChat(request, clientRawRequest = null) {
  let body;
  try {
    body = await request.json();
  } catch {
    log.warn("CHAT", "Invalid JSON body");
    return errorResponse(HTTP_STATUS.BAD_REQUEST, "Invalid JSON body");
  }

  // Build clientRawRequest for logging (if not provided)
  if (!clientRawRequest) {
    const url = new URL(request.url);
    clientRawRequest = {
      endpoint: url.pathname,
      body,
      headers: Object.fromEntries(request.headers.entries())
    };
  }
  cacheClaudeHeaders(clientRawRequest.headers);

  // Log request endpoint and model
  const url = new URL(request.url);
  let modelStr = body.model;

  // Count messages (support both messages[] and input[] formats)
  const msgCount = body.messages?.length || body.input?.length || 0;
  const toolCount = body.tools?.length || 0;
  const effort = body.reasoning_effort || body.reasoning?.effort || null;
  log.request("POST", `${url.pathname} | ${modelStr} | ${msgCount} msgs${toolCount ? ` | ${toolCount} tools` : ""}${effort ? ` | effort=${effort}` : ""}`);

  // Log API key (masked)
  const authHeader = request.headers.get("Authorization");
  const apiKey = extractApiKey(request);
  if (authHeader && apiKey) {
    const masked = log.maskKey(apiKey);
    log.debug("AUTH", `API Key: ${masked}`);
  } else {
    log.debug("AUTH", "No API key provided (local mode)");
  }

  // Enforce API key if enabled in settings
  const settings = await getSettings();
  if (settings.requireApiKey) {
    if (!apiKey) {
      log.warn("AUTH", "Missing API key (requireApiKey=true)");
      return errorResponse(HTTP_STATUS.UNAUTHORIZED, "Missing API key");
    }
    const valid = await isValidApiKey(apiKey);
    if (!valid) {
      log.warn("AUTH", "Invalid API key (requireApiKey=true)");
      return errorResponse(HTTP_STATUS.UNAUTHORIZED, "Invalid API key");
    }
  }

  if (!modelStr) {
    log.warn("CHAT", "Missing model");
    return errorResponse(HTTP_STATUS.BAD_REQUEST, "Missing model");
  }

  // Normalize potluck/{intent} aliases sent by WeChat Bridge / kimi CLI
  // "potluck/code" -> "profile:code", "potluck/fast" -> "profile:fast"
  const NINE_ROUTER_PREFIX = /^potluck\//i;
  if (NINE_ROUTER_PREFIX.test(modelStr)) {
    const intent = modelStr.replace(NINE_ROUTER_PREFIX, "");
    const normalized = `profile:${intent}`;
    log.info("ROUTING", `Normalized ${modelStr} → ${normalized}`);
    modelStr = normalized;
  }

  // Bare profile name → "profile:{name}" (e.g. model:"auto" → "profile:auto")
  // Only matches exact profile names; won't collide with "provider/model" format.
  if (!modelStr.includes("/") && !modelStr.startsWith("profile:") && getProfile(modelStr)) {
    log.info("ROUTING", `Bare profile name "${modelStr}" → profile:${modelStr}`);
    modelStr = `profile:${modelStr}`;
  }

  // Bypass naming/warmup requests before combo rotation to avoid wasting rotation slots
  const userAgent = request?.headers?.get("user-agent") || "";
  const bypassResponse = handleBypassRequest(body, modelStr, userAgent, !!settings.ccFilterNaming);
  if (bypassResponse) return bypassResponse.response || bypassResponse;

  // Check if model is a combo (has multiple models with fallback)
  const comboModels = await getComboModels(modelStr);
  if (comboModels) {
    // Check for combo-specific strategy first, fallback to global
    const comboStrategies = settings.comboStrategies || {};
    const comboSpecificStrategy = comboStrategies[modelStr]?.fallbackStrategy;
    const comboStrategy = comboSpecificStrategy || settings.comboStrategy || "fallback";

    if (comboStrategy === "fusion") {
      log.info("CHAT", `Combo "${modelStr}" with ${comboModels.length} models (strategy: fusion)`);
      return handleFusionChat({
        body,
        models: comboModels,
        handleSingleModel: (b, m, isPanel) => {
          let cleanRawReq = clientRawRequest;
          if (isPanel && clientRawRequest) {
            const { tools, tool_choice, ...cleanBody } = clientRawRequest.body || {};
            cleanRawReq = { ...clientRawRequest, body: cleanBody };
          }
          return handleSingleModelChat(b, m, cleanRawReq, request, apiKey);
        },
        log,
        comboName: modelStr,
        judgeModel: comboStrategies[modelStr]?.judgeModel,
        tuning: comboStrategies[modelStr]?.fusionTuning,
      });
    }

    const comboStickyLimit = settings.comboStickyRoundRobinLimit;
    log.info("CHAT", `Combo "${modelStr}" with ${comboModels.length} models (strategy: ${comboStrategy}, sticky: ${comboStickyLimit})`);
    return handleComboChat({
      body,
      models: comboModels,
      handleSingleModel: (b, m) => handleSingleModelChat(b, m, clientRawRequest, request, apiKey),
      log,
      comboName: modelStr,
      comboStrategy,
      comboStickyLimit
    });
  }

  // Single model request — intercept routing profiles first
  if (isRoutingProfile(modelStr)) {
    return handleRoutingProfileChat(body, modelStr, clientRawRequest, request, apiKey);
  }

  return handleSingleModelChat(body, modelStr, clientRawRequest, request, apiKey);
}

/**
 * Handle a routing profile request (e.g. "profile:code").
 * Tries candidates sequentially according to the profile's fallbackOn rules.
 */
async function handleRoutingProfileChat(body, modelStr, clientRawRequest, request, apiKey) {
  const profileName = modelStr.replace(/^profile:/i, "");
  const profile = getProfile(profileName);
  if (!profile) {
    return errorResponse(HTTP_STATUS.BAD_REQUEST, `Routing profile not found: ${profileName}`);
  }

  // Ensure config is loaded once
  loadRoutingConfig();

  const fallbackOn = new Set(profile.fallbackOn || ["403", "429", "quota_exceeded", "timeout", "5xx"]);
  const excludeCandidates = [];
  const requestId = String(request?.headers?.get?.("x-request-id") || `potluck-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`).slice(0, 128);
  const traces = [];
  let lastResponse = null;
  let lastTrace = null;

  while (true) {
    let selected;
    try {
      selected = await selectProvider(profileName, body, excludeCandidates);
    } catch (err) {
      const msg = lastResponse
        ? `All candidates exhausted for profile ${profileName}. Last error: ${String(err.message || err)}`
        : err.message || String(err);
      recordRoutingMonitorEvent({ requestId, profileName, traces, status: "error", reason: msg, reasonCode: "no_eligible_candidate", final: true });
      return errorResponse(HTTP_STATUS.SERVICE_UNAVAILABLE, msg);
    }

    const { provider, model, trace } = selected;
    trace.requestId = requestId;
    traces.push(trace);
    lastTrace = trace;
    const candidateModelStr = `${provider}/${model}`;
    excludeCandidates.push(candidateModelStr);

    // Track concurrency: mark this source as busy so the scheduler
    // deprioritizes it for subsequent requests until this one completes.
    acquireSource(provider, model);

    // The slot is released either by the finally below (throw, fallback,
    // non-stream result) or by trackStreamForRelease when a streamed
    // response actually ends (close / error / client disconnect).
    let streamOwnsRelease = false;
    try {
      log.info("ROUTING", `Profile ${profileName} selected ${candidateModelStr}`);

      const attemptStartedAt = Date.now();
      let result = await handleSingleModelChat(
        body,
        candidateModelStr,
        clientRawRequest,
        request,
        apiKey,
        trace
      );

      lastResponse = result;

      // Determine if we should fallback to the next candidate
      if (!result) continue; // shouldn't happen, but defensive

      const statusCode = result.status || result.headers?.get?.("x-status") || 200;
      const statusStr = String(statusCode);
      const errorText = result.errorText || "";

      // Pre-flight: for 200 responses, wait for first chunk with a timeout.
      // If first token arrives, continue normally. If timeout, treat as
      // failure and fallback to next candidate (no half-response shown).
      let firstTokenTimedOut = false;
      if (statusCode === 200) {
        const firstTokenTimeoutMs = getFirstTokenTimeout(profileName);
        const wrapped = await wrapFirstTokenTimeout(result, firstTokenTimeoutMs);
        if (!wrapped.success) {
          firstTokenTimedOut = true;
          log.warn("ROUTING", `Profile ${profileName} candidate ${candidateModelStr} first-token timeout (${firstTokenTimeoutMs}ms), trying next`);
        } else {
          result = wrapped.response;
        }
      }

      const shouldFallback =
        firstTokenTimedOut ||
        // Rotation pools: any non-200 → source can't serve → slide to next ("不断线")
        (profile.strategy === "rotation" && statusCode !== 200) ||
        fallbackOn.has(statusStr) ||
        fallbackOn.has("5xx") && statusCode >= 500 && statusCode < 600 ||
        fallbackOn.has("timeout") && (statusCode === 0 || /timeout|aborted/i.test(errorText)) ||
        fallbackOn.has("quota_exceeded") && /quota|rate.?limit|usage.?limit/i.test(errorText);

      if (!shouldFallback) {
        trace.recordOutcome(provider, model, statusCode, Date.now() - attemptStartedAt, null);
        recordRoutingMonitorEvent({ requestId, profileName, traces, status: "success", final: true });
        recordSuccess(provider);
        const tracked = trackStreamForRelease(result, () => releaseSource(provider, model));
        streamOwnsRelease = true; // helper guarantees exactly-once release
        return injectRoutingHeaders(tracked, trace);
      }

      const failureReasonCode = firstTokenTimedOut
        ? "first_token_timeout"
        : (statusCode === 401 || statusCode === 403)
          ? "auth_failed"
          : (statusCode === 429 || /rate.?limit|quota|usage.?limit/i.test(errorText))
            ? "rate_limited"
            : (statusCode >= 500 || statusCode === 0)
              ? "provider_unavailable"
              : `http_${statusCode}`;
      trace.recordOutcome(
        provider,
        model,
        firstTokenTimedOut ? 0 : statusCode,
        Date.now() - attemptStartedAt,
        firstTokenTimedOut ? "first-token-timeout" : (errorText || `http-${statusCode}`),
        failureReasonCode
      );
      recordError(provider, firstTokenTimedOut ? 0 : statusCode);
      log.warn("ROUTING", `Profile ${profileName} candidate ${candidateModelStr} failed (${firstTokenTimedOut ? "first-token-timeout" : statusCode}), trying next`);
    } finally {
      if (!streamOwnsRelease) releaseSource(provider, model);
    }

    // Safety cap; selectProvider throws on true exhaustion (caught above).
    if (excludeCandidates.length >= 50) {
      break;
    }
  }

  recordRoutingMonitorEvent({
    requestId,
    profileName,
    traces,
    status: "error",
    reason: `all candidates failed: ${lastResponse?.status || "unknown"}`,
    reasonCode: "all_candidates_failed",
    final: true
  });
  return errorResponse(
    HTTP_STATUS.SERVICE_UNAVAILABLE,
    `Profile ${profileName}: all candidates failed. Last result: ${lastResponse?.status || "unknown"}`,
    null,
    lastResponse?.headers
      ? injectRoutingHeaders({ headers: lastResponse.headers }, lastTrace)
      : undefined
  );
}

function recordRoutingMonitorEvent({ requestId, profileName, traces, status, reason = "", reasonCode = "", final = false }) {
  const lastTrace = traces[traces.length - 1];
  if (!lastTrace) {
    recordMonitorEvent({ type: "routing_attempt", requestId, profile: profileName, status, reason, reasonCode, final });
    return;
  }
  const candidates = traces.flatMap((trace) => trace.entries || []);
  const event = lastTrace.toMonitorEvent({ final, status });
  event.requestId = requestId;
  event.profile = profileName;
  event.candidates = candidates;
  if (reason) event.reason = reason;
  if (reasonCode) event.reasonCode = reasonCode;
  event.fallbackCount = candidates.filter((entry) => entry.status === "error").length;
  recordMonitorEvent(event);
}

function injectRoutingHeaders(result, trace) {
  if (!result || !result.headers || !trace) return result;
  const headers = trace.toHeaders();
  for (const [k, v] of Object.entries(headers)) {
    if (typeof result.headers.set === "function") {
      result.headers.set(k, v);
    } else if (typeof result.headers.append === "function") {
      result.headers.append(k, v);
    } else {
      result.headers[k] = v;
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// First-chunk timeout helpers
// ---------------------------------------------------------------------------

/**
 * Per-profile first-token timeout. How long to wait for the first SSE chunk
 * before declaring the candidate unusable and falling through.
 */
function getFirstTokenTimeout(profileName) {
  const MAP = { fast: 10000, code: 20000, vision: 15000, fallback: 25000 };
  return MAP[profileName] || 15000;
}

/**
 * Wait for the first chunk of a streaming Response body. If it arrives within
 * `timeoutMs`, return a replacement Response whose body replays that chunk and
 * continues reading from the original stream. If it times out, cancel the
 * original stream (propagates abort to the upstream fetch) and signal failure.
 *
 * Non-streaming (JSON) responses pass through immediately.
 */
async function wrapFirstTokenTimeout(response, timeoutMs) {
  if (!response.body || response.status !== 200) {
    return { success: true, response };
  }

  const reader = response.body.getReader();
  const TIMEOUT = Symbol("first_token_timeout");

  const race = await Promise.race([
    reader.read(),
    new Promise((resolve) => setTimeout(() => resolve(TIMEOUT), timeoutMs)),
  ]);

  if (race === TIMEOUT) {
    await reader.cancel("first_token_timeout").catch(() => {});
    return { success: false };
  }

  const { done, value } = race;

  if (done) {
    // Stream ended immediately with zero data — unusual but treat as failure
    return { success: false };
  }

  // Build a replacement stream: enqueue the cached first chunk, then pump rest
  const rest = new ReadableStream({
    start(controller) {
      controller.enqueue(value);
    },
    async pull(controller) {
      try {
        const { done: d, value: v } = await reader.read();
        if (d) { controller.close(); return; }
        controller.enqueue(v);
      } catch (e) {
        controller.error(e);
      }
    },
    cancel() {
      reader.cancel("client_disconnect").catch(() => {});
    },
  });

  const headers = new Headers();
  response.headers.forEach((v, k) => headers.set(k, v));

  return {
    success: true,
    response: new Response(rest, { status: response.status, headers }),
  };
}

/**
 * Wrap a successful result so `release` fires exactly once when its body
 * stream closes, errors, or is cancelled (client disconnect). The scheduler's
 * in-flight count must reflect real concurrency — a minutes-long SSE stream
 * holds its source for the whole generation, not just until first token.
 *
 * Results without a readable body (e.g. buffered JSON) release immediately
 * and pass through untouched.
 */
function trackStreamForRelease(result, release) {
  if (!result?.body || typeof result.body.getReader !== "function") {
    release();
    return result;
  }

  const reader = result.body.getReader();
  let released = false;
  const releaseOnce = () => {
    if (released) return;
    released = true;
    release();
  };

  const tracked = new ReadableStream({
    async pull(controller) {
      try {
        const { done, value } = await reader.read();
        if (done) {
          releaseOnce();
          controller.close();
          return;
        }
        controller.enqueue(value);
      } catch (e) {
        releaseOnce();
        controller.error(e);
      }
    },
    async cancel(reason) {
      releaseOnce();
      await reader.cancel(reason).catch(() => {});
    },
  });

  const headers = new Headers();
  result.headers?.forEach?.((v, k) => headers.set(k, v));
  return new Response(tracked, { status: result.status ?? 200, headers });
}

/**
 * Handle single model chat request
 */
async function handleSingleModelChat(body, modelStr, clientRawRequest = null, request = null, apiKey = null, routingTrace = null) {
  const modelInfo = await getModelInfo(modelStr);

  // If provider is null, this might be a combo name - check and handle
  if (!modelInfo.provider) {
    const comboModels = await getComboModels(modelStr);
    if (comboModels) {
      const chatSettings = await getSettings();
      // Check for combo-specific strategy first, fallback to global
      const comboStrategies = chatSettings.comboStrategies || {};
      const comboSpecificStrategy = comboStrategies[modelStr]?.fallbackStrategy;
      const comboStrategy = comboSpecificStrategy || chatSettings.comboStrategy || "fallback";

      if (comboStrategy === "fusion") {
        log.info("CHAT", `Combo "${modelStr}" with ${comboModels.length} models (strategy: fusion)`);
        return handleFusionChat({
          body,
          models: comboModels,
          handleSingleModel: (b, m, isPanel) => {
            let cleanRawReq = clientRawRequest;
            if (isPanel && clientRawRequest) {
              const { tools, tool_choice, ...cleanBody } = clientRawRequest.body || {};
              cleanRawReq = { ...clientRawRequest, body: cleanBody };
            }
            return handleSingleModelChat(b, m, cleanRawReq, request, apiKey);
          },
          log,
          comboName: modelStr,
          judgeModel: comboStrategies[modelStr]?.judgeModel,
          tuning: comboStrategies[modelStr]?.fusionTuning,
        });
      }

      const comboStickyLimit = chatSettings.comboStickyRoundRobinLimit;
      log.info("CHAT", `Combo "${modelStr}" with ${comboModels.length} models (strategy: ${comboStrategy}, sticky: ${comboStickyLimit})`);
      return handleComboChat({
        body,
        models: comboModels,
        handleSingleModel: (b, m) => handleSingleModelChat(b, m, clientRawRequest, request, apiKey),
        log,
        comboName: modelStr,
        comboStrategy,
        comboStickyLimit
      });
    }
    log.warn("CHAT", "Invalid model format", { model: modelStr });
    return errorResponse(HTTP_STATUS.BAD_REQUEST, "Invalid model format");
  }

  const { provider, model } = modelInfo;

  // Log model routing (alias → actual model)
  if (modelStr !== `${provider}/${model}`) {
    log.info("ROUTING", `${modelStr} → ${provider}/${model}`);
  } else {
    log.info("ROUTING", `Provider: ${provider}, Model: ${model}`);
  }

  // Extract userAgent from request
  const userAgent = request?.headers?.get("user-agent") || "";

  // Try with available accounts (fallback on errors)
  const excludeConnectionIds = new Set();
  let lastError = null;
  let lastStatus = null;

  while (true) {
    const credentials = await getProviderCredentials(provider, excludeConnectionIds, model);

    // All accounts unavailable
    if (!credentials || credentials.allRateLimited) {
      if (credentials?.allRateLimited) {
        const errorMsg = lastError || credentials.lastError || "Unavailable";
        const status = lastStatus || Number(credentials.lastErrorCode) || HTTP_STATUS.SERVICE_UNAVAILABLE;
        log.warn("CHAT", `[${provider}/${model}] ${errorMsg} (${credentials.retryAfterHuman})`);
        return unavailableResponse(status, `[${provider}/${model}] ${errorMsg}`, credentials.retryAfter, credentials.retryAfterHuman);
      }
      if (excludeConnectionIds.size === 0) {
        log.warn("AUTH", `No active credentials for provider: ${provider}`);
        return errorResponse(HTTP_STATUS.NOT_FOUND, `No active credentials for provider: ${provider}`);
      }
      log.warn("CHAT", "No more accounts available", { provider });
      return errorResponse(lastStatus || HTTP_STATUS.SERVICE_UNAVAILABLE, lastError || "All accounts unavailable");
    }

    // Log account selection
    log.info("AUTH", `\x1b[32mUsing ${provider} account: ${credentials.connectionName}\x1b[0m`);

    const refreshedCredentials = await checkAndRefreshToken(provider, credentials);

    // Ensure real project ID is available for providers that need it (P0 fix: cold miss)
    if ((provider === "antigravity" || provider === "gemini-cli") && !refreshedCredentials.projectId) {
      const pid = await getProjectIdForConnection(credentials.connectionId, refreshedCredentials.accessToken);
      if (pid) {
        refreshedCredentials.projectId = pid;
        // Persist to DB in background so subsequent requests have it immediately
        updateProviderCredentials(credentials.connectionId, { projectId: pid }).catch(() => { });
      }
    }

    // Use shared chatCore
    const chatSettings = await getSettings();
    const providerThinking = (chatSettings.providerThinking || {})[provider] || null;
    const result = await handleChatCore({
      body: { ...body, model: `${provider}/${model}` },
      modelInfo: { provider, model },
      credentials: refreshedCredentials,
      log,
      clientRawRequest,
      connectionId: credentials.connectionId,
      userAgent,
      apiKey,
      ccFilterNaming: !!chatSettings.ccFilterNaming,
      rtkEnabled: !!chatSettings.rtkEnabled,
      headroomEnabled: !!chatSettings.headroomEnabled,
      headroomUrl: chatSettings.headroomUrl || DEFAULT_HEADROOM_URL,
      headroomCompressUserMessages: !!chatSettings.headroomCompressUserMessages,
      cavemanEnabled: !!chatSettings.cavemanEnabled,
      cavemanLevel: chatSettings.cavemanLevel || "full",
      ponytailEnabled: !!chatSettings.ponytailEnabled,
      ponytailLevel: chatSettings.ponytailLevel || "full",
      providerThinking,
      // Detect source format by endpoint + body
      sourceFormatOverride: request?.url ? detectFormatByEndpoint(new URL(request.url).pathname, body) : null,
      onCredentialsRefreshed: async (newCreds) => {
        await updateProviderCredentials(credentials.connectionId, {
          ...newCreds,
          existingProviderSpecificData: credentials.providerSpecificData,
          testStatus: "active"
        });
      },
      onRequestSuccess: async () => {
        await clearAccountError(credentials.connectionId, credentials, model);
      }
    });

    if (result.success) return result.response;

    // Mark account unavailable (auto-calculates cooldown with exponential backoff, or precise resetsAtMs)
    const { shouldFallback } = await markAccountUnavailable(credentials.connectionId, result.status, result.error, provider, model, result.resetsAtMs);

    if (shouldFallback) {
      log.warn("AUTH", `Account ${credentials.connectionName} unavailable (${result.status}), trying fallback`);
      excludeConnectionIds.add(credentials.connectionId);
      lastError = result.error;
      lastStatus = result.status;
      continue;
    }

    return result.response;
  }
}
