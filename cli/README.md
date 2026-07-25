# Potluck - Model Supply Platform

**好模型管够，不用选，用不完，不断线。 (Great models in abundance — no picking, never running out, never offline.)**

**A rotation-first model supply platform: connect all your AI code tools (Claude Code, Cursor, Antigravity, Copilot, Codex, Gemini, OpenCode, Cline, OpenClaw...) to 40+ AI providers & 100+ models.**

[![npm](https://img.shields.io/npm/v/potluck-cli.svg)](https://www.npmjs.com/package/potluck-cli)
[![Downloads](https://img.shields.io/npm/dm/potluck-cli.svg)](https://www.npmjs.com/package/potluck-cli)
[![Docker Pulls](https://img.shields.io/docker/pulls/ezero23/potluck.svg?logo=docker&label=Docker%20pulls)](https://hub.docker.com/r/ezero23/potluck)
[![GHCR](https://img.shields.io/badge/GHCR-Ezero23%2Fpotluck-blue?logo=github)](https://github.com/Ezero23/potluck/pkgs/container/potluck)
[![License](https://img.shields.io/npm/l/potluck-cli.svg)](https://github.com/Ezero23/potluck/blob/main/LICENSE)

[📖 Full Docs](https://github.com/Ezero23/potluck)

---

## 🤔 Why Potluck?

**Models should be plentiful, not precious:**

- ❌ Picking the "right" provider wastes time
- ❌ A single source runs dry mid-coding
- ❌ Rate limits and outages stop you cold
- ❌ One bad upstream means downtime

**Potluck solves this with a rotation-first model supply:**

- ✅ **Rotation-first supply** - Requests rotate across sources, so capacity is always available
- ✅ **Multi-source aggregation** - The same model served from many providers, pooled together
- ✅ **Never offline** - A failing source is skipped automatically; supply keeps flowing
- ✅ **No picking** - One endpoint, every model; Potluck finds the capacity
- ✅ **Universal** - Works with any OpenAI/Claude-compatible CLI

---

## ⚡ Quick Start

**Option 1 — npm (recommended for desktop):**

```bash
npm install -g potluck-cli
potluck

# Or run directly with npx
npx potluck-cli
```

**Option 2 — Docker (server/VPS):**

```bash
docker run -d --name potluck -p 20129:20129 \
  -v "$HOME/.potluck:/app/data" -e DATA_DIR=/app/data \
  ezero23/potluck:latest
```

Published images: [Docker Hub](https://hub.docker.com/r/ezero23/potluck) • [GHCR](https://github.com/Ezero23/potluck/pkgs/container/potluck) (multi-platform amd64/arm64).

🎉 Dashboard opens at `http://localhost:20129`

**2. Connect a provider:**

Dashboard → Providers → Connect a provider (e.g. **Kiro AI** or **OpenCode Free**) → Done!

**3. Use in your CLI tool:**

```
Claude Code/Codex/OpenClaw/Cursor/Cline Settings:
  Endpoint: http://localhost:20129/v1
  API Key:  [copy from dashboard]
  Model:    kr/claude-sonnet-4.5
```

That's it! Start coding with an endless supply of models.

---

## 🚀 CLI Options

```bash
potluck                    # Start with default settings
potluck --port 8080        # Custom port
potluck --no-browser       # Don't open browser
potluck --skip-update      # Skip auto-update check
potluck --help             # Show all options
```

**Dashboard**: `http://localhost:20129/dashboard`

---

## 🛠️ Supported CLI Tools

Claude-Code • OpenClaw • Codex • OpenCode • Cursor • Antigravity • Cline • Continue • Droid • Roo • Copilot • Kilo Code • Gemini CLI • Qwen Code • iFlow • Crush • Crusher • Aider

Any tool supporting OpenAI/Claude-compatible API works.

---

## 💾 Data Location

- **macOS/Linux**: `~/.potluck/db/data.sqlite`
- **Windows**: `%APPDATA%/potluck/db/data.sqlite`
- **Docker**: `/app/data/db/data.sqlite` (mount `$HOME/.potluck` to persist)

---

## 📚 Documentation

Full docs, advanced setup, video tutorials & development guide:

- **GitHub**: https://github.com/Ezero23/potluck
- **Full README**: https://github.com/Ezero23/potluck/blob/main/app/README.md

---

## 🙏 Acknowledgments

- **[CLIProxyAPI](https://github.com/router-for-me/CLIProxyAPI)** - Original Go implementation

## 📄 License

MIT License - see [LICENSE](LICENSE) for details.
