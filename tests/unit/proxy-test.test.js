import { beforeEach, describe, expect, it, vi } from "vitest";

const proxyAwareFetch = vi.fn();

vi.mock("../../open-sse/utils/proxyFetch.js", () => ({
  proxyAwareFetch: (...args) => proxyAwareFetch(...args),
}));

const { testProxyUrl } = await import("../../src/lib/network/proxyTest.js");

beforeEach(() => {
  proxyAwareFetch.mockReset();
});

describe("testProxyUrl", () => {
  it("rejects a missing proxy URL before making a request", async () => {
    await expect(testProxyUrl()).resolves.toEqual({
      ok: false,
      status: 400,
      error: "proxyUrl is required",
    });
    expect(proxyAwareFetch).not.toHaveBeenCalled();
  });

  it("uses the shared proxy-aware network layer in strict mode", async () => {
    proxyAwareFetch.mockResolvedValue({
      ok: true,
      status: 204,
      statusText: "No Content",
    });

    const result = await testProxyUrl({
      proxyUrl: "http://127.0.0.1:7890",
      testUrl: "https://example.com/health",
    });

    expect(result).toMatchObject({
      ok: true,
      status: 204,
      statusText: "No Content",
      url: "https://example.com/health",
    });
    expect(proxyAwareFetch).toHaveBeenCalledOnce();

    const [url, options, proxyOptions] = proxyAwareFetch.mock.calls[0];
    expect(url).toBe("https://example.com/health");
    expect(options).toMatchObject({
      method: "HEAD",
      headers: { "User-Agent": "Potluck" },
    });
    expect(options.signal).toBeInstanceOf(AbortSignal);
    expect(proxyOptions).toEqual({
      enabled: true,
      url: "http://127.0.0.1:7890/",
      strictProxy: true,
    });
  });

  it("accepts host:port proxy input and normalizes it once", async () => {
    proxyAwareFetch.mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
    });

    await testProxyUrl({ proxyUrl: "127.0.0.1:7890" });

    expect(proxyAwareFetch.mock.calls[0][2]).toEqual({
      enabled: true,
      url: "http://127.0.0.1:7890/",
      strictProxy: true,
    });
  });

  it("returns a stable timeout error when the shared request is aborted", async () => {
    proxyAwareFetch.mockImplementation((_url, options) => new Promise((_resolve, reject) => {
      options.signal.addEventListener(
        "abort",
        () => reject(new DOMException("The operation was aborted", "AbortError")),
        { once: true }
      );
    }));

    const result = await testProxyUrl({
      proxyUrl: "http://127.0.0.1:7890",
      timeoutMs: 1,
    });

    expect(result).toMatchObject({
      ok: false,
      status: 500,
      error: "Proxy test timed out",
    });
  });
});
