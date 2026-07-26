# Claude Code

Potluck exposes an Anthropic-compatible Messages API for Claude Code. The
recommended setup uses Potluck's dashboard, which writes the same environment
settings documented by Anthropic for LLM gateways.

## Before you start

1. Start Potluck and open `http://localhost:21023/dashboard`.
2. Add and test at least one provider.
3. Open **Endpoint**, create an API key, and copy it.
4. Install Claude Code by following the
   [official setup guide](https://docs.anthropic.com/en/docs/claude-code/getting-started).

Available model IDs are specific to your Potluck instance. Query the model list
or select a model in the dashboard instead of copying a fixed ID from a guide.

## Automatic setup

1. Open `http://localhost:21023/dashboard/cli-tools`.
2. Expand **Claude Code**.
3. Select the local endpoint and an API key.
4. Map the Opus, Sonnet, and Haiku aliases to models available in Potluck.
5. Select **Apply settings**.

Potluck merges these values into the `env` object in
`~/.claude/settings.json`; unrelated Claude Code settings are preserved.

Run Claude Code from your project directory:

```bash
cd /path/to/your/project
claude
```

## Manual setup

If the dashboard cannot access the Claude Code configuration directory, merge
the following into `~/.claude/settings.json`:

```json
{
  "env": {
    "ANTHROPIC_BASE_URL": "http://localhost:21023/v1",
    "ANTHROPIC_AUTH_TOKEN": "YOUR_POTLUCK_API_KEY",
    "ANTHROPIC_DEFAULT_OPUS_MODEL": "MODEL_ID",
    "ANTHROPIC_DEFAULT_SONNET_MODEL": "MODEL_ID",
    "ANTHROPIC_DEFAULT_HAIKU_MODEL": "MODEL_ID"
  }
}
```

The three model mappings may point to different models. Use only IDs returned
by your Potluck instance. `ANTHROPIC_AUTH_TOKEN` is sent as gateway
authentication; do not place an upstream provider key here.

## Verify the connection

Check Potluck:

```bash
curl http://localhost:21023/api/health
```

List models available to the selected key:

```bash
curl http://localhost:21023/v1/models \
  -H "Authorization: Bearer YOUR_POTLUCK_API_KEY"
```

Then make a non-interactive Claude Code request:

```bash
claude -p "Reply with: Potluck connection OK"
```

## Remote deployment

For a remote instance, use its HTTPS URL:

```json
{
  "env": {
    "ANTHROPIC_BASE_URL": "https://potluck.example.com/v1",
    "ANTHROPIC_AUTH_TOKEN": "YOUR_POTLUCK_API_KEY"
  }
}
```

Enable endpoint API-key authentication under **Dashboard → Endpoint** before
exposing Potluck publicly.

## Troubleshooting

- **Connection refused:** confirm Potluck is running on `21023`.
- **401 response:** reselect or recreate the Potluck key; do not use an
  Anthropic provider key as the Potluck gateway key.
- **Model not found:** update the alias mappings with exact IDs from
  `/v1/models`.
- **Claude opens its normal login flow:** confirm both `ANTHROPIC_BASE_URL` and
  `ANTHROPIC_AUTH_TOKEN` are inside the `env` object.
- **Remote connection fails:** use HTTPS and remember that `localhost` refers
  to the machine running Claude Code.

See Anthropic's
[LLM gateway documentation](https://docs.anthropic.com/en/docs/claude-code/llm-gateway)
for the upstream meaning of these environment variables.
