import { NextResponse } from "next/server";
import { access, constants } from "fs/promises";
import { homedir } from "os";
import { join } from "path";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

const ACCESS_TOKEN_KEYS = ["cursorAuth/accessToken", "cursorAuth/token"];
const MACHINE_ID_KEYS = [
  "storage.serviceMachineId",
  "storage.machineId",
  "telemetry.machineId",
];
const SUPPORTED_PLATFORMS = new Set(["darwin", "win32", "linux"]);

/** Get candidate db paths by platform */
function getCandidatePaths(platform) {
  const home = homedir();

  if (platform === "darwin") {
    return [
      join(
        home,
        "Library/Application Support/Cursor/User/globalStorage/state.vscdb",
      ),
      join(
        home,
        "Library/Application Support/Cursor - Insiders/User/globalStorage/state.vscdb",
      ),
    ];
  }

  if (platform === "win32") {
    const appData = process.env.APPDATA || join(home, "AppData", "Roaming");
    const localAppData =
      process.env.LOCALAPPDATA || join(home, "AppData", "Local");
    return [
      join(appData, "Cursor", "User", "globalStorage", "state.vscdb"),
      join(
        appData,
        "Cursor - Insiders",
        "User",
        "globalStorage",
        "state.vscdb",
      ),
      join(localAppData, "Cursor", "User", "globalStorage", "state.vscdb"),
      join(
        localAppData,
        "Programs",
        "Cursor",
        "User",
        "globalStorage",
        "state.vscdb",
      ),
    ];
  }

  if (platform === "linux") {
    return [
      join(home, ".config/Cursor/User/globalStorage/state.vscdb"),
      join(home, ".config/cursor/User/globalStorage/state.vscdb"),
    ];
  }

  return [];
}

function normalizeStoredValue(value) {
  if (typeof value !== "string") return value;
  try {
    const parsed = JSON.parse(value);
    return typeof parsed === "string" ? parsed : value;
  } catch {
    return value;
  }
}

function findTokenValues(rows) {
  const values = new Map(
    rows.map((row) => [String(row.key || "").toLowerCase(), normalizeStoredValue(row.value)]),
  );
  const findExact = (keys) => {
    for (const key of keys) {
      const value = values.get(key.toLowerCase());
      if (value) return value;
    }
    return null;
  };

  return {
    accessToken:
      findExact(ACCESS_TOKEN_KEYS) ||
      [...values].find(([key, value]) => value && key.includes("access") && key.includes("token"))?.[1] ||
      null,
    machineId:
      findExact(MACHINE_ID_KEYS) ||
      [...values].find(([key, value]) => value && key.includes("machine") && key.includes("id"))?.[1] ||
      null,
  };
}

/**
 * Extract tokens via better-sqlite3 (bundled dependency).
 * This is the preferred strategy — no external CLI required.
 */
async function extractTokensViaBetterSqlite(dbPath) {
  const { default: Database } = await import("better-sqlite3");
  const db = new Database(dbPath, { readonly: true, fileMustExist: true });

  try {
    const keys = [...ACCESS_TOKEN_KEYS, ...MACHINE_ID_KEYS];
    const placeholders = keys.map(() => "?").join(",");
    const exactRows = db
      .prepare(`SELECT key, value FROM itemTable WHERE key IN (${placeholders})`)
      .all(...keys);
    const exact = findTokenValues(exactRows);
    if (exact.accessToken && exact.machineId) return exact;

    const fuzzyRows = db
      .prepare(
        "SELECT key, value FROM itemTable WHERE lower(key) LIKE '%token%' OR lower(key) LIKE '%machine%id%'",
      )
      .all();
    return findTokenValues([...exactRows, ...fuzzyRows]);
  } finally {
    db.close();
  }
}

/**
 * Extract tokens via sqlite3 CLI.
 * Fallback when better-sqlite3 native bindings are unavailable.
 */
async function extractTokensViaCLI(dbPath) {
  const normalize = (raw) => {
    const value = raw.trim();
    return normalizeStoredValue(value);
  };

  const query = async (sql) => {
    const { stdout } = await execFileAsync("sqlite3", [dbPath, sql], {
      timeout: 10000,
    });
    return stdout.trim();
  };

  let successfulQueries = 0;
  let lastError = null;

  // Try each key in priority order
  let accessToken = null;
  for (const key of ACCESS_TOKEN_KEYS) {
    try {
      const raw = await query(
        `SELECT value FROM itemTable WHERE key='${key}' LIMIT 1`,
      );
      successfulQueries += 1;
      if (raw) {
        accessToken = normalize(raw);
        break;
      }
    } catch (error) {
      lastError = error;
    }
  }

  let machineId = null;
  for (const key of MACHINE_ID_KEYS) {
    try {
      const raw = await query(
        `SELECT value FROM itemTable WHERE key='${key}' LIMIT 1`,
      );
      successfulQueries += 1;
      if (raw) {
        machineId = normalize(raw);
        break;
      }
    } catch (error) {
      lastError = error;
    }
  }

  if (successfulQueries === 0 && lastError) throw lastError;
  return { accessToken, machineId };
}

/**
 * GET /api/oauth/cursor/auto-import
 * Auto-detect and extract Cursor tokens from local SQLite database.
 * Strategy: better-sqlite3 → sqlite3 CLI → manual fallback
 */
export async function GET() {
  try {
    const platform = process.platform;
    if (!SUPPORTED_PLATFORMS.has(platform)) {
      return NextResponse.json(
        { found: false, error: "Unsupported platform" },
        { status: 400 },
      );
    }

    const candidates = getCandidatePaths(platform);

    let dbPath = null;
    for (const candidate of candidates) {
      try {
        await access(candidate, constants.R_OK);
        dbPath = candidate;
        break;
      } catch {
        // Try next candidate
      }
    }

    if (!dbPath) {
      return NextResponse.json({
        found: false,
        error: `Cursor database not found. Checked locations:\n${candidates.join("\n")}\n\nMake sure Cursor IDE is installed and opened at least once.`,
      });
    }

    // On Linux, verify Cursor is actually installed (not just leftover config)
    if (platform === "linux") {
      let cursorInstalled = false;
      try {
        await execFileAsync("which", ["cursor"], { timeout: 5000 });
        cursorInstalled = true;
      } catch {
        try {
          const desktopFile = join(homedir(), ".local/share/applications/cursor.desktop");
          await access(desktopFile, constants.R_OK);
          cursorInstalled = true;
        } catch { /* not found */ }
      }
      if (!cursorInstalled) {
        return NextResponse.json({
          found: false,
          error: "Cursor config files found but Cursor IDE does not appear to be installed. Skipping auto-import.",
        });
      }
    }

    // Strategy 1: better-sqlite3 (bundled — no external tools required)
    let betterSqliteError = null;
    try {
      const tokens = await extractTokensViaBetterSqlite(dbPath);
      if (tokens.accessToken && tokens.machineId) {
        return NextResponse.json({
          found: true,
          accessToken: tokens.accessToken,
          machineId: tokens.machineId,
        });
      }
      return NextResponse.json({
        found: false,
        error: "Cursor credentials were not found. Please login to Cursor IDE first, then retry.",
        dbPath,
      });
    } catch (error) {
      betterSqliteError = error;
      // Native bindings unavailable — try CLI fallback
    }

    // Strategy 2: sqlite3 CLI
    let cliError = null;
    try {
      const tokens = await extractTokensViaCLI(dbPath);
      if (tokens.accessToken && tokens.machineId) {
        return NextResponse.json({
          found: true,
          accessToken: tokens.accessToken,
          machineId: tokens.machineId,
        });
      }
      return NextResponse.json({
        found: false,
        error: "Cursor credentials were not found. Please login to Cursor IDE first, then retry.",
        dbPath,
      });
    } catch (error) {
      cliError = error;
      // sqlite3 CLI not available either
    }

    // Strategy 3: ask user to paste manually
    const details = [betterSqliteError?.message, cliError?.message]
      .filter(Boolean)
      .join("; ");
    return NextResponse.json({
      found: false,
      manualImport: true,
      windowsManual: platform === "win32",
      dbPath,
      error: `Cursor database was found, but Potluck could not open it automatically${details ? `: ${details}` : "."}`,
    });
  } catch (error) {
    console.log("Cursor auto-import error:", error);
    return NextResponse.json(
      { found: false, error: error.message },
      { status: 500 },
    );
  }
}
