import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { digest } from '../core/contracts.mjs';
import { ALGORITHM, admit, canonicalJson, createSession, EvidenceError, exportPack, inspect, originalBytes, sourceEvidence, utcMillis } from '../core/evidence-kernel.mjs';
import { replay } from '../core/evidence-replay.mjs';

const encoder = new TextEncoder(), decoder = new TextDecoder();
const profile = JSON.parse(await readFile(new URL('../profiles/aviation-v1.json', import.meta.url), 'utf8'));
const original = new Uint8Array(await readFile(new URL('../../../../public/evidence-analysis/fixtures/aviation-synthetic-v1.json', import.meta.url)));
const fixture = JSON.parse(decoder.decode(original));
const copy = value => structuredClone(value);
const bytes = value => encoder.encode(JSON.stringify(value));
const entityId = fixture.entities[0].id, at = '2026-01-01T12:00:30.000Z';
const field = (result, kind) => result.fields.find(item => item.kind === kind);
async function seal(bundle) {
  for (const source of bundle.sources) {
    const facts = bundle.facts.filter(fact => fact.source_id === source.id);
    source.original.text = canonicalJson({ facts: facts.map(({ evidence_ref, ...fact }) => fact) });
    source.original.sha256 = await digest(encoder.encode(source.original.text));
    facts.forEach((fact, index) => { fact.evidence_ref = '/facts/' + index; });
  }
  return bundle;
}
const errorCode = code => error => error instanceof EvidenceError && error.code === code;
async function rejectsChange(change, code, reseal = true) {
  const bundle = copy(fixture); change(bundle);
  if (reseal) await seal(bundle);
  await assert.rejects(admit(bytes(bundle), profile), errorCode(code));
}

test('admission preserves every original byte, factual field and provenance declaration', async () => {
  const accepted = await admit(original, profile), record = inspect(accepted);
  assert.deepEqual(originalBytes(accepted), original);
  assert.equal(record.schema, 'evidence-inspection/v1');
  assert.deepEqual(record.stats, { entityCount: 1, factCount: 13, sourceCount: 2,
    startUtc: '2026-01-01T12:00:00.000Z', endUtc: '2026-01-01T12:02:30.000Z' });
  assert.equal(record.identity.originalSha256, await digest(original));
  assert.equal(record.profile.sha256, await digest(encoder.encode(canonicalJson(profile))));
  assert.deepEqual(record.cost, { modelCalls: 0, billedApiCalls: 0, estimatedCost: 0 });
  assert.equal(record.sources[0].rights.status, 'synthetic-authored');
  for (const fact of fixture.facts) assert.deepEqual(record.facts.find(item => item.id === fact.id), fact);
  const detached = originalBytes(accepted); detached.fill(0);
  assert.deepEqual(originalBytes(accepted), original);
  assert.throws(() => { record.facts[0].value = 'changed'; }, TypeError);
  assert.throws(() => inspect({ identity: record.identity }), errorCode('SESSION'));
});

test('strict JSON, Unicode and schema admission rejects ambiguous or unsupported input', async () => {
  const raw = JSON.stringify(fixture);
  for (const [input, code] of [
    [encoder.encode('null'), 'SCHEMA'], [encoder.encode('[]'), 'SCHEMA'],
    [encoder.encode('{'), 'JSON'], [Uint8Array.of(0xff), 'UTF8'],
    [encoder.encode(raw.replace('{"schema":', '{"schema":"duplicate","schema":')), 'DUPLICATE_KEY'],
    [encoder.encode('{"a":{"x":1,"\\u0078":2}}'), 'DUPLICATE_KEY'],
    [encoder.encode('{"a":1e400}'), 'NUMBER'],
    [encoder.encode('{"\\ud800":1}'), 'TEXT'],
    [encoder.encode('{"value":"\\udfff"}'), 'TEXT'],
  ]) await assert.rejects(admit(input, profile), errorCode(code));
  await rejectsChange(bundle => { bundle.extra = true; }, 'SCHEMA');
  await rejectsChange(bundle => { bundle.entities[0].extra = true; }, 'SCHEMA');
  await rejectsChange(bundle => { bundle.facts[0].extra = true; }, 'SCHEMA');
  await rejectsChange(bundle => { delete bundle.facts[0].retrieved_at; }, 'SCHEMA');
  await rejectsChange(bundle => { bundle.sources[0].rights.extra = true; }, 'SCHEMA');
  assert.throws(() => canonicalJson({ value: undefined }), errorCode('SCHEMA'));
  assert.throws(() => canonicalJson({ value: Infinity }), errorCode('NUMBER'));
  assert.throws(() => canonicalJson({ '\ud800': 1 }), errorCode('TEXT'));
  assert.throws(() => canonicalJson(Array(1)), errorCode('SCHEMA'));
});

test('calendar, ordering and observation-window constraints are exact', async () => {
  for (const timestamp of ['2026-02-30T12:00:00Z', '2026-01-01T24:00:00Z', '2026-01-01T12:00:60Z',
    '2026-01-01T12:00:00+00:00', '2026-01-01', '2026-01-01T12:00:00.1Z']) {
    await rejectsChange(bundle => { bundle.facts[0].observed_at = timestamp; }, 'UTC');
  }
  assert.equal(utcMillis('2024-02-29T12:00:00Z'), utcMillis('2024-02-29T12:00:00.000Z'));
  await rejectsChange(bundle => { bundle.facts[0].retrieved_at = '2026-01-01T11:59:59.000Z'; }, 'TIME_ORDER');
  await rejectsChange(bundle => { bundle.sources[0].retrieved_at = '2026-01-01T12:00:00Z'; }, 'TIME_ORDER');
  const boundary = copy(fixture), fact = boundary.facts[4];
  fact.observed_at = fact.retrieved_at = '2026-01-02T12:00:00.000Z';
  boundary.sources[0].retrieved_at = fact.observed_at;
  await admit(bytes(await seal(boundary)), profile);
  fact.observed_at = fact.retrieved_at = '2026-01-02T12:00:00.001Z';
  boundary.sources[0].retrieved_at = fact.observed_at;
  await assert.rejects(admit(bytes(await seal(boundary)), profile), errorCode('LIMIT'));
});

test('stable identities and required null reasons cannot be omitted or inferred', async () => {
  await rejectsChange(bundle => { bundle.entities.push(copy(bundle.entities[0])); }, 'IDENTITY');
  await rejectsChange(bundle => { bundle.sources.push(copy(bundle.sources[0])); }, 'IDENTITY', false);
  await rejectsChange(bundle => { bundle.facts.push(copy(bundle.facts[0])); }, 'IDENTITY');
  await rejectsChange(bundle => { bundle.facts[0].id = ' '; }, 'IDENTITY');
  for (const key of ['entity_id', 'source_id', 'kind']) {
    await rejectsChange(bundle => { bundle.facts[0][key] = 'unknown'; }, 'REFERENCE');
  }
  await rejectsChange(bundle => { bundle.facts = bundle.facts.filter(fact => fact.kind !== 'weather'); }, 'MISSING_FIELD');
  await rejectsChange(bundle => { bundle.facts.find(fact => fact.kind === 'operator').null_reason = null; }, 'TEXT');
  await rejectsChange(bundle => { bundle.facts[0].null_reason = 'not absent'; }, 'VALUE');
  await rejectsChange(bundle => { bundle.facts.find(fact => fact.kind === 'operator').value = ''; }, 'VALUE');
});

test('unit, datum, coordinate and finite range gates retain originals without speculative conversion', async () => {
  await rejectsChange(bundle => { bundle.facts[0].value.latitude = 90.001; }, 'RANGE');
  await rejectsChange(bundle => { bundle.facts[0].value.longitude = -180.001; }, 'RANGE');
  await rejectsChange(bundle => { bundle.facts[0].value.latitude = '1'; }, 'RANGE');
  await rejectsChange(bundle => { bundle.facts[0].value.height = 1; }, 'SCHEMA');
  await rejectsChange(bundle => { bundle.facts[1].value = 30001; }, 'RANGE');
  await rejectsChange(bundle => { bundle.facts[1].value = '1000'; }, 'RANGE');
  await rejectsChange(bundle => { bundle.facts[1].unit = 'FL'; }, 'UNIT');
  await rejectsChange(bundle => { bundle.facts[1].datum = 'unknown'; }, 'DATUM');
  await rejectsChange(bundle => { bundle.facts[3].datum = 'AGL'; }, 'DATUM_CONFLICT');
  const bundle = copy(fixture);
  bundle.facts.find(fact => fact.id === 'synthetic-a-altitude-30').value = 304.8;
  const result = replay(await admit(bytes(await seal(bundle)), profile), entityId, at);
  const altitude = field(result, 'altitude');
  assert.equal(altitude.conflict, false);
  assert.deepEqual(altitude.values.map(value => value.value), [304.8, 304.8]);
  assert.equal(altitude.facts[1].value, 1000);
  assert.equal(altitude.facts[1].unit, 'ft');
});

test('rights and exact source references bind every fact to preserved source bytes', async () => {
  await rejectsChange(bundle => { bundle.dataset.classification = 'observed'; }, 'PROVENANCE');
  await rejectsChange(bundle => { bundle.sources[0].rights.status = 'unverified'; }, 'RIGHTS');
  await rejectsChange(bundle => { bundle.sources[0].rights.statement = ''; }, 'TEXT');
  await rejectsChange(bundle => { bundle.dataset.classification = 'imported'; }, 'RIGHTS');
  await rejectsChange(bundle => { bundle.sources[0].original.sha256 = '0'.repeat(64); }, 'DIGEST', false);
  await rejectsChange(bundle => { bundle.sources[0].original.text += ' '; }, 'DIGEST', false);
  await rejectsChange(bundle => { bundle.facts[0].value.latitude += 0.1; }, 'REFERENCE', false);
  for (const pointer of ['/facts/999', '/facts/0/value', '/facts/~2']) {
    await rejectsChange(bundle => { bundle.facts[0].evidence_ref = pointer; }, 'REFERENCE', false);
  }
  const imported = copy(fixture); imported.dataset.classification = 'imported';
  imported.sources.forEach(source => { source.rights.status = 'operator-attested'; });
  assert.equal(inspect(await admit(bytes(imported), profile)).dataset.classification, 'imported');
});

test('bounded collections and maximum original bytes survive pack export/reimport', async () => {
  await rejectsChange(bundle => {
    bundle.entities = Array.from({ length: 11 }, (_, index) => ({ id: 'entity-' + index, label: 'Entity' }));
  }, 'LIMIT');
  await rejectsChange(bundle => {
    bundle.facts = Array.from({ length: 5001 }, (_, index) => ({ ...bundle.facts[0], id: 'fact-' + index }));
  }, 'LIMIT', false);
  const padded = new Uint8Array(profile.limits.maxBytes); padded.fill(32); padded.set(original);
  const accepted = await admit(padded, profile), pack = await exportPack(accepted);
  assert(pack.byteLength <= profile.limits.maxPackBytes);
  assert(pack.byteLength > profile.limits.maxBytes);
  assert.deepEqual(originalBytes(await admit(pack, profile)), padded);
  const oversized = new Uint8Array(profile.limits.maxBytes + 1); oversized.fill(32); oversized.set(original);
  await assert.rejects(admit(oversized, profile), errorCode('LIMIT'));
  await assert.rejects(admit(new Uint8Array(profile.limits.maxPackBytes + 1), profile), errorCode('LIMIT'));
  await assert.rejects(admit(new Uint8Array(), profile), errorCode('LIMIT'));
});

test('portable packs are deterministic, profile-bound and reject changed originals or metadata', async () => {
  const accepted = await admit(original, profile), packed = await exportPack(accepted);
  assert.deepEqual(await exportPack(accepted), packed);
  assert.deepEqual(inspect(await admit(packed, profile)), inspect(accepted));
  for (const mutate of [pack => { pack.derivedSha256 = '0'.repeat(64); },
    pack => { pack.original.sha256 = '0'.repeat(64); }, pack => { pack.original.text += ' '; },
    pack => { pack.profile.sha256 = '0'.repeat(64); }, pack => { pack.profile.version = '2'; }]) {
    const pack = JSON.parse(decoder.decode(packed)); mutate(pack);
    await assert.rejects(admit(bytes(pack), profile), errorCode('DIGEST'));
  }
  const changedPolicy = copy(profile); changedPolicy.staleAfterSeconds += 1;
  await assert.rejects(admit(packed, changedPolicy), errorCode('DIGEST'));
  const pack = JSON.parse(decoder.decode(packed)); pack.algorithm = 'other/v1';
  await assert.rejects(admit(bytes(pack), profile), errorCode('PACK'));
  pack.algorithm = ALGORITHM; pack.original.text = decoder.decode(packed);
  await assert.rejects(admit(bytes(pack), profile), errorCode('SCHEMA'));
  const reordered = copy(fixture); reordered.facts.reverse(); reordered.entities.reverse(); reordered.sources.reverse();
  const alternate = inspect(await admit(bytes(reordered), profile));
  assert.equal(alternate.identity.derivedSha256, inspect(accepted).identity.derivedSha256);
  assert.notEqual(alternate.identity.originalSha256, inspect(accepted).identity.originalSha256);
});

test('replay uses explicit time, retains source disagreements and never interpolates gaps', async () => {
  const accepted = await admit(original, profile), result = replay(accepted, entityId, at);
  assert.equal(field(result, 'position').conflict, true);
  assert.equal(field(result, 'altitude').conflict, true);
  assert.equal(field(result, 'operator').missing, true);
  assert.equal(field(result, 'position').facts[0].observed_at, at);
  assert.equal(field(result, 'position').facts[0].value.latitude, 1.31);
  const between = replay(accepted, entityId, '2026-01-01T12:01:00.000Z');
  assert.equal(field(between, 'position').facts[0].value.latitude, 1.31);
  assert.equal(field(replay(accepted, entityId, '2026-01-01T12:01:30.000Z'), 'position').stale, false);
  const stale = replay(accepted, entityId, '2026-01-01T12:01:31.000Z');
  assert.equal(field(stale, 'position').stale, true);
  assert.equal(field(stale, 'position').ageSeconds, 61);
  assert(stale.gaps.some(gap => gap.kind === 'position' && gap.durationSeconds === 61));
  const later = replay(accepted, entityId, '2026-01-01T12:02:30.000Z');
  assert(later.gaps.some(gap => gap.kind === 'position' && gap.sourceId === 'synthetic-a' && gap.durationSeconds === 120));
  const earlier = replay(accepted, entityId, '2026-01-01T11:59:59.000Z');
  assert.equal(earlier.facts.length, 0);
  assert(earlier.fields.every(item => item.missing && !item.stale && item.ageSeconds === null));
  assert.deepEqual(earlier.gaps, []);
  assert.throws(() => replay(accepted, 'unknown', at), errorCode('ENTITY'));
  assert.throws(() => replay(accepted, entityId), errorCode('UTC'));
  const saved = { now: Date.now, random: Math.random, fetch: globalThis.fetch };
  try {
    Date.now = Math.random = globalThis.fetch = () => { throw new Error('Hidden side effect'); };
    assert.equal(canonicalJson(replay(accepted, entityId, at)), canonicalJson(result));
  } finally { Date.now = saved.now; Math.random = saved.random; globalThis.fetch = saved.fetch; }
});

test('same-source ties remain visible in stable observed/source/fact order', async () => {
  const bundle = copy(fixture), originalFact = bundle.facts.find(fact => fact.id === 'synthetic-a-altitude-30');
  bundle.facts.push({ ...originalFact, id: 'synthetic-a-altitude-30-second', value: 950 });
  const accepted = await admit(bytes(await seal(bundle)), profile), result = replay(accepted, entityId, at);
  assert.deepEqual(field(result, 'altitude').facts.map(fact => fact.id),
    ['synthetic-a-altitude-30', 'synthetic-a-altitude-30-second', 'synthetic-b-altitude-30']);
  assert.equal(field(result, 'altitude').conflict, true);
  const order = inspect(accepted).facts.map(fact => [utcMillis(fact.observed_at), fact.source_id, fact.id]);
  assert.deepEqual(order, [...order].sort((a, b) => a[0] - b[0] || (a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0) || (a[2] < b[2] ? -1 : 1)));
});

test('latest import intent owns the session, including pre-read, failure and clear races', async () => {
  const session = createSession(profile);
  let resolveFirst, rejectObsolete;
  const first = session.import(new Promise(resolve => { resolveFirst = resolve; }));
  const second = await session.import(original);
  resolveFirst(encoder.encode('null'));
  assert.deepEqual(await first, { accepted: false, stale: true, value: second.value });
  const obsolete = session.import(new Promise((resolve, reject) => { rejectObsolete = reject; }));
  await assert.rejects(session.import(encoder.encode('null')), errorCode('SCHEMA'));
  assert.equal(session.read(), second.value);
  rejectObsolete(new Error('Obsolete file read failure'));
  assert.equal((await obsolete).stale, true);
  let resolvePending;
  const pending = session.import(new Promise(resolve => { resolvePending = resolve; }));
  session.clear(); resolvePending(original);
  assert.deepEqual(await pending, { accepted: false, stale: true, value: null });
  assert.equal(session.read(), null);
});

test('session snapshots direct bytes before yielding, preserving the title and identity at call time', async () => {
  for (const mutable of [original.slice(), Buffer.from(original)]) {
    const session = createSession(profile), pending = session.import(mutable);
    const titleOffset = Buffer.from(mutable).indexOf(fixture.dataset.title);
    assert(titleOffset >= 0);
    mutable[titleOffset] = 'A'.charCodeAt(0);
    assert.notEqual(JSON.parse(decoder.decode(mutable)).dataset.title, fixture.dataset.title);
    const result = await pending;
    assert.equal(result.accepted, true);
    assert.equal(inspect(result.value).dataset.title, fixture.dataset.title);
    assert.equal(inspect(session.read()).identity.originalSha256, await digest(original));
    assert.deepEqual(originalBytes(result.value), original);
  }
});

test('source inspection exposes exact original text, source rights and an immutable referenced record', async () => {
  const accepted = await admit(original, profile), fact = fixture.facts[0];
  const result = sourceEvidence(accepted, fact.id), source = fixture.sources.find(item => item.id === fact.source_id);
  const { evidence_ref, ...record } = fact;
  assert.equal(result.schema, 'evidence-source/v1');
  assert.deepEqual(result.identity, inspect(accepted).identity);
  assert.deepEqual(result.profile, inspect(accepted).profile);
  assert.deepEqual(result.fact, fact);
  assert.deepEqual(result.source, source);
  assert.equal(result.reference, evidence_ref);
  assert.deepEqual(result.referencedRecord, record);
  assert.deepEqual(encoder.encode(result.source.original.text), encoder.encode(source.original.text));
  assert.equal(await digest(encoder.encode(result.source.original.text)), source.original.sha256);
  for (const mutate of [
    () => { result.source.original.text = '{}'; }, () => { result.source.rights.statement = 'changed'; },
    () => { result.fact.value.latitude = 0; }, () => { result.referencedRecord.value.latitude = 0; },
    () => { result.identity.originalSha256 = 'changed'; }, () => { result.profile.version = 'changed'; },
  ]) assert.throws(mutate, TypeError);
  assert(Object.isFrozen(result));
  assert.deepEqual(sourceEvidence(await admit(await exportPack(accepted), profile), fact.id), result);
  for (const id of ['unknown', null, {}, 0]) assert.throws(() => sourceEvidence(accepted, id),
    error => errorCode('FACT')(error) && error.path === 'factId');
  assert.throws(() => sourceEvidence({}, fact.id), errorCode('SESSION'));
});

test('source inspection resolves admitted escaped JSON pointers without changing original formatting', async () => {
  const bundle = copy(fixture), fact = bundle.facts[0];
  const source = bundle.sources.find(item => item.id === fact.source_id);
  const { evidence_ref, ...record } = fact;
  const document = JSON.parse(source.original.text);
  document.records = { 'a/b~c': record };
  source.original.text = JSON.stringify(document, null, 2) + '\n';
  source.original.sha256 = await digest(encoder.encode(source.original.text));
  fact.evidence_ref = '/records/a~1b~0c';
  const result = sourceEvidence(await admit(bytes(bundle), profile), fact.id);
  assert.equal(result.reference, fact.evidence_ref);
  assert.deepEqual(result.referencedRecord, record);
  assert.equal(result.source.original.text, source.original.text);
});

test('admission snapshots caller bytes and profile before asynchronous digest work', async () => {
  const mutableBytes = original.slice(), mutableProfile = copy(profile);
  const pending = admit(mutableBytes, mutableProfile);
  mutableBytes.fill(0); mutableProfile.staleAfterSeconds = 1;
  const accepted = await pending;
  assert.deepEqual(originalBytes(accepted), original);
  assert.equal(accepted.profile.staleAfterSeconds, 60);
});

test('Buffer ownership is copied at admission and every original-byte read', async () => {
  const callerBytes = Buffer.from(original), pending = admit(callerBytes, profile);
  callerBytes.fill(0); // Mutation while source digests are still awaited.
  const accepted = await pending, identity = inspect(accepted).identity;
  assert.equal(identity.originalSha256, await digest(original));
  const returned = originalBytes(accepted);
  assert.equal(Buffer.isBuffer(returned), false);
  assert.deepEqual(returned, original);
  returned.fill(32);
  assert.deepEqual(originalBytes(accepted), original);
  assert.deepEqual(inspect(await admit(await exportPack(accepted), profile)), inspect(accepted));

  const fileBuffer = await readFile(new URL('../../../../public/evidence-analysis/fixtures/aviation-synthetic-v1.json', import.meta.url));
  const completed = await admit(fileBuffer, profile);
  fileBuffer.fill(0); // Mutation after the handle was returned cannot alter its originals either.
  assert.deepEqual(originalBytes(completed), original);
  assert.deepEqual(inspect(completed).identity, identity);
});

test('UTC value comparison recognizes the same instant while preserving original spelling', async () => {
  const bundle = copy(fixture), schedule = bundle.facts.find(fact => fact.kind === 'schedule');
  schedule.value = '2026-01-01T13:00:00Z'; schedule.null_reason = null;
  const second = { ...schedule, id: 'same-instant-schedule', source_id: bundle.sources[1].id, value: '2026-01-01T13:00:00.000Z' };
  bundle.facts.push(second);
  const accepted = await admit(bytes(await seal(bundle)), profile);
  const result = field(replay(accepted, entityId, at), 'schedule');
  assert.equal(result.conflict, false);
  assert.deepEqual(result.values.map(value => value.value), [second.value, second.value]);
  assert.deepEqual(result.facts.map(fact => fact.value), [schedule.value, second.value]);
  assert.deepEqual(inspect(await admit(await exportPack(accepted), profile)), inspect(accepted));
  second.value = '2026-01-01T13:00:00.001Z';
  assert.equal(field(replay(await admit(bytes(await seal(bundle)), profile), entityId, at), 'schedule').conflict, true);
});

test('exact decimal conversion removes arithmetic noise without hiding nearby discrepancies', async () => {
  for (const [metres, feet, equivalent] of [
    [0.9144, 3, true], [-0.9144, -3, true], [9.144e-7, 3e-6, true], [0, -0, true],
    [0.9144000000000001, 3, false], [Number.MIN_VALUE, 1e-323, false],
  ]) {
    const bundle = copy(fixture), facts = bundle.facts.filter(fact => fact.kind === 'altitude' && fact.observed_at === at);
    facts[0].value = metres; facts[0].unit = 'm'; facts[1].value = feet; facts[1].unit = 'ft';
    const admittedBytes = bytes(await seal(bundle)), accepted = await admit(admittedBytes, profile);
    const result = field(replay(accepted, entityId, at), 'altitude');
    assert.equal(result.conflict, !equivalent, `${metres} m / ${feet} ft`);
    if (equivalent) assert.equal(result.values[0].value, result.values[1].value);
    if (metres === Number.MIN_VALUE) assert.equal(result.values[0].value, result.values[1].value, 'Rounded display values must not hide an exact decimal difference.');
    assert.deepEqual(originalBytes(accepted), admittedBytes);
    assert.deepEqual(result.facts.map(fact => [fact.value, fact.unit]), JSON.parse(decoder.decode(admittedBytes)).facts
      .filter(fact => fact.kind === 'altitude' && fact.observed_at === at).map(fact => [fact.value, fact.unit]));
    assert.equal(canonicalJson(replay(accepted, entityId, at)), canonicalJson(replay(await admit(admittedBytes, profile), entityId, at)));
  }
});

test('v1 packs fail with explicit migration guidance while original bundles receive v2 identities', async () => {
  const accepted = await admit(original, profile), legacy = JSON.parse(decoder.decode(await exportPack(accepted)));
  const { identity, stats, cost, ...legacyDerived } = inspect(accepted);
  legacyDerived.schema = 'evidence-record/v1'; legacyDerived.algorithm = legacy.algorithm = 'evidence-order/v1';
  legacy.derivedSha256 = await digest(encoder.encode(canonicalJson(legacyDerived)));
  await assert.rejects(admit(bytes(legacy), profile), error => error instanceof EvidenceError && error.code === 'PACK'
    && error.path === 'pack.algorithm' && /retain the old pack.*original\.text.*new identity.*No automatic migration/u.test(error.message));
  const restored = await admit(encoder.encode(legacy.original.text), profile);
  assert.equal(inspect(restored).algorithm, 'evidence-order/v2');
  assert.equal(inspect(restored).identity.originalSha256, legacy.original.sha256);
  assert.notEqual(inspect(restored).identity.derivedSha256, legacy.derivedSha256);
  assert.deepEqual(inspect(await admit(await exportPack(restored), profile)), inspect(restored));
});

test('the same engine consumes an independently authored non-aviation profile', async () => {
  const neutral = copy(profile), bundle = copy(fixture), replacements = new Map(neutral.fields.map((item, index) => [item.key, 'measurement-' + index]));
  neutral.id = 'independent-measurements'; neutral.bundleSchema = 'measurements/v1';
  neutral.ui = { title: 'Local measurements', description: 'Authored sensor fixture.', entityLabel: 'Subject', fixturePath: './local.json' };
  neutral.requiredKinds = neutral.requiredKinds.map(kind => replacements.get(kind));
  neutral.fields.forEach(item => { item.key = replacements.get(item.key); item.label = item.key; });
  bundle.schema = neutral.bundleSchema; bundle.profile.id = neutral.id;
  bundle.facts.forEach(fact => { fact.kind = replacements.get(fact.kind); });
  const accepted = await admit(bytes(await seal(bundle)), neutral);
  assert.equal(inspect(accepted).profile.id, neutral.id);
  assert(replay(accepted, entityId, at).fields.every(item => item.kind.startsWith('measurement-')));
  const bad = copy(neutral); bad.limits.maxFacts = 5001;
  await assert.rejects(admit(bytes(bundle), bad), errorCode('PROFILE'));
});
