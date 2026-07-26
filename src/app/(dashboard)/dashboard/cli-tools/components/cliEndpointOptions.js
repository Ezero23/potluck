const stripTrailingSlash = (url) => (url || "").replace(/\/+$/, "");

export const ensureV1 = (url) => {
  const trimmed = stripTrailingSlash(url);
  if (!trimmed) return "";
  return /\/v1$/.test(trimmed) ? trimmed : `${trimmed}/v1`;
};

export function buildEndpointOptions({
  localBaseUrl = "",
  requiresExternalUrl = false,
  tunnelEnabled = false,
  tunnelPublicUrl = "",
  tailscaleEnabled = false,
  tailscaleUrl = "",
  cloudEnabled = false,
  cloudUrl = "",
  savedPresets = [],
  withV1 = true,
}) {
  const options = [];
  const normalize = (url) => (withV1 ? ensureV1(url) : stripTrailingSlash(url));

  if (!requiresExternalUrl && localBaseUrl) {
    const url = normalize(localBaseUrl);
    options.push({ value: "local", label: url, url });
  }
  if (tunnelEnabled && tunnelPublicUrl) {
    const url = normalize(tunnelPublicUrl);
    options.push({ value: "tunnel", label: url, url });
  }
  if (tailscaleEnabled && tailscaleUrl) {
    const url = normalize(tailscaleUrl);
    options.push({ value: "tailscale", label: url, url });
  }
  if (cloudEnabled && cloudUrl) {
    const url = normalize(cloudUrl);
    options.push({ value: "cloud", label: url, url });
  }
  savedPresets.forEach((preset) => {
    options.push({
      value: `saved:${preset.name}`,
      label: preset.baseUrl,
      url: preset.baseUrl,
      saved: true,
    });
  });

  return options;
}
