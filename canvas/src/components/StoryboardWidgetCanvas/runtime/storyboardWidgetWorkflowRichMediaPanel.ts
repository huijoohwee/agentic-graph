import { FLOW_RICH_MEDIA_PANEL_NODE_LABEL, FLOW_RICH_MEDIA_PANEL_NODE_TYPE_ID } from '@/lib/config'
import { createUniqueId } from '@/lib/ids'
import { readGraphEdgeEndpoints } from '@/lib/graph/edgeEndpoints'
import {
  IMAGE_TO_THREEJS_OUTPUT_PANEL_ANCHOR_ID_PROPERTY,
  IMAGE_TO_THREEJS_OUTPUT_PANEL_LABEL,
  IMAGE_TO_THREEJS_OUTPUT_PANEL_PROPERTY,
  isImageToThreeJsOutputPanel,
} from '@/features/image-to-threejs/imageToThreeJsContract'
import {
  IMAGE_TO_GLB_OUTPUT_PANEL_ANCHOR_ID_PROPERTY,
  IMAGE_TO_GLB_OUTPUT_PANEL_LABEL,
  IMAGE_TO_GLB_OUTPUT_PANEL_PROPERTY,
  isImageToGlbOutputPanel,
} from '@/features/image-to-glb/imageToGlbContract'
import { bumpStoryboardWidgetDraftGraphDataRevision } from '@/lib/storyboardWidget/storyboardWidgetDraftGraphData'
import type { GraphData, GraphEdge, GraphNode } from '@/lib/graph/types'
import { isCanonicalNodeIdEqual, resolveGraphNodeByCanonicalId } from '@/lib/graph/canonicalNodeIds'
import { readGraphNodeProperties } from '@/lib/cards/graphNodeCardFields'
import {
  listStoryboardWidgetWorkflowNodesAcrossGraphs,
  type StoryboardWidgetWorkflowNodeResolutionContext,
} from '@/components/StoryboardWidgetCanvas/runtime/storyboardWidgetRenderGraph'
import {
  areStoryboardWidgetWorkflowRecordValuesEqual,
} from '@/components/StoryboardWidgetCanvas/runtime/storyboardWidgetWorkflowWriteback'
import {
  buildStoryboardWidgetWorkflowOutputEdgeId,
  hasCanonicalStoryboardWidgetWorkflowOutputEdgeProperties,
  isStoryboardWidgetWorkflowOutputEdge,
  mergeStoryboardWidgetWorkflowOutputEdgeProperties,
  WORKFLOW_OUTPUT_EDGE_MODE_MANUAL,
  WORKFLOW_OUTPUT_EDGE_MODE_PROPERTY,
} from '@/components/StoryboardWidgetCanvas/runtime/storyboardWidgetWorkflowOutputEdge'
import {
  mergeStoryboardWidgetWorkflowPropertyPatch,
  readStoryboardWidgetWorkflowString as cleanString,
  resolveStoryboardWidgetWorkflowOutputPanelPosition,
  STORYBOARD_WIDGET_WORKFLOW_OUTPUT_PANEL_LAYOUT_VERSION,
  STORYBOARD_WIDGET_WORKFLOW_OUTPUT_PANEL_LAYOUT_VERSION_PROPERTY,
} from './storyboardWidgetWorkflowOutputPanelPlacement'
import {
  PROBE_TREE_OUTPUT_KEY,
  PROBE_TREE_OUTPUT_LAYOUT_VERSION,
  PROBE_TREE_OUTPUT_RIGHTMOST_X_PROPERTY,
  resolveStoryboardWidgetProbeTreeOutputPanelPosition,
} from './storyboardWidgetProbeTreeLayout'
import {
  PROBE_TREE_BALANCED_LAYOUT_MODE,
  PROBE_TREE_BALANCED_LAYOUT_VERSION,
  PROBE_TREE_LAYOUT_MODE_PROPERTY,
  PROBE_TREE_LAYOUT_VERSION_PROPERTY,
  PROBE_TREE_PINNED_BY_DEFAULT_PROPERTY,
} from '@/lib/storyboardWidget/probeTreeLayoutContract'
import {
  buildStoryboardWidgetRunMaterializationLayoutProperties,
} from './storyboardWidgetRunExecutionAnchor'

export {
  mergeStoryboardWidgetWorkflowPropertyPatch,
  normalizeStoryboardWidgetWorkflowOwnedRichMediaPanelPlacement,
  resolveStoryboardWidgetWorkflowOutputPanelPosition,
  STORYBOARD_WIDGET_WORKFLOW_OUTPUT_PANEL_LAYOUT_VERSION,
  STORYBOARD_WIDGET_WORKFLOW_OUTPUT_PANEL_LAYOUT_VERSION_PROPERTY,
} from './storyboardWidgetWorkflowOutputPanelPlacement'

export {
  IMAGE_TO_THREEJS_OUTPUT_PANEL_ANCHOR_ID_PROPERTY,
  IMAGE_TO_THREEJS_OUTPUT_PANEL_LABEL,
  IMAGE_TO_THREEJS_OUTPUT_PANEL_PROPERTY,
}

export {
  IMAGE_TO_GLB_OUTPUT_PANEL_ANCHOR_ID_PROPERTY,
  IMAGE_TO_GLB_OUTPUT_PANEL_LABEL,
  IMAGE_TO_GLB_OUTPUT_PANEL_PROPERTY,
}

export const IMAGE_TO_THREEJS_OUTPUT_EDGE_PROPERTY = 'imageThreeJsOutputEdge' as const
export const IMAGE_TO_THREEJS_OUTPUT_EDGE_LABEL = 'image.to-threejs output' as const
export const IMAGE_TO_GLB_OUTPUT_EDGE_PROPERTY = 'imageGlbOutputEdge' as const
export const IMAGE_TO_GLB_OUTPUT_EDGE_LABEL = 'image.to-glb output' as const
export { WORKFLOW_OUTPUT_EDGE_MODE_MANUAL, WORKFLOW_OUTPUT_EDGE_MODE_PROPERTY }

function listStoryboardWidgetWorkflowRichMediaPanelSearchNodes(args: {
  context: StoryboardWidgetWorkflowNodeResolutionContext
  graphForRun: GraphData | null
  readLiveDraftGraphData: () => GraphData | null
}): GraphNode[] {
  const out: GraphNode[] = []
  const seenNodeIds = new Set<string>()
  const appendUnique = (node: GraphNode) => {
    const nodeId = cleanString(node?.id)
    if (nodeId && seenNodeIds.has(nodeId)) return
    if (nodeId) seenNodeIds.add(nodeId)
    out.push(node)
  }
  const liveDraft = args.readLiveDraftGraphData()
  const liveDraftNodes = Array.isArray(liveDraft?.nodes) ? (liveDraft!.nodes as GraphNode[]) : []
  for (let i = 0; i < liveDraftNodes.length; i += 1) appendUnique(liveDraftNodes[i]!)
  const fallbackNodes = listStoryboardWidgetWorkflowNodesAcrossGraphs({
    context: args.context,
    graphForRun: args.graphForRun,
  })
  for (let i = 0; i < fallbackNodes.length; i += 1) appendUnique(fallbackNodes[i]!)
  return out
}

export function resolveStoryboardWidgetWorkflowRichMediaPanelTargetNodeId(args: {
  context: StoryboardWidgetWorkflowNodeResolutionContext
  graphForRun: GraphData | null
  readLiveDraftGraphData: () => GraphData | null
  anchorNodeId?: string | null
  outputKey?: string | null
  outputGroupId?: string | null
}): string | null {
  const allNodes = listStoryboardWidgetWorkflowRichMediaPanelSearchNodes(args)
  const panels = allNodes.filter(n => cleanString(n.type) === FLOW_RICH_MEDIA_PANEL_NODE_TYPE_ID)
  if (panels.length === 0) return null
  const anchorNodeId = cleanString(args.anchorNodeId)
  const outputKey = cleanString(args.outputKey)
  const outputGroupId = cleanString(args.outputGroupId)
  if (outputGroupId && outputKey === PROBE_TREE_OUTPUT_KEY) {
    const groupedPanel = panels.find(node => {
      const properties = readGraphNodeProperties(node)
      return cleanString(properties.workflowOutputGroupId) === outputGroupId
        && cleanString(properties.workflowOutputKey) === outputKey
    })
    if (groupedPanel) return cleanString(groupedPanel.id) || null
  }
  if (anchorNodeId && outputKey) {
    const exactPanel = panels.find(n => {
      const p = readGraphNodeProperties(n)
      return cleanString(p.workflowOutputAnchorNodeId) === anchorNodeId && cleanString(p.workflowOutputKey) === outputKey
    })
    if (exactPanel) return cleanString(exactPanel.id) || null
    return null
  }
  const activePanel = panels.find(n => {
    const p = readGraphNodeProperties(n)
    return (typeof p.outputSrcDoc === 'string' && p.outputSrcDoc.trim()) || (typeof p.output === 'string' && p.output.trim())
  })
  return cleanString((activePanel || panels[0])?.id) || null
}

export function ensureStoryboardWidgetWorkflowRichMediaPanelNodeId(args: {
  context: StoryboardWidgetWorkflowNodeResolutionContext
  graphForRun: GraphData | null
  allowCreateRichMediaPanel: boolean
  anchorNode: GraphNode
  readLiveDraftGraphData: () => GraphData | null
  outputKey?: string | null
  outputGroupId?: string | null
  outputThreadRootId?: string | null
  outputLabel?: string | null
  outputIndex?: number
  materializationPosition?: { x: number; y: number } | null
  appendDraftNode: (args: {
    id?: string | null
    type: string
    label?: string | null
    x: number
    y: number
    properties?: Record<string, unknown>
  }) => string
}): string | null {
  const existing = resolveStoryboardWidgetWorkflowRichMediaPanelTargetNodeId({
    context: args.context,
    graphForRun: args.graphForRun,
    readLiveDraftGraphData: args.readLiveDraftGraphData,
    anchorNodeId: cleanString(args.anchorNode.id),
    outputKey: args.outputKey,
    outputGroupId: args.outputGroupId,
  })
  if (existing) return existing
  if (!args.allowCreateRichMediaPanel) return null
  const liveDraftGraphData = args.readLiveDraftGraphData()
  if (!liveDraftGraphData) return null
  const probeTreePanelPosition = cleanString(args.outputKey) === PROBE_TREE_OUTPUT_KEY
    && cleanString(args.outputThreadRootId)
    ? resolveStoryboardWidgetProbeTreeOutputPanelPosition({
        graphData: liveDraftGraphData,
        threadRootId: cleanString(args.outputThreadRootId),
      })
    : null
  const ownedOutputPanelPosition = resolveStoryboardWidgetWorkflowOutputPanelPosition({
    anchorNode: args.anchorNode,
    liveDraftGraphData,
    outputIndex: args.outputIndex,
  })
  return args.appendDraftNode({
    id: null,
    type: FLOW_RICH_MEDIA_PANEL_NODE_TYPE_ID,
    label: cleanString(args.outputLabel) || FLOW_RICH_MEDIA_PANEL_NODE_LABEL,
    x: Number.isFinite(args.materializationPosition?.x)
      ? Number(args.materializationPosition?.x)
      : probeTreePanelPosition?.x ?? ownedOutputPanelPosition.x,
    y: Number.isFinite(args.materializationPosition?.y)
      ? Number(args.materializationPosition?.y)
      : probeTreePanelPosition?.y ?? ownedOutputPanelPosition.y,
    properties: {
      media_interactive: true,
      ...(cleanString(args.outputKey) ? {
        workflowOutputAnchorNodeId: cleanString(args.anchorNode.id),
        workflowOutputKey: cleanString(args.outputKey),
      } : {}),
      ...(cleanString(args.outputKey) && cleanString(args.outputKey) !== PROBE_TREE_OUTPUT_KEY ? {
        [STORYBOARD_WIDGET_WORKFLOW_OUTPUT_PANEL_LAYOUT_VERSION_PROPERTY]:
          STORYBOARD_WIDGET_WORKFLOW_OUTPUT_PANEL_LAYOUT_VERSION,
      } : {}),
      ...(args.materializationPosition
        ? buildStoryboardWidgetRunMaterializationLayoutProperties()
        : {}),
      ...(cleanString(args.outputGroupId) ? { workflowOutputGroupId: cleanString(args.outputGroupId) } : {}),
      ...(probeTreePanelPosition ? {
        probeTreeThreadLedger: true,
        probeTreeOutputLayoutVersion: PROBE_TREE_OUTPUT_LAYOUT_VERSION,
        [PROBE_TREE_OUTPUT_RIGHTMOST_X_PROPERTY]: probeTreePanelPosition.rightmostThreadX,
        [PROBE_TREE_LAYOUT_MODE_PROPERTY]: PROBE_TREE_BALANCED_LAYOUT_MODE,
        [PROBE_TREE_LAYOUT_VERSION_PROPERTY]: PROBE_TREE_BALANCED_LAYOUT_VERSION,
        [PROBE_TREE_PINNED_BY_DEFAULT_PROPERTY]: true,
      } : {}),
    },
  })
}

type ImageDerivedOutputPanelArgs = {
  context: StoryboardWidgetWorkflowNodeResolutionContext
  graphForRun: GraphData | null
  anchorNode: GraphNode
  readLiveDraftGraphData: () => GraphData | null
}

type ImageDerivedOutputPanelMarker = {
  anchorIdProperty: string
  label: string
  panelProperty: string
  isOutputPanel: (properties: unknown) => boolean
}

function resolveStoryboardWidgetImageDerivedOutputPanelNodeId(
  args: ImageDerivedOutputPanelArgs,
  marker: ImageDerivedOutputPanelMarker,
): string | null {
  const anchorNodeId = cleanString(args.anchorNode.id)
  if (!anchorNodeId) return null
  const liveDraft = args.readLiveDraftGraphData()
  const searchNodes = liveDraft && Array.isArray(liveDraft.nodes)
    ? liveDraft.nodes
    : listStoryboardWidgetWorkflowRichMediaPanelSearchNodes(args)
  const outputPanel = searchNodes.find(node => {
    if (cleanString(node.type) !== FLOW_RICH_MEDIA_PANEL_NODE_TYPE_ID) return false
    const properties = (node.properties || {}) as Record<string, unknown>
    return marker.isOutputPanel(properties)
      && cleanString(properties[marker.anchorIdProperty]) === anchorNodeId
  })
  return cleanString(outputPanel?.id) || null
}

type EnsureImageDerivedOutputPanelArgs = ImageDerivedOutputPanelArgs & {
  allowCreateRichMediaPanel: boolean
  appendDraftNode: (args: {
    id?: string | null
    type: string
    label?: string | null
    x: number
    y: number
    properties?: Record<string, unknown>
  }) => string
}

function ensureStoryboardWidgetImageDerivedOutputPanelNodeId(
  args: EnsureImageDerivedOutputPanelArgs,
  marker: ImageDerivedOutputPanelMarker,
): string | null {
  const existing = resolveStoryboardWidgetImageDerivedOutputPanelNodeId(args, marker)
  if (existing) return existing
  if (!args.allowCreateRichMediaPanel || !args.readLiveDraftGraphData()) return null
  const anchorNodeId = cleanString(args.anchorNode.id)
  if (!anchorNodeId) return null
  return args.appendDraftNode({
    id: null,
    type: FLOW_RICH_MEDIA_PANEL_NODE_TYPE_ID,
    label: marker.label,
    x: (Number.isFinite(args.anchorNode.x) ? args.anchorNode.x : 0) + 520,
    y: Number.isFinite(args.anchorNode.y) ? args.anchorNode.y : 0,
    properties: {
      media_interactive: true,
      [marker.panelProperty]: true,
      [marker.anchorIdProperty]: anchorNodeId,
    },
  })
}

const IMAGE_TO_THREEJS_OUTPUT_MARKER: ImageDerivedOutputPanelMarker = {
  anchorIdProperty: IMAGE_TO_THREEJS_OUTPUT_PANEL_ANCHOR_ID_PROPERTY,
  label: IMAGE_TO_THREEJS_OUTPUT_PANEL_LABEL,
  panelProperty: IMAGE_TO_THREEJS_OUTPUT_PANEL_PROPERTY,
  isOutputPanel: isImageToThreeJsOutputPanel,
}

const IMAGE_TO_GLB_OUTPUT_MARKER: ImageDerivedOutputPanelMarker = {
  anchorIdProperty: IMAGE_TO_GLB_OUTPUT_PANEL_ANCHOR_ID_PROPERTY,
  label: IMAGE_TO_GLB_OUTPUT_PANEL_LABEL,
  panelProperty: IMAGE_TO_GLB_OUTPUT_PANEL_PROPERTY,
  isOutputPanel: isImageToGlbOutputPanel,
}

export function resolveStoryboardWidgetImageToThreeJsOutputPanelNodeId(args: ImageDerivedOutputPanelArgs): string | null {
  return resolveStoryboardWidgetImageDerivedOutputPanelNodeId(args, IMAGE_TO_THREEJS_OUTPUT_MARKER)
}

export function resolveStoryboardWidgetImageToGlbOutputPanelNodeId(args: ImageDerivedOutputPanelArgs): string | null {
  return resolveStoryboardWidgetImageDerivedOutputPanelNodeId(args, IMAGE_TO_GLB_OUTPUT_MARKER)
}

export function ensureStoryboardWidgetImageToThreeJsOutputPanelNodeId(args: EnsureImageDerivedOutputPanelArgs): string | null {
  return ensureStoryboardWidgetImageDerivedOutputPanelNodeId(args, IMAGE_TO_THREEJS_OUTPUT_MARKER)
}

export function ensureStoryboardWidgetImageToGlbOutputPanelNodeId(args: EnsureImageDerivedOutputPanelArgs): string | null {
  return ensureStoryboardWidgetImageDerivedOutputPanelNodeId(args, IMAGE_TO_GLB_OUTPUT_MARKER)
}

type ImageDerivedOutputEdgeMarker = {
  anchorIdProperty: string
  edgeLabel: string
  edgeProperty: string
  targetIdProperty: string
}

function ensureStoryboardWidgetImageDerivedOutputEdge(args: {
  anchorNode: GraphNode
  outputPanelNodeId: string
  readLiveDraftGraphData: () => GraphData | null
  commitDraftGraphDataUpdate: (currentDraft: GraphData, nextDraft: GraphData) => void
  scheduleWorkflowOutputEdgeRefresh: () => void
}, marker: ImageDerivedOutputEdgeMarker): GraphEdge | null {
  const sourceId = cleanString(args.anchorNode.id)
  const targetId = cleanString(args.outputPanelNodeId)
  if (!sourceId || !targetId || sourceId === targetId) return null

  const currentDraft = args.readLiveDraftGraphData()
  if (!currentDraft || !Array.isArray(currentDraft.edges)) return null
  const existing = currentDraft.edges.find(edge => {
    const endpoints = readGraphEdgeEndpoints(edge)
    return endpoints.src === sourceId && endpoints.tgt === targetId
  }) || null
  if (existing) return existing

  const usedEdgeIds = new Set(
    currentDraft.edges
      .map(edge => cleanString(edge?.id))
      .filter(Boolean),
  )
  const edge: GraphEdge = {
    id: createUniqueId('e', usedEdgeIds),
    source: sourceId,
    target: targetId,
    label: marker.edgeLabel,
    properties: {
      [marker.edgeProperty]: true,
      [marker.anchorIdProperty]: sourceId,
      [marker.targetIdProperty]: targetId,
    },
  }
  args.commitDraftGraphDataUpdate(
    currentDraft,
    bumpStoryboardWidgetDraftGraphDataRevision({ ...currentDraft, edges: [...currentDraft.edges, edge] }),
  )
  args.scheduleWorkflowOutputEdgeRefresh()
  return edge
}

export function ensureStoryboardWidgetImageToThreeJsOutputEdge(args: {
  anchorNode: GraphNode
  outputPanelNodeId: string
  readLiveDraftGraphData: () => GraphData | null
  commitDraftGraphDataUpdate: (currentDraft: GraphData, nextDraft: GraphData) => void
  scheduleWorkflowOutputEdgeRefresh: () => void
}): GraphEdge | null {
  return ensureStoryboardWidgetImageDerivedOutputEdge(args, {
    anchorIdProperty: IMAGE_TO_THREEJS_OUTPUT_PANEL_ANCHOR_ID_PROPERTY,
    edgeLabel: IMAGE_TO_THREEJS_OUTPUT_EDGE_LABEL,
    edgeProperty: IMAGE_TO_THREEJS_OUTPUT_EDGE_PROPERTY,
    targetIdProperty: 'imageThreeJsOutputPanelNodeId',
  })
}

export function ensureStoryboardWidgetImageToGlbOutputEdge(args: {
  anchorNode: GraphNode
  outputPanelNodeId: string
  readLiveDraftGraphData: () => GraphData | null
  commitDraftGraphDataUpdate: (currentDraft: GraphData, nextDraft: GraphData) => void
  scheduleWorkflowOutputEdgeRefresh: () => void
}): GraphEdge | null {
  return ensureStoryboardWidgetImageDerivedOutputEdge(args, {
    anchorIdProperty: IMAGE_TO_GLB_OUTPUT_PANEL_ANCHOR_ID_PROPERTY,
    edgeLabel: IMAGE_TO_GLB_OUTPUT_EDGE_LABEL,
    edgeProperty: IMAGE_TO_GLB_OUTPUT_EDGE_PROPERTY,
    targetIdProperty: 'imageGlbOutputPanelNodeId',
  })
}

export function preserveStoryboardWidgetWorkflowInputTopology(args: {
  graphData: GraphData
  anchorNode: GraphNode
}): GraphData {
  const anchorNodeId = cleanString(args.anchorNode.id)
  if (!anchorNodeId) return args.graphData
  const currentNodes = Array.isArray(args.graphData.nodes) ? args.graphData.nodes : []
  const anchorExists = currentNodes.some(node => isCanonicalNodeIdEqual(node.id, anchorNodeId))
  const nodes = anchorExists ? currentNodes : [args.anchorNode, ...currentNodes]
  const currentEdges = Array.isArray(args.graphData.edges) ? args.graphData.edges : []
  const edges = [...currentEdges]
  const usedEdgeIds = new Set(edges.map(edge => cleanString(edge.id)).filter(Boolean))
  let changed = !anchorExists
  for (const panel of nodes) {
    if (cleanString(panel.type) !== FLOW_RICH_MEDIA_PANEL_NODE_TYPE_ID) continue
    const panelNodeId = cleanString(panel.id)
    const properties = readGraphNodeProperties(panel)
    if (!panelNodeId || !isCanonicalNodeIdEqual(properties.workflowOutputAnchorNodeId, anchorNodeId)) continue
    if (cleanString(properties[WORKFLOW_OUTPUT_EDGE_MODE_PROPERTY]) === WORKFLOW_OUTPUT_EDGE_MODE_MANUAL) continue
    const existingEdgeIndex = edges.findIndex(edge => {
      const endpoints = readGraphEdgeEndpoints(edge)
      return isCanonicalNodeIdEqual(endpoints.src, anchorNodeId) && isCanonicalNodeIdEqual(endpoints.tgt, panelNodeId)
    })
    const outputKey = cleanString(properties.workflowOutputKey) || 'output'
    if (existingEdgeIndex >= 0) {
      const existingEdge = edges[existingEdgeIndex]!
      if (!isStoryboardWidgetWorkflowOutputEdge(existingEdge.properties)) continue
      if (hasCanonicalStoryboardWidgetWorkflowOutputEdgeProperties(existingEdge.properties, {
        sourceNodeId: anchorNodeId,
        outputKey,
      })) continue
      edges[existingEdgeIndex] = {
        ...existingEdge,
        properties: mergeStoryboardWidgetWorkflowOutputEdgeProperties(existingEdge.properties, {
          sourceNodeId: anchorNodeId,
          outputKey,
        }) as never,
      }
      changed = true
      continue
    }
    const edgeId = buildStoryboardWidgetWorkflowOutputEdgeId({ sourceNodeId: anchorNodeId, targetNodeId: panelNodeId, outputKey, usedEdgeIds })
    usedEdgeIds.add(edgeId)
    edges.push({
      id: edgeId,
      source: anchorNodeId,
      target: panelNodeId,
      label: outputKey,
      properties: mergeStoryboardWidgetWorkflowOutputEdgeProperties({}, {
        sourceNodeId: anchorNodeId,
        outputKey,
      }) as never,
    })
    changed = true
  }
  if (!changed) return args.graphData
  return bumpStoryboardWidgetDraftGraphDataRevision({ ...args.graphData, nodes, edges })
}

export function ensureStoryboardWidgetWorkflowOutputEdge(args: {
  anchorNodeId: string
  panelNodeId: string
  outputKey?: string | null
  sourcePortKey?: string | null
  targetPortKey?: string | null
  readLiveDraftGraphData: () => GraphData | null
  commitDraftGraphDataUpdate: (currentDraft: GraphData, nextDraft: GraphData) => void
  scheduleWorkflowOutputEdgeRefresh: () => void
}): boolean {
  const currentDraft = args.readLiveDraftGraphData()
  if (!currentDraft) return false
  const sourceNodeId = cleanString(resolveGraphNodeByCanonicalId(currentDraft, args.anchorNodeId)?.id)
  const targetNodeId = cleanString(resolveGraphNodeByCanonicalId(currentDraft, args.panelNodeId)?.id)
  if (!sourceNodeId || !targetNodeId || sourceNodeId === targetNodeId) return false
  const edges = Array.isArray(currentDraft.edges) ? currentDraft.edges : []
  const existingEdgeIndex = edges.findIndex(edge => {
    const endpoints = readGraphEdgeEndpoints(edge)
    return isCanonicalNodeIdEqual(endpoints.src, sourceNodeId) && isCanonicalNodeIdEqual(endpoints.tgt, targetNodeId)
  })
  if (existingEdgeIndex >= 0) {
    const existingEdge = edges[existingEdgeIndex]!
    if (!isStoryboardWidgetWorkflowOutputEdge(existingEdge.properties)) return false
    if (hasCanonicalStoryboardWidgetWorkflowOutputEdgeProperties(existingEdge.properties, {
      sourceNodeId,
      outputKey: args.outputKey,
      sourcePortKey: args.sourcePortKey,
      targetPortKey: args.targetPortKey,
    })) return false
    const nextEdges = edges.map((edge, index) => index === existingEdgeIndex ? {
      ...edge,
      properties: mergeStoryboardWidgetWorkflowOutputEdgeProperties(edge.properties, {
        sourceNodeId,
        outputKey: args.outputKey,
        sourcePortKey: args.sourcePortKey,
        targetPortKey: args.targetPortKey,
      }) as never,
    } : edge)
    args.commitDraftGraphDataUpdate(
      currentDraft,
      bumpStoryboardWidgetDraftGraphDataRevision({ ...currentDraft, edges: nextEdges }),
    )
    args.scheduleWorkflowOutputEdgeRefresh()
    return true
  }
  const edgeId = buildStoryboardWidgetWorkflowOutputEdgeId({
    sourceNodeId,
    targetNodeId,
    outputKey: args.outputKey,
    usedEdgeIds: new Set(edges.map(edge => cleanString(edge?.id)).filter(Boolean)),
  })
  const outputKey = cleanString(args.outputKey) || 'output'
  const nextDraft = bumpStoryboardWidgetDraftGraphDataRevision({
    ...currentDraft,
    edges: [...edges, {
      id: edgeId,
      source: sourceNodeId,
      target: targetNodeId,
      label: outputKey,
      properties: mergeStoryboardWidgetWorkflowOutputEdgeProperties({}, {
        sourceNodeId,
        outputKey,
        sourcePortKey: args.sourcePortKey,
        targetPortKey: args.targetPortKey,
      }) as never,
    }],
  })
  args.commitDraftGraphDataUpdate(currentDraft, nextDraft)
  args.scheduleWorkflowOutputEdgeRefresh()
  return true
}

export function applyStoryboardWidgetWorkflowRichMediaPanelDraftPatch(args: {
  panelNodeId: string
  patch: Record<string, unknown>
  readLiveDraftGraphData: () => GraphData | null
  commitDraftGraphDataUpdate: (currentDraft: GraphData, nextDraft: GraphData) => void
  scheduleWorkflowOutputEdgeRefresh: () => void
}): GraphNode | null {
  const panelNodeId = String(args.panelNodeId || '').trim()
  if (!panelNodeId) return null
  const currentDraft = args.readLiveDraftGraphData()
  const currentPanel = Array.isArray(currentDraft?.nodes)
    ? currentDraft!.nodes.find(existing => cleanString(existing?.id) === panelNodeId) || null
    : null
  const currentProps = (currentPanel?.properties || {}) as Record<string, unknown>
  if (currentPanel && areStoryboardWidgetWorkflowRecordValuesEqual(currentProps, mergeStoryboardWidgetWorkflowPropertyPatch(currentProps, args.patch))) return currentPanel
  if (!currentDraft || !Array.isArray(currentDraft.nodes) || currentDraft.nodes.length === 0) return currentPanel

  let changed = false
  let updatedPanel: GraphNode | null = null
  const nextNodes = currentDraft.nodes.map(existing => {
    const existingId = cleanString(existing?.id)
    if (existingId !== panelNodeId) return existing
    const existingProps = (existing.properties || {}) as Record<string, unknown>
    const nextProps = mergeStoryboardWidgetWorkflowPropertyPatch(existingProps, args.patch)
    if (areStoryboardWidgetWorkflowRecordValuesEqual(existingProps, nextProps)) {
      updatedPanel = existing || null
      return existing
    }
    changed = true
    updatedPanel = { ...existing, properties: nextProps as never }
    return updatedPanel
  })
  if (!changed) return updatedPanel || currentPanel

  const nextDraft = bumpStoryboardWidgetDraftGraphDataRevision({ ...currentDraft, nodes: nextNodes })
  args.commitDraftGraphDataUpdate(currentDraft, nextDraft)
  args.scheduleWorkflowOutputEdgeRefresh()
  return updatedPanel
}
