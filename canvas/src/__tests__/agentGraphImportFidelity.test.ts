import assert from 'node:assert/strict'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { load } from 'js-yaml'
import { agentGraphResult, SOURCE_BACKED_INVOCATION } from './agentGraphWorkspaceArtifact.test'
import { buildAgentGraphCanvasProjection } from '@/features/agent-graph/agentGraphCanvasProjection'
import { materializeAgentGraphWorkspaceArtifact, retainAgentGraphWorkspaceProjection, readAgentGraphWorkspaceProjection } from '@/features/agent-graph/agentGraphWorkspaceArtifact'
import { isReadOnlyAgentGraphProjection } from '@/features/agent-graph/agentGraphProjectionPolicy'
import { runLaunchImportAgentGraphFolder } from '@/lib/toolbar/launchImportDispatch'
import { getWorkspaceFs, resetWorkspaceFsForTests } from '@/features/workspace-fs/workspaceFs'
import { workspaceDocumentKey } from '@/features/workspace-fs/path'
import type { WorkspacePath } from '@/features/workspace-fs/types'
import { parseWorkspaceJsonGraphDataCached } from '@/hooks/active-graph-data/workspaceStructuredGraph'
import { useGraphStore } from '@/hooks/useGraphStore'
import { applyCanvasRenderBudget } from '@/lib/graph/canvasRenderBudget'
import { useStatsSelection } from '@/features/graph-stats/hooks/useStatsSelection'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'

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
    const graph = useGraphStore.getState().graphData, files = useGraphStore.getState().sourceFiles
    await assert.rejects(runLaunchImportAgentGraphFolder({ bridge: { agentGraph: { importFolder: async () => { throw new Error('cancelled') } } } }), /cancelled/)
    assert.equal(useGraphStore.getState().graphData, graph); assert.equal(useGraphStore.getState().sourceFiles, files)
  } finally { useGraphStore.setState(before); restore() }
}

export async function testRetainedJsonReopensEvidenceAndRejectsCorruption() {
  const { restore } = initJsdomHarness(), before = useGraphStore.getState()
  try {
    resetWorkspaceFsForTests(); useGraphStore.getState().resetAll()
    const original = buildAgentGraphCanvasProjection(agentGraphResult())
    const path = await retainAgentGraphWorkspaceProjection(original), fs = await getWorkspaceFs()
    const text = (await fs.readFileText(path as WorkspacePath))!, name = workspaceDocumentKey(path as WorkspacePath)
    // The same Source Files action used by the editor must restore the native graph.
    await useGraphStore.getState().setActiveMarkdownDocument({ name, text, applyToGraph: true })
    await useGraphStore.getState().applyMarkdownDocumentToGraph(name, text, { force: true })
    const reopened = useGraphStore.getState().graphData!
    assert.ok(isReadOnlyAgentGraphProjection(reopened))
    assert.deepEqual(reopened.nodes, original.nodes); assert.deepEqual(reopened.edges, original.edges)
    assert.equal(reopened.metadata?.source, original.metadata?.source)
    assert.equal(parseWorkspaceJsonGraphDataCached({ markdownName: name, markdownText: text }), null)
    const identity = original.metadata!.agentGraphProjection as { graphId: string; snapshotDigest: string }
    const corrupted = JSON.parse(text); corrupted.nodes[0].id = 'invalid\u0000id'
    await fs.writeFileText(path as WorkspacePath, JSON.stringify(corrupted), { mirrorToHost: false })
    await assert.rejects(readAgentGraphWorkspaceProjection(path, identity))
    await fs.writeFileText(path as WorkspacePath, text, { mirrorToHost: false })
    assert.equal(parseWorkspaceJsonGraphDataCached({ markdownName: 'generic.json', markdownText: JSON.stringify({ metadata: { agentGraphProjection: {} }, nodes: [], edges: [] }) }), null)
    const generic = parseWorkspaceJsonGraphDataCached({ markdownName: 'flow.json', markdownText: JSON.stringify({ nodes: [{ id: 'a', type: 'problem' }, { id: 'b', type: 'solution' }], edges: [{ source: 'a', target: 'b', type: 'solves' }] }) })
    assert.equal(generic?.nodes.length, 2)
  } finally { useGraphStore.setState(before); restore() }
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
