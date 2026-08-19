"use client";

import { useEffect } from "react";

// After a redeploy, long-lived tabs still run the old JS and request chunk
// files that no longer exist → blank page on client-side navigation.
// Catch chunk-load failures and do a guarded full reload instead.
const RELOAD_FLAG = "chunk-error-reload-at";
const RELOAD_COOLDOWN_MS = 60000;

const CHUNK_ERROR_PATTERNS = [
  "ChunkLoadError",
  "Loading chunk",
  "Failed to fetch dynamically imported module",
  "error loading dynamically imported module",
  "Importing a module script failed",
];

function isChunkLoadError(message) {
  return typeof message === "string" && CHUNK_ERROR_PATTERNS.some((p) => message.includes(p));
}

export default function ChunkErrorRecovery() {
  useEffect(() => {
    const recover = (message) => {
      if (!isChunkLoadError(message)) return;
      const last = Number(sessionStorage.getItem(RELOAD_FLAG) || 0);
      if (Date.now() - last < RELOAD_COOLDOWN_MS) return;
      sessionStorage.setItem(RELOAD_FLAG, String(Date.now()));
      window.location.reload();
    };
    const onRejection = (e) => recover(e?.reason?.message || String(e?.reason || ""));
    const onError = (e) => recover(e?.message || "");
    window.addEventListener("unhandledrejection", onRejection);
    window.addEventListener("error", onError);
    return () => {
      window.removeEventListener("unhandledrejection", onRejection);
      window.removeEventListener("error", onError);
    };
  }, []);
  return null;
}
