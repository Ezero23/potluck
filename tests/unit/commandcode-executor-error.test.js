import { afterEach, describe, expect, it, vi } from "vitest";
import { BaseExecutor } from "../../open-sse/executors/base.js";
import { CommandCodeExecutor } from "../../open-sse/executors/commandcode.js";

const encoder = new TextEncoder();
const line = (event) => `${JSON.stringify(event)}\n`;

function upstream(parts, options = {}) {
  let index = 0;
  const cancel = vi.fn();
  const body = new ReadableStream({
    pull(controller) {
      if (index < parts.length) {
        const part = parts[index++];
        controller.enqueue(typeof part === "string" ? encoder.encode(part) : part);
      } else if (!options.keepOpen) {
        controller.close();
      }
    },
    cancel,
  });
  return {
    response: new Response(body, { status: options.status || 200,
      headers: { "content-type": "application/x-ndjson", "x-upstream": "preserved" } }),
    cancel,
  };
}

async function execute(response) {
  vi.spyOn(BaseExecutor.prototype, "execute").mockResolvedValue({ response, url: "upstream", transformedBody: {} });
  return new CommandCodeExecutor().execute({ model: "glm5.3" });
}

afterEach(() => vi.restoreAllMocks());

describe("CommandCode executor stream error handling", () => {
  it("turns a split serialized prelude error into HTTP 400 and cancels upstream", async () => {
    const detail = { type: "server_error", message: "`name` must be at most 64 characters, got 66",
      statusCode: 400, isRetryable: false };
    const errorLine = line({ type: "error", error: JSON.stringify(detail) });
    const source = upstream([line({ type: "start" }), line({ type: "text-start", id: "x" }),
      errorLine.slice(0, 27), errorLine.slice(27)], { keepOpen: true });
    const result = await execute(source.response);
    expect(result.response.status).toBe(400);
    expect(result.response.ok).toBe(false);
    expect(await result.response.json()).toEqual({ error: detail });
    expect(result.response.headers.get("x-upstream")).toBe("preserved");
    expect(result.response.headers.get("content-type")).toBe("application/json");
    expect(source.cancel).toHaveBeenCalledOnce();
    expect(source.response.body.locked).toBe(false);
  });

  it("handles object errorText without a terminal newline and defaults unknown status to 502", async () => {
    const source = upstream([JSON.stringify({ type: "error", errorText: { message: "Invalid API parameter" } })]);
    const result = await execute(source.response);
    expect(result.response.status).toBe(502);
    expect((await result.response.json()).error.message).toBe("Invalid API parameter");
    expect(source.response.body.locked).toBe(false);
  });

  it("does not treat empty text deltas as success before an error", async () => {
    const source = upstream([line({ type: "text-delta", text: "" }) +
      line({ type: "error", error: { message: "limited", statusCode: 429 } })]);
    const result = await execute(source.response);
    expect(result.response.status).toBe(429);
  });

  it("replays all pre-read bytes including multibyte text and remaining events in the same chunk", async () => {
    const bytes = encoder.encode(line({ type: "start" }) + line({ type: "text-delta", text: "你好" }) +
      line({ type: "text-delta", text: "world" }) + line({ type: "finish", totalUsage: { inputTokens: 2, outputTokens: 3 } }));
    const split = bytes.indexOf(0xe4) + 1;
    const source = upstream([bytes.slice(0, split), bytes.slice(split)], { status: 201 });
    const result = await execute(source.response);
    expect(result.response.status).toBe(201);
    expect(result.response.headers.get("x-upstream")).toBe("preserved");
    const text = await result.response.text();
    const events = text.split("\n\n").filter((part) => part.startsWith("data: {")).map((part) => JSON.parse(part.slice(6)));
    expect(events.map((event) => event.choices[0].delta.content).filter(Boolean)).toEqual(["你好", "world"]);
    expect(events.at(-1).choices[0].finish_reason).toBe("stop");
    expect(text.match(/data: \[DONE\]/g)).toHaveLength(1);
    expect(source.response.body.locked).toBe(false);
  });

  it.each([
    { type: "reasoning-delta", text: "thinking" },
    { type: "tool-input-start", id: "call", toolName: "Read" },
    { type: "tool-call", toolCallId: "call", toolName: "Read", input: {} },
    { type: "finish" },
  ])("commits on $type without waiting for stream closure", async (event) => {
    const source = upstream([line({ type: "start" }) + line(event)], { keepOpen: true });
    const result = await execute(source.response);
    expect(result.response.ok).toBe(true);
    await result.response.body.cancel();
    // pipeThrough forwards cancellation asynchronously.
    await vi.waitFor(() => expect(source.cancel).toHaveBeenCalledOnce());
    expect(source.response.body.locked).toBe(false);
  });

  it("fails the stream on errors after output instead of emitting assistant error text or DONE", async () => {
    const source = upstream([line({ type: "text-delta", text: "partial" }),
      line({ type: "error", error: { message: "generation failed", statusCode: 503 } })]);
    const result = await execute(source.response);
    const reader = result.response.body.getReader();
    expect(new TextDecoder().decode((await reader.read()).value)).toContain("partial");
    await expect(reader.read()).rejects.toMatchObject({ message: "generation failed", status: 503 });
    await vi.waitFor(() => expect(source.response.body.locked).toBe(false));
  });

  it("preserves ordinary upstream HTTP failures without reading or wrapping them", async () => {
    const response = new Response("bad request", { status: 400 });
    const result = await execute(response);
    expect(result.response).toBe(response);
    expect(await result.response.text()).toBe("bad request");
  });
});
