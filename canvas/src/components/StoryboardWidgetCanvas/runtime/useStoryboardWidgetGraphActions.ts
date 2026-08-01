import React from 'react'

import type { ToolMode } from '@/components/StoryboardWidgetCanvas/storyboardWidgetCanvasShared'
import { useGraphStore } from '@/hooks/useGraphStore'
import { createUniqueId } from '@/lib/ids'
import type { GraphData, GraphNode } from '@/lib/graph/types'
import type { GraphSchema } from '@/lib/graph/schema'
import { pickDefaultFlowPortKey } from '@/lib/graph/flowPorts'
import { resolveGraphNodeByCanonicalId } from '@/lib/graph/canonicalNodeIds'
import { finalizeEdgeAuthoring } from '@/features/edge-creation/authoring'
import {
  bumpStoryboardWidgetDraftGraphDataRevision,
  hasStoryboardWidgetDraftGraphDataCanonicalSuperset,
  mergeStoryboardWidgetDraftGraphDataWithLiveAdditions,
} from '@/lib/storyboardWidget/storyboardWidgetDraftGraphData'
import { disableAutoZoomModesForUserGesture } from '@/lib/canvas/auto-zoom-modes'
import { FLOW_PORT_HANDLE_PREVIEW_EVENT, type FlowPortHandlePreviewDetail } from '@/components/StoryboardWidget/flowPortHandlePointerDrag'
import {
  buildFloatingPropsPanelAddedNode,
  commitFloatingPropsPanelAddedNode,
} from '@/lib/toolbar/floatingPropsPanelAddNode'
import { continueStoryboardWidgetMultiConnectSession } from '@/components/StoryboardWidgetCanvas/runtime/storyboardWidgetMultiConnectSession'
import { resolveStoryboardWidgetMultiSourceIds } from '@/components/StoryboardWidgetCanvas/runtime/storyboardWidgetMultiSourceEdgeSession'

function readDraftRevisionFloor(graphData: GraphData | null | undefined): number {
  const raw = (graphData?.metadata || {}) as Record<string, unknown>
  const revision = raw && typeof raw.graphDataRevision === 'number' && Number.isFinite(raw.graphDataRevision)
    ? raw.graphDataRevision
    : 0
  return Math.max(0, Math.floor(revision))
}

function addStoryboardWidgetUsedNodeIdVariants(out: Set<string>, rawId: unknown): void {
  const id = String(rawId || '').trim()
  if (!id) return
  out.add(id)
  const parts = id.split('::').map(part => part.trim()).filter(Boolean)
  const suffix = parts.length > 1 ? parts[parts.length - 1] : ''
  if (suffix) out.add(suffix)
}

export function resolveStoryboardWidgetEdgeAuthoringNodeId(graphData: GraphData | null, rawNodeId: unknown): string | null {
  return String(resolveGraphNodeByCanonicalId(graphData, rawNodeId)?.id || '').trim() || null
}

export function appendStoryboardWidgetDraftNode(graphData: GraphData, node: GraphNode, opts?: { revisionFloor?: number | null }): GraphData {
  const id = String(node?.id || '').trim()
  if (!id) return graphData
  const nodes = Array.isArray(graphData.nodes) ? graphData.nodes : []
  if (nodes.some(candidate => String(candidate.id || '') === id)) return graphData
  return bumpStoryboardWidgetDraftGraphDataRevision(
    { ...graphData, nodes: [...nodes, node], edges: Array.isArray(graphData.edges) ? graphData.edges : [] },
    opts,
  )
}

export function resolveStoryboardWidgetPostCommitDraftGraphData(args: {
  liveGraphData: GraphData | null
  draftGraphData: GraphData | null
  fallbackGraphData: GraphData
  committedNode: GraphNode
  revisionFloor?: number | null
}): GraphData {
  const liveContainsCommittedNode = Boolean(
    resolveGraphNodeByCanonicalId(args.liveGraphData, args.committedNode.id),
  )
  const liveGraphData = liveContainsCommittedNode ? args.liveGraphData! : null
  const liveContainsWholeDraft = hasStoryboardWidgetDraftGraphDataCanonicalSuperset(
    liveGraphData,
    args.draftGraphData,
  )
  const authoritativeGraphData = liveGraphData && args.draftGraphData && !liveContainsWholeDraft
    ? mergeStoryboardWidgetDraftGraphDataWithLiveAdditions({
        liveGraphData,
        draftGraphData: args.draftGraphData,
      })
    : liveGraphData || args.draftGraphData || args.fallbackGraphData
  return appendStoryboardWidgetDraftNode(authoritativeGraphData, args.committedNode, {
    revisionFloor: args.revisionFloor,
  })
}

export function appendStoryboardWidgetAuthoredEdge(graphData: GraphData, edge: GraphData['edges'][number], opts?: { revisionFloor?: number | null }): GraphData {
  const edges = Array.isArray(graphData.edges) ? graphData.edges : []
  if (edges.some(candidate => String(candidate.id || '') === String(edge.id || ''))) return graphData
  return bumpStoryboardWidgetDraftGraphDataRevision({ ...graphData, edges: [...edges, edge] }, opts)
}

export function publishStoryboardWidgetAuthoredGraphMutation(args: {
  nextGraphData: GraphData
  draftGraphDataRef: { current: GraphData | null }
  setDraftGraphData: (graphData: GraphData) => void
  persistDraftGraphData?: (graphData: GraphData) => void
}): void {
  args.draftGraphDataRef.current = args.nextGraphData
  args.setDraftGraphData(args.nextGraphData)
  args.persistDraftGraphData?.(args.nextGraphData)
}

export function useStoryboardWidgetGraphActions(args: {
  active: boolean
  draftGraphData: GraphData | null
  draftGraphDataRef: React.MutableRefObject<GraphData | null>
  setDraftGraphData: React.Dispatch<React.SetStateAction<GraphData | null>>
  baseGraphData: GraphData | null
  schema: GraphSchema
  selectedNodeId: string | null
  selectedNodeIds: ReadonlyArray<string>
  toolMode: ToolMode
  pendingEdgeSourceId: string | null
  pendingEdgeSourceIds: ReadonlyArray<string>
  pendingEdgeSourcePortKey: string | null
  extraGraphNodesById?: Readonly<Record<string, GraphNode>> | null
  pendingSelectNodeIdRef: React.MutableRefObject<string | null>
  setSelectionSource: (source: 'canvas' | 'menu' | 'toolbar' | 'editor' | 'unknown') => void
  selectNode: (nodeId: string | null) => void
  selectEdge: (edgeId: string | null) => void
  addEdge: (edge: GraphData['edges'][number]) => void
  addNode: (node: GraphNode) => void
  persistDraftGraphData?: (graphData: GraphData) => void
  setToolMode: React.Dispatch<React.SetStateAction<ToolMode>>
  setPendingEdgeSourceId: React.Dispatch<React.SetStateAction<string | null>>
  setPendingEdgeSourceIds: React.Dispatch<React.SetStateAction<string[]>>
  setPendingEdgeSourcePortKey: React.Dispatch<React.SetStateAction<string | null>>
  upsertUiToast: (args: { id: string; kind: 'neutral' | 'warning' | 'success' | 'error'; message: string; ttlMs?: number }) => void
}) {
  const portHandleDragPreviewActiveRef = React.useRef(false)
  const materializeConnectedMediaValue = React.useCallback((materializeArgs: {
    sourceNode: GraphNode | null
    targetNode: GraphNode | null
    sourcePort: string | null
    targetPort: string | null
  }) => {
    const sourcePort = String(materializeArgs.sourcePort || '').trim()
    const targetPort = String(materializeArgs.targetPort || '').trim()
    if (!sourcePort || !targetPort) return
    if (!/^(mediaUrl|imageUrl|videoUrl)$/i.test(targetPort)) return
    const sourceProperties = (materializeArgs.sourceNode?.properties || {}) as Record<string, unknown>
    const targetProperties = (materializeArgs.targetNode?.properties || {}) as Record<string, unknown>
    const sourceCandidates = [
      sourceProperties[sourcePort],
      sourceProperties[targetPort],
      sourceProperties.mediaUrl,
      sourceProperties.renderUrl,
      sourceProperties.sourceUrl,
      sourceProperties.url,
    ]
    const value = sourceCandidates
      .map(candidate => (typeof candidate === 'string' ? candidate.trim() : ''))
      .find(Boolean) || ''
    if (!value) return
    if (String(targetProperties[targetPort] || '').trim() === value) return
    const liveGraphData = useGraphStore.getState().graphData as GraphData | null
    const rawTargetId = String(materializeArgs.targetNode?.id || '').trim()
    const resolvedTargetId = String(resolveGraphNodeByCanonicalId(liveGraphData, rawTargetId)?.id || '').trim()
    const targetIds = Array.from(new Set([resolvedTargetId, rawTargetId].filter(Boolean)))
    if (targetIds.length === 0) return
    for (const targetId of targetIds) {
      useGraphStore.getState().updateNode(targetId, {
        properties: {
          ...targetProperties,
          [targetPort]: value,
        } as never,
      })
    }
  }, [])

  const readLiveGraphData = React.useCallback((): GraphData | null => {
    return (useGraphStore.getState().graphData as GraphData | null) || null
  }, [])

  const readAuthoringGraphData = React.useCallback((): GraphData | null => {
    const base = args.draftGraphDataRef.current || readLiveGraphData() || args.draftGraphData || args.baseGraphData || null
    const extraNodesById = args.extraGraphNodesById || null
    if (!base || !extraNodesById) return base
    const nodes = Array.isArray(base.nodes) ? base.nodes : []
    const nodeIds = new Set(nodes.map(node => String(node?.id || '').trim()).filter(Boolean))
    const extraNodes = Object.values(extraNodesById).filter(node => {
      const id = String(node?.id || '').trim()
      return id && !nodeIds.has(id)
    })
    if (extraNodes.length === 0) return base
    return { ...base, nodes: [...nodes, ...extraNodes] }
  }, [args, readLiveGraphData])

  const readCommittedNodeIds = React.useCallback((): Set<string> => {
    const committed = readLiveGraphData() || args.draftGraphDataRef.current || args.draftGraphData || null
    return new Set(((committed?.nodes || []) as GraphNode[]).map(node => String(node.id || '')).filter(Boolean))
  }, [args, readLiveGraphData])

  const publishDraftEdge = React.useCallback((
    authoringGraphData: GraphData,
    edge: GraphData['edges'][number],
  ): boolean => {
    const source = resolveStoryboardWidgetEdgeAuthoringNodeId(authoringGraphData, edge.source)
    const target = resolveStoryboardWidgetEdgeAuthoringNodeId(authoringGraphData, edge.target)
    if (!source || !target || source === target) return false
    const normalizedEdge = { ...edge, source, target }
    const existing = (authoringGraphData.edges || []).some(candidate => (
      String(candidate.id || '').trim() === String(normalizedEdge.id || '').trim()
    ))
    if (existing) return true
    const revisionFloor = Math.max(
      readDraftRevisionFloor(authoringGraphData),
      readDraftRevisionFloor(args.draftGraphDataRef.current),
      readDraftRevisionFloor(readLiveGraphData()),
      readDraftRevisionFloor(args.baseGraphData),
    )
    const nextDraftGraphData = appendStoryboardWidgetAuthoredEdge(
      authoringGraphData,
      normalizedEdge,
      { revisionFloor },
    )
    args.addEdge(normalizedEdge)
    publishStoryboardWidgetAuthoredGraphMutation({
      nextGraphData: nextDraftGraphData,
      draftGraphDataRef: args.draftGraphDataRef,
      setDraftGraphData: args.setDraftGraphData,
      persistDraftGraphData: args.persistDraftGraphData,
    })
    return true
  }, [args, readLiveGraphData])

  const appendDraftEdge = React.useCallback((edge: GraphData['edges'][number]): boolean => {
    const authoringGraphData = readAuthoringGraphData()
    return authoringGraphData ? publishDraftEdge(authoringGraphData, edge) : false
  }, [publishDraftEdge, readAuthoringGraphData])

  const beginAddEdgeFromNode = React.useCallback(
    (nodeId: string, portKey?: string | null) => {
      if (!args.active) return
      const authoringGraphData = readAuthoringGraphData()
      if (!authoringGraphData) return
      const id = resolveStoryboardWidgetEdgeAuthoringNodeId(authoringGraphData, nodeId)
      if (!id) return
      const nodeById = new Map((authoringGraphData.nodes || []).map(node => [String(node.id || ''), node] as const))
      const node = nodeById.get(id) || null
      const explicit = typeof portKey === 'string' && portKey.trim() ? portKey.trim() : null
      const defaultPortKey = explicit || pickDefaultFlowPortKey(node, 'out') || null
      const sourceNodeIds = resolveStoryboardWidgetMultiSourceIds({
        graphData: authoringGraphData,
        selectedNodeIds: args.selectedNodeIds,
        primarySourceNodeId: id,
      })
      args.setSelectionSource('canvas')
      args.selectEdge(null)
      args.selectNode(id)
      args.setToolMode('addEdge')
      args.setPendingEdgeSourceId(id)
      args.setPendingEdgeSourceIds(sourceNodeIds)
      args.setPendingEdgeSourcePortKey(defaultPortKey)
    },
    [args, readAuthoringGraphData],
  )

  const finalizePendingEdge = React.useCallback(
    (nodeId: string, portKey?: string | null, source?: { nodeId: string; portKey: string | null }) => {
      if (!args.active) return
      const authoringGraphData = readAuthoringGraphData()
      if (!authoringGraphData) return
      const id = resolveStoryboardWidgetEdgeAuthoringNodeId(authoringGraphData, nodeId)
      if (!id) return
      const baseNodeIds = readCommittedNodeIds()
      const requestedSourceId = resolveStoryboardWidgetEdgeAuthoringNodeId(authoringGraphData, source?.nodeId || args.pendingEdgeSourceId)
      const requestedSourcePortKey = String(source?.portKey || args.pendingEdgeSourcePortKey || '').trim() || null
      if (!requestedSourceId) {
        if (args.toolMode !== 'addEdge') return
        args.setPendingEdgeSourceId(id)
        args.setPendingEdgeSourceIds([id])
        args.setPendingEdgeSourcePortKey(null)
        return
      }
      const sourceNodeIds = resolveStoryboardWidgetMultiSourceIds({
        graphData: authoringGraphData,
        selectedNodeIds: args.pendingEdgeSourceIds,
        primarySourceNodeId: requestedSourceId,
        targetNodeId: id,
      })
      if (sourceNodeIds.length === 0) return
      const explicitTarget = typeof portKey === 'string' && portKey.trim() ? portKey.trim() : null
      let lastSuccessfulEdgeId = ''
      let successfulSourceCount = 0
      let blockedSourceCount = 0
      let primarySourcePort = requestedSourcePortKey
      let firstBlockedMessage = ''

      for (const sourceNodeId of sourceNodeIds) {
        const currentGraphData = readAuthoringGraphData()
        if (!currentGraphData) continue
        const nodeById = new Map((currentGraphData.nodes || []).map(node => [String(node.id || ''), node] as const))
        const sourceNode = nodeById.get(sourceNodeId) || null
        const targetNode = nodeById.get(id) || null
        const sourcePort = (
          sourceNodeId === requestedSourceId ? requestedSourcePortKey : null
        ) || pickDefaultFlowPortKey(sourceNode, 'out') || null
        const targetPort = explicitTarget || pickDefaultFlowPortKey(targetNode, 'in') || null
        if (sourceNodeId === requestedSourceId) primarySourcePort = sourcePort
        const result = finalizeEdgeAuthoring({
          mode: 'create',
          data: currentGraphData,
          schema: args.schema,
          label: 'linksTo',
          selectedEdgeId: null,
          from: { nodeId: sourceNodeId, portKey: sourcePort },
          to: { nodeId: id, portKey: targetPort },
        })
        if (result.kind === 'blocked') {
          blockedSourceCount += 1
          if (!firstBlockedMessage) {
            firstBlockedMessage =
              result.reason === 'socket'
                ? `Incompatible port types: ${result.outType || '∅'} → ${result.inType || '∅'}.`
                : result.reason === 'schema'
                  ? 'Edge blocked by schema rules.'
                  : ''
          }
          continue
        }
        if (result.kind === 'select-existing') {
          lastSuccessfulEdgeId = String(result.edgeId || '')
          successfulSourceCount += 1
          continue
        }
        if (result.kind === 'create') {
          const sourceId = String(sourceNode?.id || '')
          const targetId = String(targetNode?.id || '')
          if (sourceNode && !baseNodeIds.has(sourceId)) {
            args.addNode(sourceNode)
            baseNodeIds.add(sourceId)
          }
          if (targetNode && !baseNodeIds.has(targetId)) {
            args.addNode(targetNode)
            baseNodeIds.add(targetId)
          }
          if (!publishDraftEdge(currentGraphData, result.edge)) continue
          materializeConnectedMediaValue({ sourceNode, targetNode, sourcePort, targetPort })
          lastSuccessfulEdgeId = String(result.edge.id || '')
          successfulSourceCount += 1
          continue
        }
      }

      if (!lastSuccessfulEdgeId) {
        if (firstBlockedMessage) {
          args.upsertUiToast({
            id: 'storyboard-widget-edge-denied',
            kind: 'warning',
            message: firstBlockedMessage,
            ttlMs: 2200,
          })
        }
        return
      }
      disableAutoZoomModesForUserGesture(useGraphStore.getState())
      continueStoryboardWidgetMultiConnectSession({
        edgeId: lastSuccessfulEdgeId,
        sourceNodeId: requestedSourceId,
        sourceNodeIds,
        sourcePortKey: primarySourcePort,
        setSelectionSource: args.setSelectionSource,
        selectEdge: args.selectEdge,
        selectNode: args.selectNode,
        setPendingEdgeSourceId: args.setPendingEdgeSourceId,
        setPendingEdgeSourceIds: args.setPendingEdgeSourceIds,
        setPendingEdgeSourcePortKey: args.setPendingEdgeSourcePortKey,
        setToolMode: args.setToolMode,
      })
      if (sourceNodeIds.length > 1) {
        args.upsertUiToast({
          id: 'storyboard-widget-multi-source-edge-result',
          kind: blockedSourceCount > 0 ? 'warning' : 'success',
          message: blockedSourceCount > 0
            ? `Connected ${successfulSourceCount} of ${sourceNodeIds.length} sources; ${blockedSourceCount} incompatible.`
            : `Connected ${successfulSourceCount} sources to one input.`,
          ttlMs: 2200,
        })
      }
    },
    [args, materializeConnectedMediaValue, publishDraftEdge, readAuthoringGraphData, readCommittedNodeIds],
  )

  const cancelPendingEdge = React.useCallback(() => {
    if (!args.active) return
    args.setPendingEdgeSourceId(null)
    args.setPendingEdgeSourceIds([])
    args.setPendingEdgeSourcePortKey(null)
    args.setToolMode('select')
  }, [args])

  React.useEffect(() => {
    if (args.toolMode !== 'addEdge') {
      portHandleDragPreviewActiveRef.current = false
      return
    }
    if (typeof document === 'undefined') return
    const handlePreview = (event: Event) => {
      const detail = (event as CustomEvent<FlowPortHandlePreviewDetail>).detail
      const previewSourceId = String(detail?.sourceNodeId || '').trim()
      if (!previewSourceId || previewSourceId !== String(args.pendingEdgeSourceId || '').trim()) return
      portHandleDragPreviewActiveRef.current = detail?.phase !== 'cancel'
    }
    document.addEventListener(FLOW_PORT_HANDLE_PREVIEW_EVENT, handlePreview)
    return () => {
      document.removeEventListener(FLOW_PORT_HANDLE_PREVIEW_EVENT, handlePreview)
      portHandleDragPreviewActiveRef.current = false
    }
  }, [args.pendingEdgeSourceId, args.toolMode])

  React.useEffect(() => {
    if (!args.active) return
    if (args.toolMode !== 'addEdge') return
    if (!args.selectedNodeId) return
    if (portHandleDragPreviewActiveRef.current) return
    finalizePendingEdge(args.selectedNodeId)
  }, [args.active, args.selectedNodeId, args.toolMode, finalizePendingEdge])

  const appendDraftNode = React.useCallback(
    (nodeArgs: {
      id?: string | null
      type: string
      label?: string | null
      x: number
      y: number
      fx?: number | null
      fy?: number | null
      vx?: number | null
      vy?: number | null
      properties?: Record<string, unknown>
      skipPendingSelect?: boolean
    }) => {
      const base: GraphData = (args.draftGraphDataRef.current || args.draftGraphData || args.baseGraphData || {
        context: '',
        type: 'Graph',
        nodes: [],
        edges: [],
      }) as GraphData
      const used = new Set<string>()
      for (const node of base.nodes || []) addStoryboardWidgetUsedNodeIdVariants(used, node?.id)
      const requested = typeof nodeArgs.id === 'string' && nodeArgs.id.trim() ? nodeArgs.id.trim() : ''
      const id = requested && !used.has(requested) ? requested : createUniqueId('n', used)

      const x = Number.isFinite(nodeArgs.x) ? nodeArgs.x : 0
      const y = Number.isFinite(nodeArgs.y) ? nodeArgs.y : 0
      const type = String(nodeArgs.type || '').trim() || 'Node'
      const label = String(nodeArgs.label || '').trim() || id
      const nextNode = buildFloatingPropsPanelAddedNode({
        id,
        type,
        label,
        point: { x, y },
        fx: nodeArgs.fx,
        fy: nodeArgs.fy,
        vx: nodeArgs.vx,
        vy: nodeArgs.vy,
        properties: nodeArgs.properties || {},
      })
      const beforeIds = new Set<string>((useGraphStore.getState().graphData?.nodes || []).map(node => String(node.id || '')).filter(Boolean))
      const committedId = commitFloatingPropsPanelAddedNode({
        node: nextNode,
        addNode: args.addNode,
        readGraphData: () => useGraphStore.getState().graphData as GraphData | null,
      })
      const committedGraph = useGraphStore.getState().graphData as GraphData | null
      const committedNodes = Array.isArray(committedGraph?.nodes) ? (committedGraph.nodes as GraphNode[]) : []
      const canonicalId = resolveGraphNodeByCanonicalId(committedGraph, id)?.id
      const insertedId = committedNodes.find(node => {
        const nodeId = String(node.id || '')
        if (!nodeId || beforeIds.has(nodeId)) return false
        return String(node.type || '').trim() === type && String(node.label || '').trim() === label
      })?.id
      const actualId = String(canonicalId || insertedId || committedId || '').trim()
      if (!actualId) return ''
      const liveGraphData = readLiveGraphData()
      const revisionFloor = Math.max(
        readDraftRevisionFloor(base),
        readDraftRevisionFloor(liveGraphData),
        readDraftRevisionFloor(args.baseGraphData),
      )
      const draftNode: GraphNode = { ...nextNode, id: actualId }
      const nextDraftGraphData = resolveStoryboardWidgetPostCommitDraftGraphData({
        liveGraphData,
        draftGraphData: args.draftGraphDataRef.current,
        fallbackGraphData: base,
        committedNode: draftNode,
        revisionFloor,
      })
      if (nextDraftGraphData !== args.draftGraphDataRef.current) {
        publishStoryboardWidgetAuthoredGraphMutation({
          nextGraphData: nextDraftGraphData,
          draftGraphDataRef: args.draftGraphDataRef,
          setDraftGraphData: args.setDraftGraphData,
          persistDraftGraphData: args.persistDraftGraphData,
        })
      }
      if (nodeArgs.skipPendingSelect !== true) args.pendingSelectNodeIdRef.current = actualId
      return actualId
    },
    [args, readLiveGraphData],
  )

  return {
    appendDraftEdge,
    appendDraftNode,
    beginAddEdgeFromNode,
    cancelPendingEdge,
    finalizePendingEdge,
  }
}
