import { performance } from 'node:perf_hooks';
import { AGENT_GRAPH_OBSERVATION_SCHEMA, normalizeAgentGraphObservation } from '../../contracts/agent-graph-observation.mjs';

const safe = read => { try { return read(); } catch { return null; } };
const nonnegative = value => typeof value === 'number' && Number.isFinite(value)
  && value >= 0 && value <= Number.MAX_SAFE_INTEGER ? value : null;
const bytes = value => Number.isSafeInteger(value) && value >= 0 ? value : null;
const difference = (before, after) => nonnegative(before) !== null && nonnegative(after) !== null
  ? nonnegative(after - before) : null;

/** No polling, persistence, payload logging, or per-operation attribution of shared process use. */
export function startAgentGraphObservation(operation, {
  clock = () => performance.now(), cpu = () => process.cpuUsage(), memory = () => process.memoryUsage(),
} = {}) {
  const started = safe(clock), cpuBefore = safe(cpu), memoryBefore = safe(memory);
  return result => {
    const elapsedMs = difference(started, safe(clock)), cpuAfter = safe(cpu), memoryAfter = safe(memory);
    const user = difference(cpuBefore?.user, cpuAfter?.user), system = difference(cpuBefore?.system, cpuAfter?.system);
    const userMs = user === null ? null : user / 1000, systemMs = system === null ? null : system / 1000;
    const observation = normalizeAgentGraphObservation({
      schema: AGENT_GRAPH_OBSERVATION_SCHEMA, operation, status: result.ok === true ? 'completed' : 'failed', elapsedMs,
      cpu: { scope: 'node-process-window', userMs, systemMs,
        totalMs: userMs === null || systemMs === null ? null : nonnegative(userMs + systemMs) },
      memory: { scope: 'node-process-endpoint-samples', rssBeforeBytes: bytes(memoryBefore?.rss),
        rssAfterBytes: bytes(memoryAfter?.rss), heapUsedBeforeBytes: bytes(memoryBefore?.heapUsed), heapUsedAfterBytes: bytes(memoryAfter?.heapUsed) },
      output: { bytes: safe(() => Buffer.byteLength(JSON.stringify(result))), basis: 'utf8-json-excluding-observation' },
      model: { id: null, calls: 0, promptTokens: 0, completionTokens: 0, costUsd: 0, scope: 'native-runtime-only' },
      sources: { parsed: bytes(result.counts?.parsed), reused: bytes(result.counts?.reused), admittedBytes: bytes(result.counts?.admittedBytes) },
    });
    // Error envelopes have an exact top-level contract shared with OS/Canvas consumers.
    return result.ok === true ? { ...result, observation }
      : { ...result, error: { ...result.error, details: { ...result.error?.details, observation } } };
  };
}
