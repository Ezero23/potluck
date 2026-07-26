import { afterEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const originalCwd = process.cwd();
const originalLoggingSetting = process.env.ENABLE_REQUEST_LOGS;
const temporaryDirectories = [];

afterEach(() => {
  process.chdir(originalCwd);
  if (originalLoggingSetting === undefined) delete process.env.ENABLE_REQUEST_LOGS;
  else process.env.ENABLE_REQUEST_LOGS = originalLoggingSetting;
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
  vi.resetModules();
});

describe("request logger security", () => {
  it("redacts secrets recursively and restricts log permissions", async () => {
    const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "potluck-request-logger-"));
    temporaryDirectories.push(temporaryDirectory);
    process.chdir(temporaryDirectory);
    process.env.ENABLE_REQUEST_LOGS = "true";
    vi.resetModules();

    const { createRequestLogger } = await import("../../open-sse/utils/requestLogger.js");
    const logger = await createRequestLogger("openai", "claude", "test-model");
    logger.logClientRawRequest("/v1/messages", {
      apiKey: "body-secret",
      nested: { refresh_token: "refresh-secret", safe: "visible" },
    }, new Headers({
      authorization: "Bearer header-secret",
      cookie: "session=secret",
      "content-type": "application/json",
    }));

    const logRoot = path.join(temporaryDirectory, "logs");
    const sessionDirectory = path.join(logRoot, fs.readdirSync(logRoot)[0]);
    const logFile = path.join(sessionDirectory, "1_req_client.json");
    const logged = JSON.parse(fs.readFileSync(logFile, "utf8"));

    expect(logged.headers.authorization).toBe("[REDACTED]");
    expect(logged.headers.cookie).toBe("[REDACTED]");
    expect(logged.headers["content-type"]).toBe("application/json");
    expect(logged.body.apiKey).toBe("[REDACTED]");
    expect(logged.body.nested.refresh_token).toBe("[REDACTED]");
    expect(logged.body.nested.safe).toBe("visible");
    expect(fs.statSync(logRoot).mode & 0o777).toBe(0o700);
    expect(fs.statSync(sessionDirectory).mode & 0o777).toBe(0o700);
    expect(fs.statSync(logFile).mode & 0o777).toBe(0o600);
  });
});
