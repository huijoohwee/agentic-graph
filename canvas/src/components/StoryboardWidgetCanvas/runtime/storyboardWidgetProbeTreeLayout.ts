import { FLOW_RICH_MEDIA_PANEL_NODE_TYPE_ID } from '@/lib/config'
import { clampSnapGridSize, snapPointToGrid, SNAP_GRID_SIZE_DEFAULT } from '@/lib/canvas/gridSnap'
import { resolveCanvasAspectRatioSize } from '@/lib/canvas/canvasAspectRatioDisplayControls'
import { readGraphEdgeEndpoints } from '@/lib/graph/edgeEndpoints'
import { filterGraphToFlowWidgetEligible } from '@/lib/graph/flowWidgetEligibility'
import { isFrontmatterFlowGraph } from '@/lib/graph/frontmatterMode'
import { unwrapGraphCellValue } from '@/lib/graph/nodeProperties'
import type { GraphData, GraphNode, JSONValue } from '@/lib/graph/types'
import { RICH_MEDIA_PANEL_DEFAULT_WIDTH_PX } from '@/lib/render/richMediaPanelDefaults'
import { deriveFrontmatterFlowOverlayNodeIds } from '@/lib/storyboardWidget/frontmatterOverlayNodeIds'
import {
  PROBE_TREE_BALANCED_LAYOUT_MODE,
  PROBE_TREE_BALANCED_LAYOUT_VERSION,
  PROBE_TREE_LAYOUT_MODE_PROPERTY,
  PROBE_TREE_LAYOUT_VERSION_PROPERTY,
  PROBE_TREE_PINNED_BY_DEFAULT_PROPERTY,
} from '@/lib/storyboardWidget/probeTreeLayoutContract'
import { bumpStoryboardWidgetDraftGraphDataRevision } from '@/lib/storyboardWidget/storyboardWidgetDraftGraphData'
import { normalizeProbeTreeCandidateEdges } from '@/components/StoryboardWidgetCanvas/runtime/storyboardWidgetProbeTreeCandidateEdges'
import {
  probeTreePositionsOverlap,
  readProbeTreeFootprintAspect,
  resolveBalancedProbeTreeBatchPositions,
} from '@/components/StoryboardWidgetCanvas/runtime/storyboardWidgetProbeTreeBalancedPositions'
import {
  buildStoryboardWidgetWorkflowOutputEdgeId,
  mergeStoryboardWidgetWorkflowOutputEdgeProperties,
  WORKFLOW_OUTPUT_EDGE_MODE_PROPERTY,
} from '@/components/StoryboardWidgetCanvas/runtime/storyboardWidgetWorkflowOutputEdge'
import { hasCurrentStoryboardWidgetRunMaterializationLayout } from './storyboardWidgetRunExecutionAnchor'
import {
  collectProbeTreeThreadNodeIds as collectThreadNodeIds,
  readProbeTreeLayoutProperties as readProperties,
  readProbeTreeLayoutRecord as readRecord,
  readProbeTreeLayoutString as readString,
  resolveCanonicalProbeTreeThreadRootId as resolveCanonicalThreadRootId,
} from './storyboardWidgetProbeTreeLayoutGraph'

export const PROBE_TREE_OUTPUT_KEY = 'probe-tree-branches'
export const PROBE_TREE_OUTPUT_LABEL = 'Probe-Tree Branches'
export const PROBE_TREE_OUTPUT_LAYOUT_VERSION = 3
export const PROBE_TREE_GRAPH_LAYOUT_VERSION_PROPERTY = 'probeTreeBalancedLayoutByThread' as const

const BRANCH_COLUMN_OFFSET = RICH_MEDIA_PANEL_DEFAULT_WIDTH_PX + 70
const BRANCH_VERTICAL_STEP = resolveCanvasAspectRatioSize({
  defaultWidth: RICH_MEDIA_PANEL_DEFAULT_WIDTH_PX,
  mode: '9:16',
}).height + 40
const BRANCH_WATERFALL_STAGGER = 130
const BRANCH_VERTICAL_COLLISION_TOLERANCE = BRANCH_VERTICAL_STEP
const OUTPUT_PANEL_COLUMN_OFFSET = BRANCH_COLUMN_OFFSET
export const PROBE_TREE_OUTPUT_RIGHTMOST_X_PROPERTY = 'probeTreeOutputRightmostBranchX' as const

const readNodePosition = (node: GraphNode): { x: number; y: number } => {
  const directX = Number(unwrapGraphCellValue(node.x))
  const directY = Number(unwrapGraphCellValue(node.y))
  const position = readRecord((node as GraphNode & { position?: unknown }).position)
  const nestedX = Number(unwrapGraphCellValue(position.x))
  const nestedY = Number(unwrapGraphCellValue(position.y))
  return {
    x: Number.isFinite(directX) ? directX : Number.isFinite(nestedX) ? nestedX : 0,
    y: Number.isFinite(directY) ? directY : Number.isFinite(nestedY) ? nestedY : 0,
  }
}

const hasFiniteNodePosition = (node: GraphNode): boolean => {
  const directX = Number(unwrapGraphCellValue(node.x))
  const directY = Number(unwrapGraphCellValue(node.y))
  if (Number.isFinite(directX) && Number.isFinite(directY)) return true
  const position = readRecord((node as GraphNode & { position?: unknown }).position)
  return Number.isFinite(Number(unwrapGraphCellValue(position.x)))
    && Number.isFinite(Number(unwrapGraphCellValue(position.y)))
}

const resolveProbeTreeLayoutObstacleNodeIds = (graphData: GraphData): ReadonlySet<string> | null => (
  isFrontmatterFlowGraph(graphData)
    ? new Set(deriveFrontmatterFlowOverlayNodeIds(filterGraphToFlowWidgetEligible(graphData)))
    : null
)

const isProbeTreeLayoutObstacle = (node: GraphNode, visibleNodeIds: ReadonlySet<string> | null): boolean => (
  readString(node.type) !== FLOW_RICH_MEDIA_PANEL_NODE_TYPE_ID
  && hasFiniteNodePosition(node)
  && (!visibleNodeIds || visibleNodeIds.has(readString(node.id)))
)

const hasCollisionFreeProbeTreePositions = (nodes: readonly GraphNode[]): boolean => {
  for (let leftIndex = 0; leftIndex < nodes.length; leftIndex += 1) {
    const left = readNodePosition(nodes[leftIndex]!)
    for (let rightIndex = leftIndex + 1; rightIndex < nodes.length; rightIndex += 1) {
      const right = readNodePosition(nodes[rightIndex]!)
      if (Math.abs(left.x - right.x) < RICH_MEDIA_PANEL_DEFAULT_WIDTH_PX
        && Math.abs(left.y - right.y) < BRANCH_VERTICAL_STEP - 40) return false
    }
  }
  return true
}

const hasBalancedProbeTreeFootprint = (nodes: readonly GraphNode[]): boolean => {
  const aspect = readProbeTreeFootprintAspect(
    nodes.map(readNodePosition),
    RICH_MEDIA_PANEL_DEFAULT_WIDTH_PX,
    BRANCH_VERTICAL_STEP - 40,
  )
  return aspect >= 0.35 && aspect <= 2.75
}

const readProbeTreeLayoutGridSize = (graphData: GraphData): number => {
  const settings = readRecord(graphData.metadata?.frontmatterFlowSettings)
  const configuredSize = Number(unwrapGraphCellValue(settings.gridSize))
  return clampSnapGridSize(Number.isFinite(configuredSize) ? configuredSize : SNAP_GRID_SIZE_DEFAULT)
}

const readProbeTreeThreadLayoutAuthority = (graphData: GraphData, threadRootId: string) => (
  readRecord(readRecord((graphData.metadata || {})[PROBE_TREE_GRAPH_LAYOUT_VERSION_PROPERTY])[threadRootId])
)

const hasCurrentProbeTreeThreadLayoutAuthority = (graphData: GraphData, threadRootId: string, gridSize: number): boolean => {
  const authority = readProbeTreeThreadLayoutAuthority(graphData, threadRootId)
  return Number(unwrapGraphCellValue(authority.version)) === PROBE_TREE_BALANCED_LAYOUT_VERSION
    && Number(unwrapGraphCellValue(authority.gridSize)) === gridSize
}

const writeProbeTreeThreadLayoutAuthority = (graphData: GraphData, threadRootId: string, gridSize: number): GraphData['metadata'] => ({
  ...(graphData.metadata || {}),
  [PROBE_TREE_GRAPH_LAYOUT_VERSION_PROPERTY]: {
    ...readRecord((graphData.metadata || {})[PROBE_TREE_GRAPH_LAYOUT_VERSION_PROPERTY]),
    [threadRootId]: {
      version: PROBE_TREE_BALANCED_LAYOUT_VERSION,
      gridSize,
    },
  },
}) as GraphData['metadata']

const isProbeTreeBranchNode = (node: GraphNode): boolean => {
  const properties = readProperties(node.properties)
  return readString(properties.cardTypeLabel) === 'Probe-Tree Card'
    || readString(properties.probeTreeCandidateKey).length > 0
    || readString(properties.probeTreeResponseMode).length > 0
}

const readProbeTreeBranchOrder = (node: GraphNode): number => {
  const properties = readProperties(node.properties)
  const indexMatch = readString(properties.index).match(/(\d+)/)
  return indexMatch ? Number(indexMatch[1]) : Number.POSITIVE_INFINITY
}

export function buildStoryboardWidgetProbeTreeOutputGroupId(threadRootId: string): string {
  return `probe-tree:${readString(threadRootId) || 'root'}`
}

export function mergeStoryboardWidgetProbeTreeOutputPanels(args: {
  graphData: GraphData
  liveGraphData: GraphData | null | undefined
}): GraphData {
  const liveOutputPanels = (args.liveGraphData?.nodes || []).filter(node => {
    if (readString(node.type) !== FLOW_RICH_MEDIA_PANEL_NODE_TYPE_ID) return false
    return readString(readProperties(node.properties).workflowOutputKey) === PROBE_TREE_OUTPUT_KEY
      || readString(node.label) === PROBE_TREE_OUTPUT_LABEL
  })
  if (liveOutputPanels.length === 0) return args.graphData
  const baseNodeIds = new Set((args.graphData.nodes || []).map(node => readString(node.id)).filter(Boolean))
  const liveOutputPanelIds = new Set(liveOutputPanels.map(node => readString(node.id)).filter(Boolean))
  const missingLiveOutputPanels = liveOutputPanels.filter(node => !baseNodeIds.has(readString(node.id)))
  const nodes = [
    ...(args.graphData.nodes || []),
    ...missingLiveOutputPanels,
  ]
  const edgeIds = new Set((args.graphData.edges || []).map(edge => readString(edge.id)).filter(Boolean))
  const livePanelEdges = (args.liveGraphData?.edges || []).filter(edge => {
    const { src, tgt } = readGraphEdgeEndpoints(edge)
    return liveOutputPanelIds.has(src) || liveOutputPanelIds.has(tgt)
  }).filter(edge => {
    const edgeId = readString(edge.id)
    return !edgeId || !edgeIds.has(edgeId)
  })
  const graphChanged = missingLiveOutputPanels.length > 0 || livePanelEdges.length > 0
  if (!graphChanged) return args.graphData
  return bumpStoryboardWidgetDraftGraphDataRevision({
    ...args.graphData,
    nodes,
    edges: [...(args.graphData.edges || []), ...livePanelEdges],
  })
}

export function resolveStoryboardWidgetProbeTreeBranchPositions(args: {
  graphData: GraphData
  anchorNode: GraphNode
  removedNodeIds: ReadonlySet<string>
  count: number
}): Array<{ x: number; y: number }> {
  const count = Math.max(0, Math.floor(args.count))
  if (count === 0) return []
  const gridSize = readProbeTreeLayoutGridSize(args.graphData)
  const anchorPosition = snapPointToGrid(readNodePosition(args.anchorNode), gridSize)
  const visibleNodeIds = resolveProbeTreeLayoutObstacleNodeIds(args.graphData)
  const retainedNodes = (args.graphData.nodes || [])
    .filter(node => !args.removedNodeIds.has(readString(node.id)))
    .filter(node => isProbeTreeLayoutObstacle(node, visibleNodeIds))
  const occupiedPositions = retainedNodes.map(readNodePosition)
  const anchorProperties = readProperties(args.anchorNode.properties)
  const threadRootId = readString(anchorProperties.probeTreeThreadRootId) || readString(args.anchorNode.id)
  const threadPositions = retainedNodes.filter(node => {
    const nodeId = readString(node.id)
    const properties = readProperties(node.properties)
    return nodeId === threadRootId || readString(properties.probeTreeThreadRootId) === threadRootId
  }).map(readNodePosition)
  return resolveBalancedProbeTreeBatchPositions({
    count,
    origin: anchorPosition,
    gridSize,
    columnOffset: BRANCH_COLUMN_OFFSET,
    verticalStep: BRANCH_VERTICAL_COLLISION_TOLERANCE,
    waterfallStagger: BRANCH_WATERFALL_STAGGER,
    cardWidth: RICH_MEDIA_PANEL_DEFAULT_WIDTH_PX,
    cardHeight: BRANCH_VERTICAL_STEP - 40,
    occupiedPositions,
    footprintPositions: threadPositions,
    startColumn: readString(args.anchorNode.id) === threadRootId ? 2 : 1,
  }).positions
}

export function resolveStoryboardWidgetProbeTreeOutputPanelPosition(args: {
  graphData: GraphData
  threadRootId: string
}): { x: number; y: number; rightmostThreadX: number; threadRootId: string } | null {
  const candidateThreadRootId = readString(args.threadRootId)
  if (!candidateThreadRootId) return null
  const threadRootId = resolveCanonicalThreadRootId(args.graphData, candidateThreadRootId)
  const rootNode = (args.graphData.nodes || []).find(node => readString(node.id) === threadRootId)
  if (!rootNode) return null
  const threadNodeIds = collectThreadNodeIds(args.graphData, threadRootId)
  const visibleNodeIds = resolveProbeTreeLayoutObstacleNodeIds(args.graphData)
  const rootPosition = readNodePosition(rootNode)
  const rightmostThreadX = Math.max(rootPosition.x, ...(args.graphData.nodes || [])
    .filter(node => threadNodeIds.has(readString(node.id)))
    .filter(node => readString(node.type) !== FLOW_RICH_MEDIA_PANEL_NODE_TYPE_ID)
    .filter(node => !visibleNodeIds || visibleNodeIds.has(readString(node.id)))
    .map(node => readNodePosition(node).x))
  const panelPosition = snapPointToGrid({
    x: rootPosition.x + OUTPUT_PANEL_COLUMN_OFFSET,
    y: rootPosition.y,
  }, readProbeTreeLayoutGridSize(args.graphData))
  return { ...panelPosition, rightmostThreadX, threadRootId }
}

export function normalizeStoryboardWidgetProbeTreeThreadLayout(args: {
  graphData: GraphData
  threadRootId: string
  forceLayout?: boolean
}): GraphData {
  const candidateThreadRootId = readString(args.threadRootId)
  if (!candidateThreadRootId) return args.graphData
  const threadRootId = resolveCanonicalThreadRootId(args.graphData, candidateThreadRootId)
  const rootNode = (args.graphData.nodes || []).find(node => readString(node.id) === threadRootId)
  if (!rootNode) return args.graphData
  const threadNodeIds = collectThreadNodeIds(args.graphData, threadRootId)
  const visibleNodeIds = resolveProbeTreeLayoutObstacleNodeIds(args.graphData)
  const graphOrderByNodeId = new Map((args.graphData.nodes || []).map((node, index) => [readString(node.id), index]))
  const branchNodes = (args.graphData.nodes || []).filter(node => (
    threadNodeIds.has(readString(node.id))
    && readString(node.id) !== threadRootId
    && readString(node.type) !== FLOW_RICH_MEDIA_PANEL_NODE_TYPE_ID
    && (!visibleNodeIds || visibleNodeIds.has(readString(node.id)))
    && isProbeTreeBranchNode(node)
  ))
  if (branchNodes.length === 0) return args.graphData
  const nodeById = new Map((args.graphData.nodes || []).map(node => [readString(node.id), node]))
  const gridSize = readProbeTreeLayoutGridSize(args.graphData)
  const occupiedOutsideThread = (args.graphData.nodes || []).filter(node => (
    !threadNodeIds.has(readString(node.id))
    && isProbeTreeLayoutObstacle(node, visibleNodeIds)
  ))
  const maxParentLocalHorizontalSpan = BRANCH_COLUMN_OFFSET * Math.max(
    2,
    occupiedOutsideThread.length + branchNodes.length,
  )
  const graphLayoutIsCurrent = hasCurrentProbeTreeThreadLayoutAuthority(args.graphData, threadRootId, gridSize)
  const positionsRemainGridSnapped = branchNodes.every(node => {
    if (!hasFiniteNodePosition(node)) return false
    const position = readNodePosition(node)
    const snapped = snapPointToGrid(position, gridSize)
    return snapped.x === position.x && snapped.y === position.y
  })
  const positionsRemainForward = branchNodes.every(node => {
    if (!hasFiniteNodePosition(node)) return false
    const properties = readProperties(node.properties)
    const parentNodeId = readString(properties.parentNodeId || properties.parentGraphNodeId)
    const parentNode = nodeById.get(parentNodeId)
    if (!parentNode) return false
    return readNodePosition(node).x - readNodePosition(parentNode).x >= RICH_MEDIA_PANEL_DEFAULT_WIDTH_PX
  })
  const positionsRemainParentLocal = branchNodes.every(node => {
    if (!hasFiniteNodePosition(node)) return false
    const properties = readProperties(node.properties)
    const parentNodeId = readString(properties.parentNodeId || properties.parentGraphNodeId)
    const parentNode = nodeById.get(parentNodeId)
    if (!parentNode) return false
    return readNodePosition(node).x - readNodePosition(parentNode).x <= maxParentLocalHorizontalSpan
  })
  const positionsRemainValid = positionsRemainGridSnapped
    && positionsRemainForward
    && positionsRemainParentLocal
    && hasCollisionFreeProbeTreePositions(branchNodes)
    && branchNodes.every(node => occupiedOutsideThread.every(occupied => !probeTreePositionsOverlap(
      readNodePosition(node),
      readNodePosition(occupied),
      RICH_MEDIA_PANEL_DEFAULT_WIDTH_PX,
      BRANCH_VERTICAL_STEP - 40,
    )))
    && hasBalancedProbeTreeFootprint([rootNode, ...branchNodes])
  const nodeMarkersAreCurrent = branchNodes.every(node => {
    const properties = readProperties(node.properties)
    return readString(properties[PROBE_TREE_LAYOUT_MODE_PROPERTY]) === PROBE_TREE_BALANCED_LAYOUT_MODE
      && Number(unwrapGraphCellValue(properties[PROBE_TREE_LAYOUT_VERSION_PROPERTY])) === PROBE_TREE_BALANCED_LAYOUT_VERSION
  })
  const viewportMaterializationLayoutIsCurrent = branchNodes.every(node => (
    hasCurrentStoryboardWidgetRunMaterializationLayout(readProperties(node.properties))
    && hasFiniteNodePosition(node)
  ))
  if (args.forceLayout !== true && viewportMaterializationLayoutIsCurrent) {
    if (nodeMarkersAreCurrent && graphLayoutIsCurrent) return args.graphData
    const branchNodeIds = new Set(branchNodes.map(node => readString(node.id)))
    const nodes = (args.graphData.nodes || []).map(node => {
      if (!branchNodeIds.has(readString(node.id))) return node
      return {
        ...node,
        properties: {
          ...readProperties(node.properties),
          probeTreeThreadRootId: threadRootId,
          [PROBE_TREE_LAYOUT_MODE_PROPERTY]: PROBE_TREE_BALANCED_LAYOUT_MODE,
          [PROBE_TREE_LAYOUT_VERSION_PROPERTY]: PROBE_TREE_BALANCED_LAYOUT_VERSION,
          [PROBE_TREE_PINNED_BY_DEFAULT_PROPERTY]: true,
        } as Record<string, JSONValue>,
      }
    })
    return bumpStoryboardWidgetDraftGraphDataRevision({
      ...args.graphData,
      nodes,
      metadata: writeProbeTreeThreadLayoutAuthority(args.graphData, threadRootId, gridSize),
    })
  }
  // Node-owned layout markers are the durable render authority. A source adapter may
  // temporarily omit graph metadata; valid marked nodes must not trigger revision churn.
  const requiresLayout = args.forceLayout === true || !nodeMarkersAreCurrent || !positionsRemainValid
  if (!requiresLayout) return args.graphData

  const isCurrentLayoutNode = (node: GraphNode): boolean => {
    const properties = readProperties(node.properties)
    return readString(properties[PROBE_TREE_LAYOUT_MODE_PROPERTY]) === PROBE_TREE_BALANCED_LAYOUT_MODE
      && Number(unwrapGraphCellValue(properties[PROBE_TREE_LAYOUT_VERSION_PROPERTY])) === PROBE_TREE_BALANCED_LAYOUT_VERSION
  }
  const currentLayoutNodes = branchNodes.filter(isCurrentLayoutNode)
  const pendingLayoutNodes = branchNodes.filter(node => !isCurrentLayoutNode(node))
  const canPreserveCurrentLayout = args.forceLayout !== true
    && (currentLayoutNodes.length > 0 || graphLayoutIsCurrent)
    && positionsRemainValid
  if (canPreserveCurrentLayout) {
    const pendingNodeIds = new Set(pendingLayoutNodes.map(node => readString(node.id)))
    const nodes = (args.graphData.nodes || []).map(node => {
      if (!pendingNodeIds.has(readString(node.id))) return node
      return {
        ...node,
        properties: {
          ...readProperties(node.properties),
          probeTreeThreadRootId: threadRootId,
          [PROBE_TREE_LAYOUT_MODE_PROPERTY]: PROBE_TREE_BALANCED_LAYOUT_MODE,
          [PROBE_TREE_LAYOUT_VERSION_PROPERTY]: PROBE_TREE_BALANCED_LAYOUT_VERSION,
          [PROBE_TREE_PINNED_BY_DEFAULT_PROPERTY]: true,
        } as Record<string, JSONValue>,
      }
    })
    return bumpStoryboardWidgetDraftGraphDataRevision({
      ...args.graphData,
      nodes,
      metadata: writeProbeTreeThreadLayoutAuthority(args.graphData, threadRootId, gridSize),
    })
  }

  const childrenByParentId = new Map<string, GraphNode[]>()
  for (const node of branchNodes) {
    const properties = readProperties(node.properties)
    const parentNodeId = readString(properties.parentNodeId || properties.parentGraphNodeId)
    if (!parentNodeId) continue
    childrenByParentId.set(parentNodeId, [...(childrenByParentId.get(parentNodeId) || []), node])
  }
  for (const children of childrenByParentId.values()) children.sort((left, right) => (
    readProbeTreeBranchOrder(left) - readProbeTreeBranchOrder(right)
      || (graphOrderByNodeId.get(readString(left.id)) ?? 0) - (graphOrderByNodeId.get(readString(right.id)) ?? 0)
  ))

  const rootPosition = snapPointToGrid(readNodePosition(rootNode), gridSize)
  const positionByNodeId = new Map<string, { x: number; y: number }>()
  const occupiedOutsidePositions = occupiedOutsideThread.map(readNodePosition)
  const placedNodeIds = new Set<string>([threadRootId])
  const parentQueue = [threadRootId]
  for (let parentIndex = 0; parentIndex < parentQueue.length; parentIndex += 1) {
    const parentNodeId = parentQueue[parentIndex]!
    const parentPosition = parentNodeId === threadRootId ? rootPosition : positionByNodeId.get(parentNodeId)
    if (!parentPosition) continue
    const children = (childrenByParentId.get(parentNodeId) || []).filter(node => !placedNodeIds.has(readString(node.id)))
    if (children.length === 0) continue
    const plannedPositions = [...positionByNodeId.values()]
    const placement = resolveBalancedProbeTreeBatchPositions({
      count: children.length,
      origin: parentPosition,
      gridSize,
      columnOffset: BRANCH_COLUMN_OFFSET,
      verticalStep: BRANCH_VERTICAL_COLLISION_TOLERANCE,
      waterfallStagger: BRANCH_WATERFALL_STAGGER,
      cardWidth: RICH_MEDIA_PANEL_DEFAULT_WIDTH_PX,
      cardHeight: BRANCH_VERTICAL_STEP - 40,
      occupiedPositions: [rootPosition, ...occupiedOutsidePositions, ...plannedPositions],
      footprintPositions: [rootPosition, ...plannedPositions],
      startColumn: parentNodeId === threadRootId ? 2 : 1,
      horizontalOffsetPenaltyWeight: 0.12,
      verticalOffsetPenaltyWeight: 0.32,
      maxVerticalOffsetSteps: 2,
    })
    for (let index = 0; index < children.length; index += 1) {
      const node = children[index]!
      const position = placement.positions[index]!
      const nodeId = readString(node.id)
      positionByNodeId.set(nodeId, position)
      placedNodeIds.add(nodeId)
      parentQueue.push(nodeId)
    }
  }

  const nodes = (args.graphData.nodes || []).map(node => {
    const position = positionByNodeId.get(readString(node.id))
    if (!position) return node
    return {
      ...node,
      x: position.x,
      y: position.y,
      properties: {
        ...readProperties(node.properties),
        probeTreeThreadRootId: threadRootId,
        [PROBE_TREE_LAYOUT_MODE_PROPERTY]: PROBE_TREE_BALANCED_LAYOUT_MODE,
        [PROBE_TREE_LAYOUT_VERSION_PROPERTY]: PROBE_TREE_BALANCED_LAYOUT_VERSION,
        [PROBE_TREE_PINNED_BY_DEFAULT_PROPERTY]: true,
      } as Record<string, JSONValue>,
    }
  })
  return bumpStoryboardWidgetDraftGraphDataRevision({
    ...args.graphData,
    nodes,
    metadata: writeProbeTreeThreadLayoutAuthority(args.graphData, threadRootId, gridSize),
  })
}

export function normalizeStoryboardWidgetProbeTreeOutputLayout(args: {
  graphData: GraphData
  threadRootId: string
  preserveCanonicalOutputEdges?: boolean
  forceThreadLayout?: boolean
}): GraphData {
  const candidateThreadRootId = readString(args.threadRootId)
  if (!candidateThreadRootId) return args.graphData
  const threadRootId = resolveCanonicalThreadRootId(args.graphData, candidateThreadRootId)
  const layoutGraphData = normalizeStoryboardWidgetProbeTreeThreadLayout({ graphData: args.graphData, threadRootId, forceLayout: args.forceThreadLayout })
  const layoutThreadNodeIds = collectThreadNodeIds(layoutGraphData, threadRootId)
  const threadGraphData = normalizeProbeTreeCandidateEdges({
    graphData: layoutGraphData,
    threadRootId,
    threadNodeIds: layoutThreadNodeIds,
  })
  const outputGroupId = buildStoryboardWidgetProbeTreeOutputGroupId(threadRootId)
  const threadNodeIds = collectThreadNodeIds(threadGraphData, threadRootId)
  const outputPanels = (threadGraphData.nodes || []).filter(node => {
    if (readString(node.type) !== FLOW_RICH_MEDIA_PANEL_NODE_TYPE_ID) return false
    const properties = readProperties(node.properties)
    if (readString(properties.workflowOutputKey) !== PROBE_TREE_OUTPUT_KEY
      && readString(node.label) !== PROBE_TREE_OUTPUT_LABEL) return false
    const groupId = readString(properties.workflowOutputGroupId)
    const ownerId = readString(properties.workflowOutputAnchorNodeId)
    return groupId === outputGroupId || threadNodeIds.has(ownerId)
  })
  if (outputPanels.length === 0) return threadGraphData
  const canonicalPanel = outputPanels.find(node => readString(readProperties(node.properties).workflowOutputGroupId) === outputGroupId)
    || outputPanels.find(node => readString(readProperties(node.properties).workflowOutputAnchorNodeId) === threadRootId)
    || outputPanels[0]!
  const canonicalPanelId = readString(canonicalPanel.id)
  const redundantPanelIds = new Set(outputPanels.map(node => readString(node.id)).filter(id => id && id !== canonicalPanelId))
  const canonicalProperties = readProperties(canonicalPanel.properties)
  const declaredCanonicalOwnerId = readString(canonicalProperties.workflowOutputAnchorNodeId)
  const canonicalOwnerId = (threadGraphData.nodes || []).some(node => readString(node.id) === declaredCanonicalOwnerId)
    ? declaredCanonicalOwnerId : threadRootId
  const rootNode = (threadGraphData.nodes || []).find(node => readString(node.id) === threadRootId) || canonicalPanel
  const rootPosition = readNodePosition(rootNode)
  const outputPanelPosition = resolveStoryboardWidgetProbeTreeOutputPanelPosition({
    graphData: threadGraphData,
    threadRootId,
  }) || {
    x: rootPosition.x + OUTPUT_PANEL_COLUMN_OFFSET,
    y: rootPosition.y,
    rightmostThreadX: rootPosition.x,
    threadRootId,
  }
  const { rightmostThreadX } = outputPanelPosition
  const canonicalPanelPosition = readNodePosition(canonicalPanel)
  const recordedRightmostThreadX = Number(unwrapGraphCellValue(canonicalProperties[PROBE_TREE_OUTPUT_RIGHTMOST_X_PROPERTY]))
  const viewportMaterializationLayoutIsCurrent =
    hasCurrentStoryboardWidgetRunMaterializationLayout(canonicalProperties)
  const requiresCanonicalPlacement = redundantPanelIds.size > 0
    || readString(canonicalProperties.workflowOutputGroupId) !== outputGroupId
    || Number(unwrapGraphCellValue(canonicalProperties.probeTreeOutputLayoutVersion)) !== PROBE_TREE_OUTPUT_LAYOUT_VERSION
    || readString(canonicalProperties[PROBE_TREE_LAYOUT_MODE_PROPERTY]) !== PROBE_TREE_BALANCED_LAYOUT_MODE
    || Number(unwrapGraphCellValue(canonicalProperties[PROBE_TREE_LAYOUT_VERSION_PROPERTY])) !== PROBE_TREE_BALANCED_LAYOUT_VERSION
    || unwrapGraphCellValue(canonicalProperties[PROBE_TREE_PINNED_BY_DEFAULT_PROPERTY]) !== true
    || recordedRightmostThreadX !== rightmostThreadX
    || (
      !viewportMaterializationLayoutIsCurrent
      && (
        canonicalPanelPosition.x !== outputPanelPosition.x
        || canonicalPanelPosition.y !== outputPanelPosition.y
      )
    )
  const nodes = (threadGraphData.nodes || [])
    .filter(node => !redundantPanelIds.has(readString(node.id)))
    .map(node => {
      if (readString(node.id) !== canonicalPanelId) return node
      return {
        ...node,
        ...(requiresCanonicalPlacement ? { x: outputPanelPosition.x, y: outputPanelPosition.y } : {}),
        properties: {
          ...readProperties(node.properties),
          workflowOutputGroupId: outputGroupId,
          workflowOutputAnchorNodeId: canonicalOwnerId,
          ...(args.preserveCanonicalOutputEdges === true ? { [WORKFLOW_OUTPUT_EDGE_MODE_PROPERTY]: undefined } : {}),
          probeTreeThreadLedger: true,
          probeTreeOutputLayoutVersion: PROBE_TREE_OUTPUT_LAYOUT_VERSION,
          [PROBE_TREE_OUTPUT_RIGHTMOST_X_PROPERTY]: rightmostThreadX,
          [PROBE_TREE_LAYOUT_MODE_PROPERTY]: PROBE_TREE_BALANCED_LAYOUT_MODE,
          [PROBE_TREE_LAYOUT_VERSION_PROPERTY]: PROBE_TREE_BALANCED_LAYOUT_VERSION,
          [PROBE_TREE_PINNED_BY_DEFAULT_PROPERTY]: true,
        } as Record<string, JSONValue>,
      }
    })
  const retainedEdges = (threadGraphData.edges || []).filter(edge => {
    const { src, tgt } = readGraphEdgeEndpoints(edge)
    if (redundantPanelIds.has(src) || redundantPanelIds.has(tgt)) return false
    if (tgt !== canonicalPanelId) return true
    if (args.preserveCanonicalOutputEdges === true) return true
    const properties = readProperties(edge.properties)
    return !(properties.workflowOutputEdge === true || readString(edge.label) === PROBE_TREE_OUTPUT_KEY)
  })
  const canonicalEdgeExists = retainedEdges.some(edge => {
    const { src, tgt } = readGraphEdgeEndpoints(edge)
    return src === canonicalOwnerId && tgt === canonicalPanelId
  })
  const shouldRepairCanonicalEdge = args.preserveCanonicalOutputEdges === true && !canonicalEdgeExists
  const edges = !shouldRepairCanonicalEdge ? retainedEdges : [...retainedEdges, {
    id: buildStoryboardWidgetWorkflowOutputEdgeId({
      sourceNodeId: canonicalOwnerId,
      targetNodeId: canonicalPanelId,
      outputKey: PROBE_TREE_OUTPUT_KEY,
      usedEdgeIds: new Set(retainedEdges.map(edge => readString(edge.id)).filter(Boolean)),
    }),
    source: canonicalOwnerId,
    target: canonicalPanelId,
    label: PROBE_TREE_OUTPUT_KEY,
    properties: mergeStoryboardWidgetWorkflowOutputEdgeProperties({}, {
      sourceNodeId: canonicalOwnerId,
      outputKey: PROBE_TREE_OUTPUT_KEY,
    }) as never,
  }]
  const canonicalNodeChanged = requiresCanonicalPlacement
    || readString(canonicalProperties.workflowOutputGroupId) !== outputGroupId
    || readString(canonicalProperties.workflowOutputAnchorNodeId) !== canonicalOwnerId
    || canonicalProperties.probeTreeThreadLedger !== true
  if (!canonicalNodeChanged
    && redundantPanelIds.size === 0
    && edges.length === (threadGraphData.edges || []).length
    && (args.preserveCanonicalOutputEdges !== true || canonicalProperties[WORKFLOW_OUTPUT_EDGE_MODE_PROPERTY] == null)) return threadGraphData
  return bumpStoryboardWidgetDraftGraphDataRevision({ ...threadGraphData, nodes, edges })
}

export function normalizeAllStoryboardWidgetProbeTreeOutputLayouts(graphData: GraphData, options?: { forceThreadLayout?: boolean }): GraphData {
  const ownerNodeIds = new Set<string>()
  for (const node of graphData.nodes || []) {
    const nodeId = readString(node.id)
    const properties = readProperties(node.properties)
    const isOutputPanel = readString(node.type) === FLOW_RICH_MEDIA_PANEL_NODE_TYPE_ID
      && (readString(properties.workflowOutputKey) === PROBE_TREE_OUTPUT_KEY
        || readString(node.label) === PROBE_TREE_OUTPUT_LABEL)
    if (isOutputPanel) {
      const outputOwnerId = readString(properties.workflowOutputAnchorNodeId)
      if (outputOwnerId) ownerNodeIds.add(outputOwnerId)
      continue
    }
    if (!isProbeTreeBranchNode(node)) continue
    const declaredThreadRootId = readString(properties.probeTreeThreadRootId)
    const parentNodeId = readString(properties.parentNodeId || properties.parentGraphNodeId)
    const candidateOwnerId = declaredThreadRootId || parentNodeId || nodeId
    if (candidateOwnerId) ownerNodeIds.add(candidateOwnerId)
  }
  const canonicalThreadRootIds = new Set([...ownerNodeIds]
    .map(ownerNodeId => resolveCanonicalThreadRootId(graphData, ownerNodeId))
    .filter(Boolean))
  let nextGraphData = graphData
  for (const threadRootId of canonicalThreadRootIds) {
    nextGraphData = normalizeStoryboardWidgetProbeTreeOutputLayout({
      graphData: nextGraphData,
      threadRootId,
      preserveCanonicalOutputEdges: true,
      forceThreadLayout: options?.forceThreadLayout,
    })
  }
  return nextGraphData
}
