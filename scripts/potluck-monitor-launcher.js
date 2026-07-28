const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");
const os = require("os");

const PORT = parseInt(process.argv[2], 10) || parseInt(process.env.PORT, 10) || 21023;
const repo = path.join(__dirname, "..");
const launcherScript = path.join(repo, "scripts", "potluck");
const dataDir = path.join(os.homedir(), ".potluck");
const logFile = path.join(dataDir, `potluck-${PORT}.log`);
const pidFile = path.join(dataDir, `potluck-${PORT}.pid`);

fs.mkdirSync(dataDir, { recursive: true });
const log = fs.openSync(logFile, "a");

const env = {
  ...process.env,
  PORT: String(PORT),
};

// Pass through monitor push env if set; do not invent values.
const monitorVars = [
  "POTLUCK_MONITOR_ENABLED",
  "POTLUCK_MONITOR_URL",
  "POTLUCK_MONITOR_SECRET",
  "POTLUCK_MONITOR_DEVICE_ID",
];
for (const v of monitorVars) {
  if (process.env[v]) env[v] = process.env[v];
}

const child = spawn(process.execPath, [launcherScript, String(PORT)], {
  cwd: repo,
  detached: true,
  stdio: ["ignore", log, log],
  env,
});

child.unref();

fs.writeFileSync(pidFile, String(child.pid));
console.log(`[potluck-monitor-launcher] Started launcher PID ${child.pid} for port ${PORT}`);
console.log(`[potluck-monitor-launcher] Log: ${logFile}`);
console.log(`[potluck-monitor-launcher] PID file: ${pidFile}`);
