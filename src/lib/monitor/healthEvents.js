import { getProviderCapabilityRegistry } from "./providerCapabilities.js";

const EVENT_SCHEMA_VERSION = 1;
const MAX_EVENT_BUFFER = 256;
const MAX_EVENT_BATCH = 64;
const MAX_CANDIDATES = 64;
const EVENT_TYPES = new Set(['quota_attempt', 'health_event', 'routing_attempt']);
const STATUS_VALUES = new Set(['success', 'error', 'skipped', 'selected', 'fresh', 'stale', 'unsupported', 'unauthorized', 'rateLimited', 'unavailable']);

let sequence = 0;
let buffer = [];

function text(value, max = 128) {
  return String(value ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function isoOrNull(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function safeKey(value, max = 256) {
  const raw = text(value, max);
  if (!raw || raw.includes('://') || /bearer|token|secret|cookie|authorization|api[_-]?key/i.test(raw)) return '';
  return raw.replace(/[^A-Za-z0-9._:-]/g, '_').slice(0, max);
}

function safeReason(value) {
  const raw = text(value, 160);
  if (!raw || /https?:\/\/|bearer\s|api[_-]?key|access[_-]?token|refresh[_-]?token|cookie|secret/i.test(raw)) return '';
  return raw;
}

function normalizeStatus(value) {
  const raw = text(value, 32);
  return STATUS_VALUES.has(raw) ? raw : '';
}

function normalizeCandidate(candidate) {
  if (!candidate || typeof candidate !== 'object') return null;
  const provider = safeKey(candidate.provider, 64);
  const model = safeKey(candidate.model, 128);
  if (!provider && !model) return null;
  const entry = {
    ...(provider ? { provider } : {}),
    ...(model ? { model } : {}),
    status: normalizeStatus(candidate.status) || 'skipped',
    ...(safeReason(candidate.reason) ? { reason: safeReason(candidate.reason) } : {}),
    ...(safeKey(candidate.reasonCode, 64) ? { reasonCode: safeKey(candidate.reasonCode, 64) } : {}),
    ...(Number.isFinite(Number(candidate.httpStatus)) ? { httpStatus: Number(candidate.httpStatus) } : {}),
    ...(Number.isFinite(Number(candidate.latencyMs)) ? { latencyMs: Math.max(0, Math.round(Number(candidate.latencyMs))) } : {})
  };
  return entry;
}

export function normalizeMonitorEvent(input = {}) {
  if (!input || typeof input !== 'object') return null;
  const type = text(input.type, 32);
  if (!EVENT_TYPES.has(type)) return null;
  const event = {
    schemaVersion: EVENT_SCHEMA_VERSION,
    id: safeKey(input.id, 128) || `evt-${Date.now()}-${++sequence}`,
    type,
    occurredAt: isoOrNull(input.occurredAt || input.timestamp) || new Date().toISOString()
  };
  for (const key of ['requestId', 'attemptId', 'profile', 'provider', 'model', 'connectionKey', 'status', 'reasonCode', 'selectedProvider', 'selectedModel']) {
    const value = key === 'status' ? normalizeStatus(input[key]) : safeKey(input[key], key === 'requestId' ? 128 : 160);
    if (value) event[key] = value;
  }
  const reason = safeReason(input.reason || input.safeDetail);
  if (reason) event.reason = reason;
  const retryAt = isoOrNull(input.retryAt);
  if (retryAt) event.retryAt = retryAt;
  if (Number.isFinite(Number(input.latencyMs))) event.latencyMs = Math.max(0, Math.round(Number(input.latencyMs)));
  if (Number.isFinite(Number(input.httpStatus))) event.httpStatus = Number(input.httpStatus);
  if (Number.isFinite(Number(input.fallbackCount))) event.fallbackCount = Math.max(0, Math.min(64, Math.round(Number(input.fallbackCount))));
  if (input.final === true) event.final = true;
  if (Array.isArray(input.candidates)) {
    const candidates = input.candidates.map(normalizeCandidate).filter(Boolean).slice(0, MAX_CANDIDATES);
    if (candidates.length > 0) event.candidates = candidates;
  }
  return event;
}

export function recordMonitorEvent(input) {
  const event = normalizeMonitorEvent(input);
  if (!event) return null;
  buffer.push(event);
  if (buffer.length > MAX_EVENT_BUFFER) buffer = buffer.slice(-MAX_EVENT_BUFFER);
  return event;
}

export function peekMonitorEvents(limit = MAX_EVENT_BATCH) {
  return buffer.slice(0, Math.max(1, Math.min(MAX_EVENT_BATCH, Number(limit) || MAX_EVENT_BATCH)));
}

export function acknowledgeMonitorEvents(ids = []) {
  const accepted = new Set((Array.isArray(ids) ? ids : []).map((id) => safeKey(id, 128)).filter(Boolean));
  if (accepted.size === 0) return;
  buffer = buffer.filter((event) => !accepted.has(event.id));
}

export function resetMonitorEventsForTests() {
  buffer = [];
  sequence = 0;
}

export function buildHealthSummary(limits) {
  const providers = Array.isArray(limits?.providers) ? limits.providers : [];
  const count = (predicate) => providers.filter(predicate).length;
  const statusCounts = {};
  for (const row of providers) {
    const status = text(row?.status, 32) || 'unknown';
    statusCounts[status] = (statusCounts[status] || 0) + 1;
  }
  return {
    schemaVersion: EVENT_SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    providers: providers.length,
    connections: providers.length,
    healthyConnections: count((row) => row?.connectionStatus === 'ok' && row?.quotaStatus !== 'unauthorized'),
    staleConnections: count((row) => row?.quotaStatus === 'stale'),
    unauthorizedConnections: count((row) => row?.connectionStatus === 'unauthorized' || row?.quotaStatus === 'unauthorized'),
    rateLimitedConnections: count((row) => row?.connectionStatus === 'rateLimited' || row?.quotaStatus === 'rateLimited'),
    unavailableConnections: count((row) => row?.connectionStatus === 'unavailable' || row?.quotaStatus === 'unavailable'),
    statusCounts
  };
}

export function buildMonitorEnvelope(limits) {
  const events = peekMonitorEvents();
  const providers = Array.isArray(limits?.providers) ? limits.providers : [];
  return {
    schemaVersion: EVENT_SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    health: buildHealthSummary(limits),
    capabilities: getProviderCapabilityRegistry(providers),
    ...(events.length > 0 ? { events } : {})
  };
}

export const MONITOR_EVENT_SCHEMA_VERSION = EVENT_SCHEMA_VERSION;
