import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import pkg from '../../package.json' with { type: 'json' };
import { agentDocSourcePath, GRAPH_DOC_PATHS } from '../agentic-os-doc-sources.mjs';
import { resolveAgenticCanvasOsDocsRoot } from '../agentic-canvas-os-docs-runtime.js';
import { buildAgenticCanvasOsDocsDynamicResolutionPayload } from '../agentic-canvas-os-docs-core.mjs';
import { readRuntimeDocsSources } from '../../scripts/runtime-docs-sources.mjs';

const graphRoot = path.resolve(import.meta.dirname, '../..');
const docsRoot = resolveAgenticCanvasOsDocsRoot({ rootDir: graphRoot });
const osRoot = path.resolve(docsRoot, '../..');
const revision = pkg.dependencies['agentic-os'].split('/').at(-1);
const requests = [];
async function sourceFetch(url) {
  const prefix = `https://raw.githubusercontent.com/huijoohwee/agentic-os/${revision}/`;
  assert.ok(url.startsWith(prefix), 'every read uses the package pin and native source owner');
  requests.push(url);
  return new Response(await fs.readFile(path.join(osRoot, url.slice(prefix.length))));
}

test('logical docs map only to existing native owners and preserve storage identities', async () => {
  const sources = await readRuntimeDocsSources({ docsRoot, graphRoot });
  assert.equal(sources.length, 31);
  assert.equal(new Set(sources.map(row => row.canonicalPath)).size, sources.length);
  assert.deepEqual([...new Set(sources.map(row => row.sourceRepository))].sort(), ['huijoohwee/agentic-graph', 'huijoohwee/agentic-os']);
  const preset = sources.find(row => row.fileName === 'PROMPT-PRESETS.md');
  assert.equal(preset.canonicalPath, 'agentic-canvas-os/docs/PROMPT-PRESETS.md');
  assert.equal(preset.sourcePath, 'runtime/agents/docs/PROMPT-PRESETS.md');
  const admission = sources.find(row => row.fileName === 'UPSTREAM-DEPENDENCY-ADMISSION.md');
  assert.equal(admission.sourceRepository, 'huijoohwee/agentic-os');
  assert.equal(admission.sourcePath, 'runtime/agents/docs/UPSTREAM-DEPENDENCY-ADMISSION.md');
  const id = value => createHash('sha256').update(value).digest('hex').slice(0, 24);
  assert.equal(id(preset.canonicalPath), id('agentic-canvas-os/docs/PROMPT-PRESETS.md'));
  assert.equal(sources.find(row => row.fileName.startsWith('workspace-seeds/')).sourceRepository, 'huijoohwee/agentic-graph');
  for (const value of ['../SECRET', '/etc/passwd', 'FACTS.md', 'missing.md']) assert.throws(() => agentDocSourcePath(value), /Unknown/);
});

test('edge catalog uses six immutable native reads and keeps historical execution proof unavailable', async () => {
  requests.length = 0;
  const payload = await buildAgenticCanvasOsDocsDynamicResolutionPayload({ limit: 500 }, { fetchImpl: sourceFetch });
  assert.equal(requests.length, 6);
  assert.equal(payload.sourceRevision, revision);
  assert.equal(payload.ok, true);
  assert.ok(payload.catalog.length > 400);
  assert.ok(payload.catalog.every(row => row.sourceUrl.startsWith(`https://github.com/huijoohwee/agentic-os/blob/${revision}/catalog/dictionaries/`)));
  assert.equal(payload.liveAgentProviderProof.status, 'unavailable');
  assert.equal(payload.liveAgentProviderProof.sourceStatus, 'historical-snapshot');
  assert.equal(payload.progressiveAgentsReadiness.contractReady, false);
});

test('rollback publication reads the selected Graph source while preserving document IDs', async t => {
  const rollbackRoot = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'graph-docs-rollback-')));
  t.after(() => fs.rm(rollbackRoot, { recursive: true, force: true }));
  const paths = [...Object.values(GRAPH_DOC_PATHS).filter(value => value.endsWith('.md')),
    'docs/workspace-seeds/agentic-graph-ar-vr-xr-runtime-readiness-demo.md'];
  for (const sourcePath of paths) {
    const destination = path.join(rollbackRoot, sourcePath);
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.writeFile(destination, `prior release: ${sourcePath}\n`);
  }
  const records = await readRuntimeDocsSources({ docsRoot, graphRoot: rollbackRoot });
  const graphRecords = records.filter(record => record.sourceRepository === 'huijoohwee/agentic-graph');
  assert.equal(graphRecords.length, paths.length);
  for (const record of graphRecords) {
    assert.equal(record.bytes.toString(), `prior release: ${record.sourcePath}\n`);
    assert.equal(record.canonicalPath, `agentic-canvas-os/docs/${record.fileName}`);
  }
  assert.equal(records.find(record => record.fileName === 'PROMPT-PRESETS.md').sourceRepository,
    'huijoohwee/agentic-os');
});

test('edge catalog rejects missing, oversized and manifest-drifted source documents', async () => {
  await assert.rejects(buildAgenticCanvasOsDocsDynamicResolutionPayload({}, { fetchImpl: async () => new Response('', { status: 404 }) }), /unavailable/);
  await assert.rejects(buildAgenticCanvasOsDocsDynamicResolutionPayload({}, { fetchImpl: async () => new Response('x'.repeat(500_001)) }), /source bound/);
  await assert.rejects(buildAgenticCanvasOsDocsDynamicResolutionPayload({}, { fetchImpl: async url => {
    const response = await sourceFetch(url);
    return url.endsWith('/PROGRESSIVE-AGENTS.md') ? new Response((await response.text()) + '\ndrift') : response;
  } }), /source manifest/);
});
