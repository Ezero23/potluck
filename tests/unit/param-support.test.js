import { describe, it, expect } from "vitest";

import { stripUnsupportedParams } from "../../open-sse/translator/concerns/paramSupport.js";

describe("stripUnsupportedParams", () => {
  it("flattens Cloudflare AI OpenAI content-part arrays", () => {
    const body = {
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "hello " },
            { type: "image_url", image_url: { url: "data:image/png;base64,xx" } },
            { type: "text", text: "world" },
          ],
        },
      ],
    };

    expect(() => stripUnsupportedParams("cloudflare-ai", "@cf/meta/llama-3.1-8b-instruct", body)).not.toThrow();
    expect(body.messages[0].content).toBe("hello world");
  });

  it("still drops unsupported GitHub model params", () => {
    const body = { temperature: 0.7, top_p: 1 };

    stripUnsupportedParams("github", "gpt-5.4", body);

    expect(body).toEqual({ top_p: 1 });
  });

  it("drops metadata for glm and glm-cn coding endpoints", () => {
    for (const provider of ["glm", "glm-cn"]) {
      const body = { metadata: { user_id: "u1" }, messages: [] };
      stripUnsupportedParams(provider, "glm-5.3", body);
      expect(body.metadata).toBeUndefined();
    }
  });

  it("keeps metadata for providers other than glm", () => {
    const body = { metadata: { user_id: "u1" } };
    stripUnsupportedParams("openai", "gpt-5.4", body);
    expect(body.metadata).toEqual({ user_id: "u1" });
  });

  it("coerces disabled thinking on always-thinking glm-5.x models", () => {
    const body = { reasoning_effort: "none", thinking: { type: "disabled" } };
    stripUnsupportedParams("glm", "glm-5.3-flash", body);
    expect(body.reasoning_effort).toBe("low");
    expect(body.thinking).toBeUndefined();

    const cn = { reasoning_effort: "minimal" };
    stripUnsupportedParams("glm-cn", "glm-5.3", cn);
    expect(cn.reasoning_effort).toBe("low");
  });

  it("leaves explicit effort levels untouched on glm-5.x", () => {
    const body = { reasoning_effort: "high" };
    stripUnsupportedParams("glm", "glm-5.3", body);
    expect(body.reasoning_effort).toBe("high");
  });

  it("does not coerce thinking on pre-5 glm models", () => {
    const body = { reasoning_effort: "none" };
    stripUnsupportedParams("glm", "glm-4.6v", body);
    expect(body.reasoning_effort).toBe("none");
  });
});
