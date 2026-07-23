/**
 * Routing trace — records the decision path for each request.
 *
 * Each trace entry: { provider, model, status, reason, latencyMs }
 * The chain is returned to the caller via X-Routing-Chain response header.
 */

// ---------------------------------------------------------------------------
// Trace builder
// ---------------------------------------------------------------------------

/**
 * @typedef {{
 *   provider: string,
 *   model: string,
 *   status: "selected" | "success" | "error" | "skipped",
 *   reason?: string,
 *   httpStatus?: number,
 *   latencyMs?: number,
 * }} TraceEntry
 */

export class RoutingTrace {
  constructor(profileName) {
    this.profileName = profileName;
    this.entries = [];
    this.startedAt = Date.now();
  }

  /** Record that a candidate was selected (before sending request). */
  recordSelected(provider, model) {
    this.entries.push({
      provider,
      model,
      status: "selected",
      timestamp: Date.now(),
    });
  }

  /** Record that a candidate was skipped (unhealthy / quota full). */
  recordSkipped(provider, model, reason) {
    this.entries.push({
      provider,
      model,
      status: "skipped",
      reason,
      timestamp: Date.now(),
    });
  }

  /** Record the outcome after the request completes. */
  recordOutcome(provider, model, httpStatus, latencyMs, error) {
    this.entries.push({
      provider,
      model,
      status: error ? "error" : "success",
      httpStatus,
      latencyMs,
      reason: error,
      timestamp: Date.now(),
    });
  }

  /** Total elapsed time. */
  get totalLatencyMs() {
    return Date.now() - this.startedAt;
  }

  /** Build the X-Routing-Chain header value. */
  toChainHeader() {
    return this.entries
      .filter((e) => e.status === "selected" || e.status === "success" || e.status === "error")
      .map((e) => {
        const code = e.httpStatus || (e.status === "selected" ? "sel" : e.status === "success" ? "ok" : "err");
        return `${e.provider}/${e.model}:${code}`;
      })
      .join(" → ");
  }

  /** Build the X-Selected-Provider header value. */
  toSelectedHeader() {
    const success = this.entries.find((e) => e.status === "success");
    if (success) return `${success.provider}/${success.model}`;
    const last = this.entries[this.entries.length - 1];
    return last ? `${last.provider}/${last.model}` : "none";
  }

  /** Return headers object for injection into response. */
  toHeaders() {
    return {
      "X-Routing-Chain": this.toChainHeader(),
      "X-Selected-Provider": this.toSelectedHeader(),
      "X-Routing-Profile": this.profileName || "none",
    };
  }

  /** Human-readable summary for logging. */
  toLogString() {
    const chain = this.toChainHeader();
    return `[routing:${this.profileName}] ${chain} (${this.totalLatencyMs}ms)`;
  }
}