# Cline

Cline can connect to Potluck through Potluck's OpenAI-compatible API. Use
Cline's **OpenAI Compatible** provider for manual setup; the old Ollama-based
instructions do not describe the current Cline interface.

## Before you start

1. Start Potluck and open `http://localhost:21023/dashboard`.
2. Add and test at least one provider.
3. Open **Endpoint**, create an API key, and copy it.
4. Install Cline from its
   [official installation page](https://docs.cline.bot/getting-started/installing-cline).

Your model ID must come from your own Potluck instance. Potluck does not promise
that any particular upstream model is present.

## Automatic setup

When Cline and Potluck run under the same desktop user:

1. Open `http://localhost:21023/dashboard/cli-tools`.
2. Expand **Cline**.
3. Select the local endpoint, API key, and a model.
4. Select **Apply**.
5. Reload the VS Code window if Cline was already open.

Potluck updates only its Cline provider fields. You can use **Reset** on the
same card to remove the Potluck connection.

## Manual setup

Use this method when Cline is on another machine or the automatic setup cannot
detect it.

1. Open Cline in VS Code and select the settings icon.
2. Set **API Provider** to **OpenAI Compatible**.
3. Enter these values:

```text
Base URL: http://localhost:21023/v1
API Key: YOUR_POTLUCK_API_KEY
Model ID: MODEL_ID_FROM_POTLUCK
```

Keep `/v1` at the end of the Base URL. Do not select Ollama merely to reach
Potluck; Cline has a dedicated OpenAI-compatible provider.

## Find a valid model ID

```bash
curl http://localhost:21023/v1/models \
  -H "Authorization: Bearer YOUR_POTLUCK_API_KEY"
```

Copy an exact `data[].id` value from the response into Cline's **Model ID**
field. Do not infer a model ID from a provider's marketing name.

## Verify the connection

Check Potluck independently of Cline:

```bash
curl http://localhost:21023/api/health
```

Then use Cline's provider verification control, or send a short message in a
new Cline task. Review Potluck's **Usage** page to confirm the request arrived.

## Remote deployment

For a remote Potluck instance, use its HTTPS address:

```text
Base URL: https://potluck.example.com/v1
```

`localhost` refers to the machine running VS Code. It cannot reach Potluck on a
different computer. Enable endpoint API-key authentication under
**Dashboard → Endpoint** before exposing Potluck publicly.

## Troubleshooting

- **Connection refused:** confirm Potluck is running on `21023` and that Cline
  can reach that machine.
- **401 response:** select or recreate a Potluck API key. Do not enter an
  upstream provider key in Cline.
- **Model not found:** query `/v1/models` and copy the exact returned ID.
- **404 response:** confirm the manual Base URL ends in `/v1`.
- **Settings do not take effect:** reload the VS Code window and open a new
  Cline task.
- **Tool calls behave incorrectly:** try another model known to support tool
  use; an available text model is not automatically suitable for agent tasks.

For Cline's current field names and behavior, see its
[OpenAI Compatible provider documentation](https://docs.cline.bot/provider-config/openai-compatible).
