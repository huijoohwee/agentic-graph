import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync, realpathSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import type { GraphData } from '@/lib/graph/types'
import { validateWorkspaceManifest, loadWorkspaceManifest, selectedRepository, bindRetainedIndexSource, WORKSPACE_SCHEMA } from '../features/observability-workspace/host.mjs'

const manifest = () => ({ schema: WORKSPACE_SCHEMA, title: 'Workspace', readOnly: true, repositories: [{ id: 'graph', label: 'Graph', path: 'graph' }] })
test('workspace manifest accepts configurable repository counts and rejects mutation authority and duplicate identities', () => {
  assert.equal(validateWorkspaceManifest(manifest()).repositories.length, 1)
  assert.throws(() => validateWorkspaceManifest({ ...manifest(), readOnly: false }))
  assert.throws(() => validateWorkspaceManifest({ ...manifest(), repositories: [] }))
  assert.throws(() => validateWorkspaceManifest({ ...manifest(), repositories: Array(33).fill(manifest().repositories[0]) }))
  assert.throws(() => validateWorkspaceManifest({ ...manifest(), repositories: [...manifest().repositories, ...manifest().repositories] }))
})
test('workspace manifest accepts only an exact build revision on the native Graph repository', () => {
  const row = { id: 'agentic-graph', label: 'Graph', path: 'agentic-graph', buildRevision: 'a'.repeat(40) }
  const value = { ...manifest(), repositories: [row] }
  assert.equal(validateWorkspaceManifest(value).repositories[0].buildRevision, row.buildRevision)
  assert.throws(() => validateWorkspaceManifest({ ...manifest(), repositories: [{ ...row, buildRevision: 'main' }] }))
  assert.throws(() => validateWorkspaceManifest({ ...manifest(), repositories: [{ ...row, id: 'example' }] }))
})
test('workspace manifest refuses absolute, traversal and ambiguous repository paths', () => {
  for (const value of ['/tmp/repo', '../repo', 'repo/../other', './repo', 'repo\\other', 'repo//other']) {
    const input = manifest(); input.repositories[0].path = value
    assert.throws(() => validateWorkspaceManifest(input), value)
  }
})
test('build-only manifest reads tolerate absent siblings but serving and symlink escapes remain blocked', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'graph-observability-build-workspace-'))
  const outside = mkdtempSync(path.join(os.tmpdir(), 'graph-observability-build-outside-'))
  try {
    mkdirSync(path.join(root, 'graph'))
    const file = path.join(root, 'workspace.json')
    const value = { ...manifest(), repositories: [
      { id: 'agentic-graph', label: 'Graph', path: 'graph', buildRevision: 'a'.repeat(40) },
      { id: 'missing', label: 'Missing', path: 'missing' },
    ] }
    writeFileSync(file, JSON.stringify(value))
    assert.throws(() => loadWorkspaceManifest(file, root), /ENOENT/)
    const build = loadWorkspaceManifest(file, root, { allowMissingRepositories: true })
    assert.equal(selectedRepository(build, 'agentic-graph').resolved, realpathSync(path.join(root, 'graph')))
    assert.equal(build.repositories[1].resolved, null)
    assert.throws(() => selectedRepository(build, 'missing'), /unavailable in this host/)
    symlinkSync(outside, path.join(root, 'escape'))
    value.repositories[1].path = 'escape/missing'
    writeFileSync(file, JSON.stringify(value))
    assert.throws(() => loadWorkspaceManifest(file, root, { allowMissingRepositories: true }), /escapes/)
  } finally { rmSync(root, { recursive: true, force: true }); rmSync(outside, { recursive: true, force: true }) }
})
test('workspace host binds raw manifest bytes and rejects unknown IDs and symlink escapes', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'graph-observability-test-'))
  const outside = mkdtempSync(path.join(os.tmpdir(), 'graph-observability-outside-'))
  try {
    mkdirSync(path.join(root, 'graph'))
    const file = path.join(root, 'workspace.json'); writeFileSync(file, JSON.stringify(manifest()))
    const first = loadWorkspaceManifest(file, root)
    assert.equal(selectedRepository(first, 'graph').resolved, realpathSync(path.join(root, 'graph')))
    assert.throws(() => selectedRepository(first, 'other'))
    writeFileSync(file, JSON.stringify(manifest()) + '\n')
    assert.notEqual(loadWorkspaceManifest(file, root).digest, first.digest)
    rmSync(path.join(root, 'graph'), { recursive: true }); symlinkSync(outside, path.join(root, 'graph'))
    assert.throws(() => selectedRepository(first, 'graph'))
    assert.throws(() => loadWorkspaceManifest(file, root))
  } finally { rmSync(root, { recursive: true, force: true }); rmSync(outside, { recursive: true, force: true }) }
})
test('retained index rejects a workflow selection race instead of relabeling old evidence', () => {
  const result = { manifestDigest: 'a'.repeat(64), result: { snapshotDigest: 'b'.repeat(64) } }
  const source = { manifestDigest: result.manifestDigest, manifestText: JSON.stringify({ source: { repository: 'github.com/example/repo', revision: 'c'.repeat(40) } }) }
  assert.equal(bindRetainedIndexSource(result, source, result.manifestDigest).snapshotDigest, 'b'.repeat(64))
  assert.equal(bindRetainedIndexSource(result, source, result.manifestDigest).repository, undefined)
  assert.throws(() => bindRetainedIndexSource(result, { ...source, manifestDigest: 'd'.repeat(64) }, result.manifestDigest))
  assert.throws(() => bindRetainedIndexSource(result, source, 'd'.repeat(64)))
})
test('retained native acquisition binds only its own explicit identity and rejects credentials', () => {
  const result = { manifestDigest: 'a'.repeat(64), result: { snapshotDigest: 'b'.repeat(64), acquisition: { repositoryUrl: 'https://github.com/example/repo.git', commitSha: 'c'.repeat(40) } } }
  const source = { manifestDigest: result.manifestDigest, manifestText: JSON.stringify({ source: { repository: 'github.com/other/repo', revision: 'd'.repeat(40) } }) }
  assert.deepEqual(bindRetainedIndexSource(result, source, result.manifestDigest), { repository: 'github.com/example/repo', revision: 'c'.repeat(40), snapshotDigest: 'b'.repeat(64) })
  result.result.acquisition.repositoryUrl = 'https://secret:credential@github.com/example/repo'
  assert.throws(() => bindRetainedIndexSource(result, source, result.manifestDigest))
})

test('standalone observation renderer receives native defaults through a mutation-free store adapter', async () => {
  const { useGraphStore } = await import('@/features/observability-workspace/readOnlyGraphCanvasStore')
  const state = useGraphStore.getState()
  assert.equal(state.canvasPointerMode2d, 'select')
  assert.equal(state.viewportFitFillRatio, undefined)
  assert.equal(useGraphStore(current => current.schema), state.schema)
  assert.doesNotThrow(() => (state.clearZoomRequest as () => void)())
  assert.doesNotThrow(() => (state.setLifecycleStage as (value: string) => void)('zoomUpdate'))
  assert.deepEqual(state.schema, (await import('@/lib/graph/schema')).defaultSchema)
})

test('session index keeps native identities without DOM, storage or a retained workflow binding', async () => {
  assert.equal(typeof document, 'undefined')
  assert.equal(typeof indexedDB, 'undefined')
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'indexedDB')
  Object.defineProperty(globalThis, 'indexedDB', { configurable: true, get() { throw Error('Session indexing accessed browser storage') } })
  try {
    const { buildAgentGraphWorkspaceIndex, bindAgentGraphWorkspaceIndex } = await import('@/features/agent-graph/agentGraphWorkspaceIndex')
    const { AGENT_GRAPH_PROJECTION_DIRECTORY } = await import('@/features/agent-graph/agentGraphProjectionPolicy')
    const graphId = `kg:graph:${'a'.repeat(32)}`, snapshotDigest = 'b'.repeat(64)
    const graph: GraphData = { type: 'Graph', nodes: [], edges: [], metadata: { kind: 'agent-graph', agentGraphProjection: {
      owner: 'agent-graph-runtime', readOnly: true, complete: true, graphId, snapshotDigest,
      parserRegistryDigest: 'c'.repeat(64), counts: { sources: 0, nodes: 0, edges: 0 },
      projectionComplete: true, projectionTruncated: false, projectionLimit: 200,
    } } }
    const projectionPath = `${AGENT_GRAPH_PROJECTION_DIRECTORY}/${graphId.slice(9)}-${snapshotDigest}.json`
    const retained = buildAgentGraphWorkspaceIndex(graph, projectionPath)
    const session = buildAgentGraphWorkspaceIndex(graph, projectionPath, { retention: 'session' })
    assert.equal(session.path, retained.path)
    assert.equal(session.value.authority, false)
    assert.equal(session.value.graphId, graphId)
    assert.equal(session.value.snapshotDigest, snapshotDigest)
    assert.deepEqual(session.value.traversal, { graphId, expectedSnapshotDigest: snapshotDigest })
    assert.equal(session.value.observationBasis, 'session-import')
    const projection = session.value.projection as Record<string, unknown>
    assert.equal(projection.retention, 'session')
    assert.equal(projection.path, projectionPath)
    assert.equal(retained.value.observationBasis, 'first-retained-import')
    assert.equal(Object.hasOwn(retained.value.projection as object, 'retention'), false)
    const normalized = JSON.parse(session.text)
    delete normalized.projection.retention
    normalized.observationBasis = 'first-retained-import'
    assert.equal(JSON.stringify(normalized, null, 2) + '\n', retained.text, 'Default retained serialization remains unchanged')
    for (const invalid of ['/tmp/projection.json', projectionPath.replace(snapshotDigest, 'd'.repeat(64))])
      assert.throws(() => buildAgentGraphWorkspaceIndex(graph, invalid, { retention: 'session' }), /identified native snapshot/)
    assert.equal('reference' in session, false)
    await assert.rejects(bindAgentGraphWorkspaceIndex('workflow', session), /Session indexes cannot bind/)
  } finally {
    if (descriptor) Object.defineProperty(globalThis, 'indexedDB', descriptor)
    else Reflect.deleteProperty(globalThis, 'indexedDB')
  }
})
