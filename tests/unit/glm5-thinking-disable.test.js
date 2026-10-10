import { describe, it, expect } from "vitest";
import { applyThinking } from "../../open-sse/translator/concerns/thinkingUnified.js";
import { getCapabilitiesForModel } from "../../open-sse/providers/capabilities.js";

describe("GLM 5.x always-thinking clamp", () => {
  it("marks glm-5.x models as unable to disable thinking", () => {
    for (const model of ["glm-5.3", "glm-5.3-flash", "glm-5.2", "glm-5.1"]) {
      const caps = getCapabilitiesForModel("glm", model);
      expect(caps.thinkingCanDisable, `${model} should be thinkingCanDisable:false`).toBe(false);
    }
    // glm-4.x stays disengageable
    expect(getCapabilitiesForModel("glm", "glm-4.7").thinkingCanDisable).not.toBe(false);
  });

  it("does not emit enable_thinking:false for glm-5.x on disable intent", () => {
    const body = { messages: [], reasoning_effort: "none" };
    applyThinking("openai", "glm-5.3", body, "glm");
    expect(body.enable_thinking).toBeUndefined();
    expect(body.reasoning_effort).toBeUndefined();
  });

  it("does not emit enable_thinking:false when the client sends it directly", () => {
    const body = { messages: [], enable_thinking: false };
    applyThinking("openai", "glm-5.3-flash", body, "glm");
    expect(body.enable_thinking).toBeUndefined();
    expect(body.thinking).toEqual({ type: "enabled" });
  });

  it("keeps enable_thinking:false for glm-4.x where disabling is allowed", () => {
    const body = { messages: [], reasoning_effort: "none" };
    applyThinking("openai", "glm-4.7", body, "glm");
    expect(body.enable_thinking).toBe(false);
  });
});
