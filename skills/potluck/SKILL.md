---
name: potluck
description: Entry point for Potluck — local/remote AI gateway with OpenAI-compatible REST for chat, image, TTS, embeddings, web search, web fetch. Use when the user mentions Potluck, POTLUCK_URL, or wants AI without writing provider boilerplate. This skill covers setup + indexes capability skills; fetch the relevant capability SKILL.md from the URLs below when needed.
---

# Potluck

Local/remote AI gateway exposing OpenAI-compatible REST. One key, many providers, auto-fallback.

## Setup

```bash
export POTLUCK_URL="http://localhost:21023"      # or VPS / tunnel URL
export POTLUCK_KEY="sk-..."                      # from Dashboard → Keys (only if requireApiKey=true)
```

All requests: `${POTLUCK_URL}/v1/...` with header `Authorization: Bearer ${POTLUCK_KEY}` (omit if auth disabled).

Verify: `curl $POTLUCK_URL/api/health` → `{"ok":true}`

## Discover models

```bash
curl $POTLUCK_URL/v1/models                  # chat/LLM (default)
curl $POTLUCK_URL/v1/models/image            # image-gen
curl $POTLUCK_URL/v1/models/tts              # text-to-speech
curl $POTLUCK_URL/v1/models/embedding        # embeddings
curl $POTLUCK_URL/v1/models/web              # web search + fetch (entries have `kind` field)
curl $POTLUCK_URL/v1/models/stt              # speech-to-text
curl $POTLUCK_URL/v1/models/image-to-text    # vision
```

Use `data[].id` as `model` field in requests. Combos appear with `owned_by:"combo"`.

Response shape:
```json
{ "object": "list", "data": [
  { "id": "openai/gpt-5", "object": "model", "owned_by": "openai", "created": 1735000000 },
  { "id": "tavily/search", "object": "model", "kind": "webSearch", "owned_by": "tavily", "created": 1735000000 }
]}
```

## Capability skills

When the user needs a specific capability, fetch that skill's `SKILL.md` from its raw URL:

| Capability | Raw URL |
|---|---|
| Chat / code-gen | https://raw.githubusercontent.com/Ezero23/potluck/refs/heads/main/skills/potluck-chat/SKILL.md |
| Image generation | https://raw.githubusercontent.com/Ezero23/potluck/refs/heads/main/skills/potluck-image/SKILL.md |
| Text-to-speech | https://raw.githubusercontent.com/Ezero23/potluck/refs/heads/main/skills/potluck-tts/SKILL.md |
| Speech-to-text | https://raw.githubusercontent.com/Ezero23/potluck/refs/heads/main/skills/potluck-stt/SKILL.md |
| Embeddings | https://raw.githubusercontent.com/Ezero23/potluck/refs/heads/main/skills/potluck-embeddings/SKILL.md |
| Web search | https://raw.githubusercontent.com/Ezero23/potluck/refs/heads/main/skills/potluck-web-search/SKILL.md |
| Web fetch (URL → markdown) | https://raw.githubusercontent.com/Ezero23/potluck/refs/heads/main/skills/potluck-web-fetch/SKILL.md |

## Errors

- 401 → set/refresh `POTLUCK_KEY` (Dashboard → Keys)
- 400 `Invalid model format` → check `model` exists in `/v1/models/<kind>`
- 503 `All accounts unavailable` → wait `retry-after` or add another provider account
