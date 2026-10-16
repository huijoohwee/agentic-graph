// Transport-neutral operation metadata; authored profile/policy selection is explicit.
const string = maxLength => ({ type: 'string', minLength: 1, maxLength });
const fields = {
  profileId: string(96), policyId: string(96), viewId: string(96),
  bundle: string(2_000_000), notice: string(12_000), entityId: string(128), factId: string(128), atUtc: string(32),
  bundles: { type: 'array', minItems: 1, maxItems: 40, items: string(2_000_000) },
};
const definitions = [
  ['aviation.inspect', 'evidence_inspect', 'Inspect evidence', ['profileId', 'bundle'], 'Inspect admitted facts, source provenance and explicit unknowns.'],
  ['aviation.replay', 'evidence_replay', 'Replay evidence', ['profileId', 'bundle', 'entityId', 'atUtc'], 'Project an admitted entity at an explicit UTC instant.'],
  ['aviation.source', 'evidence_source', 'Read evidence source', ['profileId', 'bundle', 'factId'], 'Read the retained original source and exact reference for an admitted fact.'],
  ['aviation.export', 'evidence_export', 'Export evidence pack', ['profileId', 'bundle'], 'Produce a portable pack retaining original bytes and bound derived identities.'],
  ['volume.project', 'evidence_volume_project', 'Project structured volume', ['profileId', 'viewId', 'bundle', 'entityId', 'atUtc'], 'Validate a simple closed polygon, compatible vertical datum and continuous time interval.'],
  ['arrival.evaluate', 'evidence_arrival_evaluate', 'Evaluate arrival estimates', ['profileId', 'policyId', 'bundles'], 'Evaluate chronological training, calibration and held-out arrival cases against frozen baselines.'],
  ['route.benchmark', 'evidence_route_benchmark', 'Benchmark route distance', ['profileId', 'policyId', 'bundle', 'entityId'], 'Compare admitted routes with an authored distance model and declared uncertainty.'],
  ['notice.triage', 'evidence_notice_triage', 'Triage structured notice', ['profileId', 'policyId', 'viewId', 'notice', 'atUtc'], 'Retain a structured notice and validate explicitly supported geometry, time and altitude; refuse unsupported interpretation.'],
];
const freeze = value => { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };
const outputSchemas = ['evidence-inspection/v1', 'evidence-replay/v1', 'evidence-source/v1', 'evidence-export/v1',
  'volume-projection/v1', 'arrival-analysis/v1', 'route-benchmark/v1', 'notice-triage/v1'];
const failureSchema = { type: 'object', additionalProperties: false, required: ['ok', 'error'], properties: {
  ok: { const: false }, error: { type: 'object', additionalProperties: false, required: ['code', 'message', 'path'],
    properties: { code: { type: 'string' }, message: { type: 'string' }, path: { type: 'string' } } },
} };
export const EVIDENCE_OPERATIONS = freeze(definitions.map(([operation, name, title, required, description], index) => ({
  operation, name, webName: `agentic-graph.${name}`, title, description,
  inputSchema: { type: 'object', additionalProperties: false, required, properties: Object.fromEntries(required.map(key => [key, fields[key]])) },
  outputSchema: { type: 'object', oneOf: [{ type: 'object', additionalProperties: true, required: ['schema'], properties: { schema: { const: outputSchemas[index] } } }, failureSchema] },
  annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false, idempotentHint: true },
  invocation: `/${operation} @evidence #evidence`,
})));
export const findEvidenceOperation = name => EVIDENCE_OPERATIONS.find(item => item.operation === name || item.name === name || item.webName === name);
export const isEvidenceToolName = name => EVIDENCE_OPERATIONS.some(item => item.name === name || item.webName === name);

// All transports call this flat-schema validator before any asynchronous admission.
export function validateEvidenceArguments(definition, input) {
  const fail = path => ({ ok: false, error: { code: 'INPUT', message: 'Arguments do not match the declared evidence operation schema.', path } });
  if (!input || typeof input !== 'object' || Array.isArray(input)) return fail('arguments');
  const { required, properties } = definition.inputSchema;
  if (Object.keys(input).some(key => !Object.hasOwn(properties, key))) return fail('arguments');
  for (const key of required) {
    const value = input[key], schema = properties[key];
    if (schema.type === 'string') {
      if (typeof value !== 'string' || value.length < schema.minLength || value.length > schema.maxLength) return fail(key);
    } else if (!Array.isArray(value) || value.length < schema.minItems || value.length > schema.maxItems
      || value.some(item => typeof item !== 'string' || item.length < schema.items.minLength || item.length > schema.items.maxLength)) return fail(key);
  }
  return null;
}
