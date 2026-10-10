import { describe, it, expect } from "vitest";
import { enforceToolsJsonBudget } from "../../open-sse/translator/concerns/toolSchema.js";

function makeTool(i, descLen, schemaProps) {
  const props = {};
  for (let p = 0; p < schemaProps; p++) props[`prop_${i}_${p}`] = { type: "string", description: "x".repeat(30) };
  return {
    type: "function",
    function: { name: `tool_${i}`, description: "d".repeat(descLen), parameters: { type: "object", properties: props } },
  };
}

describe("enforceToolsJsonBudget", () => {
  it("leaves under-budget tool lists untouched", () => {
    const body = { tools: [makeTool(0, 50, 2), makeTool(1, 50, 2)] };
    const before = JSON.stringify(body.tools);
    expect(enforceToolsJsonBudget(body, 1024 * 1024)).toBeNull();
    expect(JSON.stringify(body.tools)).toBe(before);
  });

  it("shrinks an over-budget list while keeping every tool name", () => {
    const tools = [];
    for (let i = 0; i < 40; i++) tools.push(makeTool(i, 400, 40));
    const body = { tools };
    const namesBefore = tools.map(t => t.function.name);
    const summary = enforceToolsJsonBudget(body, 20 * 1024);
    expect(summary).toBeTruthy();
    expect(body.tools.map(t => t.function.name)).toEqual(namesBefore);
    const size = JSON.stringify(body.tools).length;
    expect(size).toBeLessThanOrEqual(20 * 1024 + 512); // budget + one tool of slack
  });

  it("works on commandcode-shaped tools (params envelope, input_schema)", () => {
    const tools = [];
    for (let i = 0; i < 30; i++) {
      tools.push({ name: `t_${i}`, description: "d".repeat(500), input_schema: { type: "object", properties: { a: { type: "string" } } } });
    }
    const body = { params: { tools } };
    const summary = enforceToolsJsonBudget(body, 8 * 1024);
    expect(summary).toBeTruthy();
    expect(JSON.stringify(body.params.tools).length).toBeLessThanOrEqual(8 * 1024 + 512);
    expect(body.params.tools.every(t => typeof t.name === "string" && t.name)).toBe(true);
  });
});
