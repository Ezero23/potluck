import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  applyOutboundProxyEnv: vi.fn(),
  getMitmAlias: vi.fn(),
  getSettings: vi.fn(),
}));

vi.mock("@/lib/localDb", () => ({
  getSettings: mocks.getSettings,
}));

vi.mock("@/lib/network/outboundProxy", () => ({
  applyOutboundProxyEnv: mocks.applyOutboundProxyEnv,
}));

vi.mock("@/lib/db/repos/aliasRepo.js", () => ({
  getMitmAlias: mocks.getMitmAlias,
}));

beforeEach(() => {
  mocks.applyOutboundProxyEnv.mockReset();
  mocks.getMitmAlias.mockReset();
  mocks.getSettings.mockReset();
  vi.resetModules();
});

describe("server startup side effects", () => {
  it("initializes the outbound proxy only when runtime startup requests it", async () => {
    mocks.getSettings.mockResolvedValue({ outboundProxyEnabled: false });

    const { ensureOutboundProxyInitialized } = await import(
      "@/lib/network/initOutboundProxy.js"
    );
    await new Promise((resolve) => setImmediate(resolve));

    expect(mocks.getSettings).not.toHaveBeenCalled();
    expect(mocks.applyOutboundProxyEnv).not.toHaveBeenCalled();

    await expect(ensureOutboundProxyInitialized()).resolves.toBe(true);
    expect(mocks.getSettings).toHaveBeenCalledOnce();
    expect(mocks.applyOutboundProxyEnv).toHaveBeenCalledWith({
      outboundProxyEnabled: false,
    });

    await ensureOutboundProxyInitialized();
    expect(mocks.getSettings).toHaveBeenCalledOnce();
  });

  it("keeps runtime startup modules out of the React root layout", () => {
    const source = fs.readFileSync(
      new URL("../../src/app/layout.js", import.meta.url),
      "utf8",
    );

    expect(source).not.toContain("initOutboundProxy");
    expect(source).not.toContain("shared/services/bootstrap");
    expect(source).not.toContain("consoleLogBuffer");
    expect(source).not.toContain("GoogleAnalytics");
    expect(source).not.toContain("@next/third-parties");
  });

  it("loads initializeApp lazily after the build-phase guard", () => {
    const source = fs.readFileSync(
      new URL("../../src/shared/services/bootstrap.js", import.meta.url),
      "utf8",
    );

    expect(source).not.toMatch(/^import .*initializeApp/m);
    expect(source).toContain('import("./initializeApp.js")');
  });

  it("does not download cloudflared unless a tunnel is requested", () => {
    const source = fs.readFileSync(
      new URL("../../src/shared/services/initializeApp.js", import.meta.url),
      "utf8",
    );

    expect(source).not.toContain("ensureCloudflared");
  });

  it("writes the MITM alias cache with private permissions", async () => {
    const originalDataDir = process.env.DATA_DIR;
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "potluck-alias-cache-"));
    process.env.DATA_DIR = dataDir;
    mocks.getMitmAlias.mockResolvedValue({ claude: { opus: "test/model" } });

    try {
      const { syncToJson } = await import("@/lib/mitmAliasCache.js");
      await syncToJson();

      const directory = path.join(dataDir, "mitm");
      const cache = path.join(directory, "aliases.json");
      expect(JSON.parse(fs.readFileSync(cache, "utf8"))).toEqual({
        claude: { opus: "test/model" },
      });
      if (process.platform !== "win32") {
        expect(fs.statSync(directory).mode & 0o777).toBe(0o700);
        expect(fs.statSync(cache).mode & 0o777).toBe(0o600);
      }
    } finally {
      if (originalDataDir === undefined) delete process.env.DATA_DIR;
      else process.env.DATA_DIR = originalDataDir;
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  });
});
