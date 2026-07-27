import * as d3 from 'd3'

import { useGraphStore } from '@/hooks/useGraphStore'
import {
  computeFlowGroupAabb,
  hitTestGroup,
  hitTestNode,
  requestFlowNativeDraw,
  type FlowNativeRuntime,
} from '@/components/FlowCanvas/nativeRuntime'
import { cancelFlowZoomRequestAnim } from '@/components/FlowCanvas/applyZoomRequestNative'
import { readAllowGroupResize } from '@/lib/canvas/groupResizePolicy'
import { lockGlobalUserSelect } from '@/lib/canvas/interaction-user-select'
import { disableAutoZoomModesForUserGesture } from '@/lib/canvas/auto-zoom-modes'
import { isSpacePanHeld } from '@/lib/canvas/space-pan'
import { readCanvasLocalPoint } from '@/lib/canvas/canvas-event-coords'
import { readStoryboardWidgetElementSurfaceId } from '@/lib/canvas/storyboard-widget-overlay-proxy'
import {
  readStoryboardWidgetScreenAuthorityPanSnapshot,
  shouldUseStoryboardWidgetScreenAuthorityCollectivePan,
} from '@/lib/storyboardWidget/screenAuthorityCollectivePan'
import { readFlowPanInteractionSpeed, readFlowPinchZoomSessionSettings } from '@/components/FlowCanvas/interactions/dragSession'
import {
  isPanDragButton,
  shouldAllowPanDragForPointerEvent,
  shouldStartSelectionDragForPreset,
} from '@/lib/canvas/viewport-controls'
import { computeDynamicGroupResizeHandlePx, pxToWorld, readGroupResizeHandleConfig } from '@/lib/canvas/groupResizeHandleConfig'
import { computeMinGroupResizeSize } from '@/lib/canvas/groupResizeMath2d'
import {
  computeFlowDeltaClampForNodes,
  computeFlowGroupDeltaClamp,
  computeFlowNodeClamp,
} from '@/components/FlowCanvas/groupContainment'
import { readSnapGridConfigFromSchema } from '@/lib/canvas/gridSnap'
import { readHelperLinesDisplayControlActive } from '@/lib/canvas/canvasGridDisplayControls'

import type { FlowNativeInteractionsContext } from '@/components/FlowCanvas/interactions/context'
import type { FlowCanvasDrag } from '@/components/FlowCanvas/interactions/types'

export function createFlowNativePointerDownHandler(ctx: FlowNativeInteractionsContext) {
  const canvasEl = ctx.canvasEl
  const runtime: FlowNativeRuntime = ctx.runtime

  return (e: PointerEvent) => {
    if (!ctx.args.active) return

    ctx.viewportWheelController.destroy()
    cancelFlowZoomRequestAnim(runtime)

    const presetRaw = ctx.getPreset()
    const storeStateAtDown = useGraphStore.getState()
    const storyboardWidgetMode = String(storeStateAtDown.canvas2dRenderer || '') === 'storyboard'
    const dragSnapGrid = readSnapGridConfigFromSchema(storeStateAtDown.schema)
    const helperLinesEnabled = readHelperLinesDisplayControlActive(storeStateAtDown.schema)
    const panInteractionSpeed = readFlowPanInteractionSpeed(storeStateAtDown)
    const edgeScrollEnabled = storeStateAtDown.viewPinned !== true
    const preset = presetRaw
    const allowButton = e.pointerType === 'touch' || e.button === 0 || isPanDragButton(e.button, preset)
    if (!allowButton) return
    try {
      disableAutoZoomModesForUserGesture(storeStateAtDown)
    } catch {
      void 0
    }

    const local = readCanvasLocalPoint({ canvasEl, event: e })
    if (!local) return
    ctx.args.lastPointerInCanvasRef.current = { sx: local.sx, sy: local.sy, ts: Date.now() }
    const sx = local.sx
    const sy = local.sy

    const hit = hitTestNode(runtime, { sx, sy })
    const pointerId = e.pointerId

    const spacePanHeld = isSpacePanHeld()
    const pointerMode2d = String(storeStateAtDown.canvasPointerMode2d || '')
    const pointerModePan = pointerMode2d === 'pan'
    const allowPan = shouldAllowPanDragForPointerEvent({
      preset,
      eventType: 'pointerdown',
      button: e.button,
      shiftKey: e.shiftKey === true,
      spacePanHeld,
      pointerMode2d,
    })
    const selectionDrag = pointerModePan ? false : shouldStartSelectionDragForPreset({
      preset,
      button: e.button,
      shiftKey: e.shiftKey === true,
      spacePanHeld,
      selectionOnDrag: ctx.args.selectionOnDrag,
    })

    const startDrag = (next: FlowCanvasDrag) => {
      lockGlobalUserSelect()
      ctx.args.userSelectLockPointerIdRef.current = pointerId
      try {
        canvasEl.setPointerCapture(pointerId)
      } catch {
        void 0
      }
      try {
        e.preventDefault()
      } catch {
        void 0
      }
      ctx.args.dragRef.current = next
    }

    const createPanDrag = (): Extract<NonNullable<FlowCanvasDrag>, { type: 'pan' }> => {
      const startTransform = runtime.transform || d3.zoomIdentity
      const useStoryboardWidgetScreenAuthorityPan = shouldUseStoryboardWidgetScreenAuthorityCollectivePan(storeStateAtDown)
      return {
        type: 'pan',
        startSx: sx,
        startSy: sy,
        startTx: startTransform.x,
        startTy: startTransform.y,
        interactionSpeed: panInteractionSpeed,
        pointerId,
        useStoryboardWidgetScreenAuthorityPan,
        storyboardWidgetScreenAuthorityPan: useStoryboardWidgetScreenAuthorityPan
          ? readStoryboardWidgetScreenAuthorityPanSnapshot({
            storyboardWidgetSurfaceId: ctx.args.storyboardWidgetSurfaceId || readStoryboardWidgetElementSurfaceId(canvasEl),
            transform: startTransform,
          })
          : null,
      }
    }

    if (e.pointerType === 'touch') {
      ctx.touchPointsById.set(pointerId, { sx, sy })
      if (ctx.touchPointsById.size >= 2) {
        const entries = Array.from(ctx.touchPointsById.entries())
        const first = entries[0]
        const second = entries[1]
        const a = first ? first[1] : { sx, sy }
        const b = second ? second[1] : { sx, sy }
        ctx.args.setSelectionBox(null)
        const startTransform = runtime.transform || d3.zoomIdentity
        startDrag({
          type: 'pinch',
          pointerIdA: first ? first[0] : pointerId,
          pointerIdB: second ? second[0] : pointerId,
          startTransform,
          startA: { sx: a.sx, sy: a.sy },
          startB: { sx: b.sx, sy: b.sy },
          ...readFlowPinchZoomSessionSettings(storeStateAtDown, startTransform),
          pointerId,
        })
        return
      }
    }

    if (spacePanHeld === true && e.button === 0 && allowPan === true && selectionDrag !== true) {
      startDrag(createPanDrag())
      return
    }

    if (hit) {
      const state = storeStateAtDown
      state.setSelectionSource('canvas')
      const mode = ctx.readEffectiveSelectMode(state, storyboardWidgetMode)
      const wantsShiftToggle = e.shiftKey === true
      const wantsModeToggle = (mode === 'multi' || mode === 'lasso') && (e.metaKey === true || e.ctrlKey === true)
      const wantsToggle = wantsShiftToggle || wantsModeToggle
      const selectedAtDownRaw = Array.isArray(state.selectedNodeIds) ? state.selectedNodeIds : []
      const selectedAtDown = selectedAtDownRaw.map(v => String(v || '').trim()).filter(Boolean)
      const isHitSelected = selectedAtDown.includes(hit)
      if (wantsToggle) {
        state.toggleNodeSelectionAdditive(hit)
      } else if (mode === 'multi' || mode === 'lasso') {
        state.selectEdge(null)
        if (isHitSelected && selectedAtDown.length > 1) {
          state.selectNodesExpanded({ nodeIds: selectedAtDown, activeNodeId: hit })
        } else {
          state.selectNodesExpanded({ nodeIds: [hit], activeNodeId: hit })
        }
      } else {
        state.selectEdge(null)
        state.selectNode(hit)
      }

      const allowDrag = typeof ctx.args.allowNodeDragOverride === 'boolean' ? ctx.args.allowNodeDragOverride : state.schema?.behavior?.allowNodeDrag !== false
      if (!allowDrag) {
        ctx.args.setSelectionBox(null)
        requestFlowNativeDraw(runtime, ctx.args.buildDrawArgs())
        ctx.args.requestCommit()
        if (allowPan === true && selectionDrag !== true) {
          startDrag(createPanDrag())
        }
        return
      }

      const t0 = runtime.transform || d3.zoomIdentity
      const wx = (sx - t0.x) / t0.k
      const wy = (sy - t0.y) / t0.k
      const scene = runtime.scene
      if (scene) {
        const selectedForDrag = (mode === 'multi' || mode === 'lasso') && !wantsToggle && isHitSelected && selectedAtDown.length > 1
        if (selectedForDrag) {
          const memberNodeIds = selectedAtDown.map(v => String(v || '').trim()).filter(id => id && scene.nodeById.has(id))
          const startNodePosById: Record<string, { x: number; y: number }> = {}
          for (let i = 0; i < memberNodeIds.length; i += 1) {
            const id = memberNodeIds[i]
            const n = scene.nodeById.get(id)
            if (!n) continue
            startNodePosById[id] = { x: n.x, y: n.y }
          }
          const startPosById = new Map<string, { x: number; y: number }>()
          for (let i = 0; i < memberNodeIds.length; i += 1) {
            const id = memberNodeIds[i]
            const p = startNodePosById[id]
            if (!p) continue
            startPosById.set(id, p)
          }
          const deltaClamp = computeFlowDeltaClampForNodes({ runtime, nodeIds: memberNodeIds, startPosById })
          startDrag({
            type: 'nodes',
            memberNodeIds,
            startWorldX: wx,
            startWorldY: wy,
            startNodePosById,
            deltaClamp,
            snapGrid: dragSnapGrid,
            helperLinesEnabled,
            edgeScrollEnabled,
            pointerId,
          })
        } else {
          const node = scene.nodeById.get(hit)
          if (node) {
            const clamp = computeFlowNodeClamp({ runtime, nodeId: hit })
            startDrag({
              type: 'node',
              nodeId: hit,
              startWorldX: wx,
              startWorldY: wy,
              startNodeX: node.x,
              startNodeY: node.y,
              clamp,
              snapGrid: dragSnapGrid,
              helperLinesEnabled,
              edgeScrollEnabled,
              pointerId,
            })
          }
        }
      }
      requestFlowNativeDraw(runtime, ctx.args.buildDrawArgs())
      ctx.args.requestCommit()
      return
    }

    const groupHit = hitTestGroup(runtime, { sx, sy })
    if (groupHit) {
      const state = storeStateAtDown
      const selectedGroupId = String(state.selectedGroupId || '').trim()
      const allowGroupResize = readAllowGroupResize(state.schema)
      const allowDrag = typeof ctx.args.allowNodeDragOverride === 'boolean' ? ctx.args.allowNodeDragOverride : state.schema?.behavior?.allowNodeDrag !== false

      if (
        storyboardWidgetMode &&
        allowPan === true &&
        selectionDrag !== true &&
        spacePanHeld !== true &&
        e.altKey !== true &&
        String(state.selectedGroupId || '').trim() !== String(groupHit || '').trim()
      ) {
        state.setSelectionSource('canvas')
        state.selectEdge(null)
        state.selectGroup(groupHit)
        startDrag(createPanDrag())
        return
      }

      if (e.pointerType !== 'touch' && e.button === 0 && spacePanHeld !== true && e.shiftKey !== true && e.metaKey !== true && e.ctrlKey !== true) {
        state.setSelectionSource('canvas')
        state.selectEdge(null)
        state.selectGroup(groupHit)
      }

      let groupAabbForHeader: { minX: number; minY: number; maxX: number; maxY: number } | null = null
      if (allowGroupResize) {
        const scene = runtime.scene
        const group = scene?.groups?.find(g => String(g.id || '').trim() === String(groupHit || '').trim()) || null
        if (scene && group) {
          const gCfg = runtime.presentation.groups
          const paddingPx = Math.max(0, gCfg.paddingPx)
          const labelTopExtraPx = Math.max(0, gCfg.labelTopExtraPx)
          const aabb = computeFlowGroupAabb({ scene, group, paddingPx, labelTopExtraPx })
          groupAabbForHeader = aabb ? { ...aabb } : null
          if (aabb) {
            const handleCfg = runtime.presentation.groups.resizeHandle || readGroupResizeHandleConfig(state.schema)
            const min = computeMinGroupResizeSize({
              minBoundsSizePx: handleCfg.minBoundsSizePx,
              explicitBounds: { x: aabb.minX, y: aabb.minY, w: aabb.maxX - aabb.minX, h: aabb.maxY - aabb.minY },
              autoBounds: null,
            })
            const minWidth = min.minW
            const minHeight = min.minH
            const t0 = runtime.transform || d3.zoomIdentity
            const wx = (sx - t0.x) / t0.k
            const wy = (sy - t0.y) / t0.k
            const handleSizePx = computeDynamicGroupResizeHandlePx({
              dotRadiusPx: handleCfg.dotRadiusPx,
              hitRadiusPx: handleCfg.hitRadiusPx,
              strokeWidthPx: handleCfg.strokeWidthPx,
              groupWidth: Math.max(1, aabb.maxX - aabb.minX),
              groupHeight: Math.max(1, aabb.maxY - aabb.minY),
            })
            const handleSizeWorld = pxToWorld(handleSizePx.hitRadiusPx, t0.k)
            const inHandle =
              wx >= aabb.maxX - handleSizeWorld &&
              wx <= aabb.maxX + handleSizeWorld &&
              wy >= aabb.maxY - handleSizeWorld &&
              wy <= aabb.maxY + handleSizeWorld
            if (inHandle) {
              const explicit = (group as unknown as { bounds?: unknown }).bounds
              if (!explicit || typeof explicit !== 'object' || Array.isArray(explicit)) {
                ;(group as unknown as { bounds?: unknown }).bounds = {
                  x: aabb.minX,
                  y: aabb.minY,
                  width: Math.max(1, aabb.maxX - aabb.minX),
                  height: Math.max(1, aabb.maxY - aabb.minY),
                }
              }
              startDrag({
                type: 'groupResize',
                groupId: groupHit,
                startWorldX: wx,
                startWorldY: wy,
                startBounds: {
                  x: aabb.minX,
                  y: aabb.minY,
                  width: Math.max(1, aabb.maxX - aabb.minX),
                  height: Math.max(1, aabb.maxY - aabb.minY),
                },
                minWidth,
                minHeight,
                snapGrid: dragSnapGrid,
                dragSensitivity: handleCfg.dragSensitivity,
                dragDeadzonePx: handleCfg.dragDeadzonePx,
                pointerId,
              })
              return
            }
          }
        }
      }

      if (!allowDrag) {
        ctx.args.setSelectionBox(null)
        if (allowPan === true && selectionDrag !== true) {
          startDrag(createPanDrag())
        }
        return
      }

      const scene = runtime.scene
      const group = scene?.groups?.find(g => String(g.id || '').trim() === String(groupHit || '').trim()) || null
      if (scene && group) {
        const membersRaw = Array.isArray(group.memberNodeIds) ? group.memberNodeIds : []
        const memberNodeIds = membersRaw.map(v => String(v || '').trim()).filter(Boolean)
        const startNodePosById: Record<string, { x: number; y: number }> = {}
        for (let i = 0; i < memberNodeIds.length; i += 1) {
          const id = memberNodeIds[i]
          const node = scene.nodeById.get(id)
          if (!node) continue
          startNodePosById[id] = { x: node.x, y: node.y }
        }
        const t0 = runtime.transform || d3.zoomIdentity
        const wx = (sx - t0.x) / t0.k
        const wy = (sy - t0.y) / t0.k
        const groupAabb = (() => {
          if (groupAabbForHeader) return groupAabbForHeader
          const gCfg = runtime.presentation.groups
          const paddingPx = Math.max(0, gCfg.paddingPx)
          const labelTopExtraPx = Math.max(0, gCfg.labelTopExtraPx)
          return computeFlowGroupAabb({ scene, group, paddingPx, labelTopExtraPx })
        })()
        if (groupAabb) {
          const headerHeightPxRaw = Math.max(
            16,
            runtime.presentation.labels.groupFontSizePx + 10,
            runtime.presentation.groups.labelTopExtraPx + 8,
          )
          const headerHeightWorld = pxToWorld(headerHeightPxRaw, t0.k)
          const maxHeaderWorld = Math.max(1, (groupAabb.maxY - groupAabb.minY) * 0.45)
          const headerH = Math.min(headerHeightWorld, maxHeaderWorld)
          const inHeader =
            wx >= groupAabb.minX &&
            wx <= groupAabb.maxX &&
            wy >= groupAabb.minY &&
            wy <= groupAabb.minY + headerH
          if (!inHeader) return
        }
        startDrag({
          type: 'group',
          groupId: groupHit,
          memberNodeIds,
          startWorldX: wx,
          startWorldY: wy,
          startNodePosById,
          deltaClamp: computeFlowGroupDeltaClamp({ runtime, groupId: groupHit }),
          snapGrid: dragSnapGrid,
          edgeScrollEnabled,
          pointerId,
        })
        return
      }
    }

    {
      const state = storeStateAtDown
      const selectMode = ctx.readEffectiveSelectMode(state, storyboardWidgetMode)
      const allowLasso = selectMode === 'lasso' || (storyboardWidgetMode && selectMode === 'multi' && e.shiftKey === true)
      const wantLasso =
        allowLasso &&
        e.pointerType !== 'touch' &&
        ((selectionDrag && (!storyboardWidgetMode || e.shiftKey === true)) || (storyboardWidgetMode && e.shiftKey === true && selectionDrag !== true))
      if (wantLasso) {
        state.setSelectionSource('canvas')
        state.selectEdge(null)
        state.selectGroup(null)
        ctx.args.setSelectionBox({ left: sx, top: sy, width: 1, height: 1 })
        const mode: 'replace' | 'add' | 'remove' =
          e.altKey === true ? 'remove' : e.shiftKey === true || e.metaKey === true || e.ctrlKey === true ? 'add' : 'replace'
        startDrag({ type: 'lasso', startSx: sx, startSy: sy, lastSx: sx, lastSy: sy, pointerId, mode, edgeScrollEnabled })
        return
      }
    }

    if (
      !groupHit &&
      e.pointerType !== 'touch' &&
      e.button === 0 &&
      spacePanHeld !== true &&
      e.shiftKey !== true &&
      e.metaKey !== true &&
      e.ctrlKey !== true &&
      e.altKey !== true
    ) {
      const state = storeStateAtDown
      state.setSelectionSource('canvas')
      state.selectNode(null)
      state.selectEdge(null)
      state.selectGroup(null)
      ctx.args.setSelectionBox(null)
    }

    if (e.pointerType === 'touch') {
      startDrag(createPanDrag())
      return
    }

    if (allowPan !== true || selectionDrag === true) return
    startDrag(createPanDrag())
  }
}
