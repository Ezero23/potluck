import { getCachedConnectionUsage } from "@/lib/monitor/quotaCoordinator";

export { refreshAndUpdateCredentials } from "@/lib/monitor/quotaCoordinator";

/**
 * GET /api/usage/[connectionId] - Get usage data for a specific connection.
 *
 * The web UI and the Monitor push path share the same connection-scoped
 * coordinator, so a refresh from either surface reuses the same TTL/in-flight
 * cache instead of issuing duplicate upstream quota requests.
 */
export async function GET(request, { params }) {
  try {
    const { connectionId } = await params;
    const force = new URL(request.url).searchParams.get("refresh") === "1";
    const usage = await getCachedConnectionUsage(connectionId, { force });
    if (usage === null) {
      return Response.json({ error: "Connection not found" }, { status: 404 });
    }
    return Response.json(usage);
  } catch (error) {
    console.warn(`[Usage] quota request failed: ${error.message}`);
    return Response.json({ error: "Unable to fetch usage for this connection" }, { status: 500 });
  }
}
