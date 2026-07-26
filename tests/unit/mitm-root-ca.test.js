import { afterEach, describe, expect, it, vi } from "vitest";
import { createRequire } from "module";
import fs from "fs";
import os from "os";
import path from "path";

const require = createRequire(import.meta.url);
const tempDirs = [];
const originalDataDir = process.env.DATA_DIR;

afterEach(() => {
  try { global._dbAdapter?.instance?.close?.(); } catch {}
  delete global._dbAdapter;
  vi.resetModules();
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  if (originalDataDir === undefined) delete process.env.DATA_DIR;
  else process.env.DATA_DIR = originalDataDir;
});

function loadRootCAWithDataDir(dataDir) {
  const rootCAPath = require.resolve("../../src/mitm/cert/rootCA.js");
  const pathsPath = require.resolve("../../src/mitm/paths.js");
  delete require.cache[rootCAPath];
  delete require.cache[pathsPath];

  const oldDataDir = process.env.DATA_DIR;
  process.env.DATA_DIR = dataDir;
  try {
    return require("../../src/mitm/cert/rootCA.js");
  } finally {
    if (oldDataDir === undefined) delete process.env.DATA_DIR;
    else process.env.DATA_DIR = oldDataDir;
  }
}

describe("MITM Root CA generation", () => {
  it("creates Root CA files synchronously for direct server startup", () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "potluck-mitm-ca-"));
    tempDirs.push(dataDir);
    const { generateRootCA } = loadRootCAWithDataDir(dataDir);

    generateRootCA();

    const mitmDir = path.join(dataDir, "mitm");
    const keyPath = path.join(mitmDir, "rootCA.key");
    const certPath = path.join(mitmDir, "rootCA.crt");
    expect(fs.existsSync(keyPath)).toBe(true);
    expect(fs.existsSync(certPath)).toBe(true);
    if (process.platform !== "win32") {
      expect(fs.statSync(mitmDir).mode & 0o777).toBe(0o700);
      expect(fs.statSync(keyPath).mode & 0o777).toBe(0o600);
      expect(fs.statSync(certPath).mode & 0o777).toBe(0o644);
    }
  });

  it("repairs permissions on an existing Root CA", () => {
    if (process.platform === "win32") return;
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "potluck-mitm-ca-existing-"));
    tempDirs.push(dataDir);
    const { generateRootCA } = loadRootCAWithDataDir(dataDir);
    const { key, cert } = generateRootCA();
    const mitmDir = path.dirname(key);

    fs.chmodSync(mitmDir, 0o755);
    fs.chmodSync(key, 0o644);
    fs.chmodSync(cert, 0o666);
    generateRootCA();

    expect(fs.statSync(mitmDir).mode & 0o777).toBe(0o700);
    expect(fs.statSync(key).mode & 0o777).toBe(0o600);
    expect(fs.statSync(cert).mode & 0o777).toBe(0o644);
  });

  it("restricts existing database files and backup trees", async () => {
    if (process.platform === "win32") return;
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "potluck-db-permissions-"));
    tempDirs.push(dataDir);
    fs.chmodSync(dataDir, 0o755);
    process.env.DATA_DIR = dataDir;
    delete global._dbAdapter;
    vi.resetModules();

    const backupDir = path.join(dataDir, "db", "backups", "old");
    fs.mkdirSync(backupDir, { recursive: true, mode: 0o755 });
    const backupFile = path.join(backupDir, "data.sqlite");
    fs.writeFileSync(backupFile, "old", { mode: 0o644 });
    const legacyFile = path.join(dataDir, "db.json");
    fs.writeFileSync(legacyFile, "{}", { mode: 0o644 });

    const { getAdapter } = await import("@/lib/db/driver.js");
    await getAdapter();

    expect(fs.statSync(dataDir).mode & 0o777).toBe(0o700);
    expect(fs.statSync(path.join(dataDir, "db")).mode & 0o777).toBe(0o700);
    expect(fs.statSync(path.join(dataDir, "db", "data.sqlite")).mode & 0o777).toBe(0o600);
    expect(fs.statSync(backupDir).mode & 0o777).toBe(0o700);
    expect(fs.statSync(backupFile).mode & 0o777).toBe(0o600);
    expect(fs.statSync(legacyFile).mode & 0o777).toBe(0o600);
  });

  it("requires certificate verification for every MITM upstream TLS connection", () => {
    const serverSource = fs.readFileSync(
      path.join(process.cwd(), "src", "mitm", "server.js"),
      "utf8"
    );
    expect(serverSource).not.toContain("rejectUnauthorized: false");
    expect(serverSource.match(/rejectUnauthorized: true/g)).toHaveLength(3);
  });
});
