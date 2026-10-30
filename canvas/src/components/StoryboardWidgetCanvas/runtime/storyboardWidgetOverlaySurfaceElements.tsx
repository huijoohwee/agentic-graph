import React from 'react'

import {
  StoryboardWidgetOverlay,
  type ToolMode,
} from '@/components/StoryboardWidgetCanvas/storyboardWidgetCanvasShared'
import { openWorkflowManagerMappingForNode } from '@/features/storyboard-widget-manager/openWorkflowManagerMappingForNode'
import type { WidgetRegistryEntry } from '@/features/storyboard-widget-manager/widgetRegistryTypes'
import { resolveRichMediaWidgetKind } from '@/features/chat/richMediaRun'
import type { FlowConnectedValuesBySchemaPath } from '@/lib/storyboardWidget/flowDataflow'
import { isCanonicalNodeIdEqual, resolveGraphNodeByCanonicalId } from '@/lib/graph/canonicalNodeIds'
import type { GraphData, GraphEdge, GraphNode } from '@/lib/graph/types'
import { buildGraphDocumentMetaKey } from '@/lib/graph/graphMetaKey'
import { isFrontmatterFlowGraph } from '@/lib/graph/frontmatterMode'
import type { WidgetEditorSurfaceKind } from '@/components/StoryboardWidget/flowWidgetOverlayShared'
import { orderStoryboardWidgetOverlayNodeIdsByRenderGraph } from '@/components/StoryboardWidgetCanvas/runtime/storyboardWidgetOverlayNodeOrder'
import { resolveStoryboardWidgetAutoRunNodeIds } from '@/components/StoryboardWidgetCanvas/runtime/storyboardWidgetAutoRunTargets'

const EMPTY_GRAPH_EDGES: GraphEdge[] = []

export function resolveStoryboardWidgetOverlayElementIdentity(args: {
  graphMetaKind?: string | null
  overlayNodeId: unknown
  node: Pick<GraphNode, 'id'> | null | undefined
}): {
  overlayIdentityId: string
  actionNodeId: string
  renderNodeId: string
} {
  const overlayNodeId = String(args.overlayNodeId || '').trim()
  const concreteNodeId = String(args.node?.id || '').trim() || overlayNodeId
  const graphMetaKind = String(args.graphMetaKind || '').trim()
  if (graphMetaKind !== 'frontmatter-flow') {
    const id = overlayNodeId || concreteNodeId
    return {
      overlayIdentityId: id,
      actionNodeId: concreteNodeId || id,
      renderNodeId: concreteNodeId || id,
    }
  }
  const renderNodeId = concreteNodeId || overlayNodeId
  return {
    overlayIdentityId: renderNodeId,
    actionNodeId: concreteNodeId || overlayNodeId || renderNodeId,
    renderNodeId,
  }
}

export function buildOverlayEditorElements(args: {
  overlayVisibilityActive: boolean
  renderGraphNodeById: ReadonlyMap<string, GraphNode>
  renderGraphIncidentEdgesByNodeId: ReadonlyMap<string, ReadonlyArray<GraphEdge>> | null
  renderGraphMetaKind: string | null
  renderGraphDataOverride: GraphData | null
  lastStableRenderGraphDataOverride: GraphData | null
  draftGraphDataRef?: React.MutableRefObject<GraphData | null>
  pendingOverlayNodeIdRef: React.MutableRefObject<string | null>
  pendingOverlayNode: GraphNode | null
  overlayEditorNodeIds: readonly string[]
  connectedValuesByNodeId: ReadonlyMap<string, FlowConnectedValuesBySchemaPath>
  storyboardWidgetSurfaceId: string
  editorSurfaceKind?: WidgetEditorSurfaceKind
  renderGraphSemanticKey: string
  canEdit: boolean
  widgetRegistry: ReadonlyArray<WidgetRegistryEntry>
  toolMode: ToolMode
  pendingEdgeSourceId: string | null
  viewportW: number
  viewportH: number
  canvasWindowOffset: { left: number; top: number }
  zoomViewKey: string | null
  lastDroppedWidgetNodeIdRef: React.MutableRefObject<string | null>
  lastDroppedWidgetToken: number
  getLiveNodeWorldPos?: (nodeId: string) => { x: number; y: number } | null
  getLiveZoomTransform?: () => { k: number; x: number; y: number } | null
  getLiveContainmentGroupAabbForNode?: (nodeId: string) => { groupId: string; minX: number; minY: number; maxX: number; maxY: number } | null
  beginAddEdgeFromNode: (nodeId: string, portKey?: string | null) => void
  finalizePendingEdge: (nodeId: string, portKey?: string | null, source?: { nodeId: string; portKey: string | null }) => void
  setNodeLabelById: (nodeId: string, label: string) => void
  setNodeTypeById: (nodeId: string, type: string) => void
  patchNodePropertiesById: (nodeId: string, patch: Record<string, unknown>) => void
  setNodePropertiesById: (nodeId: string, properties: Record<string, unknown>) => void
  validateNodeById: (nodeId: string) => void
  runWorkflowNode: (nodeId: string) => Promise<void> | void
  duplicateNodeById: (nodeId: string) => void
  removeNodeById: (nodeId: string) => void
  clearNodeOutputById: (nodeId: string) => void
  showNodeEditorHelp: () => void
  convertNodeToLoopById: (nodeId: string) => void
  enableHandlesForAllInputs: () => void
  renameSchemaFieldIdByNodeId: (nodeId: string, prevId: string, nextId: string) => void
  upsertUiToast: (args: { id: string; kind: 'neutral' | 'warning' | 'success' | 'error'; message: string; ttlMs?: number }) => void
  flowWidgetPinnedByNodeId?: Record<string, boolean>
  handlePinnedInCanvasChange: (pinnedInCanvas: boolean) => void
}): React.ReactElement[] {
  if (!args.overlayVisibilityActive) return []

  const currentGraphIsFrontmatterFlow = isFrontmatterFlowGraph(args.renderGraphDataOverride)
  const stableGraphIsFrontmatterFlow = isFrontmatterFlowGraph(args.lastStableRenderGraphDataOverride)
  const useStableFrontmatterGraphAuthority =
    !currentGraphIsFrontmatterFlow
    && stableGraphIsFrontmatterFlow
    && args.overlayEditorNodeIds.length > 0
  const graphMetaKind = args.renderGraphMetaKind
  const overlayGraphMetaKind = useStableFrontmatterGraphAuthority
    ? 'frontmatter-flow'
    : graphMetaKind || (currentGraphIsFrontmatterFlow ? 'frontmatter-flow' : null)
  const graphMetaKey = buildGraphDocumentMetaKey(
    useStableFrontmatterGraphAuthority
      ? args.lastStableRenderGraphDataOverride
      : args.renderGraphDataOverride,
  )
  const orderedOverlayEditorNodeIds = orderStoryboardWidgetOverlayNodeIdsByRenderGraph({
    ids: args.overlayEditorNodeIds,
    nodes: (
      useStableFrontmatterGraphAuthority
        ? args.lastStableRenderGraphDataOverride?.nodes
        : args.renderGraphDataOverride?.nodes
    ) || [],
    graphMetaKind: overlayGraphMetaKind,
  })
  const resolveNode = (id: string) => {
    const pending = args.pendingOverlayNodeIdRef.current
    if (pending && pending === id) return args.pendingOverlayNode
    const found = args.renderGraphNodeById.get(id) || null
    if (found) return found
    const canonicalMatch = resolveGraphNodeByCanonicalId(args.renderGraphDataOverride, id)
    if (canonicalMatch) return canonicalMatch
    if (useStableFrontmatterGraphAuthority) {
      const stableCanonicalMatch = resolveGraphNodeByCanonicalId(args.lastStableRenderGraphDataOverride, id)
      if (stableCanonicalMatch) return stableCanonicalMatch
    }
    return null
  }
  const elements: React.ReactElement[] = []
  const previewProps = args.pendingOverlayNode?.properties
  const geospatialPoiPreviewNodeId = previewProps?.richMediaActiveTab === 'poi' && String(previewProps.outputSrcDoc || '').trim()
    ? String(args.pendingOverlayNode?.id || '').trim()
    : ''

  for (let stackIndex = 0; stackIndex < orderedOverlayEditorNodeIds.length; stackIndex += 1) {
    const id = orderedOverlayEditorNodeIds[stackIndex]
    const node = resolveNode(id)
    if (!node) continue
    if (String(node.type || '') === 'Section') continue

    const identity = resolveStoryboardWidgetOverlayElementIdentity({ graphMetaKind: overlayGraphMetaKind, overlayNodeId: id, node })
    const actionNodeId = identity.actionNodeId || id
    const renderNode = identity.renderNodeId && identity.renderNodeId !== String(node.id || '').trim()
      ? { ...node, id: identity.renderNodeId }
      : node
    const autoRevealKey = id === String(args.lastDroppedWidgetNodeIdRef.current || '') ? args.lastDroppedWidgetToken : 0
    const connectedValuesBySchemaPath =
      args.connectedValuesByNodeId.get(id)
      || args.connectedValuesByNodeId.get(identity.renderNodeId)
      || args.connectedValuesByNodeId.get(identity.actionNodeId)
      || undefined
    const portHandleEdges =
      args.renderGraphIncidentEdgesByNodeId?.get(actionNodeId)
      || EMPTY_GRAPH_EDGES
    const graphMetaKind = overlayGraphMetaKind
    const overlayGraphInstanceKey = graphMetaKind === 'frontmatter-flow'
      ? String(graphMetaKey || '').trim() || String(args.renderGraphSemanticKey || '').trim() || 'graph'
      : String(args.renderGraphSemanticKey || '').trim() || String(graphMetaKey || '').trim() || 'graph'
    const overlayInstanceKey = [
      'qe',
      String(args.storyboardWidgetSurfaceId || '').trim() || 'surface',
      overlayGraphInstanceKey,
      identity.overlayIdentityId || id,
    ].join(':')
    const forceFloating = Boolean(
      geospatialPoiPreviewNodeId
      && [id, identity.actionNodeId, identity.renderNodeId].some(candidate =>
        isCanonicalNodeIdEqual(candidate, geospatialPoiPreviewNodeId),
      ),
    )

    elements.push(
      <StoryboardWidgetOverlay
        key={overlayInstanceKey}
        visible={args.overlayVisibilityActive}
        active={args.canEdit}
        forceFloating={forceFloating}
        storyboardWidgetSurfaceId={args.storyboardWidgetSurfaceId}
        editorSurfaceKind={args.editorSurfaceKind}
        overlayCollectiveCount={orderedOverlayEditorNodeIds.length}
        node={renderNode}
        nodeById={args.renderGraphNodeById}
        graphMetaKind={overlayGraphMetaKind}
        graphMetaKey={graphMetaKey}
        portHandleEdges={portHandleEdges}
        registryEntries={args.widgetRegistry}
        connectedValuesBySchemaPath={connectedValuesBySchemaPath}
        toolMode={args.toolMode}
        pendingEdgeSourceId={args.pendingEdgeSourceId}
        onBeginAddEdgeFromNode={args.beginAddEdgeFromNode}
        onFinalizeAddEdgeToNode={args.finalizePendingEdge}
        viewportW={args.viewportW}
        viewportH={args.viewportH}
        canvasWindowOffset={args.canvasWindowOffset}
        zoomViewKey={args.zoomViewKey}
        autoRevealKey={autoRevealKey}
        stackIndex={stackIndex}
        getLiveNodeWorldPos={args.getLiveNodeWorldPos}
        getLiveZoomTransform={args.getLiveZoomTransform}
        getLiveContainmentGroupAabbForNode={args.getLiveContainmentGroupAabbForNode}
        onSetLabel={(label) => args.setNodeLabelById(actionNodeId, label)}
        onSetType={(type) => args.setNodeTypeById(actionNodeId, type)}
        onPatchProperties={(patch) => args.patchNodePropertiesById(actionNodeId, patch)}
        onSetProperties={(props) => args.setNodePropertiesById(actionNodeId, props)}
        onValidate={() => args.validateNodeById(actionNodeId)}
        onRun={() => {
          const graphDataForRunResolution = args.draftGraphDataRef?.current
            || (useStableFrontmatterGraphAuthority
              ? args.lastStableRenderGraphDataOverride
              : args.renderGraphDataOverride)
          const targetNodeIds = resolveStoryboardWidgetAutoRunNodeIds({
            graphData: graphDataForRunResolution,
            nodeId: actionNodeId,
            resolveRichMediaKind: resolveRichMediaWidgetKind,
          })
          if (targetNodeIds.length === 0) {
            void args.runWorkflowNode(actionNodeId)
            return
          }
          for (const targetNodeId of targetNodeIds) {
            void args.runWorkflowNode(targetNodeId)
          }
        }}
        onDuplicate={() => {
          const pinnedMap = args.flowWidgetPinnedByNodeId || {}
          const pinned = !forceFloating && (
            pinnedMap[actionNodeId] === true || pinnedMap[identity.renderNodeId] === true
          )
          if (pinned) {
            args.upsertUiToast({
              id: `storyboard-widget-node-duplicate-disabled-${identity.overlayIdentityId || actionNodeId}`,
              kind: 'warning',
              message: 'Pinned widget blocks duplicate copy.',
              ttlMs: 2200,
            })
            return
          }
          args.duplicateNodeById(actionNodeId)
        }}
        onRemove={() => args.removeNodeById(actionNodeId)}
        onClearOutput={() => args.clearNodeOutputById(actionNodeId)}
        onHelp={args.showNodeEditorHelp}
        onConvertToLoopNode={() => args.convertNodeToLoopById(actionNodeId)}
        onEnableHandlesForAllInputs={args.enableHandlesForAllInputs}
        onUpdateKvEntry={() => {
          openWorkflowManagerMappingForNode({
            node: renderNode,
            registry: args.widgetRegistry,
            graphMetaKind: overlayGraphMetaKind,
          })
        }}
        onPinnedInCanvasChange={args.handlePinnedInCanvasChange}
        onRenameSchemaFieldId={({ prevId, nextId }) => args.renameSchemaFieldIdByNodeId(actionNodeId, prevId, nextId)}
      />,
    )
  }

  return elements
}
