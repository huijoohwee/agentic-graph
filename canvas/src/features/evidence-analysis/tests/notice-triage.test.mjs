import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { digest } from '../core/contracts.mjs';
import { admit, canonicalJson, EvidenceError, exportPack, inspect, originalBytes } from '../core/evidence-kernel.mjs';
import { triageNotice, NOTICE_ALGORITHM } from '../core/notice-triage.mjs';
import { projectVolume } from '../core/volume-project.mjs';

const read = path => readFile(new URL(path.startsWith('fixtures/') ? '../../../../public/evidence-analysis/' + path : '../' + path, import.meta.url));
const policy = JSON.parse(await read('profiles/notice-policy.json'));
const profile = JSON.parse(await read('profiles/volume-v1.json')), view = JSON.parse(await read('profiles/volume-view.json'));
const bytes = new Uint8Array(await read('fixtures/notice-singapore-synthetic-v1.json'));
const fixture = JSON.parse(new TextDecoder().decode(bytes)), at = policy.ui.defaultAtUtc;
const encoder = new TextEncoder(), decode = bytes => new TextDecoder().decode(bytes);
const run = (input = bytes, time = at, p = policy) => triageNotice(input, time, p, profile, view);
const changed = change => { const value = structuredClone(fixture); change(value); return encoder.encode(JSON.stringify(value)); };
const code = expected => error => error instanceof EvidenceError && error.code === expected;

test('structured polygon triage preserves exact source, mappings and deterministic metric projection', async () => {
  const first = await run(), second = await run();
  assert.equal(first.algorithm, NOTICE_ALGORITHM); assert.equal(first.disposition, 'active');
  assert.equal(first.notice.classification, 'synthetic'); assert.equal(first.original.text, decode(bytes));
  assert.equal(first.original.sha256, await digest(bytes)); assert.deepEqual(first.source, fixture.source);
  assert.equal(canonicalJson(first), canonicalJson(second));
  assert.deepEqual(first.normalized.altitude, { floorMetres: 304.8, ceilingMetres: 609.6, datum: 'AMSL' });
  assert.deepEqual(first.normalized.geometry.coordinates, fixture.notice.geometry.coordinates);
  assert.equal(first.mapping.length, 9); assert.equal(first.mapping[0].inputPointer, '/notice/geometry/coordinates/0/0');
  const bundle = JSON.parse(first.derivedBundle), transformed = JSON.parse(bundle.sources[0].original.text);
  assert.equal(transformed.original.text, first.original.text); assert.equal(transformed.original.sha256, first.identity.originalSha256);
  assert.deepEqual(transformed.mappings, first.mapping); assert.deepEqual(transformed.policy.value, policy);
  assert.equal(bundle.sources[0].original.sha256, first.identity.transformedSha256);
  assert.throws(() => { first.source.rights.status = 'changed'; }, TypeError);
  assert.deepEqual(first.cost, { modelCalls: 0, billedApiCalls: 0, estimatedCost: 0 });
});

test('derived bundles use existing admission and pack roundtrip without changing original source text', async () => {
  const result = await run(), handle = await admit(encoder.encode(result.derivedBundle), profile);
  const reopened = await admit(await exportPack(handle), profile);
  assert.equal(decode(originalBytes(reopened)), result.derivedBundle);
  assert.deepEqual(inspect(reopened).identity, result.projection.identity);
  assert.equal(canonicalJson(projectVolume(reopened, fixture.notice.id, at, view)), canonicalJson(result.projection));
  const transformed = JSON.parse(JSON.parse(decode(originalBytes(reopened))).sources[0].original.text);
  assert.equal(transformed.original.text, decode(bytes));
});

test('explicit validity uses half-open boundaries, with prior-observation queries unresolved', async () => {
  assert.equal((await run(bytes, '2026-10-03T10:36:59Z')).disposition, 'inactive');
  assert.equal((await run(bytes, fixture.notice.validity.fromUtc)).disposition, 'active');
  assert.equal((await run(bytes, fixture.notice.validity.toUtc)).disposition, 'inactive');
  const before = await run(bytes, '2026-10-03T10:29:00Z');
  assert.equal(before.disposition, 'unresolved'); assert.equal(before.reasons[0].code, 'VOLUME_TIME');
  const reversed = await run(changed(value => { value.notice.validity.toUtc = value.notice.validity.fromUtc; }));
  assert.equal(reversed.disposition, 'unresolved'); assert.equal(reversed.derivedBundle, null);
  const invalid = await run(changed(value => { value.notice.validity.fromUtc = '2026-02-30T10:00:00Z'; }));
  assert.equal(invalid.reasons[0].code, 'UTC');
});

test('missing, null and incompatible vertical references remain explicitly unresolved', async () => {
  for (const datum of [null, '', 'unknown', 'AGL', 'pressure', 'geometric']) {
    const input = changed(value => { value.notice.vertical.floor.datum = datum; });
    const result = await run(input);
    assert.equal(result.disposition, 'unresolved', String(datum)); assert.equal(result.projection, null);
    assert.equal(result.original.text, decode(input)); assert.equal(result.declared.vertical.floor.datum, datum);
  }
  const missing = await run(changed(value => { delete value.notice.vertical.floor.datum; }));
  assert.equal(missing.reasons[0].code, 'NOTICE_VERTICAL_UNRESOLVED');
  const nullBound = await run(changed(value => { value.notice.vertical.floor.value = null; }));
  assert.equal(nullBound.disposition, 'unresolved');
  const equivalent = await run(changed(value => { value.notice.vertical.floor = { value: 304.8, unit: 'm', datum: 'AMSL' }; }));
  assert.deepEqual(equivalent.normalized.altitude, (await run()).normalized.altitude);
});

test('compound geometry, free text and recurring schedules are preserved without interpretation', async () => {
  for (const change of [value => { value.notice.geometry.type = 'MultiPolygon'; },
    value => { value.notice.geometry.coordinates.push(value.notice.geometry.coordinates[0]); },
    value => { value.notice.freeText = 'Narrative instructions cannot define a clearance.'; },
    value => { value.notice.validity.schedule = 'DAILY 0800-1700'; },
    value => { value.notice.geometry = { type: 'Arc', radius: 5 }; }]) {
    const input = changed(change), result = await run(input);
    assert.equal(result.disposition, 'unresolved'); assert.ok(result.reasons.length); assert.equal(result.derivedBundle, null);
    assert.equal(result.original.sha256, await digest(input)); assert.equal(result.original.text, decode(input));
  }
});

test('source rights, timestamp order and ambiguous JSON fail admission loudly', async () => {
  await assert.rejects(run(changed(value => { value.source.retrieved_at = '2026-10-03T10:29:00Z'; })), code('TIME_ORDER'));
  await assert.rejects(run(changed(value => { value.source.rights.status = 'unverified'; })), code('RIGHTS'));
  await assert.rejects(run(encoder.encode('{"schema":1,"schema":2}')), code('DUPLICATE_KEY'));
  await assert.rejects(run(new Uint8Array([0xc3, 0x28])), code('UTF8'));
  await assert.rejects(run(new Uint8Array(policy.maxBytes + 1)), code('NOTICE_LIMIT'));
  await assert.rejects(run(bytes, '2026-10-03 10:45:00'), code('UTC'));
});

test('derived source digest and original-fact pointers reject tampering through shared kernel', async () => {
  const result = await run(), bundle = JSON.parse(result.derivedBundle);
  const alteredSource = structuredClone(bundle); alteredSource.sources[0].original.text += ' ';
  await assert.rejects(admit(encoder.encode(JSON.stringify(alteredSource)), profile), code('DIGEST'));
  const alteredFact = structuredClone(bundle); alteredFact.facts[0].value.longitude += 0.001;
  await assert.rejects(admit(encoder.encode(JSON.stringify(alteredFact)), profile), code('REFERENCE'));
});

test('caller Buffer and authored-policy mutation cannot alter an in-flight interpretation', async () => {
  const buffer = Buffer.from(bytes), localPolicy = structuredClone(policy), pending = run(buffer, at, localPolicy);
  buffer.fill(0); localPolicy.roleMap.floor = 'corrupted';
  const result = await pending;
  assert.equal(result.disposition, 'active'); assert.equal(result.original.text, decode(bytes));
  assert.equal(result.identity.policySha256, (await run()).identity.policySha256);
  const mismatch = structuredClone(policy); mismatch.roleMap.floor = 'corrupted';
  await assert.rejects(run(bytes, at, mismatch), code('NOTICE_POLICY'));
});
