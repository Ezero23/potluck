import { describe, expect, it } from "vitest";
import { RoutingTrace } from "../../open-sse/routing/trace.js";

describe("RoutingTrace monitor projection", () => {
  it("keeps routing headers stable while exposing a safe event projection", () => {
    const trace = new RoutingTrace("code", "req-123");
    trace.recordSkipped("openai", "gpt-5", "quota exhausted", "quota_exhausted");
    trace.recordSelected("anthropic", "claude-sonnet");
    trace.recordOutcome("anthropic", "claude-sonnet", 200, 42, null);

    expect(trace.toHeaders()).toMatchObject({
      "X-Routing-Chain": "anthropic/claude-sonnet:sel → anthropic/claude-sonnet:200",
      "X-Selected-Provider": "anthropic/claude-sonnet",
      "X-Routing-Profile": "code",
    });
    expect(trace.toMonitorEvent({ final: true, status: "success" })).toMatchObject({
      type: "routing_attempt",
      requestId: "req-123",
      profile: "code",
      status: "success",
      selectedProvider: "anthropic",
      fallbackCount: 0,
      candidates: [
        { provider: "openai", status: "skipped", reasonCode: "quota_exhausted" },
        { provider: "anthropic", status: "selected" },
        { provider: "anthropic", status: "success", httpStatus: 200, latencyMs: 42 },
      ],
    });
  });
});
