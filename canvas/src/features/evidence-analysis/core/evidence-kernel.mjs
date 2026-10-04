import { digest, MAX_BYTES } from './contracts.mjs';

export const ALGORITHM = 'evidence-order/v2';
export const PACK_SCHEMA = 'evidence-pack/v1';
const handles = new WeakMap();
const encoder = new TextEncoder();
const cost = Object.freeze({ modelCalls: 0, billedApiCalls: 0, estimatedCost: 0 });
const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;
export class EvidenceError extends Error {
  constructor(code, message, path = '') { super(message); this.name = 'EvidenceError'; this.code = code; this.path = path; }
}
function requireValue(ok, code, message, path = '') {
  if (!ok) throw new EvidenceError(code, message, path);
}
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
function keys(value, expected, path) {
  requireValue(record(value) && Object.keys(value).length === expected.length && expected.every(key => Object.hasOwn(value, key)),
    'SCHEMA', 'Missing or unsupported fields.', path);
}
function validString(value) {
  return typeof value === 'string' && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(value)
    && [...value].every(c => c.length === 2 || c.charCodeAt(0) < 0xd800 || c.charCodeAt(0) > 0xdfff);
}
function text(value, path, limit = 2048) {
  requireValue(validString(value) && value.trim().length > 0 && value.length <= limit, 'TEXT', 'Expected bounded nonblank Unicode text.', path);
}
function ids(values, path) {
  requireValue(Array.isArray(values) && values.length > 0 && values.every(value => validString(value) && value.trim() && value.length <= 120)
    && new Set(values).size === values.length, 'IDENTITY', 'Expected unique nonblank identifiers.', path);
}
export function canonicalJson(value) {
  const visit = (item, depth) => {
    requireValue(depth <= 64, 'DEPTH', 'JSON nesting exceeds the supported bound.');
    if (item === null || typeof item === 'boolean') return JSON.stringify(item);
    if (typeof item === 'string') { requireValue(validString(item), 'TEXT', 'Invalid Unicode text.'); return JSON.stringify(item); }
    if (typeof item === 'number') { requireValue(Number.isFinite(item), 'NUMBER', 'Only finite JSON numbers are accepted.'); return JSON.stringify(item); }
    if (Array.isArray(item)) return '[' + Array.from(item, value => visit(value, depth + 1)).join(',') + ']';
    requireValue(record(item) && [Object.prototype, null].includes(Object.getPrototypeOf(item)), 'SCHEMA', 'Only JSON values are accepted.');
    return '{' + Object.keys(item).sort(compare).map(key => visit(key, depth + 1) + ':' + visit(item[key], depth + 1)).join(',') + '}';
  };
  return visit(value, 0);
}
export function parseJson(raw, path) {
  let value;
  try { value = JSON.parse(raw); } catch { throw new EvidenceError('JSON', 'Malformed JSON.', path); }
  // JSON.parse alone silently accepts duplicate member names. Refuse that ambiguity.
  const stack = [];
  for (const token of raw.match(/"(?:\\.|[^"\\])*"|[{}\[\]:,]/gu) || []) {
    if (token === '{' || token === '[') stack.push({ object: token === '{', key: token === '{', names: new Set() });
    else if (token === '}' || token === ']') stack.pop();
    else if (token === ',') { if (stack.length) stack.at(-1).key = stack.at(-1).object; }
    else if (token === ':') { if (stack.length) stack.at(-1).key = false; }
    else if (stack.at(-1)?.key) {
      const name = JSON.parse(token), owner = stack.at(-1);
      requireValue(!owner.names.has(name), 'DUPLICATE_KEY', 'Duplicate JSON member.', path);
      owner.names.add(name); owner.key = false;
    }
  }
  canonicalJson(value);
  return value;
}
function freeze(value) {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}
export function utcMillis(value, path = 'atUtc') {
  requireValue(typeof value === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/u.test(value), 'UTC', 'Use an exact UTC timestamp with seconds and optional three-digit milliseconds.', path);
  const millis = Date.parse(value), expected = value.includes('.') ? value : value.replace('Z', '.000Z');
  requireValue(Number.isFinite(millis) && new Date(millis).toISOString() === expected, 'UTC', 'Invalid calendar timestamp.', path);
  return millis;
}
function validateProfile(input) {
  const profile = parseJson(canonicalJson(input), 'profile');
  keys(profile, ['schema', 'id', 'version', 'bundleSchema', 'limits', 'classifications', 'rightsStatuses', 'staleAfterSeconds', 'gapAfterSeconds', 'requiredKinds', 'ui', 'fields'], 'profile');
  requireValue(profile.schema === 'evidence-profile/v1', 'PROFILE', 'Unsupported profile schema.');
  for (const key of ['id', 'version', 'bundleSchema']) text(profile[key], 'profile.' + key, 120);
  const limitKeys = ['maxBytes', 'maxPackBytes', 'maxEntities', 'maxFacts', 'maxSources', 'maxSpanSeconds', 'maxTextLength'];
  keys(profile.limits, limitKeys, 'profile.limits');
  requireValue(limitKeys.every(key => Number.isSafeInteger(profile.limits[key]) && profile.limits[key] > 0)
    && profile.limits.maxBytes <= MAX_BYTES && profile.limits.maxPackBytes >= profile.limits.maxBytes
    && profile.limits.maxPackBytes <= 2000000 && profile.limits.maxEntities <= 10 && profile.limits.maxFacts <= 5000
    && profile.limits.maxSpanSeconds <= 86400, 'PROFILE', 'Invalid profile resource bounds.');
  ids(profile.classifications, 'profile.classifications'); ids(profile.requiredKinds, 'profile.requiredKinds');
  keys(profile.rightsStatuses, profile.classifications, 'profile.rightsStatuses');
  Object.entries(profile.rightsStatuses).forEach(([key, value]) => ids(value, 'profile.rightsStatuses.' + key));
  keys(profile.ui, ['title', 'description', 'entityLabel', 'fixturePath'], 'profile.ui');
  Object.entries(profile.ui).forEach(([key, value]) => text(value, 'profile.ui.' + key));
  requireValue(['staleAfterSeconds', 'gapAfterSeconds'].every(key => Number.isFinite(profile[key]) && profile[key] > 0), 'PROFILE', 'Invalid temporal policy.');
  requireValue(Array.isArray(profile.fields) && profile.fields.length > 0, 'PROFILE', 'Profile fields are required.');
  for (const field of profile.fields) {
    keys(field, ['key', 'label', 'type', 'nullable', 'units', 'datums', 'sameDatum', 'canonicalUnit', 'conversions', 'range', 'components'], 'profile.fields');
    text(field.key, 'field.key', 120); text(field.label, 'field.label', 120);
    ids(field.units, 'field.units'); ids(field.datums, 'field.datums');
    requireValue(['number', 'string', 'vector', 'utc'].includes(field.type) && typeof field.nullable === 'boolean'
      && typeof field.sameDatum === 'boolean' && field.units.includes(field.canonicalUnit), 'PROFILE', 'Invalid field policy.');
    requireValue(Array.isArray(field.conversions) && Array.isArray(field.components), 'PROFILE', 'Invalid field configuration.');
    for (const conversion of field.conversions) {
      keys(conversion, ['from', 'to', 'factor'], 'conversion');
      requireValue(field.type === 'number' && field.units.includes(conversion.from) && conversion.from !== field.canonicalUnit
        && conversion.to === field.canonicalUnit && Number.isFinite(conversion.factor) && conversion.factor > 0, 'PROFILE', 'Invalid declared unit conversion.');
    }
    requireValue(new Set(field.conversions.map(c => c.from)).size === field.conversions.length
      && field.units.every(unit => unit === field.canonicalUnit || field.conversions.some(c => c.from === unit)), 'PROFILE', 'Every alternate unit needs one conversion.');
    if (field.type === 'number') requireValue(Array.isArray(field.range) && field.range.length === 2 && field.range.every(Number.isFinite) && field.range[0] < field.range[1], 'PROFILE', 'Numeric range required.');
    else requireValue(field.range === null && field.conversions.length === 0, 'PROFILE', 'Unexpected numeric policy.');
    if (field.type === 'vector') {
      requireValue(field.components.length > 0, 'PROFILE', 'Vector components required.');
      ids(field.components.map(c => c?.key), 'field.components');
      for (const component of field.components) {
        keys(component, ['key', 'minimum', 'maximum'], 'component');
        requireValue(Number.isFinite(component.minimum) && Number.isFinite(component.maximum) && component.minimum < component.maximum, 'PROFILE', 'Invalid component range.');
      }
    } else requireValue(field.components.length === 0, 'PROFILE', 'Unexpected vector policy.');
  }
  ids(profile.fields.map(field => field.key), 'profile.fields');
  requireValue(profile.requiredKinds.every(kind => profile.fields.some(field => field.key === kind)), 'PROFILE', 'Unknown required field.');
  return freeze(profile);
}
function decimalParts(value) {
  const [mantissa, exponent = '0'] = String(value).split('e');
  const [integer, fraction = ''] = mantissa.split('.');
  return [BigInt(integer + fraction), Number(exponent) - fraction.length];
}
function decimalValue(fact, field) {
  requireValue(typeof fact.value === 'number' && Number.isFinite(fact.value), 'RANGE', 'Expected a finite numeric value.', fact.id);
  let [coefficient, exponent] = decimalParts(fact.value);
  if (fact.unit !== field.canonicalUnit) {
    const conversion = field.conversions.find(item => item.from === fact.unit);
    requireValue(conversion, 'UNIT', 'Unit conversion is not declared.', fact.id);
    const [factor, factorExponent] = decimalParts(conversion.factor);
    coefficient *= factor; exponent += factorExponent;
  }
  // Compare exact decimal products, without a tolerance or binary multiply noise.
  if (coefficient === 0n) return '0e0';
  while (coefficient % 10n === 0n) { coefficient /= 10n; exponent += 1; }
  return `${coefficient}e${exponent}`;
}
export function comparisonValue(fact, field) {
  return fact.value !== null && field.type === 'number' ? decimalValue(fact, field) : normalizedValue(fact, field);
}
export function normalizedValue(fact, field) {
  if (fact.value === null) return null;
  if (field.type === 'utc') return new Date(utcMillis(fact.value, fact.id + '.value')).toISOString();
  if (fact.unit === field.canonicalUnit) return fact.value;
  const conversion = field.conversions.find(item => item.from === fact.unit);
  requireValue(conversion, 'UNIT', 'Unit conversion is not declared.', fact.id);
  // The display number rounds once from the exact product; comparison keeps its exact key.
  return Number(decimalValue(fact, field));
}
function validateValue(fact, field, profile) {
  requireValue(field.units.includes(fact.unit), 'UNIT', 'Unknown unit.', fact.id);
  requireValue(field.datums.includes(fact.datum), 'DATUM', 'Unknown reference datum.', fact.id);
  if (fact.value === null) {
    requireValue(field.nullable, 'VALUE', 'Field is not nullable.', fact.id);
    text(fact.null_reason, fact.id + '.null_reason', profile.limits.maxTextLength); return;
  }
  requireValue(fact.null_reason === null, 'VALUE', 'A present value cannot have a missing-value reason.', fact.id);
  if (field.type === 'number') {
    const value = normalizedValue(fact, field);
    requireValue(typeof fact.value === 'number' && Number.isFinite(value) && value >= field.range[0] && value <= field.range[1], 'RANGE', 'Numeric value is outside its declared range.', fact.id);
  } else if (field.type === 'vector') {
    keys(fact.value, field.components.map(component => component.key), fact.id + '.value');
    requireValue(field.components.every(c => Number.isFinite(fact.value[c.key]) && fact.value[c.key] >= c.minimum && fact.value[c.key] <= c.maximum), 'RANGE', 'Vector value is outside its declared range.', fact.id);
  } else if (field.type === 'utc') utcMillis(fact.value, fact.id + '.value');
  else text(fact.value, fact.id + '.value', profile.limits.maxTextLength);
}
function pointerValue(value, pointer, path) {
  requireValue(typeof pointer === 'string' && pointer.startsWith('/') && pointer.length <= 2048 && !/~(?:[^01]|$)/u.test(pointer), 'REFERENCE', 'Use a bounded JSON Pointer into the original source.', path);
  for (const part of pointer.slice(1).split('/')) {
    const key = part.replace(/~1/gu, '/').replace(/~0/gu, '~');
    requireValue(value !== null && typeof value === 'object' && Object.hasOwn(value, key), 'REFERENCE', 'Evidence reference does not exist.', path);
    value = value[key];
  }
  return value;
}
const factKeys = ['id', 'entity_id', 'source_id', 'kind', 'observed_at', 'retrieved_at', 'value', 'unit', 'datum', 'evidence_ref', 'null_reason'];
function validateBundle(bundle, profile) {
  keys(bundle, ['schema', 'profile', 'dataset', 'sources', 'entities', 'facts'], 'bundle');
  keys(bundle.profile, ['id', 'version'], 'bundle.profile');
  requireValue(bundle.schema === profile.bundleSchema && bundle.profile.id === profile.id && bundle.profile.version === profile.version, 'PROFILE', 'Bundle/profile identity mismatch.');
  keys(bundle.dataset, ['id', 'title', 'classification'], 'dataset');
  text(bundle.dataset.id, 'dataset.id', 120); text(bundle.dataset.title, 'dataset.title');
  requireValue(profile.classifications.includes(bundle.dataset.classification), 'PROVENANCE', 'Declared evidence classification required.');
  for (const [key, limit] of [['entities', 'maxEntities'], ['sources', 'maxSources'], ['facts', 'maxFacts']]) {
    requireValue(Array.isArray(bundle[key]) && bundle[key].length > 0 && bundle[key].length <= profile.limits[limit], 'LIMIT', 'Collection exceeds its declared bound.', key);
    ids(bundle[key].map(value => value?.id), key);
  }
  for (const entity of bundle.entities) { keys(entity, ['id', 'label'], 'entity'); text(entity.label, 'entity.label', profile.limits.maxTextLength); }
  const originals = new Map(), sourceTimes = new Map();
  for (const source of bundle.sources) {
    keys(source, ['id', 'origin', 'rights', 'retrieved_at', 'original'], 'source');
    text(source.origin, source.id + '.origin', profile.limits.maxTextLength);
    keys(source.rights, ['status', 'statement'], source.id + '.rights');
    requireValue(profile.rightsStatuses[bundle.dataset.classification].includes(source.rights.status), 'RIGHTS', 'A compatible rights declaration is required.', source.id);
    text(source.rights.statement, source.id + '.rights.statement', profile.limits.maxTextLength);
    sourceTimes.set(source.id, utcMillis(source.retrieved_at, source.id + '.retrieved_at'));
    keys(source.original, ['media_type', 'text', 'sha256'], source.id + '.original');
    requireValue(source.original.media_type === 'application/json' && validString(source.original.text)
      && /^[a-f0-9]{64}$/u.test(source.original.sha256), 'ORIGINAL', 'Expected original JSON bytes and SHA-256.', source.id);
    const bytes = encoder.encode(source.original.text);
    requireValue(bytes.length > 0 && bytes.length <= profile.limits.maxBytes, 'LIMIT', 'Original source exceeds its byte bound.', source.id);
    originals.set(source.id, { bytes, value: parseJson(source.original.text, source.id + '.original') });
  }
  const entityIds = new Set(bundle.entities.map(entity => entity.id)), datumByField = new Map();
  let minimum = Infinity, maximum = -Infinity;
  for (const fact of bundle.facts) {
    keys(fact, factKeys, 'fact');
    const field = profile.fields.find(item => item.key === fact.kind);
    requireValue(entityIds.has(fact.entity_id) && originals.has(fact.source_id) && field, 'REFERENCE', 'Unknown entity, source or field.', fact.id);
    const observed = utcMillis(fact.observed_at, fact.id + '.observed_at'), retrieved = utcMillis(fact.retrieved_at, fact.id + '.retrieved_at');
    requireValue(retrieved >= observed && sourceTimes.get(fact.source_id) >= retrieved, 'TIME_ORDER', 'Retrieval precedes the evidence it describes.', fact.id);
    minimum = Math.min(minimum, observed); maximum = Math.max(maximum, observed);
    validateValue(fact, field, profile);
    if (field.sameDatum && fact.value !== null) {
      const key = canonicalJson([fact.entity_id, fact.kind]);
      requireValue(!datumByField.has(key) || datumByField.get(key) === fact.datum, 'DATUM_CONFLICT', 'Incompatible datums require an admitted conversion model.', fact.id);
      datumByField.set(key, fact.datum);
    }
    const { evidence_ref, ...originalFact } = fact;
    requireValue(canonicalJson(pointerValue(originals.get(fact.source_id).value, evidence_ref, fact.id)) === canonicalJson(originalFact), 'REFERENCE', 'Fact does not match its referenced original record.', fact.id);
  }
  requireValue((maximum - minimum) / 1000 <= profile.limits.maxSpanSeconds, 'LIMIT', 'Observed timeline exceeds its declared span.');
  for (const entity of bundle.entities) requireValue(profile.requiredKinds.every(kind => bundle.facts.some(fact => fact.entity_id === entity.id && fact.kind === kind)), 'MISSING_FIELD', 'Every entity needs required fields or explicit null reasons.', entity.id);
  return { originals, minimum, maximum };
}
function decode(bytes, maximum, path) {
  requireValue(bytes instanceof Uint8Array && bytes.byteLength > 0 && bytes.byteLength <= maximum, 'LIMIT', 'Input exceeds its byte bound or is empty.', path);
  try { return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes); }
  catch { throw new EvidenceError('UTF8', 'Input must be valid UTF-8.', path); }
}
function sortedFacts(facts) {
  return [...facts].sort((a, b) => utcMillis(a.observed_at) - utcMillis(b.observed_at) || compare(a.source_id, b.source_id) || compare(a.id, b.id));
}
export async function admit(input, authoredProfile) {
  const profile = validateProfile(authoredProfile);
  const supplied = input instanceof Uint8Array ? new Uint8Array(input) : input;
  const textInput = decode(supplied, profile.limits.maxPackBytes, 'input');
  let bundle = parseJson(textInput, 'input'), bytes = supplied, pack = null;
  if (bundle?.schema === PACK_SCHEMA) {
    pack = bundle;
    keys(pack, ['schema', 'profile', 'algorithm', 'original', 'derivedSha256'], 'pack');
    keys(pack.profile, ['id', 'version', 'sha256'], 'pack.profile');
    keys(pack.original, ['text', 'sha256'], 'pack.original');
    requireValue(typeof pack.original.text === 'string', 'PACK', 'Unsupported portable evidence pack.');
    requireValue(pack.algorithm === ALGORITHM, 'PACK', `Unsupported pack algorithm. This runtime uses ${ALGORITHM}; retain the old pack and explicitly import its original.text as a raw bundle to create a new identity. No automatic migration.`, 'pack.algorithm');
    bytes = encoder.encode(pack.original.text);
    bundle = parseJson(decode(bytes, profile.limits.maxBytes, 'pack.original'), 'pack.original');
  } else requireValue(bytes.length <= profile.limits.maxBytes, 'LIMIT', 'Original bundle exceeds its byte bound.');
  const checked = validateBundle(bundle, profile);
  for (const source of bundle.sources) requireValue(await digest(checked.originals.get(source.id).bytes) === source.original.sha256, 'DIGEST', 'Original source digest does not match.', source.id);
  const profileSha256 = await digest(encoder.encode(canonicalJson(profile)));
  const profileIdentity = { id: profile.id, version: profile.version, sha256: profileSha256 };
  const sources = bundle.sources.map(source => ({ id: source.id, origin: source.origin, rights: source.rights,
    retrieved_at: source.retrieved_at, sha256: source.original.sha256, byteLength: checked.originals.get(source.id).bytes.length })).sort((a, b) => compare(a.id, b.id));
  const derived = { schema: 'evidence-record/v1', dataset: bundle.dataset, profile: profileIdentity, algorithm: ALGORITHM,
    sources, entities: [...bundle.entities].sort((a, b) => compare(a.id, b.id)), facts: sortedFacts(bundle.facts) };
  const identity = { originalSha256: await digest(bytes), derivedSha256: await digest(encoder.encode(canonicalJson(derived))) };
  if (pack) requireValue(canonicalJson(pack.profile) === canonicalJson(profileIdentity) && pack.original.sha256 === identity.originalSha256
    && pack.derivedSha256 === identity.derivedSha256, 'DIGEST', 'Portable pack binding or digest mismatch.');
  const snapshot = freeze({ bundle, profile, identity, derived,
    stats: { entityCount: bundle.entities.length, factCount: bundle.facts.length, sourceCount: bundle.sources.length,
      startUtc: new Date(checked.minimum).toISOString(), endUtc: new Date(checked.maximum).toISOString() } });
  const handle = Object.freeze({ identity: snapshot.identity, profile: snapshot.profile });
  handles.set(handle, { snapshot, bytes: new Uint8Array(bytes) });
  return handle;
}
export function readEvidence(handle) {
  const value = handles.get(handle);
  requireValue(value, 'SESSION', 'An admitted evidence handle is required.');
  return value.snapshot;
}
export function originalBytes(handle) {
  readEvidence(handle); return new Uint8Array(handles.get(handle).bytes);
}
export function inspect(handle) {
  const data = readEvidence(handle);
  return freeze({ ...data.derived, schema: 'evidence-inspection/v1', identity: data.identity, stats: data.stats, cost });
}
export function sourceEvidence(handle, factId) {
  const data = readEvidence(handle), fact = data.derived.facts.find(item => item.id === factId);
  requireValue(typeof factId === 'string' && fact, 'FACT', 'Select an admitted fact.', 'factId');
  const source = data.bundle.sources.find(item => item.id === fact.source_id);
  const referencedRecord = pointerValue(parseJson(source.original.text, source.id + '.original'), fact.evidence_ref, fact.id);
  return freeze({ schema: 'evidence-source/v1', identity: data.identity, profile: data.derived.profile,
    fact, source, reference: fact.evidence_ref, referencedRecord });
}
export async function exportPack(handle) {
  const data = readEvidence(handle);
  const pack = { schema: PACK_SCHEMA, profile: data.derived.profile, algorithm: ALGORITHM,
    original: { text: decode(originalBytes(handle), data.profile.limits.maxBytes, 'original'), sha256: data.identity.originalSha256 },
    derivedSha256: data.identity.derivedSha256 };
  const bytes = encoder.encode(canonicalJson(pack));
  requireValue(bytes.length <= data.profile.limits.maxPackBytes, 'LIMIT', 'Portable pack exceeds its declared byte bound.');
  return bytes;
}
export function createSession(profile) {
  const admittedProfile = validateProfile(profile);
  let generation = 0, current = null;
  return Object.freeze({
    read: () => current,
    clear() { generation += 1; current = null; },
    async import(input) {
      const intent = ++generation;
      try {
        const supplied = input instanceof Uint8Array ? new Uint8Array(input) : input;
        const value = await admit(await supplied, admittedProfile);
        if (intent !== generation) return Object.freeze({ accepted: false, stale: true, value: current });
        current = value; return Object.freeze({ accepted: true, stale: false, value });
      } catch (error) {
        if (intent !== generation) return Object.freeze({ accepted: false, stale: true, value: current });
        throw error;
      }
    },
  });
}
