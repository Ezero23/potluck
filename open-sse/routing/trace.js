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
  constructor(profileName, requestId = '') {
    this.profileName = profileName;
    this.requestId = String(requestId || '').trim().slice(0, 128);
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
  recordSkipped(provider, model, reason, reasonCode = '') {
    this.entries.push({
      provider,
      model,
      status: "skipped",
      reason,
      ...(reasonCode ? { reasonCode } : {}),
      timestamp: Date.now(),
    });
  }

  /** Record the outcome after the request completes. */
  recordOutcome(provider, model, httpStatus, latencyMs, error, reasonCode = '') {
    this.entries.push({
      provider,
      model,
      status: error ? "error" : "success",
      httpStatus,
      latencyMs,
      ...(reasonCode ? { reasonCode } : {}),
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

  toMonitorEvent({ final = false, status = '' } = {}) {
    const candidates = this.entries.map((entry) => ({
      provider: entry.provider,
      model: entry.model,
      status: entry.status,
      ...(entry.reason ? { reason: entry.reason } : {}),
      ...(entry.reasonCode ? { reasonCode: entry.reasonCode } : {}),
      ...(entry.httpStatus ? { httpStatus: entry.httpStatus } : {}),
      ...(Number.isFinite(entry.latencyMs) ? { latencyMs: entry.latencyMs } : {})
    }));
    const success = [...this.entries].reverse().find((entry) => entry.status === 'success');
    const selected = [...this.entries].reverse().find((entry) => entry.status === 'selected' || entry.status === 'success');
    return {
      type: 'routing_attempt',
      requestId: this.requestId,
      profile: this.profileName,
      status: status || (success ? 'success' : 'error'),
      selectedProvider: success?.provider || selected?.provider,
      selectedModel: success?.model || selected?.model,
      fallbackCount: this.entries.filter((entry) => entry.status === 'error').length,
      latencyMs: this.totalLatencyMs,
      final,
      candidates
    };
    }
}
