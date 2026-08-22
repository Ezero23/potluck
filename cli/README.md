# Potluck CLI

Potluck is a self-hosted AI gateway that gives compatible clients one local endpoint
and routes requests to the provider connections you configure.

[![Docker Pulls](https://img.shields.io/docker/pulls/ezero23/potluck.svg?logo=docker&label=Docker%20pulls)](https://hub.docker.com/r/ezero23/potluck)
[![GHCR](https://img.shields.io/badge/GHCR-Ezero23%2Fpotluck-blue?logo=github)](https://github.com/Ezero23/potluck/pkgs/container/potluck)
[![License](https://img.shields.io/github/license/Ezero23/potluck)](https://github.com/Ezero23/potluck/blob/main/LICENSE)

[Project README](https://github.com/Ezero23/potluck#readme) ·
[中文说明](https://github.com/Ezero23/potluck/blob/main/README.zh-CN.md)

---

## What it provides

- One local dashboard and API endpoint
- OpenAI-, Anthropic-, and other supported protocol adapters
- Rotation, health-aware selection, and fallback across eligible sources
- Local usage, estimated-cost, and request diagnostics
- Setup helpers for supported coding tools

Fallback improves availability, but it cannot guarantee uninterrupted service when all
configured sources are unavailable or credentials have expired.

---

## ⚡ Quick Start

Requirements: Node.js 22 and npm.

**Option 1 — CLI release (recommended for desktop):**

```bash
npm install -g https://github.com/Ezero23/potluck/releases/download/v0.1.11/potluck-cli-0.1.11.tgz
potluck
```

**Option 2 — Docker (server/VPS):**

```bash
docker run -d --name potluck -p 21023:21023 \
  -v "$HOME/.potluck:/app/data" -e DATA_DIR=/app/data \
  ezero23/potluck:latest
```

Published images: [Docker Hub](https://hub.docker.com/r/ezero23/potluck) • [GHCR](https://github.com/Ezero23/potluck/pkgs/container/potluck) (multi-platform amd64/arm64).

Dashboard: `http://localhost:21023/dashboard`

**Connect a provider:**

Dashboard → Providers → connect a provider supported by your account.

**Use it from a client:**

```
Claude Code/Codex/OpenClaw/Cursor/Cline Settings:
  Endpoint: http://localhost:21023/v1
  API Key:  [copy from dashboard]
  Model:    [choose one returned by GET /v1/models]
```

Provider availability, pricing, quotas, and model names are controlled by third
parties. Test your chosen provider and model in the dashboard before relying on it.

---

## 🚀 CLI Options

```bash
potluck                    # Start with default settings
potluck --port 8080        # Custom port
potluck --no-browser       # Don't open browser
potluck --skip-update      # Skip auto-update check
potluck --help             # Show all options
```

The default dashboard is `http://localhost:21023/dashboard`. `--port` changes the
dashboard, API, and generated client endpoint together.

---

## Supported clients

Potluck includes setup helpers for several coding clients. Other clients may work when
they accept a custom OpenAI- or Anthropic-compatible base URL. Compatibility varies by
client, provider, model, streaming mode, and tool-call format.

---

## 💾 Data Location

- **macOS/Linux**: `~/.potluck/db/data.sqlite`
- **Windows**: `%APPDATA%/potluck/db/data.sqlite`
- **Docker**: `/app/data/db/data.sqlite` (mount `$HOME/.potluck` to persist)

---

## Documentation and support

- [Installation, deployment, security, and API examples](https://github.com/Ezero23/potluck#readme)
- [Report an issue](https://github.com/Ezero23/potluck/issues)

---

## Acknowledgments

Potluck is based on [9router](https://github.com/decolua/9router). Related engineering
references and inherited integrations are documented in the repository
[NOTICE](https://github.com/Ezero23/potluck/blob/main/NOTICE.md), including
[OmniRoute](https://github.com/diegosouzapw/OmniRoute) and
[CLIProxyAPI](https://github.com/router-for-me/CLIProxyAPI).

## 📄 License

MIT License — see the repository
[LICENSE](https://github.com/Ezero23/potluck/blob/main/LICENSE).
