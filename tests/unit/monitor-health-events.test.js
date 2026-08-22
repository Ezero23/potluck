import { describe, expect, it, beforeEach } from "vitest";

import {
  acknowledgeMonitorEvents,
  buildHealthSummary,
  buildMonitorEnvelope,
  normalizeMonitorEvent,
  peekMonitorEvents,
  recordMonitorEvent,
  resetMonitorEventsForTests,
} from "../../src/lib/monitor/healthEvents.js";

describe("monitor health events", () => {
  beforeEach(() => resetMonitorEventsForTests());

  it("normalizes routing events without carrying secrets or raw URLs", () => {
    const event = normalizeMonitorEvent({
      type: "routing_attempt",
      requestId: "req-1",
      status: "success",
      reason: "https://provider.example/secret?token=abc",
      selectedProvider: "anthropic",
      selectedModel: "claude-sonnet",
      candidates: [
        { provider: "openai", model: "gpt-5", status: "skipped", reason: "quota exhausted", reasonCode: "quota_exhausted" },
      ],
    });

    expect(event).toMatchObject({
      type: "routing_attempt",
      requestId: "req-1",
      selectedProvider: "anthropic",
      selectedModel: "claude-sonnet",
      candidates: [{ reason: "quota exhausted", reasonCode: "quota_exhausted" }],
    });
    expect(event.reason).toBeUndefined();
    expect(JSON.stringify(event)).not.toMatch(/https:\/\/|token=|secret/i);
  });

  it("keeps events until a successful push acknowledges their ids", () => {
    const first = recordMonitorEvent({ type: "quota_attempt", provider: "claude", status: "fresh" });
    const second = recordMonitorEvent({ type: "health_event", provider: "claude", status: "stale" });
    expect(peekMonitorEvents()).toHaveLength(2);

    acknowledgeMonitorEvents([first.id]);
    expect(peekMonitorEvents().map((event) => event.id)).toEqual([second.id]);
  });

  it("builds a three-layer health summary from provider rows", () => {
    const summary = buildHealthSummary({ providers: [
      { provider: "claude", connectionStatus: "ok", quotaStatus: "fresh" },
      { provider: "claude", connectionStatus: "unauthorized", quotaStatus: "unauthorized" },
      { provider: "openai", connectionStatus: "ok", quotaStatus: "stale" },
    ] });

    expect(summary).toMatchObject({
      connections: 3,
      healthyConnections: 2,
      staleConnections: 1,
      unauthorizedConnections: 1,
    });
  });

  it("includes capability registry and pending events in the envelope", () => {
    recordMonitorEvent({ type: "health_event", provider: "claude", status: "stale" });
    const envelope = buildMonitorEnvelope({ providers: [{ provider: "claude" }] });
    expect(envelope.schemaVersion).toBe(1);
    expect(envelope.events).toHaveLength(1);
    expect(envelope.capabilities.some((entry) => entry.provider === "claude")).toBe(true);
  });
});
