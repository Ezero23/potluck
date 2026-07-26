// JSON cache for mitmAlias — read by standalone MITM server (no SQLite native binding).
// Source of truth = SQLite kv['mitmAlias']. JSON is a read-replica synced on app start
// and after every UI write.
import fs from "fs";
import path from "path";
import os from "os";

const DATA_DIR = process.env.DATA_DIR
  || (process.platform === "win32"
    ? path.join(process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming"), "potluck")
    : path.join(os.homedir(), ".potluck"));

const CACHE_FILE = path.join(DATA_DIR, "mitm", "aliases.json");
const PRIVATE_DIR_MODE = 0o700;
const PRIVATE_FILE_MODE = 0o600;

function restrictMode(target, mode) {
  if (process.platform !== "win32") fs.chmodSync(target, mode);
}

function writeAtomic(data) {
  const dir = path.dirname(CACHE_FILE);
  fs.mkdirSync(dir, { recursive: true, mode: PRIVATE_DIR_MODE });
  restrictMode(dir, PRIVATE_DIR_MODE);
  const tmp = `${CACHE_FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), {
    encoding: "utf8",
    mode: PRIVATE_FILE_MODE,
  });
  restrictMode(tmp, PRIVATE_FILE_MODE);
  fs.renameSync(tmp, CACHE_FILE);
  restrictMode(CACHE_FILE, PRIVATE_FILE_MODE);
}

// Sync entire mitmAlias map from DB → JSON file
export async function syncToJson() {
  try {
    const { getMitmAlias } = await import("@/lib/db/repos/aliasRepo.js");
    const all = await getMitmAlias();
    writeAtomic(all || {});
  } catch (e) {
    console.log("[mitmAliasCache] sync failed:", e.message);
  }
}

// Update cache for a single tool after UI saves to DB
export function writeAliasForTool(tool, mappings) {
  try {
    let current = {};
    if (fs.existsSync(CACHE_FILE)) {
      try { current = JSON.parse(fs.readFileSync(CACHE_FILE, "utf8")); } catch { /* corrupted → reset */ }
    }
    current[tool] = mappings || {};
    writeAtomic(current);
  } catch (e) {
    console.log("[mitmAliasCache] write failed:", e.message);
  }
}
