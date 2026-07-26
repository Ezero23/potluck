import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { afterEach, describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const rootRequire = createRequire(new URL("../../package.json", import.meta.url));
const api = require("../../cli/src/cli/api/client.js");
const cliPackage = require("../../cli/package.json");
const cliPath = new URL("../../cli/cli.js", import.meta.url);

afterEach(() => {
  api.configure({
    host: "localhost",
    port: 21023,
    protocol: "http:",
  });
});

describe("CLI main service port contract", () => {
  it.each([
    ["--help", "Port to run the server (default: 21023)"],
    ["--version", cliPackage.version],
  ])("handles %s immediately without runtime installation", (arg, expected) => {
    const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), "potluck-cli-info-"));
    const startedAt = Date.now();

    try {
      const result = spawnSync(process.execPath, [cliPath.pathname, arg], {
        cwd: tempHome,
        encoding: "utf8",
        env: {
          ...process.env,
          HOME: tempHome,
          USERPROFILE: tempHome,
          APPDATA: path.join(tempHome, "AppData", "Roaming"),
          LOCALAPPDATA: path.join(tempHome, "AppData", "Local"),
          DATA_DIR: path.join(tempHome, "data"),
        },
        timeout: 3000,
      });

      expect(result.status).toBe(0);
      expect(result.stderr).toBe("");
      expect(result.stdout).toContain(expected);
      expect(Date.now() - startedAt).toBeLessThan(2000);
      expect(fs.readdirSync(tempHome)).toEqual([]);
    } finally {
      fs.rmSync(tempHome, { recursive: true, force: true });
    }
  });

  it("resolves CLI build tooling from a root workspace install", () => {
    expect(rootRequire.resolve("esbuild")).toContain("node_modules/esbuild");
  });

  it("uses the canonical Potluck port by default", () => {
    expect(api.getBaseUrl()).toBe("http://localhost:21023");
  });

  it("derives displayed and callback URLs from a custom CLI port", () => {
    api.configure({ port: 3210 });

    expect(api.getBaseUrl()).toBe("http://localhost:3210");
    expect(api.getOAuthRedirectUri("claude")).toBe(
      "http://localhost:3210/callback",
    );
    expect(api.getOAuthRedirectUri("codex")).toBe(
      "http://localhost:1455/auth/callback",
    );
  });

  it.each([
    "../../cli/cli.js",
    "../../cli/src/cli/api/client.js",
    "../../cli/src/cli/menus/settings.js",
    "../../cli/src/cli/menus/providers.js",
  ])("does not retain a legacy main port in %s", (relativePath) => {
    const source = fs.readFileSync(new URL(relativePath, import.meta.url), "utf8");

    expect(source).not.toMatch(/\b2012[789]\b/);
  });
});
