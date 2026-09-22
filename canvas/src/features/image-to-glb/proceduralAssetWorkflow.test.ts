import assert from 'node:assert/strict'
import type { WorkspaceEntry, WorkspaceFs } from '@/features/workspace-fs/types'
import type { GraphData, GraphNode } from '@/lib/graph/types'
import { getNodeMediaSpec } from '@/lib/canvas/graph-elements/mediaSpec'
import { buildRichMediaPanelOverlayState } from '@/lib/render/richMediaPanelState'
import { createStoryboardWidgetWorkflowRichMediaPublishers } from '@/components/StoryboardWidgetCanvas/runtime/storyboardWidgetWorkflowRichMediaPublication'
import { resolveStoryboardWidgetAutoRunNodeIds } from '@/components/StoryboardWidgetCanvas/runtime/storyboardWidgetAutoRunTargets'
import { withGlbExporterFileReader } from '@/tests/lib/glbExporterFileReaderHarness'
import { createProceduralAssetFromText } from './proceduralAssetTextRecipe'
import { ProceduralAssetSession } from './proceduralAssetSession'
import { hasProceduralAssetRunInvocation, isProceduralAssetOutputPanel, resolveProceduralAssetRunInput } from './proceduralAssetWorkflowContract'
import { createProceduralAssetSourceFence, runProceduralAssetWorkflow, type ProceduralAssetSourceSnapshot } from './proceduralAssetWorkflow'

const card = (properties: Record<string, unknown>): GraphNode => ({ id: 'asset-request', label: 'My asset', type: 'TextGeneration', properties, x: 10, y: 20 }) as GraphNode
const source = () => card({ prompt: '/asset.create @text #procedural-asset\n\nblue robot', proceduralSeed: 17, text: 'Keep this authored input.' })

function memoryFs() {
  const entries = new Map<string, WorkspaceEntry>([['/', { path: '/', parentPath: null, kind: 'folder', name: '', updatedAtMs: 0 }]])
  const state = { afterWrite: undefined as (() => void) | undefined, fs: null as unknown as WorkspaceFs, entries }
  const add = (parentPath: string, name: string, kind: 'file' | 'folder', text?: string) => {
    const path = `${parentPath === '/' ? '' : parentPath}/${name}`
    assert.ok(!entries.has(path), 'generation creation must never overwrite')
    assert.equal(entries.get(parentPath)?.kind, 'folder')
    entries.set(path, { path, parentPath, name, kind, text, updatedAtMs: 0 })
    if (kind === 'file') state.afterWrite?.()
    return path
  }
  state.fs = {
    ensureSeed: async () => false,
    listEntries: async () => [...entries.values()],
    readFileText: async path => entries.get(path)?.text ?? null,
    writeFileText: async (path, text) => { assert.ok(entries.has(path)); entries.set(path, { ...entries.get(path)!, text }); state.afterWrite?.() },
    createFile: async ({ parentPath, name, text }) => add(parentPath, name, 'file', text),
    createFolder: async ({ parentPath, name }) => add(parentPath, name, 'folder'),
    deleteEntry: async path => { entries.delete(path) },
  }
  return state
}

function publicationFixture(node: GraphNode, allowCreate = true) {
  let graph = { type: 'Graph', nodes: [node], edges: [], metadata: {} } as GraphData
  const nodes = graph.nodes, byId = new Map(nodes.map(n => [n.id, n]))
  const context = { graphSemanticKey: 'procedural-workflow', draftGraph: graph, renderGraph: graph, baseGraph: graph, storeGraph: graph,
    draftNodes: nodes, renderNodes: nodes, baseNodes: nodes, storeNodes: nodes,
    draftNodeById: byId, renderNodeById: byId, baseNodeById: byId, storeNodeById: byId } as never
  const publishers = createStoryboardWidgetWorkflowRichMediaPublishers({
    context, graphForRun: graph, allowCreateRichMediaPanel: allowCreate,
    withRunLayoutMutationGuard: run => run(), scheduleWorkflowOutputEdgeRefresh: () => undefined,
    readLiveDraftGraphData: () => graph,
    appendDraftNode: () => { throw new Error('must use existing atomic transaction') },
    commitDraftGraphDataUpdate: (_previous, next) => { graph = next },
    commitPublishedGraphData: next => { graph = next },
    updateNode: () => { throw new Error('must use one canonical graph commit') },
    resolveNodeByIdAcrossGraphs: id => graph.nodes.find(n => n.id === id) || null,
  })
  return { publish: publishers.publishProceduralAssetRunOutputToRichMediaPanel, read: () => graph }
}

export function testProceduralWorkflowInvocationAndConnectedValues() {
  assert.equal(resolveProceduralAssetRunInput({ node: card({ prompt: '@text blue robot' }) }), null)
  assert.equal(resolveProceduralAssetRunInput({ node: card({ prompt: '/asset.create-extra blue robot' }) }), null)
  const node = source()
  const input = resolveProceduralAssetRunInput({ node, connectedValuesBySchemaPath: {
    'properties.prompt': { value: { key: 'prompt', type: 'string', value: 'green sphere' }, sources: [] },
    'properties.proceduralSeed': { value: 29, sources: [] },
  } })!
  assert.equal(input.intent, 'green sphere')
  assert.equal(input.seed, 29)
  assert.equal(resolveProceduralAssetRunInput({ node })!.intent, 'blue robot')
  const recipe = createProceduralAssetFromText('purple chair')
  const typed = resolveProceduralAssetRunInput({ node: card({ command: '/asset.create', proceduralRecipe: JSON.stringify(recipe) }) })!
  assert.deepEqual(JSON.parse(typed.recipe as string), recipe)
  assert.throws(() => resolveProceduralAssetRunInput({ node: card({ prompt: '/asset.create robot', proceduralSeed: true }) }), /seed/)
  assert.throws(() => resolveProceduralAssetRunInput({ node: card({ prompt: '/asset.create' }) }), /Describe/)
  const output = card({ proceduralAssetOutputPanel: { key: 'proceduralAssetOutputPanel', type: 'boolean', value: true }, prompt: '/asset.create robot' })
  assert.equal(isProceduralAssetOutputPanel(output.properties), true)
  assert.equal(hasProceduralAssetRunInvocation(output.properties), false)
  const graph = { nodes: [node, { ...output, id: 'existing-output' }], edges: [{ source: node.id, target: 'existing-output' }] } as GraphData
  assert.deepEqual(resolveStoryboardWidgetAutoRunNodeIds({ graphData: graph, nodeId: node.id }), [node.id])
}

export async function testProceduralWorkflowPublishesOwnedModel() {
  await withGlbExporterFileReader(async () => {
    const node = source(), original = JSON.stringify(node), fixture = publicationFixture(node), workspace = memoryFs()
    const input = resolveProceduralAssetRunInput({ node })!
    const run = () => runProceduralAssetWorkflow({ node, input, fs: workspace.fs, publish: fixture.publish,
      context: { documentId: '/authoring.md', parentPath: '/', isCurrent: () => true } })
    await run()
    const outputs = fixture.read().nodes.filter(n => isProceduralAssetOutputPanel(n.properties))
    assert.equal(outputs.length, 1)
    const output = outputs[0], props = output.properties as Record<string, unknown>
    assert.equal(props.proceduralAssetOutputAnchorNodeId, node.id)
    assert.equal(props.proceduralAssetSourcePath, '/authoring.md')
    assert.equal(props.richMediaActiveTab, 'model')
    assert.equal(props.imageGlbJob, undefined, 'text creation has no invented image evidence')
    assert.ok(String(props.modelUrl).startsWith('data:model/gltf-binary;base64,'))
    assert.ok(workspace.entries.has(String(props.proceduralAssetManifestPath)))
    const session = ProceduralAssetSession.restore(String(props.proceduralAssetDocument))
    try {
      assert.equal(session.snapshot.documentId, '/authoring.md#asset-request')
      assert.equal(session.snapshot.lastValid.intent, 'blue robot')
      assert.equal(session.snapshot.lastValid.seed, 17)
    } finally { session.dispose() }
    assert.equal(JSON.stringify(fixture.read().nodes.find(n => n.id === node.id)), original, 'source Card remains unchanged')
    assert.equal(getNodeMediaSpec(output)?.kind, 'model')
    const projected = buildRichMediaPanelOverlayState({ node: output, connectedValuesBySchemaPath: {
      'properties.modelUrl': { value: 'old-source.png', sources: [] },
    } })
    assert.equal(projected?.activeTab, 'model')
    assert.equal(projected?.hasModel, true)
    const firstManifest = String(props.proceduralAssetManifestPath)
    await run()
    assert.equal(fixture.read().nodes.length, 2)
    assert.equal(fixture.read().nodes[1].id, output.id, 'rerun keeps the same output identity')
    assert.equal(fixture.read().edges.length, 1, 'rerun keeps one canonical provenance edge')
    assert.equal((fixture.read().edges[0].properties as Record<string, unknown>).proceduralAssetOutputEdge, true)
    assert.notEqual((fixture.read().nodes[1].properties as Record<string, unknown>).proceduralAssetManifestPath, firstManifest)
    assert.ok(workspace.entries.has(firstManifest), 'prior committed generation remains recoverable')
  })
}

export async function testProceduralWorkflowRejectsStaleAndUnavailablePublication() {
  await withGlbExporterFileReader(async () => {
    const node = source(), input = resolveProceduralAssetRunInput({ node })!
    for (const scenario of ['stale', 'no-panel', 'invalid-recipe'] as const) {
      const fixture = publicationFixture(node, scenario !== 'no-panel'), workspace = memoryFs()
      let current = true, published = 0
      if (scenario === 'stale') workspace.afterWrite = () => { current = false }
      await assert.rejects(runProceduralAssetWorkflow({
        node, input: scenario === 'invalid-recipe' ? { ...input, recipe: { source: 'arbitrary()' } } : input,
        fs: workspace.fs,
        context: { documentId: '/authoring.md', parentPath: '/', isCurrent: () => current, onPublished: () => { published += 1 } },
        publish: fixture.publish,
      }))
      assert.equal(published, 0)
      assert.equal(fixture.read().nodes.length, 1)
      assert.equal(fixture.read().edges.length, 0)
      if (scenario === 'stale') assert.equal([...workspace.entries.keys()].some(path => path.endsWith('/manifest.json')), false)
      if (scenario === 'invalid-recipe') assert.equal(workspace.entries.size, 1, 'invalid construction creates no workspace files')
    }
  })
}

export function testProceduralWorkflowSourceFenceRejectsDocumentReuse() {
  const initial: ProceduralAssetSourceSnapshot = { documentId: '/a.md', documentText: 'source A', graph: {}, revision: 3, sourceRevision: 4 }
  let current = initial, listener: (() => void) | null = null, invalidations = 0, releases = 0
  const fence = createProceduralAssetSourceFence({
    read: () => current, subscribe: next => { listener = next; return () => { listener = null; releases += 1 } },
    onInvalidate: () => { invalidations += 1 },
  })
  assert.equal(fence.isCurrent(), true)
  current = { ...initial, documentId: '/b.md' }
  ;(listener as (() => void) | null)?.()
  current = initial
  assert.equal(fence.isCurrent(), false, 'returning to the same path cannot revive an old completion')
  assert.equal(fence.signal.aborted, true)
  assert.equal(invalidations, 1)
  fence.release(); fence.release()
  assert.equal(releases, 1)
  for (const changed of [{ revision: 4 }, { sourceRevision: 5 }, { graph: {} }, { documentText: 'edited source' }]) {
    current = initial
    const next = createProceduralAssetSourceFence({ read: () => current, subscribe: () => () => undefined, onInvalidate: () => undefined })
    current = { ...initial, ...changed }
    assert.equal(next.isCurrent(), false)
    next.release()
  }
}
