import { useThreeOverlayDragRecovery } from './useThreeOverlayDragRecovery'
import React from 'react'
import type { Camera, WebGLRenderer } from 'three'
import { useShallow } from 'zustand/react/shallow'
import { useGraphStore } from '@/hooks/useGraphStore'
import type { ThreeCameraPose } from '@/hooks/store/types'
import type { GraphData, GraphNode, JSONValue } from '@/lib/graph/types'
import type { GraphSchema } from '@/lib/graph/schema'
import RichMediaPanel from '@/components/RichMediaPanel'
import {
  listDisplayRichMediaOverlayNodes,
  commitRichMediaPanelChange,
  computeRichMediaOverlayConnectedValuesByNodeId,
  resolveRichMediaPanelInteractive,
} from '@/lib/render/richMediaSsot'
import { buildPanelOnlyNodeIdSetFromGraphNodes } from '@/lib/render/markdownPanelOverlayPool'
import { readWidgetRegistryMetadataEntries } from '@/lib/config.storyboard-widget'
import type { WidgetRegistryEntry } from '@/features/storyboard-widget-manager/widgetRegistryTypes'
import { getCachedGraphLookup } from '@/lib/graph/lookupCache'
import { buildScopedGraphSemanticKey } from '@/lib/graph/semanticKey'
import {
  computePanelFrameResizeFromDrag16x9,
  computePanelFrameSizeFromWidth16x9,
  readRichMediaPanelFrameMetrics,
  readStableRichMediaPanelSize,
  type MediaPanelCssMetrics,
} from '@/lib/render/mediaPanelLayout'
import {
  computeOverlayDragStartScreenSpace3d,
  computeOverlayDraggedWorldPos3d,
  computeThreeCameraPoseAfterOverlayPan,
} from '@/lib/canvas/overlayInteractions3d'
import { captureRichMediaPanelBoundaryEvent } from '@/components/captureRichMediaPanelBoundaryEvent'
import {
  createThreeMediaOverlayLayoutScratch,
  updateThreeMediaOverlayLayout,
} from './threeRichMediaOverlayLayout'
import { commitCameraFramingCanvasPose } from '@/features/three/cameraFramingControlsRuntime'

type StoreSlice = {
  renderMediaAsNodes: boolean
  canvas3dMode: unknown
  infiniteCanvasInteractionMode: 'static' | 'interactive'
  mediaPanelDensity: unknown
  threeIframeOverlayPoolMax: unknown
  threeIframeOverlayMaxVisibleDefault: unknown
  threeIframeOverlayMaxVisibleCompact: unknown
  threeIframeOverlayMaxDistanceDefault: unknown
  threeIframeOverlayMaxDistanceCompact: unknown
  threeIframeOverlayBaseWidthRatioDefault: unknown
  threeIframeOverlayBaseWidthRatioCompact: unknown
  threeIframeOverlayBaseWidthMinPxDefault: unknown
  threeIframeOverlayBaseWidthMinPxCompact: unknown
  threeIframeOverlayBaseWidthMaxPxDefault: unknown
  threeIframeOverlayBaseWidthMaxPxCompact: unknown
  threeIframeOverlaySizeScaleFactor: unknown
  graphDataRevision: number
  selectedNodeId: unknown
  selectedNodeIds: unknown
}

type RichMediaResizeState3d = {
  id: string
  pointerId: number
  startW: number
  startH: number
  frameMetrics: Pick<MediaPanelCssMetrics, 'headerH' | 'padding' | 'borderW'>
  lastW: number
  lastH: number
  scale: number
}

type RichMediaHeaderDragState3d = {
  id: string
  pointerId: number
  mode: 'world' | 'screen'
  sx: number
  sy: number
  ndcZ: number
  w: number
  h: number
}

export function useThreeRichMediaOverlayController(args: {
  active: boolean
  sceneGraph: GraphData | null
  effectiveSchema: GraphSchema
  positions: Record<string, [number, number, number]>
  glCanvasRef: React.MutableRefObject<HTMLCanvasElement | null>
  containerRef: React.MutableRefObject<HTMLElement | null>
  threeCameraRef: React.MutableRefObject<Camera | null>
  threeGlRef: React.MutableRefObject<WebGLRenderer | null>
  draggedNodeIdRef: React.MutableRefObject<string | null>
  setDraggedNodeId: React.Dispatch<React.SetStateAction<string | null>>
}) {
  const store = useGraphStore(
    useShallow((s): StoreSlice => ({
      renderMediaAsNodes: s.renderMediaAsNodes === true,
      canvas3dMode: s.canvas3dMode,
      infiniteCanvasInteractionMode: (s.infiniteCanvasInteractionMode || 'static') as 'static' | 'interactive',
      mediaPanelDensity: s.mediaPanelDensity,
      threeIframeOverlayPoolMax: s.threeIframeOverlayPoolMax,
      threeIframeOverlayMaxVisibleDefault: s.threeIframeOverlayMaxVisibleDefault,
      threeIframeOverlayMaxVisibleCompact: s.threeIframeOverlayMaxVisibleCompact,
      threeIframeOverlayMaxDistanceDefault: s.threeIframeOverlayMaxDistanceDefault,
      threeIframeOverlayMaxDistanceCompact: s.threeIframeOverlayMaxDistanceCompact,
      threeIframeOverlayBaseWidthRatioDefault: s.threeIframeOverlayBaseWidthRatioDefault,
      threeIframeOverlayBaseWidthRatioCompact: s.threeIframeOverlayBaseWidthRatioCompact,
      threeIframeOverlayBaseWidthMinPxDefault: s.threeIframeOverlayBaseWidthMinPxDefault,
      threeIframeOverlayBaseWidthMinPxCompact: s.threeIframeOverlayBaseWidthMinPxCompact,
      threeIframeOverlayBaseWidthMaxPxDefault: s.threeIframeOverlayBaseWidthMaxPxDefault,
      threeIframeOverlayBaseWidthMaxPxCompact: s.threeIframeOverlayBaseWidthMaxPxCompact,
      threeIframeOverlaySizeScaleFactor: s.threeIframeOverlaySizeScaleFactor,
      graphDataRevision: s.graphDataRevision || 0,
      selectedNodeId: s.selectedNodeId,
      selectedNodeIds: s.selectedNodeIds,
    })),
  )
  const overlayElsRef = React.useRef<Map<string, HTMLElement>>(new Map())
  const visibleIdsRef = React.useRef<Set<string>>(new Set())
  const scheduleRef = React.useRef<(() => void) | null>(null)
  const refFnByIdRef = React.useRef<Map<string, (el: HTMLElement | null) => void>>(new Map())
  const scheduleRafRef = React.useRef<number | null>(null)
  const schedulePendingRef = React.useRef<boolean>(false)
  const pointerOverrideActiveRef = React.useRef<boolean>(false)
  const pointerOverrideResetTimerRef = React.useRef<number | null>(null)
  const localPositionsRef = React.useRef<Record<string, [number, number, number]>>({})
  const localPanelSizesRef = React.useRef<Record<string, { w: number; h: number }>>({})
  const localPinnedRef = React.useRef<Record<string, boolean>>({})
  const localScreenAnchorsRef = React.useRef<Record<string, { sx: number; sy: number }>>({})
  const dragOverridesRef = React.useRef<Record<string, [number, number, number]>>({})
  const screenDragOverridesRef = React.useRef<Record<string, { sx: number; sy: number }>>({})
  const headerDragRef = React.useRef<null | RichMediaHeaderDragState3d>(null)
  const overlayPanRef = React.useRef<null | { pointerId: number; pose: ThreeCameraPose }>(null)
  const resizeRef = React.useRef<RichMediaResizeState3d | null>(null)
  const [controlRevision, setControlRevision] = React.useState(0)
  const scratchRef = React.useRef(createThreeMediaOverlayLayoutScratch())

  const sceneGraphSemanticKey = React.useMemo(
    () => buildScopedGraphSemanticKey('three-rich-media-overlays-scene-graph', { graphData: args.sceneGraph, graphRevision: store.graphDataRevision }),
    [args.sceneGraph, store.graphDataRevision],
  )
  const sceneGraphLookup = React.useMemo(() => getCachedGraphLookup({
    cacheScope: 'three-rich-media-overlays-scene-graph',
    graphData: args.sceneGraph,
    graphRevision: store.graphDataRevision,
    graphSemanticKey: sceneGraphSemanticKey,
    preferCurrentGraphDataRefs: true,
  }), [args.sceneGraph, sceneGraphSemanticKey, store.graphDataRevision])
  const richMediaConnectedValuesByNodeId = React.useMemo(() => {
    const metadata = (args.sceneGraph?.metadata || {}) as Record<string, unknown>
    const registry = readWidgetRegistryMetadataEntries<WidgetRegistryEntry>(metadata)
    return computeRichMediaOverlayConnectedValuesByNodeId({
      graphData: args.sceneGraph,
      registry,
      graphRevision: store.graphDataRevision,
      graphSemanticKey: sceneGraphSemanticKey,
      includeMediaSpecNodes: true,
    })
  }, [args.sceneGraph, sceneGraphSemanticKey, store.graphDataRevision])
  const overlayNodesPool = React.useMemo(() => {
    const nodes = args.sceneGraph && Array.isArray(args.sceneGraph.nodes) ? (args.sceneGraph.nodes as GraphNode[]) : []
    const poolMaxRaw = typeof store.threeIframeOverlayPoolMax === 'number' && Number.isFinite(store.threeIframeOverlayPoolMax) ? store.threeIframeOverlayPoolMax : 0
    const preferredNodeIds = [store.selectedNodeId, ...(Array.isArray(store.selectedNodeIds) ? store.selectedNodeIds : [])]
    return listDisplayRichMediaOverlayNodes({
      renderMediaAsNodes: store.renderMediaAsNodes,
      canvasRenderMode: '3d',
      canvas3dMode: store.canvas3dMode,
      nodes,
      poolMax: poolMaxRaw > 0 ? poolMaxRaw : 24,
      preferredNodeIds,
      connectedValuesByNodeId: richMediaConnectedValuesByNodeId,
      nodeById: sceneGraphLookup?.nodeById || undefined,
    })
  }, [args.sceneGraph, richMediaConnectedValuesByNodeId, sceneGraphLookup, store.canvas3dMode, store.renderMediaAsNodes, store.selectedNodeId, store.selectedNodeIds, store.threeIframeOverlayPoolMax])
  const mediaNodesKey = React.useMemo(() => overlayNodesPool.map(n => n.id).join('|'), [overlayNodesPool])
  const readNodeProperties = React.useCallback((id: string): Record<string, unknown> => {
    const key = String(id || '').trim()
    if (!key) return {}
    const node = sceneGraphLookup?.nodeById?.get(key) || null
    const props = node?.properties
    return props && typeof props === 'object' && !Array.isArray(props) ? { ...(props as Record<string, unknown>) } : {}
  }, [sceneGraphLookup])
  const bumpControlRevision = React.useCallback(() => setControlRevision(rev => (rev + 1) % 1_000_000), [])
  const getPanelSizeForId = React.useCallback((id: string) => localPanelSizesRef.current[id] || readStableRichMediaPanelSize(readNodeProperties(id)), [readNodeProperties])
  const readPanelPinned = React.useCallback((id: string): boolean => {
    if (typeof localPinnedRef.current[id] === 'boolean') return localPinnedRef.current[id]!
    return readNodeProperties(id)['visual:pinned'] !== false
  }, [readNodeProperties])
  const getPanelScreenAnchorForId = React.useCallback((id: string): { sx: number; sy: number } | null => {
    const local = localScreenAnchorsRef.current[id]
    if (local && Number.isFinite(local.sx) && Number.isFinite(local.sy)) return local
    const props = readNodeProperties(id)
    const sx = Number(props['visual:screenX'])
    const sy = Number(props['visual:screenY'])
    return Number.isFinite(sx) && Number.isFinite(sy) ? { sx, sy } : null
  }, [readNodeProperties])
  const getPanelZIndexForId = React.useCallback((id: string): number => {
    const z = Number(readNodeProperties(id)['visual:zIndex'])
    return Number.isFinite(z) ? z : 0
  }, [readNodeProperties])
  const updateNodeProperties = React.useCallback((id: string, patch: Record<string, JSONValue>) => {
    const baseProps = readNodeProperties(id) as Record<string, JSONValue>
    useGraphStore.getState().updateNode(id, {
      properties: {
        ...baseProps,
        ...patch,
      },
    } as Partial<GraphNode>)
  }, [readNodeProperties])
  const requestSchedule = React.useCallback(() => {
    const schedule = scheduleRef.current
    if (schedule) {
      schedule()
      return
    }
    schedulePendingRef.current = true
    if (scheduleRafRef.current != null) return
    scheduleRafRef.current = requestAnimationFrame(() => {
      scheduleRafRef.current = null
      try {
        scheduleRef.current?.()
      } catch {
        void 0
      }
    })
  }, [])

  React.useEffect(() => () => {
    const raf = scheduleRafRef.current
    if (raf == null) return
    scheduleRafRef.current = null
    try {
      cancelAnimationFrame(raf)
    } catch {
      void 0
    }
  }, [])

  React.useEffect(() => {
    if (!args.active || overlayNodesPool.length === 0) return
    const schedule = () => {
      try {
        requestSchedule()
      } catch {
        void 0
      }
    }
    schedule()
    const canvas = args.glCanvasRef.current
    const container = args.containerRef.current
    let ro: ResizeObserver | null = null
    if (typeof ResizeObserver !== 'undefined') {
      try {
        ro = new ResizeObserver(() => schedule())
        if (canvas) ro.observe(canvas)
        if (container) ro.observe(container)
      } catch {
        ro = null
      }
    }
    window.addEventListener('resize', schedule, { passive: true })
    return () => {
      window.removeEventListener('resize', schedule)
      ro?.disconnect()
    }
  }, [args.active, args.containerRef, args.glCanvasRef, mediaNodesKey, overlayNodesPool.length, requestSchedule])

  const getOverlayRefForId = React.useCallback((id: string) => {
    const key = String(id || '').trim()
    if (!key) return () => void 0
    const cached = refFnByIdRef.current.get(key)
    if (cached) return cached
    const fn = (el: HTMLElement | null) => {
      if (!el) {
        overlayElsRef.current.delete(key)
        return
      }
      const prev = overlayElsRef.current.get(key)
      if (prev === el) return
      overlayElsRef.current.set(key, el)
      try {
        el.style.left = '-99999px'
        el.style.top = '-99999px'
        el.style.width = '1px'
        el.style.height = '1px'
        el.style.display = 'none'
        requestSchedule()
      } catch {
        void 0
      }
    }
    refFnByIdRef.current.set(key, fn)
    return fn
  }, [requestSchedule])

  React.useEffect(() => {
    const keep = new Set<string>(overlayNodesPool.map(n => n.id))
    for (const [id] of overlayElsRef.current) if (!keep.has(id)) overlayElsRef.current.delete(id)
    for (const [id] of refFnByIdRef.current) if (!keep.has(id)) refFnByIdRef.current.delete(id)
  }, [mediaNodesKey, overlayNodesPool])

  React.useEffect(() => {
    scheduleRef.current = null
    if (!args.active || overlayNodesPool.length === 0) return
    let raf: number | null = null
    const update = () => {
      visibleIdsRef.current = updateThreeMediaOverlayLayout({
        camera: args.threeCameraRef.current,
        gl: args.threeGlRef.current,
        overlayNodesPool,
        positions: { ...args.positions, ...localPositionsRef.current },
        dragOverrides: dragOverridesRef.current,
        screenDragOverrides: screenDragOverridesRef.current,
        overlayEls: overlayElsRef.current,
        prevVisibleIds: visibleIdsRef.current,
        effectiveSchema: args.effectiveSchema,
        scratch: scratchRef.current,
        getPanelSizeForId,
        getPanelPinnedForId: readPanelPinned,
        getPanelScreenAnchorForId,
        getPanelZIndexForId,
        ...store,
      })
    }
    const schedule = () => {
      if (raf != null) return
      raf = requestAnimationFrame(() => {
        raf = null
        update()
      })
    }
    scheduleRef.current = schedule
    if (schedulePendingRef.current) {
      schedulePendingRef.current = false
      schedule()
    }
    schedule()
    return () => {
      if (raf != null) cancelAnimationFrame(raf)
      raf = null
      if (scheduleRef.current === schedule) scheduleRef.current = null
    }
  }, [args.active, args.effectiveSchema, args.positions, args.threeCameraRef, args.threeGlRef, controlRevision, getPanelScreenAnchorForId, getPanelSizeForId, getPanelZIndexForId, mediaNodesKey, overlayNodesPool, readPanelPinned, store])

  const overlayHiddenNodeIdSet = React.useMemo(() => {
    const nodes = args.sceneGraph && Array.isArray(args.sceneGraph.nodes) ? (args.sceneGraph.nodes as GraphNode[]) : []
    const ids = new Set<string>(overlayNodesPool.flatMap(n => n.coveredNodeIds || [n.id]))
    for (const id of buildPanelOnlyNodeIdSetFromGraphNodes(nodes)) ids.add(id)
    return ids
  }, [args.sceneGraph, overlayNodesPool])

  useOverlayPointerOverride({ active: args.active, glCanvasRef: args.glCanvasRef, overlayElsRef, pointerOverrideActiveRef, pointerOverrideResetTimerRef })
  useThreeOverlayDragRecovery({
    draggedNodeIdRef: args.draggedNodeIdRef,
    dragOverridesRef,
    screenDragOverridesRef,
    headerDragRef,
    overlayPanRef,
    setDraggedNodeId: args.setDraggedNodeId,
  })

  const stopEvent = React.useCallback(captureRichMediaPanelBoundaryEvent, [])
  const stopPanelChromeSafeEvent = React.useCallback((event: React.SyntheticEvent) => {
    const target = event.target instanceof Element ? event.target : null
    if (target?.closest('button,a,input,textarea,select,[role="button"],[data-kg-rich-media-resize-handle="1"],[data-kg-rich-media-interaction-owner="1"]')) return
    try {
      event.stopPropagation()
    } catch {
      void 0
    }
  }, [])
  const beginResize = React.useCallback((id: string, pointerId: number) => {
    const el = overlayElsRef.current.get(id) || null
    const rect = el?.getBoundingClientRect()
    const measuredW = Number.parseFloat(el?.style.width || '') || rect?.width || 24
    const measuredH = Number.parseFloat(el?.style.height || '') || rect?.height || 24
    const scale = rect?.width && measuredW > 0 ? rect.width / measuredW : 1
    const stableSize = getPanelSizeForId(id)
    const frameMetrics = readRichMediaPanelFrameMetrics(el)
    const startW = stableSize ? stableSize.w : Math.max(24, measuredW)
    const startH = stableSize
      ? stableSize.h
      : (measuredH || Math.max(24, Math.round(computePanelFrameSizeFromWidth16x9({ panelW: startW, metrics: frameMetrics }).panelH)))
    resizeRef.current = { id, pointerId, startW, startH, frameMetrics, lastW: startW, lastH: startH, scale }
  }, [getPanelSizeForId])

  const moveResize = React.useCallback((id: string, payload: { pointerId: number; dx: number; dy: number }) => {
    const drag = resizeRef.current
    if (!drag || drag.id !== id || drag.pointerId !== payload.pointerId) return
    const next = computePanelFrameResizeFromDrag16x9({
      startW: drag.startW,
      startH: drag.startH,
      dxClientPx: payload.dx,
      dyClientPx: payload.dy,
      scale: drag.scale,
      metrics: drag.frameMetrics,
      minPanelW: 24,
      minPanelH: 24,
    })
    const nextW = Math.max(24, Math.round(next.panelW))
    const nextH = Math.max(24, Math.round(next.panelH))
    drag.lastW = nextW
    drag.lastH = nextH
    localPanelSizesRef.current[id] = { w: nextW, h: nextH }
    requestSchedule()
  }, [requestSchedule])

  const endResize = React.useCallback((id: string, pointerId: number) => {
    const drag = resizeRef.current
    if (!drag || drag.id !== id || drag.pointerId !== pointerId) return
    resizeRef.current = null
    localPanelSizesRef.current[id] = { w: drag.lastW, h: drag.lastH }
    const baseProps = readNodeProperties(id)
    useGraphStore.getState().updateNode(id, {
      properties: {
        ...baseProps,
        'visual:width': drag.lastW,
        'visual:height': drag.lastH,
      },
    } as Partial<GraphNode>)
    requestSchedule()
    bumpControlRevision()
  }, [bumpControlRevision, readNodeProperties, requestSchedule])
  const stopHeaderControlEvent = React.useCallback((event: React.SyntheticEvent) => {
    try {
      event.preventDefault()
      event.stopPropagation()
    } catch {
      void 0
    }
  }, [])

  const togglePinned = React.useCallback((id: string) => {
    const pinned = readPanelPinned(id)
    const el = overlayElsRef.current.get(id) || null
    const rect = el?.getBoundingClientRect()
    if (pinned) {
      const sx = rect && Number.isFinite(rect.left) && Number.isFinite(rect.width) ? rect.left + rect.width / 2 : undefined
      const sy = rect && Number.isFinite(rect.top) && Number.isFinite(rect.height) ? rect.top + rect.height / 2 : undefined
      localPinnedRef.current[id] = false
      if (Number.isFinite(sx) && Number.isFinite(sy)) localScreenAnchorsRef.current[id] = { sx: Math.round(Number(sx)), sy: Math.round(Number(sy)) }
    } else {
      const p = dragOverridesRef.current[id] || args.positions[id] || null
      localPinnedRef.current[id] = true
      if (p) localPositionsRef.current[id] = [p[0], p[1], p[2]]
      if (p) updateNodeProperties(id, { pos3d: [p[0], p[1], p[2]] as unknown as JSONValue })
      delete screenDragOverridesRef.current[id]
    }
    requestSchedule()
    bumpControlRevision()
  }, [args.positions, bumpControlRevision, readPanelPinned, requestSchedule, updateNodeProperties])

  const togglePanelSize = React.useCallback((id: string) => {
    const el = overlayElsRef.current.get(id) || null
    const rect = el?.getBoundingClientRect()
    const stable = getPanelSizeForId(id)
    const currentW = stable?.w || (rect && Number.isFinite(rect.width) ? Math.max(24, Math.round(rect.width)) : 320)
    const frameMetrics = readRichMediaPanelFrameMetrics(el)
    const nextW = currentW > 260 ? 220 : 380
    const nextFrame = computePanelFrameSizeFromWidth16x9({ panelW: nextW, metrics: frameMetrics })
    localPanelSizesRef.current[id] = { w: Math.round(nextFrame.panelW), h: Math.round(nextFrame.panelH) }
    updateNodeProperties(id, {
      'visual:width': Math.round(nextFrame.panelW) as unknown as JSONValue,
      'visual:height': Math.round(nextFrame.panelH) as unknown as JSONValue,
    })
    requestSchedule()
    bumpControlRevision()
  }, [bumpControlRevision, getPanelSizeForId, requestSchedule, updateNodeProperties])

  const overlayLayer = args.active && overlayNodesPool.length > 0 ? (
    <section aria-label="3D media overlay" className="absolute inset-0 z-[80] pointer-events-none">
      {overlayNodesPool.map(n => (
        <RichMediaPanel
          key={n.id}
          ref={getOverlayRefForId(n.id)}
          overlayId={n.id}
          className="absolute left-0 top-0 pointer-events-auto"
          style={{ position: 'absolute' }}
          title={n.title}
          url={n.url}
          srcDoc={n.srcDoc}
          openUrl={n.openUrl}
          kind={n.kind} renderMode={n.renderMode}
          panelChrome="storyboardWidget"
          widgetToolbarActive={true}
          headerPinned={readPanelPinned(n.id)}
          headerMinimized={(getPanelSizeForId(n.id)?.w || 9999) <= 260}
          onHeaderPinnedPointerDown={stopHeaderControlEvent}
          onHeaderTogglePinned={event => {
            stopHeaderControlEvent(event)
            togglePinned(n.id)
          }}
          onHeaderToggleMinimized={() => togglePanelSize(n.id)}
          interactive={resolveRichMediaPanelInteractive({
            nodeInteractive: n.interactive,
            renderMediaAsNodes: store.renderMediaAsNodes,
            infiniteCanvasInteractionMode: store.infiniteCanvasInteractionMode,
            canvasRenderMode: '3d',
            canvas3dMode: store.canvas3dMode,
          })}
          hideUntilReady={false}
          panel={n.panel}
          onPanelChange={next => {
            if (!n.panel) return
            commitRichMediaPanelChange({
              nodeId: n.id,
              next,
              updateNode: (id, patch) => useGraphStore.getState().updateNode(id, patch as Partial<GraphNode>),
            })
          }}
          forwardWheelTo={store.infiniteCanvasInteractionMode === 'interactive' ? undefined : (() => args.glCanvasRef.current)}
          forwardWheelBeforeScrollableTarget={store.infiniteCanvasInteractionMode !== 'interactive'}
          resizable={true}
          onResizeStart={({ pointerId }) => beginResize(n.id, pointerId)}
          onResize={({ pointerId, dx, dy }) => moveResize(n.id, { pointerId, dx, dy })}
          onResizeEnd={({ pointerId }) => endResize(n.id, pointerId)}
          onOverlayPanStart={({ pointerId }) => {
            const pose = useGraphStore.getState().captureThreeCameraPose()
            if (pose) overlayPanRef.current = { pointerId, pose }
          }}
          onOverlayPan={({ pointerId, dx, dy }) => {
            const st = overlayPanRef.current
            if (!st || st.pointerId !== pointerId) return
            const nextPose = computeThreeCameraPoseAfterOverlayPan({
              pose: st.pose,
              dxClientPx: dx,
              dyClientPx: dy,
              shiftKey: true,
              verticalProjectionScale: args.threeCameraRef.current?.projectionMatrix.elements[5] || 1,
              viewportH: args.threeGlRef.current?.domElement.clientHeight || 1,
            })
            useGraphStore.getState().restoreThreeCameraPose(nextPose)
            commitCameraFramingCanvasPose({
              position: [nextPose.position.x, nextPose.position.y, nextPose.position.z],
              target: [nextPose.target.x, nextPose.target.y, nextPose.target.z],
            })
          }}
          onOverlayPanEnd={({ pointerId }) => {
            const st = overlayPanRef.current
            if (st && st.pointerId === pointerId) overlayPanRef.current = null
          }}
          onHeaderDragStart={({ pointerId }) => {
            const camera = args.threeCameraRef.current
            const gl = args.threeGlRef.current
            const p = dragOverridesRef.current[n.id] || args.positions[n.id]
            if (!camera || !gl) return
            const viewportW = gl.domElement.clientWidth || 1
            const viewportH = gl.domElement.clientHeight || 1
            const projected = p
              ? computeOverlayDragStartScreenSpace3d({
                  camera,
                  world: { x: p[0], y: p[1], z: p[2] },
                  viewportW,
                  viewportH,
                })
              : null
            const rect = overlayElsRef.current.get(n.id)?.getBoundingClientRect()
            // Layout may clamp an offscreen world projection; grab the visible panel.
            const start = {
              sx: rect?.width ? rect.left + rect.width / 2 : projected?.sx ?? viewportW / 2,
              sy: rect?.height ? rect.top + rect.height / 2 : projected?.sy ?? viewportH / 2,
              ndcZ: projected?.ndcZ ?? 0,
              w: viewportW,
              h: viewportH,
            }
            headerDragRef.current = {
              id: n.id,
              pointerId,
              mode: readPanelPinned(n.id) ? 'world' : 'screen',
              sx: start.sx,
              sy: start.sy,
              ndcZ: start.ndcZ,
              w: start.w,
              h: start.h,
            }
            args.setDraggedNodeId(n.id)
          }}
          onHeaderDrag={({ dx, dy, pointerId }) => {
            const st = headerDragRef.current
            const camera = args.threeCameraRef.current
            if (!st || st.id !== n.id || st.pointerId !== pointerId) return
            if (st.mode === 'screen') {
              screenDragOverridesRef.current[n.id] = { sx: st.sx + dx, sy: st.sy + dy }
              requestSchedule()
              return
            }
            if (!camera) return
            const next = computeOverlayDraggedWorldPos3d({
              camera,
              startSx: st.sx,
              startSy: st.sy,
              dxClientPx: dx,
              dyClientPx: dy,
              ndcZ: st.ndcZ,
              viewportW: st.w || 1,
              viewportH: st.h || 1,
            })
            if (next) dragOverridesRef.current[n.id] = [next.x, next.y, next.z]
            requestSchedule()
          }}
          onHeaderDragEnd={({ pointerId }) => {
            const st = headerDragRef.current
            if (st && st.id === n.id && st.pointerId === pointerId) headerDragRef.current = null
            const p = dragOverridesRef.current[n.id]
            const screen = screenDragOverridesRef.current[n.id]
            if (screen) {
              localPinnedRef.current[n.id] = false
              localScreenAnchorsRef.current[n.id] = {
                sx: Math.round(screen.sx),
                sy: Math.round(screen.sy),
              }
            } else if (p) {
              localPositionsRef.current[n.id] = [p[0], p[1], p[2]]
              updateNodeProperties(n.id, { pos3d: [p[0], p[1], p[2]] as unknown as JSONValue })
            }
            delete dragOverridesRef.current[n.id]
            delete screenDragOverridesRef.current[n.id]
            args.setDraggedNodeId(null)
            requestSchedule()
            bumpControlRevision()
          }}
          onWheelCapture={stopEvent}
          onClickCapture={stopPanelChromeSafeEvent}
          onDoubleClickCapture={stopPanelChromeSafeEvent}
          onContextMenuCapture={stopPanelChromeSafeEvent}
        />
      ))}
    </section>
  ) : null

  return { dragOverridesRef, overlayHiddenNodeIdSet, overlayLayer, requestSchedule, scheduleRef }
}

function useOverlayPointerOverride(args: {
  active: boolean
  glCanvasRef: React.MutableRefObject<HTMLCanvasElement | null>
  overlayElsRef: React.MutableRefObject<Map<string, HTMLElement>>
  pointerOverrideActiveRef: React.MutableRefObject<boolean>
  pointerOverrideResetTimerRef: React.MutableRefObject<number | null>
}) {
  const { active, glCanvasRef, overlayElsRef, pointerOverrideActiveRef, pointerOverrideResetTimerRef } = args
  React.useEffect(() => {
    const canvas = glCanvasRef.current
    if (!active || !canvas) return
    const clearTimer = () => {
      const timer = pointerOverrideResetTimerRef.current
      if (timer == null) return
      pointerOverrideResetTimerRef.current = null
      window.clearTimeout(timer)
    }
    const setOverride = (enabled: boolean) => {
      if (pointerOverrideActiveRef.current === enabled) return
      pointerOverrideActiveRef.current = enabled
      for (const [, el] of overlayElsRef.current) {
        if (enabled) el.style.pointerEvents = 'none'
        else el.style.removeProperty('pointer-events')
      }
    }
    const onDown = () => {
      setOverride(true)
      clearTimer()
      pointerOverrideResetTimerRef.current = window.setTimeout(() => {
        pointerOverrideResetTimerRef.current = null
        setOverride(false)
      }, 1500)
    }
    const onUp = () => {
      clearTimer()
      setOverride(false)
    }
    const onWindowMove = (event: PointerEvent) => {
      if ((event.buttons || 0) === 0) onUp()
    }
    canvas.addEventListener('pointerdown', onDown, { passive: true })
    window.addEventListener('pointerup', onUp, { passive: true })
    window.addEventListener('pointercancel', onUp, { passive: true })
    window.addEventListener('pointermove', onWindowMove, { passive: true })
    window.addEventListener('blur', onUp)
    return () => {
      canvas.removeEventListener('pointerdown', onDown)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
      window.removeEventListener('pointermove', onWindowMove)
      window.removeEventListener('blur', onUp)
      clearTimer()
      setOverride(false)
    }
  }, [active, glCanvasRef, overlayElsRef, pointerOverrideActiveRef, pointerOverrideResetTimerRef])
}
