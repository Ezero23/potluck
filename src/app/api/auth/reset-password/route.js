import { NextResponse } from "next/server";
import { updateSettings } from "@/lib/localDb";
import { writeDashboardPasswordPlain } from "@/lib/monitor/pairing";
import { notifyMonitorContentChanged } from "@/lib/monitor/pushToMonitor.js";

// Reset dashboard password to default by clearing the stored hash.
// Local-only (enforced by dashboardGuard). Never returns the default literal.
export async function POST() {
  try {
    await updateSettings({ password: null });
    // Cache the default plaintext locally (0600) for the loopback Monitor app,
    // then push the fresh info immediately.
    writeDashboardPasswordPlain("123456");
    notifyMonitorContentChanged();
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
