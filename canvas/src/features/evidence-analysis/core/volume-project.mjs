import { EvidenceError, canonicalJson, readEvidence, normalizedValue, utcMillis } from './evidence-kernel.mjs';

export const VOLUME_ALGORITHM = 'volume-project/v1';
const requireValue = (ok, code, message, path = '') => {
  if (!ok) throw new EvidenceError(code, message, path);
};
function keys(value, names, path) {
  requireValue(value && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).length === names.length && names.every(name => Object.hasOwn(value, name)),
  'VOLUME_CONFIG', 'Missing or unsupported projection configuration.', path);
}
function freeze(value) {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}
function validateConfig(input, profile) {
  const config = JSON.parse(canonicalJson(input));
  keys(config, ['schema', 'profile', 'roles', 'components', 'geometry', 'vertical', 'projection', 'ui'], 'config');
  keys(config.profile, ['id', 'version'], 'profile');
  requireValue(config.schema === 'volume-view/v1' && config.profile.id === profile.id
    && config.profile.version === profile.version, 'VOLUME_CONFIG', 'Projection/profile revision mismatch.');
  keys(config.roles, ['vertices', 'floor', 'ceiling', 'validFrom', 'validTo'], 'roles');
  keys(config.components, ['ordinal', 'longitude', 'latitude'], 'components');
  const roles = Object.values(config.roles), components = Object.values(config.components);
  requireValue(roles.every(x => typeof x === 'string') && new Set(roles).size === 5
    && components.every(x => typeof x === 'string') && new Set(components).size === 3,
  'VOLUME_CONFIG', 'Role and component mappings must be distinct.');
  const types = { vertices: 'vector', floor: 'number', ceiling: 'number', validFrom: 'utc', validTo: 'utc' };
  Object.keys(types).forEach(role => {
    const field = profile.fields.find(field => field.key === config.roles[role]);
    requireValue(field?.type === types[role], 'VOLUME_CONFIG', 'Role field type mismatch.', role);
  });
  const vertexField = profile.fields.find(field => field.key === config.roles.vertices);
  requireValue(vertexField.canonicalUnit === 'deg' && vertexField.components.length === 3 && components.every(key => vertexField.components.some(c => c.key === key)),
    'VOLUME_CONFIG', 'Vertex components must match the authored mapping.');
  keys(config.geometry, ['type', 'coordinateDatum', 'maxVertices', 'maxSpanDegrees', 'latitudeLimit'], 'geometry');
  const g = config.geometry;
  requireValue(g.type === 'simple-polygon' && typeof g.coordinateDatum === 'string'
    && Number.isInteger(g.maxVertices) && g.maxVertices >= 4 && g.maxVertices <= 64
    && Number.isFinite(g.maxSpanDegrees) && g.maxSpanDegrees > 0 && g.maxSpanDegrees <= 5
    && Number.isFinite(g.latitudeLimit) && g.latitudeLimit > 0 && g.latitudeLimit <= 85,
  'VOLUME_CONFIG', 'Only bounded simple polygons away from the poles are supported.');
  keys(config.vertical, ['datum', 'unit'], 'vertical');
  requireValue(typeof config.vertical.datum === 'string' && config.vertical.datum !== 'unknown'
    && config.vertical.unit === 'm', 'VOLUME_CONFIG', 'Declare a known vertical reference and metre output.');
  keys(config.projection, ['width', 'height', 'padding', 'origin', 'radiusMetres'], 'projection');
  const p = config.projection;
  requireValue([p.width, p.height, p.padding, p.radiusMetres].every(Number.isFinite)
    && p.width >= 200 && p.width <= 4096 && p.height >= 200 && p.height <= 4096
    && p.padding >= 0 && p.padding < Math.min(p.width, p.height) / 4
    && p.radiusMetres >= 6000000 && p.radiusMetres <= 7000000
    && Array.isArray(p.origin) && p.origin.length === 2 && p.origin.every(Number.isFinite)
    && Math.abs(p.origin[0]) <= 180 && Math.abs(p.origin[1]) <= g.latitudeLimit,
  'VOLUME_CONFIG', 'Invalid affine projection bounds or geographic origin.');
  keys(config.ui, ['title', 'description', 'fixturePath', 'defaultAtUtc'], 'ui');
  requireValue(Object.values(config.ui).every(x => typeof x === 'string' && x.length > 0 && x.length <= 2048),
    'VOLUME_CONFIG', 'Expected bounded authored UI labels.');
  utcMillis(config.ui.defaultAtUtc);
  return config;
}
const same = (a, b) => a[0] === b[0] && a[1] === b[1];
const cross = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
function intersects(a, b, c, d) {
  const ab = [cross(a, b, c), cross(a, b, d)], cd = [cross(c, d, a), cross(c, d, b)];
  const epsilon = 1e-12;
  const on = (p, q, r) => Math.abs(cross(p, q, r)) <= epsilon
    && r[0] >= Math.min(p[0], q[0]) - epsilon && r[0] <= Math.max(p[0], q[0]) + epsilon
    && r[1] >= Math.min(p[1], q[1]) - epsilon && r[1] <= Math.max(p[1], q[1]) + epsilon;
  return (ab[0] * ab[1] < 0 && cd[0] * cd[1] < 0) || on(a, b, c) || on(a, b, d) || on(c, d, a) || on(c, d, b);
}
function boundary(facts, config) {
  const { ordinal, longitude, latitude } = config.components, g = config.geometry;
  requireValue(facts.length >= 4 && facts.length <= g.maxVertices, 'VOLUME_GEOMETRY', 'A closed ring needs 4–64 vertices.');
  const ordered = [...facts].sort((a, b) => a.value[ordinal] - b.value[ordinal]);
  requireValue(ordered.every((fact, index) => Number.isInteger(fact.value[ordinal]) && fact.value[ordinal] === index
    && fact.datum === g.coordinateDatum && fact.unit === 'deg'), 'VOLUME_GEOMETRY', 'Require unique contiguous ordinals, degree units and declared datum.');
  const ring = ordered.map(fact => [fact.value[longitude], fact.value[latitude]]);
  requireValue(ring.every(point => point.every(Number.isFinite) && Math.abs(point[0]) <= 180 && Math.abs(point[1]) <= g.latitudeLimit),
    'VOLUME_GEOMETRY', 'Nonfinite, polar or out-of-range coordinates are unsupported.');
  requireValue(same(ring[0], ring.at(-1)), 'VOLUME_GEOMETRY', 'The single polygon ring must be explicitly closed.');
  const unique = ring.slice(0, -1);
  requireValue(new Set(unique.map(point => canonicalJson(point))).size === unique.length,
    'VOLUME_GEOMETRY', 'Repeated or colliding boundary vertices are unsupported.');
  for (const axis of [0, 1]) requireValue(Math.max(...ring.map(p => p[axis])) - Math.min(...ring.map(p => p[axis])) <= g.maxSpanDegrees,
    'VOLUME_GEOMETRY', 'Wide or antimeridian geometry needs a separately admitted projection.');
  const n = unique.length;
  for (let i = 0; i < n; i++) {
    requireValue(Math.abs(cross(ring[i], ring[i + 1], ring[(i + 2) % n])) > 1e-12,
      'VOLUME_GEOMETRY', 'Degenerate or collinear corners are unresolved.');
    for (let j = i + 1; j < n; j++) {
      if (j === i + 1 || (i === 0 && j === n - 1)) continue;
      requireValue(!intersects(ring[i], ring[i + 1], ring[j], ring[j + 1]),
        'VOLUME_GEOMETRY', 'Self-intersections and touching edges are unsupported.');
    }
  }
  return ring;
}
function geometry(ring, floor, ceiling, config) {
  const p = config.projection, radians = Math.PI / 180;
  const xy = ring.map(([lon, lat]) => [p.radiusMetres * (lon - p.origin[0]) * radians * Math.cos(p.origin[1] * radians),
    p.radiusMetres * (lat - p.origin[1]) * radians]);
  const world = { floor: xy.map(([x, y]) => [x, y, floor]), ceiling: xy.map(([x, y]) => [x, y, ceiling]) };
  const a = Math.sqrt(3) / 2, initial = point => [a * (point[0] - point[1]), (point[0] + point[1]) / 2 - point[2]];
  const raw = [...world.floor, ...world.ceiling].map(initial);
  const min = [0, 1].map(axis => Math.min(...raw.map(point => point[axis])));
  const max = [0, 1].map(axis => Math.max(...raw.map(point => point[axis])));
  const scale = Math.min((p.width - 2 * p.padding) / (max[0] - min[0]), (p.height - 2 * p.padding) / (max[1] - min[1]));
  requireValue(Number.isFinite(scale) && scale > 0, 'VOLUME_PROJECTION', 'Degenerate projection extent.');
  const tx = (p.width - scale * (max[0] - min[0])) / 2 - scale * min[0];
  const ty = (p.height - scale * (max[1] - min[1])) / 2 - scale * min[1];
  const matrix = [[scale * a, -scale * a, 0, tx], [scale / 2, scale / 2, -scale, ty]];
  const screenPoint = point => matrix.map(row => row[0] * point[0] + row[1] * point[1] + row[2] * point[2] + row[3]);
  const screen = { floor: world.floor.map(screenPoint), ceiling: world.ceiling.map(screenPoint), sides: [] };
  for (let i = 0; i < ring.length - 1; i++) screen.sides.push([screen.floor[i], screen.floor[i + 1], screen.ceiling[i + 1], screen.ceiling[i], screen.floor[i]]);
  return { world, screen, transform: { origin: p.origin, radiusMetres: p.radiusMetres,
    method: 'local-equirectangular-schematic', matrix, pixelsPerMetre: scale }, size: { width: p.width, height: p.height } };
}
export function altitudeFromScreen(point, worldX, worldY, transform) {
  const row = transform?.matrix?.[1];
  requireValue(Array.isArray(point) && point.length === 2 && point.every(Number.isFinite)
    && Number.isFinite(worldX) && Number.isFinite(worldY) && Array.isArray(row) && row.length === 4
    && row.every(Number.isFinite) && row[2] !== 0, 'VOLUME_PROJECTION', 'Invalid affine altitude readback.');
  return (point[1] - row[0] * worldX - row[1] * worldY - row[3]) / row[2];
}
export function projectVolume(handle, entityId, atUtc, inputConfig) {
  const data = readEvidence(handle), config = validateConfig(inputConfig, data.profile), time = utcMillis(atUtc);
  const entity = data.derived.entities.find(entity => entity.id === entityId);
  requireValue(entity, 'VOLUME_ENTITY', 'Select an admitted volume entity.');
  const facts = data.derived.facts.filter(fact => fact.entity_id === entityId), roles = config.roles;
  requireValue(facts.every(fact => Object.values(roles).includes(fact.kind)), 'VOLUME_UNSUPPORTED', 'Unsupported volume field, compound shape or schedule.');
  for (const fact of facts) requireValue(fact.value !== null, 'VOLUME_UNRESOLVED', `Unresolved ${fact.kind}: ${fact.null_reason}`, fact.id);
  const observed = new Set(facts.map(fact => utcMillis(fact.observed_at)));
  requireValue(observed.size === 1 && time >= [...observed][0], 'VOLUME_TIME', 'Require one snapshot observed before the query.');
  const one = role => {
    const found = facts.filter(fact => fact.kind === roles[role]);
    requireValue(found.length === 1, 'VOLUME_COLLISION', 'Scalar role needs one source fact; alternatives are unresolved.', role);
    return found[0];
  };
  const lower = one('floor'), upper = one('ceiling'), from = one('validFrom'), to = one('validTo');
  const start = utcMillis(from.value), end = utcMillis(to.value);
  requireValue(start < end && end - start <= 86400000, 'VOLUME_TIME', 'Expected one increasing UTC validity interval of at most 24 hours.');
  requireValue(lower.datum === upper.datum && lower.datum === config.vertical.datum,
    'VOLUME_DATUM', 'Floor, ceiling and view need one reference; datum conversion is unsupported.');
  const metric = fact => {
    const field = data.profile.fields.find(field => field.key === fact.kind);
    requireValue(field.canonicalUnit === config.vertical.unit, 'VOLUME_DATUM', 'Vertical canonical unit must match the view.');
    return normalizedValue(fact, field);
  };
  const floorMetres = metric(lower), ceilingMetres = metric(upper);
  requireValue(Number.isFinite(floorMetres) && Number.isFinite(ceilingMetres) && floorMetres < ceilingMetres,
    'VOLUME_BOUNDS', 'Finite floor must be strictly below ceiling.');
  const footprint = boundary(facts.filter(fact => fact.kind === roles.vertices), config);
  return freeze({ schema: 'volume-projection/v1', algorithm: VOLUME_ALGORITHM, identity: data.identity,
    profile: data.derived.profile, dataset: data.derived.dataset, entity, atUtc: new Date(time).toISOString(),
    active: time >= start && time < end, timePolicy: '[validFrom,validTo)', validFromUtc: new Date(start).toISOString(),
    validToUtc: new Date(end).toISOString(), floorMetres, ceilingMetres, datum: lower.datum, footprint,
    ...geometry(footprint, floorMetres, ceilingMetres, config), config, facts,
    cost: { modelCalls: 0, billedApiCalls: 0, estimatedCost: 0 } });
}
