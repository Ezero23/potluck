import { NextResponse } from "next/server";
import { loadRoutingConfig, getHealth } from "open-sse/routing/engine.js";
import { getSourceStats } from "open-sse/routing/scheduler.js";
import { buildAggregateCandidates } from "open-sse/routing/aggregate.js";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "*",
};

/**
 * GET /api/routing/pools
 * Returns every routing profile as a "pool" with its resolved sources,
 * per-source health, and rotation usage stats. Powers the 池子视图.
 */
export async function GET() {
  const config = loadRoutingConfig();
  const stats = getSourceStats();

  const pools = Object.entries(config.profiles).map(([name, profile]) => {
    // Resolve the effective candidate list (aggregate discovery + static merge)
    let candidates = profile.candidates || [];
    if (profile.aggregate) {
      const discovered = buildAggregateCandidates(profile.aggregate, {
        onlyProviders: profile.aggregateOnly,
        excludeProviders: profile.aggregateExclude,
      });
      const seen = new Set(discovered.map((d) => `${d.provider}/${d.model}`));
      for (const c of candidates) {
        if (!seen.has(`${c.provider}/${c.model}`)) discovered.push(c);
      }
      candidates = discovered;
    }

    const sources = candidates.map((c) => {
      const key = `${c.provider}/${c.model}`;
      const health = getHealth(c.provider) || {};
      const rot = stats[key] || {};
      return {
        provider: c.provider,
        model: c.model,
        weight: c.weight ?? null,
        priority: c.priority ?? null,
        // health
        quotaPercent: health.quotaPercent ?? null,
        errorRate5m: health.errorRate5m ?? null,
        healthy: isHealthy(health),
        // rotation state
        useCount: rot.useCount ?? 0,
        lastUsedAt: rot.lastUsedAt ?? null,
      };
    });

    return {
      name,
      description: profile.description || "",
      strategy: profile.strategy || "priority",
      aggregate: profile.aggregate || null,
      sourceCount: sources.length,
      sources,
    };
  });

  return NextResponse.json({ pools }, { headers: CORS_HEADERS });
}

function isHealthy(health) {
  if (!health || Object.keys(health).length === 0) return true; // unknown → assume ok
  if (health.quotaPercent !== null && health.quotaPercent !== undefined && health.quotaPercent >= 100) return false;
  if (health.errorRate5m > 0.3) return false;
  if (health.lastErrorAt && Date.now() - health.lastErrorAt < 30_000) return false;
  return true;
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}
