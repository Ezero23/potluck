import { proxyAwareFetch } from "open-sse/utils/proxyFetch.js";

const DEFAULT_TEST_URL = "https://google.com/";
const DEFAULT_TIMEOUT_MS = 8000;

function getErrorMessage(err) {
  if (!err) return "Unknown error";
  const base = err?.message || String(err);
  const causeCode = err?.cause?.code || err?.code;
  const causeMessage = err?.cause?.message;

  if (causeMessage && causeMessage !== base) {
    return causeCode ? `${base}: ${causeMessage} (${causeCode})` : `${base}: ${causeMessage}`;
  }

  if (causeCode && !base.includes(causeCode)) {
    return `${base} (${causeCode})`;
  }

  return base;
}

function normalizeString(value) {
  if (value === undefined || value === null) return "";
  return String(value).trim();
}

function parseProxyUrl(value) {
  try {
    return new URL(value).toString();
  } catch {
    try {
      return new URL(`http://${value}`).toString();
    } catch {
      return null;
    }
  }
}

export async function testProxyUrl({ proxyUrl, testUrl, timeoutMs } = {}) {
  const normalizedProxyUrl = normalizeString(proxyUrl);
  if (!normalizedProxyUrl) {
    return { ok: false, status: 400, error: "proxyUrl is required" };
  }

  const normalizedTestUrl = normalizeString(testUrl) || DEFAULT_TEST_URL;
  const timeoutMsRaw = Number(timeoutMs);
  const normalizedTimeoutMs =
    Number.isFinite(timeoutMsRaw) && timeoutMsRaw > 0
      ? Math.min(timeoutMsRaw, 30000)
      : DEFAULT_TIMEOUT_MS;

  const parsedProxyUrl = parseProxyUrl(normalizedProxyUrl);
  if (!parsedProxyUrl) {
    return {
      ok: false,
      status: 400,
      error: "Invalid proxy URL",
    };
  }

  const controller = new AbortController();
  const startedAt = Date.now();
  const timer = setTimeout(() => controller.abort(), normalizedTimeoutMs);

  try {
    const res = await proxyAwareFetch(
      normalizedTestUrl,
      {
        method: "HEAD",
        signal: controller.signal,
        headers: {
          "User-Agent": "Potluck",
        },
      },
      {
        enabled: true,
        url: parsedProxyUrl,
        strictProxy: true,
      }
    );

    return {
      ok: res.ok,
      status: res.status,
      statusText: res.statusText,
      url: normalizedTestUrl,
      elapsedMs: Date.now() - startedAt,
    };
  } catch (err) {
    const message =
      err?.name === "AbortError"
        ? "Proxy test timed out"
        : getErrorMessage(err);
    return { ok: false, status: 500, error: message };
  } finally {
    clearTimeout(timer);
  }
}
