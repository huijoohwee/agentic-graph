import React from 'react'

import { cloneGraphDataForRender } from '@/components/GraphCanvas/renderClone'
import { deriveSceneDisplayGraph } from '@/lib/scene/sceneDerivation'
import type { GraphData, GraphNode } from '@/lib/graph/types'
import { computeEffectiveFrontmatterMode, isStoryboardWidgetFrontmatterDocumentModeRequested } from '@/lib/graph/frontmatterMode'
import {
  buildCanonicalNodeIdSet,
  buildCanonicalNodeLookup,
  getCanonicalNodeLookupValue,
} from '@/lib/graph/canonicalNodeIds'
import { deriveFlowCanvasNativeSceneGraph } from '@/components/FlowCanvas/nativeSceneGraph'
import { buildDataflowWidgetRegistry } from '@/lib/storyboardWidget/widgetRegistryDataflow'
import { applyConnectedValuesToNodeForRender } from '@/lib/render/effectiveMediaNode'
import {
  buildRichMediaPanelOverlayExcludeNodeIdSet,
  computeRichMediaOverlayConnectedValuesByNodeId,
  isRichMediaConnectedValueTargetNode,
  listDisplayRichMediaOverlayNodes,
} from '@/lib/render/richMediaSsot'
import { pickGraphDataForFlowRenderer } from '@/components/FlowCanvas/shared'
import { isStoryboardWidgetSurfaceRenderer } from '@/lib/storyboardWidget/screenAuthorityCollectivePan'
import type { WidgetRegistryEntry } from '@/features/storyboard-widget-manager/widgetRegistryTypes'
import { getCachedGraphLookup } from '@/lib/graph/lookupCache'
import { buildScopedGraphSemanticKey } from '@/lib/graph/semanticKey'
import { hashScopedStringArraySignature, normalizeStringArrayForSignature } from '@/lib/hash/signature'
import { reportRuntimeTrace } from '@/lib/debug/runtimeTrace'

// #region debug-point A:flow-canvas-media-nodes
const STORYBOARD_MEDIA_PANEL_LOOP_TRACE_SCOPE = 'storyboard-media-panel-loop'
const reportStoryboardMediaPanelLoopFlowCanvasDebug = (args: {
  hypothesisId: 'A' | 'B' | 'C' | 'D' | 'E'
  location: string
  msg: string
  data?: Record<string, unknown>
}) => {
  reportRuntimeTrace({
    scope: STORYBOARD_MEDIA_PANEL_LOOP_TRACE_SCOPE,
    runId: 'runtime',
    hypothesisId: args.hypothesisId,
    location: args.location,
    msg: args.msg,
    data: args.data || {},
  })
}
// #endregion

const EMPTY_STRING_ARRAY: string[] = []

type UseFlowCanvasGraphStateArgs = {
  graphDataOverride: GraphData | null | undefined
  graphDataRevisionOverride?: number
  storeGraphData: GraphData | null
  baseGraphDataRevision: number
  selectedNodeId: string | null
  selectedNodeIds: string[]
  frontmatterModeEnabled: boolean
  documentSemanticMode: 'document' | 'keyword'
  documentStructureBaselineLock: boolean
  allowNodeDragOverride?: boolean
  canvas2dRenderer: string
  renderMediaAsNodes: boolean
  suppressMediaOverlays: boolean
  infiniteCanvasInteractionMode: 'static' | 'interactive'
  excludeRichMediaOverlayNodeIds?: string[]
  excludeNativeSceneNodeIds?: string[]
  openWidgetNodeIds: string[]
  widgetRegistry: WidgetRegistryEntry[]
  baseWidgetRegistry: WidgetRegistryEntry[]
  documentWidgetRegistry: WidgetRegistryEntry[]
  threeIframeOverlayPoolMax?: number
}

export function useFlowCanvasGraphState(args: UseFlowCanvasGraphStateArgs) {
  const {
    graphDataOverride,
    graphDataRevisionOverride,
    storeGraphData,
    baseGraphDataRevision,
    selectedNodeId,
    selectedNodeIds,
    frontmatterModeEnabled,
    documentSemanticMode,
    documentStructureBaselineLock,
    allowNodeDragOverride,
    canvas2dRenderer,
    renderMediaAsNodes,
    suppressMediaOverlays,
    excludeRichMediaOverlayNodeIds,
    excludeNativeSceneNodeIds,
    openWidgetNodeIds,
    widgetRegistry,
    baseWidgetRegistry,
    documentWidgetRegistry,
    threeIframeOverlayPoolMax,
  } = args

  const graphDataRevision = typeof graphDataRevisionOverride === 'number' ? graphDataRevisionOverride : baseGraphDataRevision
  const renderGraphData = React.useMemo(() => {
    return graphDataOverride !== undefined ? graphDataOverride : storeGraphData
  }, [graphDataOverride, storeGraphData])
  const authoritativeGraphNodeById = React.useMemo(() => {
    const nodes = Array.isArray(renderGraphData?.nodes) ? renderGraphData.nodes : []
    return new Map(nodes.map(node => [String(node?.id || '').trim(), node] as const).filter(([id]) => Boolean(id)))
  }, [renderGraphData])
  const allowMutations = allowNodeDragOverride !== false && documentStructureBaselineLock !== true
  const effectiveFrontmatter = React.useMemo(() => {
    return computeEffectiveFrontmatterMode({
      frontmatterModeEnabled: frontmatterModeEnabled === true,
      documentSemanticMode,
      graphData: renderGraphData,
    })
  }, [documentSemanticMode, frontmatterModeEnabled, renderGraphData])
  const storyboardWidgetFrontmatterInteractionMode = isStoryboardWidgetFrontmatterDocumentModeRequested({
    canvas2dRenderer: String(canvas2dRenderer || ''),
    frontmatterModeEnabled: frontmatterModeEnabled === true,
    documentSemanticMode: String(documentSemanticMode || ''),
  })
  const storyboardWidgetOverlayInteractionMode = isStoryboardWidgetSurfaceRenderer(canvas2dRenderer)

  const clonedGraphData = React.useMemo(() => {
    if (!renderGraphData) return null
    return cloneGraphDataForRender(renderGraphData) as GraphData
  }, [renderGraphData])

  const filteredGraphDataForRenderer = React.useMemo(() => {
    return pickGraphDataForFlowRenderer({
      graphData: clonedGraphData,
      effectiveFrontmatter,
      canvas2dRenderer,
    })
  }, [canvas2dRenderer, clonedGraphData, effectiveFrontmatter])

  const sceneDisplayGraphDerivation = React.useMemo(() => {
    if (!filteredGraphDataForRenderer) return null
    return deriveSceneDisplayGraph({ graphData: filteredGraphDataForRenderer })
  }, [filteredGraphDataForRenderer])

  const sceneGraphData = React.useMemo(() => {
    if (!filteredGraphDataForRenderer) return null
    return sceneDisplayGraphDerivation?.displayGraphData || filteredGraphDataForRenderer
  }, [filteredGraphDataForRenderer, sceneDisplayGraphDerivation])
  const sceneGraphSemanticKey = React.useMemo(
    () => buildScopedGraphSemanticKey('flow-canvas-scene-graph', { graphData: sceneGraphData, graphRevision: graphDataRevision }),
    [graphDataRevision, sceneGraphData],
  )

  const dataflowWidgetRegistry = React.useMemo(() => {
    return buildDataflowWidgetRegistry({
      documentWidgetRegistry,
      effectiveWidgetRegistry: widgetRegistry,
      widgetRegistry: baseWidgetRegistry,
    })
  }, [baseWidgetRegistry, documentWidgetRegistry, widgetRegistry])

  const mediaRenderConnectedValuesByNodeId = React.useMemo(() => {
    return computeRichMediaOverlayConnectedValuesByNodeId({
      graphData: sceneGraphData,
      registry: dataflowWidgetRegistry,
      graphRevision: graphDataRevision,
      graphSemanticKey: sceneGraphSemanticKey,
      includeMediaSpecNodes: true,
    })
  }, [dataflowWidgetRegistry, graphDataRevision, sceneGraphData, sceneGraphSemanticKey])

  const mediaRenderNodes = React.useMemo(() => {
    const nodes = Array.isArray(sceneGraphData?.nodes) ? (sceneGraphData.nodes as GraphNode[]) : []
    if (nodes.length === 0) return nodes
    return nodes.map(node => {
      const nodeId = String(node?.id || '').trim()
      return applyConnectedValuesToNodeForRender({
        node,
        connectedValuesBySchemaPath: nodeId ? mediaRenderConnectedValuesByNodeId.get(nodeId) || undefined : undefined,
      })
    })
  }, [mediaRenderConnectedValuesByNodeId, sceneGraphData])
  const sceneGraphLookup = React.useMemo(() => {
    return getCachedGraphLookup({
      cacheScope: 'flow-canvas-scene-graph',
      graphData: sceneGraphData,
      graphRevision: graphDataRevision,
      graphSemanticKey: sceneGraphSemanticKey,
      preferCurrentGraphDataRefs: true,
    })
  }, [graphDataRevision, sceneGraphData, sceneGraphSemanticKey])
  const sceneGraphNodeById = sceneGraphLookup?.nodeById || null
  const sceneGraphCanonicalNodeById = React.useMemo(() => {
    if (!sceneGraphNodeById || sceneGraphNodeById.size === 0) return null
    return buildCanonicalNodeLookup(sceneGraphNodeById.entries())
  }, [sceneGraphNodeById])
  const selectedNodeIdsKey = React.useMemo(
    () => hashScopedStringArraySignature('flow-selected-node-ids', selectedNodeIds),
    [selectedNodeIds],
  )
  const selectedNodeIdsSnapshotRef = React.useRef<{ key: string; value: string[] } | null>(null)
  if (selectedNodeIdsSnapshotRef.current?.key !== selectedNodeIdsKey) {
    selectedNodeIdsSnapshotRef.current = {
      key: selectedNodeIdsKey,
      value: normalizeStringArrayForSignature(selectedNodeIds),
    }
  }
  const selectedNodeIdsSnapshot = selectedNodeIdsSnapshotRef.current?.value ?? EMPTY_STRING_ARRAY
  const openWidgetNodeIdsKey = React.useMemo(
    () => hashScopedStringArraySignature('flow-open-widget-node-ids', openWidgetNodeIds),
    [openWidgetNodeIds],
  )
  const openWidgetNodeIdsSnapshotRef = React.useRef<{ key: string; value: string[] } | null>(null)
  if (openWidgetNodeIdsSnapshotRef.current?.key !== openWidgetNodeIdsKey) {
    openWidgetNodeIdsSnapshotRef.current = {
      key: openWidgetNodeIdsKey,
      value: normalizeStringArrayForSignature(openWidgetNodeIds),
    }
  }
  const openWidgetNodeIdsSnapshot = openWidgetNodeIdsSnapshotRef.current?.value ?? EMPTY_STRING_ARRAY
  const excludeRichMediaOverlayNodeIdsKey = React.useMemo(
    () => hashScopedStringArraySignature('flow-exclude-rich-media-overlay-node-ids', excludeRichMediaOverlayNodeIds),
    [excludeRichMediaOverlayNodeIds],
  )
  const excludeRichMediaOverlayNodeIdsSnapshotRef = React.useRef<{ key: string; value: string[] } | null>(null)
  if (excludeRichMediaOverlayNodeIdsSnapshotRef.current?.key !== excludeRichMediaOverlayNodeIdsKey) {
    excludeRichMediaOverlayNodeIdsSnapshotRef.current = {
      key: excludeRichMediaOverlayNodeIdsKey,
      value: normalizeStringArrayForSignature(excludeRichMediaOverlayNodeIds),
    }
  }
  const excludeRichMediaOverlayNodeIdsSnapshot =
    excludeRichMediaOverlayNodeIdsSnapshotRef.current?.value ?? EMPTY_STRING_ARRAY
  const selectedOverlayNodeIds = React.useMemo(() => {
    const nodeIdSet = new Set<string>(selectedNodeIdsSnapshot)
    if (selectedNodeId) nodeIdSet.add(String(selectedNodeId))
    return Array.from(nodeIdSet)
      .map(rawId => {
        const resolved = getCanonicalNodeLookupValue(sceneGraphCanonicalNodeById, rawId)
        return String(resolved?.id || rawId || '').trim()
      })
      .filter(Boolean)
  }, [sceneGraphCanonicalNodeById, selectedNodeId, selectedNodeIdsSnapshot])

  const storyboardWidgetRichMediaPanelOverlayExcludeNodeIdSet = React.useMemo(() => {
    if (!storyboardWidgetOverlayInteractionMode) return undefined
    const excludeAllRichMediaPanelNodes = !storyboardWidgetFrontmatterInteractionMode && canvas2dRenderer !== 'storyboard'
    const candidateRawIds = [
      ...(canvas2dRenderer === 'storyboard' ? EMPTY_STRING_ARRAY : openWidgetNodeIdsSnapshot),
      ...excludeRichMediaOverlayNodeIdsSnapshot,
    ]
    const out = buildRichMediaPanelOverlayExcludeNodeIdSet({
      graphData: sceneGraphData,
      nodeById: sceneGraphNodeById || undefined,
      candidateRawIds,
      excludeAllRichMediaPanelNodes,
    })
    for (let i = 0; i < excludeRichMediaOverlayNodeIdsSnapshot.length; i += 1) {
      const rawId = excludeRichMediaOverlayNodeIdsSnapshot[i]
      const resolved = getCanonicalNodeLookupValue(sceneGraphCanonicalNodeById, rawId)
      const id = String(resolved?.id || rawId || '').trim()
      if (id) out.add(id)
    }
    return out.size > 0 ? out : undefined
  }, [
    canvas2dRenderer,
    excludeRichMediaOverlayNodeIdsSnapshot,
    storyboardWidgetFrontmatterInteractionMode,
    storyboardWidgetOverlayInteractionMode,
    openWidgetNodeIdsSnapshot,
    sceneGraphCanonicalNodeById,
    sceneGraphData,
    sceneGraphNodeById,
  ])

  const stickyOverlayNodeByIdRef = React.useRef(new Map<string, ReturnType<typeof listDisplayRichMediaOverlayNodes>[number]>())
  const stickyOverlayOrderRef = React.useRef<string[]>([])
  const useStickyOverlayPool =
    canvas2dRenderer === 'storyboard'
    || (!storyboardWidgetOverlayInteractionMode && !storyboardWidgetFrontmatterInteractionMode)

  const mediaNodes = React.useMemo(() => {
    if (suppressMediaOverlays) {
      stickyOverlayNodeByIdRef.current.clear()
      stickyOverlayOrderRef.current = []
      return []
    }
    const nodes = mediaRenderNodes
    const poolMaxRaw = typeof threeIframeOverlayPoolMax === 'number' && Number.isFinite(threeIframeOverlayPoolMax) ? threeIframeOverlayPoolMax : 0
    const poolMax = poolMaxRaw > 0 ? poolMaxRaw : 24
    const suggested = listDisplayRichMediaOverlayNodes({
      renderMediaAsNodes,
      canvasRenderMode: '2d',
      canvas2dRenderer,
      frontmatterModeEnabled,
      documentSemanticMode,
      nodes,
      poolMax,
      excludeNodeIdSet: storyboardWidgetRichMediaPanelOverlayExcludeNodeIdSet,
      connectedValuesByNodeId: mediaRenderConnectedValuesByNodeId,
      nodeById: sceneGraphNodeById || undefined,
    })
    if (!useStickyOverlayPool) {
      const stickyMap = stickyOverlayNodeByIdRef.current
      stickyMap.clear()
      for (let i = 0; i < suggested.length; i += 1) stickyMap.set(suggested[i]!.id, suggested[i]!)
      stickyOverlayOrderRef.current = suggested.map(node => String(node.id || '').trim()).filter(Boolean)
      return suggested
    }

    const prevOrder = stickyOverlayOrderRef.current
    const stickyMap = stickyOverlayNodeByIdRef.current
    for (let i = 0; i < suggested.length; i += 1) stickyMap.set(suggested[i]!.id, suggested[i]!)

    const retainedStickyIds = new Set<string>()
    const pushResolvedStickyId = (rawId: unknown) => {
      const resolved = getCanonicalNodeLookupValue(sceneGraphCanonicalNodeById, rawId)
      const id = String(resolved?.id || '').trim()
      if (id) retainedStickyIds.add(id)
    }
    for (let i = 0; i < selectedNodeIdsSnapshot.length; i += 1) pushResolvedStickyId(selectedNodeIdsSnapshot[i])
    pushResolvedStickyId(selectedNodeId)
    for (let i = 0; i < openWidgetNodeIdsSnapshot.length; i += 1) pushResolvedStickyId(openWidgetNodeIdsSnapshot[i])
    const needed = new Set<string>(retainedStickyIds)
    for (let i = 0; i < suggested.length; i += 1) needed.add(String(suggested[i]!.id || '').trim())
    const isValid = (id: string) => {
      const key = String(id || '').trim()
      if (!key) return false
      if (!needed.has(key)) return false
      const node = canvas2dRenderer === 'storyboard'
        ? authoritativeGraphNodeById.get(key)
        : sceneGraphNodeById?.get(key)
      return isRichMediaConnectedValueTargetNode({ node, includeMediaSpecNodes: true })
    }

    const nextIds: string[] = []
    const nextIdSet = new Set<string>()
    const pushId = (id: string) => {
      if (!id || nextIds.length >= poolMax || nextIdSet.has(id) || !stickyMap.has(id) || !isValid(id)) return
      nextIds.push(id)
      nextIdSet.add(id)
    }
    for (let i = 0; i < prevOrder.length; i += 1) pushId(String(prevOrder[i] || '').trim())
    for (let i = 0; i < suggested.length; i += 1) {
      const id = String(suggested[i]!.id || '').trim()
      if (!id || nextIds.length >= poolMax || nextIdSet.has(id)) continue
      nextIds.push(id)
      nextIdSet.add(id)
    }

    stickyOverlayOrderRef.current = nextIds
    const out = nextIds.map(id => stickyMap.get(id)).filter(Boolean) as typeof suggested
    if (stickyMap.size > Math.max(96, poolMax * 6)) {
      const keep = new Set<string>(nextIds)
      for (let i = 0; i < suggested.length; i += 1) keep.add(String(suggested[i]!.id || ''))
      for (const [id] of stickyMap) {
        if (!keep.has(id)) stickyMap.delete(id)
      }
    }
    return out
  }, [
    storyboardWidgetRichMediaPanelOverlayExcludeNodeIdSet,
    mediaRenderConnectedValuesByNodeId,
    mediaRenderNodes,
    renderMediaAsNodes,
    suppressMediaOverlays,
    canvas2dRenderer,
    documentSemanticMode,
    frontmatterModeEnabled,
    threeIframeOverlayPoolMax,
    useStickyOverlayPool,
    authoritativeGraphNodeById,
    openWidgetNodeIdsSnapshot,
    sceneGraphCanonicalNodeById,
    sceneGraphNodeById,
    selectedNodeId,
    selectedNodeIdsSnapshot,
  ])
  const mediaNodeIdsSignature = React.useMemo(
    () => mediaNodes.map(node => String(node.id || '').trim()).filter(Boolean).join('|'),
    [mediaNodes],
  )
  const nativeSceneGraphData = React.useMemo(() => deriveFlowCanvasNativeSceneGraph({
    sceneGraphData,
    overlayNodes: mediaNodes,
    excludedNodeIds: excludeNativeSceneNodeIds,
  }), [excludeNativeSceneNodeIds, mediaNodeIdsSignature, mediaNodes, sceneGraphData])
  const reportedMediaNodeSignatureRef = React.useRef('')
  React.useEffect(() => {
    if (canvas2dRenderer !== 'storyboard') return
    const signature = [
      String(canvas2dRenderer || ''),
      String(selectedNodeId || ''),
      openWidgetNodeIdsSnapshot.join('|'),
      mediaNodeIdsSignature,
    ].join('::')
    if (!signature || reportedMediaNodeSignatureRef.current === signature) return
    reportedMediaNodeSignatureRef.current = signature
    // #region debug-point B:flow-canvas-media-nodes
    reportStoryboardMediaPanelLoopFlowCanvasDebug({
      hypothesisId: 'D',
      location: 'useFlowCanvasGraphState.ts:media-nodes',
      msg: 'storyboard flow-canvas recomputed media overlay node ids',
      data: {
        selectedNodeId: String(selectedNodeId || '').trim(),
        openWidgetNodeIds: openWidgetNodeIdsSnapshot,
        sceneGraphNodeCount: Array.isArray(sceneGraphData?.nodes) ? sceneGraphData.nodes.length : 0,
        mediaNodeIds: mediaNodes.map(node => String(node.id || '').trim()).filter(Boolean),
      },
    })
    // #endregion
  }, [canvas2dRenderer, mediaNodeIdsSignature, mediaNodes, openWidgetNodeIdsSnapshot, sceneGraphData, selectedNodeId])

  const selectedOverlayNodeIdSet = React.useMemo(() => {
    return buildCanonicalNodeIdSet(selectedOverlayNodeIds)
  }, [selectedOverlayNodeIds])

  return {
    graphDataRevision,
    renderGraphData,
    allowMutations,
    effectiveFrontmatter,
    storyboardWidgetFrontmatterInteractionMode,
    storyboardWidgetOverlayInteractionMode,
    filteredGraphDataForRenderer,
    sceneGraphData,
    nativeSceneGraphData,
    mediaNodes,
    selectedOverlayNodeIds,
    selectedOverlayNodeIdSet,
  }
}
