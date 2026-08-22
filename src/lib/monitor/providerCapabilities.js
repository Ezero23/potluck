const DEFAULT_PROVIDER_CAPABILITIES = Object.freeze({
  streaming: true,
  tools: true,
  vision: false,
  reasoning: false,
  quota: false,
  authTypes: ['oauth', 'apikey'],
  transports: ['openai-compatible']
});

const REGISTRY = Object.freeze({
  openai: { transports: ['openai-chat', 'openai-responses'], quota: true, reasoning: true, vision: true },
  anthropic: { transports: ['anthropic-messages'], quota: true, reasoning: true, vision: true },
  claude: { transports: ['anthropic-messages'], quota: true, reasoning: true, vision: true },
  google: { transports: ['gemini'], quota: true, reasoning: true, vision: true },
  gemini: { transports: ['gemini'], quota: true, reasoning: true, vision: true },
  deepseek: { transports: ['openai-compatible'], quota: true, reasoning: true },
  kimi: { transports: ['openai-compatible'], quota: true, reasoning: true, vision: true },
  glm: { transports: ['openai-compatible'], quota: true, reasoning: true, vision: true },
  zai: { transports: ['openai-compatible'], quota: true, reasoning: true, vision: true },
  minimax: { transports: ['openai-compatible'], quota: true, reasoning: true, vision: true },
  mimo: { transports: ['openai-compatible'], quota: true, vision: true },
  grok: { transports: ['openai-compatible'], quota: true, reasoning: true, vision: true },
  openrouter: { transports: ['openai-compatible'], quota: true, vision: true, reasoning: true },
  qwen: { transports: ['openai-compatible'], quota: true, reasoning: true, vision: true },
  ollama: { transports: ['openai-compatible'], authTypes: ['local'], quota: false, vision: true },
  nvidia: { transports: ['openai-compatible'], quota: true, reasoning: true, vision: true },
  volcengine: { transports: ['openai-compatible'], quota: true, reasoning: true, vision: true }
});

function normalizedProvider(value) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
}

export function getProviderCapabilities(provider) {
  const id = normalizedProvider(provider);
  const entry = REGISTRY[id] || {};
  return {
    provider: id || 'unknown',
    ...DEFAULT_PROVIDER_CAPABILITIES,
    ...entry,
    authTypes: [...(entry.authTypes || DEFAULT_PROVIDER_CAPABILITIES.authTypes)],
    transports: [...(entry.transports || DEFAULT_PROVIDER_CAPABILITIES.transports)]
  };
}

export function getProviderCapabilityRegistry(providers = []) {
  const ids = new Set((Array.isArray(providers) ? providers : []).map((row) => normalizedProvider(row?.provider)).filter(Boolean));
  for (const id of Object.keys(REGISTRY)) ids.add(id);
  return [...ids].sort().map((id) => getProviderCapabilities(id));
}

export const PROVIDER_CAPABILITY_REGISTRY = REGISTRY;
