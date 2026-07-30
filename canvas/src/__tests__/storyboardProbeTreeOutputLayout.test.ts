import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import {
  buildStoryboardWidgetProbeTreeOutputGroupId,
  normalizeAllStoryboardWidgetProbeTreeOutputLayouts,
  normalizeStoryboardWidgetProbeTreeOutputLayout,
  normalizeStoryboardWidgetProbeTreeThreadLayout,
  PROBE_TREE_GRAPH_LAYOUT_VERSION_PROPERTY,
  PROBE_TREE_OUTPUT_KEY,
  PROBE_TREE_OUTPUT_LAYOUT_VERSION,
  resolveStoryboardWidgetProbeTreeBranchPositions,
} from '@/components/StoryboardWidgetCanvas/runtime/storyboardWidgetProbeTreeLayout'
import { normalizeProbeTreeCandidateEdges } from '@/components/StoryboardWidgetCanvas/runtime/storyboardWidgetProbeTreeCandidateEdges'
import { resolveStoryboardWidgetWorkflowRichMediaPanelTargetNodeId } from '@/components/StoryboardWidgetCanvas/runtime/storyboardWidgetWorkflowRichMediaPanel'
import { applyStoryboardCanvasGraphPropertyAuthority } from '@/components/StoryboardWidgetCanvas/runtime/storyboardCanvasGraphAuthority'
import { resolveStoryboardWidgetOverlayEdgeGraphAuthority } from '@/components/StoryboardWidgetCanvas/runtime/storyboardWidgetOverlayEdgeGraphAuthority'
import {
  resolveFlowCanvasMediaOverlayGraphNode,
  resolveFlowCanvasMediaOverlayPinnedInCanvas,
  resolveFlowCanvasMediaOverlayWorldTopLeft2d,
} from '@/components/FlowCanvas/flowCanvasMediaOverlayWorldPoint'
import { readGraphNodeProperties } from '@/lib/cards/graphNodeCardFields'
import { FLOW_EDGE_SOURCE_PORT_KEY, FLOW_EDGE_TARGET_PORT_KEY } from '@/lib/graph/flowPorts'
import type { GraphData, GraphNode } from '@/lib/graph/types'
import {
  PROBE_TREE_BALANCED_LAYOUT_MODE,
  PROBE_TREE_BALANCED_LAYOUT_VERSION,
  PROBE_TREE_LAYOUT_MODE_PROPERTY,
  PROBE_TREE_LAYOUT_VERSION_PROPERTY,
  PROBE_TREE_PINNED_BY_DEFAULT_PROPERTY,
} from '@/lib/storyboardWidget/probeTreeLayoutContract'
import {
  WORKFLOW_OUTPUT_EDGE_MODE_MANUAL,
  WORKFLOW_OUTPUT_EDGE_MODE_PROPERTY,
} from '@/components/StoryboardWidgetCanvas/runtime/storyboardWidgetWorkflowOutputEdge'

const assert = (condition: unknown, message: string): void => {
  if (!condition) throw new Error(message)
}

const readPosition = (graphData: GraphData, nodeId: string): { x: number; y: number } => {
  const node = graphData.nodes.find(candidate => String(candidate.id) === nodeId)
  const x = Number(node?.x)
  const y = Number(node?.y)
  if (!Number.isFinite(x) || !Number.isFinite(y)) throw new Error(`expected finite position for ${nodeId}`)
  return { x, y }
}

const readThreadLayoutVersion = (graphData: GraphData, threadRootId: string): number => Number(
  ((graphData.metadata?.[PROBE_TREE_GRAPH_LAYOUT_VERSION_PROPERTY] || {}) as Record<string, Record<string, unknown>>)[threadRootId]?.version,
)

const assertProbeCardsDoNotOverlap = (graphData: GraphData, nodeIds: readonly string[]): void => {
  const cardWidth = 360
  const tallestSupportedCardHeight = 640
  for (let leftIndex = 0; leftIndex < nodeIds.length; leftIndex += 1) {
    const leftId = nodeIds[leftIndex]!
    const left = readPosition(graphData, leftId)
    for (let rightIndex = leftIndex + 1; rightIndex < nodeIds.length; rightIndex += 1) {
      const rightId = nodeIds[rightIndex]!
      const right = readPosition(graphData, rightId)
      const overlaps = Math.abs(left.x - right.x) < cardWidth && Math.abs(left.y - right.y) < tallestSupportedCardHeight
      assert(!overlaps, `expected ${leftId} and ${rightId} to remain disjoint even in the tallest supported card aspect`)
    }
  }
}

export function testProbeTreeThreadLayoutBuildsBalancedGridSnappedForwardCascade() {
  const branchSpecs = [
    ['a', 'root', 'P1'],
    ['b', 'root', 'P2'],
    ['c', 'root', 'P3'],
    ['a-1', 'a', 'P1'],
    ['a-2', 'a', 'P2'],
    ['b-1', 'b', 'P1'],
    ['b-2', 'b', 'P2'],
    ['c-1', 'c', 'P1'],
    ['c-2', 'c', 'P2'],
  ] as const
  const outsideNode = { id: 'outside', type: 'TextGeneration', label: 'Outside', x: -500, y: 900, properties: { lane: 'OTHER' } }
  const graphData: GraphData = {
    type: 'Graph',
    metadata: { kind: 'frontmatter-flow', frontmatterFlowSettings: { gridSize: 20 } },
    nodes: [
      { id: 'root', type: 'TextGeneration', label: 'Root', x: 13, y: 17, properties: { lane: 'SOURCE' } },
      ...branchSpecs.map(([id, parentNodeId, index]) => ({
        id,
        type: 'TextGeneration',
        label: id,
        x: 0,
        y: 0,
        properties: {
          cardTypeLabel: 'Probe-Tree Card',
          index,
          parentNodeId,
          parentGraphNodeId: parentNodeId,
          probeTreeThreadRootId: 'root',
        },
      })),
      outsideNode,
    ],
    edges: branchSpecs.map(([id, parentNodeId]) => ({
      id: `candidate-${id}`,
      source: parentNodeId,
      target: id,
      label: 'candidateOption',
      properties: {},
    })),
  }

  const normalized = normalizeStoryboardWidgetProbeTreeThreadLayout({ graphData, threadRootId: 'root' })
  const branchNodeIds = branchSpecs.map(([id]) => id)
  const branchPositions = branchNodeIds.map(nodeId => readPosition(normalized, nodeId))
  const distinctX = new Set(branchPositions.map(position => position.x))
  const distinctY = new Set(branchPositions.map(position => position.y))
  assert(distinctX.size >= 3, `expected a multi-column left-to-right cascade, got x=${JSON.stringify([...distinctX])}`)
  assert(distinctY.size >= 3, `expected a spread top-down waterfall, got y=${JSON.stringify([...distinctY])}`)
  assert(branchPositions.every(position => position.x % 20 === 0 && position.y % 20 === 0), `expected every generated card to snap to the configured 20px grid, got ${JSON.stringify(branchPositions)}`)
  assertProbeCardsDoNotOverlap(normalized, branchNodeIds)

  const minX = Math.min(...branchPositions.map(position => position.x))
  const maxX = Math.max(...branchPositions.map(position => position.x))
  const minY = Math.min(...branchPositions.map(position => position.y))
  const maxY = Math.max(...branchPositions.map(position => position.y))
  const aspectRatio = (maxX - minX + 360) / (maxY - minY + 203)
  assert(aspectRatio >= 0.5 && aspectRatio <= 2.5, `expected a balanced footprint rather than one long row or column, got aspect ${aspectRatio}`)

  const nodeById = new Map(normalized.nodes.map(node => [String(node.id), node]))
  for (const edge of normalized.edges.filter(edge => edge.label === 'candidateOption')) {
    const source = readPosition(normalized, String(edge.source))
    const target = readPosition(normalized, String(edge.target))
    assert(target.x > source.x, `expected forward-only edge ${String(edge.id)}, got ${source.x} -> ${target.x}`)
  }
  for (const nodeId of branchNodeIds) {
    const properties = nodeById.get(nodeId)?.properties || {}
    assert(properties[PROBE_TREE_LAYOUT_MODE_PROPERTY] === PROBE_TREE_BALANCED_LAYOUT_MODE, `expected ${nodeId} to carry balanced layout ownership`)
    assert(properties[PROBE_TREE_LAYOUT_VERSION_PROPERTY] === PROBE_TREE_BALANCED_LAYOUT_VERSION, `expected ${nodeId} to carry the current layout version`)
    assert(properties[PROBE_TREE_PINNED_BY_DEFAULT_PROPERTY] === true, `expected ${nodeId} to be pinned by default`)
  }
  assert(normalized.nodes.find(node => node.id === 'outside') === outsideNode, 'expected thread layout to leave unrelated nodes byte-identical')

  const repeated = normalizeStoryboardWidgetProbeTreeThreadLayout({ graphData: normalized, threadRootId: 'root' })
  assert(repeated === normalized, 'expected balanced thread normalization to be idempotent after the layout marker is current')

  const metadataWithoutGraphLayoutAuthority = { ...(normalized.metadata || {}) }
  delete metadataWithoutGraphLayoutAuthority[PROBE_TREE_GRAPH_LAYOUT_VERSION_PROPERTY]
  const nodeAuthorityOnly = { ...normalized, metadata: metadataWithoutGraphLayoutAuthority }
  const nodeAuthorityRepeated = normalizeStoryboardWidgetProbeTreeThreadLayout({ graphData: nodeAuthorityOnly, threadRootId: 'root' })
  assert(nodeAuthorityRepeated === nodeAuthorityOnly, 'expected valid node-level layout authority to remain idempotent when source projection omits graph metadata')

  const bPosition = readPosition(normalized, 'b')
  const corrupted: GraphData = {
    ...normalized,
    nodes: normalized.nodes.map(node => node.id === 'a' ? { ...node, x: bPosition.x, y: bPosition.y } : node),
  }
  const repaired = normalizeStoryboardWidgetProbeTreeThreadLayout({ graphData: corrupted, threadRootId: 'root' })
  assert(repaired !== corrupted, 'expected current markers not to hide overlapping or backward geometry')
  assertProbeCardsDoNotOverlap(repaired, branchNodeIds)
  for (const edge of repaired.edges.filter(edge => edge.label === 'candidateOption')) {
    assert(readPosition(repaired, String(edge.target)).x > readPosition(repaired, String(edge.source)).x, `expected corrupted edge ${String(edge.id)} to be repaired forward`)
  }

  const verticalThreadIds = Array.from({ length: 6 }, (_, index) => `vertical-${index + 1}`)
  const multiThreadGraph: GraphData = {
    ...normalized,
    nodes: [
      ...normalized.nodes,
      { id: 'root-b', type: 'TextGeneration', label: 'Root B', x: 3000, y: 0, properties: {} },
      ...verticalThreadIds.map((id, index) => ({
        id,
        type: 'TextGeneration',
        label: id,
        x: 3440,
        y: -1700 + index * 680,
        properties: { cardTypeLabel: 'Probe-Tree Card', index: `P${index + 1}`, parentNodeId: 'root-b', probeTreeThreadRootId: 'root-b' },
      })),
    ],
    edges: [
      ...normalized.edges,
      ...verticalThreadIds.map(id => ({ id: `edge-${id}`, source: 'root-b', target: id, label: 'candidateOption', properties: {} })),
    ],
  }
  const balancedSecondThread = normalizeStoryboardWidgetProbeTreeThreadLayout({ graphData: multiThreadGraph, threadRootId: 'root-b' })
  assert(new Set(verticalThreadIds.map(id => readPosition(balancedSecondThread, id).x)).size >= 2, 'expected thread A authority not to preserve thread B as one vertical strip')
  assert(readThreadLayoutVersion(balancedSecondThread, 'root') === PROBE_TREE_BALANCED_LAYOUT_VERSION, 'expected thread A layout authority to remain intact')
  assert(readThreadLayoutVersion(balancedSecondThread, 'root-b') === PROBE_TREE_BALANCED_LAYOUT_VERSION, 'expected thread B to receive independent layout authority')
  assert(balancedSecondThread.nodes.find(node => node.id === 'a') === normalized.nodes.find(node => node.id === 'a'), 'expected balancing thread B not to rewrite thread A nodes')
}

export function testProbeTreeOutputPanelPrecedesGrowingBranchColumnsIdempotently() {
  const layoutProperties = {
    cardTypeLabel: 'Probe-Tree Card',
    probeTreeThreadRootId: 'root',
    [PROBE_TREE_LAYOUT_MODE_PROPERTY]: PROBE_TREE_BALANCED_LAYOUT_MODE,
    [PROBE_TREE_LAYOUT_VERSION_PROPERTY]: PROBE_TREE_BALANCED_LAYOUT_VERSION,
    [PROBE_TREE_PINNED_BY_DEFAULT_PROPERTY]: true,
  }
  const graphData: GraphData = {
    type: 'Graph',
    metadata: { kind: 'frontmatter-flow', frontmatterFlowSettings: { gridSize: 20 } },
    nodes: [
      { id: 'root', type: 'TextGeneration', label: 'Root', x: 0, y: 0, properties: {} },
      { id: 'branch', type: 'TextGeneration', label: 'Branch', x: 860, y: 0, properties: { ...layoutProperties, parentNodeId: 'root', index: 'P1' } },
      { id: 'deep-branch', type: 'TextGeneration', label: 'Deep branch', x: 1300, y: 140, properties: { ...layoutProperties, parentNodeId: 'branch', index: 'P1' } },
      {
        id: 'panel',
        type: 'RichMediaPanel',
        label: 'Probe-Tree Branches',
        x: 520,
        y: 0,
        properties: {
          workflowOutputAnchorNodeId: 'deep-branch',
          workflowOutputKey: PROBE_TREE_OUTPUT_KEY,
          workflowOutputGroupId: buildStoryboardWidgetProbeTreeOutputGroupId('root'),
          probeTreeOutputLayoutVersion: PROBE_TREE_OUTPUT_LAYOUT_VERSION,
          probeTreeOutputRightmostBranchX: 440,
        },
      },
    ],
    edges: [
      { id: 'candidate-branch', source: 'root', target: 'branch', label: 'candidateOption', properties: {} },
      { id: 'candidate-deep', source: 'branch', target: 'deep-branch', label: 'candidateOption', properties: {} },
      { id: 'stale-backtrack', source: 'deep-branch', target: 'panel', label: PROBE_TREE_OUTPUT_KEY, properties: { workflowOutputEdge: true } },
    ],
  }

  const normalized = normalizeStoryboardWidgetProbeTreeOutputLayout({ graphData, threadRootId: 'deep-branch' })
  const panel = normalized.nodes.find(node => node.id === 'panel')
  const rootX = readPosition(normalized, 'root').x
  const leftmostBranchX = Math.min(readPosition(normalized, 'branch').x, readPosition(normalized, 'deep-branch').x)
  assert(panel?.x === rootX + 440, `expected the shared ledger in the first downstream coordinator lane, got ${String(panel?.x)}`)
  assert(Number(panel?.x) % 20 === 0, `expected the ledger to remain grid snapped, got ${String(panel?.x)}`)
  assert(Number(panel?.x) > rootX && Number(panel?.x) < leftmostBranchX, 'expected the ledger between the source and its growing branch columns')
  assert(!normalized.edges.some(edge => edge.id === 'stale-backtrack'), 'expected stale backward output edges to be removed during terminal normalization')
  for (const edge of normalized.edges) {
    const source = readPosition(normalized, String(edge.source))
    const target = readPosition(normalized, String(edge.target))
    assert(target.x > source.x, `expected every retained Probe-Tree edge to remain forward-only, got ${String(edge.id)}`)
  }

  const repeated = normalizeStoryboardWidgetProbeTreeOutputLayout({ graphData: normalized, threadRootId: 'root' })
  assert(repeated === normalized, 'expected coordinator-ledger normalization to be idempotent once the thread has settled')
}

export function testProbeTreeLayoutOwnershipSurvivesCanonicalPropertyProjection() {
  const graphData: GraphData = {
    type: 'Graph',
    nodes: [
      { id: 'root', type: 'TextGeneration', label: 'Root', x: 0, y: 0, properties: {} },
      { id: 'branch', type: 'TextGeneration', label: 'Branch', x: 0, y: 0, properties: { cardTypeLabel: 'Probe-Tree Card', parentNodeId: 'root', probeTreeThreadRootId: 'root' } },
      { id: 'panel', type: 'RichMediaPanel', label: 'Probe-Tree Branches', x: 520, y: 0, properties: { workflowOutputAnchorNodeId: 'root', workflowOutputKey: PROBE_TREE_OUTPUT_KEY } },
    ],
    edges: [{ id: 'candidate', source: 'root', target: 'branch', label: 'candidateOption', properties: {} }],
  }
  const normalized = normalizeStoryboardWidgetProbeTreeOutputLayout({ graphData, threadRootId: 'root' })
  const canonicalProperties = {
    ...graphData,
    nodes: graphData.nodes.map(node => ({ ...node, properties: { ...(node.properties || {}), canonicalField: true } })),
  }
  const projected = applyStoryboardCanvasGraphPropertyAuthority({
    graphData: normalized,
    propertyAuthorityGraphData: canonicalProperties,
  })
  const branch = projected?.nodes.find(node => node.id === 'branch')
  const properties = readGraphNodeProperties(branch)
  assert(properties.canonicalField === true, 'expected canonical content properties to retain authority')
  assert(properties[PROBE_TREE_LAYOUT_MODE_PROPERTY] === PROBE_TREE_BALANCED_LAYOUT_MODE, 'expected runtime layout ownership to be restored after canonical property projection')
  assert(properties[PROBE_TREE_LAYOUT_VERSION_PROPERTY] === PROBE_TREE_BALANCED_LAYOUT_VERSION, 'expected runtime layout version to survive the final Storyboard authority stage')
  assert(Number(branch?.x) > Number(projected?.nodes.find(node => node.id === 'root')?.x), 'expected projected Probe branch geometry to remain left-to-right')

  const corruptedEdgeGraph: GraphData = {
    ...projected!,
    edges: projected!.edges.map(edge => edge.label === 'candidateOption' ? { ...edge, source: 'branch' } : edge),
  }
  const canonicalized = applyStoryboardCanvasGraphPropertyAuthority({
    graphData: corruptedEdgeGraph,
    propertyAuthorityGraphData: corruptedEdgeGraph,
  })!
  const candidateEdges = canonicalized.edges.filter(edge => edge.label === 'candidateOption')
  assert(candidateEdges.length === 1 && candidateEdges[0]?.source === 'root' && candidateEdges[0]?.target === 'branch', `expected graph authority to rebuild one declared-parent candidate edge, got ${JSON.stringify(candidateEdges)}`)
  assert(readPosition(canonicalized, String(candidateEdges[0]!.target)).x > readPosition(canonicalized, String(candidateEdges[0]!.source)).x, 'expected canonical candidate edge geometry to stay forward-only')
}

export function testProbeTreeOverlayEdgesUseNormalizedStoryboardGraphAuthority() {
  const sourceGraph: GraphData = {
    type: 'Graph',
    nodes: [
      { id: 'root', type: 'TextGeneration', label: 'Root', x: 0, y: 0, properties: {} },
      {
        id: 'branch',
        type: 'TextGeneration',
        label: 'Branch',
        x: 440,
        y: 0,
        properties: {
          cardTypeLabel: 'Probe-Tree Card',
          parentNodeId: 'root',
          probeTreeThreadRootId: 'root',
        },
      },
    ],
    edges: [],
  }
  const renderedGraph = applyStoryboardCanvasGraphPropertyAuthority({
    graphData: sourceGraph,
    propertyAuthorityGraphData: sourceGraph,
  })!
  assert(renderedGraph.edges.some(edge => edge.source === 'root' && edge.target === 'branch'), 'expected Storyboard graph authority to restore the declared Probe-Tree route after a source round trip')

  const fixedCardEdgeGraph = resolveStoryboardWidgetOverlayEdgeGraphAuthority({
    draftGraphData: sourceGraph,
    renderedGraphData: renderedGraph,
    fixedCardsOwnGraphAuthority: true,
  })
  assert(fixedCardEdgeGraph === renderedGraph, 'expected fixed-card edges to use the same normalized graph authority as their rendered cards')
  assert(fixedCardEdgeGraph?.edges.length === 1, 'expected the fixed-card overlay renderer to retain the restored Probe-Tree edge')

  const interactiveEdgeGraph = resolveStoryboardWidgetOverlayEdgeGraphAuthority({
    draftGraphData: sourceGraph,
    renderedGraphData: renderedGraph,
    fixedCardsOwnGraphAuthority: false,
  })
  assert(interactiveEdgeGraph === sourceGraph, 'expected interactive editor edges to keep live draft authority')
}

export function testProbeTreeCandidateEdgesRejectParentlessAndCyclicRoutes() {
  const graphData: GraphData = {
    type: 'Graph',
    nodes: [
      { id: 'root', type: 'TextGeneration', label: 'Root', properties: {} },
      { id: 'valid', type: 'TextGeneration', label: 'Valid', properties: { cardTypeLabel: 'Probe-Tree Card', parentNodeId: 'root' } },
      { id: 'parentless', type: 'TextGeneration', label: 'Parentless', properties: { cardTypeLabel: 'Probe-Tree Card' } },
      { id: 'cycle-a', type: 'TextGeneration', label: 'Cycle A', properties: { cardTypeLabel: 'Probe-Tree Card', parentNodeId: 'cycle-b' } },
      { id: 'cycle-b', type: 'TextGeneration', label: 'Cycle B', properties: { cardTypeLabel: 'Probe-Tree Card', parentNodeId: 'cycle-a' } },
      { id: 'ordinary-child', type: 'TextGeneration', label: 'Ordinary child', properties: { parentNodeId: 'root' } },
    ],
    edges: [
      { id: 'valid-edge', source: 'root', target: 'valid', label: 'candidateOption', properties: {} },
      { id: 'parentless-edge', source: 'root', target: 'parentless', label: 'candidateOption', properties: {} },
      { id: 'cycle-a-edge', source: 'cycle-b', target: 'cycle-a', label: 'candidateOption', properties: {} },
      { id: 'cycle-b-edge', source: 'cycle-a', target: 'cycle-b', label: 'candidateOption', properties: {} },
      { id: 'outside-edge', source: 'outside-a', target: 'outside-b', label: 'candidateOption', properties: {} },
    ],
  }
  const normalized = normalizeProbeTreeCandidateEdges({
    graphData,
    threadRootId: 'root',
    threadNodeIds: new Set(['root', 'valid', 'parentless', 'cycle-a', 'cycle-b', 'ordinary-child']),
  })
  const edgeIds = normalized.edges.map(edge => String(edge.id)).sort()
  assert(edgeIds.join('|') === 'outside-edge|valid-edge', `expected only rooted in-thread and unrelated external candidate routes, got ${JSON.stringify(edgeIds)}`)
  assert(normalizeProbeTreeCandidateEdges({
    graphData: normalized,
    threadRootId: 'root',
    threadNodeIds: new Set(['root', 'valid', 'parentless', 'cycle-a', 'cycle-b', 'ordinary-child']),
  }) === normalized, 'expected malformed candidate cleanup to be idempotent')
}

export function testProbeTreeGenerationDoesNotRearmStoryboardInitialFit() {
  const source = readFileSync(resolve(process.cwd(), 'src/components/StoryboardCanvas/useStoryboardInfiniteZoom.ts'), 'utf8')
  const flowRuntimeSource = readFileSync(resolve(process.cwd(), 'src/components/FlowCanvas/useFlowCanvasRuntime.ts'), 'utf8')
  const invocationSource = readFileSync(resolve(process.cwd(), 'src/components/StoryboardCanvas/storyboardProbeTreeInvocationAction.ts'), 'utf8')
  const workflowProbeSource = readFileSync(resolve(process.cwd(), 'src/components/StoryboardWidgetCanvas/runtime/storyboardWidgetWorkflowProbeTreeRun.ts'), 'utf8')
  const workflowRunSource = readFileSync(resolve(process.cwd(), 'src/components/StoryboardWidgetCanvas/runtime/storyboardWidgetWorkflowRunAction.ts'), 'utf8')
  const projectionSource = readFileSync(resolve(process.cwd(), 'src/components/StoryboardWidgetCanvas/useStoryboardCardOverlayProjection2d.ts'), 'utf8')
  assert(source.includes("if ((metrics.graphData.nodes || []).length <= 1) return"), 'expected initial Storyboard fit to wait for measured cards')
  assert(source.includes('const fitKey = `${storyboardCameraViewKey}:${viewportW}x${viewportH}`'), 'expected initial Storyboard fit identity to remain stable across same-document graph growth')
  assert(source.includes('const completedStoryboardInitialFitKeys = new Set<string>()'), 'expected completed Storyboard fits to survive topology-driven hook remounts')
  assert(source.includes('completedStoryboardInitialFitKeys.has(fitKey)'), 'expected a remounted Storyboard viewport to preserve the established camera')
  assert(source.includes('STORYBOARD_INITIAL_FIT_HISTORY_LIMIT = 64'), 'expected remount-stable Storyboard fit history to remain bounded')
  assert(source.indexOf('lastInitialFitKeyRef.current = fitKey') < source.indexOf("if ((metrics.graphData.nodes || []).length <= 1) return"), 'expected a one-card document to commit its initial-fit identity before later Probe-Tree growth')
  assert(source.indexOf('rememberCompletedStoryboardInitialFitKey(fitKey)') < source.indexOf("if ((metrics.graphData.nodes || []).length <= 1) return"), 'expected a one-card document to preserve its initial-fit identity across later remounts')
  assert(!source.includes('const fitKey = `${zoomViewKey}:${viewportW}x${viewportH}:${metrics.signatureKey}`'), 'expected Probe-Tree generation not to rearm whole-canvas Fit-to-View through changing content metrics')
  assert(flowRuntimeSource.includes('const initKey = storyboardCameraViewKey') && !flowRuntimeSource.includes('`storyboardWidget:${zoomViewKey}`'), 'expected the native Storyboard Flow surface to share one document camera identity across init and topology-growth guards')
  assert(!flowRuntimeSource.includes('const initKey = storyboardWidgetMode ? `storyboardWidget:${storyboardWidgetLayoutSignature}` : zoomViewKey'), 'expected same-document branch growth not to rearm the native Storyboard initial fit')
  assert(flowRuntimeSource.includes('preserveAcrossGraphRevisions: storyboardWidgetMode'), 'expected a remounted Storyboard surface to reuse the exact same-document transform after source publication')
  assert(invocationSource.includes('disableAutoZoomModesForUserGesture(store)'), 'expected Probe-Tree generation to preserve the current viewport by disabling persistent auto-fit modes before selecting new branches')
  assert(invocationSource.indexOf('disableAutoZoomModesForUserGesture(useGraphStore.getState())') < invocationSource.indexOf('const result = materializeProbeTreeBranchCards'), 'expected toolbar Probe-Tree generation to disable auto-fit before graph materialization')
  assert(workflowProbeSource.indexOf('args.onInvocationStart?.()') < workflowProbeSource.indexOf('args.setLoading(true)'), 'expected async Probe-Tree generation to lock the viewport before loading or publication can enqueue a fit')
  assert(workflowRunSource.includes('onInvocationStart: () => disableAutoZoomModesForUserGesture(useGraphStore.getState())'), 'expected the native Storyboard Probe-Tree runner to disable persistent auto-fit at invocation start')
  assert(!projectionSource.includes("requestZoom('fit'"), 'expected the DOM overlay projector to paint geometry without owning camera fit')
  assert(flowRuntimeSource.includes('fitStoryboardWidgetPinnedWidgets({'), 'expected initial Storyboard fitting to remain owned by the native Flow camera runtime')
}

export function testProbeTreeToolbarPublicationVersionsOneCanonicalGraph() {
  const source = readFileSync(resolve(process.cwd(), 'src/components/StoryboardCanvas.tsx'), 'utf8')
  assert(source.includes('const committedGraphData = bumpStoryboardWidgetDraftGraphDataRevision(nextGraphData, {'), 'expected toolbar publication to version the graph before any consumer observes it')
  assert(source.includes('revisionFloor: graphRevision'), 'expected toolbar publication to advance from the active graph revision')
  assert(source.includes('storyboardRunGraphRef.current = committedGraphData'), 'expected the next toolbar run to read the revisioned graph')
  assert(source.includes('setGraphDataPreservingLayout(committedGraphData)'), 'expected the live Canvas to receive the same revisioned graph')
  assert(source.includes('persistStoryboardCardMediaGraphSource(committedGraphData, { sourceOwner:'), 'expected source persistence to receive the same revisioned graph with its semantic Markdown owner')
}

export function testProbeTreePinnedOutputPanelUsesGrowingGraphPositionOverStaleOverlayState() {
  const panel = {
    id: 'panel',
    type: 'RichMediaPanel',
    label: 'Probe-Tree Branches',
    position: {
      key: 'position',
      type: 'object',
      value: {
        x: { key: 'x', type: 'number', value: 2240 },
        y: { key: 'y', type: 'number', value: 0 },
      },
    },
    properties: {
      [PROBE_TREE_LAYOUT_MODE_PROPERTY]: PROBE_TREE_BALANCED_LAYOUT_MODE,
      [PROBE_TREE_LAYOUT_VERSION_PROPERTY]: PROBE_TREE_BALANCED_LAYOUT_VERSION,
      [PROBE_TREE_PINNED_BY_DEFAULT_PROPERTY]: true,
    },
  } as GraphNode & { position?: unknown }
  const pinnedByDefault = resolveFlowCanvasMediaOverlayPinnedInCanvas({
    graphMetaKind: 'frontmatter-flow',
    node: panel,
  })
  assert(pinnedByDefault, 'expected a layout-owned Probe-Tree ledger to be pinned without a separate screen-state entry')
  const graphOwnedPosition = resolveFlowCanvasMediaOverlayWorldTopLeft2d({
    graphNode: panel,
    pinnedInCanvas: pinnedByDefault,
    interactionOverride: { x: 1320, y: 400 },
    storedWorldPosition: { x: 1320, y: 400 },
  })
  assert(graphOwnedPosition?.x === 2240 && graphOwnedPosition.y === 0, `expected the source-roundtripped graph position to beat stale overlay state, got ${JSON.stringify(graphOwnedPosition)}`)
  const mixedAxisPosition = resolveFlowCanvasMediaOverlayWorldTopLeft2d({
    graphNode: {
      ...panel,
      x: 2260,
    },
    pinnedInCanvas: pinnedByDefault,
    storedWorldPosition: { x: 1320, y: 400 },
  })
  assert(mixedAxisPosition?.x === 2260 && mixedAxisPosition.y === 0, `expected flat and source-roundtripped axes to preserve independent authority, got ${JSON.stringify(mixedAxisPosition)}`)

  const explicitlyUnpinned = resolveFlowCanvasMediaOverlayPinnedInCanvas({
    graphMetaKind: 'frontmatter-flow',
    node: panel,
    pinnedValue: false,
  })
  assert(!explicitlyUnpinned, 'expected an explicit user unpin to override the Probe-Tree default')
  const floatingPosition = resolveFlowCanvasMediaOverlayWorldTopLeft2d({
    graphNode: panel,
    pinnedInCanvas: explicitlyUnpinned,
    storedWorldPosition: { x: 1320, y: 400 },
  })
  assert(floatingPosition?.x === 1320 && floatingPosition.y === 400, 'expected explicit unpin to retain normal floating overlay authority')

  const composedIdGraph: GraphData = { type: 'Graph', nodes: [{ ...panel, id: 'scope::panel' }], edges: [] }
  const canonicalPanel = resolveFlowCanvasMediaOverlayGraphNode(composedIdGraph, 'panel')
  assert(canonicalPanel?.id === 'scope::panel', 'expected the media overlay to recover Probe layout ownership across canonical ID variants')
}

export function testProbeTreeBranchLayoutAvoidsOccupiedContinuationSlots() {
  const graphData: GraphData = {
    type: 'Graph',
    metadata: { frontmatterFlowSettings: { gridSize: 20 } },
    nodes: [
      { id: 'root', type: 'TextGeneration', label: 'Root', x: 0, y: 0, properties: {} },
      { id: 'parent-a', type: 'TextGeneration', label: 'Parent A', x: 430, y: -260, properties: { parentNodeId: 'root', probeTreeThreadRootId: 'root' } },
      { id: 'parent-b', type: 'TextGeneration', label: 'Parent B', x: 430, y: 260, properties: { parentNodeId: 'root', probeTreeThreadRootId: 'root' } },
      { id: 'a-1', type: 'TextGeneration', label: 'A1', x: 860, y: -520, properties: { parentNodeId: 'parent-a', probeTreeThreadRootId: 'root' } },
      { id: 'a-2', type: 'TextGeneration', label: 'A2', x: 860, y: -260, properties: { parentNodeId: 'parent-a', probeTreeThreadRootId: 'root' } },
      { id: 'a-3', type: 'TextGeneration', label: 'A3', x: 860, y: 0, properties: { parentNodeId: 'parent-a', probeTreeThreadRootId: 'root' } },
    ],
    edges: [],
  }
  const positions = resolveStoryboardWidgetProbeTreeBranchPositions({
    graphData,
    anchorNode: graphData.nodes[2]!,
    removedNodeIds: new Set(),
    count: 3,
  })
  assert(new Set(positions.map(position => position.x)).size === 2, `expected the next subtree to use a balanced two-column continuation, got ${JSON.stringify(positions)}`)
  assert(new Set(positions.map(position => position.y)).size === 3, `expected the next subtree to retain a staggered top-down cascade, got ${JSON.stringify(positions)}`)
  assert(positions.every(position => position.x % 20 === 0 && position.y % 20 === 0), `expected every continuation card to remain grid snapped, got ${JSON.stringify(positions)}`)
  const occupied = graphData.nodes.slice(3).map(node => ({ x: Number(node.x), y: Number(node.y) }))
  assert(positions.every(position => occupied.every(slot => Math.abs(position.x - slot.x) >= 360 || Math.abs(position.y - slot.y) >= 680)), 'expected projected branch cards not to collide with the existing continuation columns in any supported card aspect')
}

export function testProbeTreeOutputLayoutCollapsesDuplicateThreadLedgers() {
  const graphData: GraphData = {
    type: 'Graph',
    nodes: [
      { id: 'root', type: 'TextGeneration', label: 'Root', x: 0, y: 20, properties: {} },
      { id: 'child-a', type: 'TextGeneration', label: 'A', x: 430, y: -240, properties: { cardTypeLabel: 'Probe-Tree Card', parentNodeId: 'root', probeTreeThreadRootId: 'root' } },
      { id: 'child-b', type: 'TextGeneration', label: 'B', x: 860, y: 280, properties: { cardTypeLabel: 'Probe-Tree Card', parentNodeId: 'child-a', probeTreeThreadRootId: 'root' } },
      { id: 'panel-root', type: 'RichMediaPanel', label: 'Probe-Tree Branches', x: 520, y: 20, properties: { value: 'legitimate panel field', workflowOutputAnchorNodeId: 'root', workflowOutputKey: PROBE_TREE_OUTPUT_KEY } },
      { id: 'panel-a', type: 'RichMediaPanel', label: 'Probe-Tree Branches', x: 950, y: -240, properties: { workflowOutputAnchorNodeId: 'child-a', workflowOutputKey: PROBE_TREE_OUTPUT_KEY } },
      { id: 'panel-b', type: 'RichMediaPanel', label: 'Probe-Tree Branches', x: 1380, y: 280, properties: { workflowOutputAnchorNodeId: 'child-b', workflowOutputKey: PROBE_TREE_OUTPUT_KEY } },
    ],
    edges: [
      { id: 'candidate-a', source: 'root', target: 'child-a', label: 'candidateOption', properties: {} },
      { id: 'candidate-b', source: 'child-a', target: 'child-b', label: 'candidateOption', properties: {} },
      { id: 'output-root', source: 'root', target: 'panel-root', label: PROBE_TREE_OUTPUT_KEY, properties: { workflowOutputEdge: true } },
      { id: 'output-a', source: 'child-a', target: 'panel-a', label: PROBE_TREE_OUTPUT_KEY, properties: { workflowOutputEdge: true } },
      { id: 'output-b', source: 'child-b', target: 'panel-b', label: PROBE_TREE_OUTPUT_KEY, properties: { workflowOutputEdge: true } },
    ],
  }
  const normalized = normalizeStoryboardWidgetProbeTreeOutputLayout({ graphData, threadRootId: 'child-b' })
  const normalizedFromAuthority = normalizeAllStoryboardWidgetProbeTreeOutputLayouts(graphData)
  const panels = normalized.nodes.filter(node => node.type === 'RichMediaPanel')
  const panel = panels[0]
  const outputGroupId = buildStoryboardWidgetProbeTreeOutputGroupId('root')
  assert(panels.length === 1 && panel?.id === 'panel-root', `expected one canonical root ledger, got ${JSON.stringify(panels)}`)
  const rootX = readPosition(normalized, 'root').x
  const leftmostBranchX = Math.min(readPosition(normalized, 'child-a').x, readPosition(normalized, 'child-b').x)
  assert(Number(panel?.x) > rootX && Number(panel?.x) < leftmostBranchX && panel?.y === 20, `expected the ledger in the first downstream coordinator lane, got ${JSON.stringify(panel)}`)
  assert(panel?.properties.workflowOutputGroupId === outputGroupId, 'expected the canonical ledger to be reusable by thread group')
  assert(panel?.properties.probeTreeOutputLayoutVersion === PROBE_TREE_OUTPUT_LAYOUT_VERSION, 'expected the canonical ledger layout marker')
  assert(normalized.edges.length === 2 && normalized.edges.every(edge => edge.label === 'candidateOption'), `expected stale output edges to be replaced by the next publication, got ${JSON.stringify(normalized.edges)}`)
  assert(normalizedFromAuthority.nodes.filter(node => node.type === 'RichMediaPanel').length === 1, 'expected Storyboard graph authority to expose one thread ledger before source repair completes')
  const authorityOutputEdges = normalizedFromAuthority.edges.filter(edge => edge.label === PROBE_TREE_OUTPUT_KEY)
  assert(authorityOutputEdges.length === 1 && authorityOutputEdges[0]?.target === 'panel-root', `expected passive Storyboard authority to retain the canonical forward output edge, got ${JSON.stringify(authorityOutputEdges)}`)
  const nodeById = new Map(normalized.nodes.map(node => [String(node.id), node]))
  const resolved = resolveStoryboardWidgetWorkflowRichMediaPanelTargetNodeId({
    context: {
      graphSemanticKey: 'probe-tree-layout-test',
      draftGraph: normalized,
      renderGraph: null,
      baseGraph: normalized,
      storeGraph: null,
      draftNodes: normalized.nodes,
      renderNodes: [],
      baseNodes: normalized.nodes,
      storeNodes: [],
      draftNodeById: nodeById,
      renderNodeById: new Map(),
      baseNodeById: nodeById,
      storeNodeById: new Map(),
    },
    graphForRun: normalized,
    readLiveDraftGraphData: () => normalized,
    anchorNodeId: 'child-b',
    outputKey: PROBE_TREE_OUTPUT_KEY,
    outputGroupId,
  })
  assert(resolved === 'panel-root', `expected a later continuation to reuse the thread ledger, got ${String(resolved)}`)
}

export function testProbeTreeOutputLayoutRepairsDisconnectedCanonicalLedger() {
  const graphData: GraphData = {
    type: 'Graph',
    nodes: [
      { id: 'n1', type: 'TextGeneration', label: 'Source', x: 0, y: 0, properties: {} },
      { id: 'n2', type: 'RichMediaPanel', label: 'Probe-Tree Branches', x: 520, y: 0,
        properties: {
          workflowOutputAnchorNodeId: 'n1',
          workflowOutputKey: PROBE_TREE_OUTPUT_KEY,
          [WORKFLOW_OUTPUT_EDGE_MODE_PROPERTY]: WORKFLOW_OUTPUT_EDGE_MODE_MANUAL,
        },
      },
    ],
    edges: [],
  }
  const normalized = normalizeAllStoryboardWidgetProbeTreeOutputLayouts(graphData)
  const repairedPanel = normalized.nodes.find(node => node.id === 'n2')
  const outputEdges = normalized.edges.filter(edge => edge.properties?.workflowOutputEdge === true)
  assert(outputEdges.length === 1, `expected one repaired ledger edge, got ${JSON.stringify(outputEdges)}`)
  assert(outputEdges[0]?.source === 'n1' && outputEdges[0]?.target === 'n2', `expected source-to-ledger topology, got ${JSON.stringify(outputEdges[0])}`)
  assert(outputEdges[0]?.properties?.[FLOW_EDGE_SOURCE_PORT_KEY] === 'text_out', `expected repaired ledger source port text_out, got ${JSON.stringify(outputEdges[0])}`)
  assert(outputEdges[0]?.properties?.[FLOW_EDGE_TARGET_PORT_KEY] === 'output', `expected repaired ledger target port output, got ${JSON.stringify(outputEdges[0])}`)
  assert(repairedPanel?.properties[WORKFLOW_OUTPUT_EDGE_MODE_PROPERTY] == null, 'expected passive authority to clear the stale manual-disconnect marker')
  assert(normalizeAllStoryboardWidgetProbeTreeOutputLayouts(normalized) === normalized, 'expected repaired ledger authority to be idempotent')
}

export {
  testProbeTreeOutputLayoutMergesLiveLedgersBeforeNormalization,
  testProbeTreeOutputMarkdownUsesFrontmatterSharedViewerContract,
} from './storyboardProbeTreeOutputPublication.test'
