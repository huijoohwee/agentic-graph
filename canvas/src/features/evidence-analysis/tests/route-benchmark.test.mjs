import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { digest } from '../core/contracts.mjs';
import { admit, canonicalJson, EvidenceError, exportPack, inspect, originalBytes } from '../core/evidence-kernel.mjs';
import { benchmarkRoute, ROUTE_ALGORITHM } from '../core/route-benchmark.mjs';

const encoder = new TextEncoder(), decoder = new TextDecoder();
const profile = JSON.parse(await readFile(new URL('../profiles/route-v1.json', import.meta.url), 'utf8'));
const policy = JSON.parse(await readFile(new URL('../profiles/route-policy.json', import.meta.url), 'utf8'));
const raw = new Uint8Array(await readFile(new URL('../../../../public/evidence-analysis/fixtures/route-singapore-synthetic-v1.json', import.meta.url)));
const fixture = JSON.parse(decoder.decode(raw)), entityId = fixture.entities[0].id;
const clone = value => structuredClone(value);
const code = expected => error => error instanceof EvidenceError && error.code === expected;
async function changed(change) {
  const bundle = clone(fixture); change(bundle);
  for (const source of bundle.sources) {
    const facts = bundle.facts.filter(f => f.source_id === source.id);
    source.original.text = canonicalJson({ facts: facts.map(({ evidence_ref, ...fact }) => fact) });
    source.original.sha256 = await digest(encoder.encode(source.original.text));
    facts.forEach((fact, i) => { fact.evidence_ref = '/facts/' + i; });
  }
  return admit(encoder.encode(JSON.stringify(bundle)), profile);
}
const fact = (bundle, kind) => bundle.facts.find(f => f.kind === kind);
const vertices = (bundle, prefix, points) => bundle.facts.filter(f => f.kind === prefix + '_vertex')
  .forEach((f, i) => { f.value = { ordinal: i, longitude: points[i][0], latitude: points[i][1] }; });
async function reject(change, expected) {
  const handle = await changed(change); assert.throws(() => benchmarkRoute(handle, entityId, policy), code(expected));
}

test('route analytic equator and meridian lengths agree with the declared spherical radius', async () => {
  for (const points of [[[0, 0], [0.5, 0], [1, 0]], [[0, 0], [0, 0.5], [0, 1]]]) {
    const handle = await changed(b => { vertices(b, 'measured', points); vertices(b, 'reference', points); });
    const result = benchmarkRoute(handle, entityId, policy), expected = policy.model.radiusMetres * Math.PI / 180;
    assert.equal(result.disposition, 'compared');
    assert.ok(Math.abs(result.measured.lengthMetres - expected) < 1e-8);
    assert.equal(result.measured.lengthMetres, result.reference.lengthMetres);
    assert.equal(result.differenceMetres, 0);
    assert.equal(result.errorBand.measuredMetres, 20); assert.equal(result.errorBand.referenceMetres, 8);
    assert.deepEqual(result.errorBand.differenceMetres, [-28, 28]);
    assert.match(result.errorBand.interpretation, /not statistical or geodetic/);
  }
});

test('route table, pure repeated result and pack reopen preserve facts, provenance and exact identities', async () => {
  const handle = await admit(raw, profile), result = benchmarkRoute(handle, entityId, policy);
  assert.equal(result.algorithm, ROUTE_ALGORITHM); assert.equal(result.disposition, 'compared');
  assert.equal(inspect(handle).dataset.classification, 'synthetic');
  assert.ok(result.measured.lengthMetres > result.reference.lengthMetres);
  assert.equal(result.differenceMetres, result.measured.lengthMetres - result.reference.lengthMetres);
  assert.deepEqual(result.identity, inspect(handle).identity); assert.deepEqual(result.profile, inspect(handle).profile);
  assert.equal(result.policyIdentity.canonicalJson, canonicalJson(policy));
  assert.deepEqual(result.sources, inspect(handle).sources); assert.deepEqual(result.facts, inspect(handle).facts);
  assert.match(result.sources.find(s => s.id === 'synthetic-reference').origin, /counterfactual/);
  const reopened = await admit(await exportPack(handle), profile);
  assert.deepEqual(originalBytes(reopened), raw);
  assert.equal(canonicalJson(benchmarkRoute(reopened, entityId, policy)), canonicalJson(result));
  assert.equal(canonicalJson(benchmarkRoute(handle, entityId, policy)), canonicalJson(result));
  const shuffled = await changed(b => b.facts.reverse());
  assert.deepEqual(benchmarkRoute(shuffled, entityId, policy).measured, result.measured);
  assert.deepEqual(benchmarkRoute(shuffled, entityId, policy).reference, result.reference);
  assert.deepEqual(originalBytes(handle), raw);
});

test('route uncertainty is conditional and missing bounds or method remain explicitly unknown', async () => {
  const handle = await changed(b => { b.facts = b.facts.filter(f => f.kind !== 'reference_uncertainty'); });
  let result = benchmarkRoute(handle, entityId, policy);
  assert.equal(result.errorBand, null); assert.equal(result.disposition, 'compared');
  assert(result.reasons.some(r => r.includes('referenceUncertainty')));
  const absent = await changed(b => { fact(b, 'measured_uncertainty').value = null; fact(b, 'measured_uncertainty').null_reason = 'No calibrated positional bound.'; });
  result = benchmarkRoute(absent, entityId, policy);
  assert.equal(result.errorBand, null); assert(result.reasons.some(r => r.includes('No calibrated')));
  result = benchmarkRoute(await admit(raw, profile), entityId, { ...policy, uncertainty: null });
  assert.equal(result.errorBand, null); assert(result.reasons.some(r => r.includes('method')));
  await assert.rejects(changed(b => { fact(b, 'measured_uncertainty').unit = 'percent'; }), code('UNIT'));
  await assert.rejects(changed(b => { fact(b, 'measured_uncertainty').value = -1; }), code('RANGE'));
});

test('route endpoint, time, duplicate ordinal and scalar conflicts fail loudly', async () => {
  await reject(b => { fact(b, 'reference_vertex').value.longitude += 0.01; }, 'ROUTE_ENDPOINTS');
  await reject(b => { fact(b, 'reference_end').value = '2026-10-03T10:52:00Z'; }, 'ROUTE_TIME');
  await reject(b => { fact(b, 'reference_start').value = fact(b, 'reference_end').value; }, 'ROUTE_TIME');
  await reject(b => { b.facts.filter(f => f.kind === 'measured_vertex')[1].value.ordinal = 0; }, 'ROUTE_GEOMETRY');
  await reject(b => { b.facts.filter(f => f.kind === 'reference_vertex')[1].value.ordinal = 0.5; }, 'ROUTE_GEOMETRY');
  await reject(b => { const f = b.facts.filter(f => f.kind === 'reference_vertex'); f[1].value = { ...f[0].value, ordinal: 1 }; }, 'ROUTE_GEOMETRY');
  await reject(b => { b.facts.push({ ...fact(b, 'measured_uncertainty'), id: 'competing-bound', value: 200 }); }, 'ROUTE_COLLISION');
  await reject(b => { fact(b, 'measured_vertex').observed_at = '2026-10-03T10:36:00Z'; }, 'ROUTE_TIME');
  await reject(b => { fact(b, 'measured_vertex').value = null; fact(b, 'measured_vertex').null_reason = 'Absent'; }, 'ROUTE_UNRESOLVED');
});

test('route unsupported types and excluded segment regions return explicit non-comparison dispositions', async () => {
  const unsupported = await changed(b => { fact(b, 'route_type').value = 'unsupported-airframe'; });
  let result = benchmarkRoute(unsupported, entityId, policy);
  assert.equal(result.disposition, 'unsupported-type'); assert.equal(result.differenceMetres, null); assert.equal(result.errorBand, null);
  assert(result.reasons.some(r => r.includes('unsupported-airframe')));
  const crossing = await changed(b => { const p = [[0, 0], [0.5, 0], [1, 0]]; vertices(b, 'measured', p); vertices(b, 'reference', p); });
  const excluded = clone(policy); excluded.excludedRegions = [{ id: 'gap-between-vertices', reason: 'Model coverage excluded', longitude: [0.2, 0.3], latitude: [-0.01, 0.01] }];
  result = benchmarkRoute(crossing, entityId, excluded);
  assert.equal(result.disposition, 'excluded-region'); assert.equal(result.measured.lengthMetres, null);
  assert.equal(result.excludedRegions[0].id, 'gap-between-vertices'); assert.match(result.reasons[0], /conservative/);
  excluded.excludedRegions[0].latitude = [20, 21];
  assert.equal(benchmarkRoute(crossing, entityId, excluded).disposition, 'compared');
});

test('route policy is detached and immutable with exact revision and model binding', async () => {
  const handle = await admit(raw, profile), mutable = clone(policy), result = benchmarkRoute(handle, entityId, mutable);
  mutable.model.radiusMetres = 7000000; mutable.supportedTypes[0] = 'changed';
  assert.equal(result.model.radiusMetres, policy.model.radiusMetres);
  assert.equal(result.policyIdentity.canonicalJson, canonicalJson(policy));
  assert.throws(() => { result.measured.vertices[0][0] = 0; }, TypeError);
  assert.throws(() => { result.sources[0].rights.statement = 'changed'; }, TypeError);
  assert.throws(() => { result.model.radiusMetres = 0; }, TypeError);
  for (const change of [p => { p.profile.version = '2.0.0'; }, p => { p.model.method = 'fuel-model'; }, p => { p.roles.referenceVertices = p.roles.measuredVertices; }, p => { p.bounds.maxVertices = 101; }, p => { p.model.radiusMetres = Infinity; }]) {
    const bad = clone(policy); change(bad); assert.throws(() => benchmarkRoute(handle, entityId, bad), EvidenceError);
  }
  assert.throws(() => benchmarkRoute(handle, 'missing', policy), code('ROUTE_ENTITY'));
  const aviation = new Uint8Array(await readFile(new URL('../../../../public/evidence-analysis/fixtures/aviation-singapore-v1.json', import.meta.url)));
  await assert.rejects(admit(aviation, profile), code('PROFILE'));
});
