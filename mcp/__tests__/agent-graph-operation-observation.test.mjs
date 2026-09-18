import assert from 'node:assert/strict';
import test from 'node:test';
import { startAgentGraphObservation } from '../agent-graph/operation-observation.mjs';
import { normalizeAgentGraphObservation } from '../../contracts/agent-graph-observation.mjs';
import { createAgenticGraphClient } from 'agentic-os/agents/agentic-graph-mcp-contract';
import { createFixture, ingestFixture, materializeFixture } from './agent-graph-runtime-test-support.mjs';

test('measurements use deltas and endpoint samples without inventing peak or exclusive usage', () => {
  let at = 10, user = 1000, system = 2000, rss = 4000;
  const finish = startAgentGraphObservation('ingest', { clock: () => at,
    cpu: () => ({ user, system }), memory: () => ({ rss, heapUsed: rss / 2 }) });
  at = 35; user = 3500; system = 2500; rss = 3000;
  const body = { ok: true, counts: { parsed: 2, reused: 3, admittedBytes: 100 }, label: '字' };
  const measured = finish(body), o = measured.observation;
  assert.equal(o.elapsedMs, 25);
  assert.deepEqual(o.cpu, { scope: 'node-process-window', userMs: 2.5, systemMs: 0.5, totalMs: 3 });
  assert.equal(o.memory.rssBeforeBytes, 4000); assert.equal(o.memory.rssAfterBytes, 3000);
  assert.equal(o.output.bytes, Buffer.byteLength(JSON.stringify(body)));
  assert.deepEqual(o.sources, { parsed: 2, reused: 3, admittedBytes: 100 });
  assert.equal(o.model.id, null); assert.equal(o.model.scope, 'native-runtime-only');
  assert.equal(JSON.stringify(body).includes('observation'), false);
  assert.ok(Object.isFrozen(o.cpu));
  const later = startAgentGraphObservation('query', { clock: () => 30, cpu: () => ({ user: 0, system: 0 }), memory: () => ({ rss: 10, heapUsed: 5 }) })(body);
  assert.equal(later.observation.cpu.totalMs, 0);
});

test('unavailable probes and backwards counters stay unknown and preserve failures', () => {
  const unavailable = () => { throw Error('unavailable'); };
  const body = { schema: 'failure', operation: 'query', ok: false, error: { code: 'stale', message: 'Changed', details: { expected: 'x' } } };
  const result = startAgentGraphObservation('query', { clock: unavailable, cpu: unavailable, memory: unavailable })(body);
  assert.deepEqual(Object.keys(result), Object.keys(body));
  assert.equal(result.error.code, 'stale'); assert.equal(result.error.details.expected, 'x');
  const o = result.error.details.observation;
  assert.equal(o.status, 'failed'); assert.equal(o.cpu.totalMs, null); assert.equal(o.memory.rssAfterBytes, null);
  assert.equal(o.elapsedMs, null); assert.equal(o.sources.parsed, null);
  let value = 10;
  const finish = startAgentGraphObservation('query', { clock: () => value, cpu: () => ({ user: value, system: value }) });
  value = 9;
  assert.equal(finish(body).error.details.observation.elapsedMs, null);
  assert.equal(finish(body).error.details.observation.cpu.totalMs, null);
});

test('the portable contract rejects unbounded, inconsistent and invented measurements', () => {
  const o = startAgentGraphObservation('query')({ ok: true }).observation;
  assert.equal(normalizeAgentGraphObservation(undefined), undefined);
  for (const changed of [null, { ...o, rootPath: '/private' }, { ...o, elapsedMs: -1 },
    { ...o, elapsedMs: Infinity }, { ...o, cpu: { ...o.cpu, scope: 'exclusive' } },
    { ...o, cpu: { ...o.cpu, totalMs: 42 } }, { ...o, output: { ...o.output, bytes: 1.5 } },
    { ...o, memory: { ...o.memory, peakMemoryBytes: 10 } }, { ...o, model: { ...o.model, calls: 1 } }]) {
    assert.throws(() => normalizeAgentGraphObservation(changed), /Invalid native graph/);
  }
});

test('native ingest, cache reuse, traversal, explanation and failures preserve OS consumer contracts', async t => {
  const fixture = await createFixture(t, { withPdfConverter: false });
  // PDF fixture is explicitly skipped by non-strict ingestion; no converter/model is invoked.
  const first = await ingestFixture(fixture, { strict: false, projectionLimit: 5 });
  assert.equal(first.observation.sources.parsed, first.counts.parsed);
  assert.ok(first.observation.elapsedMs >= 0); assert.ok(first.observation.cpu.totalMs >= 0);
  const second = await ingestFixture(fixture, { strict: false, projectionLimit: 5 });
  assert.equal(second.snapshotDigest, first.snapshotDigest);
  assert.equal(second.observation.sources.reused, second.counts.reused);
  assert.equal(second.observation.sources.parsed, second.counts.parsed);
  const graph = await materializeFixture(fixture, first);
  assert.equal(JSON.stringify(graph.snapshot.manifest).includes('observation'), false);
  const client = createAgenticGraphClient({ callTool: (name, args) => fixture.runtime.run(name, args) });
  const request = { graphId: first.graphId, expectedSnapshotDigest: first.snapshotDigest };
  const summary = await client.queryAgenticGraph({ ...request, mode: 'summary' });
  assert.equal(summary.observation.operation, 'query'); assert.equal(summary.observation.sources.parsed, null);
  const explained = await client.explainAgenticGraphEdge({ ...request, edgeId: graph.edges[0].id });
  assert.equal(explained.observation.operation, 'explain_edge');
  await assert.rejects(client.queryAgenticGraph({ ...request, mode: 'summary', expectedSnapshotDigest: '0'.repeat(64) }), error => {
    assert.equal(error.code, 'stale_snapshot_digest');
    assert.equal(error.data.observation.status, 'failed');
    return true;
  });
});
