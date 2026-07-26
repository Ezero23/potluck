export function hasPotluckProvider(config) {
  const provider = config?.providers?.potluck;
  return Boolean(provider && typeof provider === "object" && !Array.isArray(provider));
}
