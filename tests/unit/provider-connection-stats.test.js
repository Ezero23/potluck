import { describe, expect, it } from "vitest";
import {
  isProviderConnection,
  providerConnectionsForStats,
} from "@/shared/utils/providerConnectionStats";

describe("provider connection card matching", () => {
  it("counts every auth mode stored for the provider", () => {
    const connections = [
      { id: "legacy-oauth", provider: "kimi", authType: "oauth" },
      { id: "api-key", provider: "kimi", authType: "apikey" },
      { id: "other", provider: "openrouter", authType: "apikey" },
    ];

    expect(providerConnectionsForStats(connections, "kimi").map(({ id }) => id)).toEqual([
      "legacy-oauth",
      "api-key",
    ]);
  });

  it("uses the same provider-wide match for bulk toggles", () => {
    expect(isProviderConnection({ provider: "kimi", authType: "oauth" }, "kimi")).toBe(true);
    expect(isProviderConnection({ provider: "kimi", authType: "apikey" }, "kimi")).toBe(true);
    expect(isProviderConnection({ provider: "openrouter" }, "kimi")).toBe(false);
  });
});
