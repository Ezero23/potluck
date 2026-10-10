import { describe, it, expect } from "vitest";
import "../translator/registerAll.js";
import { normalizeToolNames, restoreToolNames } from "../../open-sse/translator/concerns/toolNames.js";
import { translateRequest, translateResponse, initState } from "../../open-sse/translator/index.js";
import { FORMATS } from "../../open-sse/translator/formats.js";

const longName = `mcp__${"a".repeat(61)}`;
const tool = (name) => ({ type: "function", function: { name, parameters: { type: "object" } } });

describe("tool names across the gateway", () => {
  it("aliases declarations, forced choice, history and results consistently without touching arguments", () => {
    const body = {
      tools: [tool(longName), tool(`${longName}b`), tool("Read")],
      tool_choice: { type: "function", function: { name: longName } },
      messages: [
        { role: "assistant", tool_calls: [{ id: "call_1", type: "function", function: { name: longName, arguments: JSON.stringify({ name: longName }) } }] },
        { role: "tool", tool_call_id: "call_1", name: longName, content: "ok" },
      ],
    };
    const result = normalizeToolNames(body);
    const alias = result.tools[0].function.name;
    expect(alias).toHaveLength(64);
    expect(result.tools[1].function.name).not.toBe(alias);
    expect(result.tools[2].function.name).toBe("Read");
    expect(result.tool_choice.function.name).toBe(alias);
    expect(result.messages[0].tool_calls[0].function.name).toBe(alias);
    expect(result.messages[1].name).toBe(alias);
    expect(result.messages[0].tool_calls[0].function.arguments).toBe(body.messages[0].tool_calls[0].function.arguments);
    expect(body.tools[0].function.name).toBe(longName);
    expect(normalizeToolNames(body).tools[0].function.name).toBe(alias);
    const restored = restoreToolNames(result, result._toolNameMap);
    expect(restored.tools).toEqual(body.tools);
    expect(restored.messages).toEqual(body.messages);
  });

  it("avoids collisions with existing short names and preserves exactly64 names", () => {
    const alias = normalizeToolNames({ tools: [tool(longName)] }).tools[0].function.name;
    const result = normalizeToolNames({ tools: [tool(longName), tool(alias)] });
    expect(result.tools[0].function.name).not.toBe(alias);
    expect(result.tools[1].function.name).toBe(alias);
  });

  it.each([FORMATS.OPENAI, FORMATS.CLAUDE, FORMATS.COMMANDCODE])("normalizes the actual translated %s request", (target) => {
    const request = translateRequest(FORMATS.OPENAI, target, "m", {
      tools: [tool(longName)], messages: [{ role: "user", content: "hi" }],
    }, true, null, target);
    const tools = (request.params || request).tools;
    expect(tools[0].function?.name || tools[0].name).toHaveLength(64);
    expect(request._toolNameMap.get(tools[0].function?.name || tools[0].name)).toBe(longName);
  });

  it.each([FORMATS.OPENAI, FORMATS.CLAUDE])("restores streamed tool calls for %s clients", (source) => {
    const request = normalizeToolNames({ tools: [tool(longName)] });
    const alias = request.tools[0].function.name;
    const state = { ...initState(source), toolNameMap: request._toolNameMap };
    const chunks = translateResponse(FORMATS.OPENAI, source, {
      id: "chatcmpl-1", object: "chat.completion.chunk", choices: [{ index: 0, delta: {
        tool_calls: [{ index: 0, id: "call_1", type: "function", function: { name: alias, arguments: "" } }],
      }, finish_reason: null }],
    }, state);
    expect(JSON.stringify(chunks)).toContain(longName);
  });

  it("preserves Claude cloaking mappings and never edits a tool input named name", () => {
    const input = { name: longName, function: { name: longName } };
    const request = normalizeToolNames({
      tools: [{ name: `${longName}_cc`, input_schema: { type: "object" } }],
      _toolNameMap: new Map([[`${longName}_cc`, longName]]),
      messages: [{ role: "assistant", content: [{ type: "tool_use", name: `${longName}_cc`, input }] }],
    });
    const response = restoreToolNames({ content: [{ type: "tool_use", name: request.tools[0].name, input }] }, request._toolNameMap);
    expect(response.content[0].name).toBe(longName);
    expect(response.content[0].input).toEqual(input);
  });
});
