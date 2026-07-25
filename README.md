<div align="center">
  <img src="./images/potluck.png?1" alt="Potluck Dashboard" width="800"/>

  # Potluck · 百家饭

  ### A model SUPPLY platform — not an API relay, not an API-key reseller.

  **好模型管够，不用选，用不完，不断线。**

  *"Good models in abundance: no choosing, never runs out, never goes down."*

  [![GitHub Repo](https://img.shields.io/badge/GitHub-Ezero23%2Fpotluck-blue?logo=github)](https://github.com/Ezero23/potluck)
  [![License](https://img.shields.io/github/license/Ezero23/potluck)](https://github.com/Ezero23/potluck/blob/main/LICENSE)

  [🚀 Quick Start](#-quick-start) • [🔀 Rotation & Aggregation](#-rotation--aggregation-the-core-of-potluck) • [💡 Features](#-key-features) • [📖 Setup](#-setup-guide)

  [🇨🇳 简体中文](./README.zh-CN.md)
</div>

---

## 🍚 What is Potluck (百家饭)?

**Potluck is a model SUPPLY platform (模型供给平台).**

It is **not** an API relay/proxy, and it is **not** a tool for managing, quota-limiting,
or reselling API keys. Tools like One-API / New-API are about **scarcity management** —
they wrap a fixed set of keys and meter out access. Potluck is the opposite: it is about
**abundant consumption (丰裕消费)**. You pool many sources of the *same* good models so
that capacity is effectively unlimited — everyone at the table gets fed.

> **好模型管够，不用选，用不完，不断线。**
> *Good models in abundance: no choosing, never runs out, never goes down.*

- **管够 / 用不完 (never runs out):** Pool many endpoints that serve the same model and
  rotate across them, so no single source is drained and capacity stays abundant.
- **不用选 (no choosing):** Ask for a model family (e.g. `claude-sonnet-4`); Potluck
  discovers and pools every source that can serve it. You don't pick a provider.
- **不断线 (never goes down):** If a source returns anything but a `200` mid-request,
  Potluck immediately slides to the next source in the pool. One dead source never
  fails your request.

Two mechanisms make this real — **rotation-first scheduling** and **same-model
multi-source aggregation** — documented in detail in
[Rotation & Aggregation](#-rotation--aggregation-the-core-of-potluck) below.

**Team sharing:** one person configures the pool (a `routing.json` of profiles); everyone
on the team points their tools at the same Potluck instance and consumes from it.

---

## 🤔 Why Potluck / 百家饭?

Most "AI gateway" tools answer the question *"how do I ration a scarce, expensive key?"*
Potluck answers a different question: *"how do I make a good model always available, in
unlimited quantity, for my whole team?"*

- ✅ **Rotation-first, not priority-first** — Instead of hammering the #1 source until it
  dies and *then* failing over, Potluck spreads requests evenly across a pool of healthy
  sources (least-recently-used + quota-aware). No single quota is drained prematurely.
- ✅ **Same-model multi-source aggregation** — Wire up N endpoints that all serve the
  *same* model (e.g. a dozen Claude Sonnet sources across many providers) and treat them
  as one effectively-unlimited source.
- ✅ **不断线 contract** — Within a single request, any non-`200` from a pool source
  slides to the next source instantly. The request never fails just because one source died.
- ✅ **One config, whole team** — Profiles live in a plain `routing.json` that hot-reloads;
  share the instance and everyone consumes from the same abundant pool.
- ✅ **RTK Token Saver (built-in)** — Losslessly compress noisy tool outputs
  (`git diff`, `grep`, `ls`, `tree`…) before they reach the model, saving 20–40% input
  tokens per request. A feature, not the headline — but a nice one.
- ✅ **Universal** — Works with Claude Code, Codex, Cursor, Cline, OpenCode, and any tool
  that speaks an OpenAI-compatible endpoint, with automatic format translation.

---

## 🔄 How It Works

```
┌─────────────┐
│  Your CLI   │  (Claude Code, Codex, Cursor, Cline, OpenCode, OpenClaw…)
│   Tool      │
└──────┬──────┘
       │ http://localhost:20129/v1     model: "profile:claude"
       ↓
┌──────────────────────────────────────────────────────────┐
│                Potluck (Model Supply Platform)            │
│  • Rotation scheduler  (LRU + quota-aware, even spread)   │
│  • Same-model aggregation  (pool all "claude-sonnet-4")    │
│  • 不断线 fallback  (any non-200 → slide to next source)    │
│  • Format translation  (OpenAI ↔ Claude ↔ Gemini ↔ …)     │
│  • RTK token saver · quota tracking · auto token refresh  │
└──────┬───────────────────────────────────────────────────┘
       │  rotate across the pool — never hammer one source
       ├─→ source A: provider-1 / claude-sonnet-4
       ├─→ source B: provider-2 / claude-sonnet-4
       ├─→ source C: provider-3 / claude-sonnet-4
       └─→ …  (every endpoint that serves the same model family)

Result: good models in abundance — no choosing, never runs out, never goes down.
```

---

## 🔀 Rotation & Aggregation (the core of Potluck)

These two mechanisms are what make Potluck a *supply* platform rather than a relay.

### 1. Rotation-first scheduling (not priority-first)

A classic gateway sorts sources by priority and always hits #1, failing over only when it
breaks. That drains the best source first. Potluck's **rotation** strategy does the
opposite: it spreads load evenly across every healthy source so no single quota is
exhausted.

Selection rule (see `open-sse/routing/scheduler.js`):

1. **Hard-filter** unavailable sources — quota exhausted (`quotaPercent >= 100`), high
   recent error rate (`errorRate5m > 0.3`), or errored within the last 30s.
2. Among what's left, pick the **least-recently-used** source. `weight` only breaks ties
   (higher weight wins when two sources were last used equally long ago) — weight never
   overrides recency, so a high-weight source still waits its turn.

Rotation state is in-memory and process-local by design: on restart the rotation simply
starts fresh, because the goal is even spread over time, not exact accounting.

A profile opts into rotation with `"strategy": "rotation"` (the default strategy is the
legacy `"priority"` ordering).

### 2. Same-model multi-source aggregation (同模型多源聚合)

Instead of listing sources by hand, a rotation profile can declare a **model family** and
let Potluck discover every endpoint that serves it (see `open-sse/routing/aggregate.js`).

Given a query like `claude-sonnet-4`, Potluck scans the provider registry and pools **all**
provider/model pairs whose ID matches that family. Matching normalizes IDs (strip provider
prefix, lowercase, unify `.`→`-`, strip `-YYYYMMDD` date suffixes) and then does a
segment-boundary prefix match — so `claude-sonnet-4` matches `claude-sonnet-4` and
`claude-sonnet-4-6` (a 4.x variant) but **not** `claude-sonnet-45`.

**Example — the built-in `claude` profile** (see `open-sse/routing/profiles.js`):

```json
{
  "profiles": {
    "claude": {
      "description": "Claude 管够：市面上所有 Claude Sonnet 接在一起轮着用，用到爽",
      "strategy": "rotation",
      "aggregate": "claude-sonnet-4",
      "aggregateExclude": ["blackbox"],
      "fallbackOn": ["403", "429", "quota_exceeded", "timeout", "5xx"]
    }
  }
}
```

Point your tool at `model: "profile:claude"` and Potluck aggregates every configured
Claude Sonnet source into one pool and rotates across them — effectively one unlimited
Claude Sonnet supply. `aggregateOnly` / `aggregateExclude` restrict the provider set; any
static `candidates` you list are merged on top as pinned extras.

### 3. The 不断线 (never-down) contract

Within a single request, Potluck tries pool sources one at a time. For a **rotation**
profile, **any non-`200` response means "this source can't serve right now" → slide to the
next source immediately** (see `handleRoutingProfileChat` in `src/sse/handlers/chat.js`).
It also falls through on the profile's `fallbackOn` triggers (`403`, `429`,
`quota_exceeded`, `timeout`, `5xx`) and on a first-token timeout (a `200` that produces no
output in time). Your request only fails when the entire pool is exhausted — one dead
source never breaks it.

### Inspect your pools

```
GET /api/routing/pools
```

Returns every routing profile as a "pool" with its resolved sources (aggregate discovery +
static merge), per-source health (`quotaPercent`, `errorRate5m`, `healthy`), and rotation
stats (`useCount`, `lastUsedAt`) — see `src/app/api/routing/pools/route.js`. This powers
the pool view (池子视图).

### Addressing models & profiles

| `model` value | Meaning |
|---------------|---------|
| `profile:claude` | Use the named routing profile |
| `claude` | Bare profile name → auto-resolved to `profile:claude` |
| `potluck/code` | Alias (WeChat Bridge / kimi CLI) → `profile:code` |
| `anthropic/claude-sonnet-4` | Direct provider/model, bypasses routing |

### Config hot-reload

Profiles are read from `routing.json` in the project root or your data directory
(`DATA_DIR`, default `~/.potluck`). The file is re-read on a **30-second TTL cache**, so
edits to `routing.json` take effect automatically — no restart needed. Built-in profiles
ship with the app (`auto` and `claude` use rotation; `code`, `fast`, `vision`, `cheap`,
`fallback` use priority); your `routing.json` is merged on top.

---

## ⚡ Quick Start

Potluck is a private package (`potluck-app`), so running from source or Docker is the
expected path.

**Run from source:**

```bash
git clone https://github.com/Ezero23/potluck.git
cd potluck
cp .env.example .env
npm install
PORT=20129 NEXT_PUBLIC_BASE_URL=http://localhost:20129 npm run dev
```

Production mode:

```bash
npm run build
PORT=20129 HOSTNAME=0.0.0.0 NEXT_PUBLIC_BASE_URL=http://localhost:20129 npm run start
```

Default URLs:

- Dashboard: `http://localhost:20129/dashboard`
- OpenAI-compatible API: `http://localhost:20129/v1`

**Connect a provider, then use a pool:**

1. Dashboard → Providers → connect one or more providers (OAuth or API key). The more
   sources you add for a model family, the more abundant the pool.
2. Point your CLI tool at the API and request a profile:

```
Endpoint: http://localhost:20129/v1
API Key:  [copy from dashboard]
Model:    profile:claude        # or "claude", "profile:auto", "profile:code"…
```

That's it — Potluck rotates across every source that serves the model and slides past any
that fail.

### 🔑 Configure your own OAuth clients (recommended)

Gemini and Antigravity ship with shared public OAuth client credentials. For reliability
and to avoid shared rate limits, register your own OAuth client and supply it via env vars:

```bash
# Gemini / Google
GOOGLE_OAUTH_CLIENT_ID=...
GOOGLE_OAUTH_CLIENT_SECRET=...

# Antigravity
ANTIGRAVITY_OAUTH_CLIENT_ID=...
ANTIGRAVITY_OAUTH_CLIENT_SECRET=...
```

These are read at startup (see `open-sse/providers/shared.js`).

---

## 🛠️ Supported CLI Tools

Potluck works with all major AI coding tools — anything that supports a custom
OpenAI-compatible endpoint:

<div align="center">
  <table>
    <tr>
      <td align="center" width="120">
        <img src="./public/providers/claude.png" width="60" alt="Claude Code"/><br/>
        <b>Claude-Code</b>
      </td>
      <td align="center" width="120">
        <img src="./public/providers/openclaw.png" width="60" alt="OpenClaw"/><br/>
        <b>OpenClaw</b>
      </td>
      <td align="center" width="120">
        <img src="./public/providers/codex.png" width="60" alt="Codex"/><br/>
        <b>Codex</b>
      </td>
      <td align="center" width="120">
        <img src="./public/providers/opencode.png" width="60" alt="OpenCode"/><br/>
        <b>OpenCode</b>
      </td>
      <td align="center" width="120">
        <img src="./public/providers/cursor.png" width="60" alt="Cursor"/><br/>
        <b>Cursor</b>
      </td>
      <td align="center" width="120">
        <img src="./public/providers/antigravity.png" width="60" alt="Antigravity"/><br/>
        <b>Antigravity</b>
      </td>
    </tr>
    <tr>
      <td align="center" width="120">
        <img src="./public/providers/cline.png" width="60" alt="Cline"/><br/>
        <b>Cline</b>
      </td>
      <td align="center" width="120">
        <img src="./public/providers/continue.png" width="60" alt="Continue"/><br/>
        <b>Continue</b>
      </td>
      <td align="center" width="120">
        <img src="./public/providers/droid.png" width="60" alt="Droid"/><br/>
        <b>Droid</b>
      </td>
      <td align="center" width="120">
        <img src="./public/providers/roo.png" width="60" alt="Roo"/><br/>
        <b>Roo</b>
      </td>
      <td align="center" width="120">
        <img src="./public/providers/copilot.png" width="60" alt="Copilot"/><br/>
        <b>Copilot</b>
      </td>
      <td align="center" width="120">
        <img src="./public/providers/kilocode.png" width="60" alt="Kilo Code"/><br/>
        <b>Kilo Code</b>
      </td>
    </tr>
  </table>
</div>

---

## 🌐 Supported Providers

The more providers you connect that serve a given model family, the larger (and more
abundant) that family's rotation pool becomes.

### 🔐 OAuth Providers

<div align="center">
  <table>
    <tr>
      <td align="center" width="120">
        <img src="./public/providers/claude.png" width="60" alt="Claude Code"/><br/>
        <b>Claude-Code</b>
      </td>
      <td align="center" width="120">
        <img src="./public/providers/antigravity.png" width="60" alt="Antigravity"/><br/>
        <b>Antigravity</b>
      </td>
      <td align="center" width="120">
        <img src="./public/providers/codex.png" width="60" alt="Codex"/><br/>
        <b>Codex</b>
      </td>
      <td align="center" width="120">
        <img src="./public/providers/github.png" width="60" alt="GitHub"/><br/>
        <b>GitHub</b>
      </td>
      <td align="center" width="120">
        <img src="./public/providers/cursor.png" width="60" alt="Cursor"/><br/>
        <b>Cursor</b>
      </td>
      <td align="center" width="120">
        <img src="./public/providers/kimchi.png" width="60" alt="Kimchi"/><br/>
        <b>Kimchi</b>
      </td>
    </tr>
  </table>
</div>

### 🆓 Free Providers

<div align="center">
  <table>
    <tr>
      <td align="center" width="150">
        <img src="./public/providers/kiro.png" width="70" alt="Kiro"/><br/>
        <b>Kiro AI</b><br/>
        <sub>Claude 4.5 + GLM-5 + MiniMax<br/>Unlimited FREE</sub>
      </td>
      <td align="center" width="150">
        <img src="./public/providers/opencode.png" width="70" alt="OpenCode Free"/><br/>
        <b>OpenCode Free</b><br/>
        <sub>No auth • Auto-fetch models<br/>Unlimited FREE</sub>
      </td>
      <td align="center" width="150">
        <img src="./public/providers/gemini.png" width="70" alt="Vertex AI"/><br/>
        <b>Vertex AI</b><br/>
        <sub>Gemini 3 Pro + GLM-5 + DeepSeek<br/>$300 credits free</sub>
      </td>
    </tr>
  </table>
</div>

> **Note:** iFlow, Qwen and Gemini CLI free tiers were discontinued in 2026. Use Kiro / OpenCode Free / Vertex instead.

### 🔑 API Key Providers (40+)

<div align="center">
  <table>
    <tr>
      <td align="center" width="100">
        <img src="./public/providers/openrouter.png" width="50" alt="OpenRouter"/><br/>
        <sub>OpenRouter</sub>
      </td>
      <td align="center" width="100">
        <img src="./public/providers/glm.png" width="50" alt="GLM"/><br/>
        <sub>GLM</sub>
      </td>
      <td align="center" width="100">
        <img src="./public/providers/kimi.png" width="50" alt="Kimi"/><br/>
        <sub>Kimi</sub>
      </td>
      <td align="center" width="100">
        <img src="./public/providers/minimax.png" width="50" alt="MiniMax"/><br/>
        <sub>MiniMax</sub>
      </td>
      <td align="center" width="100">
        <img src="./public/providers/openai.png" width="50" alt="OpenAI"/><br/>
        <sub>OpenAI</sub>
      </td>
      <td align="center" width="100">
        <img src="./public/providers/anthropic.png" width="50" alt="Anthropic"/><br/>
        <sub>Anthropic</sub>
      </td>
    </tr>
    <tr>
      <td align="center" width="100">
        <img src="./public/providers/gemini.png" width="50" alt="Gemini"/><br/>
        <sub>Gemini</sub>
      </td>
      <td align="center" width="100">
        <img src="./public/providers/deepseek.png" width="50" alt="DeepSeek"/><br/>
        <sub>DeepSeek</sub>
      </td>
      <td align="center" width="100">
        <img src="./public/providers/groq.png" width="50" alt="Groq"/><br/>
        <sub>Groq</sub>
      </td>
      <td align="center" width="100">
        <img src="./public/providers/xai.png" width="50" alt="xAI"/><br/>
        <sub>xAI</sub>
      </td>
      <td align="center" width="100">
        <img src="./public/providers/mistral.png" width="50" alt="Mistral"/><br/>
        <sub>Mistral</sub>
      </td>
      <td align="center" width="100">
        <img src="./public/providers/perplexity.png" width="50" alt="Perplexity"/><br/>
        <sub>Perplexity</sub>
      </td>
    </tr>
    <tr>
      <td align="center" width="100">
        <img src="./public/providers/together.png" width="50" alt="Together"/><br/>
        <sub>Together AI</sub>
      </td>
      <td align="center" width="100">
        <img src="./public/providers/fireworks.png" width="50" alt="Fireworks"/><br/>
        <sub>Fireworks</sub>
      </td>
      <td align="center" width="100">
        <img src="./public/providers/cerebras.png" width="50" alt="Cerebras"/><br/>
        <sub>Cerebras</sub>
      </td>
      <td align="center" width="100">
        <img src="./public/providers/cohere.png" width="50" alt="Cohere"/><br/>
        <sub>Cohere</sub>
      </td>
      <td align="center" width="100">
        <img src="./public/providers/nvidia.png" width="50" alt="NVIDIA"/><br/>
        <sub>NVIDIA</sub>
      </td>
      <td align="center" width="100">
        <img src="./public/providers/siliconflow.png" width="50" alt="SiliconFlow"/><br/>
        <sub>SiliconFlow</sub>
      </td>
    </tr>
  </table>
  <p><i>...and 20+ more providers including Nebius, Chutes, Hyperbolic, and custom OpenAI/Anthropic compatible endpoints</i></p>
</div>

---

## 💡 Key Features

| Feature | What It Does | Why It Matters |
|---------|--------------|----------------|
| 🔀 **Rotation Scheduling** | LRU + quota-aware rotation across a pool of healthy sources | Even load spread; no source drained prematurely |
| 🧬 **Same-Model Aggregation** | Auto-discover & pool every endpoint serving a model family | One effectively-unlimited supply per model |
| 🛡️ **不断线 Fallback** | Any non-200 mid-request slides to the next pool source | One dead source never fails your request |
| 👥 **Team Sharing** | One `routing.json` of pools, hot-reloaded, shared by the team | Configure once, everyone consumes |
| 🚀 **RTK Token Saver** ([RTK](https://github.com/rtk-ai/rtk)) | Compress tool outputs (`git diff`, `grep`, `ls`, `tree`…) before the LLM | Save **20–40% input tokens** per request |
| 🧠 **Headroom Token Saver** ([Headroom](https://github.com/chopratejas/headroom)) | Optional external `/v1/compress` proxy before routing | Save more context tokens without changing clients |
| 🪨 **Caveman Mode** ([Caveman](https://github.com/JuliusBrussee/caveman)) | Inject terse-output prompt → substance preserved | Save **up to 65% output tokens** |
| 🐴 **Ponytail** ([Ponytail](https://github.com/DietrichGebert/ponytail)) | Inject "lazy senior dev" prompt → minimal, YAGNI-first code | Fewer output tokens, less refactoring |
| 📊 **Real-Time Quota Tracking** | Live token count + reset countdown per source | See pool headroom at a glance |
| 🔄 **Format Translation** | OpenAI ↔ Claude ↔ Gemini ↔ Cursor ↔ Kiro ↔ Vertex | Works with any CLI tool |
| 🔄 **Auto Token Refresh** | OAuth tokens refresh automatically | No manual re-login needed |
| 📝 **Request Logging** | Debug mode with full request/response logs | Troubleshoot easily |
| 💾 **Cloud Sync** | Sync config across devices | Same setup everywhere |
| 📊 **Usage Analytics** | Track tokens, cost, trends over time | Understand consumption |
| 🌐 **Deploy Anywhere** | Localhost, VPS, Docker | Flexible deployment |

<details>
<summary><b>📖 Feature Details</b></summary>

### 🚀 RTK Token Saver

Tool outputs (`git diff`, `grep`, `find`, `ls`, `tree`, log dumps...) often eat 30-50% of your prompt budget. RTK detects them and applies smart, lossless compression **before** the request hits the LLM:

- **Filters:** `git-diff`, `git-status`, `grep`, `find`, `ls`, `tree`, `dedup-log`, `smart-truncate`, `read-numbered`, `search-list`
- **Auto-detect:** No config needed — RTK peeks the first 1KB of each `tool_result` and picks the right filter.
- **Safe by design:** If a filter fails, throws, or makes output bigger, RTK silently keeps the original text. Errors never break your request.
- **Universal:** Works across all formats (OpenAI, Claude, Gemini, Cursor, Kiro, OpenAI Responses) because it runs **before** any format translation.
- **Default ON:** Toggle anytime in Dashboard → Endpoint settings.

```
Without RTK: 47K tokens sent to LLM
With RTK:    28K tokens sent to LLM   (40% saved · same context · same answer)
```

### 🧠 Headroom Token Saver

Headroom is optional and runs separately. Potluck calls Headroom's local `/v1/compress` endpoint, then keeps normal routing, fallback, auth, and usage tracking:

```
Client → Potluck → Headroom /v1/compress → Potluck → provider
```

Local setup:

```bash
pip install "headroom-ai[proxy]"
headroom proxy --port 8787
```

Enable in Dashboard → Endpoint → Token Saver → Headroom. Default URL: `http://localhost:8787`.

Docker examples:

```bash
# Headroom service in same Docker network
http://headroom:8787

# Headroom running on host machine
http://host.docker.internal:8787
```

If Headroom is down or returns an error, Potluck fails open and sends the original request.

### 🐴 Ponytail (Lazy Senior Dev)

Ponytail injects a *"lazy senior dev"* system prompt into every request, biasing the LLM toward minimal, YAGNI-first code — deletion over addition, stdlib over new deps, one-liners over abstractions. Adapted from [DietrichGebert/ponytail](https://github.com/DietrichGebert/ponytail).

- **Lite** — Build what's asked, name the lazier alternative.
- **Full** — YAGNI ladder enforced: stdlib → native → existing deps → one-liner → minimal code.
- **Ultra** — YAGNI extremist: deletion first, ship the one-liner, challenge the rest of the requirement in the same response.

Never trades away: input validation, error handling that prevents data loss, security, accessibility, or anything explicitly requested. Enable in Dashboard → Endpoint → Ponytail. Stacks with Caveman (output terseness) and RTK (input compression).

### 📊 Real-Time Quota Tracking

- Token consumption per provider
- Reset countdown (5-hour, daily, weekly)
- Cost estimation for paid tiers
- Monthly spending reports

### 🔄 Format Translation

Seamless translation between formats:
- **OpenAI** ↔ **Claude** ↔ **Gemini** ↔ **Cursor** ↔ **Kiro** ↔ **Vertex** ↔ **Antigravity** ↔ **Ollama** ↔ **OpenAI Responses**
- Your CLI tool sends OpenAI format → Potluck translates → Provider receives native format
- Works with any tool that supports custom OpenAI endpoints

### 👥 Multi-Account Support

- Add multiple accounts per provider
- Auto round-robin or priority-based routing
- Fallback to next account when one hits quota

### 🔄 Auto Token Refresh

- OAuth tokens automatically refresh before expiration
- No manual re-authentication needed
- Seamless experience across all providers

### 📝 Request Logging

- Enable debug mode for full request/response logs
- Track API calls, headers, and payloads
- Troubleshoot integration issues
- Export logs for analysis

### 💾 Cloud Sync

- Sync providers, combos, and settings across devices
- Automatic background sync
- Secure encrypted storage
- Access your setup from anywhere

#### Cloud Runtime Notes

- Prefer server-side cloud variables in production:
  - `BASE_URL` (internal callback URL used by sync scheduler)
  - `CLOUD_URL` (cloud sync endpoint base)
- `NEXT_PUBLIC_BASE_URL` and `NEXT_PUBLIC_CLOUD_URL` are still supported for compatibility/UI, but server runtime now prioritizes `BASE_URL`/`CLOUD_URL`.
- Cloud sync requests now use timeout + fail-fast behavior to avoid UI hanging when cloud DNS/network is unavailable.

### 📊 Usage Analytics

- Track token usage per provider and model
- Cost estimation and spending trends
- Monthly reports and insights

> **💡 Understanding Dashboard Costs:**
>
> The "cost" displayed in Usage Analytics is **for tracking and comparison purposes only**.
> Potluck itself **never charges** you anything. You only pay providers directly (if using paid services).
> Think of it as a "savings tracker" showing how much you're saving by using free models or existing subscriptions.

### 🌐 Deploy Anywhere

- 💻 **Localhost** - Default, works offline
- ☁️ **VPS/Cloud** - Share across your team
- 🐳 **Docker** - One-command deployment

</details>

---

### 📊 Understanding Potluck Costs & Billing

✅ **Potluck software = FREE forever** (open source, never charges)
✅ **Dashboard "costs" = Display/tracking only** (not actual bills)
✅ **You pay providers directly** (subscriptions or API fees)
❌ **Potluck never sends invoices** or charges your card

Potluck is a local supply platform/router. It doesn't have your credit card, can't send
invoices, and has no billing system.

---

## 📖 Setup Guide

<details>
<summary><b>🔐 Subscription Providers (Maximize Value)</b></summary>

### Claude Code (Pro/Max)

```bash
Dashboard → Providers → Connect Claude Code
→ OAuth login → Auto token refresh
→ 5-hour + weekly quota tracking

Models:
  cc/claude-opus-4-7
  cc/claude-opus-4-6
  cc/claude-sonnet-4-6
  cc/claude-haiku-4-5-20251001
```

**Pro Tip:** Use Opus for complex tasks, Sonnet for speed. Potluck tracks quota per model!

### OpenAI Codex (Plus/Pro)

```bash
Dashboard → Providers → Connect Codex
→ OAuth login (port 1455)
→ 5-hour + weekly reset

Models:
  cx/gpt-5.5
  cx/gpt-5.4
  cx/gpt-5.3-codex
  cx/gpt-5.2-codex
```

### GitHub Copilot

```bash
Dashboard → Providers → Connect GitHub
→ OAuth via GitHub
→ Monthly reset (1st of month)

Models:
  gh/gpt-5.4
  gh/claude-opus-4.7
  gh/claude-sonnet-4.6
  gh/gemini-3.1-pro-preview
  gh/grok-code-fast-1
```

### Cursor IDE

```bash
Dashboard → Providers → Connect Cursor
→ OAuth login
→ Monthly subscription

Models:
  cu/claude-4.6-opus-max
  cu/claude-4.5-sonnet-thinking
  cu/gpt-5.3-codex
```

</details>

<details>
<summary><b>💰 Cheap Providers (Backup)</b></summary>

### GLM-5.1 / GLM-4.7 (Daily reset, $0.6/1M)

1. Sign up: [Zhipu AI](https://open.bigmodel.cn/)
2. Get API key from Coding Plan
3. Dashboard → Add API Key:
   - Provider: `glm`
   - API Key: `your-key`

**Use:** `glm/glm-5.1`, `glm/glm-5`, `glm/glm-4.7`

**Pro Tip:** Coding Plan offers 3× quota at 1/7 cost! Reset daily 10:00 AM.

### MiniMax M2.7 (5h reset, $0.20/1M)

1. Sign up: [MiniMax](https://www.minimax.io/)
2. Get API key
3. Dashboard → Add API Key

**Use:** `minimax/MiniMax-M2.7`, `minimax/MiniMax-M2.5`

**Pro Tip:** Cheapest option for long context (1M tokens)!

### Kimi K2.5 ($9/month flat)

1. Subscribe: [Moonshot AI](https://platform.moonshot.ai/)
2. Get API key
3. Dashboard → Add API Key

**Use:** `kimi/kimi-k2.5`, `kimi/kimi-k2.5-thinking`

**Pro Tip:** Fixed $9/month for 10M tokens = $0.90/1M effective cost!

</details>

<details>
<summary><b>🆓 FREE Providers (Recommended)</b></summary>

### Kiro AI (Claude 4.5 + GLM-5 + MiniMax FREE)

```bash
Dashboard → Connect Kiro
→ AWS Builder ID, AWS IAM Identity Center, Google, or GitHub
→ Unlimited usage

Models:
  kr/claude-sonnet-4.5
  kr/claude-haiku-4.5
  kr/glm-5
  kr/MiniMax-M2.5
  kr/qwen3-coder-next
  kr/deepseek-3.2
```

**Pro Tip:** Best free option for Claude. No API key, no payment, fully unlimited.

### OpenCode Free (No auth, auto-fetch models)

```bash
Dashboard → Connect OpenCode Free
→ No login required (passthrough proxy)
→ Models auto-fetched from opencode.ai/zen/v1/models
```

**Pro Tip:** Fastest setup. Just connect and start coding.

### Vertex AI ($300 free credits for new GCP accounts)

```bash
Dashboard → Connect Vertex AI
→ Upload Google Cloud Service Account JSON
→ Enable Vertex AI API in your GCP project

Models:
  vertex/gemini-3.1-pro-preview
  vertex/gemini-3-flash-preview
  vertex/gemini-2.5-flash

Vertex Partner (Anthropic / DeepSeek / GLM / Qwen via Vertex):
  vertex-partner/glm-5-maas
  vertex-partner/deepseek-v3.2-maas
  vertex-partner/qwen3-next-80b-a3b-thinking-maas
```

**Pro Tip:** New Google Cloud accounts get $300 credits free for 90 days. Plenty for daily coding.

</details>

<details>
<summary><b>🔧 CLI Integration</b></summary>

> All examples below use port **20129**. Request a routing profile (e.g. `profile:claude`)
> to consume from an abundant pool, or a direct `provider/model` to bypass routing.

### Cursor IDE

```
Settings → Models → Advanced:
  OpenAI API Base URL: http://localhost:20129/v1
  OpenAI API Key: [from Potluck dashboard]
  Model: profile:claude
```

### Claude Code

Edit `~/.claude/config.json`:

```json
{
  "anthropic_api_base": "http://localhost:20129/v1",
  "anthropic_api_key": "your-potluck-api-key"
}
```

### Codex CLI

```bash
export OPENAI_BASE_URL="http://localhost:20129"
export OPENAI_API_KEY="your-potluck-api-key"

codex "your prompt"
```

### OpenClaw

**Option 1 — Dashboard (recommended):**

```
Dashboard → CLI Tools → OpenClaw → Select Model → Apply
```

**Option 2 — Manual:** Edit `~/.openclaw/openclaw.json`:

```json
{
  "agents": {
    "defaults": {
      "model": {
        "primary": "potluck/kr/claude-sonnet-4.5"
      }
    }
  },
  "models": {
    "providers": {
      "potluck": {
        "baseUrl": "http://127.0.0.1:20129/v1",
        "apiKey": "sk_potluck",
        "api": "openai-completions",
        "models": [
          {
            "id": "kr/claude-sonnet-4.5",
            "name": "Claude Sonnet 4.5 (Kiro Free)"
          }
        ]
      }
    }
  }
}
```

> **Note:** OpenClaw only works with a local Potluck instance. Use `127.0.0.1` instead of `localhost` to avoid IPv6 resolution issues.

### Cline / Continue / RooCode

```
Provider: OpenAI Compatible
Base URL: http://localhost:20129/v1
API Key: [from dashboard]
Model: profile:claude
```

</details>

<details>
<summary><b>🚀 Deployment</b></summary>

### VPS Deployment

```bash
# Clone and install
git clone https://github.com/Ezero23/potluck.git
cd potluck
npm install
npm run build

# Configure
export JWT_SECRET="your-secure-secret-change-this"
export INITIAL_PASSWORD="your-password"
export DATA_DIR="/var/lib/potluck"
export PORT="20129"
export HOSTNAME="0.0.0.0"
export NODE_ENV="production"
export NEXT_PUBLIC_BASE_URL="http://localhost:20129"
export API_KEY_SECRET="endpoint-proxy-api-key-secret"
export MACHINE_ID_SALT="endpoint-proxy-salt"

# Start
npm run start

# Or use PM2
npm install -g pm2
pm2 start npm --name potluck -- start
pm2 save
pm2 startup
```

### Docker

**Build from source:**

```bash
git clone https://github.com/Ezero23/potluck.git
cd potluck
docker build -t potluck .
docker run -d --name potluck -p 20129:20129 \
  -v "$HOME/.potluck:/app/data" -e DATA_DIR=/app/data potluck
```

→ Open http://localhost:20129

**Container defaults:**
- `PORT=20129`
- `HOSTNAME=0.0.0.0`

**Useful commands:**

```bash
docker logs -f potluck
docker restart potluck
docker stop potluck && docker rm potluck
```

**Data persistence:** `$DATA_DIR/db/data.sqlite` on host ↔ `/app/data/db/data.sqlite` in container.

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `JWT_SECRET` | Auto-generated (`$DATA_DIR/jwt-secret`) | JWT signing secret for dashboard auth cookie (override to share across instances) |
| `INITIAL_PASSWORD` | `123456` | First login password when no saved hash exists |
| `DATA_DIR` | `~/.potluck` | Main app data location (SQLite at `$DATA_DIR/db/data.sqlite`; also where `routing.json` is read from) |
| `PORT` | framework default | Service port (`20129` in examples) |
| `HOSTNAME` | framework default | Bind host (Docker defaults to `0.0.0.0`) |
| `NODE_ENV` | runtime default | Set `production` for deploy |
| `BASE_URL` | `http://localhost:20129` | Server-side internal base URL used by cloud sync jobs |
| `CLOUD_URL` | — | Server-side cloud sync endpoint base URL |
| `NEXT_PUBLIC_BASE_URL` | `http://localhost:3000` | Backward-compatible/public base URL (prefer `BASE_URL` for server runtime) |
| `NEXT_PUBLIC_CLOUD_URL` | — | Backward-compatible/public cloud URL (prefer `CLOUD_URL` for server runtime) |
| `API_KEY_SECRET` | `endpoint-proxy-api-key-secret` | HMAC secret for generated API keys |
| `MACHINE_ID_SALT` | `endpoint-proxy-salt` | Salt for stable machine ID hashing |
| `ENABLE_REQUEST_LOGS` | `false` | Enables request/response logs under `logs/` |
| `AUTH_COOKIE_SECURE` | `false` | Force `Secure` auth cookie (set `true` behind HTTPS reverse proxy) |
| `REQUIRE_API_KEY` | `false` | Enforce Bearer API key on `/v1/*` routes (recommended for internet-exposed deploys) |
| `GOOGLE_OAUTH_CLIENT_ID` / `GOOGLE_OAUTH_CLIENT_SECRET` | shared public client | Your own Gemini/Google OAuth client credentials |
| `ANTIGRAVITY_OAUTH_CLIENT_ID` / `ANTIGRAVITY_OAUTH_CLIENT_SECRET` | shared public client | Your own Antigravity OAuth client credentials |
| `HTTP_PROXY`, `HTTPS_PROXY`, `ALL_PROXY`, `NO_PROXY` | empty | Optional outbound proxy for upstream provider calls |

Notes:
- Lowercase proxy variables are also supported: `http_proxy`, `https_proxy`, `all_proxy`, `no_proxy`.
- `.env` is not baked into the Docker image (`.dockerignore`); inject runtime config with `--env-file` or `-e`.
- On Windows, `APPDATA` can be used for local storage path resolution.

### Runtime Files and Storage

- Main app state: `${DATA_DIR}/db/data.sqlite` (SQLite — providers, combos, aliases, keys, settings, usage history)
- Routing profiles: `routing.json` in the project root or `${DATA_DIR}` (hot-reloaded every 30s)
- Auto backups: `${DATA_DIR}/db/backups/`
- Optional request/translator logs: `<repo>/logs/...` when `ENABLE_REQUEST_LOGS=true`

</details>

---

## 📊 Available Models

<details>
<summary><b>View all available models</b></summary>

**Claude Code (`cc/`)** - Pro/Max:
- `cc/claude-opus-4-7`
- `cc/claude-opus-4-6`
- `cc/claude-sonnet-4-6`
- `cc/claude-sonnet-4-5-20250929`
- `cc/claude-haiku-4-5-20251001`

**Codex (`cx/`)** - Plus/Pro:
- `cx/gpt-5.5`
- `cx/gpt-5.4`
- `cx/gpt-5.3-codex`
- `cx/gpt-5.2-codex`
- `cx/gpt-5.1-codex-max`

**GitHub Copilot (`gh/`)**:
- `gh/gpt-5.4`
- `gh/claude-opus-4.7`
- `gh/claude-sonnet-4.6`
- `gh/gemini-3.1-pro-preview`
- `gh/grok-code-fast-1`

**Cursor (`cu/`)** - Subscription:
- `cu/claude-4.6-opus-max`
- `cu/claude-4.5-sonnet-thinking`
- `cu/gpt-5.3-codex`
- `cu/kimi-k2.5`

**GLM (`glm/`)** - $0.6/1M:
- `glm/glm-5.1`
- `glm/glm-5`
- `glm/glm-4.7`

**MiniMax (`minimax/`)** - $0.2/1M:
- `minimax/MiniMax-M2.7`
- `minimax/MiniMax-M2.5`

**Kimi (`kimi/`)** - $9/mo flat:
- `kimi/kimi-k2.5`
- `kimi/kimi-k2.5-thinking`

**Kiro (`kr/`)** - FREE unlimited:
- `kr/claude-sonnet-4.5`
- `kr/claude-haiku-4.5`
- `kr/glm-5`
- `kr/MiniMax-M2.5`
- `kr/qwen3-coder-next`
- `kr/deepseek-3.2`

**OpenCode Free (`oc/`)** - FREE no-auth:
- Auto-fetched from `opencode.ai/zen/v1/models`

**Vertex AI (`vertex/`)** - $300 free credits:
- `vertex/gemini-3.1-pro-preview`
- `vertex/gemini-3-flash-preview`
- `vertex/gemini-2.5-flash`
- `vertex-partner/glm-5-maas`
- `vertex-partner/deepseek-v3.2-maas`

</details>

---

## 🐛 Troubleshooting

**"Language model did not provide messages"**
- Provider quota exhausted → check the pool view (`GET /api/routing/pools`) or dashboard quota tracker
- Solution: use a rotation profile so the request slides to the next healthy source

**Rate limiting**
- A source hit its limit → rotation profiles automatically slide to the next source
- Add more sources to the pool (connect more providers serving the same model family)

**OAuth token expired**
- Auto-refreshed by Potluck
- If issues persist: Dashboard → Provider → Reconnect

**High costs**
- Enable RTK in Dashboard → Endpoint settings (default ON, saves 20-40% tokens)
- Check usage stats in Dashboard
- Add cheap/free sources to the relevant pool

**Dashboard opens on wrong port**
- Set `PORT=20129` and `NEXT_PUBLIC_BASE_URL=http://localhost:20129`

**First login not working**
- Check `INITIAL_PASSWORD` in `.env`
- If unset, fallback password is `123456`

**routing.json changes not taking effect**
- Config is cached for 30s; wait up to 30 seconds or restart
- Confirm the file is valid JSON in the project root or `${DATA_DIR}`

**No request logs under `logs/`**
- Set `ENABLE_REQUEST_LOGS=true`

---

## 🛠️ Tech Stack

- **Runtime**: Node.js 20+
- **Framework**: Next.js 16
- **UI**: React 19 + Tailwind CSS 4
- **Database**: SQLite (better-sqlite3 / node:sqlite / sql.js fallback)
- **Streaming**: Server-Sent Events (SSE)
- **Auth**: OAuth 2.0 (PKCE) + JWT + API Keys

---

## 📝 API Reference

### Chat Completions

```bash
POST http://localhost:20129/v1/chat/completions
Authorization: Bearer your-api-key
Content-Type: application/json

{
  "model": "profile:claude",
  "messages": [
    {"role": "user", "content": "Write a function to..."}
  ],
  "stream": true
}
```

### List Models

```bash
GET http://localhost:20129/v1/models
Authorization: Bearer your-api-key

→ Returns all models + profiles in OpenAI format
```

### Routing Pools

```bash
GET http://localhost:20129/api/routing/pools

→ Every profile as a pool: resolved sources, per-source health
  (quotaPercent, errorRate5m, healthy), and rotation stats (useCount, lastUsedAt)
```

---

## 📧 Support

- **GitHub**: [github.com/Ezero23/potluck](https://github.com/Ezero23/potluck)
- **Issues**: [github.com/Ezero23/potluck/issues](https://github.com/Ezero23/potluck/issues)

---

## 🙏 Acknowledgments

Built on the shoulders of giants:

- **[CLIProxyAPI](https://github.com/router-for-me/CLIProxyAPI)** — original Go implementation that inspired this JavaScript port.
- **[RTK](https://github.com/rtk-ai/rtk)** — Rust token-saver. Potluck ports its compression pipeline to JS → **−20-40% input tokens** on every request.
- **[Caveman](https://github.com/JuliusBrussee/caveman)** by **[@JuliusBrussee](https://github.com/JuliusBrussee)** — *"why use many token when few token do trick"*. Potluck adapts its prompt → **−65% output tokens**.
- **[Ponytail](https://github.com/DietrichGebert/ponytail)** by **[@DietrichGebert](https://github.com/DietrichGebert)** — *"lazy senior dev"* skill. Potluck injects its YAGNI-first ladder → **fewer tokens, less code, shorter diffs**.

Huge thanks to these authors — without their work, Potluck's token-saving features wouldn't exist. ⭐ them on GitHub!

---

## 📄 License

MIT License - see [LICENSE](LICENSE) for details.

---

<div align="center">
  <sub>好模型管够，不用选，用不完，不断线 · Built for teams who code 24/7</sub>
</div>
