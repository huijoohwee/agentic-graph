import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createAgentToolkitRuntime, createAgentToolkitMemoryStore } from 'agentic-os/agents/toolkit'
import { createAgentResourceAdmission } from 'agentic-os/agents/toolkit-admission'
import { createAgentSwarmRuntime } from 'agentic-os/agents/swarm'
import { createAgentSwarmSqliteStore } from 'agentic-os/agents/sqlite-store'
import { startLocalAgentHost } from 'agentic-os/agents/local-host'
import { runLocalViteBrowserSmoke } from './lib/run-local-vite-browser-smoke.mjs'

const canvasRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const repositoryRoot = resolve(canvasRoot, '..')
const git = (...args) => execFileSync('git', ['-C', repositoryRoot, ...args], { encoding: 'utf8' }).trim()
const digest = value => createHash('sha256').update(value).digest('hex')
const ref = id => ({ id, revision: 'fixture-v1', digest: digest(id) })
const costLog = { model: 'deterministic-browser-fixture', prompt_tokens: 0, completion_tokens: 0, cache_hits: 0, estimated_cost_usd: 0 }
const token = principal => 'Bearer ' + digest('private-browser-fixture-' + principal)
const requireStatus = (value, status) => assert.equal(value.status, status, JSON.stringify(value))

async function run() {
  assert.equal(git('status', '--porcelain', '--untracked-files=all'), '', 'Browser proof requires a clean exact candidate')
  const head = git('rev-parse', 'HEAD'), root = await mkdtemp(join(tmpdir(), 'agent-mission-smoke-'))
  let host, stateStore
  try {
    const planPath = 'docs/documents/agentic-graph-agentic-os-prd-tad-adr-mvp-gtm.md'
    const plan = { repository: 'github.com/huijoohwee/agentic-graph', path: planPath, revision: head,
      digest: digest(await readFile(join(repositoryRoot, planPath))), continuityId: 'DURABLE-AGENT-WORKFLOWS-001',
      revisions: Object.fromEntries(['prd', 'tad', 'adr', 'mvp', 'gtm'].map(role => [role, '1.1.0'])) }
    const store = createAgentToolkitMemoryStore(), at = Date.now()
    const bounds = { inputTokens: 0, outputTokens: 0, attempts: 1, elapsedMs: 1000 }
    const cap = { inputTokens: 0, outputTokens: 0, attempts: 64, elapsedMs: 64000 }
    const allocation = { id: 'browser-fixture', revision: 'v1', windowId: String(at), startsAt: at, endsAt: at + 3600000,
      project: cap, agent: cap, run: cap, bounds, providerCostMicros: 0 }
    const resources = createAgentResourceAdmission({ stateStore: store, resolveContext: async context => {
      assert.deepEqual(context.plan, plan); return { context, allocation }
    } })
    const profile = { dataset: ref('fixture-cases'), evaluator: ref('fixture-contract'),
      metric: { ...ref('contract-completeness'), direction: 'maximize' } }
    const toolkit = createAgentToolkitRuntime({ stateStore: store, resources, maxRequestsPerWindow: 1000,
      authorize: async () => ({ allowed: true, authorizationId: 'fixture-only' }),
      evaluate: async ({ subject }) => ({ status: 'reported', score: 1, metric: profile.metric,
        evidence: { id: 'checked-' + subject.digest, digest: digest(subject.digest) }, costLog }) })
    for (const [runId, principalId, version] of [['baseline-run', 'owner', 'one'], ['candidate-run', 'owner', 'two'], ['private-run', 'other', 'two']]) {
      const access = { principalId }, context = { projectId: 'listing-project', goalId: 'review-listing', taskId: runId, plan }
      const reservation = await resources.reserve({ context, principalId, runId, agentId: 'listing-agent', operationId: 'fixture', phase: 'execute' })
      await resources.settle(reservation, principalId, { inputTokens: 0, outputTokens: 0, attempts: 1, elapsedMs: 1 })
      requireStatus(await toolkit.start({ runId, cohortId: 'listing-fixture', target: { kind: 'agent', ...ref('listing-agent') },
        candidate: { ...ref('listing-policy'), revision: version, digest: digest(version) }, adapter: ref('fixture-adapter'),
        operation: 'prepare-listing', profile, context }, access), 'running')
      const spans = [
        { spanId: 'root', kind: 'agent', operation: 'prepare-listing' },
        { spanId: 'draft-1', parentSpanId: 'root', kind: 'tool', operation: 'draft', taskId: 'draft', attempt: 1 },
        { spanId: 'draft-2', parentSpanId: 'root', kind: 'tool', operation: 'draft', taskId: 'draft', attempt: 2,
          links: [{ spanId: 'draft-1', kind: 'handoff' }] },
        { spanId: 'review', parentSpanId: 'root', kind: 'agent', operation: 'review',
          links: [{ spanId: 'draft-2', kind: 'dependency' }] },
        ...Array.from({ length: 30 }, (_, i) => ({ spanId: 'check-' + i, parentSpanId: 'root', kind: 'tool', operation: 'check-' + i })),
      ]
      for (const span of spans) requireStatus(await toolkit.startSpan({ runId, component: ref('listing-agent'), ...span }, access), 'running')
      for (const span of [...spans.slice(1), spans[0]]) {
        const failed = span.spanId === 'draft-1'
        const result = await toolkit.finishSpan({ runId, spanId: span.spanId, status: failed ? 'failed' : 'completed',
          ...(failed ? { reasonCode: 'fixture_retry' } : {}), effectId: span.spanId, costLog }, access)
        assert.notEqual(result.status, 'blocked', JSON.stringify(result))
      }
      requireStatus(await toolkit.complete({ runId, status: 'completed', operationId: 'complete', costLog }, access), 'completed')
    }
    stateStore = await createAgentSwarmSqliteStore({ directory: join(root, 'state') })
    const swarm = createAgentSwarmRuntime({ stateStore, toolkit })
    host = await startLocalAgentHost({ runtime: swarm, stateStore, resolveContext: async () => null,
      authenticate: ({ headers }) => ['owner', 'other'].find(id => headers.authorization === token(id))
        ? { principalId: headers.authorization === token('owner') ? 'owner' : 'other' } : null })
    const config = join(root, 'host.json')
    await writeFile(config, JSON.stringify({ endpoint: host.endpoint, authorization: token('owner') }), { mode: 0o600 })
    for (const [key, suffix] of Object.entries({ VITE_WORKSPACE_INITIALIZATION_DOCS_ABS_ROOT: 'docs',
      VITE_WORKSPACE_INITIALIZATION_AGENTIC_CANVAS_OS_DOCS_ABS_ROOT: 'canvas-docs',
      VITE_AGENTIC_OS_WORKSPACE_SEEDS_READ_ABS_ROOT: 'seeds', VITE_WORKSPACE_INITIALIZATION_CHAT_LOG_ABS_ROOT: 'chat' })) {
      process.env[key] = join(root, suffix); await mkdir(process.env[key])
    }
    Object.assign(process.env, { AGENTIC_OS_DURABLE_RUN_HOST_CONFIG: config, AG_MISSION_EXPECTED_HEAD: head,
      VITE_WORKSPACE_DOCS_MIRROR_STORAGE_FALLBACK_ENABLED: '0', VITE_WORKSPACE_SEED_SYNC_ENABLED: '0',
      VITE_AGENTIC_OS_GITHUB_WRITE_ENABLED: '0', VITE_AGENTIC_OS_GITHUB_WRITE_BASE_URL: '',
      VITE_AGENTIC_OS_STORAGE_BASE_URL: '', VITE_AGENTIC_OS_STORAGE_WORKSPACE_ID: '', VITE_AGENTIC_OS_STORAGE_CHAT_SESSION_TOKEN: '',
      AGENTIC_OS_SOURCE_REVISION: head })
    for (const key of ['VITE_AGENTIC_OS_OBSERVATION_PATH', 'VITE_AGENTIC_OS_SESSION_PATH', 'VITE_AGENTIC_OS_CSRF_HEADER']) delete process.env[key]
    process.chdir(canvasRoot)
    await runLocalViteBrowserSmoke({ logLabel: 'agent-mission-browser-smoke', devServerPort: '4191', devServerPath: '/',
      baseUrlEnvName: 'AG_MISSION_SMOKE_BASE_URL', verifierCommand: process.execPath,
      verifierArgs: ['scripts/verify_agent_mission_browser_smoke.mjs'], verifierFailureLabel: 'Agent mission browser smoke',
      prepareBeforeStart: false, devServerStartMode: 'vite-runner', existingServerPolicy: 'forbid' })
    assert.equal(git('rev-parse', 'HEAD'), head)
    assert.equal(git('status', '--porcelain', '--untracked-files=all'), '', 'Proof must preserve the source candidate')
  } finally { await host?.close(); stateStore?.close(); await rm(root, { recursive: true, force: true }) }
}
run().catch(error => { console.error(error); process.exitCode = 1 })
