import path from "node:path";
import fs from "node:fs";
import { DATA_DIR } from "@/lib/dataDir.js";

export const DB_DIR = path.join(DATA_DIR, "db");
export const DATA_FILE = path.join(DB_DIR, "data.sqlite");
export const BACKUPS_DIR = path.join(DB_DIR, "backups");
export const LEGACY_FILES = {
  main: path.join(DATA_DIR, "db.json"),
  usage: path.join(DATA_DIR, "usage.json"),
  disabled: path.join(DATA_DIR, "disabledModels.json"),
  details: path.join(DATA_DIR, "request-details.json"),
};

const PRIVATE_DIR_MODE = 0o700;
const PRIVATE_FILE_MODE = 0o600;

function chmodIfSupported(target, mode) {
  if (process.platform !== "win32") fs.chmodSync(target, mode);
}

function ensurePrivateDir(dir) {
  fs.mkdirSync(dir, { recursive: true, mode: PRIVATE_DIR_MODE });
  chmodIfSupported(dir, PRIVATE_DIR_MODE);
}

function secureTree(target) {
  if (!fs.existsSync(target)) return;
  const stat = fs.lstatSync(target);
  if (stat.isSymbolicLink()) return;
  if (!stat.isDirectory()) {
    chmodIfSupported(target, PRIVATE_FILE_MODE);
    return;
  }

  chmodIfSupported(target, PRIVATE_DIR_MODE);
  for (const entry of fs.readdirSync(target)) {
    secureTree(path.join(target, entry));
  }
}

export function ensureDirs() {
  for (const dir of [DATA_DIR, DB_DIR, BACKUPS_DIR]) {
    ensurePrivateDir(dir);
  }
}

export function secureDatabaseFiles() {
  ensureDirs();
  secureTree(DB_DIR);
  for (const file of Object.values(LEGACY_FILES)) {
    if (fs.existsSync(file)) chmodIfSupported(file, PRIVATE_FILE_MODE);
  }
}
