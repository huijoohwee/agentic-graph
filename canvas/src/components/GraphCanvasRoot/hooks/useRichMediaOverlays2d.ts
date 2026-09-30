import React, { useCallback, useEffect, useMemo, useRef, type MutableRefObject, type RefObject } from 'react'
import * as d3 from 'd3'
import type { GraphData, GraphEdge, GraphNode } from '@/lib/graph/types'
import type { GraphSchema } from '@/lib/graph/schema'
import { useGraphStore } from '@/hooks/useGraphStore'
import { isWorkspaceEditorOverlayOpen } from '@/features/workspace-table/workspaceTableSsot'
import { DEFAULT_DRAG_ALPHA_TARGET } from '@/lib/graph/layoutDefaults'
import { readLayoutMode } from '@/components/GraphCanvas/layout/fitConfig'
import { lockGlobalUserSelect, unlockGlobalUserSelect } from '@/lib/canvas/interaction-user-select'
import { isSpacePanHeld } from '@/lib/canvas/space-pan'
import { disableAutoZoomModesForUserGesture } from '@/lib/canvas/auto-zoom-modes'
import { clampCanvasInteractionSpeedMultiplier, clampCanvasPanSpeedMultiplier } from '@/lib/canvas/camera-options-2d'
import { readSnapGridConfigFromSchema, snapPointToGrid } from '@/lib/canvas/gridSnap'
import { applyPanelBox, readStableRichMediaPanelSize } from '@/lib/render/mediaPanelLayout'
import { computeRichMediaOverlayConnectedValuesByNodeId, listDisplayRichMediaOverlayNodes, normalizeRichMediaPanelDensity } from '@/lib/render/richMediaSsot'
import { readNodeCenterWorld2d } from '@/lib/render/mediaAnchor'
import { startMediaOverlayLayoutLoop2d } from '@/lib/render/mediaOverlayLayoutLoop2d'
import { readOverlaySizingConfigForDensity, type OverlayDensitySizingConfigInput } from '@/lib/render/overlaySizing2d'
import { emitMarkdownPanelMetric } from '@/features/metrics/uiMetrics'
import { buildNodeMediaInventory, getNodeMediaSpec } from '@/components/GraphCanvas/helpers'
import { readWidgetRegistryMetadataEntries } from '@/lib/config.storyboard-widget'
import type { WidgetRegistryEntry } from '@/features/storyboard-widget-manager/widgetRegistryTypes'
import { getCachedGraphLookup } from '@/lib/graph/lookupCache'
import { buildScopedGraphSemanticKey } from '@/lib/graph/semanticKey'
import { readMergedGraphNodeLookup } from '@/components/GraphCanvasRoot/utils/mergedNodeLookup'
import { resolveWorkspaceVisibleViewport } from '@/lib/zoom/workspaceVisibleViewport'

export function useRichMediaOverlays2d(args: {
  active: boolean
  activeRef: MutableRefObject<boolean>
  svgRef: RefObject<SVGSVGElement | null>
  zoomRef: MutableRefObject<d3.ZoomBehavior<SVGSVGElement, unknown> | null>
  simulationRef: MutableRefObject<d3.Simulation<GraphNode, GraphEdge> | null>
  sceneGraphData: GraphData | null
  sceneGraphDataRef: MutableRefObject<GraphData | null>
  graphDataRevision: number
  schemaRef: MutableRefObject<GraphSchema>
  renderMediaAsNodes: boolean
  excludeNodeIdsKey?: string
  excludeNodeIdSet?: Set<string>
  mediaPanelDensity: unknown
  threeIframeOverlayPoolMax: unknown
  overlaySizing?: OverlayDensitySizingConfigInput | null
  sceneWidth: number
  sceneHeight: number
  freezeOverlayMembership?: boolean
}) {
  const strybldrStoryboardCardAspectMode = useGraphStore(s => s.strybldrStoryboardCardAspectMode)
  const {
    active,
    activeRef,
    svgRef,
    zoomRef,
    simulationRef,
    sceneGraphData,
    sceneGraphDataRef,
    graphDataRevision,
    schemaRef,
    renderMediaAsNodes,
    excludeNodeIdsKey,
    excludeNodeIdSet,
    mediaPanelDensity,
    threeIframeOverlayPoolMax,
    overlaySizing,
    sceneWidth,
    sceneHeight,
    freezeOverlayMembership,
  } = args

  const iframeOverlayElsRef = useRef<Map<string, HTMLElement>>(new Map())
  const [mountedOverlayIdsKey, setMountedOverlayIdsKey] = React.useState<string>('')

  const updateMountedOverlayIdsKey = React.useCallback(() => {
    try {
      const ids = Array.from(iframeOverlayElsRef.current.keys())
        .map(v => String(v || '').trim())
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b))
        .join('|')
      setMountedOverlayIdsKey(prev => (prev === ids ? prev : ids))
    } catch {
      setMountedOverlayIdsKey('')
    }
  }, [])
  const iframeNodeByIdRef = useRef<{ graphSemanticKey: string; rev: number; sim: d3.Simulation<GraphNode, GraphEdge> | null; map: Map<string, GraphNode> }>({
    graphSemanticKey: '',
    rev: -1,
    sim: null,
    map: new Map(),
  })
  const mediaOverlayScheduleRef = useRef<(() => void) | null>(null)
  const mediaOverlaySchedulePendingRef = useRef<boolean>(false)
  const iframeOverlayRefFnByIdRef = useRef<Map<string, (el: HTMLElement | null) => void>>(new Map())
  const stickyOverlayNodeByIdRef = useRef<Map<string, ReturnType<typeof listDisplayRichMediaOverlayNodes>[number]>>(new Map())
  const stickyOverlayOrderRef = useRef<string[]>([])
  const canvas2dRenderer = useGraphStore(s => s.canvas2dRenderer)
  const frontmatterModeEnabled = useGraphStore(s => s.frontmatterModeEnabled === true)
  const documentSemanticMode = useGraphStore(s => String(s.documentSemanticMode || ''))
  const sceneGraphSemanticKey = useMemo(
    () => buildScopedGraphSemanticKey('graph-canvas-root-rich-media-overlays-scene-graph', { graphData: sceneGraphData, graphRevision: graphDataRevision }),
    [graphDataRevision, sceneGraphData],
  )
  const sceneGraphLookup = useMemo(() => {
    return getCachedGraphLookup({
      cacheScope: 'graph-canvas-root-rich-media-overlays-scene-graph',
      graphData: sceneGraphData,
      graphRevision: graphDataRevision,
      graphSemanticKey: sceneGraphSemanticKey,
      preferCurrentGraphDataRefs: true,
    })
  }, [graphDataRevision, sceneGraphData, sceneGraphSemanticKey])
  const sceneGraphNodeById = sceneGraphLookup?.nodeById || null

  const requestMediaOverlaySchedule = useCallback(() => {
    if (mediaOverlaySchedulePendingRef.current) return
    mediaOverlaySchedulePendingRef.current = true
    // Run after node/cluster geometry commits, before paint; avoid a second RAF.
    queueMicrotask(() => {
      mediaOverlaySchedulePendingRef.current = false
      mediaOverlayScheduleRef.current?.()
    })
  }, [])

  const mediaOverlayNodes = useMemo(() => {
    const nodes = Array.isArray(sceneGraphData?.nodes) ? (sceneGraphData!.nodes as GraphNode[]) : []
    const poolMaxRaw = typeof threeIframeOverlayPoolMax === 'number' && Number.isFinite(threeIframeOverlayPoolMax) ? threeIframeOverlayPoolMax : 0
    const poolMax = poolMaxRaw > 0 ? poolMaxRaw : 24
    const st = useGraphStore.getState() as unknown as { selectedNodeId?: unknown; selectedNodeIds?: unknown }
    const preferredNodeIds = [st.selectedNodeId, ...(Array.isArray(st.selectedNodeIds) ? st.selectedNodeIds : [])]
    const metadata = (sceneGraphData?.metadata || {}) as Record<string, unknown>
    const registry = readWidgetRegistryMetadataEntries<WidgetRegistryEntry>(metadata)
    const connectedValuesByNodeId = computeRichMediaOverlayConnectedValuesByNodeId({
        graphData: sceneGraphData,
        registry,
        graphRevision: graphDataRevision,
        graphSemanticKey: sceneGraphSemanticKey,
        includeMediaSpecNodes: true,
      })
    const suggested = listDisplayRichMediaOverlayNodes({
      renderMediaAsNodes,
      canvasRenderMode: '2d',
      canvas2dRenderer,
      frontmatterModeEnabled,
      documentSemanticMode,
      nodes,
      poolMax,
      preferredNodeIds,
      excludeNodeIdSet,
      connectedValuesByNodeId,
      nodeById: sceneGraphNodeById || undefined,
    })

    const stickyMap = stickyOverlayNodeByIdRef.current
    for (let i = 0; i < suggested.length; i += 1) {
      const n = suggested[i]!
      stickyMap.set(n.id, n)
    }
    const suggestedIdSet = new Set<string>()
    for (let i = 0; i < suggested.length; i += 1) {
      const id = String(suggested[i]?.id || '').trim()
      if (id) suggestedIdSet.add(id)
    }
    const isLiveFrozenOverlayId = (id: string): boolean => {
      const key = String(id || '').trim()
      if (!key) return false
      if (excludeNodeIdSet?.has(key)) return false
      if (suggestedIdSet.has(key)) return true
      return !!sceneGraphNodeById?.get(key)
    }

    const pinnedOrder = Array.from(iframeOverlayElsRef.current.keys())
    const prevOrder = stickyOverlayOrderRef.current
    if (freezeOverlayMembership === true) {
      const frozenSource = pinnedOrder.length > 0 ? pinnedOrder : prevOrder
      const frozenIds: string[] = []
      for (let i = 0; i < frozenSource.length; i += 1) {
        if (frozenIds.length >= poolMax) break
        const id = String(frozenSource[i] || '').trim()
        if (!id) continue
        if (frozenIds.includes(id)) continue
        if (!isLiveFrozenOverlayId(id)) continue
        const n = stickyMap.get(id)
        if (!n) continue
        frozenIds.push(id)
      }
      if (frozenIds.length > 0) {
        stickyOverlayOrderRef.current = frozenIds
        const outFrozen: typeof suggested = []
        for (let i = 0; i < frozenIds.length; i += 1) {
          const n = stickyMap.get(frozenIds[i]!)
          if (n) outFrozen.push(n)
        }
        return outFrozen
      }
    }
    const needed = new Set<string>()
    for (let i = 0; i < pinnedOrder.length; i += 1) {
      const id = String(pinnedOrder[i] || '').trim()
      if (id) needed.add(id)
    }
    for (let i = 0; i < prevOrder.length; i += 1) {
      const id = String(prevOrder[i] || '').trim()
      if (id) needed.add(id)
    }
    for (let i = 0; i < suggested.length; i += 1) {
      const id = String(suggested[i]!.id || '').trim()
      if (id) needed.add(id)
    }

    const isValidOverlayId = (id: string): boolean => {
      const key = String(id || '').trim()
      if (!key) return false
      if (!needed.has(key)) return false
      if (excludeNodeIdSet?.has(key)) return false
      const n = sceneGraphNodeById?.get(key)
      if (!n) return false
      const spec = getNodeMediaSpec(n)
      if (!spec) return false
      return true
    }

    const nextIds: string[] = []
    const nextIdSet = new Set<string>()
    for (let i = 0; i < pinnedOrder.length; i += 1) {
      if (nextIds.length >= poolMax) break
      const id = String(pinnedOrder[i] || '').trim()
      if (!id) continue
      if (nextIdSet.has(id)) continue
      if (!stickyMap.has(id)) continue
      if (!isValidOverlayId(id)) continue
      nextIds.push(id)
      nextIdSet.add(id)
    }
    for (let i = 0; i < prevOrder.length; i += 1) {
      if (nextIds.length >= poolMax) break
      const id = String(prevOrder[i] || '').trim()
      if (!id) continue
      if (nextIdSet.has(id)) continue
      if (!stickyMap.has(id)) continue
      if (!isValidOverlayId(id)) continue
      nextIds.push(id)
      nextIdSet.add(id)
    }
    for (let i = 0; i < suggested.length; i += 1) {
      if (nextIds.length >= poolMax) break
      const id = String(suggested[i]!.id || '').trim()
      if (!id) continue
      if (nextIdSet.has(id)) continue
      nextIds.push(id)
      nextIdSet.add(id)
    }

    stickyOverlayOrderRef.current = nextIds
    const out: typeof suggested = []
    for (let i = 0; i < nextIds.length; i += 1) {
      const n = stickyMap.get(nextIds[i]!)
      if (n) out.push(n)
    }
    if (stickyMap.size > Math.max(96, poolMax * 6)) {
      const keep = new Set<string>(nextIds)
      for (const id of suggested) keep.add(id.id)
      for (const [id] of stickyMap) {
        if (!keep.has(id)) stickyMap.delete(id)
      }
    }
    return out
  }, [
    canvas2dRenderer,
    documentSemanticMode,
    excludeNodeIdSet,
    freezeOverlayMembership,
    frontmatterModeEnabled,
    graphDataRevision,
    renderMediaAsNodes,
    sceneGraphData,
    sceneGraphSemanticKey,
    sceneGraphNodeById,
    threeIframeOverlayPoolMax,
  ])

  const { mediaOverlayNodeIdsKey, mediaOverlayNodeIdSet } = useMemo(() => {
    const ids = mediaOverlayNodes.map(n => n.id)
    const sortedIds = ids.length <= 1 ? ids : ids.slice().sort()
    return {
      mediaOverlayNodeIdsKey: sortedIds.join('|'),
      mediaOverlayNodeIdSet: new Set(sortedIds),
    }
  }, [mediaOverlayNodes])

  useEffect(() => {
    const anyImportMeta = import.meta as unknown as { env?: { DEV?: boolean } }
    if (!anyImportMeta.env?.DEV) return
    if (!active) return
    const nodes = Array.isArray(sceneGraphData?.nodes) ? (sceneGraphData!.nodes as GraphNode[]) : []
    const inventory = buildNodeMediaInventory(nodes)
    emitMarkdownPanelMetric('canvas.2d.d3.richMedia.pool', {
      enabled: renderMediaAsNodes === true,
      nodes: nodes.length,
      mediaSpecCount: inventory.totalCount,
      iframeCount: inventory.iframeCount,
      imageCount: inventory.imageCount,
      videoCount: inventory.videoCount,
      audioCount: inventory.audioCount,
      svgCount: inventory.svgCount,
      overlayPoolSize: mediaOverlayNodes.length,
      overlayIds: mediaOverlayNodes.slice(0, 6).map(n => n.id),
      poolMaxRaw: threeIframeOverlayPoolMax,
    })
  }, [active, mediaOverlayNodeIdsKey, mediaOverlayNodes, renderMediaAsNodes, sceneGraphData, threeIframeOverlayPoolMax])

  useEffect(() => {
    const next = new Map<string, HTMLElement>()
    for (const n of mediaOverlayNodes) {
      const existing = iframeOverlayElsRef.current.get(n.id)
      if (existing) next.set(n.id, existing)
    }
    iframeOverlayElsRef.current = next
    const keep = new Set<string>(mediaOverlayNodes.map(n => n.id))
    const refMap = iframeOverlayRefFnByIdRef.current
    for (const [id] of refMap) {
      if (!keep.has(id)) refMap.delete(id)
    }
    updateMountedOverlayIdsKey()
  }, [mediaOverlayNodeIdsKey, mediaOverlayNodes, updateMountedOverlayIdsKey])

  const getOverlayRefForId = useCallback(
    (id: string) => {
      const key = String(id || '').trim()
      if (!key) return () => void 0
      const cached = iframeOverlayRefFnByIdRef.current.get(key)
      if (cached) return cached
      const fn = (el: HTMLElement | null) => {
        if (!el) {
          iframeOverlayElsRef.current.delete(key)
          updateMountedOverlayIdsKey()
          return
        }
        const prev = iframeOverlayElsRef.current.get(key)
        if (prev === el) return
        iframeOverlayElsRef.current.set(key, el)
        updateMountedOverlayIdsKey()
        try {
          applyPanelBox(el, { left: -99999, top: -99999, w: 1, h: 1, display: 'block', zIndex: 1 })
        } catch {
          void 0
        }
        try {
          requestMediaOverlaySchedule()
        } catch {
          void 0
        }
      }
      iframeOverlayRefFnByIdRef.current.set(key, fn)
      return fn
    },
    [requestMediaOverlaySchedule, updateMountedOverlayIdsKey],
  )

  const readVisibleOverlayLayoutViewport = useCallback(() => {
    const viewport = resolveWorkspaceVisibleViewport({
      viewportW: Math.max(1, Math.floor(sceneWidth)),
      viewportH: Math.max(1, Math.floor(sceneHeight)),
      workspaceEditorOverlayOpen: isWorkspaceEditorOverlayOpen(useGraphStore.getState()),
      surfaceElement: svgRef.current,
    })
    return {
      left: viewport.left,
      top: viewport.top,
      width: viewport.width,
      height: viewport.height,
    }
  }, [sceneHeight, sceneWidth, svgRef])

  const mediaOverlayHideNodeIdSet = React.useMemo(() => {
    if (!mountedOverlayIdsKey) return undefined
    const ids = mountedOverlayIdsKey.split('|').map(v => String(v || '').trim()).filter(Boolean)
    return ids.length ? new Set(ids) : undefined
  }, [mountedOverlayIdsKey])

  useEffect(() => {
    mediaOverlayScheduleRef.current = null
    if (!active) return
    if (mediaOverlayNodes.length === 0) return
    const density = normalizeRichMediaPanelDensity(mediaPanelDensity)
    const sizingConfig = readOverlaySizingConfigForDensity({
      density,
      sizing: overlaySizing || null,
    })

    const loop = startMediaOverlayLayoutLoop2d({
      enabled: true,
      loop: 'onDemand',
      items: mediaOverlayNodes,
      density,
      viewportW: sceneWidth,
      viewportH: sceneHeight,
      readLayoutViewport: readVisibleOverlayLayoutViewport,
      schema: schemaRef.current,
      collision: { enabled: false },
      anchorToNode: true,
      aspectRatioMode: strybldrStoryboardCardAspectMode,
      readTransform: () => {
        const svgEl = svgRef.current
        if (!svgEl) return null
        return d3.zoomTransform(svgEl as unknown as SVGSVGElement)
      },
      getElementForId: id => iframeOverlayElsRef.current.get(id) || null,
      getPanelSizeForId: id => {
        const graph = sceneGraphDataRef.current
        const sim = simulationRef.current
        const rev = typeof graphDataRevision === 'number' && Number.isFinite(graphDataRevision) ? graphDataRevision : 0
        const nodeById = readMergedGraphNodeLookup({
          cacheRef: iframeNodeByIdRef,
          cacheScope: 'graph-canvas-root-rich-media-overlays-layout-graph',
          graphData: graph,
          graphRevision: rev,
          simulation: sim,
        })
        const n = nodeById.get(id) || null
        const props = n?.properties && typeof n.properties === 'object' && !Array.isArray(n.properties) ? n.properties as Record<string, unknown> : null
        return readStableRichMediaPanelSize(props, strybldrStoryboardCardAspectMode)
      },
      getNodeWorldCenterForId: id => {
        const graph = sceneGraphDataRef.current
        const sim = simulationRef.current
        const rev = typeof graphDataRevision === 'number' && Number.isFinite(graphDataRevision) ? graphDataRevision : 0
        const nodeById = readMergedGraphNodeLookup({
          cacheRef: iframeNodeByIdRef,
          cacheScope: 'graph-canvas-root-rich-media-overlays-layout-graph',
          graphData: graph,
          graphRevision: rev,
          simulation: sim,
        })
        const n = nodeById.get(id) || null
        return readNodeCenterWorld2d(n, { coords: 'center' })
      },
      sizingConfig: { ...sizingConfig, quantizeStepPx: 1 },
      clampToViewport: null,
    })

    mediaOverlayScheduleRef.current = loop.flush
    loop.schedule()

    return () => {
      loop.stop()
      if (mediaOverlayScheduleRef.current === loop.flush) {
        mediaOverlayScheduleRef.current = null
      }
    }
  }, [
    active,
    graphDataRevision,
    mediaOverlayNodeIdsKey,
    mediaOverlayNodes,
    mediaPanelDensity,
    sceneHeight,
    sceneWidth,
    sceneGraphDataRef,
    schemaRef,
    simulationRef,
    strybldrStoryboardCardAspectMode,
    svgRef,
    overlaySizing,
    readVisibleOverlayLayoutViewport,
  ])

  return {
    mediaOverlayNodes,
    mediaOverlayNodeIdSet,
    mediaOverlayHideNodeIdSet,
    getOverlayRefForId,
    requestMediaOverlaySchedule,
  }
}
