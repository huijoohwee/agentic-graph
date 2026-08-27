import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  publishStoryboardWidgetAuthoredGraphMutation,
  resolveStoryboardWidgetPostCommitDraftGraphData,
} from '@/components/StoryboardWidgetCanvas/runtime/useStoryboardWidgetGraphActions'
import type { GraphData } from '@/lib/graph/types'
import { projectComposedGraphToSourceLayer } from '@/lib/graph/sourceLayers'
import { resolveStoryboardWidgetDraftGraphDataForBaseReset } from '@/lib/storyboardWidget/storyboardWidgetDraftGraphData'

export function testStoryboardWidgetPostCommitDraftKeepsComposedSourceAuthority() {
  const layerId = 'ws:caca068a'
  const parsedGraph: GraphData = {
    type: 'Graph',
    nodes: [{ id: 'n2', type: 'TextGeneration', label: 'Existing Widget', properties: {} }],
    edges: [],
    metadata: { graphDataRevision: 7 },
  }
  const staleDraft: GraphData = {
    ...parsedGraph,
    nodes: [...parsedGraph.nodes],
  }
  const committedNode = {
    id: `${layerId}::n18`,
    type: 'TextGeneration',
    label: 'Deliverables Widget Card',
    properties: {},
    metadata: { sourceLayerId: layerId },
  }
  const liveComposedGraph: GraphData = {
    type: 'Graph',
    nodes: [
      { ...parsedGraph.nodes[0]!, id: `${layerId}::n2`, metadata: { sourceLayerId: layerId } },
      committedNode,
    ],
    edges: [],
    metadata: { graphDataRevision: 8, sourceLayerComposition: 'compose' },
  }
  const resolved = resolveStoryboardWidgetPostCommitDraftGraphData({
    liveGraphData: liveComposedGraph,
    draftGraphData: staleDraft,
    fallbackGraphData: staleDraft,
    committedNode,
    revisionFloor: 8,
  })
  if (resolved !== liveComposedGraph) {
    throw new Error('expected the post-commit Storyboard draft to adopt the composed store graph that owns the committed node')
  }
  const projected = projectComposedGraphToSourceLayer({
    graphData: resolved,
    layer: {
      id: layerId,
      name: 'agenticgraph.md',
      enabled: true,
      parsedGraphData: parsedGraph,
    },
  })
  const projectedIds = (projected.nodes || []).map(node => String(node.id || '')).sort()
  if (JSON.stringify(projectedIds) !== JSON.stringify(['n18', 'n2'])) {
    throw new Error(`expected composed post-commit draft to project exactly one inner id per node, got ${JSON.stringify(projectedIds)}`)
  }
}

export function testStoryboardWidgetConsecutiveDropsPreservePendingDraftNodesAndEdges() {
  const layerId = 'ws:caca068a'
  const existingNode = {
    id: `${layerId}::n2`,
    type: 'TextGeneration',
    label: 'Existing Widget',
    properties: {},
    metadata: { sourceLayerId: layerId },
  }
  const firstPendingNode = {
    id: `${layerId}::n20`,
    type: 'TextGeneration',
    label: 'Widget Card',
    properties: {},
    metadata: { sourceLayerId: layerId },
  }
  const secondCommittedNode = {
    id: `${layerId}::n21`,
    type: 'TextGeneration',
    label: 'Deliverables Widget Card',
    properties: {},
    metadata: { sourceLayerId: layerId },
  }
  const previousBaseGraphData: GraphData = {
    type: 'Graph',
    nodes: [existingNode],
    edges: [],
    metadata: { graphDataRevision: 20, sourceLayerComposition: 'compose' },
  }
  const currentDraftGraphData: GraphData = {
    ...previousBaseGraphData,
    nodes: [existingNode, firstPendingNode],
    edges: [{
      id: `${layerId}::e20`,
      source: firstPendingNode.id,
      target: existingNode.id,
      type: 'Edge',
      label: '',
      properties: {},
    }],
    metadata: { ...previousBaseGraphData.metadata, graphDataRevision: 21 },
  }
  const secondLiveGraphData: GraphData = {
    ...previousBaseGraphData,
    nodes: [existingNode, secondCommittedNode],
    metadata: { ...previousBaseGraphData.metadata, graphDataRevision: 22 },
  }
  const resolved = resolveStoryboardWidgetPostCommitDraftGraphData({
    liveGraphData: secondLiveGraphData,
    draftGraphData: currentDraftGraphData,
    fallbackGraphData: currentDraftGraphData,
    committedNode: secondCommittedNode,
    revisionFloor: 22,
  })
  const nodeIds = resolved.nodes.map(node => String(node.id || '')).sort()
  if (JSON.stringify(nodeIds) !== JSON.stringify([`${layerId}::n2`, `${layerId}::n20`, `${layerId}::n21`].sort())) {
    throw new Error(`expected a second drop to retain the first pending card without canonical duplication, got ${JSON.stringify(nodeIds)}`)
  }
  if (resolved.edges.length !== 1 || String(resolved.edges[0]?.id || '') !== `${layerId}::e20`) {
    throw new Error('expected a second drop to retain pending authored edges while the source reparse catches up')
  }
  const afterRegressiveBaseReset = resolveStoryboardWidgetDraftGraphDataForBaseReset({
    activeDocumentKey: 'agenticgraph.md::',
    previousDocumentKey: 'agenticgraph.md::',
    currentDraftGraphData: resolved,
    nextBaseGraphData: secondLiveGraphData,
    previousBaseGraphData: currentDraftGraphData,
  })
  const afterResetNodeIds = (afterRegressiveBaseReset?.nodes || []).map(node => String(node.id || '')).sort()
  if (JSON.stringify(afterResetNodeIds) !== JSON.stringify(nodeIds) || afterRegressiveBaseReset?.edges.length !== 1) {
    throw new Error('expected pending append authority to survive a regressive base-reset effect after the second drop')
  }
  const forcedReset = resolveStoryboardWidgetDraftGraphDataForBaseReset({
    activeDocumentKey: 'agenticgraph.md::',
    previousDocumentKey: 'agenticgraph.md::',
    currentDraftGraphData: afterRegressiveBaseReset,
    nextBaseGraphData: secondLiveGraphData,
    previousBaseGraphData: currentDraftGraphData,
    forceBaseReset: true,
  })
  if (forcedReset !== secondLiveGraphData) {
    throw new Error('expected explicit history restoration to override pending append authority')
  }
  const caughtUpBaseGraphData: GraphData = {
    ...secondLiveGraphData,
    nodes: resolved.nodes,
    edges: resolved.edges,
    metadata: { ...secondLiveGraphData.metadata, graphDataRevision: 24 },
  }
  const caughtUpReset = resolveStoryboardWidgetDraftGraphDataForBaseReset({
    activeDocumentKey: 'agenticgraph.md::',
    previousDocumentKey: 'agenticgraph.md::',
    currentDraftGraphData: afterRegressiveBaseReset,
    nextBaseGraphData: caughtUpBaseGraphData,
    previousBaseGraphData: secondLiveGraphData,
  })
  if (caughtUpReset !== caughtUpBaseGraphData) {
    throw new Error('expected caught-up source authority to clear the temporary pending append guard')
  }
  const graphActionsSource = readFileSync(resolve(process.cwd(), 'src/components/StoryboardWidgetCanvas/runtime/useStoryboardWidgetGraphActions.ts'), 'utf8')
  if (!graphActionsSource.includes('mergeStoryboardWidgetDraftGraphDataWithLiveAdditions({')) {
    throw new Error('expected consecutive palette additions to use append-only canonical union instead of deletion-aware base reconciliation')
  }
}

export function testStoryboardWidgetAuthoredChainPublishesDurableDraftGraph() {
  const graphData: GraphData = {
    type: 'Graph',
    nodes: [
      { id: 'n1', type: 'TextGeneration', label: 'Widget Card n1', properties: {} },
      { id: 'n2', type: 'RichMedia', label: 'Rich Media Panel n1', properties: {} },
      { id: 'n3', type: 'TextGeneration', label: 'Widget Card n2', properties: {} },
    ],
    edges: [
      { id: 'e1', source: 'n1', target: 'n2', type: 'Edge', label: 'linksTo', properties: {} },
      { id: 'e2', source: 'n2', target: 'n3', type: 'Edge', label: 'linksTo', properties: {} },
    ],
  }
  const draftGraphDataRef: { current: GraphData | null } = { current: null }
  let renderedDraft: GraphData | null = null
  let persistedDraft: GraphData | null = null
  publishStoryboardWidgetAuthoredGraphMutation({
    nextGraphData: graphData,
    draftGraphDataRef,
    setDraftGraphData: next => { renderedDraft = next },
    persistDraftGraphData: next => { persistedDraft = next },
  })
  if (draftGraphDataRef.current !== graphData || renderedDraft !== graphData || persistedDraft !== graphData) {
    throw new Error('expected every authored node/edge mutation to publish the exact merged draft through the durable graph owner')
  }
  if (persistedDraft.nodes.length !== 3 || persistedDraft.edges.length !== 2) {
    throw new Error('expected the durable draft to retain the middle Rich Media Panel and both incident edges')
  }

  const runtimeSource = readFileSync(resolve(process.cwd(), 'src/components/StoryboardWidgetCanvas.runtime.tsx'), 'utf8')
  if (!runtimeSource.includes('persistDraftGraphData: persistPublishedStoryboardCardMediaGraphForSurface')) {
    throw new Error('expected palette node/edge mutations to use the shared durable graph persistence owner')
  }
  const graphActionsSource = readFileSync(resolve(process.cwd(), 'src/components/StoryboardWidgetCanvas/runtime/useStoryboardWidgetGraphActions.ts'), 'utf8')
  const authoredMutationPublicationCount = graphActionsSource.split('persistDraftGraphData: args.persistDraftGraphData').length - 1
  if (authoredMutationPublicationCount !== 2) {
    throw new Error(`expected both palette node and authored-edge mutations to persist, got ${authoredMutationPublicationCount} durable publication paths`)
  }
}
