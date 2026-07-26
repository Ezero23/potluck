# Potluck documentation

Potluck is a self-hosted router for distributing requests across multiple configured
sources that can serve the same model family.

Its Potluck-specific routing work focuses on:

- rotation across healthy sources;
- automatic aggregation of matching model sources;
- concurrency-aware source selection;
- fallback to another eligible source within a request;
- inspection of resolved routing pools and source health.

Fallback improves availability but does not guarantee uninterrupted service. Requests
can fail when all candidates are unavailable or when a client, credential, network, or
provider fails in a way that cannot be recovered.

## Quick start

```bash
git clone https://github.com/Ezero23/potluck.git
cd potluck
cp .env.example .env
npm ci
npm run dev
```

Open `http://localhost:21023/dashboard`, connect a provider, create an API key, and point
an OpenAI-compatible client at:

```text
Base URL: http://localhost:21023/v1
API key:  [key created in Dashboard → Endpoint]
Model:    [an identifier returned by GET /v1/models]
```

The initial dashboard password is `123456` when no saved password exists. Change it
before exposing the service to other machines.

## Third-party services

Providers control their own model catalogs, prices, quotas, authentication methods, and
free tiers. These may change without notice. Potluck does not guarantee that a provider
or model is free, unlimited, or permanently available.

The remaining provider and feature guides are being audited against the current code.
Treat time-sensitive pricing and quota information as illustrative until it has a cited
source and review date.

## Project lineage

Potluck is based on [9router](https://github.com/decolua/9router) and retains its MIT
license and upstream copyright notice.

[OmniRoute](https://github.com/diegosouzapw/OmniRoute) is a related project also derived
from 9router. It is not a fork of Potluck.

See the repository [README](https://github.com/Ezero23/potluck) and
[NOTICE](https://github.com/Ezero23/potluck/blob/main/NOTICE.md) for verified features,
deployment guidance, and detailed acknowledgments.
