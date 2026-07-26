# API-Key Providers

Potluck can route requests to several providers that authenticate with an API
key. Some may be less expensive than other options for a particular model or
region, but Potluck does not sell provider access and cannot guarantee pricing,
quota, availability, or model capabilities.

Always check the provider's current terms before sending production traffic.

---

## Supported provider entries

The current registry includes these related entries:

| Potluck provider | Region or endpoint | Example registered models |
|---|---|---|
| `glm` | GLM international coding endpoint | `glm-5.2`, `glm-5.1`, `glm-5`, `glm-4.7`, `glm-4.6v` |
| `glm-cn` | GLM China coding endpoint | `glm-5.2`, `glm-5.1`, `glm-5`, `glm-4.7`, `glm-4.6`, `glm-4.5-air` |
| `minimax` | MiniMax international endpoint | `MiniMax-M3`, `MiniMax-M2.7`, `MiniMax-M2.5`, `MiniMax-M2.1` |
| `minimax-cn` | MiniMax China endpoint | `MiniMax-M3`, `MiniMax-M2.7`, `MiniMax-M2.5`, `MiniMax-M2.1` |
| `kimi` | Kimi coding endpoint | `kimi-k2.6`, `kimi-k2.5`, `kimi-k2.5-thinking`, `kimi-latest` |

This table describes the provider registry shipped with this version of
Potluck. It is not a promise that every listed model is enabled for your
account. Providers can change model names and account entitlements without a
Potluck release.

---

## Add a connection

1. Create an account with the provider and obtain credentials under its terms.
2. Open **Dashboard → Providers**.
3. Select the matching regional provider entry.
4. Add the API key and run the connection test.
5. Refresh the model list and verify the exact model you intend to use.

Do not assume that credentials for an international endpoint also work with the
China endpoint, or the reverse.

---

## Call the local development endpoint

When Potluck is running with `npm run dev`, use:

```bash
curl http://localhost:20127/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_POTLUCK_KEY" \
  -d '{
    "model": "glm/glm-4.7",
    "messages": [{"role": "user", "content": "Reply with OK"}]
  }'
```

Replace the model with one returned by your instance. If endpoint API-key
enforcement is disabled, a Potluck key is not required for local calls. Enable
authentication before exposing an instance to other machines.

For Docker or production, use that deployment's configured host and port
instead of `localhost:20127`.

---

## Use a combo for fallback

A combo can try configured models in order when a request cannot be completed.
For example:

```text
Dashboard → Combos → Create

Name: api-key-fallback
Models:
  1. glm/glm-4.7
  2. minimax/MiniMax-M2.7
  3. kimi/kimi-latest
```

Only include models that are available to your accounts and compatible with
the request type. Fallback can improve resilience, but it does not make model
behavior, context limits, output quality, or billing identical.

---

## Cost and quota guidance

Provider prices and subscription quotas change frequently. Potluck's recorded
cost is an estimate based on the pricing data configured for a model; the
provider's invoice and quota dashboard are authoritative.

Before relying on a provider:

1. Check its official pricing and subscription pages.
2. Confirm whether prices distinguish input, output, cached, image, audio, or
   search usage.
3. Confirm the billing currency, region, taxes, and account tier.
4. Send a small test request and compare Potluck's recorded usage with the
   provider dashboard.
5. Set external billing alerts with the provider when available.

Potluck does not currently promise automatic budget cutoffs or automatic
switching based on a monetary limit. A combo follows its configured routing
and failure rules; it is not a billing controller.

---

## Troubleshooting

### The connection test fails

- Confirm that the regional provider entry matches the issued credential.
- Check whether the account has API access and available credit or quota.
- Regenerate the key if it may have been revoked or exposed.
- Check the provider's own service status.

### A model is unavailable

- Refresh the provider's models in the dashboard.
- Use the exact model ID returned by your instance.
- Confirm that the model is enabled for the account and region.
- Remove unavailable models from combos.

### Recorded cost differs from the invoice

- Treat the provider invoice as authoritative.
- Check whether local pricing metadata is current.
- Check for cached-token, media, tool, or regional charges not represented by a
  simple input/output token rate.

---

## Next steps

- [Free provider connections](./free.md)
- [Subscription provider connections](./subscription.md)
- [Combos](../features/combos.md)
