import { EvidenceError, canonicalJson, readEvidence, normalizedValue, utcMillis } from './evidence-kernel.mjs';

export const ROUTE_ALGORITHM = 'route-distance/v1';
const need = (ok, code, message, path = '') => { if (!ok) throw new EvidenceError(code, message, path); };
const valid = (ok, message, path) => need(ok, 'ROUTE_POLICY', message, path);
const freeze = value => { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };
const keys = (value, names) => valid(value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).length === names.length && names.every(name => Object.hasOwn(value, name)), 'Policy fields mismatch.');
const boundedText = value => typeof value === 'string' && value.trim().length > 0 && value.length <= 2048;
const radians = Math.PI / 180, finite = Number.isFinite;
const same = (a, b) => a[0] === b[0] && a[1] === b[1];
function angle(a, b) {
  const lat = (b[1] - a[1]) * radians, lon = (b[0] - a[0]) * radians;
  const h = Math.sin(lat / 2) ** 2 + Math.cos(a[1] * radians) * Math.cos(b[1] * radians) * Math.sin(lon / 2) ** 2;
  return 2 * Math.atan2(Math.sqrt(Math.min(1, Math.max(0, h))), Math.sqrt(Math.max(0, 1 - h)));
}
function validate(input, profile) {
  const p = JSON.parse(canonicalJson(input));
  keys(p, ['schema', 'id', 'version', 'profile', 'roles', 'components', 'coordinateDatum', 'model', 'supportedTypes', 'excludedRegions', 'bounds', 'uncertainty']);
  keys(p.profile, ['id', 'version']);
  valid(p.schema === 'route-policy/v1' && boundedText(p.id) && boundedText(p.version)
  && p.profile.id === profile.id && p.profile.version === profile.version, 'Policy/profile revision mismatch.');
  const types = { measuredVertices: 'vector', referenceVertices: 'vector', measuredStart: 'utc', measuredEnd: 'utc',
  referenceStart: 'utc', referenceEnd: 'utc', routeType: 'string', measuredUncertainty: 'number', referenceUncertainty: 'number' };
  keys(p.roles, Object.keys(types)); keys(p.components, ['ordinal', 'longitude', 'latitude']);
  valid(new Set(Object.values(p.roles)).size === 9 && new Set(Object.values(p.components)).size === 3,
  'Duplicate role/component.');
  for (const [role, type] of Object.entries(types)) {
  const field = profile.fields.find(field => field.key === p.roles[role]);
  valid(field?.type === type, 'Role field type mismatch.', role);
  if (type === 'vector') valid(field.canonicalUnit === 'deg' && field.components.length === 3
  && Object.values(p.components).every(key => field.components.some(c => c.key === key)), 'Require degree vertices.');
  if (type === 'number') valid(field.canonicalUnit === 'm', 'Require metre uncertainty.');
  }
  valid(boundedText(p.coordinateDatum), 'Missing coordinate datum.');
  keys(p.model, ['id', 'version', 'method', 'radiusMetres', 'citation']);
  valid(boundedText(p.model.id) && boundedText(p.model.version) && boundedText(p.model.citation)
  && p.model.method === 'spherical-haversine/v1' && finite(p.model.radiusMetres)
  && p.model.radiusMetres >= 6000000 && p.model.radiusMetres <= 7000000, 'Invalid cited sphere model.');
  valid(Array.isArray(p.supportedTypes) && p.supportedTypes.length > 0 && p.supportedTypes.length <= 32
  && p.supportedTypes.every(boundedText) && new Set(p.supportedTypes).size === p.supportedTypes.length, 'Invalid supported types.');
  keys(p.bounds, ['maxVertices', 'maxSpanDegrees', 'latitudeLimit', 'maxWindowSeconds']);
  const b = p.bounds;
  valid(Number.isInteger(b.maxVertices) && [[b.maxVertices, 1, 100], [b.maxSpanDegrees, 0, 5], [b.latitudeLimit, 0, 85], [b.maxWindowSeconds, 0, 86400]]
  .every(([v, low, high]) => finite(v) && v > low && v <= high), 'Invalid regional bounds.');
  valid(Array.isArray(p.excludedRegions) && p.excludedRegions.length <= 32, 'Bound excluded regions.');
  for (const region of p.excludedRegions) {
  keys(region, ['id', 'reason', 'longitude', 'latitude']);
  valid(boundedText(region.id) && boundedText(region.reason), 'Missing exclusion reason.');
  for (const [axis, limit] of [['longitude', 180], ['latitude', 90]]) valid(Array.isArray(region[axis]) && region[axis].length === 2
  && region[axis].every(x => finite(x) && Math.abs(x) <= limit) && region[axis][0] < region[axis][1], 'Invalid exclusion bounds.');
  }
  valid(new Set(p.excludedRegions.map(r => r.id)).size === p.excludedRegions.length, 'Duplicate exclusion ID.');
  if (p.uncertainty !== null) {
  keys(p.uncertainty, ['method', 'statement']);
  valid(p.uncertainty.method === 'per-vertex-spherical-bound/v1' && boundedText(p.uncertainty.statement), 'Invalid uncertainty method.');
  }
  return p;
}
function vertices(facts, p) {
  const { ordinal, longitude, latitude } = p.components, b = p.bounds;
  need(facts.length >= 2 && facts.length <= b.maxVertices, 'ROUTE_GEOMETRY', 'Require 2–100 vertices.');
  const ordered = [...facts].sort((a, c) => a.value[ordinal] - c.value[ordinal]);
  need(ordered.every((fact, i) => fact.value !== null && Number.isInteger(fact.value[ordinal]) && fact.value[ordinal] === i
  && fact.unit === 'deg' && fact.datum === p.coordinateDatum), 'ROUTE_GEOMETRY', 'Invalid ordinals/unit/datum.');
  const points = ordered.map(f => [f.value[longitude], f.value[latitude]]);
  need(points.every(p => p.every(Number.isFinite) && Math.abs(p[0]) <= 180 && Math.abs(p[1]) <= b.latitudeLimit), 'ROUTE_GEOMETRY', 'Coordinates out of bounds.');
  for (const axis of [0, 1]) need(Math.max(...points.map(p => p[axis])) - Math.min(...points.map(p => p[axis])) <= b.maxSpanDegrees,
  'ROUTE_GEOMETRY', 'Wide/antimeridian route unsupported.');
  need(points.every((p, i) => !i || !same(p, points[i - 1])), 'ROUTE_GEOMETRY', 'Duplicate adjacent vertex.');
  return points;
}
function excluded(points, region) {
  return points.slice(1).some((end, i) => {
  const start = points[i], span = angle(start, end) / radians;
  const south = Math.max(-90, start[1] - span), north = Math.min(90, start[1] + span);
  const polar = Math.max(Math.abs(south), Math.abs(north));
  const longitudeSpan = polar >= 90 ? 360 : span / Math.cos(polar * radians);
  // This conservative envelope contains the whole spherical arc, not just its endpoints.
  return south <= region.latitude[1] && north >= region.latitude[0]
  && [-360, 0, 360].some(shift => start[0] - longitudeSpan <= region.longitude[1] + shift && start[0] + longitudeSpan >= region.longitude[0] + shift);
  });
}
export function benchmarkRoute(handle, entityId, input) {
  const data = readEvidence(handle), p = validate(input, data.profile);
  const entity = data.derived.entities.find(entity => entity.id === entityId);
  need(entity, 'ROUTE_ENTITY', 'Select an admitted route entity.');
  const facts = data.derived.facts.filter(fact => fact.entity_id === entityId), roles = p.roles;
  need(facts.every(f => Object.values(roles).includes(f.kind)), 'ROUTE_FIELDS', 'Unsupported route facts.');
  const of = role => facts.filter(f => f.kind === roles[role]);
  const one = (role, optional = false) => {
  const matches = of(role); need(matches.length <= 1 && (optional || matches.length === 1), 'ROUTE_COLLISION', 'Scalar missing or repeated.', role);
  const fact = matches[0]; need(optional || fact.value !== null, 'ROUTE_UNRESOLVED', 'Required fact is unknown.', role); return fact;
  };
  need([...of('measuredVertices'), ...of('referenceVertices')].every(f => f.value !== null), 'ROUTE_UNRESOLVED', 'Unknown route vertex.');
  const track = vertices(of('measuredVertices'), p), ref = vertices(of('referenceVertices'), p);
  need(same(track[0], ref[0]) && same(track.at(-1), ref.at(-1)), 'ROUTE_ENDPOINTS', 'Route endpoints differ.');
  const times = ['measuredStart', 'measuredEnd', 'referenceStart', 'referenceEnd'].map(role => utcMillis(one(role).value));
  need(times[0] < times[1] && times[1] - times[0] <= p.bounds.maxWindowSeconds * 1000
  && times[0] === times[2] && times[1] === times[3], 'ROUTE_TIME', 'Route windows differ or invalid.');
  need([...of('measuredVertices'), ...of('referenceVertices')].every(f => utcMillis(f.observed_at) >= times[0] && utcMillis(f.observed_at) <= times[1]),
  'ROUTE_TIME', 'Vertex outside route window.');
  const type = one('routeType').value, reasons = [], hits = p.excludedRegions.filter(r => excluded(track, r) || excluded(ref, r));
  const unsupported = !p.supportedTypes.includes(type);
  if (unsupported) reasons.push(`Unsupported route type: ${type}`);
  hits.forEach(r => reasons.push(`Excluded region ${r.id}: ${r.reason} (conservative spherical arc envelope; overlap may overexclude).`));
  const bounds = ['measuredUncertainty', 'referenceUncertainty'].map(role => {
  const fact = one(role, true);
  if (!fact || fact.value === null) { reasons.push(`${role}: ${fact?.null_reason || 'No positional bound supplied.'}`); return null; }
  const field = data.profile.fields.find(f => f.key === fact.kind), value = normalizedValue(fact, field);
  need(finite(value) && value >= 0 && fact.datum === p.coordinateDatum, 'ROUTE_UNCERTAINTY', 'Invalid positional bound.');
  return value;
  });
  if (!p.uncertainty) reasons.push('No positional uncertainty method declared.');
  const disposition = unsupported ? 'unsupported-type' : hits.length ? 'excluded-region' : 'compared';
  const length = points => points.slice(1).reduce((sum, point, i) => sum + angle(points[i], point) * p.model.radiusMetres, 0);
  const trackLength = disposition === 'compared' ? length(track) : null, refLength = disposition === 'compared' ? length(ref) : null;
  const difference = disposition === 'compared' ? trackLength - refLength : null;
  let errorBand = null;
  if (difference !== null && p.uncertainty && bounds.every(b => b !== null)) {
  const errors = bounds.map((bound, i) => 2 * ([track, ref][i].length - 1) * bound), total = errors[0] + errors[1];
  errorBand = { method: p.uncertainty.method, measuredMetres: errors[0], referenceMetres: errors[1],
  differenceMetres: [difference - total, difference + total], interpretation: 'Conditional triangle-inequality bound on per-vertex displacement under the fixed sphere; not statistical or geodetic/model accuracy.' };
  }
  return freeze({ schema: 'route-benchmark/v1', algorithm: ROUTE_ALGORITHM, identity: data.identity, profile: data.derived.profile,
  policyIdentity: { id: p.id, version: p.version, canonicalJson: canonicalJson(p) }, model: p.model, entity,
  sources: data.derived.sources, facts, disposition, reasons, routeType: type, excludedRegions: hits, supportedTypes: p.supportedTypes,
  scope: { startUtc: new Date(times[0]).toISOString(), endUtc: new Date(times[1]).toISOString() },
  'measured': { vertices: track, lengthMetres: trackLength }, 'reference': { vertices: ref, lengthMetres: refLength },
  differenceMetres: difference, errorBand, limitations: 'Fixed-sphere polyline comparison only; no fuel, optimality, legal-feasibility or real-flight accuracy claim.',
  cost: { modelCalls: 0, billedApiCalls: 0, estimatedCost: 0 } });
}
