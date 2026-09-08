import React from 'react'
import { useOutsideClose } from '@/hooks/useOutsideClose'
import { useGraphStore } from '@/hooks/useGraphStore'
import { resolveEffectiveFlowWidgetPinnedInCanvas, shouldUseStoryboardWidgetFloatingScreenAuthority } from '@/lib/storyboardWidget/widgetPlacementAuthority'
import { setFlowWidgetPinnedById } from '@/lib/storyboardWidget/flowWidgetPinnedState'
import { lsBool, lsSetBool } from '@/lib/persistence'
import { LS_KEYS, UI_COPY } from '@/lib/config'
import { readScopedFlowWidgetNodeValue, resolveScopedFlowWidgetNodeMap } from '@/lib/storyboardWidget/widgetStateScope'
import { useIsomorphicLayoutEffect } from '@/lib/react/useIsomorphicLayoutEffect'
import { isCanonicalNodeIdEqual } from '@/lib/graph/canonicalNodeIds'
import type { WidgetRegistryEntry } from '@/features/storyboard-widget-manager/widgetRegistryTypes'
import type { GraphNode } from '@/lib/graph/types'

export function useWidgetEditorOverlayUiState(args: {
  node: { id?: unknown; type?: unknown; properties?: GraphNode['properties'] }
  nodeId: string
  active: boolean
  autoRevealKey?: string | number | null
  graphMetaKey?: string | null
  graphMetaKind?: string | null
  storyboardWidgetSurfaceId?: string | null
  selectedNodeId?: string | null
  placement: {
    asideRef: React.MutableRefObject<HTMLElement | null>
    applyOverlayPosition: (opts?: { emitInteractionFrame?: boolean; updateToolbarLayout?: boolean }) => void
    persistCurrentScreenPlacementAsWorldPlacement: () => boolean
    persistFloatingPlacement: (pos: { top: number; left: number }) => void
    persistFloatingScreenPlacement: (pos: { top: number; left: number }) => void
    readCurrentOverlayScreenPlacementForHandoff: () => { left: number; top: number } | null
    lastAppliedRef: React.MutableRefObject<{ left: number; top: number } | null>
  }
  upsertUiToast: (args: { id: string; kind: 'neutral' | 'success' | 'warning' | 'error'; message: string; ttlMs?: number }) => void
  setFlowWidgetPinnedByNodeIdForGraph: (graphMetaKey: string | null | undefined, nextMap: Record<string, boolean>) => void
  setSelectionSource: (source: string) => void
}): {
  pinnedInCanvas: boolean
  minimized: boolean
  hideFields: boolean
  richMediaKtvRows: boolean
  toolbarVisible: boolean
  setToolbarVisible: React.Dispatch<React.SetStateAction<boolean>>
  labelInputRef: React.MutableRefObject<HTMLInputElement | null>
  spacePanUserSelectUnlockRef: React.MutableRefObject<null | (() => void)>
  handleTogglePinned: (event: React.MouseEvent) => void
  handlePinnedPointerDown: (event: React.PointerEvent) => void
  handleToggleMinimized: () => void
  handleToggleHideFields: () => void
  handleToggleRichMediaKtvRows: () => void
  handleRegistrySelectionChange: (args: { entry: WidgetRegistryEntry | null }) => void
  setWidgetSelectionSource: (source: 'canvas' | 'editor' | 'none') => void
} {
  const {
    node,
    nodeId,
    active,
    autoRevealKey,
    graphMetaKey,
    graphMetaKind,
    storyboardWidgetSurfaceId,
    selectedNodeId,
    placement,
    upsertUiToast,
    setFlowWidgetPinnedByNodeIdForGraph,
    setSelectionSource,
  } = args
  const placementAuthorityNode = React.useMemo(
    () => ({
      id: typeof node.id === 'string' ? node.id : '',
      type: typeof node.type === 'string' ? node.type : '',
      properties: node.properties,
    }),
    [node.id, node.properties, node.type],
  )

  const readPinnedInCanvas = React.useCallback((id: string): boolean => {
    if (!id) return false
    const state = useGraphStore.getState()
    const v = readScopedFlowWidgetNodeValue({
      nodeId: id,
      graphMetaKey,
      graphData: state.graphData,
      keyedByGraphMetaKey: state.flowWidgetPinnedByNodeIdByGraphMetaKey,
      globalByNodeId: state.flowWidgetPinnedByNodeId,
    })
    return resolveEffectiveFlowWidgetPinnedInCanvas({
      graphMetaKind,
      node: placementAuthorityNode,
      pinnedValue: typeof v === 'boolean' ? v : null,
    })
  }, [graphMetaKey, graphMetaKind, placementAuthorityNode])

  const [pinnedInCanvas, setPinnedInCanvasState] = React.useState<boolean>(() => readPinnedInCanvas(nodeId))
  const pinnedInCanvasRef = React.useRef<boolean>(readPinnedInCanvas(nodeId))
  const previousPinnedPlacementAuthorityRef = React.useRef<boolean>(pinnedInCanvas)
  const [minimized, setMinimized] = React.useState<boolean>(() => lsBool(LS_KEYS.flowWidgetMinimized, false))
  const [hideFields, setHideFields] = React.useState<boolean>(() => lsBool(LS_KEYS.flowWidgetHideFields, false))
  const [richMediaKtvRows, setRichMediaKtvRows] = React.useState<boolean>(() => lsBool(LS_KEYS.flowWidgetRichMediaKtvRows, false))
  const [toolbarVisible, setToolbarVisible] = React.useState(false)
  const labelInputRef = React.useRef<HTMLInputElement | null>(null)
  const pinToggleCollisionGuardRef = React.useRef<number | null>(null)
  const skipPinClickRef = React.useRef(false)
  const spacePanUserSelectUnlockRef = React.useRef<null | (() => void)>(null)

  useOutsideClose(toolbarVisible, setToolbarVisible, placement.asideRef)

  React.useEffect(() => {
    const next = readPinnedInCanvas(nodeId)
    pinnedInCanvasRef.current = next
    setPinnedInCanvasState(next)
  }, [nodeId, readPinnedInCanvas])

  React.useEffect(() => {
    const readPinned = (s: unknown) => {
      const state = s as {
        graphData?: unknown
        flowWidgetPinnedByNodeId?: Record<string, boolean>
        flowWidgetPinnedByNodeIdByGraphMetaKey?: Record<string, Record<string, boolean>>
      }
      const v = readScopedFlowWidgetNodeValue({
        nodeId,
        graphMetaKey,
        graphData: state.graphData,
        keyedByGraphMetaKey: state.flowWidgetPinnedByNodeIdByGraphMetaKey,
        globalByNodeId: state.flowWidgetPinnedByNodeId,
      })
      return resolveEffectiveFlowWidgetPinnedInCanvas({
        graphMetaKind,
        node: placementAuthorityNode,
        pinnedValue: typeof v === 'boolean' ? v : null,
      })
    }
    const unsub = useGraphStore.subscribe(readPinned, next => {
      if (
        pinnedInCanvasRef.current !== true
        && next === true
        && shouldUseStoryboardWidgetFloatingScreenAuthority({ graphMetaKind, pinnedInCanvas: false })
      ) {
        placement.persistCurrentScreenPlacementAsWorldPlacement()
      }
      if (
        pinnedInCanvasRef.current === true
        && next !== true
        && shouldUseStoryboardWidgetFloatingScreenAuthority({ graphMetaKind, pinnedInCanvas: next, storyboardWidgetSurfaceId })
      ) {
        const currentScreenPlacement = placement.readCurrentOverlayScreenPlacementForHandoff()
        const applied = currentScreenPlacement || placement.lastAppliedRef.current
        if (applied) placement.persistFloatingScreenPlacement({ top: applied.top, left: applied.left })
      }
      pinnedInCanvasRef.current = next
      setPinnedInCanvasState(prev => (prev === next ? prev : next))
    })
    return () => {
      try {
        unsub()
      } catch {
        void 0
      }
    }
  }, [graphMetaKey, graphMetaKind, nodeId, placement, placementAuthorityNode, storyboardWidgetSurfaceId])

  React.useEffect(() => {
    if (!active || !autoRevealKey) return
    setMinimized(prev => {
      if (!prev) return prev
      lsSetBool(LS_KEYS.flowWidgetMinimized, false)
      return false
    })
  }, [active, autoRevealKey])

  React.useEffect(() => {
    if (!toolbarVisible) return
    const id = String(node.id || '').trim()
    if (!id) return
    if (!isCanonicalNodeIdEqual(selectedNodeId, id)) setToolbarVisible(false)
  }, [node.id, selectedNodeId, toolbarVisible])

  const wasSelectedRef = React.useRef(false)
  React.useEffect(() => {
    const id = String(node.id || '').trim()
    const selected = !!id && isCanonicalNodeIdEqual(selectedNodeId, id)
    if (selected && !wasSelectedRef.current) setToolbarVisible(true)
    wasSelectedRef.current = selected
  }, [node.id, selectedNodeId])

  useIsomorphicLayoutEffect(() => {
    const wasPinned = previousPinnedPlacementAuthorityRef.current === true
    const becamePinned = !wasPinned && pinnedInCanvas === true
    if (becamePinned && shouldUseStoryboardWidgetFloatingScreenAuthority({ graphMetaKind, pinnedInCanvas: false })) {
      const persisted = placement.persistCurrentScreenPlacementAsWorldPlacement()
      if (persisted) placement.applyOverlayPosition({ emitInteractionFrame: false })
    }
    previousPinnedPlacementAuthorityRef.current = pinnedInCanvas
  }, [graphMetaKind, pinnedInCanvas, placement])

  React.useEffect(() => {
    return () => {
      const unlock = spacePanUserSelectUnlockRef.current
      spacePanUserSelectUnlockRef.current = null
      if (unlock) unlock()
      if (pinToggleCollisionGuardRef.current != null) {
        try {
          clearTimeout(pinToggleCollisionGuardRef.current)
        } catch {
          void 0
        }
        pinToggleCollisionGuardRef.current = null
        if (nodeId && useGraphStore.getState().flowWidgetDraggingNodeId === nodeId) {
          useGraphStore.getState().setFlowWidgetDraggingNodeId(null)
        }
      }
    }
  }, [nodeId])

  const setPinnedInCanvas = React.useCallback((next: boolean | ((prev: boolean) => boolean)) => {
    const prev = pinnedInCanvasRef.current
    const requested = !!(typeof next === 'function' ? (next as (v: boolean) => boolean)(prev) : next)
    const resolved = resolveEffectiveFlowWidgetPinnedInCanvas({
      graphMetaKind,
      node: placementAuthorityNode,
      pinnedValue: requested,
    })
    if (
      prev !== true
      && resolved === true
      && shouldUseStoryboardWidgetFloatingScreenAuthority({ graphMetaKind, pinnedInCanvas: false, storyboardWidgetSurfaceId })
    ) {
      placement.persistCurrentScreenPlacementAsWorldPlacement()
    }
    if (
      prev === true
      && resolved !== true
      && shouldUseStoryboardWidgetFloatingScreenAuthority({ graphMetaKind, pinnedInCanvas: resolved, storyboardWidgetSurfaceId })
    ) {
      const currentScreenPlacement = placement.readCurrentOverlayScreenPlacementForHandoff()
      const applied = currentScreenPlacement || placement.lastAppliedRef.current
      if (applied) placement.persistFloatingScreenPlacement({ top: applied.top, left: applied.left })
    }
    pinnedInCanvasRef.current = resolved
    setPinnedInCanvasState(prevState => (prevState === resolved ? prevState : resolved))
    if (!nodeId) return
    const state = useGraphStore.getState()
    const currentPinnedById = resolveScopedFlowWidgetNodeMap({
      graphMetaKey,
      graphData: state.graphData,
      keyedByGraphMetaKey: state.flowWidgetPinnedByNodeIdByGraphMetaKey,
      globalByNodeId: state.flowWidgetPinnedByNodeId,
    })
    const nextMap = setFlowWidgetPinnedById(currentPinnedById, nodeId, resolved)
    if (nextMap) setFlowWidgetPinnedByNodeIdForGraph(graphMetaKey, nextMap)
  }, [graphMetaKey, graphMetaKind, nodeId, placement, placementAuthorityNode, setFlowWidgetPinnedByNodeIdForGraph, storyboardWidgetSurfaceId])

  const togglePinnedInternal = React.useCallback(() => {
    if (pinToggleCollisionGuardRef.current != null) {
      clearTimeout(pinToggleCollisionGuardRef.current)
      pinToggleCollisionGuardRef.current = null
      if (nodeId && useGraphStore.getState().flowWidgetDraggingNodeId === nodeId) {
        useGraphStore.getState().setFlowWidgetDraggingNodeId(null)
      }
    }
    const domPinnedRaw = placement.asideRef.current?.getAttribute('data-kg-widget-pinned')
    const currentPinned = domPinnedRaw === '1'
      ? true
      : domPinnedRaw === '0'
        ? false
        : pinnedInCanvasRef.current
    pinnedInCanvasRef.current = currentPinned
    if (nodeId) {
      useGraphStore.getState().setFlowWidgetDraggingNodeId(nodeId)
      pinToggleCollisionGuardRef.current = setTimeout(() => {
        pinToggleCollisionGuardRef.current = null
        if (useGraphStore.getState().flowWidgetDraggingNodeId === nodeId) {
          useGraphStore.getState().setFlowWidgetDraggingNodeId(null)
        }
      }, 240) as unknown as number
    }
    setPinnedInCanvas(!currentPinned)
  }, [nodeId, placement.asideRef, setPinnedInCanvas])

  const handleTogglePinned = React.useCallback((event: React.MouseEvent) => {
    if (skipPinClickRef.current) {
      skipPinClickRef.current = false
      return
    }
    event.preventDefault()
    event.stopPropagation()
    togglePinnedInternal()
  }, [togglePinnedInternal])

  const handlePinnedPointerDown = React.useCallback((event: React.PointerEvent) => {
    if (event.button !== 0) return
    skipPinClickRef.current = true
    togglePinnedInternal()
  }, [togglePinnedInternal])

  const handleToggleMinimized = React.useCallback(() => {
    setMinimized(prev => {
      const next = !prev
      lsSetBool(LS_KEYS.flowWidgetMinimized, next)
      return next
    })
  }, [])

  const handleToggleHideFields = React.useCallback(() => {
    setHideFields(prev => {
      const next = !prev
      lsSetBool(LS_KEYS.flowWidgetHideFields, next)
      return next
    })
  }, [])

  const handleToggleRichMediaKtvRows = React.useCallback(() => {
    setRichMediaKtvRows(prev => {
      const next = !prev
      lsSetBool(LS_KEYS.flowWidgetRichMediaKtvRows, next)
      return next
    })
  }, [])

  const setWidgetSelectionSource = React.useCallback((source: 'canvas' | 'editor' | 'none') => {
    setSelectionSource(source === 'none' ? 'unknown' : source)
  }, [setSelectionSource])

  const handleRegistrySelectionChange = React.useCallback(({ entry }: { entry: WidgetRegistryEntry | null }) => {
    if (!active) return
    if (!entry) {
      upsertUiToast({
        id: `flow-widget-registry-clear-${String(node.id || '')}`,
        kind: 'neutral',
        message: UI_COPY.flowWidgetRegistryClearedToast,
        ttlMs: 2200,
      })
      return
    }
    upsertUiToast({
      id: `flow-widget-registry-${entry.id}`,
      kind: 'neutral',
      message: UI_COPY.flowWidgetRegistryToast(`${entry.nodeTypeId} · ${entry.widgetTypeId} · ${entry.formId}`),
      ttlMs: 2500,
    })
  }, [active, node.id, upsertUiToast])

  return {
    pinnedInCanvas,
    minimized,
    hideFields,
    richMediaKtvRows,
    toolbarVisible,
    setToolbarVisible,
    labelInputRef,
    spacePanUserSelectUnlockRef,
    handleTogglePinned,
    handlePinnedPointerDown,
    handleToggleMinimized,
    handleToggleHideFields,
    handleToggleRichMediaKtvRows,
    handleRegistrySelectionChange,
    setWidgetSelectionSource,
  }
}
