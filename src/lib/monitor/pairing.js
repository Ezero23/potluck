import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { DATA_DIR } from "@/lib/dataDir";

const AUTH_DIR = path.join(DATA_DIR, "auth");
const MONITOR_SECRET_FILE = path.join(AUTH_DIR, "monitor-secret");
const DASHBOARD_PASSWORD_FILE = path.join(AUTH_DIR, "dashboard-password");

// Tmp-file + rename so a crash mid-write never leaves a truncated secret behind.
function atomicWritePrivateFile(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const tmp = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, content, { mode: 0o600 });
  fs.renameSync(tmp, file);
  try { fs.chmodSync(file, 0o600); } catch {}
}

// Secret for the Potluck → Monitor push channel. Env wins; otherwise a random
// secret is persisted on first use so local pairing needs zero configuration.
export function ensureMonitorSecret() {
  const envSecret = (process.env.POTLUCK_MONITOR_SECRET || "").trim();
  if (envSecret) return envSecret;
  try {
    const existing = fs.readFileSync(MONITOR_SECRET_FILE, "utf8").trim();
    if (existing) return existing;
  } catch {}
  const generated = crypto.randomBytes(32).toString("hex");
  try {
    atomicWritePrivateFile(MONITOR_SECRET_FILE, generated);
  } catch (e) {
    console.warn(`[monitor] could not persist monitor secret: ${e.message}`);
  }
  return generated;
}

// Plaintext dashboard password cached by the settings/reset-password routes.
// Shared with the loopback Monitor app only; null when not cached (yet).
export function readDashboardPasswordPlain() {
  try {
    const value = fs.readFileSync(DASHBOARD_PASSWORD_FILE, "utf8").trim();
    return value || null;
  } catch {
    return null;
  }
}

export function writeDashboardPasswordPlain(password) {
  try {
    atomicWritePrivateFile(DASHBOARD_PASSWORD_FILE, String(password));
    return true;
  } catch (e) {
    console.warn(`[monitor] could not persist dashboard password cache: ${e.message}`);
    return false;
  }
}
