import { digest } from './contracts.mjs';
import { EvidenceError, parseJson, canonicalJson, utcMillis, admit } from './evidence-kernel.mjs';
import { projectVolume } from './volume-project.mjs';

export const NOTICE_ALGORITHM = 'notice-triage/v1';
const encoder = new TextEncoder(), decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const requireValue = (ok, code, message, path = '') => { if (!ok) throw new EvidenceError(code, message, path); };
function keys(value, expected, path) {
  requireValue(object(value) && Object.keys(value).length === expected.length && expected.every(key => Object.hasOwn(value, key)),
    'NOTICE_SCHEMA', 'Missing or unsupported structured fields.', path);
}
function text(value, path, limit = 2048) {
  requireValue(typeof value === 'string' && value.trim() && value.length <= limit, 'NOTICE_TEXT', 'Expected bounded nonblank text.', path);
}
function freeze(value) {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}
function policyFor(input, profile, view) {
  const policy = parseJson(canonicalJson(input), 'policy');
  keys(policy, ['schema', 'inputSchema', 'maxBytes', 'volumeProfile', 'roleMap', 'geometryType', 'schedule', 'ui'], 'policy');
  requireValue(policy.schema === 'notice-triage-policy/v1' && policy.inputSchema === 'structured-notice/v1'
    && Number.isSafeInteger(policy.maxBytes) && policy.maxBytes > 0 && policy.maxBytes <= 12000,
  'NOTICE_POLICY', 'Unsupported policy or input bound.');
  keys(policy.volumeProfile, ['id', 'version'], 'volumeProfile');
  keys(policy.roleMap, ['vertices', 'floor', 'ceiling', 'validFrom', 'validTo'], 'roleMap');
  requireValue(policy.volumeProfile.id === profile.id && policy.volumeProfile.version === profile.version
    && canonicalJson(policy.roleMap) === canonicalJson(view.roles), 'NOTICE_POLICY', 'Volume profile and authored role mappings must agree.');
  requireValue(policy.geometryType === 'Polygon' && policy.schedule === 'continuous', 'NOTICE_POLICY', 'Only explicit single polygons and continuous intervals are supported.');
  keys(policy.ui, ['title', 'description', 'fixturePath', 'defaultAtUtc'], 'ui');
  Object.entries(policy.ui).forEach(([key, value]) => text(value, 'ui.' + key)); utcMillis(policy.ui.defaultAtUtc);
  return policy;
}

// This adapter admits one explicit JSON contract. Narrative text is retained, never interpreted.
export async function triageNotice(input, atUtc, authoredPolicy, authoredProfile, authoredView) {
  const profile = parseJson(canonicalJson(authoredProfile), 'profile'), view = parseJson(canonicalJson(authoredView), 'view');
  const policy = policyFor(authoredPolicy, profile, view), query = new Date(utcMillis(atUtc)).toISOString();
  requireValue(input instanceof Uint8Array && input.byteLength > 0 && input.byteLength <= policy.maxBytes,
    'NOTICE_LIMIT', 'Supply bounded original UTF-8 JSON bytes.');
  const bytes = new Uint8Array(input);
  let raw;
  try { raw = decoder.decode(bytes); } catch { throw new EvidenceError('UTF8', 'Original input is not valid UTF-8.'); }
  const value = parseJson(raw, 'notice');
  keys(value, ['schema', 'classification', 'source', 'notice'], 'input');
  requireValue(value.schema === policy.inputSchema, 'NOTICE_SCHEMA', 'Unsupported structured notice schema.');
  keys(value.source, ['id', 'origin', 'retrieved_at', 'rights'], 'source');
  keys(value.source.rights, ['status', 'statement'], 'source.rights');
  const source = value.source, notice = value.notice;
  for (const key of ['id', 'origin']) text(source[key], 'source.' + key, key === 'id' ? 120 : 2048);
  text(source.rights.statement, 'source.rights.statement');
  requireValue(profile.classifications.includes(value.classification)
    && profile.rightsStatuses[value.classification]?.includes(source.rights.status), 'RIGHTS', 'Classification and source rights declaration must be compatible.');
  keys(notice, ['id', 'label', 'observed_at', 'geometry', 'validity', 'vertical', 'freeText'], 'notice');
  text(notice.id, 'notice.id', 120); text(notice.label, 'notice.label');
  const observed = utcMillis(notice.observed_at, 'notice.observed_at'), retrieved = utcMillis(source.retrieved_at, 'source.retrieved_at');
  requireValue(retrieved >= observed, 'TIME_ORDER', 'Retrieval precedes the original observation.', 'source.retrieved_at');
  const originalSha256 = await digest(bytes), policySha256 = await digest(encoder.encode(canonicalJson(policy)));
  const result = { schema: 'notice-triage/v1', algorithm: NOTICE_ALGORITHM, atUtc: query, disposition: 'unresolved', reasons: [],
    original: { media_type: 'application/json', text: raw, sha256: originalSha256, byteLength: bytes.length }, source,
    notice: { id: notice.id, label: notice.label, classification: value.classification },
    declared: { geometry: notice.geometry, validity: notice.validity, vertical: notice.vertical, freeText: notice.freeText },
    identity: { originalSha256, policySha256 }, normalized: null, mapping: [], projection: null, derivedBundle: null,
    cost: { modelCalls: 0, billedApiCalls: 0, estimatedCost: 0 } };
  const unresolved = (code, path, message) => result.reasons.push({ code, path, message });
  if (notice.freeText !== null) unresolved('NOTICE_TEXT_UNRESOLVED', '/notice/freeText', 'Free text is preserved without semantic interpretation.');
  if (!object(notice.geometry) || notice.geometry.type !== policy.geometryType) unresolved('NOTICE_GEOMETRY_UNSUPPORTED', '/notice/geometry', 'One explicit Polygon is required; compound, arc and narrative geometry are unsupported.');
  if (!object(notice.validity) || notice.validity.schedule !== policy.schedule) unresolved('NOTICE_SCHEDULE_UNSUPPORTED', '/notice/validity', 'One continuous UTC interval is required; recurring or narrative schedules are unsupported.');
  if (!object(notice.vertical)) unresolved('NOTICE_VERTICAL_UNRESOLVED', '/notice/vertical', 'Explicit floor and ceiling with units and datums are required.');
  if (result.reasons.length) return freeze(result);
  try {
    keys(notice.geometry, ['type', 'datum', 'coordinates'], 'notice.geometry');
    keys(notice.validity, ['fromUtc', 'toUtc', 'schedule'], 'notice.validity');
    keys(notice.vertical, ['floor', 'ceiling'], 'notice.vertical');
    const { coordinates, datum } = notice.geometry;
    requireValue(Array.isArray(coordinates) && coordinates.length === 1 && Array.isArray(coordinates[0]),
      'NOTICE_GEOMETRY_UNSUPPORTED', 'Only one explicit polygon ring is supported.', '/notice/geometry/coordinates');
    const facts = [], mappings = [], roles = policy.roleMap, components = view.components;
    const add = (kind, value, unit, datum, pointer) => {
      const fact = { id: `mapped-fact-${facts.length}`, entity_id: notice.id, source_id: source.id,
        kind, observed_at: notice.observed_at, retrieved_at: source.retrieved_at, value, unit, datum, null_reason: null };
      facts.push(fact); mappings.push({ factId: fact.id, inputPointer: pointer });
    };
    coordinates[0].forEach((point, index) => {
      requireValue(Array.isArray(point) && point.length === 2 && point.every(Number.isFinite), 'NOTICE_COORDINATE', 'An explicit finite longitude/latitude pair is required.', '/notice/geometry/coordinates/0/' + index);
      add(roles.vertices, { [components.ordinal]: index, [components.longitude]: point[0], [components.latitude]: point[1] }, 'deg', datum, '/notice/geometry/coordinates/0/' + index);
    });
    for (const role of ['floor', 'ceiling']) {
      const bound = notice.vertical[role];
      requireValue(object(bound) && Number.isFinite(bound.value) && typeof bound.unit === 'string'
        && typeof bound.datum === 'string' && bound.datum.trim() && bound.datum !== 'unknown',
      'NOTICE_VERTICAL_UNRESOLVED', 'A finite bound, unit and known datum are required.', '/notice/vertical/' + role);
      keys(bound, ['value', 'unit', 'datum'], 'notice.vertical.' + role);
      add(roles[role], bound.value, bound.unit, bound.datum, '/notice/vertical/' + role);
    }
    add(roles.validFrom, notice.validity.fromUtc, 'UTC', 'not-applicable', '/notice/validity/fromUtc');
    add(roles.validTo, notice.validity.toUtc, 'UTC', 'not-applicable', '/notice/validity/toUtc');
    const transformed = canonicalJson({ schema: 'notice-derived-source/v1', algorithm: NOTICE_ALGORITHM,
      original: result.original, policy: { sha256: policySha256, value: policy }, mappings, facts });
    const transformedSha256 = await digest(encoder.encode(transformed));
    result.mapping = mappings;
    const bundle = { schema: profile.bundleSchema, profile: { id: profile.id, version: profile.version },
      dataset: { id: notice.id, title: notice.label, classification: value.classification },
      sources: [{ ...source, original: { media_type: 'application/json', text: transformed, sha256: transformedSha256 } }],
      entities: [{ id: notice.id, label: notice.label }], facts: facts.map((fact, index) => ({ ...fact, evidence_ref: '/facts/' + index })) };
    const derivedBundle = canonicalJson(bundle), handle = await admit(encoder.encode(derivedBundle), profile);
    const projection = projectVolume(handle, notice.id, query, view);
    result.disposition = projection.active ? 'active' : 'inactive'; result.projection = projection; result.derivedBundle = derivedBundle;
    result.normalized = { geometry: { type: 'Polygon', datum, coordinates: [projection.footprint] },
      time: { fromUtc: projection.validFromUtc, toUtc: projection.validToUtc, interval: projection.timePolicy },
      altitude: { floorMetres: projection.floorMetres, ceilingMetres: projection.ceilingMetres, datum: projection.datum } };
    result.mapping = mappings; result.identity = { ...result.identity, transformedSha256, derived: projection.identity };
  } catch (error) {
    if (!(error instanceof EvidenceError)) throw error;
    unresolved(error.code, error.path, error.message);
  }
  return freeze(result);
}
