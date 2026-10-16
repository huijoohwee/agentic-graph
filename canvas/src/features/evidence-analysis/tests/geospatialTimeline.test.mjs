import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { admit, inspect } from '../core/evidence-kernel.mjs';
import { validateSourceGeospatialScene } from '../geospatialProject.mjs';
import { buildSourceGeospatialTimeline } from '../geospatialTimeline.mjs';
const data = new URL('../../../../public/evidence-analysis/fixtures/', import.meta.url);
const profile = JSON.parse(await readFile(new URL('../profiles/aviation-v1.json', import.meta.url)));
const bytes = await readFile(new URL('aviation-singapore-multitrack-v1.json', data));
const record = inspect(await admit(bytes, profile));
const raw = JSON.parse(await readFile(new URL('scene-wsss-v1.json', data)));
raw.timeline = { title: 'Authored temporal context', window: { startUtc: '2026-10-04T02:24:40.000Z', endUtc: '2026-10-04T02:26:40.000Z' }, lanes: [
 { id: 'context', label: 'Reference', kind: 'context', statement: 'Reference only.', referenceHashes: [raw.references[0].sha256] },
 { id: 'qualification', label: 'Qualification', kind: 'qualification' },
 { id: 'surfaces', label: 'Geometry', kind: 'surfaces', featureIds: raw.surfaces.features.filter(f => f.properties.role === 'surface').map(f => f.id) },
 { id: 'observations', label: 'Observed objects', kind: 'observations' },
] };
const scene = validateSourceGeospatialScene(raw);
const build = (s = scene, records = [record]) => buildSourceGeospatialTimeline(s, records, 'source:1', 'source-geospatial:exact-content-digest');
test('real corpus yields distinct source rows, millisecond offsets and undated reference contexts', () => {
 const model = build(), rows = model.lanes.filter(lane => lane.kind === 'observations');
 assert.equal(model.durationSeconds, 120); assert.equal(rows.length, 3);
 assert.equal(rows.flatMap(row => row.events.filter(event => event.kind === 'observation')).length, 85);
 for (const lane of model.lanes.filter(lane => lane.kind !== 'observations')) {
  assert.equal(lane.events.length, 0); assert.ok(lane.contexts.length > 0);
  for (const context of lane.contexts) { assert.equal(context.atUtc, undefined); assert.equal(context.startSeconds, undefined); }
 }
 assert.equal(model.lanes.find(lane => lane.kind === 'qualification').contexts[0].status, 'unavailable');
 for (const event of rows.flatMap(row => row.events)) {
  assert.equal(event.startSeconds, (Date.parse(event.atUtc) - Date.parse(model.startUtc)) / 1000);
  assert.match(event.sourceHash, /^[a-f0-9]{64}$/); assert.ok(event.sourcePointer.startsWith('/'));
 }
 assert.ok(rows.flatMap(row => row.events).some(event => event.startSeconds % 1 !== 0));
 assert.ok(rows.flatMap(row => row.events).some(event => event.kind === 'gap' && event.endSeconds - event.startSeconds > 15));
 assert.deepEqual(model, build()); assert.ok(Object.isFrozen(model.lanes[0].contexts));
 assert.equal(createHash('sha256').update(bytes).digest('hex'), 'f8e3e92881fde1d7bfa36423ee1e031e71019697993153fd1829cd440a1f0082');
});
test('an explicit unknown sample creates a separate event and absent interval even below the gap threshold', async () => {
 const bundle = JSON.parse(await readFile(new URL('aviation-synthetic-v1.json', data)));
 const source = bundle.sources[0], original = JSON.parse(source.original.text), base = original.facts.find(f => f.kind === 'position');
 const missing = { ...base, id: 'timeline-unknown', observed_at: '2026-01-01T12:00:15.000Z', retrieved_at: '2026-01-01T12:00:20.000Z', value: null, null_reason: 'Explicitly unavailable.' };
 const index = original.facts.push(missing) - 1; source.original.text = JSON.stringify(original); source.original.sha256 = createHash('sha256').update(source.original.text).digest('hex');
 bundle.facts.push({ ...missing, evidence_ref: `/facts/${index}` });
 const admitted = inspect(await admit(new TextEncoder().encode(JSON.stringify(bundle)), profile)), study = structuredClone(scene);
 study.defaultAtUtc = missing.observed_at; study.gapAfterSeconds = 60;
 study.timeline.window = { startUtc: '2026-01-01T12:00:00.000Z', endUtc: '2026-01-01T12:03:00.000Z' };
 const result = build(validateSourceGeospatialScene(study), [admitted]);
 const row = result.lanes.find(lane => lane.kind === 'observations' && lane.events.some(event => event.sourceId === source.id));
 assert.ok(row.events.some(event => event.kind === 'missing' && event.atUtc === missing.observed_at));
 assert.ok(row.events.some(event => event.kind === 'gap' && event.startSeconds === 15 && event.endSeconds === 30));
 assert.ok(row.events.filter(event => event.kind === 'observation').every(event => event.startSeconds === event.endSeconds));
});
test('different sources for one entity remain separate, and same-instant conflicts are refused', () => {
 const r = structuredClone(record), original = r.facts.find(f => f.kind === 'position');
 const source = { ...r.sources.find(source => source.id === original.source_id), id: 'independent-source' };
 r.sources.push(source); r.facts.push({ ...original, source_id: source.id, id: 'independent-position' });
 assert.equal(build(scene, [r]).lanes.filter(lane => lane.kind === 'observations').length, 4);
 const conflict = structuredClone(record), fact = conflict.facts.find(f => f.kind === 'position'); fact.observed_at = fact.observed_at.replace(/\.\d{3}Z$/, '.000Z');
 conflict.facts.push({ ...fact, id: 'contradiction', observed_at: fact.observed_at.replace('.000Z', 'Z'), value: { ...fact.value, latitude: fact.value.latitude + 0.01 } });
 assert.throws(() => build(scene, [conflict]), /Conflicting positions/);
});
test('qualified intervals retain exact UTC bounds and only display offsets clip to the authored window', () => {
 const s = structuredClone(scene), feature = s.surfaces.features.find(feature => feature.properties.role === 'surface');
 s.airspace.status = 'qualified'; feature.properties = { ...feature.properties, role: 'volume', baseMeters: 0, heightMeters: 20, heightReference: 'map-ground-geometric' };
 feature.effective = { fromUtc: '2026-10-04T02:24:00.125Z', toUtc: '2026-10-04T02:25:10.875Z', datum: 'map-ground-geometric' };
 s.timeline.lanes = [{ id: 'volumes', label: 'Authored interval', kind: 'volumes', featureIds: [feature.id] }];
 const event = build(validateSourceGeospatialScene(s)).lanes[0].events[0];
 assert.equal(event.atUtc, feature.effective.fromUtc); assert.equal(event.toUtc, feature.effective.toUtc);
 assert.equal(event.startSeconds, 0); assert.equal(event.endSeconds, 30.875); assert.equal(event.kind, 'effective');
 feature.effective.datum = 'pressure'; assert.throws(() => validateSourceGeospatialScene(s), /geometric reference/);
});
test('invalid or unresolved authoring cannot hide samples, duplicate rows, or imply effective reference validity', () => {
 const missing = structuredClone(scene); missing.timeline.lanes[0].referenceHashes = ['f'.repeat(64)]; assert.throws(() => validateSourceGeospatialScene(missing), /reference is unresolved/);
 const short = structuredClone(scene); short.timeline.window.startUtc = '2026-10-04T02:25:00.000Z'; assert.throws(() => build(validateSourceGeospatialScene(short)), /every selected observation/);
 const duplicate = structuredClone(scene); duplicate.timeline.lanes.push({ id: 'other', label: 'Other', kind: 'observations' }); assert.throws(() => build(validateSourceGeospatialScene(duplicate)), /only one/);
 const invalid = structuredClone(scene); invalid.timeline.lanes[0].startUtc = scene.defaultAtUtc; assert.throws(() => validateSourceGeospatialScene(invalid), /context/);
 const duration = structuredClone(scene); duration.timeline.window.endUtc = '2026-10-06T02:24:40.000Z'; assert.throws(() => validateSourceGeospatialScene(duration), /24 hours/);
 const none = structuredClone(scene); delete none.timeline; assert.equal(build(none), null);
});
