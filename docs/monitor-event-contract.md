# Potluck → Monitor Event Contract

## Boundary

Potluck Web is the only component that owns credentials, quota probes, request execution and routing decisions. Potluck Monitor receives sanitized snapshots and events for display and diagnosis; it never receives upstream secrets and never executes routing.

## Envelope

The gateway may include a top-level `monitor` object in the existing `/api/ingest` payload:

```json
{
  "monitor": {
    "schemaVersion": 1,
    "generatedAt": "2026-08-22T00:00:00.000Z",
    "health": {
      "providers": 2,
      "connections": 3,
      "healthyConnections": 2,
      "staleConnections": 1,
      "unauthorizedConnections": 0,
      "rateLimitedConnections": 0,
      "unavailableConnections": 0
    },
    "events": [],
    "capabilities": []
  }
}
```

Unknown fields are ignored. Monitor keeps the latest safe health envelope and a bounded event history. Event IDs are used to make retries idempotent.

## Event types

`quota_attempt` records a quota read attempt and its normalized status. `health_event` records a Connection health transition. `routing_attempt` records the sanitized candidate chain for a routing-profile request, including selected candidate, skipped candidates, fallback count and final result.

Allowed status values are `success`, `error`, `skipped`, `selected`, `fresh`, `stale`, `unsupported`, `unauthorized`, `rateLimited` and `unavailable`.

## Correlation fields

`requestId` correlates one gateway request. `attemptId` is reserved for a future per-upstream-attempt identifier. `connectionKey` is an opaque Potluck-owned identifier. `provider`, `model`, `selectedProvider`, `selectedModel`, `reasonCode`, `occurredAt`, `retryAt`, `latencyMs`, `httpStatus` and `fallbackCount` are safe diagnostic fields.

## Privacy rules

The envelope MUST NOT contain API keys, OAuth tokens, cookies, authorization headers, provider raw responses, prompt text, model responses, proxy URLs, passwords or raw exception stacks. Human-readable reasons are normalized and truncated; URLs and secret-like values are discarded.

## Delivery rules

Potluck retains unsent events in a bounded in-memory buffer. A push acknowledges event IDs only after the Monitor returns a successful response. Failed pushes leave events pending for the next retry. Monitor deduplicates by event ID and keeps the newest bounded history.
