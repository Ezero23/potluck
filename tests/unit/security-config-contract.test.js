import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const originalDataDir = process.env.DATA_DIR;
const originalRequireApiKey = process.env.REQUIRE_API_KEY;
let tempDir;
let db;

beforeAll(async () => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "potluck-security-config-"));
  process.env.DATA_DIR = tempDir;
  process.env.REQUIRE_API_KEY = "true";
  vi.resetModules();
  db = await import("@/lib/db/index.js");
  await db.initDb();
});

afterAll(() => {
  fs.rmSync(tempDir, { recursive: true, force: true });

  if (originalDataDir === undefined) delete process.env.DATA_DIR;
  else process.env.DATA_DIR = originalDataDir;

  if (originalRequireApiKey === undefined) delete process.env.REQUIRE_API_KEY;
  else process.env.REQUIRE_API_KEY = originalRequireApiKey;
});

describe("endpoint API-key security configuration", () => {
  it("uses the persisted setting as the only source of truth", async () => {
    expect((await db.getSettings()).requireApiKey).toBe(false);

    await db.updateSettings({ requireApiKey: true });
    expect((await db.getSettings()).requireApiKey).toBe(true);

    await db.updateSettings({ requireApiKey: false });
    expect((await db.getSettings()).requireApiKey).toBe(false);
  });

  it.each([
    "../../.env.example",
    "../../README.md",
    "../../README.zh-CN.md",
  ])("does not advertise the unsupported REQUIRE_API_KEY variable in %s", (file) => {
    const source = fs.readFileSync(new URL(file, import.meta.url), "utf8");

    expect(source).not.toContain("REQUIRE_API_KEY");
  });

  it("protects the OpenAI-compatible model catalog when endpoint authentication is enabled", () => {
    const route = fs.readFileSync(
      new URL("../../src/app/api/v1/models/route.js", import.meta.url),
      "utf8"
    );

    expect(route).toContain("settings.requireApiKey");
    expect(route).toContain("extractApiKey(request)");
    expect(route).toContain("isValidApiKey(apiKey)");
  });
});
