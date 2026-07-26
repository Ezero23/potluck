# Continue

Continue can use Potluck as an OpenAI-compatible model provider. Current
Continue releases prefer `config.yaml`; `config.json` is deprecated.

## Before you start

1. Start Potluck and open `http://localhost:21023/dashboard`.
2. Add and test at least one provider.
3. Open **Endpoint**, create an API key, and copy it.
4. Install the Continue extension from its
   [official documentation](https://docs.continue.dev/getting-started/install).

## Find a valid model ID

```bash
curl http://localhost:21023/v1/models \
  -H "Authorization: Bearer YOUR_POTLUCK_API_KEY"
```

Choose one exact `data[].id` value. The examples below use `MODEL_ID` as a
placeholder because each Potluck installation has a different model catalog.

## Store the API key

Create or edit `~/.continue/.env`:

```dotenv
POTLUCK_API_KEY=YOUR_POTLUCK_API_KEY
```

Do not commit this file. Continue's IDE extension does not reliably inherit
variables exported only in your shell, so the `.env` file is the supported
local secret source.

## Configure Continue

Open Continue's config selector, select the gear icon, and edit the local
`config.yaml`. The default global location is `~/.continue/config.yaml`.

Add a Potluck model:

```yaml
name: Potluck
version: 1.0.0
schema: v1

models:
  - name: Potluck
    provider: openai
    model: MODEL_ID
    apiBase: http://localhost:21023/v1
    apiKey: ${{ secrets.POTLUCK_API_KEY }}
    roles:
      - chat
      - edit
      - apply
```

If you already have a config, merge the model entry into its existing
`models` list instead of replacing the whole file. Restart or reload the IDE
after changing `~/.continue/.env`.

## Add more models

Add another item under `models` and give it a unique `name`:

```yaml
  - name: Potluck secondary
    provider: openai
    model: ANOTHER_MODEL_ID
    apiBase: http://localhost:21023/v1
    apiKey: ${{ secrets.POTLUCK_API_KEY }}
    roles:
      - chat
```

Only use model IDs returned by your Potluck instance. Do not copy fixed model
lists from old guides.

## Verify the connection

Check Potluck:

```bash
curl http://localhost:21023/api/health
```

Open Continue Chat, select the configured Potluck model, and send a short
message. If Agent mode needs tool calls, choose a model that actually supports
tool use.

## Remote deployment

Change `apiBase` to your HTTPS endpoint:

```yaml
apiBase: https://potluck.example.com/v1
```

Enable endpoint API-key authentication under **Dashboard → Endpoint** before
exposing Potluck publicly. `localhost` always refers to the machine running
the Continue extension.

## Troubleshooting

- **Config is ignored:** use `config.yaml`, not the deprecated `config.json`,
  and make sure `name`, `version`, and `schema` are present.
- **Secret is missing:** place `POTLUCK_API_KEY=...` in
  `~/.continue/.env`, then reload the IDE.
- **401 response:** verify the Potluck key, not an upstream provider key.
- **404 response:** confirm `apiBase` ends with `/v1`.
- **Model not found:** copy an exact ID from `/v1/models`.
- **Agent tools are unavailable:** select a tool-capable model; optionally add
  `capabilities: [tool_use]` only after confirming the model supports it.

See Continue's current
[`config.yaml` reference](https://docs.continue.dev/reference) and
[OpenAI-compatible provider guide](https://docs.continue.dev/customize/model-providers/top-level/openai).
