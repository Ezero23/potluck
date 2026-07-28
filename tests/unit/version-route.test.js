import fs from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("version route", () => {
  it("compares semantic versions numerically", async () => {
    const { compareVersions } = await import("@/app/api/version/route.js");

    expect(compareVersions("0.10.0", "0.9.9")).toBe(1);
    expect(compareVersions("1.0.0", "1.0.0")).toBe(0);
    expect(compareVersions("0.5.17", "0.5.18")).toBe(-1);
  });

  it("checks the real Potluck GitHub release instead of the unrelated npm package", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        tag_name: "v99.0.0",
        html_url: "https://github.com/Ezero23/potluck/releases/tag/v99.0.0",
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const { GET } = await import("@/app/api/version/route.js");
    const response = await GET();
    const body = await response.json();

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.github.com/repos/Ezero23/potluck/releases/latest",
      expect.objectContaining({ cache: "no-store" }),
    );
    expect(body).toMatchObject({
      latestVersion: "99.0.0",
      hasUpdate: true,
      releaseUrl: "https://github.com/Ezero23/potluck/releases/tag/v99.0.0",
    });
  });

  it("fails closed when GitHub is unavailable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));

    const { GET } = await import("@/app/api/version/route.js");
    const response = await GET();
    const body = await response.json();

    expect(body.latestVersion).toBeNull();
    expect(body.hasUpdate).toBe(false);
    expect(body.releaseUrl).toBe("https://github.com/Ezero23/potluck/releases");
  });

  it("does not expose the removed npm self-updater", () => {
    const updateRoute = new URL("../../src/app/api/version/update/route.js", import.meta.url);
    const detachedUpdater = new URL("../../src/lib/updater/updater.js", import.meta.url);
    const appUpdater = fs.readFileSync(
      new URL("../../src/lib/appUpdater.js", import.meta.url),
      "utf8",
    );
    const config = fs.readFileSync(
      new URL("../../src/shared/constants/config.js", import.meta.url),
      "utf8",
    );

    expect(fs.existsSync(updateRoute)).toBe(false);
    expect(fs.existsSync(detachedUpdater)).toBe(false);
    expect(appUpdater).not.toContain("spawnUpdaterAndExit");
    expect(appUpdater).not.toContain("UPDATER_PKG_NAME");
    expect(config).not.toContain("npm i -g potluck");
    expect(config).not.toContain('npmPackageName: "potluck"');
  });
});
