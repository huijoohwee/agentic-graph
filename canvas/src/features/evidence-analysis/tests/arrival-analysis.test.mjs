import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { digest } from '../core/contracts.mjs';
import { admit, canonicalJson, EvidenceError, originalBytes } from '../core/evidence-kernel.mjs';
import { analyzeArrivals, ARRIVAL_ALGORITHM } from '../core/arrival-analysis.mjs';

const enc = new TextEncoder(), dec = new TextDecoder();
const profile = JSON.parse(await readFile(new URL('../profiles/arrival-v1.json', import.meta.url)));
const policy = JSON.parse(await readFile(new URL('../profiles/arrival-policy.json', import.meta.url)));
const originals = await Promise.all(['train', 'calibration', 'test'].map(name => readFile(new URL('../../../../public/evidence-analysis/fixtures/arrival-singapore-exercise-' + name + '.json', import.meta.url))));
const fixtures = originals.map(bytes => JSON.parse(dec.decode(bytes)));
const initial = await Promise.all(originals.map(bytes => admit(bytes, profile)));
const field = (bundle, id, kind) => bundle.facts.find(fact => fact.entity_id === id && fact.kind === kind);
const code = expected => error => error instanceof EvidenceError && error.code === expected;
async function seal(bundle) {
  for (const source of bundle.sources) {
    const facts = bundle.facts.filter(fact => fact.source_id === source.id);
    source.original.text = canonicalJson({ facts: facts.map(({ evidence_ref, ...fact }) => fact) });
    source.original.sha256 = await digest(enc.encode(source.original.text));
    facts.forEach((fact, i) => { fact.evidence_ref = '/facts/' + i; });
  }
  return admit(enc.encode(JSON.stringify(bundle)), profile);
}
async function changed(index, edit) {
  const bundle = structuredClone(fixtures[index]); edit(bundle);
  const handles = [...initial]; handles[index] = await seal(bundle); return handles;
}

test('separate frozen baselines, fitted candidate and calibrated interval retain original sources', () => {
  const before = initial.map(originalBytes), result = analyzeArrivals(initial, policy);
  assert.equal(result.algorithm, ARRIVAL_ALGORITHM);
  assert.deepEqual(result.counts, { total: 16, train: 3, calibration: 9, test: 3, excluded: 1, qualified: 0 });
  assert.equal(result.model.correctionSeconds, 300); assert.equal(result.model.intervalRadiusSeconds, 30);
  assert.equal(result.model.calibrationRank, 9); assert.equal(result.model.nominalCoverage, 0.9);
  assert.equal(result.metrics.scheduled.medianAbsoluteErrorSeconds, 600);
  assert.equal(result.metrics.constantSpeed.medianAbsoluteErrorSeconds, 300);
  assert.equal(result.metrics.candidate.medianAbsoluteErrorSeconds, 10);
  assert.equal(result.metrics.interval.empiricalCoverage, 1);
  assert.deepEqual(result.model.trainingCaseIds, ['r0', 'r1', 'r2']);
  assert.equal(result.model.calibrationCaseIds.length, 9);
  assert.equal(result.acceptance.eligible, false); assert.equal(result.acceptance.passed, false);
  assert.match(result.acceptance.reasons.join(' '), /Synthetic/);
  assert.equal(result.cost.modelCalls, 0); assert.equal(result.cost.billedApiCalls, 0);
  initial.forEach((handle, i) => assert.deepEqual(originalBytes(handle), before[i]));
  assert.throws(() => { result.model.correctionSeconds = 0; }, TypeError);
});

test('equal inputs and reordered batches produce identical canonical evaluation', () => {
  const result = analyzeArrivals(initial, policy);
  assert.equal(canonicalJson(result), canonicalJson(analyzeArrivals(initial, policy)));
  assert.equal(canonicalJson(result), canonicalJson(analyzeArrivals([...initial].reverse(), structuredClone(policy))));
});

test('future feature observation, retrieval and revised plans fail leakage fences', async () => {
  for (const [kind, property] of [['ground_speed', 'observed_at'], ['ground_speed', 'retrieved_at'], ['plan', 'retrieved_at']]) {
    const handles = await changed(2, bundle => {
      const fact = field(bundle, 't0', kind); fact[property] = '2026-10-02T10:00:01Z';
      if (property === 'observed_at') fact.retrieved_at = fact.observed_at;
    });
    assert.throws(() => analyzeArrivals(handles, policy), code('ARRIVAL_LEAKAGE'));
  }
});

test('partition overlap, wrongly assigned cases and truth learned after the cutoff are rejected', async () => {
  const overlapping = structuredClone(policy); overlapping.partitions.calibration.fromUtc = '2026-09-30T23:59:59Z';
  assert.throws(() => analyzeArrivals(initial, overlapping), code('ARRIVAL_LEAKAGE'));
  const assigned = await changed(0, bundle => { field(bundle, 'r0', 'partition').value = 'test'; });
  assert.throws(() => analyzeArrivals(assigned, policy), code('ARRIVAL_LEAKAGE'));
  const lateTruth = await changed(0, bundle => {
    field(bundle, 'r0', 'touchdown').retrieved_at = '2026-10-01T00:00:00Z';
    bundle.sources[0].retrieved_at = '2026-10-01T00:00:00Z';
  });
  assert.throws(() => analyzeArrivals(lateTruth, policy), code('ARRIVAL_LEAKAGE'));
});

test('missing truth and the exact thirty-minute sampling rule retain exclusion denominators', async () => {
  const seed = analyzeArrivals(initial, policy);
  assert.equal(seed.exclusions[0].id, 't3'); assert.match(seed.exclusions[0].reasons[0], /deliberately omits truth/);
  const shifted = await changed(2, bundle => {
    const fact = field(bundle, 't0', 'touchdown'); fact.value = fact.observed_at = fact.retrieved_at = '2026-10-02T10:30:01Z';
  });
  const result = analyzeArrivals(shifted, policy);
  assert.equal(result.counts.excluded, 2); assert.equal(result.counts.test, 2);
  assert.match(result.exclusions.find(row => row.id === 't0').reasons.join(' '), /horizon/);
});

test('held-out labels never change fitted model parameters or its identity', async () => {
  const baseline = analyzeArrivals(initial, policy);
  const handles = await changed(2, bundle => { const truth = field(bundle, 't0', 'touchdown'); truth.value = null; truth.null_reason = 'Withheld independent label.'; });
  const result = analyzeArrivals(handles, policy);
  assert.equal(canonicalJson(result.model), canonicalJson(baseline.model));
  assert.equal(result.cases.find(row => row.id === 't1').candidateUtc, baseline.cases.find(row => row.id === 't1').candidateUtc);
});

test('nine separate calibrators are required for the conservative finite ninety-percent interval', async () => {
  const handles = await changed(1, bundle => { bundle.entities.pop(); bundle.facts = bundle.facts.filter(fact => fact.entity_id !== 'c8'); });
  const result = analyzeArrivals(handles, policy);
  assert.equal(result.counts.calibration, 8); assert.equal(result.model.status, 'incomplete');
  assert.equal(result.model.intervalRadiusSeconds, null); assert.equal(result.model.calibrationRank, 9);
  assert.equal(result.metrics.interval.evaluated, 0); assert.equal(result.metrics.interval.totalHeldout, 3);
  assert.equal(result.metrics.interval.empiricalCoverage, 0); assert.equal(result.advisory.alertedCount, 0);
  assert.equal(result.acceptance.passed, false);
});

test('strict greater-than-ten-minute lateness and false-positive precision use held-out cases', async () => {
  const seed = analyzeArrivals(initial, policy);
  assert.equal(seed.advisory.lateCount, 1); assert.equal(seed.advisory.alertedCount, 1);
  assert.equal(seed.advisory.leadQualifiedCount, 1); assert.equal(seed.cases.find(row => row.id === 't0').leadSeconds, 1800);
  assert.equal(seed.cases.find(row => row.id === 't1').advisory, false);
  const handles = await changed(2, bundle => { field(bundle, 't1', 'ground_speed').value *= 1500 / 1600; });
  const result = analyzeArrivals(handles, policy);
  assert.equal(result.advisory.lateCount, 1); assert.equal(result.advisory.alertedCount, 2);
  assert.equal(result.advisory.truePositiveCount, 1); assert.equal(result.advisory.falsePositiveCount, 1);
  assert.equal(result.advisory.precision, 0.5); assert.equal(result.advisory.leadCoverage, 1);
  assert.equal(result.metrics.interval.empiricalCoverage, 2 / 3);
});

test('a candidate can lose to a baseline and no improvement is fabricated', async () => {
  const handles = await changed(2, bundle => {
    for (const id of ['t0', 't1', 't2']) { const speed = field(bundle, id, 'ground_speed'); const remaining = id === 't0' ? 1490 : id === 't1' ? 1500 : 1510; speed.value *= remaining / 1800; }
  });
  const result = analyzeArrivals(handles, policy);
  assert.ok(result.metrics.constantSpeed.medianAbsoluteErrorSeconds < 0.001);
  assert.equal(result.metrics.comparisons.constantSpeed.improved, false);
  assert.equal(result.acceptance.vcc3, false);
});

test('zero speed, stale track, missing plan and excluded geography remain explicit', async () => {
  const zero = analyzeArrivals(await changed(2, b => { field(b, 't0', 'ground_speed').value = 0; }), policy);
  assert.match(zero.exclusions.find(row => row.id === 't0').reasons.join(' '), /positive/);
  const stale = analyzeArrivals(await changed(2, b => { const f = field(b, 't0', 'ground_speed'); f.observed_at = f.retrieved_at = '2026-10-02T09:58:59Z'; }), policy);
  assert.match(stale.exclusions.find(row => row.id === 't0').reasons.join(' '), /stale/);
  const out = analyzeArrivals(await changed(2, b => { field(b, 't0', 'destination').value.longitude = 100; }), policy);
  assert.match(out.exclusions.find(row => row.id === 't0').reasons.join(' '), /Outside/);
  const noPlan = analyzeArrivals(await changed(2, b => { const f = field(b, 't0', 'plan'); f.value = null; f.null_reason = 'No permitted plan.'; }), policy);
  assert.equal(noPlan.advisory.missingPlanCount, 1); assert.equal(noPlan.advisory.lateCount, 0);
  assert.equal(noPlan.advisory.leadCoverage, null); assert.equal(noPlan.acceptance.vcc4, false);
});

test('caps, duplicate cases and changed verification thresholds fail loudly', () => {
  assert.throws(() => analyzeArrivals([], policy), code('ARRIVAL_LIMIT'));
  assert.throws(() => analyzeArrivals(Array(41).fill(initial[0]), policy), code('ARRIVAL_LIMIT'));
  assert.throws(() => analyzeArrivals([...initial, initial[0]], policy), code('ARRIVAL_LEAKAGE'));
  const lowered = structuredClone(policy); lowered.evaluation.minimumQualifiedArrivals = 3;
  assert.throws(() => analyzeArrivals(initial, lowered), code('ARRIVAL_POLICY'));
});

test('more than two hundred synthetic cases still cannot satisfy the real-truth gate', async () => {
  const batches = [];
  for (let i = 0; i < 23; i++) {
    const bundle = structuredClone(fixtures[1]);
    for (const entity of bundle.entities) entity.id += '-' + i;
    for (const fact of bundle.facts) { fact.entity_id += '-' + i; fact.id += '-' + i; }
    bundle.dataset.id += '-' + i; batches.push(await seal(bundle));
  }
  const result = analyzeArrivals([initial[0], ...batches, initial[2]], policy);
  assert.ok(result.counts.total >= 200); assert.equal(result.counts.qualified, 0);
  assert.equal(result.acceptance.eligible, false); assert.equal(result.acceptance.passed, false);
});
