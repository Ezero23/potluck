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
});
