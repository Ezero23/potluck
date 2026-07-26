const HTTP_PROTOCOLS = new Set(["http:", "https:"]);

const firstHeaderValue = (value) => String(value || "").split(",")[0].trim();

const parseOrigin = (value) => {
  try {
    const url = new URL(String(value || "").trim());
    if (!HTTP_PROTOCOLS.has(url.protocol) || url.username || url.password) return "";
    return url.origin;
  } catch {
    return "";
  }
};

const parseForwardedOrigin = (protocol, host) => {
  const normalizedProtocol = firstHeaderValue(protocol).replace(/:$/, "");
  const normalizedHost = firstHeaderValue(host);
  if (!["http", "https"].includes(normalizedProtocol) || !normalizedHost) return "";

  const origin = parseOrigin(`${normalizedProtocol}://${normalizedHost}`);
  if (!origin) return "";

  const parsed = new URL(origin);
  return parsed.host === normalizedHost ? origin : "";
};

export function resolveRequestOrigin({
  requestUrl,
  forwardedProto = "",
  forwardedHost = "",
  host = "",
  configuredBaseUrl = "",
}) {
  const configuredOrigin = parseOrigin(configuredBaseUrl);
  if (configuredOrigin) return configuredOrigin;

  const requestOrigin = parseOrigin(requestUrl);
  const requestProtocol = requestOrigin ? new URL(requestOrigin).protocol : "";
  const proxyOrigin = parseForwardedOrigin(
    forwardedProto || requestProtocol,
    forwardedHost || host
  );

  return proxyOrigin || requestOrigin;
}

export function getRequestOrigin(request) {
  return resolveRequestOrigin({
    requestUrl: request?.url,
    forwardedProto: request?.headers?.get?.("x-forwarded-proto"),
    forwardedHost: request?.headers?.get?.("x-forwarded-host"),
    host: request?.headers?.get?.("host"),
    configuredBaseUrl:
      process.env.BASE_URL ||
      process.env.NEXT_PUBLIC_BASE_URL ||
      "",
  });
}
