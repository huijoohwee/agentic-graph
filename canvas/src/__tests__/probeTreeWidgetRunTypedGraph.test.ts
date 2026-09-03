import { buildProbeTreeCardFromGraphNode } from '@/components/StoryboardCanvas/storyboardProbeTreeInvocationAction'
import { runStoryboardWidgetProbeTreeInvocation } from '@/components/StoryboardWidgetCanvas/runtime/storyboardWidgetWorkflowProbeTreeRun'
import { createStoryboardWidgetWorkflowNodeRunner } from '@/components/StoryboardWidgetCanvas/runtime/storyboardWidgetWorkflowRunAction'
import { syncActiveMarkdownDocumentTextFromParsedGraph } from '@/hooks/store/graph-data-slice/graphDataFrontmatterFlowSync'
import { tryParseMarkdownFrontmatterFlowGraph } from '@/features/parsers/markdownFrontmatterFlowGraph'
import {
  getCachedStoryboardWidgetWorkflowNodeResolutionContext,
  resolveStoryboardWidgetWorkflowRunTarget,
} from '@/components/StoryboardWidgetCanvas/runtime/storyboardWidgetRenderGraph'
import type { GraphData, GraphNode } from '@/lib/graph/types'
import { resolveStoryboardWidgetDraftGraphDataForBaseReset } from '@/lib/storyboardWidget/storyboardWidgetDraftGraphData'
import { hashText } from '@/features/parsers/hash'
import { mergeRecoveredTextWidgetOutputGraphData } from '@/components/StoryboardWidgetCanvas/runtime/useTextWidgetOutputArtifactRecovery'
import { readGraphNodeProperties } from '@/lib/cards/graphNodeCardFields'
import { unwrapGraphCellValue } from '@/lib/graph/nodeProperties'
import { isStoryboardWidgetProbeTreeLineageOnlyRootNode } from '@/components/StoryboardWidgetCanvas/runtime/storyboardWidgetProbeTreeRunNode'

const cell = (key: string, type: string, value: unknown) => ({ key, type, value })

export function testStoryboardWidgetWorkflowRunTargetResolvesComposedOverlayIdAgainstInnerDraftNode() {
  const innerNode: GraphNode = {
    id: 'n18',
    type: 'TextGeneration',
    label: 'Deliverables Widget Card',
    properties: {},
  }
  const draftGraph: GraphData = {
    type: 'Graph',
    nodes: [innerNode],
    edges: [],
    metadata: { graphDataRevision: 18 },
  }
  const storeGraph: GraphData = {
    type: 'Graph',
    nodes: [{ ...innerNode, id: 'ws:caca068a::n18' }],
    edges: [],
    metadata: { graphDataRevision: 19, sourceLayerComposition: 'compose' },
  }
  const context = getCachedStoryboardWidgetWorkflowNodeResolutionContext({
    draftGraph,
    draftGraphRevision: 18,
    renderGraph: draftGraph,
    renderGraphRevision: 18,
    baseGraph: draftGraph,
    baseGraphRevision: 18,
    storeGraph,
    storeGraphRevision: 19,
    preferCurrentGraphDataRefs: true,
  })
  const resolved = resolveStoryboardWidgetWorkflowRunTarget({
    context,
    requestedNodeId: 'ws:caca068a::n18',
  })
  if (resolved?.node !== innerNode || resolved.resolvedNodeId !== 'n18' || resolved.writableNodeId !== 'n18') {
    throw new Error(`expected composed overlay Run identity to resolve the unique writable inner draft node, got ${JSON.stringify(resolved)}`)
  }
}

export async function testProbeTreeInvocationRoutesGenericCardBeforeSourceBackedFallback() {
  let graphData: GraphData = {
    type: 'Graph',
    nodes: [{
      id: 'runtime-gate',
      type: 'XrDemoValidation',
      label: 'Native Runtime Gate',
      properties: {
        prompt: '/sme-care-agent /agentic-graph.probe-tree Compare bounded SME retail options.',
      },
    }],
    edges: [],
  }
  const toasts: Array<{ message: string }> = []
  const runWorkflowNode = createStoryboardWidgetWorkflowNodeRunner({
    baseGraphKind: 'frontmatter-flow',
    baseGraphData: graphData,
    readDraftGraphData: () => graphData,
    commitDraftGraphDataUpdate: (_current, next) => { graphData = next },
    commitPublishedGraphData: next => { graphData = next },
    persistDraftGraphData: next => { graphData = next },
    renderGraphDataOverride: null,
    markdownDocumentName: null,
    markdownDocumentSourceUrl: null,
    widgetRegistry: [],
    appendDraftNode: args => {
      const id = String(args.id || `n${graphData.nodes.length + 1}`)
      graphData = {
        ...graphData,
        nodes: [...graphData.nodes, { ...args, id, properties: args.properties || {} } as GraphNode],
      }
      return id
    },
    updateNode: (id, patch) => {
      graphData = {
        ...graphData,
        nodes: graphData.nodes.map(node => String(node.id) === id ? { ...node, ...patch } : node),
      }
    },
    upsertUiToast: toast => { toasts.push(toast) },
    scheduleOverlayEdgeUpdate: () => undefined,
  })
  let errorMessage = ''
  try {
    await runWorkflowNode('runtime-gate', { propagateErrors: true })
  } catch (error) {
    errorMessage = error instanceof Error ? error.message : String(error || '')
  }
  const sourceBackedPanel = graphData.nodes.find(node => (
    unwrapGraphCellValue(node.type) === 'RichMediaPanel'
    && String(readGraphNodeProperties(node).output || '').includes('without a provider call')
  ))
  if (
    !errorMessage.startsWith('Probe-Tree LLM request failed:')
    || sourceBackedPanel
    || toasts.some(toast => toast.message === 'Generated source-backed Rich Media output.')
  ) {
    throw new Error(`expected a generic source card with an authored Probe-Tree command to use the invocation route before source-backed fallback, got ${JSON.stringify({ errorMessage, graphData, toasts })}`)
  }
}

export async function testProbeTreeWidgetRunResolvesTypedFrontmatterNodeIdentity() {
  const prompt = [
    '/sme-care-agent @source.frontmatter @source.body',
    '/agentic-graph.probe-tree',
    'Compare bounded branch priorities across user goal, source evidence, unresolved gap, and next decision without using the bubble-toolbar action.',
  ].join('\n')
  const typedNode = {
    id: cell('id', 'string', 'n1'),
    type: cell('type', 'string', 'TextGeneration'),
    label: cell('label', 'string', 'Widget Card'),
    position: cell('position', 'object', { x: 100, y: 200 }),
    properties: cell('properties', 'object', {
      summary: cell('summary', 'string', prompt),
      prompt: cell('prompt', 'string', ''),
      probeTreeDepth: cell('probeTreeDepth', 'number', 0),
    }),
  } as unknown as GraphNode
  const typedPanel = {
    id: cell('id', 'string', 'n2'),
    type: cell('type', 'string', 'RichMediaPanel'),
    label: cell('label', 'string', 'Rich Media Panel'),
    position: cell('position', 'object', { x: 620, y: 200 }),
    properties: cell('properties', 'object', {
      media_interactive: cell('media_interactive', 'boolean', true),
    }),
  } as unknown as GraphNode
  const acceptedBranches: GraphNode[] = [
    ['branch-market', 'Which market horizon should guide the comparison?'],
    ['branch-evidence', 'Which investment evidence should the comparison prioritize?'],
    ['branch-region', 'Which SE Asia economies should the comparison include?'],
  ].map(([id, summary], index) => ({
    id,
    type: 'TextGeneration',
    label: summary,
    x: 760,
    y: 80 + index * 180,
    properties: {
      cardTypeLabel: 'Probe-Tree Card',
      probeTreeResponseMode: 'llm-contract',
      parentNodeId: 'n1',
      parentGraphNodeId: 'n1',
      summary,
    },
  }))
  const graphData = {
    type: 'Graph',
    nodes: [typedNode, typedPanel, ...acceptedBranches],
    edges: [
      {
        id: cell('id', 'string', 'e1'),
        source: cell('source', 'string', 'n1'),
        target: cell('target', 'string', 'n2'),
        label: cell('label', 'string', 'output'),
        properties: cell('properties', 'object', {}),
      },
      ...acceptedBranches.map((branch, index) => ({
        id: `candidate-${index + 1}`,
        source: 'n1',
        target: String(branch.id),
        label: 'candidateOption',
        properties: {},
      })),
    ],
  } as unknown as GraphData

  const resolutionContext = getCachedStoryboardWidgetWorkflowNodeResolutionContext({
    draftGraph: graphData,
    draftGraphRevision: 0,
    renderGraph: null,
    renderGraphRevision: 0,
    baseGraph: graphData,
    baseGraphRevision: 0,
    storeGraph: null,
    storeGraphRevision: 0,
    preferCurrentGraphDataRefs: true,
  })
  const resolvedRunTarget = resolveStoryboardWidgetWorkflowRunTarget({
    context: resolutionContext,
    requestedNodeId: 'n1',
  })
  if (
    resolvedRunTarget?.node !== typedNode
    || resolvedRunTarget.resolvedNodeId !== 'n1'
    || resolvedRunTarget.writableNodeId !== 'n1'
  ) {
    throw new Error(`expected the shared Run dispatcher to resolve typed frontmatter identity n1, got ${JSON.stringify(resolvedRunTarget)}`)
  }

  const projectedCard = buildProbeTreeCardFromGraphNode(typedNode)
  if (projectedCard.id !== 'n1' || projectedCard.title !== 'Widget Card') {
    throw new Error(`expected typed frontmatter identity to normalize before Probe-Tree materialization, got ${JSON.stringify(projectedCard)}`)
  }

  let committedGraph: GraphData | null = null
  let publishedBaseGraph: GraphData | null | undefined
  let publishedLedgerConnection = false
  const result = runStoryboardWidgetProbeTreeInvocation({
    graphForRun: resolvedRunTarget.graphForRun,
    nodeIds: ['n1'],
    fallbackNode: resolvedRunTarget.node,
    onMaterialized: () => undefined,
    publishOutput: output => {
      committedGraph = output.baseGraphData || null
      publishedBaseGraph = output.baseGraphData
      publishedLedgerConnection = output.connectCreatedOutputToAnchor === true
      return committedGraph
    },
  })
  const resultGraph = result?.graphData || null
  const branchNodes = (resultGraph?.nodes || []).filter(node => node.properties.cardTypeLabel === 'Probe-Tree Card')
  const candidateEdges = (resultGraph?.edges || []).filter(edge => edge.source === 'n1' && edge.label === 'candidateOption')
  if (
    result?.changed
    || !committedGraph
    || publishedBaseGraph !== resultGraph
    || !publishedLedgerConnection
    || branchNodes.length !== 3
    || candidateEdges.length !== 3
    || branchNodes.some(node => node.properties.parentNodeId !== 'n1')
  ) {
    throw new Error(`expected typed frontmatter Widget Card Run to publish one visible Probe-Tree branch set and connected ledger, got ${JSON.stringify({ result, committedGraph, publishedBaseGraph, publishedLedgerConnection, branchNodes, candidateEdges })}`)
  }
  if (!isStoryboardWidgetProbeTreeLineageOnlyRootNode(resultGraph!, typedNode) || branchNodes.some(node => isStoryboardWidgetProbeTreeLineageOnlyRootNode(resultGraph!, node))) {
    throw new Error('expected Run All to treat only the superseded Probe-Tree root as lineage while each selected child owns its continuation')
  }
  // Mirror the live rerun: toolbar materialization already created the branch
  // nodes, while the legacy Rich Media panel still has no branch ledger.
  let runnerDraft = structuredClone(resultGraph)
  let terminalPublishedGraph: GraphData | null = null
  const runnerToasts: Array<{ message: string }> = []
  const runWorkflowNode = createStoryboardWidgetWorkflowNodeRunner({
    baseGraphKind: 'frontmatter-flow',
    baseGraphData: runnerDraft,
    readDraftGraphData: () => runnerDraft,
    commitDraftGraphDataUpdate: (_current, next) => {
      runnerDraft = next
    },
    commitPublishedGraphData: next => {
      terminalPublishedGraph = next
      runnerDraft = next
    },
    persistDraftGraphData: next => { runnerDraft = next },
    renderGraphDataOverride: null,
    markdownDocumentName: null,
    markdownDocumentSourceUrl: null,
    widgetRegistry: [],
    appendDraftNode: args => {
      const id = String(args.id || `n${runnerDraft.nodes.length + 1}`)
      runnerDraft = {
        ...runnerDraft,
        nodes: [...runnerDraft.nodes, { ...args, id, properties: args.properties || {} } as GraphNode],
      }
      return id
    },
    updateNode: (id, patch) => {
      runnerDraft = {
        ...runnerDraft,
        nodes: runnerDraft.nodes.map(node => String(node.id) === id ? { ...node, ...patch } : node),
      }
    },
    upsertUiToast: toast => { runnerToasts.push(toast) },
    scheduleOverlayEdgeUpdate: () => undefined,
  })
  let runErrorMessage = ''
  try {
    await runWorkflowNode('n1', { propagateErrors: true })
  } catch (error) {
    runErrorMessage = error instanceof Error ? error.message : String(error || '')
  }
  const runnerBranches = runnerDraft.nodes.filter(node => node.properties.cardTypeLabel === 'Probe-Tree Card')
  const runnerCandidateEdges = runnerDraft.edges.filter(edge => edge.source === 'n1' && edge.label === 'candidateOption')
  if (
    !runErrorMessage.includes('Probe-Tree LLM request failed:')
    || runnerBranches.length !== 3
    || runnerCandidateEdges.length !== 3
    || terminalPublishedGraph !== null
  ) {
    throw new Error(`expected the no-model Widget Run to fail closed while preserving the typed preview graph, got ${JSON.stringify({ runErrorMessage, runnerDraft, runnerToasts })}`)
  }

  const publishedGraph = {
    ...runnerDraft,
    context: 'frontmatter-flow',
    metadata: {
      ...(runnerDraft.metadata || {}),
      kind: 'frontmatter-flow',
      frontmatterFlowSettings: { direction: 'LR', edgeType: 'bezier' },
    },
  } as GraphData
  const sourceText = [
    '---',
    'flow:',
    '  nodes:',
    '    - id: {key: id, type: string, value: n1}',
    '      type: {key: type, type: string, value: TextGeneration}',
    '      label: {key: label, type: string, value: Widget Card}',
    '  edges: []',
    '---',
  ].join('\n')
  const sourceFiles = [{
    id: 'typed-probe-tree-run',
    enabled: true,
    name: 'run.md',
    text: sourceText,
    source: { kind: 'local', path: 'docs/run.md' },
    parsedGraphData: graphData,
    parsedGraphRevision: 4,
    parsedTextHash: 'old-source-hash',
  }] as never
  const sourceSync = syncActiveMarkdownDocumentTextFromParsedGraph({
    state: {
      markdownDocumentName: 'docs/run.md',
      markdownDocumentText: sourceText,
    } as never,
    sourceFiles,
    parsedGraphData: publishedGraph,
  })
  const publishedText = String(sourceSync.markdownDocumentText || '')
  const syncedSourceFile = sourceSync.sourceFiles[0]
  if (
    syncedSourceFile?.parsedGraphData !== publishedGraph
    || syncedSourceFile?.parsedGraphRevision !== 5
    || syncedSourceFile?.parsedTextHash !== hashText(publishedText)
  ) {
    throw new Error(`expected source text and parsed graph authority to publish atomically, got ${JSON.stringify(syncedSourceFile)}`)
  }
  if (!publishedText || publishedText.includes('[object Object]')) {
    throw new Error(`expected typed frontmatter cells to serialize as canonical values, got ${publishedText}`)
  }
  const idempotentSourceSync = syncActiveMarkdownDocumentTextFromParsedGraph({
    state: { markdownDocumentName: 'docs/run.md', markdownDocumentText: publishedText } as never,
    sourceFiles: sourceSync.sourceFiles,
    parsedGraphData: publishedGraph,
  })
  if (!idempotentSourceSync.accepted || Object.prototype.hasOwnProperty.call(idempotentSourceSync, 'markdownDocumentText')) {
    throw new Error(`expected an already-published Probe-Tree graph to remain an accepted no-op, got ${JSON.stringify(idempotentSourceSync)}`)
  }
  const reparsedGraph = tryParseMarkdownFrontmatterFlowGraph('run.md', publishedText)?.graphData || null
  const reparsedIds = new Set((reparsedGraph?.nodes || []).map(node => String(node.id || '')))
  const reparsedPanel = reparsedGraph?.nodes.find(node => unwrapGraphCellValue(node.type) === 'RichMediaPanel') || null
  if (
    !reparsedGraph
    || !reparsedIds.has('n1')
    || runnerBranches.some(node => !reparsedIds.has(String(node.id || '')))
    || !reparsedPanel
  ) {
    throw new Error(`expected persisted Probe-Tree output to remain visible after frontmatter reparse, got ${JSON.stringify(reparsedGraph)}`)
  }
  const projectedGraph = resolveStoryboardWidgetDraftGraphDataForBaseReset({
    activeDocumentKey: 'docs/run.md',
    previousDocumentKey: 'docs/run.md',
    currentDraftGraphData: publishedGraph,
    nextBaseGraphData: reparsedGraph,
    previousBaseGraphData: graphData,
  })
  if (
    !projectedGraph
    || projectedGraph.nodes.length !== reparsedGraph.nodes.length
    || !projectedGraph.nodes.some(node => node.type === 'RichMediaPanel')
  ) {
    throw new Error(`expected the source reparse handoff to preserve every published Probe-Tree node, got ${JSON.stringify(projectedGraph)}`)
  }
  const staleHigherRevisionBase = {
    ...graphData,
    metadata: { ...(graphData.metadata || {}), graphDataRevision: 50 },
  } as GraphData
  const locallyPublishedGraph = {
    ...publishedGraph,
    metadata: { ...(publishedGraph.metadata || {}), graphDataRevision: 1 },
  } as GraphData
  const graphDuringSourceReindex = resolveStoryboardWidgetDraftGraphDataForBaseReset({
    activeDocumentKey: 'docs/run.md',
    previousDocumentKey: 'docs/run.md',
    currentDraftGraphData: locallyPublishedGraph,
    nextBaseGraphData: staleHigherRevisionBase,
    previousBaseGraphData: graphData,
  })
  if (
    !graphDuringSourceReindex
    || graphDuringSourceReindex.nodes.length !== locallyPublishedGraph.nodes.length
    || !graphDuringSourceReindex.nodes.some(node => unwrapGraphCellValue(node.type) === 'RichMediaPanel')
  ) {
    throw new Error(`expected an unchanged higher-revision source base to preserve the locally published Probe-Tree superset during reindex, got ${JSON.stringify({ nodes: graphDuringSourceReindex?.nodes.map(node => node.id), metadata: graphDuringSourceReindex?.metadata })}`)
  }
  const scannedOneNodeGraph = {
    ...graphData,
    nodes: [typedNode],
    edges: [],
  } as GraphData
  const recoveredOneNodeGraph = {
    ...scannedOneNodeGraph,
    nodes: [{
      ...typedNode,
      properties: cell('properties', 'object', {
        summary: cell('summary', 'string', prompt),
        output: '# Recovered output',
        outputLoading: false,
      }),
    } as unknown as GraphNode],
  } as GraphData
  const recoveryMergedIntoPublishedGraph = mergeRecoveredTextWidgetOutputGraphData({
    scannedGraphData: scannedOneNodeGraph,
    latestGraphData: locallyPublishedGraph,
    recoveredGraphData: recoveredOneNodeGraph,
  })
  if (
    recoveryMergedIntoPublishedGraph.nodes.length !== locallyPublishedGraph.nodes.length
    || !recoveryMergedIntoPublishedGraph.nodes.some(node => unwrapGraphCellValue(node.type) === 'RichMediaPanel')
  ) {
    throw new Error(`expected delayed one-node artifact recovery to preserve the published Probe-Tree branch topology, got ${JSON.stringify(recoveryMergedIntoPublishedGraph)}`)
  }
}
