import fs from "fs";
import path from "path";
import { DATA_DIR } from "@/lib/dataDir.js";

const NAMED_TUNNEL_FILE = path.join(DATA_DIR, "tunnel", "named-tunnel.json");

// Named (account) tunnel config. When present, the tunnel service runs this
// pre-provisioned tunnel instead of an ephemeral quick tunnel: the public
// hostname is fixed, so no worker registration or URL rotation is involved.
// Create with: cloudflared tunnel login && tunnel create <name> && tunnel
// route dns <name> <hostname>, plus an ingress config in ~/.cloudflared.
export function loadNamedTunnelConfig() {
  try {
    if (!fs.existsSync(NAMED_TUNNEL_FILE)) return null;
    const raw = JSON.parse(fs.readFileSync(NAMED_TUNNEL_FILE, "utf8"));
    const name = String(raw?.name || "").trim();
    const publicUrl = String(raw?.publicUrl || "").trim();
    if (!name || !publicUrl) return null;
    return { name, publicUrl };
  } catch {
    return null;
  }
}
