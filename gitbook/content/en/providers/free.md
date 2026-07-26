# No-cost and promotional provider access

Some third-party providers may offer trials, promotional quotas, subscription-included
usage, or access that currently has no direct per-request charge. Potluck can connect
to supported services, but it does not provide or control those benefits.

## No permanent free-tier promise

Do not assume that a provider, model, quota, or authentication path is permanently
free or unlimited. Third parties can change:

- account eligibility and regional availability;
- acceptable-use and automation policies;
- model names and capabilities;
- daily, monthly, rolling, or concurrency limits;
- promotional periods and subscription entitlements;
- pricing, priority, and rate limits;
- OAuth, device-code, and API behavior.

The Potluck dashboard may show usage and estimated cost, but those values are not an
invoice and may not include every provider-specific rule. Check the provider's current
terms, account portal, and billing page before sending significant traffic.

## Connecting an eligible account

1. Open **Dashboard → Providers**.
2. Select a provider that you are authorized to use.
3. Complete the API-key, OAuth, or device-code flow shown by Potluck.
4. Confirm the connection status.
5. Use the dashboard model selector or query `/v1/models`.
6. Send a small, non-sensitive test request.
7. Check the provider's own usage or billing page.

The exact provider list and model identifiers can vary by Potluck version and by the
connected account. Avoid copying model IDs from old documentation:

```bash
curl http://localhost:20127/v1/models \
  -H "Authorization: Bearer YOUR_POTLUCK_API_KEY"
```

## Using these sources in routing

A no-cost or promotional source can be added to a combo or routing profile in the same
way as another eligible source. Before doing so:

- verify that the source works by itself;
- confirm that its model is suitable for the request type;
- decide which failures should allow fallback;
- avoid assuming that two similarly named models have identical behavior;
- monitor provider-side quota and billing after deployment.

Fallback can improve availability, but it cannot create quota, bypass provider limits,
or guarantee that a request succeeds.

## Operational cautions

### Terms and account safety

Use only accounts and credentials you are authorized to use. Potluck does not make an
otherwise prohibited use acceptable. Aggressive automation may trigger throttling,
credential revocation, or account suspension under a provider's rules.

### Privacy

Requests are sent to the selected third-party provider. Review its data handling terms
before sending source code, personal data, credentials, or confidential material.
Disable request-body logging unless you need it for debugging, and protect Potluck's
data directory and backups.

### Reliability

Promotional and no-cost access can have lower priority, smaller limits, model changes,
or interruptions. Use it for workloads whose reliability requirements match those
conditions. For important workloads, configure multiple independently tested sources
and keep a direct recovery path.

### Cost

“No charge observed” is not the same as “guaranteed free.” A provider can begin
charging, move usage outside a subscription allowance, or bill for input, output,
caching, tools, images, or other features differently. Set provider-side spending
limits and alerts where available.

## Troubleshooting

### Authorization fails

- Complete the flow in the same browser session.
- Verify that the account and region are eligible.
- Check that system time and network access are correct.
- Remove the failed connection and retry once.
- Consult the provider's current status and authorization documentation.

### A documented model is missing

- Refresh the provider connection and model list.
- Query `/v1/models`.
- Check whether the model is available to that specific account.
- Use the identifier returned by the current instance instead of an old example.

### Requests are throttled or rejected

- Inspect the response status and Potluck usage logs.
- Check the provider's own quota and billing dashboard.
- Reduce concurrency or request rate.
- Route to another independently verified source when its terms allow it.

## Related guides

- [Subscription providers](./subscription.md)
- [Lower-cost providers](./cheap.md)
- [Combos](../features/combos.md)
- [Quota tracking](../features/quota-tracking.md)
- [Troubleshooting](../troubleshooting.md)
