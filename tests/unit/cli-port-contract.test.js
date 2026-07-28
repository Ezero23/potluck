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
const { sanitizeNpmInstallEnv } = require("../../cli/hooks/sqliteRuntime.js");
const {
  RELEASE_API_URL,
  getAvailableCliRelease,
  getCliInstallCommand,
} = require("../../cli/src/release.js");
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
    ["--help", "Host to bind (default: 127.0.0.1)"],
    ["--help", "Usage: potluck [options]"],
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

  it("discovers installable CLI updates from GitHub Releases", () => {
    const release = {
      tag_name: "v0.5.19",
      draft: false,
      prerelease: false,
      assets: [
        {
          name: "potluck-cli-0.5.19.tgz",
          browser_download_url:
            "https://github.com/Ezero23/potluck/releases/download/v0.5.19/potluck-cli-0.5.19.tgz",
        },
      ],
    };

    expect(RELEASE_API_URL).toBe(
      "https://api.github.com/repos/Ezero23/potluck/releases/latest",
    );
    expect(getAvailableCliRelease(release, "0.5.18")).toEqual({
      version: "0.5.19",
      downloadUrl: release.assets[0].browser_download_url,
    });
    expect(getCliInstallCommand("0.5.19")).toBe(
      "npm install -g https://github.com/Ezero23/potluck/releases/download/v0.5.19/potluck-cli-0.5.19.tgz",
    );
  });

  it("does not offer a CLI release without its package asset", () => {
    expect(
      getAvailableCliRelease(
        {
          tag_name: "v0.5.19",
          draft: false,
          prerelease: false,
          assets: [],
        },
        "0.5.18",
      ),
    ).toBeNull();
  });

  it("prevents nested runtime installs from inheriting global npm mode", () => {
    const env = sanitizeNpmInstallEnv({
      PATH: "/bin",
      npm_config_global: "true",
      NPM_CONFIG_PREFIX: "/global-prefix",
      npm_config_location: "global",
      npm_config_cache: "/cache",
    });

    expect(env).toEqual({
      PATH: "/bin",
      npm_config_cache: "/cache",
    });
  });

  it("persists optional native and tray dependencies in the runtime project", () => {
    const sqliteSource = fs.readFileSync(
      new URL("../../cli/hooks/sqliteRuntime.js", import.meta.url),
      "utf8",
    );
    const traySource = fs.readFileSync(
      new URL("../../cli/hooks/trayRuntime.js", import.meta.url),
      "utf8",
    );

    expect(sqliteSource).toContain('"--save-optional", "--save-exact"');
    expect(traySource).toContain('"--save-optional", "--save-exact"');
    expect(traySource).not.toContain('"--no-save"');
  });

  it("rejects traced runtime data and recursive builds from the CLI package", () => {
    const buildSource = fs.readFileSync(
      new URL("../../cli/scripts/build-cli.js", import.meta.url),
      "utf8",
    );

    expect(buildSource).toContain("assertCleanCliBundle");
    expect(buildSource).toContain('"jwt-secret"');
    expect(buildSource).toContain('"machine-id"');
    expect(buildSource).toContain('"data.sqlite"');
    expect(buildSource).toContain('segments[0] === ".next"');
    expect(buildSource).toContain('segments[0] === "cli"');
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
