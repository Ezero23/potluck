# OpenAI Codex CLI

Potluck can serve Codex through its OpenAI-compatible Responses API. The
recommended setup uses Potluck's dashboard so you do not have to edit Codex
configuration files by hand.

## Before you start

1. Start Potluck and open `http://localhost:21023/dashboard`.
2. Add and test at least one provider.
3. Open **Endpoint**, create an API key, and copy it.
4. Install Codex CLI by following the
   [official installation guide](https://developers.openai.com/codex/cli).

Do not copy a model name from this page. Your available models depend on the
providers and aliases configured in your Potluck instance.

## Automatic setup

1. Open `http://localhost:21023/dashboard/cli-tools`.
2. Expand **OpenAI Codex CLI**.
3. Select the local endpoint, an API key, and a model.
4. Select **Apply settings**.

Potluck merges its provider into `~/.codex/config.toml` and stores the selected
key in `~/.codex/auth.json`. Existing unrelated Codex settings are preserved.

Run Codex from your project directory:

```bash
cd /path/to/your/project
codex
```

## Manual setup

Use manual setup only when Potluck and Codex run on different machines or the
dashboard cannot access the Codex configuration directory.

Add the following to `~/.codex/config.toml`, replacing `MODEL_ID` with a value
returned by Potluck:

```toml
model = "MODEL_ID"
model_provider = "potluck"

[model_providers.potluck]
name = "Potluck"
base_url = "http://localhost:21023/v1"
wire_api = "responses"
```

Codex reads API-key authentication from `~/.codex/auth.json`. If that file
already exists, merge these fields instead of overwriting the file:

```json
{
  "auth_mode": "apikey",
  "OPENAI_API_KEY": "YOUR_POTLUCK_API_KEY"
}
```

The configuration format above matches Potluck's built-in Codex configurator
and Codex's current `config.toml` provider format.

## Verify the connection

Check Potluck first:

```bash
curl http://localhost:21023/api/health
```

Then list the model IDs available to your key:

```bash
curl http://localhost:21023/v1/models \
  -H "Authorization: Bearer YOUR_POTLUCK_API_KEY"
```

Use one of the returned IDs:

```bash
codex --model MODEL_ID "Explain this repository"
```

## Remote deployment

Replace `http://localhost:21023/v1` with your HTTPS Potluck URL followed by
`/v1`, for example:

```toml
base_url = "https://potluck.example.com/v1"
```

Do not expose a remote Potluck instance without enabling endpoint API-key
authentication under **Dashboard → Endpoint**.

## Troubleshooting

- **Connection refused:** confirm Potluck is running and that the configured
  URL uses port `21023`.
- **401 response:** select an existing key in **Dashboard → CLI Tools**, or
  update `OPENAI_API_KEY` in `~/.codex/auth.json`.
- **Model not found:** query `/v1/models` and use the exact returned ID.
- **Codex still contacts OpenAI directly:** confirm `model_provider =
  "potluck"` is a top-level entry in `~/.codex/config.toml`.
- **Remote connection fails:** use HTTPS and confirm the public URL reaches the
  same Potluck service; `localhost` always refers to the Codex machine.
