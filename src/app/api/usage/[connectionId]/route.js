import {
  getCachedConnectionQuotaState,
  refreshAndUpdateCredentials,
} from "@/lib/monitor/quotaCoordinator";

export { refreshAndUpdateCredentials };

/**
 * GET /api/usage/[connectionId] - Get usage data for a specific connection.
 *
 * The web UI and the Monitor push path share the same connection-scoped
 * coordinator, so a refresh from either surface reuses the same TTL/in-flight
 * cache instead of issuing duplicate upstream quota requests.
 *
 * The raw Provider usage shape remains at the top level for compatibility.
 * Standardized quota fields are additive and let newer clients use the same
 * state model as the Monitor snapshot.
 */
export async function GET(request, { params }) {
  try {
    const { connectionId } = await params;
    const force = new URL(request.url).searchParams.get("refresh") === "1";
    const state = await getCachedConnectionQuotaState(connectionId, { force });
    if (state === null) {
      return Response.json({ error: "Connection not found" }, { status: 404 });
    }

    const rawUsage = state.usage && typeof state.usage === "object" && !Array.isArray(state.usage)
      ? state.usage
      : {};
    return Response.json({
      ...rawUsage,
      windows: state.windows || [],
      quotaStatus: state.quotaStatus || "notChecked",
      lastAttemptAt: state.lastAttemptAt || null,
      lastSuccessAt: state.lastSuccessAt || null,
      error: state.error || null,
      cached: state.cached === true,
    });
  } catch (error) {
    console.warn(`[Usage] quota request failed: ${error.message}`);
    return Response.json({ error: "Unable to fetch usage for this connection" }, { status: 500 });
  }
}
