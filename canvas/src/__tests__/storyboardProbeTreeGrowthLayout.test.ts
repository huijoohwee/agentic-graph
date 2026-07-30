import {
  normalizeStoryboardWidgetProbeTreeThreadLayout,
  PROBE_TREE_GRAPH_LAYOUT_VERSION_PROPERTY,
  resolveStoryboardWidgetProbeTreeBranchPositions,
  resolveStoryboardWidgetProbeTreeOutputPanelPosition,
} from '@/components/StoryboardWidgetCanvas/runtime/storyboardWidgetProbeTreeLayout'
import { materializeStoryboardWidgetProbeTreeStructuredResponse } from '@/components/StoryboardWidgetCanvas/runtime/storyboardWidgetProbeTreeStructuredResponse'
import { buildProbeTreeStructuredResponse } from '@/features/agent-ready/probeTreeContract.mjs'
import type { GraphData } from '@/lib/graph/types'
import type { StoryboardWidgetRunExecutionAnchorSnapshot } from '@/components/StoryboardWidgetCanvas/runtime/storyboardWidgetRunExecutionAnchor'
import {
  RICH_MEDIA_PANEL_DEFAULT_HEIGHT_PX,
  RICH_MEDIA_PANEL_DEFAULT_WIDTH_PX,
} from '@/lib/render/richMediaPanelDefaults'
import {
  PROBE_TREE_BALANCED_LAYOUT_MODE,
  PROBE_TREE_BALANCED_LAYOUT_VERSION,
  PROBE_TREE_LAYOUT_MODE_PROPERTY,
  PROBE_TREE_LAYOUT_VERSION_PROPERTY,
  PROBE_TREE_PINNED_BY_DEFAULT_PROPERTY,
} from '@/lib/storyboardWidget/probeTreeLayoutContract'
import { screenToWorld, worldToScreen } from '@/lib/zoom/viewport'

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
  for (let leftIndex = 0; leftIndex < nodeIds.length; leftIndex += 1) {
    const left = readPosition(graphData, nodeIds[leftIndex]!)
    for (let rightIndex = leftIndex + 1; rightIndex < nodeIds.length; rightIndex += 1) {
      const right = readPosition(graphData, nodeIds[rightIndex]!)
      assert(Math.abs(left.x - right.x) >= 360 || Math.abs(left.y - right.y) >= 640, `expected ${nodeIds[leftIndex]} and ${nodeIds[rightIndex]} to remain disjoint`)
    }
  }
}

export function testProbeTreeInitialSiblingBatchBalancesAroundOccupiedCards() {
  const outsideNode = { id: 'outside', type: 'TextGeneration', label: 'Outside card', x: 440, y: -340, properties: {} }
  const graphData: GraphData = {
    type: 'Graph',
    metadata: { kind: 'frontmatter-flow', frontmatterFlowSettings: { gridSize: 20 } },
    nodes: [
      { id: 'root', type: 'TextGeneration', label: 'Root', x: 0, y: 0, properties: {} },
      outsideNode,
      ...['a', 'b', 'c'].map((id, index) => ({
        id,
        type: 'TextGeneration',
        label: id,
        x: 0,
        y: 0,
        properties: { cardTypeLabel: 'Probe-Tree Card', index: `P${index + 1}`, parentNodeId: 'root', probeTreeThreadRootId: 'root' },
      })),
    ],
    edges: ['a', 'b', 'c'].map(id => ({ id: `edge-${id}`, source: 'root', target: id, label: 'candidateOption', properties: {} })),
  }
  const normalized = normalizeStoryboardWidgetProbeTreeThreadLayout({ graphData, threadRootId: 'root' })
  const positions = ['a', 'b', 'c'].map(id => readPosition(normalized, id))
  assert(new Set(positions.map(position => position.x)).size >= 2, `expected a first three-sibling turn to spread across columns, got ${JSON.stringify(positions)}`)
  assert(new Set(positions.map(position => position.y)).size >= 2, `expected a first three-sibling turn to retain a top-down waterfall, got ${JSON.stringify(positions)}`)
  assert(positions.every(position => position.x > 0 && position.x % 20 === 0 && position.y % 20 === 0), `expected forward grid-snapped sibling positions, got ${JSON.stringify(positions)}`)
  assertProbeCardsDoNotOverlap(normalized, ['a', 'b', 'c'])
  const outsidePosition = readPosition(normalized, 'outside')
  assert(positions.every(position => Math.abs(position.x - outsidePosition.x) >= 360 || Math.abs(position.y - outsidePosition.y) >= 640), 'expected full-thread normalization to avoid fixed cards outside the Probe thread')
  assert(normalized.nodes.find(node => node.id === 'outside') === outsideNode, 'expected external fixed-card authority to remain byte-identical')
  assert(normalizeStoryboardWidgetProbeTreeThreadLayout({ graphData: normalized, threadRootId: 'root' }) === normalized, 'expected the settled collision-free first turn to remain idempotent')
}

export function testProbeTreeFrontmatterLayoutIgnoresWidgetEligibleNodesOutsideVisibleBundle() {
  const hiddenObstacleNodes = Array.from({ length: 8 }, (_, columnIndex) => (
    Array.from({ length: 5 }, (_, verticalIndex) => ({
      id: `hidden-${columnIndex + 1}-${verticalIndex + 1}`,
      type: 'TextGeneration',
      label: 'Eligible but hidden card',
      x: (columnIndex + 1) * 430,
      y: (verticalIndex - 2) * 680,
      properties: {
        cardTypeLabel: 'Probe-Tree Card',
        index: `P${columnIndex + 3}`,
        parentNodeId: 'root',
        probeTreeThreadRootId: 'root',
        [PROBE_TREE_LAYOUT_MODE_PROPERTY]: PROBE_TREE_BALANCED_LAYOUT_MODE,
        [PROBE_TREE_LAYOUT_VERSION_PROPERTY]: PROBE_TREE_BALANCED_LAYOUT_VERSION,
        [PROBE_TREE_PINNED_BY_DEFAULT_PROPERTY]: true,
      },
    }))
  )).flat()
  const graphData: GraphData = {
    type: 'Graph',
    metadata: {
      kind: 'frontmatter-flow',
      frontmatterFlowSettings: { gridSize: 20 },
      frontmatterMeta: { widget_bundle: { graph: { nodes_ref: ['root', 'a', 'b'] } } },
      [PROBE_TREE_GRAPH_LAYOUT_VERSION_PROPERTY]: {
        root: { version: PROBE_TREE_BALANCED_LAYOUT_VERSION, gridSize: 20 },
      },
    },
    nodes: [
      { id: 'root', type: 'TextGeneration', label: 'Root', x: 0, y: 0, properties: {} },
      ...hiddenObstacleNodes,
      ...['a', 'b'].map((id, index) => ({
        id,
        type: 'TextGeneration',
        label: id,
        x: 3440,
        y: index === 0 ? -1020 : 1020,
        properties: {
          cardTypeLabel: 'Probe-Tree Card',
          index: `P${index + 1}`,
          parentNodeId: 'root',
          probeTreeThreadRootId: 'root',
          [PROBE_TREE_LAYOUT_MODE_PROPERTY]: PROBE_TREE_BALANCED_LAYOUT_MODE,
          [PROBE_TREE_LAYOUT_VERSION_PROPERTY]: PROBE_TREE_BALANCED_LAYOUT_VERSION,
          [PROBE_TREE_PINNED_BY_DEFAULT_PROPERTY]: true,
        },
      })),
    ],
    edges: ['a', 'b'].map(id => ({ id: `edge-${id}`, source: 'root', target: id, label: 'candidateOption', properties: {} })),
  }

  const normalized = normalizeStoryboardWidgetProbeTreeThreadLayout({ graphData, threadRootId: 'root' })
  assert(normalized !== graphData, 'expected current-version markers not to preserve an excessively distant branch layout')
  const branchPositions = ['a', 'b'].map(id => readPosition(normalized, id))
  assert(
    Math.max(...branchPositions.map(position => position.x)) <= 860,
    `expected widget-eligible nodes outside the rendered frontmatter bundle not to push Probe-Tree output away from its source, got ${JSON.stringify(branchPositions)}`,
  )
  assert(branchPositions.every(position => position.x > 0), `expected compact branches to remain forward of their source, got ${JSON.stringify(branchPositions)}`)
  const outputPosition = resolveStoryboardWidgetProbeTreeOutputPanelPosition({ graphData: normalized, threadRootId: 'root' })
  assert(outputPosition != null && outputPosition.x <= 1380, `expected hidden historical branches not to push the output ledger away, got ${JSON.stringify(outputPosition)}`)
  assertProbeCardsDoNotOverlap(normalized, ['a', 'b'])
  assert(hiddenObstacleNodes.every(node => normalized.nodes.find(candidate => candidate.id === node.id) === node), 'expected ignored non-rendered nodes to remain byte-identical')
  assert(normalizeStoryboardWidgetProbeTreeThreadLayout({ graphData: normalized, threadRootId: 'root' }) === normalized, 'expected compact migrated layout to remain idempotent')
}

export function testProbeTreeDenseCascadeKeepsEdgesParentLocal() {
  const branchSpecs: Array<{ id: string; parentNodeId: string; depth: number; index: string }> = []
  let parentNodeIds = ['root']
  const parentExpansionCounts = [1, 3, 3, 3, 2, 1, 1, 1]
  for (let depthIndex = 0; depthIndex < parentExpansionCounts.length; depthIndex += 1) {
    const nextParentNodeIds: string[] = []
    for (const parentNodeId of parentNodeIds.slice(0, parentExpansionCounts[depthIndex])) {
      for (let optionIndex = 0; optionIndex < 3; optionIndex += 1) {
        const id = `depth-${depthIndex + 1}-${branchSpecs.length + 1}`
        branchSpecs.push({ id, parentNodeId, depth: depthIndex + 1, index: `P${optionIndex + 1}` })
        nextParentNodeIds.push(id)
      }
    }
    parentNodeIds = nextParentNodeIds
  }
  const graphData: GraphData = {
    type: 'Graph',
    metadata: { kind: 'frontmatter-flow', frontmatterFlowSettings: { gridSize: 20 } },
    nodes: [
      { id: 'root', type: 'TextGeneration', label: 'Root', x: 0, y: 0, properties: {} },
      ...branchSpecs.map(spec => ({
        id: spec.id,
        type: 'TextGeneration',
        label: spec.id,
        x: 0,
        y: 0,
        properties: {
          cardTypeLabel: 'Probe-Tree Card',
          index: spec.index,
          parentNodeId: spec.parentNodeId,
          probeTreeDepth: spec.depth,
          probeTreeThreadRootId: 'root',
        },
      })),
    ],
    edges: branchSpecs.map(spec => ({ id: `edge-${spec.id}`, source: spec.parentNodeId, target: spec.id, label: 'candidateOption', properties: {} })),
  }

  const normalized = normalizeStoryboardWidgetProbeTreeThreadLayout({ graphData, threadRootId: 'root' })
  const branchNodeIds = branchSpecs.map(spec => spec.id)
  assertProbeCardsDoNotOverlap(normalized, branchNodeIds)
  const edgeSpans = branchSpecs.map(spec => {
    const parent = readPosition(normalized, spec.parentNodeId)
    const child = readPosition(normalized, spec.id)
    return { horizontal: child.x - parent.x, vertical: Math.abs(child.y - parent.y) }
  })
  assert(edgeSpans.every(span => span.horizontal >= 360), 'expected every dense-tree candidate edge to remain forward-only')
  assert(Math.max(...edgeSpans.map(span => span.vertical)) <= 2040, `expected parent-local placement to bound vertical edge spans, got ${JSON.stringify(edgeSpans)}`)
  assert(edgeSpans.reduce((sum, span) => sum + span.vertical, 0) / edgeSpans.length <= 900, 'expected the dense waterfall to keep average child placement near its parent')
  const positions = ['root', ...branchNodeIds].map(nodeId => readPosition(normalized, nodeId))
  const width = Math.max(...positions.map(position => position.x)) - Math.min(...positions.map(position => position.x)) + 360
  const height = Math.max(...positions.map(position => position.y)) - Math.min(...positions.map(position => position.y)) + 640
  assert(width / height >= 0.35 && width / height <= 2.75, `expected the parent-local dense cascade to retain a balanced footprint, got ${width / height}`)
}

export function testProbeTreeIncrementalGrowthPreservesPinnedBranchCoordinates() {
  const graphData: GraphData = {
    type: 'Graph',
    metadata: { kind: 'frontmatter-flow', frontmatterFlowSettings: { gridSize: 20 } },
    nodes: [
      { id: 'root', type: 'TextGeneration', label: 'Root', x: 0, y: 0, properties: {} },
      ...['a', 'b', 'c'].map((id, index) => ({
        id,
        type: 'TextGeneration',
        label: id,
        x: 0,
        y: 0,
        properties: { cardTypeLabel: 'Probe-Tree Card', index: `P${index + 1}`, parentNodeId: 'root', probeTreeThreadRootId: 'root' },
      })),
    ],
    edges: ['a', 'b', 'c'].map(id => ({ id: `edge-${id}`, source: 'root', target: id, label: 'candidateOption', properties: {} })),
  }
  const normalized = normalizeStoryboardWidgetProbeTreeThreadLayout({ graphData, threadRootId: 'root' })
  const parent = normalized.nodes.find(node => node.id === 'b')!
  const projected = resolveStoryboardWidgetProbeTreeBranchPositions({ graphData: normalized, anchorNode: parent, removedNodeIds: new Set(), count: 3 })
  assert(new Set(projected.map(position => position.x)).size >= 2, `expected each incremental sibling batch to spill across columns, got ${JSON.stringify(projected)}`)
  assert(new Set(projected.map(position => position.y)).size >= 2, `expected each incremental sibling batch to retain a top-down waterfall, got ${JSON.stringify(projected)}`)
  const newNodeIds = ['b-1', 'b-2', 'b-3']
  const expanded: GraphData = {
    ...normalized,
    nodes: [...normalized.nodes, ...newNodeIds.map((id, index) => ({
      id,
      type: 'TextGeneration',
      label: id,
      x: projected[index]!.x,
      y: projected[index]!.y,
      properties: { cardTypeLabel: 'Probe-Tree Card', index: `P${index + 1}`, parentNodeId: 'b', probeTreeThreadRootId: 'root' },
    }))],
    edges: [...normalized.edges, ...newNodeIds.map(id => ({ id: `edge-${id}`, source: 'b', target: id, label: 'candidateOption', properties: {} }))],
  }
  const grown = normalizeStoryboardWidgetProbeTreeThreadLayout({ graphData: expanded, threadRootId: 'root' })
  assert(readThreadLayoutVersion(grown, 'root') === PROBE_TREE_BALANCED_LAYOUT_VERSION, 'expected incremental layout authority to survive source round-tripping for its canonical thread')
  for (const id of ['root', 'a', 'b', 'c']) {
    assert(readPosition(grown, id).x === readPosition(normalized, id).x && readPosition(grown, id).y === readPosition(normalized, id).y, `expected ${id} to remain fixed during incremental growth`)
    assert(grown.nodes.find(node => node.id === id) === normalized.nodes.find(node => node.id === id), `expected ${id} to retain byte-identical graph authority`)
  }
  assertProbeCardsDoNotOverlap(grown, ['a', 'b', 'c', ...newNodeIds])
  for (const id of newNodeIds) {
    const properties = grown.nodes.find(node => node.id === id)?.properties || {}
    assert(properties[PROBE_TREE_LAYOUT_MODE_PROPERTY] === PROBE_TREE_BALANCED_LAYOUT_MODE, `expected ${id} to receive layout ownership without moving existing cards`)
    assert(readPosition(grown, id).x > readPosition(grown, 'b').x, `expected ${id} to keep a forward-only parent edge`)
  }

  let spreadGraph = grown
  for (const parentId of ['a', 'c']) {
    const siblingIds = Array.from({ length: 3 }, (_, index) => `${parentId}-${index + 1}`)
    const siblingPositions = resolveStoryboardWidgetProbeTreeBranchPositions({
      graphData: spreadGraph,
      anchorNode: spreadGraph.nodes.find(node => node.id === parentId)!,
      removedNodeIds: new Set(),
      count: siblingIds.length,
    })
    spreadGraph = normalizeStoryboardWidgetProbeTreeThreadLayout({
      graphData: {
        ...spreadGraph,
        nodes: [...spreadGraph.nodes, ...siblingIds.map((id, index) => ({
          id,
          type: 'TextGeneration',
          label: id,
          x: siblingPositions[index]!.x,
          y: siblingPositions[index]!.y,
          properties: { cardTypeLabel: 'Probe-Tree Card', index: `P${index + 1}`, parentNodeId: parentId, probeTreeThreadRootId: 'root' },
        }))],
        edges: [...spreadGraph.edges, ...siblingIds.map(id => ({ id: `edge-${id}`, source: parentId, target: id, label: 'candidateOption', properties: {} }))],
      },
      threadRootId: 'root',
    })
  }
  const spreadNodeIds = spreadGraph.nodes.filter(node => node.properties?.cardTypeLabel === 'Probe-Tree Card').map(node => String(node.id))
  const spreadPositions = ['root', ...spreadNodeIds].map(id => readPosition(spreadGraph, id))
  const width = Math.max(...spreadPositions.map(position => position.x)) - Math.min(...spreadPositions.map(position => position.x)) + 360
  const height = Math.max(...spreadPositions.map(position => position.y)) - Math.min(...spreadPositions.map(position => position.y)) + 640
  const aspect = width / height
  assert(aspect >= 0.45 && aspect <= 2.75, `expected multi-parent incremental growth to stay balanced, got aspect ${aspect}`)
  assertProbeCardsDoNotOverlap(spreadGraph, spreadNodeIds)
  for (const id of [...newNodeIds, 'a-1', 'a-2', 'a-3', 'c-1', 'c-2', 'c-3']) {
    assert(spreadGraph.nodes.some(node => node.id === id), `expected sibling subtree ${id} to remain materialized`)
  }
}

export function testProbeTreeSourceRoundTripGraphMarkerPreservesPinnedBranchCoordinates() {
  const branchSpecs = [['a', 'root', 'P1'], ['b', 'root', 'P2'], ['c', 'root', 'P3'], ['a-1', 'a', 'P1']] as const
  const graphData: GraphData = {
    type: 'Graph',
    metadata: { kind: 'frontmatter-flow', frontmatterFlowSettings: { gridSize: 20 } },
    nodes: [
      { id: 'root', type: 'TextGeneration', label: 'Root', x: 0, y: 0, properties: {} },
      ...branchSpecs.map(([id, parentNodeId, index]) => ({ id, type: 'TextGeneration', label: id, x: 0, y: 0, properties: { cardTypeLabel: 'Probe-Tree Card', index, parentNodeId, probeTreeThreadRootId: 'root' } })),
    ],
    edges: branchSpecs.map(([id, parentNodeId]) => ({ id: `edge-${id}`, source: parentNodeId, target: id, label: 'candidateOption', properties: {} })),
  }
  const normalized = normalizeStoryboardWidgetProbeTreeThreadLayout({ graphData, threadRootId: 'root' })
  const sourceRoundTripped: GraphData = {
    ...normalized,
    nodes: normalized.nodes.map(node => {
      if (node.id === 'root') return node
      const properties = { ...(node.properties || {}) }
      delete properties[PROBE_TREE_LAYOUT_MODE_PROPERTY]
      delete properties[PROBE_TREE_LAYOUT_VERSION_PROPERTY]
      delete properties[PROBE_TREE_PINNED_BY_DEFAULT_PROPERTY]
      return { ...node, properties }
    }),
  }
  assert(readThreadLayoutVersion(sourceRoundTripped, 'root') === PROBE_TREE_BALANCED_LAYOUT_VERSION, 'expected the thread-scoped layout marker to survive the source round trip')
  const parent = sourceRoundTripped.nodes.find(node => node.id === 'b')!
  const projected = resolveStoryboardWidgetProbeTreeBranchPositions({ graphData: sourceRoundTripped, anchorNode: parent, removedNodeIds: new Set(), count: 3 })
  const newNodeIds = ['b-1', 'b-2', 'b-3']
  const expanded: GraphData = {
    ...sourceRoundTripped,
    nodes: [...sourceRoundTripped.nodes, ...newNodeIds.map((id, index) => ({ id, type: 'TextGeneration', label: id, x: projected[index]!.x, y: projected[index]!.y, properties: { cardTypeLabel: 'Probe-Tree Card', index: `P${index + 1}`, parentNodeId: 'b', probeTreeThreadRootId: 'root' } }))],
    edges: [...sourceRoundTripped.edges, ...newNodeIds.map(id => ({ id: `edge-${id}`, source: 'b', target: id, label: 'candidateOption', properties: {} }))],
  }
  const grown = normalizeStoryboardWidgetProbeTreeThreadLayout({ graphData: expanded, threadRootId: 'root' })
  for (const id of ['root', ...branchSpecs.map(([branchId]) => branchId)]) {
    assert(readPosition(grown, id).x === readPosition(normalized, id).x && readPosition(grown, id).y === readPosition(normalized, id).y, `expected thread layout authority to preserve ${id} across marker-stripping source round trips`)
  }
  assertProbeCardsDoNotOverlap(grown, [...branchSpecs.map(([id]) => id), ...newNodeIds])
  for (const id of [...branchSpecs.map(([branchId]) => branchId), ...newNodeIds]) {
    const properties = grown.nodes.find(node => node.id === id)?.properties || {}
    assert(properties[PROBE_TREE_LAYOUT_MODE_PROPERTY] === PROBE_TREE_BALANCED_LAYOUT_MODE, `expected ${id} layout ownership to be restored`)
    assert(properties[PROBE_TREE_LAYOUT_VERSION_PROPERTY] === PROBE_TREE_BALANCED_LAYOUT_VERSION, `expected ${id} layout version to be restored`)
    assert(properties[PROBE_TREE_PINNED_BY_DEFAULT_PROPERTY] === true, `expected ${id} default pinning to be restored`)
  }
}

export function testProbeTreeStructuredReplacementRemovesDescendantClosure() {
  const graphData: GraphData = {
    type: 'Graph',
    nodes: [
      { id: 'root', type: 'TextGeneration', label: 'SME evidence', x: 0, y: 0, properties: {} },
      { id: 'old-child', type: 'TextGeneration', label: 'Old child', x: 440, y: 0, properties: { cardTypeLabel: 'Probe-Tree Card', parentNodeId: 'root', probeTreeThreadRootId: 'root' } },
      { id: 'old-grandchild', type: 'TextGeneration', label: 'Old grandchild', x: 880, y: 0, properties: { cardTypeLabel: 'Probe-Tree Card', parentNodeId: 'old-child', probeTreeThreadRootId: 'root' } },
      { id: 'other-root', type: 'TextGeneration', label: 'Other root', x: 0, y: 1600, properties: {} },
      { id: 'other-child', type: 'TextGeneration', label: 'Other child', x: 440, y: 1600, properties: { cardTypeLabel: 'Probe-Tree Card', parentNodeId: 'other-root', probeTreeThreadRootId: 'other-root' } },
    ],
    edges: [
      { id: 'old-edge', source: 'root', target: 'old-child', label: 'candidateOption', properties: {} },
      { id: 'old-descendant-edge', source: 'old-child', target: 'old-grandchild', label: 'candidateOption', properties: {} },
      { id: 'other-edge', source: 'other-root', target: 'other-child', label: 'candidateOption', properties: {} },
    ],
  }
  const contextText = [
    'Authored request:',
    'Compare SME evidence across coverage source, claims record, policy schedule, and handoff owner.',
    'Prioritize accountable review across evidence freshness, coverage gap, adviser boundary, and approval status.',
    'Selected Widget id: root',
  ].join('\n')
  const response = buildProbeTreeStructuredResponse({
    threadRootId: 'root', currentNodeId: 'root', contextText, optionCount: 2,
    options: [
      {
        id: 'authority',
        text: 'Which coverage source should establish SME evidence authority?',
        rationale: 'Clarifies the authored SME evidence authority question.',
        evidenceNeeded: 'User-selected coverage authority.',
        selectionOptions: ['Require verified coverage source authority', 'Require recently refreshed claims record'],
        contextAnchors: ['SME evidence', 'coverage source', 'claims record'],
      },
      {
        id: 'reviewer',
        text: 'Which adviser boundary or approval status should guide review?',
        rationale: 'Clarifies the authored accountable review question.',
        evidenceNeeded: 'User-selected review boundary.',
        selectionOptions: ['Require explicit adviser boundary', 'Require current approval status'],
        contextAnchors: ['accountable review', 'adviser boundary', 'approval status'],
      },
    ],
  })
  const result = materializeStoryboardWidgetProbeTreeStructuredResponse({
    graphData,
    anchorNode: graphData.nodes[0]!,
    responseText: JSON.stringify({ jsonrpc: '2.0', id: 'replace', result: { structuredContent: { ok: true, response } } }),
    contextText,
    responseSource: 'mcp',
    model: 'qwen-local',
    mcpInvoked: true,
    threadRootId: 'root',
    invocationTokens: [],
  })
  assert(result != null, 'expected a relevant structured Probe response to materialize')
  assert(!result!.graphData.nodes.some(node => node.id === 'old-child' || node.id === 'old-grandchild'), 'expected replacement to remove the complete old descendant closure')
  assert(!result!.graphData.edges.some(edge => ['old-child', 'old-grandchild'].includes(String(edge.source)) || ['old-child', 'old-grandchild'].includes(String(edge.target))), 'expected replacement to remove every incident descendant edge')
  assert(result!.graphData.nodes.some(node => node.id === 'other-child') && result!.graphData.edges.some(edge => edge.id === 'other-edge'), 'expected another parent subtree to remain untouched')
}

export function testProbeTreeRunMaterializationFitsCapturedVisibleViewport() {
  const graphData: GraphData = {
    type: 'Graph',
    metadata: { kind: 'frontmatter-flow' },
    nodes: [{
      id: 'root',
      type: 'TextGeneration',
      label: 'Generic decision',
      x: -4_000,
      y: -2_500,
      properties: {},
    }],
    edges: [],
  }
  const contextText = [
    'Authored request:',
    'Compare the available approaches by evidence quality, delivery constraint, and accountable owner.',
    'Selected Widget id: root',
  ].join('\n')
  const response = buildProbeTreeStructuredResponse({
    threadRootId: 'root',
    currentNodeId: 'root',
    contextText,
    optionCount: 2,
    options: [
      {
        id: 'evidence',
        text: 'Which evidence quality threshold should determine the next approach?',
        rationale: 'Clarifies the evidence-quality decision.',
        evidenceNeeded: 'A selected evidence threshold.',
        selectionOptions: ['Require verified primary evidence', 'Allow provisional secondary evidence'],
        contextAnchors: ['evidence quality', 'available approaches'],
      },
      {
        id: 'owner',
        text: 'Which accountable owner should accept the delivery constraint?',
        rationale: 'Clarifies the accountable-owner decision.',
        evidenceNeeded: 'A selected owner and delivery constraint.',
        selectionOptions: ['Assign the operating owner', 'Assign the reviewing owner'],
        contextAnchors: ['accountable owner', 'delivery constraint'],
      },
    ],
  })
  const renderedTransform = { k: 1, x: 982, y: -523 }
  const sourceScreenTopLeft = { left: 120, top: 260 }
  const sourceWorldTopLeft = screenToWorld({
    transform: renderedTransform,
    sx: sourceScreenTopLeft.left,
    sy: sourceScreenTopLeft.top,
  })
  const executionAnchor: StoryboardWidgetRunExecutionAnchorSnapshot = {
    nodeId: 'root',
    graphMetaKey: 'generic-document',
    authority: 'screen',
    world: sourceWorldTopLeft,
    screen: sourceScreenTopLeft,
    paintScale: 1,
    transform: renderedTransform,
    visibleViewport: {
      left: 0,
      top: 0,
      right: 520,
      bottom: 920,
      width: 520,
      height: 920,
    },
  }
  const responseText = JSON.stringify({
    jsonrpc: '2.0',
    id: 'visible-materialization',
    result: { structuredContent: { ok: true, response } },
  })
  const result = materializeStoryboardWidgetProbeTreeStructuredResponse({
    graphData,
    anchorNode: graphData.nodes[0]!,
    responseText,
    contextText,
    responseSource: 'mcp',
    model: 'generic-model',
    mcpInvoked: true,
    threadRootId: 'root',
    invocationTokens: [],
    executionAnchor,
  })
  assert(result != null, 'expected the structured response to materialize from the captured Run authority')
  const normalized = normalizeStoryboardWidgetProbeTreeThreadLayout({
    graphData: result!.graphData,
    threadRootId: 'root',
  })
  const materializedPositions = result!.materializedNodeIds.map(nodeId => readPosition(normalized, nodeId))
  const outputPosition = result!.outputPanelPosition
  const materializedScreenRects = materializedPositions.map(position => {
    const center = worldToScreen({ transform: renderedTransform, x: position.x, y: position.y })
    return {
      left: center.sx - RICH_MEDIA_PANEL_DEFAULT_WIDTH_PX / 2,
      top: center.sy - RICH_MEDIA_PANEL_DEFAULT_HEIGHT_PX / 2,
      width: RICH_MEDIA_PANEL_DEFAULT_WIDTH_PX,
      height: RICH_MEDIA_PANEL_DEFAULT_HEIGHT_PX,
    }
  })
  const outputScreenRects = outputPosition
    ? [(() => {
        const topLeft = worldToScreen({
          transform: renderedTransform,
          x: outputPosition.x,
          y: outputPosition.y,
        })
        return {
          left: topLeft.sx,
          top: topLeft.sy,
          width: RICH_MEDIA_PANEL_DEFAULT_WIDTH_PX,
          height: RICH_MEDIA_PANEL_DEFAULT_HEIGHT_PX,
        }
      })()]
    : []
  const allMaterializedScreenRects = [...materializedScreenRects, ...outputScreenRects]
  const everyPositionIntersectsViewport = allMaterializedScreenRects.every(rect => (
    rect.left + rect.width > executionAnchor.visibleViewport.left
    && rect.left < executionAnchor.visibleViewport.right
    && rect.top + rect.height > executionAnchor.visibleViewport.top
    && rect.top < executionAnchor.visibleViewport.bottom
  ))
  const occupiedRects = [{
    left: sourceScreenTopLeft.left,
    top: sourceScreenTopLeft.top,
    width: RICH_MEDIA_PANEL_DEFAULT_WIDTH_PX,
    height: RICH_MEDIA_PANEL_DEFAULT_HEIGHT_PX,
  }, ...allMaterializedScreenRects]
  const positionsDoNotOverlap = occupiedRects.every((position, index) => (
    occupiedRects.slice(index + 1).every(other => !(
      position.left < other.left + other.width
      && position.left + position.width > other.left
      && position.top < other.top + other.height
      && position.top + position.height > other.top
    ))
  ))
  assert(outputPosition != null, 'expected the viewport-balanced materialization to reserve a Rich Media output cell')
  assert(everyPositionIntersectsViewport, `expected every new card and panel to intersect the 100% visible viewport, got ${JSON.stringify({ materializedPositions, outputPosition })}`)
  assert(positionsDoNotOverlap, `expected the source, generated cards, and Rich Media panel to occupy distinct renderer-projected cells, got ${JSON.stringify(occupiedRects)}`)
  assert(
    result!.materializedNodeIds.every(nodeId => {
      const before = readPosition(result!.graphData, nodeId)
      const after = readPosition(normalized, nodeId)
      return before.x === after.x && before.y === after.y
    }),
    'expected canonical Probe normalization to preserve the upstream viewport-balanced placement',
  )

  const staleNodeIds = new Set(result!.materializedNodeIds)
  const staleRerunGraphData: GraphData = {
    ...result!.graphData,
    nodes: result!.graphData.nodes.map(node => (
      staleNodeIds.has(String(node.id))
        ? { ...node, x: 48_000, y: -31_000 }
        : node
    )),
  }
  const staleRerunAnchor = staleRerunGraphData.nodes.find(node => node.id === 'root')!
  const rerunResult = materializeStoryboardWidgetProbeTreeStructuredResponse({
    graphData: staleRerunGraphData,
    anchorNode: staleRerunAnchor,
    responseText,
    contextText,
    responseSource: 'mcp',
    model: 'generic-model',
    mcpInvoked: true,
    threadRootId: 'root',
    invocationTokens: [],
    executionAnchor,
  })
  assert(rerunResult != null, 'expected a repeated structured response to rematerialize through the current captured viewport')
  assert(
    rerunResult!.materializedNodeIds.length === result!.materializedNodeIds.length
    && rerunResult!.materializedNodeIds.every(nodeId => staleNodeIds.has(nodeId)),
    `expected the repeated response to reconcile the same generated identities, got ${JSON.stringify(rerunResult!.materializedNodeIds)}`,
  )
  const rerunPositions = rerunResult!.materializedNodeIds.map(nodeId => readPosition(rerunResult!.graphData, nodeId))
  assert(
    rerunPositions.every((position, index) => (
      position.x === materializedPositions[index]!.x
      && position.y === materializedPositions[index]!.y
    )),
    `expected a repeated Run to replace stale/offscreen reused coordinates with the fresh execution-anchor plan, got ${JSON.stringify(rerunPositions)}`,
  )
}
