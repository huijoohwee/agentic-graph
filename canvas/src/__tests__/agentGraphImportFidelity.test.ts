import assert from 'node:assert/strict'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { load } from 'js-yaml'
import { agentGraphResult, SOURCE_BACKED_INVOCATION } from './agentGraphWorkspaceArtifact.test'
import { buildAgentGraphCanvasProjection } from '@/features/agent-graph/agentGraphCanvasProjection'
import { materializeAgentGraphWorkspaceArtifact, retainAgentGraphWorkspaceProjection, readAgentGraphWorkspaceProjection, reopenAgentGraphWorkspaceProjection } from '@/features/agent-graph/agentGraphWorkspaceArtifact'
import { isReadOnlyAgentGraphProjection } from '@/features/agent-graph/agentGraphProjectionPolicy'
import { runLaunchImportAgentGraphFolder } from '@/lib/toolbar/launchImportDispatch'
import { getWorkspaceFs, resetWorkspaceFsForTests } from '@/features/workspace-fs/workspaceFs'
import { workspaceDocumentKey } from '@/features/workspace-fs/path'
import type { WorkspacePath } from '@/features/workspace-fs/types'
import { parseWorkspaceJsonGraphDataCached } from '@/hooks/active-graph-data/workspaceStructuredGraph'
import { useGraphStore } from '@/hooks/useGraphStore'
import { useMarkdownExplorerStore } from '@/features/markdown-explorer/store'
import { applyCanvasRenderBudget } from '@/lib/graph/canvasRenderBudget'
import { useStatsSelection } from '@/features/graph-stats/hooks/useStatsSelection'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import { bindAgentGraphWorkspaceIndex, readActiveAgentGraphWorkspaceIndex, retainAgentGraphWorkspaceIndex } from '@/features/agent-graph/agentGraphWorkspaceIndex'
import { agentMissionOverviewModel, agentMissionSpanImpact } from '@/features/agent-ready/agentMissionOverviewModel'
import { readRunTrace } from '@/features/agent-ready/missionControlProjection'
import { computeNodeVisual, computeEdgeVisual } from '@/components/GraphCanvas/highlight'
import { defaultSchema } from '@/lib/graph/schema'

export async function testFolderImportPersistsNativeArtifactAndCancellationPreservesGraph() {
  const { restore } = initJsdomHarness(), before = useGraphStore.getState()
  let artifactPath = ''
  try {
    resetWorkspaceFsForTests(); useGraphStore.getState().resetAll(); useGraphStore.getState().setSourceFiles([])
    await runLaunchImportAgentGraphFolder({
      bridge: { agentGraph: { importFolder: async () => agentGraphResult() }, materializeAgentGraphImport: async request => {
        assert.deepEqual(request.source, { kind: 'folder' }); assert.equal(request.repositoryUrl, undefined)
        const artifact = await materializeAgentGraphWorkspaceArtifact(request)
        artifactPath = artifact.path
        return artifact
      } }, resolveMcpInvocation: async () => ({ invocation: SOURCE_BACKED_INVOCATION }),
    })
    assert.ok(useGraphStore.getState().sourceFiles.some(file => file.source?.path === `workspace:${artifactPath}`))
    const text = await (await getWorkspaceFs()).readFileText(artifactPath as WorkspacePath)
    const header = load(text!.split('---')[1]!) as Record<string, unknown>
    assert.equal(header.source_kind, 'folder'); assert.equal(header.source_remote, null)
    assert.ok(header.source_projection)
    const index = await readActiveAgentGraphWorkspaceIndex()
    assert.ok(index?.path.startsWith('/.workspace/codebase-index/'))
    assert.equal(index?.value.snapshotDigest, agentGraphResult().snapshotDigest)
    assert.deepEqual(index?.value.traversal, { graphId: agentGraphResult().graphId, expectedSnapshotDigest: agentGraphResult().snapshotDigest })
    assert.equal((index?.value.projection as Record<string, unknown>).renderer, 'd3')
    assert.equal(index?.value.observation, null) // An older host never implies measured zero.
    const fs = await getWorkspaceFs(), beforeRepeat = await fs.listEntries()
    await retainAgentGraphWorkspaceIndex(buildAgentGraphCanvasProjection(agentGraphResult()), String(header.source_projection))
    assert.deepEqual(await fs.listEntries(), beforeRepeat)
    const first = await bindAgentGraphWorkspaceIndex('mission-first', index!)
    const second = await bindAgentGraphWorkspaceIndex('mission-second', index!)
    assert.notEqual(first.path, second.path)
    assert.equal(first.value.path, second.value.path)
    assert.equal(JSON.parse((await fs.readFileText(first.path))!).snapshotDigest, agentGraphResult().snapshotDigest)
    const graph = useGraphStore.getState().graphData, files = useGraphStore.getState().sourceFiles
    await assert.rejects(runLaunchImportAgentGraphFolder({ bridge: { agentGraph: { importFolder: async () => { throw new Error('cancelled') } } } }), /cancelled/)
    assert.equal(useGraphStore.getState().graphData, graph); assert.equal(useGraphStore.getState().sourceFiles, files)
  } finally { useGraphStore.setState(before); restore() }
}

export async function testRetainedJsonReopensEvidenceAndRejectsCorruption() {
  const { restore } = initJsdomHarness(), before = useGraphStore.getState()
  const previousPath = useMarkdownExplorerStore.getState().activePath
  try {
    resetWorkspaceFsForTests(); useGraphStore.getState().resetAll()
    const result = agentGraphResult()
    result.graphId = `kg:graph:${'4'.repeat(32)}`
    result.snapshotDigest = '5'.repeat(64)
    result.observation = { schema: 'agentic-graph-operation-observation/v1', operation: 'ingest', status: 'completed', elapsedMs: 17,
      cpu: { scope: 'node-process-window', userMs: 2, systemMs: 1, totalMs: 3 },
      memory: { scope: 'node-process-endpoint-samples', rssBeforeBytes: 100, rssAfterBytes: 120, heapUsedBeforeBytes: 50, heapUsedAfterBytes: 55 },
      output: { bytes: 500, basis: 'utf8-json-excluding-observation' },
      model: { id: null, calls: 0, promptTokens: 0, completionTokens: 0, costUsd: 0, scope: 'native-runtime-only' },
      sources: { parsed: 1, reused: 0, admittedBytes: 30 } }
    const original = buildAgentGraphCanvasProjection(result)
    const path = await retainAgentGraphWorkspaceProjection(original), fs = await getWorkspaceFs()
    const text = (await fs.readFileText(path as WorkspacePath))!, name = workspaceDocumentKey(path as WorkspacePath)
    // The same Source Files action used by the editor must restore the native graph.
    useGraphStore.getState().setMarkdownDocument('prior.md', '# Prior graph')
    useGraphStore.getState().setCanvas2dRenderer('storyboard')
    await reopenAgentGraphWorkspaceProjection(path, { graphId: result.graphId, snapshotDigest: result.snapshotDigest })
    assert.equal(useGraphStore.getState().markdownDocumentName, name)
    assert.equal(useMarkdownExplorerStore.getState().activePath, path)
    assert.equal(useGraphStore.getState().canvas2dRenderer, 'd3')
    const reopened = useGraphStore.getState().graphData!
    assert.ok(isReadOnlyAgentGraphProjection(reopened))
    assert.deepEqual(reopened.nodes, original.nodes); assert.deepEqual(reopened.edges, original.edges)
    assert.equal(reopened.metadata?.source, original.metadata?.source)
    assert.deepEqual((reopened.metadata?.agentGraphProjection as Record<string, unknown>).observation, result.observation)
    await retainAgentGraphWorkspaceIndex(reopened, path)
    assert.deepEqual((await readActiveAgentGraphWorkspaceIndex())?.value.observation, result.observation)
    const trace = readRunTrace({ schema: 'agent-toolkit-run/v1', runId: 'mission-economics', profile: { workflow: {} },
      spans: [
        { spanId: 'root', status: 'completed', timing: { inclusiveMs: 23 }, resources: { cpuMs: 9, peakMemoryBytes: 250, tokens: 5, costUsd: 0.01 } },
        { spanId: 'child', parentSpanId: 'root', status: 'completed', resources: { cpuMs: 4, peakMemoryBytes: 120, tokens: 3, costUsd: 0.005 } },
        { spanId: 'reuse', status: 'reused', resources: { cpuMs: 999, peakMemoryBytes: 999, tokens: 999, costUsd: 999 } },
      ] }, 'mission-economics')
    const overview = agentMissionOverviewModel(trace, (await readActiveAgentGraphWorkspaceIndex())!)
    assert.equal(overview.indexMetrics.find(row => row.id === 'index-tokens')?.value, '0 tokens')
    assert.equal(overview.indexMetrics.find(row => row.id === 'index-rss')?.value, '120 B')
    assert.equal(overview.workflowMetrics.find(row => row.id === 'mission-tokens')?.value, '5 tokens')
    assert.equal(overview.workflowMetrics.find(row => row.id === 'mission-rss')?.value, '250 B')
    assert.equal(overview.workflowMetrics.find(row => row.id === 'mission-time')?.value, '23 ms')
    assert.equal(overview.model, 'Native · no model calls')
    assert.ok(agentMissionOverviewModel(trace).indexMetrics.every(row => row.value === 'Unknown'))
    const separateClocks = { ...trace, spans: [...trace.spans, { ...trace.spans[0]!, spanId: 'another-root' }] }
    assert.equal(agentMissionOverviewModel(separateClocks).workflowMetrics.find(row => row.id === 'mission-time')?.value, 'Unknown')
    const impactGraph = { ...original, nodes: [...original.nodes, { id: 'unrelated', label: 'Other source', type: 'Symbol', properties: {} }] }
    const boundSpan = { ...trace.spans[0]!, component: { id: 'repo:alpha', revision: '', digest: result.snapshotDigest } }
    assert.deepEqual(agentMissionSpanImpact(boundSpan, impactGraph).nodeIds.sort(), ['repo:alpha', 'repo:beta'])
    assert.deepEqual(agentMissionSpanImpact(boundSpan, impactGraph).edgeIds, ['edge:alpha-beta'])
    const impact = agentMissionSpanImpact(boundSpan, impactGraph)
    const highlight = { data: impactGraph, schema: defaultSchema, selectedNodeId: null, selectedEdgeId: null,
      selectedNodeIds: impact.nodeIds, selectedEdgeIds: impact.edgeIds, renderMediaAsNodes: false, neighborIds: new Set<string>() }
    assert.equal(computeNodeVisual(impactGraph.nodes[0]!, highlight).opacity, 1)
    assert.equal(computeNodeVisual(impactGraph.nodes[2]!, highlight).opacity, 0.2)
    assert.equal(computeEdgeVisual(impactGraph.edges[0]!, highlight).opacity, 0.9)
    assert.equal(computeEdgeVisual({ ...impactGraph.edges[0]!, id: 'unrelated-edge' }, highlight).opacity, 0.2)
    assert.deepEqual(agentMissionSpanImpact({ ...boundSpan, component: { ...boundSpan.component, digest: 'f'.repeat(64) } }, impactGraph).nodeIds, [])
    assert.deepEqual(agentMissionSpanImpact({ ...boundSpan, component: { ...boundSpan.component, id: 'src/alpha.ts', digest: 'b'.repeat(64) } }, impactGraph).nodeIds.sort(), ['repo:alpha', 'repo:beta'])
    assert.deepEqual(agentMissionSpanImpact({ ...trace.spans[0]!, operation: 'src/alpha.ts' }, impactGraph).nodeIds, [])
    assert.equal(parseWorkspaceJsonGraphDataCached({ markdownName: name, markdownText: text }), null)
    const identity = original.metadata!.agentGraphProjection as { graphId: string; snapshotDigest: string }
    const corrupted = JSON.parse(text); corrupted.nodes[0].id = 'invalid\u0000id'
    await fs.writeFileText(path as WorkspacePath, JSON.stringify(corrupted), { mirrorToHost: false })
    await assert.rejects(readAgentGraphWorkspaceProjection(path, identity))
    await fs.writeFileText(path as WorkspacePath, text, { mirrorToHost: false })
    assert.equal(parseWorkspaceJsonGraphDataCached({ markdownName: 'generic.json', markdownText: JSON.stringify({ metadata: { agentGraphProjection: {} }, nodes: [], edges: [] }) }), null)
    const generic = parseWorkspaceJsonGraphDataCached({ markdownName: 'flow.json', markdownText: JSON.stringify({ nodes: [{ id: 'a', type: 'problem' }, { id: 'b', type: 'solution' }], edges: [{ source: 'a', target: 'b', type: 'solves' }] }) })
    assert.equal(generic?.nodes.length, 2)
  } finally { useMarkdownExplorerStore.getState().setActivePath(previousPath); useGraphStore.setState(before); restore() }
}

export function testRenderBudgetPrioritizesSelectionWithoutGrowing() {
  const graph = { ...buildAgentGraphCanvasProjection(agentGraphResult()), nodes: Array.from({ length: 800 }, (_, index) => ({ id: `n${index}`, label: `Node ${index}`, type: 'Symbol', properties: {} })), edges: [] }
  const initial = applyCanvasRenderBudget({ graphData: graph, surface: 'd3Graph' })!
  assert.equal(initial.nodes.length, 420); assert.ok(!initial.nodes.some(node => node.id === 'n799'))
  const focused = applyCanvasRenderBudget({ graphData: graph, surface: 'd3Graph', priorityNodeIds: ['n799'] })!
  assert.equal(focused.nodes.length, 420); assert.ok(focused.nodes.some(node => node.id === 'n799'))
  assert.equal(applyCanvasRenderBudget({ graphData: graph, surface: 'd3Graph' }), initial)
  assert.equal(graph.nodes.length, 800)
}

export async function testStatisticsKeepLoadedGraphAndSelectionScope() {
  const { restore } = initJsdomHarness(), before = useGraphStore.getState()
  const container = document.createElement('div'); document.body.append(container)
  const root = createRoot(container)
  let stats: ReturnType<typeof useStatsSelection> | undefined
  function Probe() { stats = useStatsSelection(); return React.createElement('span', null, stats.effectiveGraph?.nodes.length) }
  try {
    useGraphStore.getState().resetAll()
    const graph = { ...buildAgentGraphCanvasProjection(agentGraphResult()), nodes: Array.from({ length: 800 }, (_, index) => ({ id: `n${index}`, label: `Node ${index}`, type: 'Symbol', properties: {} })), edges: [] }
    useGraphStore.setState({ graphData: graph, graphDataRevision: 5, canvas2dRenderer: 'd3', canvasRenderMode: '2d' })
    await act(async () => { root.render(React.createElement(Probe)) })
    assert.equal(stats!.renderedGraph!.nodes.length, 420)
    assert.equal(stats!.effectiveGraph!.nodes.length, 800); assert.equal(stats!.datasetScopeLabel, 'Loaded graph')
    await act(async () => { useGraphStore.getState().selectNode('n799'); stats!.setStatsScope('selection') })
    assert.deepEqual(stats!.effectiveGraph!.nodes.map(node => node.id), ['n799'])
    assert.ok(stats!.renderedGraph!.nodes.some(node => node.id === 'n799'))
    await act(async () => { stats!.setStatsScope('dataset') })
    assert.equal(stats!.effectiveGraph!.nodes.length, 800)
  } finally { await act(async () => root.unmount()); container.remove(); useGraphStore.setState(before); restore() }
}
