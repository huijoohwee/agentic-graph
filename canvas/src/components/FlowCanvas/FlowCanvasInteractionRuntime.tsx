import React from 'react'
import { useShallow } from 'zustand/react/shallow'

import { applyZoomRequestNative } from '@/components/FlowCanvas/applyZoomRequestNative'
import { EMPTY_STRING_ARRAY, type FlowCanvasInteractionRuntimeProps } from '@/components/FlowCanvas/shared'
import { CanvasArrangeActionBar } from '@/components/canvas/CanvasArrangeActionBar'
import { useParentChildRelation } from '@/components/canvas/useParentChildRelation'
import { useSelectionGrouping } from '@/components/canvas/useSelectionGrouping'
import { isWorkspaceGraphMutationBlocked } from '@/features/workspace-table/workspaceTableSsot'
import { useGraphStore } from '@/hooks/useGraphStore'
import { computeArrangeCenters, type ArrangeAction2d } from '@/lib/canvas/arrange2d'
import { isEditableTarget, readArrangeShortcut, readNudgeDelta } from '@/lib/canvas/arrangeShortcuts'
import { readSnapGridConfigFromSchema, snapScalarToGrid } from '@/lib/canvas/gridSnap'
import { graphActivationFitTargetsGraph, isGraphActivationFitRequest } from '@/lib/zoom/graphActivationFit'

export default React.memo(function FlowCanvasInteractionRuntime(
  props: FlowCanvasInteractionRuntimeProps,
) {
  const {
    active,
    storyboardWidgetSurfaceId,
    allowMutations,
    schema,
    runtimeRef,
    positionsDirtySinceCommitRef,
    selectedNodeIdsRef,
    selectedEdgeIdsRef,
    drawArgsRef,
    scheduleFlowDraw,
    requestCommit,
    handleInteractionFrame,
    canvas2dRenderer,
    graphDataForZoomRequests,
    viewportW,
    viewportH,
    storyboardWidgetReservedW,
  } = props
  void storyboardWidgetReservedW

  const {
    selectedNodeId,
    selectedEdgeId,
    selectedNodeIds,
    selectedEdgeIds,
    selectedGroupId,
    zoomRequest,
  } = useGraphStore(
    useShallow(s => {
      if (!active) {
        return {
          selectedNodeId: null,
          selectedEdgeId: null,
          selectedNodeIds: EMPTY_STRING_ARRAY,
          selectedEdgeIds: EMPTY_STRING_ARRAY,
          selectedGroupId: null,
          zoomRequest: null,
        }
      }
      return {
        selectedNodeId: s.selectedNodeId,
        selectedEdgeId: s.selectedEdgeId,
        selectedNodeIds: s.selectedNodeIds,
        selectedEdgeIds: s.selectedEdgeIds,
        selectedGroupId: s.selectedGroupId,
        zoomRequest: s.zoomRequest,
      }
    }),
  )

  React.useEffect(() => {
    const nodeIdSet = new Set<string>((selectedNodeIds || []).map(v => String(v)))
    if (selectedNodeId) nodeIdSet.add(String(selectedNodeId))
    const edgeIdSet = new Set<string>((selectedEdgeIds || []).map(v => String(v)))
    if (selectedEdgeId) edgeIdSet.add(String(selectedEdgeId))
    const nextSelectedNodeIds = Array.from(nodeIdSet)
    const nextSelectedEdgeIds = Array.from(edgeIdSet)
    selectedNodeIdsRef.current = nextSelectedNodeIds
    selectedEdgeIdsRef.current = nextSelectedEdgeIds
    drawArgsRef.current.selectedNodeIds = nextSelectedNodeIds
    drawArgsRef.current.selectedEdgeIds = nextSelectedEdgeIds
    drawArgsRef.current.selectedGroupId = selectedGroupId ? String(selectedGroupId || '').trim() : null
    scheduleFlowDraw()
  }, [
    drawArgsRef,
    scheduleFlowDraw,
    selectedEdgeId,
    selectedEdgeIds,
    selectedEdgeIdsRef,
    selectedGroupId,
    selectedNodeId,
    selectedNodeIds,
    selectedNodeIdsRef,
  ])

  const selectedIds = React.useMemo(() => {
    const set = new Set<string>()
    if (selectedNodeId) {
      const id = String(selectedNodeId || '').trim()
      if (id) set.add(id)
    }
    const ids = Array.isArray(selectedNodeIds) ? selectedNodeIds : []
    for (let i = 0; i < ids.length; i += 1) {
      const id = String(ids[i] || '').trim()
      if (id) set.add(id)
    }
    return Array.from(set)
  }, [selectedNodeId, selectedNodeIds])
  const grouping = useSelectionGrouping({ active, allowMutations })
  const parentChild = useParentChildRelation({ active, allowMutations })

  const applyArrange = React.useMemo(() => {
    return (action: ArrangeAction2d) => {
      if (!active || selectedIds.length < 2) return
      const runtime = runtimeRef.current
      const scene = runtime?.scene
      if (!runtime || !scene) return
      const refId = (() => {
        const current = String(selectedNodeId || '').trim()
        if (current && selectedIds.includes(current)) return current
        return selectedIds[0] || ''
      })()
      const grid = readSnapGridConfigFromSchema(schema)
      const gridSize = grid.enabled ? Math.max(grid.x, grid.y) : 0
      const snapX = (v: number) => (grid.enabled ? snapScalarToGrid(v, grid, 'x') : v)
      const snapY = (v: number) => (grid.enabled ? snapScalarToGrid(v, grid, 'y') : v)
      const items = selectedIds
        .map(id => {
          const node = scene.nodeById.get(id)
          if (!node) return null
          return {
            id,
            cx: node.x + node.width / 2,
            cy: node.y + node.height / 2,
            w: node.width,
            h: node.height,
          }
        })
        .filter(Boolean) as { id: string; cx: number; cy: number; w: number; h: number }[]
      if (items.length < 2) return
      const next = computeArrangeCenters({ action, items, refId, minSpacing: gridSize || 24 })
      for (let i = 0; i < items.length; i += 1) {
        const id = items[i]!.id
        const node = scene.nodeById.get(id)
        const point = next[id]
        if (!node || !point) continue
        node.x = snapX(point.cx - node.width / 2)
        node.y = snapY(point.cy - node.height / 2)
      }
      runtime.dirty = true
      positionsDirtySinceCommitRef.current = true
      scheduleFlowDraw()
      requestCommit()
    }
  }, [active, positionsDirtySinceCommitRef, requestCommit, runtimeRef, schema, scheduleFlowDraw, selectedIds, selectedNodeId])

  React.useEffect(() => {
    if (!active) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (isEditableTarget(e.target)) return
      const arrange = readArrangeShortcut(e)
      if (arrange) {
        e.preventDefault()
        applyArrange(arrange)
        return
      }
      if (selectedIds.length === 0) return
      const grid = readSnapGridConfigFromSchema(schema)
      const delta = readNudgeDelta({ e, snapGridEnabled: grid.enabled, snapGridSize: grid.x, snapGridSizeY: grid.y })
      if (!delta) return
      const runtime = runtimeRef.current
      const scene = runtime?.scene
      if (!runtime || !scene) return
      e.preventDefault()
      for (let i = 0; i < selectedIds.length; i += 1) {
        const node = scene.nodeById.get(selectedIds[i]!)
        if (!node) continue
        node.x += delta.dx
        node.y += delta.dy
      }
      runtime.dirty = true
      positionsDirtySinceCommitRef.current = true
      scheduleFlowDraw()
      requestCommit()
    }
    window.addEventListener('keydown', onKeyDown, { capture: true })
    return () => {
      window.removeEventListener('keydown', onKeyDown, { capture: true } as AddEventListenerOptions)
    }
  }, [active, applyArrange, positionsDirtySinceCommitRef, requestCommit, runtimeRef, scheduleFlowDraw, schema, selectedIds])

  React.useEffect(() => {
    if (!active) return
    const runtime = runtimeRef.current
    if (!zoomRequest) return
    const storyboardWidgetMode = canvas2dRenderer === 'storyboard'
    const requestState = useGraphStore.getState()
    const graphActivationFit = isGraphActivationFitRequest(zoomRequest)
    if (graphActivationFit && !graphActivationFitTargetsGraph({ request: zoomRequest, graphData: graphDataForZoomRequests })) return
    if (!runtime && graphActivationFit) return
    if (!runtime) {
      try {
        if (canvas2dRenderer === 'storyboard' && (zoomRequest.type === 'fit' || zoomRequest.type === 'reset')) {
          requestState.setFlowWidgetWorldPosByNodeId({})
        }
        requestState.clearZoomRequest()
      } catch {
        void 0
      }
      return
    }
    if (storyboardWidgetMode && isWorkspaceGraphMutationBlocked(requestState)) {
      // Fit requests raised by source recomposition during a mutation lock must
      // not remain queued and fire against the settled graph on the next render.
      if (!graphActivationFit) {
        if (zoomRequest.type === 'fit') requestState.clearZoomRequest()
        return
      }
    }
    const widthEffective = viewportW
    applyZoomRequestNative({
      zoomRequest,
      runtime,
      graphData: graphDataForZoomRequests,
      storyboardWidgetSurfaceId,
      canvas2dRendererOverride: canvas2dRenderer,
      width: widthEffective,
      height: viewportH,
      selectedNodeId: selectedNodeId ? String(selectedNodeId) : null,
      selectedEdgeId: selectedEdgeId ? String(selectedEdgeId) : null,
      selectedNodeIds: (selectedNodeIds || []).map(v => String(v)),
      selectedEdgeIds: (selectedEdgeIds || []).map(v => String(v)),
      onFrame: () => {
        scheduleFlowDraw({ force: true })
        if (!storyboardWidgetMode) requestCommit()
        handleInteractionFrame()
      },
      onCommit: requestCommit,
    })
  }, [
    active,
    canvas2dRenderer,
    storyboardWidgetReservedW,
    storyboardWidgetSurfaceId,
    graphDataForZoomRequests,
    handleInteractionFrame,
    requestCommit,
    runtimeRef,
    scheduleFlowDraw,
    selectedEdgeId,
    selectedEdgeIds,
    selectedNodeId,
    selectedNodeIds,
    viewportH,
    viewportW,
    zoomRequest,
  ])

  if (!(active && allowMutations && (selectedIds.length >= 2 || grouping.canUngroup || parentChild.canDetach))) return null
  return (
    <CanvasArrangeActionBar
      active={active}
      selectedCount={selectedIds.length}
      onArrange={applyArrange}
      canGroupNodes={grouping.canGroupNodes}
      canUngroup={grouping.canUngroup}
      canDetach={parentChild.canDetach}
      onGroupNodes={grouping.groupNodes}
      onUngroup={grouping.ungroup}
      onDetach={parentChild.detach}
      ariaLabel="Selected flow node actions"
    />
  )
})
