# Potluck Test Suite

Vitest coverage for Potluck's local application, API handlers, routing, providers, translators, and persistence.

## Setup

Install the root and test dependencies with the repository's normal `npm install` flow.

## Running Tests

```bash
cd /path/to/potluck
npm test
```

## Test Files

| File | What it tests |
|------|--------------|
| `unit/embeddingsCore.test.js` | `open-sse/handlers/embeddingsCore.js` — core logic: body builder, URL router, headers, handler flow |
| `unit/embeddings-handler.test.js` | Local Next.js/SSE handler: auth, validation, fallback, CORS, and route delegation |

## Embeddings coverage

### `embeddingsCore.test.js` (36 tests)
- `buildEmbeddingsBody`: single string, array, encoding_format, default float
- `buildEmbeddingsUrl`: openai, openrouter, openai-compatible-*, unsupported providers
- `buildEmbeddingsHeaders`: per-provider header sets, fallback to accessToken
- `handleEmbeddingsCore` input validation: missing, wrong type, null, empty
- `handleEmbeddingsCore` success: response format, CORS, Content-Type, callbacks
- `handleEmbeddingsCore` errors: 400/429/500, network error, invalid JSON
- `handleEmbeddingsCore` token refresh: 401 retry, graceful fallback

### `embeddings-handler.test.js`
- CORS OPTIONS: 200 response, empty body, correct headers
- Authentication: optional local access, required keys, invalid keys
- Body validation: invalid JSON, missing model, missing input, bad model
- Happy path: route delegation, resolved model, credentials, and request body
- Account fallback: rotate after a retryable failure; return `Retry-After` when exhausted
- Error propagation: non-fallback provider errors pass through unchanged
