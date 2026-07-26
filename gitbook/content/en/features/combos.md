# Model combos

A combo groups several configured model sources under one name. Clients send that
combo name as the request model, and Potluck applies the strategy selected for the
combo.

Combos do not create provider accounts, add quota, or make models interchangeable.
Connect and test every member before relying on the combo.

## Create a combo

1. Open `http://localhost:20127/dashboard/combos` when using the development server.
2. Select **Create Combo**.
3. Enter a name containing letters, numbers, `-`, or `_`.
4. Add models from connected providers.
5. Drag the models into the intended order.
6. Save the combo and copy its name.

Production and container installations commonly use port `20129`; use the port on
which your instance is actually listening.

Use the combo name as the `model` value:

```bash
curl http://localhost:20127/v1/chat/completions \
  -H "Authorization: Bearer YOUR_POTLUCK_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "my-combo",
    "messages": [
      {"role": "user", "content": "Reply with the provider and model you used."}
    ],
    "stream": false
  }'
```

The combo must contain at least one usable model. Use model identifiers shown by the
current dashboard or returned by `/v1/models`; old examples may no longer be valid.

## Strategies

### Fallback

Fallback is the default strategy. Potluck starts with the first model and tries the
next member only when the preceding attempt produces an error classified as eligible
for fallback.

It does not retry every failure. Invalid requests and other non-retryable responses can
be returned immediately. If every member fails, the request still fails.

Choose members that can accept the same request shape. Similar model names do not
guarantee matching context limits, tool behavior, image support, or response quality.

### Round robin

Round robin changes the starting member across requests so traffic is distributed
through the combo. If that member encounters an eligible failure, the remaining
members can still be attempted.

The rotation state is held in the running process and starts again after a restart.
Multiple application processes do not share one rotation counter.

### Fusion

Fusion sends the prompt to the panel models in parallel and asks a judge model to
synthesize one answer. The first combo member is used as the automatic judge unless a
different judge is selected.

Fusion is materially more expensive and slower than a single request because it can
call every panel member plus the judge. Use it only when the extra comparison is worth
the latency, data exposure, and provider charges.

## Capability-aware ordering

Potluck can move a member that advertises a required capability—such as a supported
media input—to the front for that request. This is based on local capability metadata;
it is not a guarantee that the provider will accept every payload.

Test text, tools, images, PDFs, audio, streaming, and structured output separately when
your workflow depends on them.

## Safe configuration practices

- Start with two independently tested members.
- Put members in the order that matches your reliability or quality requirement.
- Review each provider's terms, limits, and billing independently.
- Do not describe a trial or subscription allowance as permanently free.
- Check the Usage and Quota pages after a test request.
- Keep a direct model identifier available for diagnosis.
- Avoid sending sensitive data through a combo unless every possible provider is
  approved to receive it.

The dashboard's cost values are estimates based on locally configured pricing, not
provider invoices. Potluck does not currently enforce a per-combo daily or monthly
budget, automatically move to a “free tier” after a spending threshold, or guarantee
continuous availability.

## Troubleshooting

### The combo is not available

- Confirm that it was saved and contains at least one member.
- Use the exact combo name; combo names do not contain `/`.
- Refresh the client model list or query `/v1/models`.
- Confirm that the client is connected to the intended Potluck instance.

### Requests always start on the same member

- Confirm that the combo strategy is **Round Robin**, not **Fallback**.
- Remember that rotation starts over when the process restarts.
- Check whether capability-aware ordering moved a compatible member to the front.

### Fallback did not occur

- Inspect the returned status and local usage/request details.
- Confirm that another member is active and accepts the same request.
- The failure may not be classified as retryable.
- A client disconnect or malformed request may prevent another attempt.

### Fusion is unexpectedly expensive

- Count the panel members and the judge call.
- Review locally configured model pricing.
- Check the provider's actual billing page.
- Switch to Fallback or Round Robin if a single answer is sufficient.

## Related guides

- [Quota and usage](./quota-tracking.md)
- [Quick start](../getting-started/quick-start.md)
- [Troubleshooting](../troubleshooting.md)
