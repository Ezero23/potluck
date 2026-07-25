// Next.js instrumentation hook — runs once at server startup (before any request).
//
// Why this exists: initializeApp (tunnel auto-resume, watchdog, MITM, quota ping)
// was previously triggered only by importing app/layout.js, which Next evaluates
// lazily on the first dashboard page render. A headless / API-only instance never
// rendered the layout, so the tunnel never auto-resumed after a restart and a stale
// cloudflared zombie could squat with a dead URL. Potluck should initialize at boot
// unconditionally; this hook provides that boot-time behavior.
//
// The bootstrap module keeps its own guards (build-phase + global singleton), so
// importing it here is safe even if app/layout.js also imports it later.
export async function register() {
  // initializeApp uses Node-only APIs (fs, child_process, better-sqlite3).
  // Skip the edge runtime entirely.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  await import("./shared/services/bootstrap.js");
}
