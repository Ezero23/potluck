import { describe, it, expect } from "vitest";
import { sanitizeToolSchemas } from "../../open-sse/translator/concerns/toolSchema.js";

describe("sanitizeToolSchemas", () => {
  it("removes schema keywords set to empty strings (openai shape)", () => {
    const body = {
      tools: [{
        type: "function",
        function: {
          name: "t1",
          parameters: { type: "object", properties: { list: { type: "array", items: "" } } },
        },
      }],
    };
    sanitizeToolSchemas(body);
    expect(body.tools[0].function.parameters.properties.list.items).toBeUndefined();
  });

  it("filters non-object entries out of anyOf arrays", () => {
    const body = {
      tools: [{
        name: "t2",
        input_schema: {
          type: "object",
          properties: {
            x: { anyOf: ["", { type: "string" }, null] },
          },
        },
      }],
    };
    sanitizeToolSchemas(body);
    expect(body.tools[0].input_schema.properties.x.anyOf).toEqual([{ type: "string" }]);
  });

  it("replaces a wholly-corrupted schema with a permissive object schema", () => {
    const body = { tools: [{ type: "function", function: { name: "t3", parameters: "" } }] };
    sanitizeToolSchemas(body);
    expect(body.tools[0].function.parameters).toEqual({ type: "object" });
  });

  it("drops property entries that are not schema objects", () => {
    const body = {
      params: {
        tools: [{ name: "t4", input_schema: { type: "object", properties: { good: { type: "number" }, bad: "" } } }],
      },
    };
    sanitizeToolSchemas(body);
    const props = body.params.tools[0].input_schema.properties;
    expect(props.good).toEqual({ type: "number" });
    expect(props.bad).toBeUndefined();
  });

  it("never touches value-bearing keywords like enum/const/default", () => {
    const schema = {
      type: "object",
      properties: {
        mode: { type: "string", enum: ["", "fast", "slow"], default: "" },
        count: { type: "number", const: 0 },
      },
      additionalProperties: false,
      examples: ["", 1, null],
    };
    const body = { tools: [{ type: "function", function: { name: "t5", parameters: schema } }] };
    sanitizeToolSchemas(body);
    const p = body.tools[0].function.parameters;
    expect(p.properties.mode.enum).toEqual(["", "fast", "slow"]);
    expect(p.properties.mode.default).toBe("");
    expect(p.properties.count.const).toBe(0);
    expect(p.additionalProperties).toBe(false);
    expect(p.examples).toEqual(["", 1, null]);
  });

  it("keeps valid nested schemas intact", () => {
    const schema = {
      type: "object",
      properties: {
        inner: {
          type: "object",
          properties: { deep: { type: "array", items: { type: "string" } } },
          additionalProperties: { type: "string" },
        },
      },
    };
    const body = { tools: [{ type: "function", function: { name: "t6", parameters: schema } }] };
    sanitizeToolSchemas(body);
    expect(body.tools[0].function.parameters).toEqual(schema);
  });
});

describe("type:\"\" sanitization", () => {
  it("removes empty-string type values that fail strict validators", () => {
    const body = {
      tools: [{
        type: "function",
        function: {
          name: "t7",
          parameters: { type: "object", properties: { a: { type: "" }, b: { type: "string" } } },
        },
      }],
    };
    sanitizeToolSchemas(body);
    const props = body.tools[0].function.parameters.properties;
    expect(props.a.type).toBeUndefined();
    expect(props.b.type).toBe("string");
  });

  it("keeps valid types and type arrays", () => {
    const schema = { type: "object", properties: { x: { type: ["string", "null"] }, y: { type: "integer" } } };
    const body = { tools: [{ name: "t8", input_schema: schema }] };
    sanitizeToolSchemas(body);
    expect(body.tools[0].input_schema).toEqual(schema);
  });
});
