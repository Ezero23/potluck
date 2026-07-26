# Quota and usage

Potluck exposes two related views:

- **Quota** asks supported providers for account-limit information.
- **Usage** summarizes requests recorded by the local Potluck instance.

They are useful operational signals, but neither view is a substitute for the
provider's own usage and billing portal.

## Provider quota

Open `http://localhost:20127/dashboard/quota` when using the development server.
Potluck requests quota information for connected accounts whose provider integration
implements a usage adapter.

Depending on the provider response, a card may show:

- one or more quota windows;
- used, total, or remaining values;
- a reset or expiry time;
- a provider message or authorization error;
- account and connection status.

Support is provider-specific. Some API-key providers do not expose quota data, and
third-party responses can change without notice. A missing card, zero, or unknown
value does not prove that an account has no quota or no billable usage.

Quota results are cached in the browser for convenience. Refresh the provider data
before making an important capacity decision.

## Local usage

Open `http://localhost:20127/dashboard/usage`. The Overview supports these periods:

- Today
- 24 hours
- 7 days
- 30 days
- 60 days

The page aggregates locally recorded request count, input tokens, output tokens,
cached tokens, and estimated cost. Breakdowns can include provider, model, connection,
API key, and endpoint where the recorded data contains those fields.

The Details view can inspect individual stored request records and filter them by
provider, status, model, and time. Request-detail retention and content depend on the
instance's logging settings.

## Cost estimates

Potluck calculates cost from recorded token fields and the pricing configured for the
provider/model pair. An estimate can be zero or incomplete when:

- a provider does not return usage fields;
- the model has no current local pricing entry;
- cached, reasoning, media, or tool usage is billed differently;
- the provider changes prices;
- a subscription or credit is applied outside Potluck;
- a request fails before usage is recorded.

Use the estimate to compare local traffic patterns, not to reconcile invoices. Check
the provider's billing page for actual charges and configure provider-side spending
limits where available.

## Internal dashboard APIs

The dashboard currently uses endpoints including:

```text
GET /api/usage/{connectionId}
GET /api/usage/stats?period=7d
GET /api/usage/chart?period=7d
GET /api/usage/request-details
GET /api/usage/providers
```

These are Potluck dashboard APIs, not part of the OpenAI-compatible `/v1` client
contract. Their response shapes can evolve with the dashboard and may require the
dashboard authentication cookie. Avoid building external integrations against them
without pinning and testing a Potluck version.

There is no generic `/api/quota` endpoint and no `/api/usage?period=...` endpoint in the
current application.

## What Potluck does not currently promise

The current dashboard does not provide the alerting and budget system described by
older documentation. In particular, do not rely on Potluck for:

- email or webhook quota alerts;
- anomaly-detection alerts;
- monthly PDF-style reports;
- forecasted spending;
- enforcement of daily or monthly budgets;
- automatic switching to a no-cost provider after a spending threshold;
- universal, real-time quota tracking for every provider.

Use provider-side alerts and spending controls for financial safeguards.

## Data and privacy

Usage history is stored in Potluck's local SQLite database under `DATA_DIR`. Request
details, API-key labels, prompts, translated provider payloads, or responses may be
sensitive depending on enabled logging.

- Protect `DATA_DIR` and its backups.
- Do not publish database files or request logs.
- Disable request-body logging unless it is needed.
- Use short retention for sensitive debugging data.
- Restrict dashboard access before exposing Potluck to a network.

## Troubleshooting

### Quota cannot be loaded

- Confirm that the connection is active.
- Reconnect expired OAuth credentials.
- Check whether that provider integration supports usage lookup.
- Check provider status and account eligibility.
- Retry after any provider-side rate limit.

### Token totals appear incomplete

- Confirm that the provider returned token usage.
- Check that requests passed through this Potluck instance.
- Select the correct time period.
- Inspect individual request details.

### Estimated cost looks wrong

- Open the dashboard pricing settings.
- Verify the exact provider/model entry.
- Compare input, output, cache, and other billable categories with the provider.
- Treat the provider invoice as authoritative.

## Related guides

- [Model combos](./combos.md)
- [Quick start](../getting-started/quick-start.md)
- [Troubleshooting](../troubleshooting.md)
