/** Portable allowlist for optional execution observations; never source evidence or billing. */
export const AGENT_GRAPH_OBSERVATION_SCHEMA = 'agentic-graph-operation-observation/v1';
const fields = ['schema', 'operation', 'status', 'elapsedMs', 'cpu', 'memory', 'output', 'model', 'sources'];
const keys = (value, names) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).length === names.length && names.every(name => Object.hasOwn(value, name));
const number = value => value === null || typeof value === 'number'
  && Number.isFinite(value) && value >= 0 && value <= Number.MAX_SAFE_INTEGER;
const integer = value => value === null || Number.isSafeInteger(value) && value >= 0;

/** Reject malformed optional data; absent observations from older hosts stay absent. */
export function normalizeAgentGraphObservation(value) {
  if (value === undefined) return undefined;
  if (!keys(value, fields) || value.schema !== AGENT_GRAPH_OBSERVATION_SCHEMA
    || !['ingest', 'query', 'explain_edge'].includes(value.operation)
    || !['completed', 'failed'].includes(value.status) || !number(value.elapsedMs)
    || !keys(value.cpu, ['scope', 'userMs', 'systemMs', 'totalMs'])
    || value.cpu.scope !== 'node-process-window'
    || ![value.cpu.userMs, value.cpu.systemMs, value.cpu.totalMs].every(number)
    || (value.cpu.userMs === null || value.cpu.systemMs === null
      ? value.cpu.totalMs !== null : value.cpu.totalMs !== value.cpu.userMs + value.cpu.systemMs)
    || !keys(value.memory, ['scope', 'rssBeforeBytes', 'rssAfterBytes', 'heapUsedBeforeBytes', 'heapUsedAfterBytes'])
    || value.memory.scope !== 'node-process-endpoint-samples'
    || !['rssBeforeBytes', 'rssAfterBytes', 'heapUsedBeforeBytes', 'heapUsedAfterBytes'].every(key => integer(value.memory[key]))
    || !keys(value.output, ['bytes', 'basis']) || !integer(value.output.bytes)
    || value.output.basis !== 'utf8-json-excluding-observation'
    || !keys(value.model, ['id', 'calls', 'promptTokens', 'completionTokens', 'costUsd', 'scope'])
    || value.model.id !== null || value.model.calls !== 0 || value.model.promptTokens !== 0
    || value.model.completionTokens !== 0 || value.model.costUsd !== 0
    || value.model.scope !== 'native-runtime-only'
    || !keys(value.sources, ['parsed', 'reused', 'admittedBytes'])
    || !Object.values(value.sources).every(integer)) throw new TypeError('Invalid native graph operation observation.');
  return Object.freeze({ ...value, cpu: Object.freeze({ ...value.cpu }), memory: Object.freeze({ ...value.memory }),
    output: Object.freeze({ ...value.output }), model: Object.freeze({ ...value.model }), sources: Object.freeze({ ...value.sources }) });
}
