import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const originalDataDir = process.env.DATA_DIR;
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "potluck-cloudflared-pid-"));
process.env.DATA_DIR = dataDir;

afterEach(() => {
  vi.restoreAllMocks();
});

describe("cloudflared PID ownership", () => {
  it("does not let an old process clear a newer process PID", async () => {
    vi.resetModules();
    const { clearPid, loadPid, savePid } = await import("@/lib/tunnel/cloudflare/pid.js");

    savePid(111);
    savePid(222);

    expect(clearPid(111)).toBe(false);
    expect(loadPid()).toBe(222);
    expect(clearPid(222)).toBe(true);
    expect(loadPid()).toBeNull();
  });
});

afterEach(() => {
  if (originalDataDir === undefined) delete process.env.DATA_DIR;
  else process.env.DATA_DIR = originalDataDir;
  fs.rmSync(dataDir, { recursive: true, force: true });
});
