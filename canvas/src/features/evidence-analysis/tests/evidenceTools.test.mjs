import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { EVIDENCE_OPERATIONS, findEvidenceOperation } from '../tools/evidenceCatalog.mjs';
import { executeEvidence, dispatchEvidence, invokeEvidenceCommand } from '../tools/executeEvidence.mjs';
import { buildAgenticGraphAgentReadyToolContracts } from '../../agent-ready/agentic-graph-agent-ready-tool-contract.mjs';
const fixture = name => readFile(new URL('../../../../public/evidence-analysis/fixtures/' + name, import.meta.url), 'utf8');
const bundle = await fixture('aviation-singapore-v1.json'), parsed = JSON.parse(bundle);
const atUtc = '2026-10-03T10:48:27.060Z';
const record = { profileId: 'aviation-v1', bundle }, entityId = parsed.entities[0].id;
const root = fileURLToPath(new URL('../../../../..', import.meta.url));
const cli = fileURLToPath(new URL('../tools/evidenceCli.mjs', import.meta.url));

test('eight native contracts share exact input schemas and stay out of unsupported published cloud catalog', () => {
  assert.equal(EVIDENCE_OPERATIONS.length, 8);
  const browser = buildAgenticGraphAgentReadyToolContracts({ includeBrowserOnlyTools: true });
  const published = buildAgenticGraphAgentReadyToolContracts();
  for (const tool of EVIDENCE_OPERATIONS) {
    assert.deepEqual(browser.find(t => t.name === tool.name).inputSchema, tool.inputSchema);
    assert.equal(published.some(t => t.name === tool.name), false);
  }
});

test('inspect, replay, original source and export roundtrip share exact identities', async () => {
  const first = await executeEvidence('aviation.inspect', record);
  assert.equal(first.stats.factCount, 117);
  const source = await executeEvidence('aviation.source', { ...record, factId: first.facts[0].id });
  assert.equal(source.schema, 'evidence-source/v1'); assert.deepEqual(source.identity, first.identity);
  const pack = await executeEvidence('aviation.export', record);
  assert.equal(pack.schema, 'evidence-export/v1'); assert.equal(pack.byteLength, Buffer.byteLength(pack.text));
  const reopened = await executeEvidence('aviation.inspect', { ...record, bundle: pack.text });
  assert.deepEqual(reopened, first);
  const replay = await executeEvidence('aviation.replay', { ...record, entityId, atUtc });
  assert.deepEqual(replay.identity, first.identity);
  assert.equal(replay.atUtc, atUtc);
});

test('all three independent analysis owners and notice triage execute through explicit authored profiles', async () => {
  const volume = await fixture('volume-singapore-synthetic-v1.json');
  const projected = await executeEvidence('volume.project', { profileId: 'volume-v1', viewId: 'volume-view', bundle: volume, entityId: JSON.parse(volume).entities[0].id, atUtc });
  assert.equal(projected.floorMetres, 304.8);
  const route = await fixture('route-singapore-synthetic-v1.json');
  const compared = await executeEvidence('route.benchmark', { profileId: 'route-v1', policyId: 'route-policy', bundle: route, entityId: JSON.parse(route).entities[0].id });
  assert.equal(compared.disposition, 'compared');
  const arrivals = await Promise.all(['train', 'calibration', 'test'].map(p => fixture(`arrival-singapore-exercise-${p}.json`)));
  const evaluated = await executeEvidence('arrival.evaluate', { profileId: 'arrival-v1', policyId: 'arrival-policy', bundles: arrivals });
  assert.equal(evaluated.schema, 'arrival-analysis/v1'); assert.equal(evaluated.acceptance.eligible, false);
  const notice = await executeEvidence('notice.triage', { profileId: 'volume-v1', policyId: 'notice-policy', viewId: 'volume-view', notice: await fixture('notice-singapore-synthetic-v1.json'), atUtc });
  assert.equal(notice.disposition, 'active');
});

test('schema, aggregate UTF8, invalid Unicode and unknown authored IDs fail with stable typed errors', async () => {
  for (const bad of [null, [], {}, { ...record, extra: true }]) assert.equal((await executeEvidence('aviation.inspect', bad)).error.code, 'INPUT');
  assert.equal((await executeEvidence('aviation.inspect', { ...record, profileId: '../aviation-v1' })).error.code, 'CONFIG');
  assert.equal((await executeEvidence('aviation.inspect', { ...record, bundle: '\ud800' })).error.code, 'INPUT');
  const wide = '界'.repeat(350_000);
  assert.equal((await executeEvidence('arrival.evaluate', { profileId: 'arrival-v1', policyId: 'arrival-policy', bundles: [wide, wide] })).error.code, 'LIMIT');
  assert.equal((await executeEvidence('aviation.replay', { ...record, entityId, atUtc: 'yesterday' })).ok, false);
});

test('document dispatcher requires explicit coherent configuration and command grammar is exact', async () => {
  const config = { profiles: { record: 'aviation-v1' } };
  assert.deepEqual(await dispatchEvidence('aviation.inspect', { bundle }, config), await executeEvidence('aviation.inspect', record));
  assert.equal((await dispatchEvidence('aviation.inspect', { bundle }, {})).error.code, 'CONFIG');
  assert.equal((await dispatchEvidence('aviation.inspect', { ...record, profileId: 'volume-v1' }, config)).error.code, 'CONFIG');
  assert.deepEqual(await invokeEvidenceCommand(findEvidenceOperation('aviation.inspect').invocation, record), await executeEvidence('aviation.inspect', record));
  assert.equal((await invokeEvidenceCommand('/aviation.inspect @other #evidence', record)).error.code, 'GRAMMAR');
});

test('CLI and headless executor return identical success and typed failure payloads', async () => {
  for (const input of [record, { ...record, extra: true }]) {
    const expected = await executeEvidence('aviation.inspect', input);
    const child = spawnSync(process.execPath, [cli, 'aviation.inspect'], { input: JSON.stringify(input), encoding: 'utf8', maxBuffer: 2_000_000 });
    assert.equal(child.status, expected.ok === false ? 1 : 0, child.stderr);
    assert.deepEqual(JSON.parse(child.stdout), expected);
  }
});

test('pending arrival inputs are detached from caller array mutation', async () => {
  const bundles = await Promise.all(['train', 'calibration', 'test'].map(p => fixture(`arrival-singapore-exercise-${p}.json`)));
  const expected = await executeEvidence('arrival.evaluate', { profileId: 'arrival-v1', policyId: 'arrival-policy', bundles });
  const pending = executeEvidence('arrival.evaluate', { profileId: 'arrival-v1', policyId: 'arrival-policy', bundles });
  bundles.splice(0, bundles.length, 'invalid');
  assert.deepEqual(await pending, expected);
});

test('aggregate input rejection stops encoding immediately, including multibyte overflow', async () => {
  const original = TextEncoder.prototype.encode, calls = [];
  TextEncoder.prototype.encode = function (text) { calls.push(text.length); return original.call(this, text); };
  try {
    const input = { profileId: 'arrival-v1', policyId: 'arrival-policy', bundles: Array(4).fill('a'.repeat(700_001)) };
    assert.equal((await executeEvidence('arrival.evaluate', input)).error.code, 'LIMIT');
    assert.deepEqual(calls, [700_001, 700_001]); // Third cannot fit; fourth is never visited.
    calls.length = 0;
    input.bundles = ['界'.repeat(333_334), '界'.repeat(333_334), 'must-not-be-encoded'];
    assert.equal((await executeEvidence('arrival.evaluate', input)).error.code, 'LIMIT');
    assert.deepEqual(calls, [333_334, 333_334]); // Byte overflow in second stops before third.
  } finally { TextEncoder.prototype.encode = original; }
});

test('portable packs retain the exact 2 MB UTF8 allowance and unchanged admitted identities', async () => {
  const pack = await executeEvidence('aviation.export', record);
  assert.ok(Buffer.byteLength(pack.text) > pack.text.length); // Fixture includes multibyte source text.
  const padded = pack.text + ' '.repeat(2_000_000 - Buffer.byteLength(pack.text));
  assert.equal(Buffer.byteLength(padded), 2_000_000);
  assert.deepEqual(await executeEvidence('aviation.inspect', { ...record, bundle: padded }), await executeEvidence('aviation.inspect', record));
  assert.equal((await executeEvidence('aviation.inspect', { ...record, bundle: padded + ' ' })).error.code, 'LIMIT');
});

test('native WebMCP builders retain identical success and validation payloads without browser discovery', () => {
  const code = `import {buildEvidenceAnalysisWebMcpToolBuilders} from './canvas/src/features/agent-ready/evidenceAnalysisWebMcpTools.ts';
    import {executeEvidence} from './canvas/src/features/evidence-analysis/tools/executeEvidence.mjs';
    import assert from 'node:assert/strict';
    let text=''; for await (const part of process.stdin) text+=part; const input=JSON.parse(text);
    const tools=buildEvidenceAnalysisWebMcpToolBuilders();
    for(const key of Object.keys(tools)) assert.deepEqual(await tools[key]().execute({}),await executeEvidence(key,{}));
    assert.deepEqual(await tools.evidence_inspect().execute(input),await executeEvidence('aviation.inspect',input));`;
  const child = spawnSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', code], {
    cwd: root, input: JSON.stringify(record), encoding: 'utf8', maxBuffer: 2_000_000,
    env: { ...process.env, TSX_TSCONFIG_PATH: 'canvas/tsconfig.json' },
  });
  assert.equal(child.status, 0, child.stderr);
});

test('existing native stdio server lists the same eight contracts and returns shared payloads/errors', { timeout: 30_000 }, async t => {
  const isolated = await mkdtemp(join(tmpdir(), 'graph-evidence-stdio-'));
  t.after(() => rm(isolated, { recursive: true, force: true }));
  const client = new Client({ name: 'graph-evidence-parity', version: '1.0.0' });
  const transport = new StdioClientTransport({ command: process.execPath, args: [join(root, 'mcp/server.js')], cwd: root,
    env: { PATH: process.env.PATH || '', HOME: process.env.HOME || '', NODE_ENV: 'test', AGENTIC_OS_ROOT: isolated, AGENTIC_OS_EXTERNAL_MCP_PROFILES_JSON: '' }, stderr: 'pipe' });
  try {
    await client.connect(transport, { timeout: 10_000 });
    const listed = await client.listTools();
    for (const tool of EVIDENCE_OPERATIONS) assert.deepEqual(listed.tools.find(t => t.name === tool.webName)?.inputSchema, tool.inputSchema);
    for (const input of [record, { ...record, extra: true }]) {
      const expected = await executeEvidence('aviation.inspect', input);
      const result = await client.callTool({ name: findEvidenceOperation('aviation.inspect').webName, arguments: input });
      assert.deepEqual(result.structuredContent, expected);
      assert.equal(result.isError, expected.ok === false);
    }
    const exported = await client.callTool({ name: findEvidenceOperation('aviation.export').webName, arguments: record });
    assert.equal(exported.isError, false);
    assert.deepEqual(exported.structuredContent, await executeEvidence('aviation.export', record));
    const reopened = await client.callTool({ name: findEvidenceOperation('aviation.inspect').webName, arguments: { ...record, bundle: exported.structuredContent.text } });
    assert.deepEqual(reopened.structuredContent, await executeEvidence('aviation.inspect', record));
    const oversized = { profileId: 'arrival-v1', policyId: 'arrival-policy', bundles: ['界'.repeat(350_000), '界'.repeat(350_000)] };
    const rejected = await client.callTool({ name: findEvidenceOperation('arrival.evaluate').webName, arguments: oversized });
    assert.equal(rejected.isError, true);
    assert.equal(rejected.structuredContent.error.code, 'LIMIT');
    assert.deepEqual(rejected.structuredContent, await executeEvidence('arrival.evaluate', oversized));
  } finally { await client.close(); }
});
