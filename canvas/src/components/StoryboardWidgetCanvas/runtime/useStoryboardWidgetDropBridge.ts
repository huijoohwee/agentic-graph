import React from 'react'

import { useGraphStore } from '@/hooks/useGraphStore'
import { createUniqueId } from '@/lib/ids'
import type { GraphData, GraphNode } from '@/lib/graph/types'
import {
  FLOW_GRABMAPS_DISCOVERY_NODE_TYPE_ID,
  readGrabMapsDiscoveryWidgetProperties,
} from '@/features/storyboard-widget-manager/grabMapsDiscoveryWidget'
import {
  FLOW_IMAGE_GENERATION_NODE_TYPE_ID,
  FLOW_RICH_MEDIA_PANEL_NODE_LABEL,
  FLOW_RICH_MEDIA_PANEL_NODE_TYPE_ID,
  FLOW_TEXT_GENERATION_NODE_LABEL,
  FLOW_TEXT_GENERATION_NODE_TYPE_ID,
  FLOW_VIDEO_GENERATION_NODE_TYPE_ID,
  FLOW_VIDEO_TRANSCRIBER_NODE_TYPE_ID,
  getFlowTextGenerationSeedPrompt,
} from '@/lib/config'
import {
  FLOW_WIDGET_POINTER_DRAG_DROP_EVENT,
  claimFlowWidgetPointerDragDrop,
  clearActiveFlowWidgetPointerDragSession,
  hasFlowWidgetDragType,
  isFlowWidgetPointerDragDropClaimed,
  readActiveFlowWidgetPointerDragSession,
  readFlowWidgetDragPayloadFromDataTransfer,
  resolveFlowWidgetDragEventReleaseClientPoint,
  resolveFlowWidgetPointerReleaseClientPoint,
  type FlowWidgetDragPayloadV1,
  type FlowWidgetPointerDragDropDetail,
  type FlowWidgetPointerDragSession,
} from '@/lib/storyboardWidget/widgetDrag'
import { disableAutoZoomModesForUserGesture } from '@/lib/canvas/auto-zoom-modes'
import type { WidgetRegistryEntry } from '@/features/storyboard-widget-manager/widgetRegistryTypes'
import { FLOW_WIDGET_FORM_ID_KEY, FLOW_WIDGET_TYPE_ID_KEY } from '@/features/storyboard-widget-manager/resolveWidgetRegistry'
import {
  getWidgetRegistryEntryLabel,
  resolveEffectiveTextGenerationWidgetProperties,
  resolveTextGenerationGlobalDefaultsForProviderFamily,
} from '@/features/storyboard-widget-manager/registryTemplates'
import { inferTextGenerationProviderFamily } from '@/features/storyboard-widget-manager/textGenerationProviderFamily'
import { resolveCanvasViewportMeasureElement } from '@/lib/canvas/viewportMeasureElement'
import { screenToWorld } from '@/lib/zoom/viewport'
import { requestGeospatialCurrentLocation, setGeospatialModeEnabled } from '@/features/geospatial/gympgrphBridge'
import { readGeospatialCursorLngLat } from '@/lib/gympgrph/api'
import {
  OVERLAY_NODE_OVERRIDE_LOCK_MS,
  isRecord,
  pickFiniteNumber,
  readFiniteGeoLatLng,
  readResolvedStoryboardWidgetDropTransform,
  captureStoryboardWidgetDropCameraAuthority,
  restoreStoryboardWidgetDropCameraAuthority,
} from '@/components/StoryboardWidgetCanvas/storyboardWidgetCanvasShared'
import { buildBytePlusImageWidgetSeedProperties } from '@/features/integrations/byteplusImageGenerationDefaults'
import { buildBytePlusVideoWidgetSeedProperties } from '@/features/integrations/byteplusVideoGenerationDefaults'
import { buildRichMediaPanelDroppedMediaProperties } from '@/lib/render/richMediaPanelNode'
import { RICH_MEDIA_PANEL_DEFAULT_VIEW_SIZE } from '@/lib/render/richMediaPanelDefaults'
import { buildWidgetCardLayoutSeed } from '@/lib/storyboardWidget/widgetCardLayoutVariants'
import { buildGraphDocumentMetaKey } from '@/lib/graph/graphMetaKey'
import {
  MEDIA_POINTER_DRAG_DROP_EVENT,
  claimMediaPointerDragDrop,
  clearMediaPointerDragPayload,
  hasMediaDragPayload,
  isMediaPointerDragDistanceAccepted,
  isMediaPointerDragDropClaimed,
  isMediaDropClaimedByNestedTarget,
  readMediaDragPayload,
  resolveMediaDragEventReleaseClientPoint,
  type MediaDragPayload,
  type MediaPointerDragDropDetail,
} from '@/lib/ui/mediaDragPayload'
import { recordMediaDropScreenAnchor } from '@/lib/ui/mediaDropScreenAnchors'
import { useTextSelectionWidgetCreateBridge } from './useTextSelectionWidgetCreateBridge'
import {
  buildStoryboardWidgetInsertionPlacement,
  captureStoryboardWidgetInsertionPlacement,
} from '@/lib/storyboardWidget/widgetInsertionPlacement'
function addStoryboardWidgetUsedNodeIdVariants(out: Set<string>, rawId: unknown): void {
  const id = String(rawId || '').trim()
  if (!id) return
  out.add(id)
  const parts = id.split('::').map(part => part.trim()).filter(Boolean)
  const suffix = parts.length > 1 ? parts[parts.length - 1] : ''
  if (suffix) out.add(suffix)
}
function readStoryboardWidgetDropRect(args: {
  rootRef: React.RefObject<HTMLElement | null>
  widgetDropBridgeOnly: boolean
}): DOMRect | null {
  const viewportEl = resolveCanvasViewportMeasureElement(args.rootRef.current)
  if (viewportEl) return viewportEl.getBoundingClientRect()
  if (!args.widgetDropBridgeOnly) return null
  if (typeof document !== 'undefined') {
    const surfaces = Array.from(document.querySelectorAll<HTMLElement>('[data-kg-storyboard-widget-surface-root]'))
    const activeSurface = surfaces.find(surface => {
      const rect = surface.getBoundingClientRect()
      return rect.width > 0 && rect.height > 0
    })
    if (activeSurface) return activeSurface.getBoundingClientRect()
  }
  const w = typeof window !== 'undefined' ? window.innerWidth : 0
  const h = typeof window !== 'undefined' ? window.innerHeight : 0
  if (!(Number.isFinite(w) && w > 0 && Number.isFinite(h) && h > 0)) return null
  return {
    left: 0, top: 0, right: w, bottom: h, width: w, height: h, x: 0, y: 0,
    toJSON: () => ({}),
  } as DOMRect
}

function sameWidgetRegistryShape(
  entry: WidgetRegistryEntry,
  payload: Pick<FlowWidgetDragPayloadV1, 'nodeTypeId' | 'widgetTypeId' | 'formId'>,
): boolean {
  const nodeTypeId = String(payload.nodeTypeId || '').trim()
  const widgetTypeId = String(payload.widgetTypeId || '').trim()
  const formId = String(payload.formId || '').trim()
  return !!nodeTypeId
    && !!widgetTypeId
    && !!formId
    && String(entry.nodeTypeId || '').trim() === nodeTypeId
    && String(entry.widgetTypeId || '').trim() === widgetTypeId
    && String(entry.formId || '').trim() === formId
}

export function resolveWidgetRegistryEntryForDrop(
  registry: ReadonlyArray<WidgetRegistryEntry>,
  payload: Pick<FlowWidgetDragPayloadV1, 'registryEntryId' | 'nodeTypeId' | 'widgetTypeId' | 'formId'>,
): WidgetRegistryEntry | null {
  const entries = Array.isArray(registry) ? registry : []
  const registryEntryId = String(payload.registryEntryId || '').trim()
  const byId = entries.find(entry => entry && entry.isEnabled && entry.id === registryEntryId) || null
  if (byId) return byId
  return entries.find(entry => entry && entry.isEnabled && sameWidgetRegistryShape(entry, payload)) || null
}

export function useStoryboardWidgetDropBridge(args: {
  active: boolean
  widgetDropCaptureEnabled?: boolean
  widgetDropBridgeOnly: boolean
  geospatialWidgetPanelMode?: boolean
  rootRef: React.RefObject<HTMLElement | null>
  widgetRegistryRef: React.MutableRefObject<ReadonlyArray<WidgetRegistryEntry>>
  baseGraphData: GraphData | null
  draftGraphDataRef: React.MutableRefObject<GraphData | null>
  reservedNodeIdsRef: React.MutableRefObject<Set<string>>
  pendingOverlayNodeIdRef: React.MutableRefObject<string | null>
  pendingOpenWidgetNodeIdRef: React.MutableRefObject<string | null>
  overlayNodeIdOverrideWasSelectedRef: React.MutableRefObject<boolean>
  overlayNodeIdOverrideUntilMsRef: React.MutableRefObject<number>
  lastDroppedWidgetNodeIdRef: React.MutableRefObject<string | null>
  zoomViewKeyRef: React.MutableRefObject<string | null>
  getLiveZoomTransform: () => { k: number; x: number; y: number } | null
  appendDraftNode: (args: {
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
  }) => string
  appendDraftEdge?: (edge: GraphData['edges'][number]) => boolean
  updateNode: (nodeId: string, patch: Partial<GraphNode>) => void
  shouldDedupeWidgetDrop: (key: string) => boolean
  scheduleForceSelect: (id: string, opts?: { minHoldMs?: number }) => void
  setCanvasWindowOffsetFromRect: (rect: DOMRect) => void
  setOverlayNodeIdOverride: React.Dispatch<React.SetStateAction<string | null>>
  setPendingOverlayNode: React.Dispatch<React.SetStateAction<GraphNode | null>>
  setLastDroppedWidgetToken: React.Dispatch<React.SetStateAction<number>>
  upsertUiToast: (args: { id: string; kind: 'neutral' | 'warning' | 'success' | 'error'; message: string; ttlMs?: number }) => void
}) {
  const captureInsertionCameraAuthority = React.useCallback(() => {
    const rect = readStoryboardWidgetDropRect({
      rootRef: args.rootRef,
      widgetDropBridgeOnly: args.widgetDropBridgeOnly,
    })
    return captureStoryboardWidgetDropCameraAuthority({
      getLiveZoomTransform: args.getLiveZoomTransform,
      zoomViewKeyRef: args.zoomViewKeyRef,
      draftGraphDataRef: args.draftGraphDataRef,
      baseGraphData: args.baseGraphData,
      screenOrigin: rect ? { left: rect.left, top: rect.top } : null,
    })
  }, [args.baseGraphData, args.draftGraphDataRef, args.getLiveZoomTransform, args.rootRef, args.widgetDropBridgeOnly, args.zoomViewKeyRef])

  const preserveDropCameraAfterInsert = React.useCallback((
    authority: ReturnType<typeof captureStoryboardWidgetDropCameraAuthority>,
  ) => {
    const restore = (requestLayout: boolean) => restoreStoryboardWidgetDropCameraAuthority({
      authority,
      zoomViewKeyRef: args.zoomViewKeyRef,
      requestBalancedLayout: requestLayout,
    })
    restore(false)
    if (typeof window !== 'undefined') {
      window.requestAnimationFrame(() => {
        restore(false)
        window.requestAnimationFrame(() => restore(false))
      })
    }
  }, [args.zoomViewKeyRef])

  const openPendingOverlayNode = React.useCallback((rawId: unknown) => {
    const id = String(rawId || '').trim()
    if (!id) return
    useGraphStore.getState().updateOpenWidgetNodeIds(prev => (prev.includes(id) ? prev : [...prev, id]))
  }, [])

  const syncGrabMapsDiscoveryGeoFromDropCursor = React.useCallback(
    (payload: { id: string; properties: Record<string, unknown> }) => {
      if (!args.widgetDropBridgeOnly) return
      if (typeof window === 'undefined') return
      let cancelled = false
      let attempts = 0
      const trySync = () => {
        if (cancelled) return
        attempts += 1
        const cursor = readGeospatialCursorLngLat()
        const lat = cursor ? Number(cursor.lat) : Number.NaN
        const lng = cursor ? Number(cursor.lng) : Number.NaN
        if (Number.isFinite(lat) && Number.isFinite(lng)) {
          const baseGeo = isRecord(payload.properties.geo) ? payload.properties.geo : {}
          const nextProperties = {
            ...payload.properties,
            geo: {
              ...baseGeo,
              lat,
              lng,
            },
          }
          args.updateNode(payload.id, { properties: nextProperties as never })
          args.setPendingOverlayNode(prev => {
            if (!prev || String(prev.id || '') !== payload.id) return prev
            const prevProps = isRecord(prev.properties) ? prev.properties : {}
            const prevGeo = isRecord(prevProps.geo) ? prevProps.geo : {}
            return {
              ...prev,
              properties: {
                ...prevProps,
                geo: {
                  ...prevGeo,
                  lat,
                  lng,
                },
              } as never,
            }
          })
          void requestGeospatialCurrentLocation({ lat, lng }).catch(() => void 0)
          return
        }
        if (attempts >= 4) return
        window.setTimeout(() => {
          window.requestAnimationFrame(trySync)
        }, attempts === 1 ? 0 : 32)
      }
      window.requestAnimationFrame(trySync)
      window.setTimeout(() => {
        cancelled = true
      }, 240)
    },
    [args],
  )

  const captureInsertionPlacement = React.useCallback(() => {
    const state = useGraphStore.getState()
    const insertionGraphData =
      args.draftGraphDataRef.current
      || args.baseGraphData
      || state.graphData as GraphData | null
    return captureStoryboardWidgetInsertionPlacement({
      graphData: insertionGraphData,
      pinnedByGraphMetaKey: state.flowWidgetPinnedByNodeIdByGraphMetaKey,
      pinnedByNodeId: state.flowWidgetPinnedByNodeId,
      screenByGraphMetaKey: state.flowWidgetPosByNodeIdByGraphMetaKey,
      screenByNodeId: state.flowWidgetPosByNodeId,
      worldByGraphMetaKey: state.flowWidgetWorldPosByNodeIdByGraphMetaKey,
      worldByNodeId: state.flowWidgetWorldPosByNodeId,
    })
  }, [args.baseGraphData, args.draftGraphDataRef])

  const restoreInsertionPlacement = React.useCallback((payload: {
    snapshot: ReturnType<typeof captureStoryboardWidgetInsertionPlacement>
    targetNodeId: string
    x: number
    y: number
    pinTargetInCanvas: boolean
  }) => {
    const state = useGraphStore.getState()
    const insertionGraphData =
      args.draftGraphDataRef.current
      || args.baseGraphData
      || state.graphData as GraphData | null
    const graphMetaKey = buildGraphDocumentMetaKey(insertionGraphData)
    const placement = buildStoryboardWidgetInsertionPlacement({
      snapshot: payload.snapshot,
      targetNodeId: payload.targetNodeId,
      targetWorldPosition: { x: payload.x, y: payload.y },
      pinTargetInCanvas: payload.pinTargetInCanvas,
    })
    state.setFlowWidgetPinnedByNodeIdForGraph(graphMetaKey, placement.pinnedByNodeId)
    state.setFlowWidgetPosByNodeIdForGraph(graphMetaKey, placement.screenByNodeId)
    state.setFlowWidgetWorldPosByNodeIdForGraph(graphMetaKey, placement.worldByNodeId)
  }, [args.baseGraphData, args.draftGraphDataRef])

  const addNodeFromRegistryAtWorld = React.useCallback(
    (payload: { entry: WidgetRegistryEntry; layoutVariantId?: unknown; x: number; y: number }) => {
      disableAutoZoomModesForUserGesture(useGraphStore.getState())
      const insertionPlacement = captureInsertionPlacement()
      const insertionCameraAuthority = captureInsertionCameraAuthority()
      const entry = payload.entry
      const x = Number.isFinite(payload.x) ? payload.x : 0
      const y = Number.isFinite(payload.y) ? payload.y : 0
      const layoutSeed = entry.nodeTypeId === FLOW_TEXT_GENERATION_NODE_TYPE_ID ? buildWidgetCardLayoutSeed(payload.layoutVariantId) : null
      const label = layoutSeed?.label || getWidgetRegistryEntryLabel(entry)
      const properties: Record<string, unknown> = {
        [FLOW_WIDGET_TYPE_ID_KEY]: entry.widgetTypeId,
        [FLOW_WIDGET_FORM_ID_KEY]: entry.formId,
      }
      if (entry.nodeTypeId === FLOW_IMAGE_GENERATION_NODE_TYPE_ID) {
        Object.assign(properties, buildBytePlusImageWidgetSeedProperties({
          prompt: 'Generate an image responsive to the active request.',
        }))
        properties.imageUrl = ''
      }
      if (entry.nodeTypeId === FLOW_TEXT_GENERATION_NODE_TYPE_ID) {
        const store = useGraphStore.getState()
        const providerFamily = inferTextGenerationProviderFamily({
          provider: store.chatProvider, endpointUrl: store.chatEndpointUrl, model: store.chatModel,
          widgetTypeId: entry.widgetTypeId,
          formId: entry.formId,
        })
        const nextTextProperties = resolveTextGenerationGlobalDefaultsForProviderFamily({
          providerFamily,
          globalProperties: {
            chatProvider: store.chatProvider,
            chatAuthMode: store.chatAuthMode,
            chatEndpointUrl: store.chatEndpointUrl,
            chatModel: store.chatModel,
            chatTemperature: store.chatTemperature,
            chatMaxCompletionTokens: store.chatMaxCompletionTokens,
            chatServiceTier: store.chatServiceTier,
            chatStream: store.chatStream,
            chatMessagesJson: store.chatMessagesJson,
            chatReasoningEffort: store.chatReasoningEffort,
            chatThinkingType: store.chatThinkingType,
            chatThinkingJson: store.chatThinkingJson,
            chatFrequencyPenalty: store.chatFrequencyPenalty,
            chatPresencePenalty: store.chatPresencePenalty,
            chatTopP: store.chatTopP,
            chatLogprobs: store.chatLogprobs,
            chatTopLogprobs: store.chatTopLogprobs,
            chatParallelToolCalls: store.chatParallelToolCalls,
            chatStopJson: store.chatStopJson,
            chatStreamOptionsJson: store.chatStreamOptionsJson,
            chatResponseFormatJson: store.chatResponseFormatJson,
            chatLogitBiasJson: store.chatLogitBiasJson,
            chatToolsJson: store.chatToolsJson,
            chatToolChoiceJson: store.chatToolChoiceJson,
          },
        })
        Object.assign(properties, {
          ...resolveEffectiveTextGenerationWidgetProperties({
            providerFamily,
            localProperties: nextTextProperties,
            globalProperties: nextTextProperties,
          }),
          prompt: getFlowTextGenerationSeedPrompt(entry.formId),
          output: '',
          title: FLOW_TEXT_GENERATION_NODE_LABEL,
        })
        if (layoutSeed) Object.assign(properties, layoutSeed.properties)
      }
      if (entry.nodeTypeId === FLOW_RICH_MEDIA_PANEL_NODE_TYPE_ID) {
        Object.assign(properties, { output: '', imageUrl: '', videoUrl: '', audioUrl: '', outputSrcDoc: '' })
      }
      if (entry.nodeTypeId === FLOW_VIDEO_TRANSCRIBER_NODE_TYPE_ID) {
        Object.assign(properties, { sourceUrl: '', languageHint: '', output: '' })
      }
      if (entry.nodeTypeId === FLOW_VIDEO_GENERATION_NODE_TYPE_ID) {
        Object.assign(properties, buildBytePlusVideoWidgetSeedProperties({
          prompt: 'Generate a video responsive to the active request.',
        }))
        properties.reference_image = ''
        properties.videoUrl = ''
      }
      if (entry.nodeTypeId === FLOW_GRABMAPS_DISCOVERY_NODE_TYPE_ID) {
        Object.assign(properties, readGrabMapsDiscoveryWidgetProperties())
        if (!args.geospatialWidgetPanelMode) {
          const cursorLngLat = args.widgetDropBridgeOnly ? readGeospatialCursorLngLat() : null
          const cursorLat = cursorLngLat ? Number(cursorLngLat.lat) : Number.NaN
          const cursorLng = cursorLngLat ? Number(cursorLngLat.lng) : Number.NaN
          const nearLat = pickFiniteNumber(properties.nearbyLat)
          const nearLon = pickFiniteNumber(properties.nearbyLon)
          const searchLat = pickFiniteNumber(properties.searchLat)
          const searchLon = pickFiniteNumber(properties.searchLon)
          const geoLat = Number.isFinite(cursorLat) ? cursorLat : (nearLat ?? searchLat)
          const geoLng = Number.isFinite(cursorLng) ? cursorLng : (nearLon ?? searchLon)
          if (geoLat != null && geoLng != null) {
            const geoRaw = isRecord(properties.geo) ? properties.geo : {}
            properties.geo = { ...geoRaw, lat: geoLat, lng: geoLng }
          }
        }
      }
      const base: GraphData =
        args.draftGraphDataRef.current
        || (args.baseGraphData || { context: '', type: 'Graph', nodes: [], edges: [] })
      const used = new Set<string>()
      for (const node of base.nodes || []) addStoryboardWidgetUsedNodeIdVariants(used, node?.id)
      for (const rid of args.reservedNodeIdsRef.current) addStoryboardWidgetUsedNodeIdVariants(used, rid)
      const requestedId = createUniqueId('n', used)
      args.reservedNodeIdsRef.current.add(requestedId)
      const actualId = args.appendDraftNode({ id: requestedId, type: entry.nodeTypeId, label, x, y, properties, skipPendingSelect: true })
      if (!actualId) {
        args.reservedNodeIdsRef.current.delete(requestedId)
        return ''
      }
      args.reservedNodeIdsRef.current.add(actualId)
      restoreInsertionPlacement({
        snapshot: insertionPlacement,
        targetNodeId: actualId,
        x,
        y,
        pinTargetInCanvas: args.geospatialWidgetPanelMode !== true,
      })
      args.setOverlayNodeIdOverride(actualId)
      args.pendingOverlayNodeIdRef.current = actualId
      args.overlayNodeIdOverrideWasSelectedRef.current = false
      args.overlayNodeIdOverrideUntilMsRef.current = Date.now() + OVERLAY_NODE_OVERRIDE_LOCK_MS
      args.lastDroppedWidgetNodeIdRef.current = actualId
      args.setLastDroppedWidgetToken(Date.now())
      openPendingOverlayNode(actualId)
      useGraphStore.setState({
        selectionSource: 'canvas',
        selectedNodeId: actualId,
        selectedEdgeId: null,
        selectedGroupId: null,
        selectedNodeIds: [actualId],
        selectedEdgeIds: [],
        selectedGroupIds: [],
      })
      args.scheduleForceSelect(actualId, { minHoldMs: 700 })
      args.setPendingOverlayNode({ id: actualId, type: entry.nodeTypeId, label, x, y, properties: properties as never })
      args.pendingOpenWidgetNodeIdRef.current = actualId
      if (entry.nodeTypeId === FLOW_GRABMAPS_DISCOVERY_NODE_TYPE_ID && !args.geospatialWidgetPanelMode) {
        syncGrabMapsDiscoveryGeoFromDropCursor({ id: actualId, properties })
      }
      if (entry.nodeTypeId === FLOW_GRABMAPS_DISCOVERY_NODE_TYPE_ID) {
        void setGeospatialModeEnabled(true).catch(() => void 0)
        if (!args.geospatialWidgetPanelMode) {
          const dropGeo = readFiniteGeoLatLng(properties)
          if (dropGeo) void requestGeospatialCurrentLocation(dropGeo).catch(() => void 0)
        }
      }
      preserveDropCameraAfterInsert(insertionCameraAuthority)
      return actualId
    },
    [
      args,
      captureInsertionCameraAuthority,
      captureInsertionPlacement,
      openPendingOverlayNode,
      preserveDropCameraAfterInsert,
      restoreInsertionPlacement,
      syncGrabMapsDiscoveryGeoFromDropCursor,
    ],
  )

  useTextSelectionWidgetCreateBridge({
    active: args.active || args.widgetDropCaptureEnabled === true,
    widgetRegistryRef: args.widgetRegistryRef,
    resolveRegistryEntry: resolveWidgetRegistryEntryForDrop,
    addNodeFromRegistryAtWorld,
    authoringGraphDataRef: args.draftGraphDataRef,
    baseGraphData: args.baseGraphData,
    appendDraftEdge: args.appendDraftEdge,
  })

  const addRichMediaPanelFromMediaAtWorld = React.useCallback((payload: { media: MediaDragPayload; releaseClientPoint?: { clientX: number; clientY: number }; x: number; y: number }) => {
    disableAutoZoomModesForUserGesture(useGraphStore.getState())
    const insertionPlacement = captureInsertionPlacement()
    const insertionCameraAuthority = captureInsertionCameraAuthority()
    const mediaUrl = String(payload.media.url || '').trim()
    if (!mediaUrl) return ''
    const x = (Number.isFinite(payload.x) ? payload.x : 0) - RICH_MEDIA_PANEL_DEFAULT_VIEW_SIZE.width / 2
    const y = (Number.isFinite(payload.y) ? payload.y : 0) - RICH_MEDIA_PANEL_DEFAULT_VIEW_SIZE.height / 2
    const label = String(payload.media.label || '').trim() || FLOW_RICH_MEDIA_PANEL_NODE_LABEL
    const base: GraphData = args.draftGraphDataRef.current || (args.baseGraphData || { context: '', type: 'Graph', nodes: [], edges: [] })
    const used = new Set<string>()
    for (const node of base.nodes || []) addStoryboardWidgetUsedNodeIdVariants(used, node?.id)
    for (const rid of args.reservedNodeIdsRef.current) addStoryboardWidgetUsedNodeIdVariants(used, rid)
    const requestedId = createUniqueId('n', used)
    args.reservedNodeIdsRef.current.add(requestedId)
    const actualId = args.appendDraftNode({
      id: requestedId,
      type: FLOW_RICH_MEDIA_PANEL_NODE_TYPE_ID,
      label,
      x,
      y,
      fx: x,
      fy: y,
      vx: 0,
      vy: 0,
      properties: buildRichMediaPanelDroppedMediaProperties({ ...payload.media, url: mediaUrl, label }),
      skipPendingSelect: true,
    })
    if (!actualId) {
      args.reservedNodeIdsRef.current.delete(requestedId)
      return ''
    }
    args.reservedNodeIdsRef.current.add(actualId)
    restoreInsertionPlacement({
      snapshot: insertionPlacement,
      targetNodeId: actualId,
      x,
      y,
      pinTargetInCanvas: true,
    })
    if (payload.releaseClientPoint) recordMediaDropScreenAnchor(actualId, payload.releaseClientPoint)
    args.setOverlayNodeIdOverride(actualId)
    args.pendingOverlayNodeIdRef.current = actualId
    args.overlayNodeIdOverrideWasSelectedRef.current = false
    args.overlayNodeIdOverrideUntilMsRef.current = Date.now() + OVERLAY_NODE_OVERRIDE_LOCK_MS
    args.lastDroppedWidgetNodeIdRef.current = actualId
    args.setLastDroppedWidgetToken(Date.now())
    useGraphStore.setState({ selectionSource: 'canvas', selectedNodeId: actualId, selectedEdgeId: null, selectedGroupId: null, selectedNodeIds: [actualId], selectedEdgeIds: [], selectedGroupIds: [] })
    args.scheduleForceSelect(actualId, { minHoldMs: 700 })
    args.setPendingOverlayNode({ id: actualId, type: FLOW_RICH_MEDIA_PANEL_NODE_TYPE_ID, label, x, y, fx: x, fy: y, vx: 0, vy: 0, properties: buildRichMediaPanelDroppedMediaProperties({ ...payload.media, url: mediaUrl, label }) as never })
    preserveDropCameraAfterInsert(insertionCameraAuthority)
    return actualId
  }, [args, captureInsertionCameraAuthority, captureInsertionPlacement, preserveDropCameraAfterInsert, restoreInsertionPlacement])

  React.useEffect(() => {
    if (!(args.active || args.widgetDropCaptureEnabled)) return
    if (typeof document === 'undefined') return
    const deferredDropRafIds = new Set<number>()
    const maxDeferredDropFrames = 8
    const readDropRect = (): DOMRect | null => {
      return readStoryboardWidgetDropRect({
        rootRef: args.rootRef,
        widgetDropBridgeOnly: args.widgetDropBridgeOnly,
      })
    }
    const resolveDropPos = (sx: number, sy: number, rect: DOMRect, opts?: { allowNeutralFallback?: boolean }) => {
      const transform = readResolvedStoryboardWidgetDropTransform({
        getLiveZoomTransform: args.getLiveZoomTransform,
        zoomViewKeyRef: args.zoomViewKeyRef,
        draftGraphDataRef: args.draftGraphDataRef,
        baseGraphData: args.baseGraphData,
        allowNeutralFallback: opts?.allowNeutralFallback,
        useProjectedRichMediaShell: true,
        screenOrigin: { left: rect.left, top: rect.top },
      })
      if (!transform) return null
      return screenToWorld({
        transform,
        sx,
        sy,
      })
    }
    const scheduleDeferredDropCommit = (commit: (opts?: { allowNeutralFallback?: boolean }) => 'committed' | 'await-transform' | 'rejected') => {
      if (typeof window === 'undefined') return
      let attempts = 0
      let activeRafId = 0
      const tick = () => {
        if (activeRafId) deferredDropRafIds.delete(activeRafId)
        const allowNeutralFallback = attempts >= maxDeferredDropFrames
        const status = commit({ allowNeutralFallback })
        if (status !== 'await-transform' || allowNeutralFallback) return
        attempts += 1
        activeRafId = window.requestAnimationFrame(tick)
        deferredDropRafIds.add(activeRafId)
      }
      activeRafId = window.requestAnimationFrame(tick)
      deferredDropRafIds.add(activeRafId)
    }
    const appendMediaPanelAtClientPoint = (
      mediaPayload: MediaDragPayload | null,
      clientX: number,
      clientY: number,
      rect: DOMRect,
      opts?: { allowNeutralFallback?: boolean },
    ): 'committed' | 'await-transform' | 'rejected' => {
      if (!mediaPayload) return 'rejected'
      if (isMediaDropClaimedByNestedTarget(clientX, clientY)) return 'rejected'
      args.setCanvasWindowOffsetFromRect(rect)
      const sx = clientX - rect.left
      const sy = clientY - rect.top
      if (!Number.isFinite(sx) || !Number.isFinite(sy)) return 'rejected'
      if (sx < 0 || sy < 0 || sx > rect.width || sy > rect.height) return 'rejected'
      const pos = resolveDropPos(sx, sy, rect, opts)
      if (!pos) return 'await-transform'
      const mediaUrl = String(mediaPayload.url || '').trim()
      if (!mediaUrl) return 'rejected'
      const actualId = addRichMediaPanelFromMediaAtWorld({ media: { ...mediaPayload, url: mediaUrl }, releaseClientPoint: { clientX, clientY }, x: pos.x, y: pos.y })
      if (!actualId) return 'rejected'
      args.upsertUiToast({
        id: 'storyboard-widget-drop-media',
        kind: 'neutral',
        message: 'Created Rich Media Panel node.',
        ttlMs: 1500,
      })
      clearMediaPointerDragPayload()
      return 'committed'
    }
    const appendMediaPanelFromDrop = (ev: DragEvent, rect: DOMRect, opts?: { allowNeutralFallback?: boolean }): 'committed' | 'await-transform' | 'rejected' => {
      const release = resolveMediaDragEventReleaseClientPoint(ev)
      return appendMediaPanelAtClientPoint(
        ev.dataTransfer ? readMediaDragPayload(ev.dataTransfer) : null,
        release.clientX,
        release.clientY,
        rect,
        opts,
      )
    }
    const appendDeferredMediaPanelAtClientPoint = (
      mediaPayload: MediaDragPayload | null,
      clientX: number,
      clientY: number,
      opts?: { allowNeutralFallback?: boolean },
    ): 'committed' | 'await-transform' | 'rejected' => {
      const rect = readDropRect()
      if (!rect) return opts?.allowNeutralFallback ? 'rejected' : 'await-transform'
      return appendMediaPanelAtClientPoint(mediaPayload, clientX, clientY, rect, opts)
    }
    const appendDeferredWidgetAtClientPoint = (
      payload: { entry: WidgetRegistryEntry; registryEntryId: string; layoutVariantId?: string },
      clientX: number,
      clientY: number,
      opts?: { allowNeutralFallback?: boolean },
    ): 'committed' | 'await-transform' | 'rejected' => {
      const rect = readDropRect()
      if (!rect) return opts?.allowNeutralFallback ? 'rejected' : 'await-transform'
      args.setCanvasWindowOffsetFromRect(rect)
      const sx = clientX - rect.left
      const sy = clientY - rect.top
      if (!Number.isFinite(sx) || !Number.isFinite(sy)) return 'rejected'
      if (sx < 0 || sy < 0 || sx > rect.width || sy > rect.height) return 'rejected'
      const pos = resolveDropPos(sx, sy, rect, opts)
      if (!pos) return 'await-transform'
      const dropKey = `${payload.registryEntryId}:${payload.layoutVariantId || 'default'}:${Math.round(sx)}:${Math.round(sy)}`
      if (args.shouldDedupeWidgetDrop(dropKey)) return 'rejected'
      addNodeFromRegistryAtWorld({ entry: payload.entry, layoutVariantId: payload.layoutVariantId, x: pos.x, y: pos.y })
      args.upsertUiToast({
        id: 'storyboard-widget-drop-widget',
        kind: 'neutral',
        message: `Created ${payload.entry.nodeTypeId} node.`,
        ttlMs: 1500,
      })
      return 'committed'
    }
    const onDragOverCapture = (ev: DragEvent) => {
      const dt = ev.dataTransfer
      if (!dt) return
      const hasWidgetDrag = hasFlowWidgetDragType(dt)
      const hasMediaDrag = !hasWidgetDrag && hasMediaDragPayload(dt)
      if (!hasWidgetDrag && !hasMediaDrag) return
      if (hasMediaDrag && !args.widgetDropBridgeOnly) return
      const rect = readDropRect()
      if (!rect) return
      const x = ev.clientX
      const y = ev.clientY
      if (hasMediaDrag && isMediaDropClaimedByNestedTarget(x, y)) return
      if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) return
      try {
        ev.preventDefault()
        dt.dropEffect = 'copy'
      } catch {
        void 0
      }
    }
    const onDropCapture = (ev: DragEvent) => {
      const dt = ev.dataTransfer
      if (!dt) return
      const payload = readFlowWidgetDragPayloadFromDataTransfer({ getData: mime => dt.getData(mime) })
      if (payload) {
        const rect = readDropRect()
        if (!rect) return
        args.setCanvasWindowOffsetFromRect(rect)
        const release = resolveFlowWidgetDragEventReleaseClientPoint(ev)
        const sx = release.clientX - rect.left
        const sy = release.clientY - rect.top
        if (!Number.isFinite(sx) || !Number.isFinite(sy)) return
        if (sx < 0 || sy < 0 || sx > rect.width || sy > rect.height) return
        const entry = resolveWidgetRegistryEntryForDrop(args.widgetRegistryRef.current || [], payload)
        if (!entry) return
        const status = appendDeferredWidgetAtClientPoint({ entry, registryEntryId: payload.registryEntryId, layoutVariantId: payload.layoutVariantId }, release.clientX, release.clientY)
        if (status === 'await-transform') {
          scheduleDeferredDropCommit(retryOpts => appendDeferredWidgetAtClientPoint({ entry, registryEntryId: payload.registryEntryId, layoutVariantId: payload.layoutVariantId }, release.clientX, release.clientY, retryOpts))
        } else if (status !== 'committed') {
          try {
            ev.preventDefault()
            ev.stopPropagation()
            ;(ev as unknown as { stopImmediatePropagation?: () => void }).stopImmediatePropagation?.()
          } catch {
            void 0
          }
          return
        }
        clearActiveFlowWidgetPointerDragSession()
        try {
          ev.preventDefault()
          ev.stopPropagation()
          ;(ev as unknown as { stopImmediatePropagation?: () => void }).stopImmediatePropagation?.()
        } catch {
          void 0
        }
        return
      }

      if (hasMediaDragPayload(dt)) {
        if (!args.widgetDropBridgeOnly) return
        const rect = readDropRect()
        if (!rect) return
        const release = resolveMediaDragEventReleaseClientPoint(ev)
        if (isMediaDropClaimedByNestedTarget(release.clientX, release.clientY)) return
        const status = appendMediaPanelFromDrop(ev, rect)
        if (status === 'await-transform') {
          const mediaPayload = readMediaDragPayload(dt)
          scheduleDeferredDropCommit(retryOpts => appendDeferredMediaPanelAtClientPoint(mediaPayload, release.clientX, release.clientY, retryOpts))
        } else if (status !== 'committed') {
          return
        }
        try {
          ev.preventDefault()
          ev.stopPropagation()
          ;(ev as unknown as { stopImmediatePropagation?: () => void }).stopImmediatePropagation?.()
        } catch {
          void 0
        }
      }
    }
    const onMediaPointerDragDropCapture = (event: Event) => {
      if (!args.widgetDropBridgeOnly) return
      const detail = (event as CustomEvent<MediaPointerDragDropDetail>).detail
      if (!detail?.payload || !isMediaPointerDragDistanceAccepted(detail)) return
      if (isMediaPointerDragDropClaimed(detail)) return
      if (isMediaDropClaimedByNestedTarget(Number(detail.clientX), Number(detail.clientY))) return
      const rect = readDropRect()
      if (!rect) return
      claimMediaPointerDragDrop(detail)
      try {
        event.preventDefault()
        event.stopPropagation()
        ;(event as unknown as { stopImmediatePropagation?: () => void }).stopImmediatePropagation?.()
      } catch {
        void 0
      }
      const status = appendMediaPanelAtClientPoint(detail.payload, detail.clientX, detail.clientY, rect)
      if (status === 'await-transform') {
        scheduleDeferredDropCommit(retryOpts => appendDeferredMediaPanelAtClientPoint(detail.payload, detail.clientX, detail.clientY, retryOpts))
        return
      }
      if (status !== 'committed') {
        detail.__kgMediaPointerDropClaimed = false
        return
      }
    }
    document.addEventListener('dragover', onDragOverCapture, true)
    document.addEventListener('drop', onDropCapture, true)
    window.addEventListener(MEDIA_POINTER_DRAG_DROP_EVENT, onMediaPointerDragDropCapture, true)
    return () => {
      if (typeof window !== 'undefined') {
        for (const rafId of deferredDropRafIds) window.cancelAnimationFrame(rafId)
      }
      deferredDropRafIds.clear()
      document.removeEventListener('dragover', onDragOverCapture, true)
      document.removeEventListener('drop', onDropCapture, true)
      window.removeEventListener(MEDIA_POINTER_DRAG_DROP_EVENT, onMediaPointerDragDropCapture, true)
    }
  }, [addNodeFromRegistryAtWorld, addRichMediaPanelFromMediaAtWorld, args])

  React.useEffect(() => {
    if (!(args.active || args.widgetDropCaptureEnabled)) return
    if (typeof document === 'undefined') return
    const minPointerDragDistancePx = 6
    const deferredDropRafIds = new Set<number>()
    const maxDeferredDropFrames = 8
    const resolvePointerDropPos = (clientX: number, clientY: number, opts?: { allowNeutralFallback?: boolean }) => {
      const rect = readStoryboardWidgetDropRect({
        rootRef: args.rootRef,
        widgetDropBridgeOnly: args.widgetDropBridgeOnly,
      })
      if (!rect) return { rect: null, pos: null }
      const sx = clientX - rect.left
      const sy = clientY - rect.top
      if (!Number.isFinite(sx) || !Number.isFinite(sy) || sx < 0 || sy < 0 || sx > rect.width || sy > rect.height) {
        return { rect, pos: null }
      }
      const transform = readResolvedStoryboardWidgetDropTransform({
        getLiveZoomTransform: args.getLiveZoomTransform,
        zoomViewKeyRef: args.zoomViewKeyRef,
        draftGraphDataRef: args.draftGraphDataRef,
        baseGraphData: args.baseGraphData,
        allowNeutralFallback: opts?.allowNeutralFallback,
        useProjectedRichMediaShell: true,
        screenOrigin: { left: rect.left, top: rect.top },
      })
      if (!transform) return { rect, pos: null }
      return {
        rect,
        pos: screenToWorld({
          transform,
          sx,
          sy,
        }),
      }
    }
    const scheduleDeferredWidgetCommit = (commit: (opts?: { allowNeutralFallback?: boolean }) => 'committed' | 'await-transform' | 'rejected') => {
      if (typeof window === 'undefined') return
      let attempts = 0
      let activeRafId = 0
      const tick = () => {
        if (activeRafId) deferredDropRafIds.delete(activeRafId)
        const allowNeutralFallback = attempts >= maxDeferredDropFrames
        const status = commit({ allowNeutralFallback })
        if (status !== 'await-transform' || allowNeutralFallback) return
        attempts += 1
        activeRafId = window.requestAnimationFrame(tick)
        deferredDropRafIds.add(activeRafId)
      }
      activeRafId = window.requestAnimationFrame(tick)
      deferredDropRafIds.add(activeRafId)
    }
    const isFlowWidgetPointerDropDistanceAccepted = (
      session: Pick<FlowWidgetPointerDragSession, 'startClientX' | 'startClientY'>,
      clientX: number,
      clientY: number,
    ) => {
      if (!Number.isFinite(session.startClientX) || !Number.isFinite(session.startClientY)) return true
      const dx = clientX - session.startClientX
      const dy = clientY - session.startClientY
      return Math.hypot(dx, dy) >= minPointerDragDistancePx
    }
    const commitFlowWidgetPointerDrop = (
      session: Pick<FlowWidgetPointerDragSession, 'registryEntryId' | 'nodeTypeId' | 'widgetTypeId' | 'formId' | 'layoutVariantId'>,
      clientX: number,
      clientY: number,
      opts?: { allowNeutralFallback?: boolean },
    ): 'committed' | 'await-transform' | 'rejected' => {
      if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) return 'rejected'
      const entry = resolveWidgetRegistryEntryForDrop(args.widgetRegistryRef.current || [], session)
      if (!entry) return 'rejected'
      const { rect, pos } = resolvePointerDropPos(clientX, clientY, opts)
      if (!rect) return opts?.allowNeutralFallback ? 'rejected' : 'await-transform'
      const sx = clientX - rect.left
      const sy = clientY - rect.top
      if (!Number.isFinite(sx) || !Number.isFinite(sy) || sx < 0 || sy < 0 || sx > rect.width || sy > rect.height) return 'rejected'
      if (!pos) return 'await-transform'
      const dropKey = `${session.registryEntryId}:${session.layoutVariantId || 'default'}:${Math.round(sx)}:${Math.round(sy)}`
      if (args.shouldDedupeWidgetDrop(dropKey)) return 'rejected'
      args.setCanvasWindowOffsetFromRect(rect)
      addNodeFromRegistryAtWorld({ entry, layoutVariantId: session.layoutVariantId, x: pos.x, y: pos.y })
      args.upsertUiToast({
        id: 'storyboard-widget-drop-widget',
        kind: 'neutral',
        message: `Created ${entry.nodeTypeId} node.`,
        ttlMs: 1500,
      })
      return 'committed'
    }
    const onPointerUpCapture = (ev: PointerEvent) => {
      const session = readActiveFlowWidgetPointerDragSession()
      if (!session || session.pointerId !== ev.pointerId) return
      const release = resolveFlowWidgetPointerReleaseClientPoint({
        eventType: ev.type,
        eventClientX: ev.clientX,
        eventClientY: ev.clientY,
        session,
      })
      if (!isFlowWidgetPointerDropDistanceAccepted(session, release.clientX, release.clientY)) {
        try {
          clearActiveFlowWidgetPointerDragSession(ev.pointerId)
        } catch {
          void 0
        }
        return
      }
      const commitWidget = (opts?: { allowNeutralFallback?: boolean }): 'committed' | 'await-transform' | 'rejected' => (
        commitFlowWidgetPointerDrop(session, release.clientX, release.clientY, opts)
      )
      const status = commitWidget()
      if (status === 'await-transform') {
        scheduleDeferredWidgetCommit(commitWidget)
        if (session.nativeDragStarted === true) return
      }
      try {
        clearActiveFlowWidgetPointerDragSession(ev.pointerId)
      } catch {
        void 0
      }
    }
    const onFlowWidgetPointerDragDropCapture = (event: Event) => {
      const detail = (event as CustomEvent<FlowWidgetPointerDragDropDetail>).detail
      if (!detail || isFlowWidgetPointerDragDropClaimed(detail)) return
      if (!isFlowWidgetPointerDropDistanceAccepted(detail, detail.clientX, detail.clientY)) return
      const commitWidget = (opts?: { allowNeutralFallback?: boolean }): 'committed' | 'await-transform' | 'rejected' => (
        commitFlowWidgetPointerDrop(detail, detail.clientX, detail.clientY, opts)
      )
      const status = commitWidget()
      if (status === 'await-transform') {
        scheduleDeferredWidgetCommit(commitWidget)
      } else if (status !== 'committed') {
        return
      }
      claimFlowWidgetPointerDragDrop(detail)
      clearActiveFlowWidgetPointerDragSession(detail.pointerId)
      try {
        event.preventDefault()
        event.stopPropagation()
        ;(event as unknown as { stopImmediatePropagation?: () => void }).stopImmediatePropagation?.()
      } catch {
        void 0
      }
    }
    document.addEventListener('pointerup', onPointerUpCapture, true)
    window.addEventListener(FLOW_WIDGET_POINTER_DRAG_DROP_EVENT, onFlowWidgetPointerDragDropCapture, true)
    return () => {
      if (typeof window !== 'undefined') {
        for (const rafId of deferredDropRafIds) window.cancelAnimationFrame(rafId)
      }
      deferredDropRafIds.clear()
      document.removeEventListener('pointerup', onPointerUpCapture, true)
      window.removeEventListener(FLOW_WIDGET_POINTER_DRAG_DROP_EVENT, onFlowWidgetPointerDragDropCapture, true)
    }
  }, [addNodeFromRegistryAtWorld, args])

  return { addNodeFromRegistryAtWorld, addRichMediaPanelFromMediaAtWorld }
}
