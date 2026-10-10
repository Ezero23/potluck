// Strip request params a given provider/model rejects upstream (e.g. HTTP 400).
// Config-driven: add a rule instead of scattering `delete body.x` across executors.

import { enforceToolsJsonBudget } from "./toolSchema.js";

// z.ai coding endpoints reject tools payloads over ~115KB (observed 111KB OK /
// 119KB 400) with a generic 1210 — budget stays comfortably below.
const GLM_TOOLS_BUDGET_BYTES = 96 * 1024;

// Each rule: optional provider, regex match on model, list of params to drop.
// A param is removed only when it is present (!== undefined).
const STRIP_RULES = [
  // claude-opus-4 series: temperature is deprecated (Anthropic 400). #1748
  { match: /claude-opus-4/i, drop: ["temperature"] },
  // GitHub Copilot gpt-5.4: temperature unsupported.
  { provider: "github", match: /gpt-5\.4/i, drop: ["temperature"] },
  // GitHub Copilot Claude (except opus/sonnet 4.6): thinking + reasoning_effort rejected. #713
  { provider: "github", match: (m) => /claude/i.test(m) && !/claude.*(opus|sonnet).*4\.6/i.test(m), drop: ["thinking", "reasoning_effort"] },
  // Cloudflare Workers AI: content must be plain string, rejects OpenAI content-part array (#1926)
  { provider: "cloudflare-ai", flattenContent: true },
  // z.ai / bigmodel coding endpoints reject OpenAI `metadata` (GLM 1210 "Invalid API parameter")
  // and tools payloads over ~115KB — trim instead of failing the whole request.
  { provider: "glm", drop: ["metadata"], trimToolsBytes: GLM_TOOLS_BUDGET_BYTES },
  { provider: "glm-cn", drop: ["metadata"], trimToolsBytes: GLM_TOOLS_BUDGET_BYTES },
  // GLM 5.x always thinks: `reasoning_effort: none/minimal` and `thinking: disabled`
  // both fail with 1210 "This model always engages in thinking … use low, high, or max".
  // Coerce to the cheapest documented level instead of dropping the intent.
  { provider: "glm", match: /^glm-5/, coerce: coerceGlmThinking },
  { provider: "glm-cn", match: /^glm-5/, coerce: coerceGlmThinking },
];

function coerceGlmThinking(body) {
  if (body.reasoning_effort === "none" || body.reasoning_effort === "minimal") {
    body.reasoning_effort = "low";
  }
  if (body.thinking?.type === "disabled") {
    delete body.thinking;
  }
  return body;
}

// Test a rule's match (regex or predicate) against the model id.
function matches(rule, model) {
  if (!rule.match) return true;
  return typeof rule.match === "function" ? rule.match(model) : rule.match.test(model);
}

// Remove unsupported params from body in place; returns body.
export function stripUnsupportedParams(provider, model, body) {
  if (!model || !body || typeof body !== "object") return body;
  for (const rule of STRIP_RULES) {
    if (rule.provider && rule.provider !== provider) continue;
    if (!matches(rule, model)) continue;
    for (const key of rule.drop || []) {
      if (body[key] !== undefined) delete body[key];
    }
    if (rule.coerce) rule.coerce(body);
    if (rule.trimToolsBytes) {
      const summary = enforceToolsJsonBudget(body, rule.trimToolsBytes);
      if (summary) console.warn(`[paramSupport] ${provider}/${model}: ${summary}`);
    }
    // CF Workers AI oneOf root schema only accepts content as plain string (#1926)
    if (rule.flattenContent && Array.isArray(body.messages)) {
      for (const msg of body.messages) {
        if (msg && Array.isArray(msg.content)) {
          msg.content = msg.content
            .map(b => (b?.type === "text" && typeof b.text === "string") ? b.text : "")
            .join("");
        }
      }
    }
  }
  return body;
}
