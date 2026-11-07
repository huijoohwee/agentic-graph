import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { importReadsb } from '../import-readsb.mjs';
import { admit, exportPack, inspect, originalBytes } from '../core/evidence-kernel.mjs';
import { replay } from '../core/evidence-replay.mjs';

const encoder = new TextEncoder(), decoder = new TextDecoder();
const bytes = value => encoder.encode(JSON.stringify(value));
const sha = value => createHash('sha256').update(value).digest('hex');
const profile = JSON.parse(await readFile(new URL('../profiles/aviation-v1.json', import.meta.url), 'utf8'));
const selection = JSON.parse(await readFile(new URL('../profiles/singapore-region.json', import.meta.url), 'utf8'));
const fixtureBytes = new Uint8Array(await readFile(new URL('../../../../public/evidence-analysis/fixtures/aviation-singapore-v1.json', import.meta.url)));
const fixture = JSON.parse(decoder.decode(fixtureBytes));
const envelope = JSON.parse(fixture.sources[0].original.text);
const upstreamBytes = encoder.encode(envelope.upstream.text), upstream = JSON.parse(envelope.upstream.text);
const copy = value => structuredClone(value);
const row = (offset = 0.2, altitude = 1000, flags = 0, source = 'adsb_icao') =>
  [offset, 1.3, 104, altitude, 200, 90, flags, 0, null, source];

function synthetic(rows = [row()], timestamp = 1791023820.1) {
  const raw = bytes({ icao: 'abcdef', timestamp, trace: rows });
  const config = { ...copy(selection), datasetId: 'synthetic-adapter-test-only',
    title: 'Synthetic adapter edge case; not flight evidence', entityLabel: 'Synthetic test entity',
    sourceUrl: 'https://example.invalid/synthetic-readsb.json', sourceSha256: sha(raw),
    rightsStatement: 'Test-authored synthetic rows only; no observed-flight claim or upstream data rights are asserted.' };
  return { raw, config };
}
async function mapped(sample) {
  return JSON.parse(decoder.decode(await importReadsb(sample.raw, sample.config)));
}

test('readsb dated Singapore bundle regenerates byte-for-byte from preserved source and authored selection', async () => {
  assert.equal(upstreamBytes.length, 146788);
  assert.equal(sha(upstreamBytes), '7bff816aabbb6d2344f1eb8a123276150255d4f6c21700ea7242b4cdb401e20b');
  assert.equal(sha(upstreamBytes), selection.sourceSha256);
  assert.deepEqual(envelope.selection, selection);
  assert.deepEqual(await importReadsb(upstreamBytes, selection), fixtureBytes);
  assert.equal(envelope.selectedIndices.length, 56);
  assert.equal(fixture.facts.length, 117);
  assert.equal(fixture.facts[0].observed_at, '2026-10-03T10:37:19.240Z');
  assert.deepEqual(fixture.facts[0].value, { latitude: 1.06691, longitude: 104.4885 });
  assert.equal(fixture.facts[1].value, 11975);
  assert.equal(fixture.facts[1].unit, 'ft');
  assert.equal(fixture.facts[1].datum, 'pressure');
  assert.equal(upstream.trace.length, 708);
  assert(upstream.trace.some(point => point[6] & 1), 'Filtered stale observations remain in preserved bytes');
  for (const [position, index] of envelope.selectedIndices.entries()) {
    const point = upstream.trace[index], fact = fixture.facts[position * 2];
    assert.equal(point[6] & 1, 0);
    assert.equal(point[9], 'adsb_icao');
    assert.deepEqual(fact.value, { latitude: point[1], longitude: point[2] });
    assert.equal(fixture.facts[position * 2 + 1].value, point[3]);
    assert.equal(envelope.mappings[position * 2].upstreamPointer, `/trace/${index}`);
    assert.equal(envelope.mappings[position * 2 + 1].upstreamPointer, `/trace/${index}/3`);
  }
  const unknowns = fixture.facts.filter(fact => fact.value === null);
  assert.deepEqual(unknowns.map(fact => fact.kind), ['registration', 'operator', 'weather', 'schedule', 'restrictions']);
  assert(unknowns.every(fact => fact.null_reason.length > 0));
  assert.equal(upstream.r, '9V-MBR', 'Untimed metadata remains raw, not inferred as an observation');
});

test('readsb actual corpus survives pack roundtrip with unchanged facts, source bytes and replay', async () => {
  const accepted = await admit(fixtureBytes, profile);
  const reopened = await admit(await exportPack(accepted), profile);
  assert.deepEqual(originalBytes(reopened), fixtureBytes);
  assert.deepEqual(inspect(reopened), inspect(accepted));
  const at = '2026-10-03T10:37:19.240Z';
  assert.deepEqual(replay(reopened, '76b452', at), replay(accepted, '76b452', at));
  const reopenedBundle = JSON.parse(decoder.decode(originalBytes(reopened)));
  assert.equal(JSON.parse(reopenedBundle.sources[0].original.text).upstream.text, envelope.upstream.text);
});

test('readsb owns input bytes across asynchronous admission even for a mutable Node Buffer', async () => {
  const sample = synthetic(), raw = Buffer.from(sample.raw);
  const pending = importReadsb(raw, sample.config);
  raw.fill(32);
  const bundle = JSON.parse(decoder.decode(await pending));
  const source = JSON.parse(bundle.sources[0].original.text);
  assert.equal(source.upstream.text, decoder.decode(sample.raw));
  assert.equal(source.upstream.sha256, sha(sample.raw));
});

test('readsb snapshots authored labels and nested selection filters before asynchronous work', async () => {
  const sample = synthetic(), supplied = copy(sample.config);
  const pending = importReadsb(sample.raw, sample.config);
  sample.config.title = 'Changed after call'; sample.config.entityLabel = 'Changed entity';
  sample.config.studyArea.latitude[0] = 2;
  sample.config.positionSource = 'mlat'; sample.config.sourceSha256 = '0'.repeat(64);
  const admitted = await pending, bundle = JSON.parse(decoder.decode(admitted));
  const source = JSON.parse(bundle.sources[0].original.text);
  assert.equal(bundle.dataset.title, supplied.title);
  assert.equal(bundle.entities[0].label, supplied.entityLabel);
  assert.deepEqual(source.selection, supplied);
  assert.deepEqual(source.selectedIndices, [0]);
  assert.deepEqual(admitted, await importReadsb(sample.raw, supplied));
  await assert.rejects(importReadsb(sample.raw, { ...supplied, unsupported: undefined }), /Only JSON/);
});

test('readsb synthetic edges retain ground and absent altitude as unknown and add decimal milliseconds exactly', async () => {
  const sample = synthetic([row(0.2, 'ground'), row(0.201, null), row(0.202, 1000)]);
  const bundle = await mapped(sample), altitude = bundle.facts.filter(fact => fact.kind === 'altitude');
  assert.equal(bundle.dataset.id, 'synthetic-adapter-test-only');
  assert.deepEqual(altitude.map(fact => fact.observed_at), [
    '2026-10-03T10:37:00.300Z', '2026-10-03T10:37:00.301Z', '2026-10-03T10:37:00.302Z']);
  assert.deepEqual(altitude.map(fact => fact.value), [null, null, 1000]);
  assert.match(altitude[0].null_reason, /ground/);
  assert.match(altitude[1].null_reason, /absent/);
  assert(altitude.every(fact => fact.datum === 'pressure' && fact.unit === 'ft'));
  const geometric = await mapped(synthetic([row(0.2, 1234, 8)]));
  assert.equal(geometric.facts[1].datum, 'geometric');
  assert.equal(geometric.facts[1].value, 1234);
});

test('readsb authored filters omit stale, other-source and out-of-area points without deleting raw rows', async () => {
  const outside = row(0.5); outside[1] = 5;
  const sample = synthetic([row(), row(0.3, 1000, 1), row(0.4, 1000, 0, 'mlat'), outside]);
  const bundle = await mapped(sample), source = JSON.parse(bundle.sources[0].original.text);
  assert.deepEqual(source.selectedIndices, [0]);
  assert.equal(source.upstream.text, decoder.decode(sample.raw));
  assert.equal(JSON.parse(source.upstream.text).trace.length, 4);
  assert.equal(bundle.facts.length, 7);
});

test('readsb rejects source tampering, invalid rows, precision loss and unbounded selections', async () => {
  const sample = synthetic();
  await assert.rejects(importReadsb(sample.raw, { ...sample.config, sourceSha256: '0'.repeat(64) }), /SHA-256/);
  const changed = new Uint8Array(sample.raw); changed[0] = 32;
  await assert.rejects(importReadsb(changed, sample.config), /SHA-256/);
  await assert.rejects(importReadsb(new Uint8Array(400000), sample.config), /400 kB/);
  for (const change of [
    config => { config.endUtc = '2026-10-04T10:37:00.001Z'; },
    config => { config.endUtc = '2026-10-03T10:36:59.000Z'; },
    config => { config.maxPoints = 101; },
    config => { config.maxPoints = 0; },
    config => { config.studyArea.latitude = [91, 92]; },
    config => { config.schema = 'readsb-selection/v999'; },
    config => { config.positionSource = ''; },
    config => { config.excludeFlags = -1; },
  ]) {
    const config = copy(sample.config); change(config);
    await assert.rejects(importReadsb(sample.raw, config));
  }
  const capped = synthetic([row(), row(0.3)]); capped.config.maxPoints = 1;
  await assert.rejects(importReadsb(capped.raw, capped.config), /point cap/);
  for (const invalid of [synthetic([]), synthetic([[0.2]]), synthetic([row(0.0001)]),
    synthetic([row(0.2, 'not-altitude')]), synthetic([row(0.2, 1000, 'bad-flags')])]) {
    await assert.rejects(importReadsb(invalid.raw, invalid.config));
  }
  for (const raw of [Uint8Array.of(255), encoder.encode('{')]) {
    await assert.rejects(importReadsb(raw, { ...sample.config, sourceSha256: sha(raw) }));
  }
});

test('readsb selection requires calendar-valid explicit UTC and refuses ambiguous duplicate source keys', async () => {
  const sample = synthetic();
  for (const startUtc of ['2026-10-03T10:37:00', '2026-10-03', '2026-10-03T10:37:00+00:00']) {
    await assert.rejects(importReadsb(sample.raw, { ...sample.config, startUtc }));
  }
  const calendar = synthetic([row()], Date.parse('2026-03-01T10:37:00.000Z') / 1000);
  calendar.config.startUtc = '2026-02-29T10:37:00.000Z';
  calendar.config.endUtc = '2026-03-01T10:38:00.000Z';
  await assert.rejects(importReadsb(calendar.raw, calendar.config));
  const duplicate = encoder.encode(decoder.decode(sample.raw).replace('"timestamp":', '"timestamp":0,"timestamp":'));
  await assert.rejects(importReadsb(duplicate, { ...sample.config, sourceSha256: sha(duplicate) }));
});
