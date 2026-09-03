import React from 'react'
import { useShallow } from 'zustand/react/shallow'

import { FlowWidgetOverlayPortal } from '@/components/StoryboardWidget/FlowWidgetOverlayPortal'
import { useWidgetDragHandlers } from '@/components/StoryboardWidget/useWidgetDragHandlers'
import { useWidgetPlacementRuntime } from '@/components/StoryboardWidget/useWidgetPlacementRuntime'
import { useWidgetRichMediaToolbar } from '@/components/StoryboardWidget/useWidgetRichMediaToolbar'
import { useWidgetEditorOverlayUiState } from '@/components/StoryboardWidget/useWidgetEditorOverlayUiState'
import {
  FLOW_WIDGET_OVERLAY_Z_INDEX_BASE,
  FLOW_WIDGET_OVERLAY_Z_INDEX_SELECTED,
  type FlowWidgetOverlayProps,
} from '@/components/StoryboardWidget/flowWidgetOverlayShared'
import { useGraphStore } from '@/hooks/useGraphStore'
import { resolveEffectiveFlowWidgetPinnedInCanvas, shouldUseStoryboardWidgetFloatingScreenAuthority } from '@/lib/storyboardWidget/widgetPlacementAuthority'
import { isFlowWidgetHeaderDragAllowedByPin } from '@/lib/storyboardWidget/flowWidgetPinMovement'
import { computeWidgetAnchoredStackOffset } from '@/components/StoryboardWidget/widgetLayout'
import { isHandlesForAllInputsEnabled, isLoopNode } from '@/lib/storyboardWidget/storyboardWidgetActions'
import { readScopedFlowWidgetNodeValue } from '@/lib/storyboardWidget/widgetStateScope'
import { useIsomorphicLayoutEffect } from '@/lib/react/useIsomorphicLayoutEffect'
import { usePanelTypography } from '@/lib/ui/panelTypography'
import { resolveWidgetRegistryEntry } from '@/features/storyboard-widget-manager/resolveWidgetRegistry'
import type { WidgetRegistryEntry } from '@/features/storyboard-widget-manager/widgetRegistryTypes'
import { STORYBOARD_WIDGET_INTERACTION_FRAME_EVENT } from '@/lib/canvas/storyboard-widget-overlay-proxy'
import { isCanonicalNodeIdEqual } from '@/lib/graph/canonicalNodeIds'
import { runAgenticGraphMotion } from '@/lib/motion/agentic-graph-motion'
import { FLOW_RICH_MEDIA_PANEL_NODE_TYPE_ID } from '@/lib/config.storyboard-widget'

const EMPTY_WIDGET_REGISTRY: WidgetRegistryEntry[] = []

const FlowWidgetOverlayInner = React.memo(function FlowWidgetOverlayInner({
  active,
  storyboardWidgetSurfaceId, editorSurfaceKind,
  overlayCollectiveCount,
  node,
  nodeById,
  viewportW,
  viewportH,
  canvasWindowOffset,
  autoRevealKey,
  stackIndex,
  getLiveNodeWorldPos,
  getLiveZoomTransform,
  getLiveContainmentGroupAabbForNode,
  graphMetaKind,
  graphMetaKey,
  portHandleEdges = [],
  registryEntries = EMPTY_WIDGET_REGISTRY,
  connectedValuesBySchemaPath,
  toolMode,
  pendingEdgeSourceId,
  zoomViewKey,
  onBeginAddEdgeFromNode,
  onFinalizeAddEdgeToNode,
  onSetLabel,
  onSetType,
  onPatchProperties,
  onSetProperties,
  onValidate,
  onRun,
  onDuplicate,
  onRemove,
  onClearOutput,
  onHelp,
  onConvertToLoopNode,
  onEnableHandlesForAllInputs,
  onUpdateKvEntry,
  onPinnedInCanvasChange,
  onRenameSchemaFieldId,
}: FlowWidgetOverlayProps) {
  const { panelTextClass, microLabelClass, monospaceTextClass } = usePanelTypography()
  const {
    uiIconScale,
    uiIconStrokeWidth,
    uiPanelOpacity,
    schema,
    documentStructureBaselineLock,
    openWidgetNodeCount,
    upsertUiToast,
    selectNode,
    setSelectionSource,
    selectedNodeId,
    setFlowWidgetPinnedByNodeIdForGraph,
  } = useGraphStore(
    useShallow(s => ({
      uiIconScale: s.uiIconScale,
      uiIconStrokeWidth: s.uiIconStrokeWidth,
      uiPanelOpacity: s.uiPanelOpacity,
      schema: s.schema,
      documentStructureBaselineLock: s.documentStructureBaselineLock === true,
      openWidgetNodeCount: Array.isArray(s.openWidgetNodeIds) ? s.openWidgetNodeIds.length : 0,
      upsertUiToast: s.upsertUiToast,
      selectNode: s.selectNode,
      setSelectionSource: s.setSelectionSource,
      selectedNodeId: s.selectedNodeId,
      setFlowWidgetPinnedByNodeIdForGraph: s.setFlowWidgetPinnedByNodeIdForGraph,
    })),
  )

  const nodeId = React.useMemo(() => String(node.id || '').trim(), [node.id])
  const widgetPos = useGraphStore(useShallow(s => {
    return readScopedFlowWidgetNodeValue({
      nodeId,
      graphMetaKey,
      graphData: s.graphData,
      keyedByGraphMetaKey: s.flowWidgetPosByNodeIdByGraphMetaKey,
      globalByNodeId: s.flowWidgetPosByNodeId,
    })
  }))
  const pinnedInCanvasForPlacement = useGraphStore(useShallow(s => {
    const v = readScopedFlowWidgetNodeValue({
      nodeId,
      graphMetaKey,
      graphData: s.graphData,
      keyedByGraphMetaKey: s.flowWidgetPinnedByNodeIdByGraphMetaKey,
      globalByNodeId: s.flowWidgetPinnedByNodeId,
    })
    return resolveEffectiveFlowWidgetPinnedInCanvas({
      graphMetaKind,
      node,
      pinnedValue: typeof v === 'boolean' ? v : null,
    })
  }))
  const registryEntry = React.useMemo(
    () => resolveWidgetRegistryEntry({ node, registry: registryEntries, graphMetaKind }),
    [graphMetaKind, node, registryEntries],
  )

  const overlayZIndex = React.useMemo(() => {
    const idx = Number.isFinite(stackIndex) ? Math.max(0, Math.floor(stackIndex as number)) : 0
    const selected = isCanonicalNodeIdEqual(selectedNodeId, nodeId)
    return selected ? FLOW_WIDGET_OVERLAY_Z_INDEX_SELECTED : FLOW_WIDGET_OVERLAY_Z_INDEX_BASE - idx
  }, [nodeId, selectedNodeId, stackIndex])

  const storyboardCardLayoutSurface = String(storyboardWidgetSurfaceId || '').trim() === 'storyboard'
  const isRichMediaPanelNode = String(node.type || '').trim() === FLOW_RICH_MEDIA_PANEL_NODE_TYPE_ID
  const autoStackOffset = React.useMemo(() => computeWidgetAnchoredStackOffset(stackIndex), [stackIndex])

  const effectiveOverlayCollectiveCount = React.useMemo(() => {
    if (typeof overlayCollectiveCount === 'number' && Number.isFinite(overlayCollectiveCount)) {
      return Math.max(1, Math.floor(overlayCollectiveCount))
    }
    return Math.max(1, openWidgetNodeCount)
  }, [openWidgetNodeCount, overlayCollectiveCount])

  const placement = useWidgetPlacementRuntime({
    node,
    nodeId,
    stackIndex,
    active,
    storyboardWidgetSurfaceId,
    viewportW,
    viewportH,
    canvasWindowOffset,
    graphMetaKey,
    graphMetaKind,
    zoomViewKey,
    getLiveNodeWorldPos,
    getLiveZoomTransform,
    getLiveContainmentGroupAabbForNode,
    widgetPos,
    schema,
    openWidgetNodeCount: effectiveOverlayCollectiveCount,
    autoStackOffset,
    floating: storyboardCardLayoutSurface ? false : pinnedInCanvasForPlacement !== true,
    floatingUsesScreenAuthority: storyboardCardLayoutSurface
      ? false
      : shouldUseStoryboardWidgetFloatingScreenAuthority({ graphMetaKind, pinnedInCanvas: pinnedInCanvasForPlacement, storyboardWidgetSurfaceId }),
  })
  const uiState = useWidgetEditorOverlayUiState({
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
  })
  const pinnedInCanvas = uiState.pinnedInCanvas
  const effectiveHideFields = isRichMediaPanelNode ? uiState.richMediaKtvRows : uiState.hideFields
  const floating = storyboardCardLayoutSurface ? false : pinnedInCanvas !== true
  const headerDragAllowedByPin = isFlowWidgetHeaderDragAllowedByPin({
    pinnedInCanvas,
  })
  const floatingUsesScreenAuthority = storyboardCardLayoutSurface
    ? false
    : shouldUseStoryboardWidgetFloatingScreenAuthority({ graphMetaKind, pinnedInCanvas, storyboardWidgetSurfaceId })

  React.useEffect(() => {
    placement.applyOverlayPosition({ emitInteractionFrame: false })
  }, [floating, floatingUsesScreenAuthority, placement, pinnedInCanvas])

  useIsomorphicLayoutEffect(() => {
    if (!active) return
    const controller = new AbortController()
    runAgenticGraphMotion(placement.asideRef.current, 'flow-widget-enter', {
      index: stackIndex,
      signal: controller.signal,
    })
    return () => controller.abort()
  }, [active, graphMetaKey, nodeId, placement.asideRef, stackIndex])

  React.useEffect(() => {
    if (!active || !autoRevealKey) return
    const controller = new AbortController()
    runAgenticGraphMotion(placement.asideRef.current, 'flow-widget-emphasis', {
      signal: controller.signal,
    })
    return () => controller.abort()
  }, [active, autoRevealKey, placement.asideRef])

  React.useEffect(() => {
    if (!active || typeof window === 'undefined') return
    const onFrame = () => {
      placement.applyOverlayPosition({ emitInteractionFrame: false })
    }
    window.addEventListener(STORYBOARD_WIDGET_INTERACTION_FRAME_EVENT, onFrame as EventListener)
    return () => {
      window.removeEventListener(STORYBOARD_WIDGET_INTERACTION_FRAME_EVENT, onFrame as EventListener)
    }
  }, [active, placement])

  const {
    isRichMediaPanelWidget,
    richMediaPanelToolbarProps,
    richMediaWidgetPreview,
  } = useWidgetRichMediaToolbar({
    node,
    nodeById,
    minimized: uiState.minimized,
    hideFields: effectiveHideFields,
    connectedValuesBySchemaPath,
    onPatchProperties,
    onToggleHideFields: uiState.handleToggleRichMediaKtvRows,
  })

  const drag = useWidgetDragHandlers({
    nodeId,
    active,
    headerDragEnabled: headerDragAllowedByPin,
    floating,
    zoomViewKey,
    getLiveZoomTransform,
    pinnedTopPx: placement.pinnedTopPx,
    pinnedLeftPx: placement.pinnedLeftPx,
    applyOverlayPosition: placement.applyOverlayPosition,
    persistFloatingPlacement: placement.persistFloatingPlacement,
    persistWorldPos: placement.persistWorldPos,
    setSelectionSource: uiState.setWidgetSelectionSource,
    selectNode,
    setToolbarVisible: uiState.setToolbarVisible,
    canvasWindowOffsetRef: placement.canvasWindowOffsetRef,
    zoomStateRef: placement.zoomStateRef,
    anchoredPosRef: placement.anchoredPosRef,
    autoStackOffset,
    widgetWorldPosRef: placement.widgetWorldPosRef,
    worldDragOverrideRef: placement.worldDragOverrideRef,
    pinnedDragOverrideRef: placement.pinnedDragOverrideRef,
    lastAppliedRef: placement.lastAppliedRef,
    scaledSizeRef: placement.scaledSizeRef,
    viewportRef: placement.viewportRef,
  })

  const enableHandlesDisabled = documentStructureBaselineLock === true || isHandlesForAllInputsEnabled(schema)
  const convertToLoopDisabled = isLoopNode(node)
  const isVideoTranscriberWidget = String(node.type || '').trim() === 'kg-flow-video-transcriber-panel'

  return (
    <FlowWidgetOverlayPortal
      asideRef={placement.asideRef}
      storyboardWidgetSurfaceId={storyboardWidgetSurfaceId} editorSurfaceKind={editorSurfaceKind}
      node={node}
      pinnedInCanvas={pinnedInCanvas}
      overlayZIndex={overlayZIndex}
      active={active}
      toolbarVisible={uiState.toolbarVisible}
      toolbarDock={placement.toolbarDock}
      toolbarInlineShiftPx={placement.toolbarInlineShiftPx}
      toolbarMaxWidthPx={placement.toolbarMaxWidthPx}
      isRichMediaPanelWidget={isRichMediaPanelWidget}
      isVideoTranscriberWidget={isVideoTranscriberWidget}
      uiIconScale={uiIconScale}
      uiIconStrokeWidth={uiIconStrokeWidth}
      enableHandlesDisabled={enableHandlesDisabled}
      convertToLoopDisabled={convertToLoopDisabled}
      richMediaPanelToolbarProps={richMediaPanelToolbarProps}
      onRun={onRun}
      onDuplicate={onDuplicate}
      onClearOutput={onClearOutput}
      onHelp={onHelp}
      onRemove={onRemove}
      onEnableHandlesForAllInputs={onEnableHandlesForAllInputs}
      onConvertToLoopNode={onConvertToLoopNode}
      onUpdateKvEntry={onUpdateKvEntry}
      onPatchProperties={onPatchProperties}
      uiPanelOpacity={uiPanelOpacity}
      panelTextClass={panelTextClass}
      microLabelClass={microLabelClass}
      monospaceTextClass={monospaceTextClass}
      labelInputRef={uiState.labelInputRef}
      headerDragEnabled={headerDragAllowedByPin}
      onHeaderPointerDown={drag.handleHeaderPointerDown}
      onToggleHideFields={uiState.handleToggleHideFields}
      onTogglePinned={uiState.handleTogglePinned}
      onPinnedPointerDown={uiState.handlePinnedPointerDown}
      onToggleMinimized={uiState.handleToggleMinimized}
      onSetLabel={onSetLabel}
      onSetType={onSetType}
      onSetProperties={onSetProperties}
      onValidate={onValidate}
      onRegistrySelectionChange={uiState.handleRegistrySelectionChange}
      onRenameSchemaFieldId={onRenameSchemaFieldId}
      richMediaWidgetPreview={richMediaWidgetPreview}
      registryEntry={registryEntry}
      registryEntries={registryEntries}
      connectedValuesBySchemaPath={connectedValuesBySchemaPath}
      portHandleEdges={portHandleEdges}
      schema={schema}
      graphMetaKind={graphMetaKind}
      minimized={uiState.minimized}
      hideFields={effectiveHideFields}
      toolMode={toolMode}
      pendingEdgeSourceId={pendingEdgeSourceId}
      onBeginAddEdgeFromNode={onBeginAddEdgeFromNode}
      onFinalizeAddEdgeToNode={onFinalizeAddEdgeToNode}
      setSelectionSource={uiState.setWidgetSelectionSource}
      selectNode={selectNode}
      setToolbarVisible={uiState.setToolbarVisible}
      spacePanUserSelectUnlockRef={uiState.spacePanUserSelectUnlockRef}
    />
  )
})

const FlowWidgetOverlayBody = React.memo(function FlowWidgetOverlayBody(props: FlowWidgetOverlayProps) {
  return <FlowWidgetOverlayInner {...props} />
})

const FlowWidgetOverlay = React.memo(function FlowWidgetOverlay(props: FlowWidgetOverlayProps) {
  if (props.visible === false) return null
  return <FlowWidgetOverlayBody {...props} />
})

export default FlowWidgetOverlay
