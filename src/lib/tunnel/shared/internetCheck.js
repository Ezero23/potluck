import net from "net";
import https from "https";

// Internet reachability probe used to gate tunnel (re)spawn decisions.
//
// IMPORTANT: a raw TCP connect to 1.1.1.1:443 gives FALSE NEGATIVES on networks
// that block raw outbound to DNS-resolver IPs but still allow normal HTTPS
// (common behind corporate/proxy firewalls). On such a network the old probe
// always reported "offline", so safeRestartTunnel silently aborted and the tunnel
// could never auto-resume. We now probe a Cloudflare HTTPS endpoint first — which
// is also exactly the infrastructure the tunnel itself must reach — and keep the
// raw TCP connect only as a fallback.
const INTERNET_CHECK = {
  httpsUrl: "https://cloudflare.com/cdn-cgi/trace",
  tcpHost: "1.1.1.1",
  tcpPort: 443,
  timeoutMs: 4000,
};

export function checkInternet() {
  return new Promise((resolve) => {
    let done = false;
    const finish = (ok) => {
      if (done) return;
      done = true;
      resolve(ok);
    };

    // Probe 1: lightweight HTTPS GET to a Cloudflare endpoint. Any HTTP response
    // (even 4xx/5xx) proves the network path to Cloudflare works.
    let req;
    try {
      req = https.get(INTERNET_CHECK.httpsUrl, { timeout: INTERNET_CHECK.timeoutMs }, (res) => {
        res.resume(); // drain so the socket can close
        finish(res.statusCode != null);
        try { req.destroy(); } catch { /* ignore */ }
      });
      req.on("timeout", () => { try { req.destroy(); } catch { /* ignore */ } tryTcp(); });
      req.on("error", () => tryTcp());
    } catch {
      tryTcp();
    }

    // Probe 2 (fallback): original raw TCP connect.
    function tryTcp() {
      if (done) return;
      const socket = new net.Socket();
      socket.setTimeout(INTERNET_CHECK.timeoutMs);
      socket.once("connect", () => { try { socket.destroy(); } catch { /* ignore */ } finish(true); });
      socket.once("timeout", () => { try { socket.destroy(); } catch { /* ignore */ } finish(false); });
      socket.once("error", () => { try { socket.destroy(); } catch { /* ignore */ } finish(false); });
      try {
        socket.connect(INTERNET_CHECK.tcpPort, INTERNET_CHECK.tcpHost);
      } catch {
        finish(false);
      }
    }

    // Hard ceiling so the gate can never hang its caller (startup / watchdog).
    setTimeout(() => finish(false), INTERNET_CHECK.timeoutMs * 2 + 500).unref?.();
  });
}
