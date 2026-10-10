// Cloudflare quick tunnel: DNS propagates fast, short timeouts OK.
// fetchTimeoutMs must tolerate slow direct CN→Cloudflare edge routes (observed
// 9s+ RTTs); a too-short timeout makes the watchdog see a healthy tunnel as dead.
export const HEALTH_CHECK = {
  intervalMs: 2000,
  timeoutMs: 60000,
  fetchTimeoutMs: 12000,
  dnsTimeoutMs: 2000,
};

export const WORKER_URL = process.env.TUNNEL_WORKER_URL || "https://abc-tunnel.us";
