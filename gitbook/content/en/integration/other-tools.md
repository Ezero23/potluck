# OpenAI-compatible clients

Potluck can be used by clients that let you configure an OpenAI-compatible
Base URL, bearer API key, and model ID. Compatibility is not automatic for
every tool that mentions OpenAI: the client must support the endpoint and
request format it sends.

## Connection values

```text
Base URL: http://localhost:21023/v1
API Key: YOUR_POTLUCK_API_KEY
Model: MODEL_ID_FROM_POTLUCK
```

For a remote deployment, replace the Base URL with
`https://potluck.example.com/v1`.

Create the gateway key under **Dashboard → Endpoint**. Do not put an upstream
provider key into a client configured to call Potluck.

## Discover models

```bash
curl http://localhost:21023/v1/models \
  -H "Authorization: Bearer YOUR_POTLUCK_API_KEY"
```

Use an exact `data[].id` value. Available models depend on the connections,
aliases, disabled models, and combos configured in that Potluck instance.

## Test with curl

Set temporary shell variables:

```bash
export POTLUCK_BASE_URL="http://localhost:21023/v1"
export POTLUCK_API_KEY="YOUR_POTLUCK_API_KEY"
export POTLUCK_MODEL="MODEL_ID_FROM_POTLUCK"
```

Send a non-streaming Chat Completions request:

```bash
curl "$POTLUCK_BASE_URL/chat/completions" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $POTLUCK_API_KEY" \
  -d "{
    \"model\": \"$POTLUCK_MODEL\",
    \"messages\": [
      {\"role\": \"user\", \"content\": \"Reply with: Potluck connection OK\"}
    ],
    \"stream\": false
  }"
```

Run this test before configuring a third-party tool. It separates Potluck or
provider problems from client-specific configuration problems.

## Python OpenAI SDK

Install the current SDK:

```bash
python -m pip install openai
```

```python
import os
from openai import OpenAI

client = OpenAI(
    api_key=os.environ["POTLUCK_API_KEY"],
    base_url=os.getenv("POTLUCK_BASE_URL", "http://localhost:21023/v1"),
)

response = client.chat.completions.create(
    model=os.environ["POTLUCK_MODEL"],
    messages=[
        {"role": "user", "content": "Reply with: Potluck connection OK"}
    ],
)

print(response.choices[0].message.content)
```

## JavaScript OpenAI SDK

Install the current SDK:

```bash
npm install openai
```

```javascript
import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.POTLUCK_API_KEY,
  baseURL: process.env.POTLUCK_BASE_URL ?? "http://localhost:21023/v1",
});

const response = await client.chat.completions.create({
  model: process.env.POTLUCK_MODEL,
  messages: [
    { role: "user", content: "Reply with: Potluck connection OK" },
  ],
});

console.log(response.choices[0].message.content);
```

## HTTP clients

For Postman, Insomnia, or a similar client:

```text
Method: POST
URL: http://localhost:21023/v1/chat/completions
Content-Type: application/json
Authorization: Bearer YOUR_POTLUCK_API_KEY
```

Body:

```json
{
  "model": "MODEL_ID_FROM_POTLUCK",
  "messages": [
    {
      "role": "user",
      "content": "Reply with: Potluck connection OK"
    }
  ],
  "stream": false
}
```

## Supported API families

Potluck exposes several compatibility routes, including:

| Client format | Route |
| --- | --- |
| OpenAI Chat Completions | `/v1/chat/completions` |
| OpenAI Responses | `/v1/responses` |
| Anthropic Messages | `/v1/messages` |
| Model discovery | `/v1/models` |
| Embeddings | `/v1/embeddings` |
| Image generation | `/v1/images/generations` |
| Speech | `/v1/audio/speech` |
| Transcription | `/v1/audio/transcriptions` |

A route existing does not mean every upstream model supports that capability.
Use a model whose kind and provider support match the request.

## Troubleshooting

- **Connection refused:** check `http://localhost:21023/api/health`.
- **401 response:** verify the Potluck gateway key and Bearer header.
- **404 response:** confirm the client Base URL includes `/v1` exactly once.
- **Model error:** query `/v1/models` and use an exact returned ID.
- **Tool calls fail:** select a model with native tool support.
- **Remote client cannot connect:** use HTTPS and remember that `localhost`
  refers to the client machine.
- **A client has no Base URL field:** it cannot be assumed compatible with
  Potluck; use a documented integration instead.

## Security

- Keep API keys in environment variables or the client's secret store.
- Do not commit `.env` files.
- Enable endpoint API-key authentication before exposing Potluck publicly.
- Use HTTPS for remote connections.
- Treat the Potluck key separately from upstream provider credentials.

Framework APIs change frequently. For LangChain, LlamaIndex, and other
frameworks, start from their current OpenAI-compatible provider documentation
and apply the three connection values shown at the top of this page.
