import { randomUUID } from "crypto";
import { BaseExecutor } from "./base.js";
import { PROVIDERS } from "../config/providers.js";
import { commandCodeToOpenAIResponse } from "../translator/response/commandcode-to-openai.js";
import { SSE_DONE } from "../utils/sseConstants.js";
import { HTTP_STATUS } from "../config/runtimeConfig.js";
import { enforceToolsJsonBudget } from "../translator/concerns/toolSchema.js";

/**
 * CommandCodeExecutor — talks to https://api.commandcode.ai/alpha/generate
 *
 * Auth: Bearer <user_xxx> API key (stored as the connection's apiKey).
 * Adds the per-request `x-session-id` header expected by CommandCode upstream.
 *
 * Upstream returns AI SDK v5 NDJSON (one JSON event per line, no `data:` prefix).
 * We translate each event to an OpenAI chat.completion.chunk and emit it as SSE so
 * both the streaming and non-streaming (forced SSE → JSON) downstream handlers in
 * potluck can consume it without further format translation.
 */
export class CommandCodeExecutor extends BaseExecutor {
  constructor() {
    super("commandcode", PROVIDERS.commandcode);
  }

  transformRequest(model, body, stream, credentials) {
    body.stream = true;
    // GLM-backed models inherit the z.ai ~115KB tools limit; other upstreams
    // (meta/deepseek/…) have not shown it, so only trim for the GLM family.
    if (/glm|z-ai/i.test(model || "")) {
      const summary = enforceToolsJsonBudget(body, 96 * 1024);
      if (summary) console.warn(`[commandcode] ${model}: ${summary}`);
    }
    return body;
  }

  buildHeaders(credentials, stream = true) {
    const headers = {
      "Content-Type": "application/json",
      ...(this.config.headers || {}),
      "x-session-id": randomUUID(),
    };

    const token = credentials?.apiKey || credentials?.accessToken;
    if (token) headers["Authorization"] = `Bearer ${token}`;

    if (stream) headers["Accept"] = "text/event-stream";
    return headers;
  }

  async execute(opts) {
    const result = await super.execute(opts);
    if (!result?.response?.ok || !result.response.body) return result;
    const checked = await inspectNdjsonResponse(result.response);
    result.response = checked.ok ? wrapNdjsonAsOpenAISse(checked, opts.model) : checked;
    return result;
  }
}

// Upstream reports request failures inside HTTP 200 streams. Inspect the prelude
// before committing success so account/combo fallback can see the actual status.
function parseEvent(line) {
  const trimmed = line.trim();
  try {
    return JSON.parse(trimmed.startsWith("data:") ? trimmed.slice(5).trim() : trimmed);
  } catch {
    return null;
  }
}

function normalizeError(event) {
  let detail = event.error ?? event.errorText ?? event.message ?? event;
  // AI SDK may put a serialized provider error in its error field.
  if (typeof detail === "string") {
    try { detail = JSON.parse(detail); } catch { /* Plain error message. */ }
  }
  if (detail?.error) {
    detail = detail.error;
    if (typeof detail === "string") {
      try { detail = JSON.parse(detail); } catch { /* Plain error message. */ }
    }
  }
  const candidate = Number(detail?.statusCode ?? detail?.status ?? event.statusCode ?? event.status);
  const status = Number.isInteger(candidate) && candidate >= 400 && candidate <= 599
    ? candidate : HTTP_STATUS.BAD_GATEWAY;
  const message = typeof detail === "string" ? detail
    : detail?.message ?? event.message ?? JSON.stringify(detail);
  return { ...(detail && typeof detail === "object" ? detail : {}), message, statusCode: status };
}

function isMeaningfulEvent(event) {
  return event?.type === "tool-input-start" || event?.type === "tool-call"
    || (event?.type === "text-delta" && Boolean(event.text || event.delta))
    || (event?.type === "reasoning-delta" && Boolean(event.text));
}

async function inspectNdjsonResponse(response) {
  const reader = response.body.getReader();
  const chunks = [];
  const decoder = new TextDecoder();
  let buffer = "";
  let ended = false;
  let failure = null;
  const inspect = (line) => {
    const event = parseEvent(line);
    if (event?.type === "error") {
      failure = normalizeError(event);
      return true;
    }
    return isMeaningfulEvent(event) || event?.type === "finish";
  };

  try {
    let ready = false;
    while (!ready && !ended) {
      const { value, done } = await reader.read();
      ended = done;
      if (done) {
        buffer += decoder.decode();
        inspect(buffer);
        break;
      }
      chunks.push(value);
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      for (const line of lines) {
        if (inspect(line)) {
          ready = true;
          break;
        }
      }
    }
  } catch (error) {
    try { await reader.cancel(error); } catch { /* Preserve the read failure. */ }
    reader.releaseLock();
    throw error;
  }

  if (failure) {
    try { await reader.cancel(failure); } catch { /* Error already captured. */ }
    reader.releaseLock();
    const headers = new Headers(response.headers);
    headers.set("Content-Type", "application/json");
    headers.delete("content-length");
    headers.delete("content-encoding");
    return new Response(JSON.stringify({ error: failure }), { status: failure.statusCode, headers });
  }

  let index = 0;
  if (ended) reader.releaseLock();
  const replay = new ReadableStream({
    async pull(controller) {
      if (index < chunks.length) {
        controller.enqueue(chunks[index++]);
        return;
      }
      if (ended) {
        controller.close();
        return;
      }
      try {
        const { value, done } = await reader.read();
        if (done) {
          ended = true;
          reader.releaseLock();
          controller.close();
        } else {
          controller.enqueue(value);
        }
      } catch (error) {
        ended = true;
        reader.releaseLock();
        controller.error(error);
      }
    },
    async cancel(reason) {
      if (!ended) {
        ended = true;
        try { await reader.cancel(reason); } finally { reader.releaseLock(); }
      }
    },
  });
  return new Response(replay, {
    status: response.status, statusText: response.statusText, headers: response.headers,
  });
}

function wrapNdjsonAsOpenAISse(originalResponse, model) {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = "";
  const state = { model };

  const emitChunks = (chunks, controller) => {
    if (!chunks) return;
    const list = Array.isArray(chunks) ? chunks : [chunks];
    for (const c of list) {
      if (c == null) continue;
      controller.enqueue(encoder.encode(`data: ${JSON.stringify(c)}\n\n`));
    }
  };

  const emitLine = (line, controller) => {
    const event = parseEvent(line);
    if (event?.type === "error") {
      const detail = normalizeError(event);
      const error = new Error(detail.message);
      error.status = detail.statusCode;
      controller.error(error);
      return false;
    }
    emitChunks(commandCodeToOpenAIResponse(line, state), controller);
    return true;
  };

  const transform = new TransformStream({
    transform(chunk, controller) {
      buffer += decoder.decode(chunk, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        // Translate AI SDK v5 NDJSON line to one or more OpenAI chunks
        if (!emitLine(trimmed, controller)) return;
      }
    },
    flush(controller) {
      const trimmed = (buffer + decoder.decode()).trim();
      if (trimmed) {
        if (!emitLine(trimmed, controller)) return;
      }
      controller.enqueue(encoder.encode(SSE_DONE));
    },
  });

  const newBody = originalResponse.body.pipeThrough(transform);
  return new Response(newBody, {
    status: originalResponse.status,
    statusText: originalResponse.statusText,
    headers: originalResponse.headers,
  });
}

export default CommandCodeExecutor;
