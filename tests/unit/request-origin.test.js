import { describe, expect, it } from "vitest";
import { resolveRequestOrigin } from "../../src/shared/utils/requestOrigin.js";

describe("request origin resolution", () => {
  it.each([
    ["development", "http://localhost:20127/api/example", "http://localhost:20127"],
    ["packaged app", "http://localhost:20128/api/example", "http://localhost:20128"],
    ["Docker", "http://localhost:20129/api/example", "http://localhost:20129"],
  ])("uses the direct %s request origin", (_mode, requestUrl, expected) => {
    expect(resolveRequestOrigin({ requestUrl })).toBe(expected);
  });

  it("uses validated reverse-proxy headers", () => {
    expect(
      resolveRequestOrigin({
        requestUrl: "http://127.0.0.1:20129/api/example",
        forwardedProto: "https",
        forwardedHost: "potluck.example.com",
      })
    ).toBe("https://potluck.example.com");
  });

  it("uses the first value from chained proxy headers", () => {
    expect(
      resolveRequestOrigin({
        requestUrl: "http://127.0.0.1:20129/api/example",
        forwardedProto: "https, http",
        forwardedHost: "potluck.example.com, internal:20129",
      })
    ).toBe("https://potluck.example.com");
  });

  it("prefers an explicitly configured public base URL", () => {
    expect(
      resolveRequestOrigin({
        requestUrl: "http://localhost:20129/api/example",
        forwardedProto: "https",
        forwardedHost: "proxy.example.com",
        configuredBaseUrl: "https://configured.example.com/path/",
      })
    ).toBe("https://configured.example.com");
  });

  it.each([
    ["javascript", "javascript:alert(1)", "evil.example.com"],
    ["credentials", "https", "user:pass@evil.example.com"],
    ["path injection", "https", "evil.example.com/path"],
  ])("rejects invalid %s proxy input", (_case, forwardedProto, forwardedHost) => {
    expect(
      resolveRequestOrigin({
        requestUrl: "http://localhost:20129/api/example",
        forwardedProto,
        forwardedHost,
      })
    ).toBe("http://localhost:20129");
  });

  it("returns an empty string when no valid origin exists", () => {
    expect(resolveRequestOrigin({ requestUrl: "not a URL" })).toBe("");
  });
});
