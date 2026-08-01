# Potluck Agent Skills

These files describe how an agent can call a running Potluck instance. They are
intended for clients that support importing instruction or skill files. Support
for remote skill URLs depends on the client.

Start with the **potluck** entry skill. It covers the common setup and links to
the capability-specific files.

## Skills

| Capability | Copy link below and paste to your AI |
|---|---|
| **Entry / Setup** (start here) | https://raw.githubusercontent.com/Ezero23/potluck/refs/heads/main/skills/potluck/SKILL.md |
| Chat / code-gen | https://raw.githubusercontent.com/Ezero23/potluck/refs/heads/main/skills/potluck-chat/SKILL.md |
| Image generation | https://raw.githubusercontent.com/Ezero23/potluck/refs/heads/main/skills/potluck-image/SKILL.md |
| Text-to-speech | https://raw.githubusercontent.com/Ezero23/potluck/refs/heads/main/skills/potluck-tts/SKILL.md |
| Speech-to-text | https://raw.githubusercontent.com/Ezero23/potluck/refs/heads/main/skills/potluck-stt/SKILL.md |
| Embeddings | https://raw.githubusercontent.com/Ezero23/potluck/refs/heads/main/skills/potluck-embeddings/SKILL.md |
| Web search | https://raw.githubusercontent.com/Ezero23/potluck/refs/heads/main/skills/potluck-web-search/SKILL.md |
| Web fetch (URL → markdown) | https://raw.githubusercontent.com/Ezero23/potluck/refs/heads/main/skills/potluck-web-fetch/SKILL.md |

## Use with a compatible client

Give the client the raw entry-skill URL using its supported import mechanism:

```
Read this skill and use it: https://raw.githubusercontent.com/Ezero23/potluck/refs/heads/main/skills/potluck/SKILL.md
```

The requested capability still requires a corresponding provider configured in
Potluck. Importing a skill does not create provider access or credentials.

## Configure the endpoint

```bash
export POTLUCK_URL="http://localhost:21023"

# Set this only when endpoint API-key enforcement is enabled.
export POTLUCK_KEY="your-potluck-endpoint-key"
```

For Docker or production, replace `POTLUCK_URL` with the address and port of
that deployment. Verify it with:

```bash
curl "$POTLUCK_URL/api/health"
```

Expected response:

```json
{"ok":true}
```

## Links

- Source: https://github.com/Ezero23/potluck
- Documentation: https://github.com/Ezero23/potluck#readme
