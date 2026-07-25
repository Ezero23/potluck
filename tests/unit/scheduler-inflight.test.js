import { describe, it, expect, beforeEach, vi } from "vitest";

// Isolate the scheduler from the usage-cache import chain (provider modules,
// network, env). All sources look healthy, so selection is driven purely by
// recency + in-flight penalty.
vi.mock("../../open-sse/routing/usageCache.js", () => ({
  getHealth: () => undefined,
}));

import {
  selectNextSource,
  markSourceUsed,
  acquireSource,
  releaseSource,
  getSourceStats,
  resetRotationState,
} from "../../open-sse/routing/scheduler.js";

const A = { provider: "p", model: "a" };
const B = { provider: "p", model: "b" };

describe("scheduler in-flight concurrency tracking", () => {
  beforeEach(() => {
    resetRotationState();
  });

  it("prefers an idle source over an in-flight one", () => {
    acquireSource("p", "a");
    expect(selectNextSource([A, B])).toEqual(B);
  });

  it("deprioritizes busy sources without starving them entirely", () => {
    // B was used longer ago (seq 0) but is busy; A was used more recently
    // (seq 1) but is idle. Penalty pushes B's effective recency past A's,
    // so idle A wins.
    markSourceUsed("p", "b");
    markSourceUsed("p", "a");
    acquireSource("p", "b");
    expect(selectNextSource([A, B])).toEqual(A);
  });

  it("still picks a busy source when it is the only option", () => {
    acquireSource("p", "a"); // A: 1 in-flight
    acquireSource("p", "b");
    acquireSource("p", "b"); // B: 2 in-flight
    // Both busy → the less-busy source wins; a lone busy source is still used.
    expect(selectNextSource([A, B])).toEqual(A);
    expect(selectNextSource([A])).toEqual(A);
  });

  it("resumes normal rotation once the in-flight slot is released", () => {
    acquireSource("p", "a");
    expect(selectNextSource([A, B])).toEqual(B);
    releaseSource("p", "a");
    // Fully tied again (neither ever used) → stable order → first in array.
    expect(selectNextSource([A, B])).toEqual(A);
  });

  it("counts concurrent slots exactly and never goes negative", () => {
    acquireSource("p", "a");
    acquireSource("p", "a");
    expect(getSourceStats()["p/a"].inFlight).toBe(2);
    releaseSource("p", "a");
    expect(getSourceStats()["p/a"].inFlight).toBe(1);
    releaseSource("p", "a");
    expect(getSourceStats()["p/a"]).toBeUndefined();
    releaseSource("p", "a"); // extra release — must not corrupt state
    expect(getSourceStats()["p/a"]).toBeUndefined();
  });

  it("exposes in-flight sources in stats even before first recorded use", () => {
    acquireSource("p", "c");
    expect(getSourceStats()["p/c"]).toEqual({
      lastUsedAt: null,
      useCount: 0,
      inFlight: 1,
    });
  });

  it("resetRotationState clears in-flight counts", () => {
    acquireSource("p", "a");
    markSourceUsed("p", "a");
    resetRotationState();
    expect(getSourceStats()).toEqual({});
    expect(selectNextSource([A, B])).toEqual(A);
  });
});
