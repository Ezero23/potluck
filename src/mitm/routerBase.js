function normalizeMitmRouterBase(value) {
  const trimmed = String(value || "").trim().replace(/\/+$/, "");
  if (!trimmed) {
    throw new Error("MITM router base URL is not configured");
  }

  let url;
  try {
    url = new URL(trimmed);
  } catch {
    throw new Error("Invalid MITM router base URL");
  }

  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("MITM router base URL must use http or https");
  }
  if (url.username || url.password) {
    throw new Error("MITM router base URL must not include credentials");
  }

  return trimmed;
}

module.exports = { normalizeMitmRouterBase };
