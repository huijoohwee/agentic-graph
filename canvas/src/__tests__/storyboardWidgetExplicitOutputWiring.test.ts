import { finalizeEdgeAuthoring } from '@/features/edge-creation/authoring'
import { resolveStoryboardWidgetWorkflowDownstreamRunTargetIds } from '@/components/StoryboardWidgetCanvas/runtime/storyboardWidgetWorkflowDownstreamRunTargets'
import {
  ensureStoryboardWidgetWorkflowOutputEdge,
  WORKFLOW_OUTPUT_EDGE_MODE_MANUAL,
  WORKFLOW_OUTPUT_EDGE_MODE_PROPERTY,
} from '@/components/StoryboardWidgetCanvas/runtime/storyboardWidgetWorkflowRichMediaPanel'
import { PROBE_TREE_OUTPUT_KEY } from '@/components/StoryboardWidgetCanvas/runtime/storyboardWidgetProbeTreeLayout'
import { FLOW_EDGE_SOURCE_PORT_KEY, FLOW_EDGE_TARGET_PORT_KEY } from '@/lib/graph/flowPorts'
import { unwrapGraphCellValue } from '@/lib/graph/nodeProperties'
import { readSubgraphs, writeSubgraphs } from '@/lib/graph/subgraphs'
import type { GraphData, GraphNode } from '@/lib/graph/types'
import { buildStoryboardWidgetTextRunSourceState } from '@/components/StoryboardWidgetCanvas/runtime/storyboardWidgetTextRunSourceState'
import { buildRichMediaPanelOverlayState, resolveRichMediaPanelDisplayText } from '@/lib/render/richMediaPanelState'
import { createStoryboardWidgetTextOutputHarness as createTextOutputHarness } from '@/tests/lib/storyboardWidgetTextOutputHarness'
import { getCachedStoryboardWidgetOverlayEdgeGraph } from '@/components/StoryboardWidgetCanvas/runtime/storyboardWidgetRenderGraph'
import {
  applyWorkflowMaterializationGroupPanel,
  readWorkflowMaterializationParentNodeId,
  readWorkflowMaterializationProjectionSourceNodeId,
} from '@/lib/storyboardWidget/runMaterializationProjection'

export function testWorkflowOwnedOutputEdgeRepairsCanonicalPortMetadata() {
  const source: GraphNode = { id: 'source', type: 'TextGeneration', label: 'Widget Card', properties: {} }
  const panel: GraphNode = { id: 'panel', type: 'RichMediaPanel', label: 'Generated Result', properties: {} }
  let draft: GraphData = {
    type: 'Graph',
    nodes: [source, panel],
    edges: [{
      id: 'legacy-workflow-output',
      source: source.id,
      target: panel.id,
      label: 'generated-result',
      properties: {
        key: 'properties',
        type: 'object',
        value: {
          workflowOutputEdge: { key: 'workflowOutputEdge', type: 'boolean', value: true },
          workflowOutputAnchorNodeId: { key: 'workflowOutputAnchorNodeId', type: 'string', value: source.id },
          workflowOutputKey: { key: 'workflowOutputKey', type: 'string', value: 'generated-result' },
        },
      } as never,
    }],
  }
  const ensure = () => ensureStoryboardWidgetWorkflowOutputEdge({
    anchorNodeId: source.id,
    panelNodeId: panel.id,
    outputKey: 'generated-result',
    readLiveDraftGraphData: () => draft,
    commitDraftGraphDataUpdate: (_current, next) => { draft = next },
    scheduleWorkflowOutputEdgeRefresh: () => undefined,
  })

  if (!ensure()) throw new Error('expected legacy workflow output edge to be repaired')
  if (ensure()) throw new Error('expected canonical workflow output edge repair to be idempotent')
  const rawProperties = draft.edges[0]?.properties as unknown as { value?: Record<string, unknown> }
  const properties = rawProperties?.value || (rawProperties as unknown as Record<string, unknown>)
  if (
    properties[FLOW_EDGE_SOURCE_PORT_KEY] !== 'text_out'
    || properties[FLOW_EDGE_TARGET_PORT_KEY] !== 'output'
    || unwrapGraphCellValue(properties.workflowOutputEdge) !== true
  ) {
    throw new Error(`expected canonical text_out -> output metadata in the persisted edge container, got ${JSON.stringify(draft.edges[0])}`)
  }
}

export function testGenericTextRunPreservesSourceAndMaterializesConnectedPanel() {
  const source: GraphNode = {
    id: 'n3',
    type: 'TextGeneration',
    label: 'Widget Card',
    properties: {
      prompt: 'Generate a financial response for restaurant startup',
      summary: 'Keep this authored brief.',
      output: 'stale in-place provider output',
      outputModel: 'legacy-model',
    },
  }
  const harness = createTextOutputHarness({ type: 'Graph', nodes: [source], edges: [] })
  const generatedVersions = [
    '# Financial plan\n\n| Metric | Value |\n| --- | ---: |\n| Revenue | RM 100,000 |',
    '# Revised financial plan\n\n| Metric | Value |\n| --- | ---: |\n| Revenue | RM 120,000 |',
  ]

  for (let index = 0; index < 2; index += 1) {
    harness.publishers.publishTextRunOutputToRichMediaPanel({
      anchorNode: source,
      outputText: generatedVersions[index] || '',
      title: 'Widget Card',
      model: 'test-model',
      versionId: `run-${index + 1}`,
      versionCreatedAt: `2026-07-19T02:0${index}:00.000Z`,
      connectCreatedOutputToAnchor: true,
    })
  }

  const sourceProperties = buildStoryboardWidgetTextRunSourceState({
    properties: source.properties as Record<string, unknown>,
    loading: false,
    runAt: '2026-07-19T02:00:00.000Z',
    responseText: generatedVersions[1], title: source.label, model: 'test-model',
  })
  const published = harness.readGraph()
  const outputPanels = published.nodes.filter(node => node.type === 'RichMediaPanel')
  const outputEdges = published.edges.filter(edge => edge.properties?.workflowOutputEdge === true)
  const outputVersions = outputPanels[0]?.properties.outputVersions as Array<{ id?: unknown; output?: unknown }> | undefined
  const compactOptOutHarness = createTextOutputHarness({ type: 'Graph', nodes: [source], edges: [] })
  compactOptOutHarness.publishers.publishTextRunOutputToRichMediaPanel({
    anchorNode: source,
    outputText: generatedVersions[0] || '',
    title: 'Widget Card',
    model: 'test-model',
    panelProperties: { markdownWorkspaceViewerSurface: false },
    connectCreatedOutputToAnchor: true,
  })
  const compactOptOutPanel = compactOptOutHarness.readGraph().nodes.find(node => node.type === 'RichMediaPanel')
  if (
    sourceProperties.prompt !== 'Generate a financial response for restaurant startup'
    || sourceProperties.summary !== 'Keep this authored brief.'
    || sourceProperties.output !== generatedVersions[1]
    || sourceProperties.outputModel !== 'test-model'
    || sourceProperties.lastRunAt !== '2026-07-19T02:00:00.000Z'
    || published.nodes.length !== 2
    || outputPanels.length !== 1
    || outputPanels[0]?.properties.output !== generatedVersions[1]
    || outputPanels[0]?.properties.markdownWorkspaceViewerSurface !== true
    || compactOptOutPanel?.properties.markdownWorkspaceViewerSurface !== false
    || outputPanels[0]?.properties.workflowOutputAnchorNodeId !== source.id || outputPanels[0]?.properties.workflowOutputKey !== 'output'
    || outputVersions?.length !== 2 || outputVersions[0]?.id !== 'run-1'
    || outputVersions[0]?.output !== generatedVersions[0]
    || outputVersions[1]?.id !== 'run-2'
    || outputVersions[1]?.output !== generatedVersions[1]
    || outputPanels[0]?.properties.selectedOutputVersionId !== 'run-2'
    || outputEdges.length !== 1
    || outputEdges[0]?.source !== 'n3'
    || outputEdges[0]?.target !== outputPanels[0]?.id
    || outputEdges[0]?.properties?.[FLOW_EDGE_SOURCE_PORT_KEY] !== 'text_out'
    || outputEdges[0]?.properties?.[FLOW_EDGE_TARGET_PORT_KEY] !== 'output'
  ) {
    throw new Error(`expected generic text Run to preserve source input and reuse one connected Rich Media output, got ${JSON.stringify({ sourceProperties, published })}`)
  }
}

export function testExistingTextOutputBecomesSelectableVersionOnRerun() {
  const source: GraphNode = {
    id: 'source-existing',
    type: 'TextGeneration',
    label: 'Widget Card',
    properties: { prompt: 'Refine this report.' },
  }
  const panel: GraphNode = {
    id: 'panel-existing',
    type: 'RichMediaPanel',
    label: 'Rich Media Panel',
    properties: {
      output: '# Existing report\n\nVersion one.',
      outputSrcDoc: '<p>Stale latest-output snapshot.</p>',
      outputMimeType: 'text/markdown; charset=utf-8',
      outputModel: 'previous-model',
      lastRunAt: '2026-07-19T01:00:00.000Z',
      richMediaActiveTab: 'text',
    },
  }
  const graph: GraphData = {
    type: 'Graph',
    nodes: [source, panel],
    edges: [{ id: 'authored-existing-output', source: source.id, target: panel.id, label: 'output', properties: {} }],
  }
  const harness = createTextOutputHarness(graph)
  harness.publishers.publishTextRunOutputToRichMediaPanel({
    anchorNode: source,
    outputText: '# Revised report\n\nStreaming partial.',
    title: 'Rich Media Panel',
    model: 'current-model',
    versionId: 'run-current',
    versionCreatedAt: '2026-07-19T02:00:00.000Z',
    loading: true,
  })
  const streamingGraph = harness.readGraph()
  const streamingPanel = streamingGraph.nodes.find(node => node.id === panel.id)
  const streamingVersions = streamingPanel?.properties.outputVersions as Array<Record<string, unknown>> | undefined
  const streamingPanelState = streamingPanel ? buildRichMediaPanelOverlayState({ node: streamingPanel }) : undefined
  if (
    streamingPanel?.properties.selectedOutputVersionId !== 'run-current'
    || streamingVersions?.length !== 2
    || streamingVersions[1]?.id !== 'run-current'
    || streamingVersions[1]?.output !== '# Revised report\n\nStreaming partial.'
    || resolveRichMediaPanelDisplayText(streamingPanelState) !== '# Revised report\n\nStreaming partial.'
  ) {
    throw new Error(`expected a stable SSE run version to expose its live tail through the shared Rich Media Viewer surface, got ${JSON.stringify(streamingGraph)}`)
  }
  harness.publishers.publishTextRunOutputToRichMediaPanel({
    anchorNode: source,
    outputText: '# Revised report\n\nVersion two.',
    title: 'Rich Media Panel',
    model: 'current-model',
    versionId: 'run-current',
    versionCreatedAt: '2026-07-19T02:00:00.000Z',
  })

  const published = harness.readGraph()
  const publishedPanel = published.nodes.find(node => node.id === panel.id)
  const versions = publishedPanel?.properties.outputVersions as Array<Record<string, unknown>> | undefined
  const previousVersionPanel = publishedPanel
    ? buildRichMediaPanelOverlayState({
        node: {
          ...publishedPanel,
          properties: { ...publishedPanel.properties, selectedOutputVersionId: String(versions?.[0]?.id || '') },
        },
      })
    : undefined
  if (
    published.nodes.length !== 2
    || published.edges.length !== 1
    || published.edges[0]?.source !== source.id
    || published.edges[0]?.target !== panel.id
    || publishedPanel?.properties.output !== '# Revised report\n\nVersion two.'
    || versions?.length !== 2
    || versions[0]?.output !== '# Existing report\n\nVersion one.'
    || versions[0]?.outputModel !== 'previous-model'
    || versions[1]?.id !== 'run-current'
    || versions[1]?.output !== '# Revised report\n\nVersion two.'
    || publishedPanel?.properties.selectedOutputVersionId !== 'run-current'
    || resolveRichMediaPanelDisplayText(previousVersionPanel) !== '# Existing report\n\nVersion one.'
    || previousVersionPanel?.text !== '# Existing report\n\nVersion one.'
  ) {
    throw new Error(`expected rerun to retain the existing output as version one and preserve its authored edge, got ${JSON.stringify(published)}`)
  }
}

export function testExplicitMultiEdgesTargetWidgetCardAndRichMediaPanels() {
  const source: GraphNode = { id: 'source', type: 'TextGeneration', label: 'Probe child', properties: {} }
  const widgetTarget: GraphNode = { id: 'widget-target', type: 'TextGeneration', label: 'Widget Card', properties: { prompt: 'Continue with the inputs.' } }
  const panelA: GraphNode = { id: 'panel-a', type: 'RichMediaPanel', label: 'Panel A', properties: { workflowOutputAnchorNodeId: 'stale' } }
  const panelB: GraphNode = { id: 'panel-b', type: 'RichMediaPanel', label: 'Panel B', properties: { workflowOutputAnchorNodeId: 'stale' } }
  let graph: GraphData = { type: 'Graph', nodes: [source, widgetTarget, panelA, panelB], edges: [] }

  for (const targetNodeId of ['widget-target', 'panel-a', 'panel-b']) {
    const authored = finalizeEdgeAuthoring({
      mode: 'create', data: graph, schema: null, label: 'linksTo', selectedEdgeId: null,
      from: { nodeId: 'source', portKey: null }, to: { nodeId: targetNodeId, portKey: null },
    })
    if (authored.kind !== 'create') throw new Error(`expected an independent authored edge to ${targetNodeId}, got ${JSON.stringify(authored)}`)
    graph = { ...graph, edges: [...graph.edges, authored.edge] }
  }

  const downstreamIds = resolveStoryboardWidgetWorkflowDownstreamRunTargetIds({ node: source, graphData: graph })
  if (downstreamIds.join(',') !== 'widget-target,panel-a,panel-b') {
    throw new Error(`expected all explicit targets to remain independently actionable, got ${JSON.stringify(downstreamIds)}`)
  }

  const harness = createTextOutputHarness(graph)
  harness.publishers.publishTextRunOutputToRichMediaPanel({
    anchorNode: source,
    outputText: '# Generated result\n\nUse this result for the next action.',
    title: 'Generated Result',
    model: 'test-model',
    outputKey: 'probe-tree-generated-result',
    panelProperties: { probeTreeTerminalGeneration: true },
  })
  const published = harness.readGraph()
  const publishedWidget = published.nodes.find(node => node.id === 'widget-target')
  const publishedPanels = published.nodes.filter(node => node.id === 'panel-a' || node.id === 'panel-b')
  if (
    published.nodes.length !== 4
    || published.edges.length !== 3
    || publishedWidget?.properties.output
    || publishedPanels.length !== 2
    || publishedPanels.some(panel => panel.properties.output !== '# Generated result\n\nUse this result for the next action.')
    || publishedPanels.some(panel => panel.properties.workflowOutputAnchorNodeId || panel.properties.workflowOutputKey)
  ) {
    throw new Error(`expected explicit Rich Media targets only, with the Widget Card retained for downstream action, got ${JSON.stringify(published)}`)
  }
}

export function testGeneratedOutputsStayStandaloneUntilExplicitlyWired() {
  const firstSource: GraphNode = { id: 'child-a', type: 'TextGeneration', label: 'Probe child A', properties: {} }
  const secondSource: GraphNode = { id: 'child-b', type: 'TextGeneration', label: 'Probe child B', properties: {} }
  const unrelatedPanel: GraphNode = { id: 'empty-panel', type: 'RichMediaPanel', label: 'Rich Media Panel', properties: {} }
  const harness = createTextOutputHarness({ type: 'Graph', nodes: [firstSource, secondSource, unrelatedPanel], edges: [] })

  harness.publishers.publishTextRunOutputToRichMediaPanel({
    anchorNode: firstSource, outputText: '# Result A', title: 'Generated Result', model: 'test-model',
    outputKey: 'probe-tree-generated-result', outputGroupId: 'shared-thread', panelLabel: 'Generated Result',
  })
  harness.publishers.publishTextRunOutputToRichMediaPanel({
    anchorNode: secondSource, outputText: '# Result B', title: 'Generated Result', model: 'test-model',
    outputKey: 'probe-tree-generated-result', outputGroupId: 'shared-thread', panelLabel: 'Generated Result',
  })

  const published = harness.readGraph()
  const generatedPanels = published.nodes.filter(node => node.label === 'Generated Result')
  const anchors = generatedPanels.map(panel => String(panel.properties.workflowOutputAnchorNodeId || '')).sort()
  if (
    published.edges.length !== 0
    || generatedPanels.length !== 2
    || anchors.join(',') !== 'child-a,child-b'
    || generatedPanels.some(panel => panel.properties[WORKFLOW_OUTPUT_EDGE_MODE_PROPERTY] !== WORKFLOW_OUTPUT_EDGE_MODE_MANUAL)
    || published.nodes.find(node => node.id === 'empty-panel')?.properties.output
  ) {
    throw new Error(`expected one standalone manual output per selected child, got ${JSON.stringify(published)}`)
  }
}

export function testDeliverablesOwnedOutputsStayDistinctAndIdempotent() {
  const source: GraphNode = { id: 'deliverables-card', type: 'TextGeneration', label: 'Deliverables Widget Card', properties: {} }
  const authoredPanel: GraphNode = { id: 'authored-panel', type: 'RichMediaPanel', label: 'Authored target', properties: {} }
  const graph: GraphData = {
    type: 'Graph',
    nodes: [source, authoredPanel],
    edges: [{
      id: 'authored-edge',
      source: source.id,
      target: authoredPanel.id,
      label: 'output',
      properties: { [FLOW_EDGE_SOURCE_PORT_KEY]: 'text_out', [FLOW_EDGE_TARGET_PORT_KEY]: 'output' },
    }],
  }
  const harness = createTextOutputHarness(graph)
  for (let run = 1; run <= 2; run += 1) {
    const deckGraph = harness.publishers.publishTextRunOutputToRichMediaPanel({
      anchorNode: source,
      outputText: `# Deck ${run}\n\n---\n\n# Risks`,
      title: 'Slide Deck',
      outputKey: 'markdown-slide-deck',
      panelLabel: 'Slide Deck',
      outputIndex: 0,
      allowCreateStandaloneOutput: true,
      connectCreatedOutputToAnchor: true,
      ownedOutputOnly: true,
      deferPublishedGraphCommit: true,
    })
    if (!deckGraph) throw new Error('expected owned Slide Deck publication')
    const modelGraph = harness.publishers.publishTextRunOutputToRichMediaPanel({
      anchorNode: source,
      baseGraphData: deckGraph,
      outputText: `| Metric | Run |\n| --- | ---: |\n| Revenue | ${run} |`,
      title: 'Financial Model',
      outputKey: 'financial-model-spreadsheet',
      panelLabel: 'Financial Model',
      outputIndex: 1,
      allowCreateStandaloneOutput: true,
      connectCreatedOutputToAnchor: true,
      ownedOutputOnly: true,
      deferPublishedGraphCommit: true,
    })
    if (!modelGraph) throw new Error('expected owned Financial Model publication')
  }
  const published = harness.readGraph()
  const ownedPanels = published.nodes.filter(node => node.properties.workflowOutputAnchorNodeId === source.id)
  const ownedKeys = ownedPanels.map(node => String(node.properties.workflowOutputKey || '')).sort()
  const ownedEdges = published.edges.filter(edge => edge.properties?.workflowOutputEdge === true)
  const commitCounts = harness.readCommitCounts()
  if (
    published.nodes.length !== 4
    || published.edges.length !== 3
    || published.nodes.find(node => node.id === authoredPanel.id)?.properties.output
    || ownedPanels.length !== 2
    || ownedKeys.join(',') !== 'financial-model-spreadsheet,markdown-slide-deck'
    || ownedEdges.length !== 2
    || !ownedPanels.some(panel => String(panel.properties.output || '').includes('# Deck 2'))
    || !ownedPanels.some(panel => String(panel.properties.output || '').includes('| Revenue | 2 |'))
    || commitCounts.published !== 0
    || commitCounts.draft !== 4
  ) {
    throw new Error(`expected staged, distinct, idempotent owned outputs without intermediate durable publication, got ${JSON.stringify({ published, commitCounts })}`)
  }
}

export function testProbeTreeBranchesLedgerConnectsSourceIdempotently() {
  const source: GraphNode = { id: 'n1', type: 'TextGeneration', label: 'Widget Card', properties: {} }
  const branches: GraphNode[] = ['branch-a', 'branch-b'].map((id, index) => ({
    id,
    type: 'TextGeneration',
    label: `Branch ${index + 1}`,
    x: 860,
    y: index * 260,
    properties: {
      parentNodeId: source.id,
      probeTreeThreadRootId: source.id,
      cardTypeLabel: 'Probe-Tree Card',
      index: `P${index + 1}`,
    },
  }))
  const disconnectedLedger: GraphNode = {
    id: 'n2',
    type: 'RichMediaPanel',
    label: 'Probe-Tree Branches',
    x: 430,
    y: 0,
    properties: {
      workflowOutputAnchorNodeId: 'n1',
      workflowOutputKey: PROBE_TREE_OUTPUT_KEY,
      workflowOutputGroupId: 'probe-tree:n1',
      [WORKFLOW_OUTPUT_EDGE_MODE_PROPERTY]: WORKFLOW_OUTPUT_EDGE_MODE_MANUAL,
      probeTreeThreadLedger: true,
    },
  }
  const graph: GraphData = {
    type: 'Graph',
    nodes: [source, disconnectedLedger, ...branches],
    edges: branches.map((branch, index) => ({
      id: `candidate-${index + 1}`,
      source: source.id,
      target: branch.id,
      label: 'candidateOption',
      properties: {},
    })),
  }
  const harness = createTextOutputHarness(graph)

  for (let index = 0; index < 2; index += 1) harness.publishers.publishTextRunOutputToRichMediaPanel({
    anchorNode: source,
    outputText: '# Probe-Tree Branches\n\nConnected ledger.',
    title: 'Probe-Tree Branches',
    model: 'test-model',
    outputKey: PROBE_TREE_OUTPUT_KEY,
    outputGroupId: 'probe-tree:n1',
    outputThreadRootId: 'n1',
    panelLabel: 'Probe-Tree Branches',
    panelProperties: { probeTreeThreadLedger: true },
    materializationChildNodeIds: branches.map(branch => String(branch.id)),
    connectCreatedOutputToAnchor: true,
  })

  const published = harness.readGraph()
  const ledgers = published.nodes.filter(node => node.label === 'Probe-Tree Branches')
  const ledgerEdges = published.edges.filter(edge => edge.properties?.workflowOutputEdge === true)
  const candidateEdges = published.edges.filter(edge => edge.label === 'candidateOption')
  const outputGroups = readSubgraphs(published)
  const downstreamFromLedger = resolveStoryboardWidgetWorkflowDownstreamRunTargetIds({
    node: disconnectedLedger,
    graphData: published,
  })
  const overlayLookup = getCachedStoryboardWidgetOverlayEdgeGraph({
    graphData: published,
    graphRevision: 1,
    overlayNodeIds: published.nodes.map(node => String(node.id)),
  })
  const sourceRoundTrip = {
    ...published,
    edges: published.edges.map(edge => edge.label === 'candidateOption'
      ? { ...edge, properties: {} }
      : edge),
  }
  const sourceRoundTripOverlayLookup = getCachedStoryboardWidgetOverlayEdgeGraph({
    graphData: sourceRoundTrip,
    graphRevision: 2,
    overlayNodeIds: sourceRoundTrip.nodes.map(node => String(node.id)),
  })
  if (
    published.nodes.length !== 4
    || ledgers.length !== 1
    || ledgerEdges.length !== 1
    || ledgerEdges[0]?.source !== 'n1'
    || ledgerEdges[0]?.target !== 'n2'
    || ledgerEdges[0]?.label !== PROBE_TREE_OUTPUT_KEY
    || ledgerEdges[0]?.properties?.[FLOW_EDGE_SOURCE_PORT_KEY] !== 'text_out'
    || ledgerEdges[0]?.properties?.[FLOW_EDGE_TARGET_PORT_KEY] !== 'output'
    || ledgers[0]?.properties[WORKFLOW_OUTPUT_EDGE_MODE_PROPERTY]
    || candidateEdges.length !== 2
    || candidateEdges.some(edge => edge.source !== source.id)
    || candidateEdges.some(edge => readWorkflowMaterializationProjectionSourceNodeId(edge.properties) !== disconnectedLedger.id)
    || branches.some(branch => {
      const publishedBranch = published.nodes.find(node => node.id === branch.id)
      return publishedBranch?.properties.parentNodeId !== source.id
        || readWorkflowMaterializationParentNodeId(publishedBranch) !== disconnectedLedger.id
    })
    || downstreamFromLedger.length !== 0
    || candidateEdges.some(edge => (
      overlayLookup?.edges.find(rendered => rendered.id === edge.id)?.source !== disconnectedLedger.id
      || overlayLookup?.rawEdgeById.get(String(edge.id))?.source !== source.id
    ))
    || candidateEdges.some(edge => (
      sourceRoundTripOverlayLookup?.edges.find(rendered => rendered.id === edge.id)?.source !== disconnectedLedger.id
      || sourceRoundTripOverlayLookup?.rawEdgeById.get(String(edge.id))?.source !== source.id
    ))
    || outputGroups.length !== 1
    || outputGroups[0]?.autoBounds !== true
    || outputGroups[0]?.memberNodeIds.join(',') !== ['branch-a', 'branch-b', 'n2'].join(',')
    || outputGroups[0]?.memberNodeIds.includes(source.id)
  ) {
    throw new Error(`expected semantic source lineage with one generated-output Group Panel and no new Run edges, got ${JSON.stringify({ published, outputGroups, downstreamFromLedger, renderedEdges: overlayLookup?.edges, sourceRoundTripRenderedEdges: sourceRoundTripOverlayLookup?.edges })}`)
  }
}

export function testWorkflowMaterializationAdoptsExistingCollectiveGroupPanel() {
  const source: GraphNode = { id: 'source', type: 'TextGeneration', label: 'Source', properties: {} }
  const panel: GraphNode = { id: 'panel', type: 'RichMediaPanel', label: 'Generated panel', properties: {} }
  const childA: GraphNode = { id: 'child-a', type: 'TextGeneration', label: 'Child A', properties: {} }
  const childB: GraphNode = { id: 'child-b', type: 'TextGeneration', label: 'Child B', properties: {} }
  const graph = writeSubgraphs({
    type: 'Graph',
    nodes: [source, panel, childA, childB],
    edges: [],
  }, [{
    id: 'group-1',
    label: 'Group 1',
    memberNodeIds: [childA.id, childB.id],
    parentId: null,
    kind: 'subgraph',
    autoBounds: true,
  }])
  const grouped = applyWorkflowMaterializationGroupPanel({
    graphData: graph,
    projectionParentNodeId: panel.id,
    childNodeIds: [childA.id, childB.id],
    outputGroupId: 'probe-tree:source',
    groupLabel: 'Probe-Tree Branches outputs',
  })
  const rerun = applyWorkflowMaterializationGroupPanel({
    graphData: grouped,
    projectionParentNodeId: panel.id,
    childNodeIds: [childA.id, childB.id],
    outputGroupId: 'probe-tree:source',
    groupLabel: 'Probe-Tree Branches outputs',
  })
  const outputGroups = readSubgraphs(grouped)
  if (
    outputGroups.length !== 1
    || outputGroups[0]?.id !== 'group-1'
    || outputGroups[0]?.label !== 'Group 1'
    || outputGroups[0]?.memberNodeIds.join(',') !== ['child-a', 'child-b', 'panel'].join(',')
    || outputGroups[0]?.memberNodeIds.includes(source.id)
    || rerun !== grouped
  ) {
    throw new Error(`expected Run to adopt the exact existing collective Group Panel idempotently, got ${JSON.stringify(outputGroups)}`)
  }
}

export function testSelectedChildRunRestoresExplicitTargetFromCanonicalGraph() {
  const root: GraphNode = { id: 'n1', type: 'TextGeneration', label: 'Root', properties: {} }
  const selectedChild: GraphNode = {
    id: 'mcp-response-n1-qa1',
    type: 'TextGeneration',
    label: 'Selected Probe child',
    properties: { parentNodeId: 'n1', probeTreeThreadRootId: 'n1', cardTypeLabel: 'Probe-Tree Card' },
  }
  const generatedPanel: GraphNode = {
    id: 'generated-result',
    type: 'RichMediaPanel',
    label: 'Generated Result',
    properties: {
      workflowOutputAnchorNodeId: 'n1',
      workflowOutputKey: 'probe-tree-branches',
      workflowOutputGroupId: 'probe-tree:n1',
      [WORKFLOW_OUTPUT_EDGE_MODE_PROPERTY]: WORKFLOW_OUTPUT_EDGE_MODE_MANUAL,
    },
  }
  const systemPanel: GraphNode = {
    id: 'system-result',
    type: 'RichMediaPanel',
    label: 'System result',
    properties: { workflowOutputAnchorNodeId: 'mcp-response-n1-qa1', workflowOutputKey: 'probe-tree-generated-result' },
  }
  const runGraph: GraphData = {
    type: 'Graph',
    nodes: [root, selectedChild],
    edges: [{ id: 'candidate', source: 'n1', target: 'mcp-response-n1-qa1', label: 'candidateOption', properties: {} }],
  }
  const canonicalGraph: GraphData = {
    ...runGraph,
    nodes: [...runGraph.nodes, generatedPanel, systemPanel],
    edges: [
      ...runGraph.edges,
      { id: 'explicit-output', source: 'mcp-response-n1-qa1', target: 'generated-result', label: 'output', properties: {} },
      {
        id: 'system-output',
        source: 'mcp-response-n1-qa1',
        target: 'system-result',
        label: 'probe-tree-generated-result',
        properties: { value: { workflowOutputEdge: true } } as never,
      },
    ],
  }
  const harness = createTextOutputHarness(runGraph, canonicalGraph)

  harness.publishers.publishTextRunOutputToRichMediaPanel({
    anchorNode: selectedChild,
    baseGraphData: runGraph,
    outputText: '# Generated result\n\nOwned by the selected child.',
    title: 'Generated Result',
    model: 'test-model',
    outputKey: 'probe-tree-generated-result',
    outputGroupId: 'probe-tree:n1',
    panelProperties: { probeTreeTerminalGeneration: true },
  })

  const published = harness.readGraph()
  const panel = published.nodes.find(node => node.id === 'generated-result')
  const explicitEdge = published.edges.find(edge => edge.id === 'explicit-output')
  if (
    published.nodes.length !== 3
    || published.edges.length !== 2
    || explicitEdge?.source !== 'mcp-response-n1-qa1'
    || explicitEdge?.target !== 'generated-result'
    || panel?.properties.output !== '# Generated result\n\nOwned by the selected child.'
    || panel?.properties.workflowOutputAnchorNodeId
    || panel?.properties.workflowOutputKey
    || panel?.properties[WORKFLOW_OUTPUT_EDGE_MODE_PROPERTY]
  ) {
    throw new Error(`expected Run to restore only the selected child's explicit target edge, got ${JSON.stringify(published)}`)
  }
}

export {
  testRunAllReconcilesTypedPersistedStandaloneResult,
  testSelectedGenerationConnectsResultDuringRunAll,
} from './storyboardWidgetRunAllOutputWiring.test'
