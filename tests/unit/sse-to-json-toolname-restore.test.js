import { describe, it, expect } from "vitest";
import { handleForcedSSEToJson } from "../../open-sse/handlers/chatCore/sseToJsonHandler.js";

function sseResponse(chunks) {
  const body = chunks.map(c => `data: ${JSON.stringify(c)}\n\n`).join("") + "data: [DONE]\n\n";
  return new Response(body, { headers: { "content-type": "text/event-stream" } });
}

const ALIAS = "a".repeat(47) + "_5500f726b1045738"; // 64-char upstream-safe alias
const ORIGINAL = "a".repeat(71); // the client's real tool name

describe("handleForcedSSEToJson tool-name restoration", () => {
  it("restores truncated tool names in the final chat.completion JSON", async () => {
    const toolNameMap = new Map([[ALIAS, ORIGINAL]]);
    const res = await handleForcedSSEToJson({
      providerResponse: sseResponse([
        { id: "1", created: 1, model: "m", choices: [{ index: 0, delta: { role: "assistant", tool_calls: [{ index: 0, id: "call_1", type: "function", function: { name: ALIAS, arguments: "{}" } }] }, finish_reason: null }] },
        { id: "1", created: 1, model: "m", choices: [{ index: 0, delta: {}, finish_reason: "tool_calls" }] },
      ]),
      sourceFormat: "openai",
      provider: "commandcode",
      model: "z-ai/glm-5.3-flashx",
      body: { messages: [] },
      stream: false,
      translatedBody: {},
      requestStartTime: Date.now(),
      connectionId: "test",
      apiKey: null,
      clientRawRequest: {},
      trackDone: () => {},
      appendLog: () => {},
      toolNameMap,
    });

    expect(res.success).toBe(true);
    const json = await res.response.json();
    const name = json.choices[0].message.tool_calls[0].function.name;
    expect(name).toBe(ORIGINAL);
    expect(name.length).toBe(71);
  });

  it("leaves names untouched when no map is provided", async () => {
    const res = await handleForcedSSEToJson({
      providerResponse: sseResponse([
        { id: "1", created: 1, model: "m", choices: [{ index: 0, delta: { content: "OK" }, finish_reason: "stop" }] },
      ]),
      sourceFormat: "openai",
      provider: "commandcode",
      model: "z-ai/glm-5.3-flashx",
      body: { messages: [] },
      stream: false,
      translatedBody: {},
      requestStartTime: Date.now(),
      connectionId: "test",
      apiKey: null,
      clientRawRequest: {},
      trackDone: () => {},
      appendLog: () => {},
    });

    const json = await res.response.json();
    expect(json.choices[0].message.content).toBe("OK");
  });
});
