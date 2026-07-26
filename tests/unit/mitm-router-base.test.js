import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";

const { normalizeMitmRouterBase } = require("../../src/mitm/routerBase.js");
const manager = require("../../src/mitm/manager.js");

const originalRouterBase = process.env.MITM_ROUTER_BASE;

afterEach(() => {
  if (originalRouterBase === undefined) {
    delete process.env.MITM_ROUTER_BASE;
  } else {
    process.env.MITM_ROUTER_BASE = originalRouterBase;
  }
});

describe("MITM router base URL", () => {
  it.each([
    ["development", "http://localhost:20127/", "http://localhost:20127"],
    ["packaged app", "http://localhost:20128", "http://localhost:20128"],
    ["Docker", "http://localhost:20129///", "http://localhost:20129"],
    ["reverse proxy", "https://potluck.example.com/", "https://potluck.example.com"],
  ])("normalizes the %s endpoint", (_mode, input, expected) => {
    expect(normalizeMitmRouterBase(input)).toBe(expected);
  });

  it.each([
    [undefined, "not configured"],
    ["", "not configured"],
    ["not-a-url", "Invalid"],
    ["file:///tmp/socket", "http or https"],
    ["https://user:pass@example.com", "must not include credentials"],
  ])("rejects unsafe or missing input %#", (input, expectedMessage) => {
    expect(() => normalizeMitmRouterBase(input)).toThrow(expectedMessage);
  });

  it("uses the persisted runtime endpoint", async () => {
    delete process.env.MITM_ROUTER_BASE;
    manager.initDbHooks(
      async () => ({ mitmRouterBaseUrl: "http://localhost:20127/" }),
      async () => {}
    );

    await expect(manager.__test__.resolveMitmRouterBaseUrl()).resolves.toBe(
      "http://localhost:20127"
    );
  });

  it("allows an explicit environment override", async () => {
    process.env.MITM_ROUTER_BASE = "https://router.example.com/";
    manager.initDbHooks(
      async () => ({ mitmRouterBaseUrl: "http://localhost:20129" }),
      async () => {}
    );

    await expect(manager.__test__.resolveMitmRouterBaseUrl()).resolves.toBe(
      "https://router.example.com"
    );
  });

  it("fails closed when no runtime endpoint was configured", async () => {
    delete process.env.MITM_ROUTER_BASE;
    manager.initDbHooks(
      async () => ({ mitmRouterBaseUrl: "" }),
      async () => {}
    );

    await expect(manager.__test__.resolveMitmRouterBaseUrl()).rejects.toThrow(
      "not configured"
    );
  });

  it.each([
    "../../src/lib/db/repos/settingsRepo.js",
    "../../src/mitm/manager.js",
    "../../src/mitm/handlers/base.js",
  ])("does not contain a packaged-app port fallback in %s", (relativePath) => {
    const source = fs.readFileSync(new URL(relativePath, import.meta.url), "utf8");
    expect(source).not.toMatch(/(?:localhost|127\.0\.0\.1):20128/);
  });
});
