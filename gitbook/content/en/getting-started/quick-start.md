# Quick start

This guide starts a local Potluck development instance and sends one request through
its OpenAI-compatible API.

## Requirements

- Node.js 22
- npm
- Credentials for at least one supported provider

For production and platform-specific notes, see
[Installation](./installation.md).

## 1. Install

```bash
git clone https://github.com/Ezero23/potluck.git
cd potluck
cp .env.example .env
npm ci
```

Do not commit `.env`, the Potluck data directory, database backups, provider
credentials, or request logs.

## 2. Start the development server

```bash
npm run dev
```

Open `http://localhost:21023/dashboard`.

The initial dashboard password is `123456` when no password hash has been configured.
You can change it later in the dashboard or set `INITIAL_PASSWORD` before the first
start.

Development, production, Docker, and the CLI all use `21023` by default. If you
explicitly select another port, use that same value in the dashboard and client URLs.

## 3. Connect a provider

Open **Dashboard → Providers** and select a provider supported by your account.
Depending on the provider, Potluck may ask for an API key, OAuth authorization, or a
device-code login.

Provider model names, quotas, prices, and login flows are controlled by third parties
and can change. Treat the provider cards and model selector in your running Potluck
instance as the current source of truth.

Before adding a provider:

- confirm that your use complies with the provider's terms;
- understand whether the account is billed, subscription-backed, or quota-limited;
- use a dedicated credential where practical;
- test a non-sensitive prompt before relying on the connection.

## 4. Create an API key

Open **Dashboard → Endpoint**, create or copy a Potluck API key, and keep it separate
from the upstream provider credential.

When endpoint-key enforcement is enabled in **Dashboard → Endpoint**, clients must
send this key as a bearer token. Requiring an API key is strongly recommended for any
instance reachable by another machine.

## 5. Discover available models

Model identifiers depend on the providers currently connected to your instance:

```bash
curl http://localhost:21023/v1/models \
  -H "Authorization: Bearer YOUR_POTLUCK_API_KEY"
```

Use an identifier returned by this endpoint or selected in the dashboard. A direct
`provider/model` identifier targets that source. A configured routing profile can be
used as `profile:PROFILE_NAME`.

## 6. Send a test request

Replace `provider/model-id` with a model returned by `/v1/models`:

```bash
curl http://localhost:21023/v1/chat/completions \
  -H "Authorization: Bearer YOUR_POTLUCK_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "provider/model-id",
    "messages": [
      {"role": "user", "content": "Reply with: Potluck is connected."}
    ],
    "stream": false
  }'
```

A successful response confirms that the client reached Potluck and that the selected
provider accepted the request. It does not guarantee that every endpoint, tool call,
streaming mode, or media input is supported by that provider.

## 7. Connect a client

For an OpenAI-compatible client, use:

```text
Base URL: http://localhost:21023/v1
API key:  YOUR_POTLUCK_API_KEY
Model:    provider/model-id
```

Client configuration differs, especially for Anthropic-compatible tools. Use the
matching integration guide:

- [Claude Code](../integration/claude-code.md)
- [Codex](../integration/codex.md)
- [Cline](../integration/cline.md)
- [Continue](../integration/continue.md)
- [Roo Code](../integration/roo.md)
- [Other tools](../integration/other-tools.md)

## Optional: configure fallback

Combos and routing profiles can try other eligible sources when a request encounters a
configured retryable failure. Verify each member independently before combining them.

Fallback is best effort, not a zero-downtime guarantee. A request can still fail when
credentials expire, every candidate is unavailable, a provider changes its API, the
client disconnects, or the error is not retryable.

## Next steps

- Review [Subscription providers](../providers/subscription.md).
- Review the caveats for [no-cost and promotional access](../providers/free.md).
- Read about [combos](../features/combos.md).
- Use [Troubleshooting](../troubleshooting.md) if the first request fails.
