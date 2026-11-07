import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { digest } from '../core/contracts.mjs';
import { admit, canonicalJson, EvidenceError, exportPack, inspect, originalBytes } from '../core/evidence-kernel.mjs';
import { projectVolume, altitudeFromScreen, VOLUME_ALGORITHM } from '../core/volume-project.mjs';

const encoder = new TextEncoder();
const profile = JSON.parse(await readFile(new URL('../profiles/volume-v1.json', import.meta.url), 'utf8'));
const config = JSON.parse(await readFile(new URL('../profiles/volume-view.json', import.meta.url), 'utf8'));
const bytes = new Uint8Array(await readFile(new URL('../../../../public/evidence-analysis/fixtures/volume-singapore-synthetic-v1.json', import.meta.url)));
const fixture = JSON.parse(new TextDecoder().decode(bytes)), entity = fixture.entities[0].id, at = config.ui.defaultAtUtc;
const field = (bundle, kind) => bundle.facts.find(fact => fact.kind === kind);
const code = expected => error => error instanceof EvidenceError && error.code === expected;
async function changed(change) {
  const bundle = structuredClone(fixture); change(bundle);
  for (const source of bundle.sources) {
    const facts = bundle.facts.filter(fact => fact.source_id === source.id);
    source.original.text = canonicalJson({ facts: facts.map(({ evidence_ref, ...fact }) => fact) });
    source.original.sha256 = await digest(encoder.encode(source.original.text));
    facts.forEach((fact, i) => { fact.evidence_ref = '/facts/' + i; });
  }
  return admit(encoder.encode(JSON.stringify(bundle)), profile);
}
async function rejection(change, expected, view = config) {
  const handle = await changed(change);
  assert.throws(() => projectVolume(handle, entity, at, view), code(expected));
}

test('nonrectangular authored polygon preserves originals and produces deterministic metric volume', async () => {
  const handle = await admit(bytes, profile), before = originalBytes(handle), record = inspect(handle);
  const first = projectVolume(handle, entity, at, config), second = projectVolume(handle, entity, at, config);
  assert.equal(first.algorithm, VOLUME_ALGORITHM); assert.equal(first.dataset.classification, 'synthetic');
  assert.equal(first.floorMetres, 304.8); assert.equal(first.ceilingMetres, 609.6); assert.equal(first.datum, 'AMSL');
  assert.equal(first.active, true); assert.equal(first.footprint.length, 5); assert.equal(first.screen.sides.length, 4);
  assert.deepEqual(first.identity, record.identity); assert.deepEqual(first.facts, record.facts);
  assert.equal(canonicalJson(first), canonicalJson(second)); assert.deepEqual(originalBytes(handle), before);
  assert.equal(field({ facts: first.facts }, 'lower').unit, 'ft'); assert.equal(field({ facts: first.facts }, 'lower').value, 1000);
  assert.throws(() => { first.world.floor[0][2] = 0; }, TypeError);
  assert.deepEqual(first.cost, { modelCalls: 0, billedApiCalls: 0, estimatedCost: 0 });
  const reopened = await admit(await exportPack(handle), profile);
  assert.deepEqual(originalBytes(reopened), bytes); assert.equal(canonicalJson(projectVolume(reopened, entity, at, config)), canonicalJson(first));
});

test('affine floor and ceiling readback is within one metre at every vertex', async () => {
  const result = projectVolume(await admit(bytes, profile), entity, at, config);
  for (const layer of ['floor', 'ceiling']) {
    const target = layer === 'floor' ? result.floorMetres : result.ceilingMetres;
    result.screen[layer].forEach((point, index) => {
      const [x, y, z] = result.world[layer][index]; assert.equal(z, target);
      const recovered = altitudeFromScreen(point, x, y, result.transform);
      assert.ok(Math.abs(recovered - target) < 1e-8, `Readback ${recovered} versus ${target}`);
      assert.ok(point[0] >= config.projection.padding - 1e-8 && point[0] <= result.size.width - config.projection.padding + 1e-8);
      assert.ok(point[1] >= config.projection.padding - 1e-8 && point[1] <= result.size.height - config.projection.padding + 1e-8);
    });
  }
  const equivalent = await changed(bundle => { field(bundle, 'lower').value = 304.8; field(bundle, 'lower').unit = 'm'; field(bundle, 'upper').value = 2000; field(bundle, 'upper').unit = 'ft'; });
  assert.deepEqual(projectVolume(equivalent, entity, at, config).world, result.world);
  assert.throws(() => altitudeFromScreen([0, 0], 0, 0, { matrix: [[1, 0, 0, 0], [0, 1, 0, 0]] }), code('VOLUME_PROJECTION'));
});

test('ordinal assembly is independent of source fact order and rejects duplicate or fractional ordinal', async () => {
  const normal = projectVolume(await admit(bytes, profile), entity, at, config);
  const reversed = projectVolume(await changed(bundle => bundle.facts.reverse()), entity, at, config);
  assert.deepEqual(reversed.footprint, normal.footprint); assert.deepEqual(reversed.screen, normal.screen);
  await rejection(bundle => { bundle.facts[1].value.ordinal = 0; }, 'VOLUME_GEOMETRY');
  await rejection(bundle => { bundle.facts[1].value.ordinal = 1.5; }, 'VOLUME_GEOMETRY');
  await rejection(bundle => { bundle.facts[1].value.ordinal = 8; }, 'VOLUME_GEOMETRY');
});

test('self-intersecting, unclosed, repeated and collinear rings fail before projection', async () => {
  await rejection(bundle => { bundle.facts[4].value.longitude += 0.001; }, 'VOLUME_GEOMETRY');
  await rejection(bundle => {
    const ring = [[0, 0], [1, 1], [0, 1], [1, 0], [0, 0]];
    bundle.facts.filter(f => f.kind === 'boundary').forEach((f, i) => { f.value.longitude = ring[i][0]; f.value.latitude = ring[i][1]; });
  }, 'VOLUME_GEOMETRY');
  await rejection(bundle => { bundle.facts[2].value = { ...bundle.facts[0].value, ordinal: 2 }; }, 'VOLUME_GEOMETRY');
  await rejection(bundle => {
    const a = bundle.facts[0].value, c = bundle.facts[2].value;
    Object.assign(bundle.facts[1].value, { longitude: (a.longitude + c.longitude) / 2, latitude: (a.latitude + c.latitude) / 2 });
  }, 'VOLUME_GEOMETRY');
});

test('unsupported wide, polar, compound and arc geometry is refused explicitly', async () => {
  await rejection(bundle => { bundle.facts[2].value.longitude = -179; }, 'VOLUME_GEOMETRY');
  await rejection(bundle => { bundle.facts[2].value.latitude = 89; }, 'VOLUME_GEOMETRY');
  const handle = await admit(bytes, profile), view = structuredClone(config); view.geometry.type = 'polygon-with-holes';
  assert.throws(() => projectVolume(handle, entity, at, view), code('VOLUME_CONFIG'));
  await assert.rejects(changed(bundle => { bundle.facts[2].value.arc = { radius: 1 }; }), code('SCHEMA'));
});

test('time is a single explicit snapshot with a half-open valid interval', async () => {
  const handle = await admit(bytes, profile);
  assert.equal(projectVolume(handle, entity, '2026-10-03T10:36:59Z', config).active, false);
  assert.equal(projectVolume(handle, entity, '2026-10-03T10:37:00Z', config).active, true);
  assert.equal(projectVolume(handle, entity, '2026-10-03T10:53:00Z', config).active, false);
  assert.throws(() => projectVolume(handle, entity, '2026-10-03T10:29:59Z', config), code('VOLUME_TIME'));
  await rejection(bundle => { field(bundle, 'valid_to').value = field(bundle, 'valid_from').value; }, 'VOLUME_TIME');
  await rejection(bundle => { field(bundle, 'valid_to').value = '2026-10-05T10:53:00Z'; }, 'VOLUME_TIME');
  await rejection(bundle => { bundle.facts[0].observed_at = '2026-10-03T10:30:01Z'; }, 'VOLUME_TIME');
  await assert.rejects(changed(bundle => { field(bundle, 'valid_from').value = '2026-02-30T10:00:00Z'; }), code('UTC'));
});

test('vertical comparisons require strict ordering and the declared shared datum', async () => {
  for (const datum of ['pressure', 'geometric', 'AGL', 'unknown']) {
    await rejection(bundle => { field(bundle, 'lower').datum = datum; }, 'VOLUME_DATUM');
    await rejection(bundle => { field(bundle, 'lower').datum = datum; field(bundle, 'upper').datum = datum; }, 'VOLUME_DATUM');
  }
  await rejection(bundle => { field(bundle, 'upper').value = 304.8; }, 'VOLUME_BOUNDS');
  await rejection(bundle => { field(bundle, 'upper').value = 300; }, 'VOLUME_BOUNDS');
  await assert.rejects(changed(bundle => { field(bundle, 'upper').unit = 'FL'; }), code('UNIT'));
});

test('missing and competing scalar evidence stays unresolved with its original explanation', async () => {
  const handle = await changed(bundle => { const f = field(bundle, 'lower'); f.value = null; f.null_reason = 'Terrain reference unavailable.'; });
  assert.throws(() => projectVolume(handle, entity, at, config), error => code('VOLUME_UNRESOLVED')(error) && error.message.includes('Terrain reference unavailable.'));
  assert.equal(field({ facts: inspect(handle).facts }, 'lower').null_reason, 'Terrain reference unavailable.');
  await rejection(bundle => { bundle.facts.push({ ...field(bundle, 'upper'), id: 'alternative-ceiling' }); }, 'VOLUME_COLLISION');
  const good = await admit(bytes, profile), original = originalBytes(good);
  assert.throws(() => projectVolume(good, 'unknown-volume', at, config), code('VOLUME_ENTITY'));
  assert.deepEqual(originalBytes(good), original); assert.equal(projectVolume(good, entity, at, config).active, true);
});

test('profile and projection policy must be explicit and revision compatible', async () => {
  const handle = await admit(bytes, profile);
  for (const change of [view => { view.profile.version = '2.0.0'; }, view => { view.roles.floor = view.roles.ceiling; },
    view => { view.components.ordinal = 'order'; }, view => { view.vertical.unit = 'ft'; }, view => { view.projection.radiusMetres = 1; }]) {
    const view = structuredClone(config); change(view);
    assert.throws(() => projectVolume(handle, entity, at, view), code('VOLUME_CONFIG'));
  }
  const view = structuredClone(config); view.projection.width = 320; view.projection.height = 320;
  const result = projectVolume(handle, entity, at, view);
  assert.equal(result.size.width, 320); assert.equal(result.floorMetres, 304.8);
});
