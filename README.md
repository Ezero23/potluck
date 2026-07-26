# Potluck · 百家饭

**A self-hosted router for distributing requests across interchangeable model sources.**

[![GitHub](https://img.shields.io/badge/GitHub-Ezero23%2Fpotluck-blue?logo=github)](https://github.com/Ezero23/potluck)
[![License](https://img.shields.io/github/license/Ezero23/potluck)](https://github.com/Ezero23/potluck/blob/main/LICENSE)

[Quick start](#quick-start) · [Routing pools](#routing-pools) · [Deployment](#deployment) · [中文](./README.zh-CN.md)

## What Potluck does

Potluck gives OpenAI-compatible clients one local endpoint while routing requests to
provider accounts and API endpoints that you configure. Its distinguishing feature is
pooling multiple sources that serve the same model family:

- **Rotation-first scheduling** spreads requests across healthy sources instead of
  draining the first source before using the next one.
- **Same-model aggregation** discovers configured provider/model pairs that match a
  model family and treats them as one routing pool.
- **Concurrency-aware selection** avoids concentrating simultaneous requests on the
  same source.
- **In-request fallback** can try another eligible source when a source cannot serve a
  request.
- **Protocol translation** connects OpenAI-, Anthropic-, Gemini-, and other supported
  request/stream formats.
- **Local observability** records usage, estimated cost, source health, and optional
  request logs.

Fallback improves availability; it is not a zero-downtime guarantee. A request can still
fail when every candidate is unavailable, credentials expire, a provider changes its
API, the client disconnects, or an unrecoverable error occurs.

## Project status

Potluck is an early-stage fork under active hardening. The production build works, but
the inherited test and lint baselines are still being repaired. Back up `DATA_DIR`
before upgrading and review changes before exposing an instance to the internet.

Provider availability, model names, pricing, quotas, and free tiers are controlled by
third parties and may change without notice. Potluck does not promise that any provider
or model is free, unlimited, or permanently available. Cost values shown in the
dashboard are estimates, not bills.

## Quick start

Requirements:

- Node.js 22
- npm

```bash
git clone https://github.com/Ezero23/potluck.git
cd potluck
cp .env.example .env
npm ci
npm run dev
```

Open `http://localhost:21023/dashboard`, connect at least one provider, and create or
copy an API key from the dashboard.

The initial dashboard password defaults to `123456` when no password hash exists. You
can change it later from the application settings or with `INITIAL_PASSWORD`.

Point an OpenAI-compatible client at:

```text
Base URL: http://localhost:21023/v1
API key:  [key created in the Potluck dashboard]
Model:    [an identifier returned by GET /v1/models]
```

Direct `provider/model` identifiers bypass routing profiles. Available identifiers come
from the connected providers and can be queried with `GET /v1/models`.

## Routing pools

Routing profiles are read from `routing.json` in the project root or `DATA_DIR`
(default: `~/.potluck`). The configuration is re-read periodically.

```json
{
  "profiles": {
    "claude": {
      "description": "Rotate across configured Claude Sonnet sources",
      "strategy": "rotation",
      "aggregate": "claude-sonnet-4",
      "aggregateExclude": ["blackbox"],
      "fallbackOn": ["403", "429", "quota_exceeded", "timeout", "5xx"]
    }
  }
}
```

Use the profile as `profile:claude` or, where supported, by its bare name `claude`.

Inspect the resolved candidates and current health:

```bash
curl http://localhost:21023/api/routing/pools
```

Rotation state is process-local and starts fresh after a restart. Aggregation only
considers sources present in the local configuration and registry; it does not create
accounts or bypass provider limits.

## Supported interfaces

Potluck exposes OpenAI-compatible endpoints for chat, responses, embeddings, image,
audio, and related routes, with support varying by provider. It also includes setup
helpers for several coding clients.

Compatibility depends on the client and provider combination. Test a model in the
dashboard before relying on it, especially for tools, images, reasoning blocks, and
streaming responses.

Optional token-processing integrations include RTK-style tool-output compression,
Headroom, Caveman, and Ponytail modes. Results depend on the content and configuration;
the project does not guarantee a fixed token-saving percentage.

## Deployment

### Production build

```bash
npm run build
PORT=21023 HOSTNAME=0.0.0.0 NODE_ENV=production npm start
```

### Docker

```bash
docker build -t potluck .
docker run -d --name potluck \
  -p 21023:21023 \
  -v "$HOME/.potluck:/app/data" \
  -e DATA_DIR=/app/data \
  potluck
```

Release images, when available, are published to
`ghcr.io/ezero23/potluck`. A persistent volume is required if provider configuration,
keys, settings, and usage history must survive container replacement.

For an internet-facing deployment:

- set a non-default dashboard password;
- enable endpoint API-key enforcement in **Dashboard → Endpoint**;
- terminate HTTPS at a trusted reverse proxy;
- set `AUTH_COOKIE_SECURE=true`;
- protect and back up `DATA_DIR`;
- do not enable request-body logging unless it is needed for debugging.

## Data and logs

- Application database: `${DATA_DIR}/db/data.sqlite`
- Automatic database backups: `${DATA_DIR}/db/backups/`
- Routing profiles: `${DATA_DIR}/routing.json` or `./routing.json`
- Optional request logs: `./logs/` when `ENABLE_REQUEST_LOGS=true`

Provider credentials and logs are sensitive. Do not publish the data directory, `.env`
files, database backups, or debug logs.

## API examples

```bash
curl http://localhost:21023/v1/chat/completions \
  -H "Authorization: Bearer YOUR_POTLUCK_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "provider/model-id",
    "messages": [{"role": "user", "content": "Hello"}],
    "stream": false
  }'
```

```bash
curl http://localhost:21023/v1/models \
  -H "Authorization: Bearer YOUR_POTLUCK_API_KEY"
```

## Lineage and acknowledgments

Potluck is based on [9router](https://github.com/decolua/9router) and retains
9router's MIT license and upstream copyright notice. Potluck builds on that foundation
with rotation-first scheduling, same-model aggregation, concurrency-aware selection,
routing-pool inspection, and Potluck-specific deployment and security work.

[OmniRoute](https://github.com/diegosouzapw/OmniRoute) is another project derived
from 9router. It is not a fork of Potluck; it is acknowledged as a related project and
an engineering reference.

The inherited code and Potluck integrations also owe thanks to
[CLIProxyAPI](https://github.com/router-for-me/CLIProxyAPI),
[RTK](https://github.com/rtk-ai/rtk),
[Headroom](https://github.com/chopratejas/headroom),
[Caveman](https://github.com/JuliusBrussee/caveman), and
[Ponytail](https://github.com/DietrichGebert/ponytail).
See [NOTICE.md](./NOTICE.md) for the specific relationship to each project.

Project and product names belong to their respective owners. A compatibility reference
does not imply affiliation or endorsement.

## Support and license

- Issues: [github.com/Ezero23/potluck/issues](https://github.com/Ezero23/potluck/issues)
- License: [MIT](./LICENSE)

The upstream copyright notice in `LICENSE` must be preserved when redistributing
substantial portions of this software.
