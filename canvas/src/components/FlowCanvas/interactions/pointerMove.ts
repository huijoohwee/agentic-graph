import * as d3 from 'd3'

import {
  computeFlowGroupAabb,
  hitTestGroup,
  requestFlowNativeDraw,
  setFlowNativeTransform,
  type FlowNativeScene,
} from '@/components/FlowCanvas/nativeRuntime'
import { unlockGlobalUserSelect } from '@/lib/canvas/interaction-user-select'
import { readCanvasLocalPoint } from '@/lib/canvas/canvas-event-coords'
import { computePinchZoomTransform } from '@/lib/canvas/viewport-transform'
import { applyStoryboardWidgetScreenAuthorityPanSnapshot } from '@/lib/storyboardWidget/screenAuthorityCollectivePan'
import { clampFlowDelta, clampFlowNodeTopLeft } from '@/components/FlowCanvas/groupContainment'
import { snapDeltaToGridByAnchor, snapScalarToGrid } from '@/lib/canvas/gridSnap'
import { computeGroupResizeBottomRight } from '@/lib/canvas/groupResizeMath2d'
import { applyGroupResizeDragSensitivity, computeDynamicGroupResizeHandlePx, pxToWorld } from '@/lib/canvas/groupResizeHandleConfig'
import {
  alignmentRectFromTopLeft,
  resolveAlignmentSnap,
  unionAlignmentRects,
  type AlignmentGuide,
} from '@/lib/canvas/alignmentGuides'
import {
  cancelFlowAlignmentGuideFrame,
  scheduleFlowAlignmentGuides,
} from '@/components/FlowCanvas/alignmentGuides'

import type { FlowNativeInteractionsContext } from '@/components/FlowCanvas/interactions/context'

const stationaryAlignmentRects = (scene: FlowNativeScene, excludedIds: Set<string>) => (
  scene.nodes
    .filter(node => !excludedIds.has(node.id))
    .map(node => alignmentRectFromTopLeft(node))
)

export function createFlowNativePointerMoveHandler(ctx: FlowNativeInteractionsContext) {
  const canvasEl = ctx.canvasEl
  const runtime = ctx.runtime

  return (e: PointerEvent) => {
    const setCursor = (value: string) => {
      if (canvasEl.style.cursor !== value) canvasEl.style.cursor = value
    }
    const drag = ctx.args.dragRef.current
    const local = readCanvasLocalPoint({ canvasEl, event: e })
    if (local && local.inBounds) ctx.args.lastPointerInCanvasRef.current = { sx: local.sx, sy: local.sy, ts: Date.now() }
    if (!drag) {
      if (!local || !local.inBounds) {
        setCursor('default')
        return
      }
      const sx = local.sx
      const sy = local.sy
      const groupId = hitTestGroup(runtime, { sx, sy })
      if (!groupId) {
        setCursor('default')
        return
      }
      const scene = runtime.scene
      const group = scene?.groups?.find(g => String(g.id || '').trim() === String(groupId || '').trim()) || null
      if (!scene || !group) {
        setCursor('default')
        return
      }
      const gCfg = runtime.presentation.groups
      const aabb = computeFlowGroupAabb({
        scene,
        group,
        paddingPx: Math.max(0, gCfg.paddingPx),
        labelTopExtraPx: Math.max(0, gCfg.labelTopExtraPx),
      })
      if (!aabb) {
        setCursor('default')
        return
      }
      const t0 = runtime.transform || d3.zoomIdentity
      const wx = (sx - t0.x) / t0.k
      const wy = (sy - t0.y) / t0.k
      const rh = runtime.presentation.groups.resizeHandle
      if (rh) {
        const s = computeDynamicGroupResizeHandlePx({
          dotRadiusPx: rh.dotRadiusPx,
          hitRadiusPx: rh.hitRadiusPx,
          strokeWidthPx: rh.strokeWidthPx,
          groupWidth: Math.max(1, aabb.maxX - aabb.minX),
          groupHeight: Math.max(1, aabb.maxY - aabb.minY),
        })
        const hw = pxToWorld(s.hitRadiusPx, t0.k)
        const inHandle = wx >= aabb.maxX - hw && wx <= aabb.maxX + hw && wy >= aabb.maxY - hw && wy <= aabb.maxY + hw
        if (inHandle) {
          setCursor('nwse-resize')
          return
        }
      }
      const headerHeightPxRaw = Math.max(
        16,
        runtime.presentation.labels.groupFontSizePx + 10,
        runtime.presentation.groups.labelTopExtraPx + 8,
      )
      const headerHeightWorld = pxToWorld(headerHeightPxRaw, t0.k)
      const maxHeaderWorld = Math.max(1, (aabb.maxY - aabb.minY) * 0.45)
      const headerH = Math.min(headerHeightWorld, maxHeaderWorld)
      const inHeader = wx >= aabb.minX && wx <= aabb.maxX && wy >= aabb.minY && wy <= aabb.minY + headerH
      setCursor(inHeader ? 'grab' : 'default')
      return
    }

    if (e.pointerType !== 'touch' && e.buttons === 0) {
      if (ctx.args.userSelectLockPointerIdRef.current === e.pointerId) {
        ctx.args.userSelectLockPointerIdRef.current = null
        unlockGlobalUserSelect()
      }
      try {
        if (canvasEl.hasPointerCapture(e.pointerId)) {
          canvasEl.releasePointerCapture(e.pointerId)
        }
      } catch {
        void 0
      }
      ctx.args.dragRef.current = null
      ctx.edgeScroll.reset()
      ctx.args.setSelectionBox(null)
      cancelFlowAlignmentGuideFrame(runtime)
      runtime.dirty = true
      requestFlowNativeDraw(runtime, ctx.args.buildDrawArgs())
      ctx.args.requestCommit()
      return
    }

    if (drag.type === 'pinch') {
      if (e.pointerId !== drag.pointerIdA && e.pointerId !== drag.pointerIdB) return
    } else {
      if (drag.pointerId !== e.pointerId) return
    }

    if (drag.type === 'group') setCursor('grabbing')
    else if (drag.type === 'groupResize') setCursor('nwse-resize')
    else setCursor('default')

    if (!local) return
    const sx = local.sx
    const sy = local.sy

    if (drag.type === 'node' || drag.type === 'nodes' || drag.type === 'group' || drag.type === 'lasso') {
      const d = ctx.edgeScroll.update({
        nowMs: Date.now(),
        pointer: { sx, sy, kind: e.pointerType === 'touch' ? 'touch' : e.pointerType === 'pen' ? 'pen' : 'mouse' },
        viewport: { w: runtime.viewportW, h: runtime.viewportH },
        zoomK: runtime.transform?.k || 1,
        enabled: local.inBounds === true && drag.edgeScrollEnabled,
      })
      if (Math.abs(d.dx) > 1e-6 || Math.abs(d.dy) > 1e-6) {
        setFlowNativeTransform(runtime, d3.zoomIdentity.translate(runtime.transform.x + d.dx, runtime.transform.y + d.dy).scale(runtime.transform.k))
        requestFlowNativeDraw(runtime, ctx.args.buildDrawArgs())
        ctx.args.onInteractionFrame?.()
      }
    }

    if (drag.type === 'groupResize') {
      const t0 = runtime.transform || d3.zoomIdentity
      const wx = (sx - t0.x) / t0.k
      const wy = (sy - t0.y) / t0.k
      const scene = runtime.scene
      if (!scene || !scene.groups) return
      const group = scene.groups.find(g => String(g.id || '').trim() === String(drag.groupId || '').trim()) || null
      if (!group) return
      const minW = typeof drag.minWidth === 'number' && Number.isFinite(drag.minWidth) ? drag.minWidth : 24
      const minH = typeof drag.minHeight === 'number' && Number.isFinite(drag.minHeight) ? drag.minHeight : 24
      const adjustedWorld = applyGroupResizeDragSensitivity({
        startWorld: { x: drag.startWorldX, y: drag.startWorldY },
        world: { x: wx, y: wy },
        zoomK: t0.k,
        dragSensitivity: drag.dragSensitivity,
        dragDeadzonePx: drag.dragDeadzonePx,
      })
      const next = computeGroupResizeBottomRight({
        startBounds: { x: drag.startBounds.x, y: drag.startBounds.y, w: drag.startBounds.width, h: drag.startBounds.height },
        startWorld: { x: drag.startWorldX, y: drag.startWorldY },
        world: adjustedWorld,
        minW,
        minH,
        snapGrid: drag.snapGrid,
        altDown: e.altKey === true,
      })
      const previous = (group as unknown as { bounds?: { x?: number; y?: number; width?: number; height?: number } }).bounds
      if (
        previous &&
        previous.x === next.x &&
        previous.y === next.y &&
        previous.width === next.w &&
        previous.height === next.h
      ) {
        return
      }
      ;(group as unknown as { bounds?: unknown }).bounds = { x: next.x, y: next.y, width: next.w, height: next.h }
      runtime.dirty = true
      requestFlowNativeDraw(runtime, ctx.args.buildDrawArgs())
      ctx.args.onInteractionFrame?.()
      try {
        e.preventDefault()
      } catch {
        void 0
      }
      return
    }

    if (e.pointerType === 'touch') {
      ctx.touchPointsById.set(e.pointerId, { sx, sy })
    }

    if (drag.type === 'pinch') {
      const a = ctx.touchPointsById.get(drag.pointerIdA)
      const b = ctx.touchPointsById.get(drag.pointerIdB)
      if (!a || !b) return
      const next = computePinchZoomTransform({
        startTransform: drag.startTransform,
        startA: drag.startA,
        startB: drag.startB,
        curA: a,
        curB: b,
        scaleExtent: drag.scaleExtent,
        zoomExponentMultiplier: drag.zoomExponentMultiplier,
      })
      setFlowNativeTransform(runtime, next)
      requestFlowNativeDraw(runtime, ctx.args.buildDrawArgs())
      ctx.args.onInteractionFrame?.()
      try {
        e.preventDefault()
      } catch {
        void 0
      }
      return
    }

    if (drag.type === 'lasso') {
      const left = Math.min(drag.startSx, sx)
      const top = Math.min(drag.startSy, sy)
      const right = Math.max(drag.startSx, sx)
      const bottom = Math.max(drag.startSy, sy)
      ctx.args.dragRef.current = { ...drag, lastSx: sx, lastSy: sy }
      ctx.args.setSelectionBox({ left, top, width: Math.max(1, right - left), height: Math.max(1, bottom - top) })
      ctx.args.onInteractionFrame?.()
      try {
        e.preventDefault()
      } catch {
        void 0
      }
      return
    }

    if (drag.type === 'pan') {
      const dx = (sx - drag.startSx) * drag.interactionSpeed
      const dy = (sy - drag.startSy) * drag.interactionSpeed
      const nextTransform = d3.zoomIdentity.translate(drag.startTx + dx, drag.startTy + dy).scale(runtime.transform.k)
      if (drag.useStoryboardWidgetScreenAuthorityPan === true) {
        const snapshot = drag.storyboardWidgetScreenAuthorityPan || null
        if (snapshot) {
          setFlowNativeTransform(runtime, nextTransform)
          requestFlowNativeDraw(runtime, ctx.args.buildDrawArgs())
          const changed = applyStoryboardWidgetScreenAuthorityPanSnapshot({
            snapshot,
            dx,
            dy,
            transform: nextTransform,
            canvasTransformShifted: true,
          })
          if (changed) ctx.args.onInteractionFrame?.()
          try {
            e.preventDefault()
          } catch {
            void 0
          }
          return
        }
      }
      setFlowNativeTransform(runtime, nextTransform)
      requestFlowNativeDraw(runtime, ctx.args.buildDrawArgs())
      ctx.args.onInteractionFrame?.()
      try {
        e.preventDefault()
      } catch {
        void 0
      }
      return
    }

    if (drag.type === 'nodes') {
      const t0 = runtime.transform || d3.zoomIdentity
      const wx = (sx - t0.x) / t0.k
      const wy = (sy - t0.y) / t0.k
      const dx = wx - drag.startWorldX
      const dy = wy - drag.startWorldY
      const grid = drag.snapGrid
      const allowSnap = grid.enabled && e.altKey !== true
      const scene = runtime.scene
      if (!scene) return
      const anchorId = drag.memberNodeIds[0] || ''
      const anchorStart = anchorId ? drag.startNodePosById[anchorId] : null
      const snappedDelta = allowSnap ? snapDeltaToGridByAnchor({ anchorStart, rawDelta: { dx, dy }, gridSize: grid }) : { dx, dy }
      let clampedDelta = drag.deltaClamp ? clampFlowDelta({ clamp: drag.deltaClamp, dx: snappedDelta.dx, dy: snappedDelta.dy }) : snappedDelta
      let guides: AlignmentGuide[] = []
      if (drag.helperLinesEnabled && e.altKey !== true) {
        const memberIds = new Set(drag.memberNodeIds)
        const movingRect = unionAlignmentRects(drag.memberNodeIds.flatMap((id) => {
          const node = scene.nodeById.get(id)
          const start = drag.startNodePosById[id]
          if (!node || !start) return []
          return [alignmentRectFromTopLeft({
            id,
            x: start.x + clampedDelta.dx,
            y: start.y + clampedDelta.dy,
            width: node.width,
            height: node.height,
          })]
        }))
        if (movingRect) {
          const snapped = resolveAlignmentSnap({
            moving: movingRect,
            stationary: stationaryAlignmentRects(scene, memberIds),
            scale: t0.k,
          })
          const aligned = {
            dx: clampedDelta.dx + snapped.dx,
            dy: clampedDelta.dy + snapped.dy,
          }
          const finalDelta = drag.deltaClamp
            ? clampFlowDelta({ clamp: drag.deltaClamp, dx: aligned.dx, dy: aligned.dy })
            : aligned
          guides = snapped.guides.filter(guide => (
            guide.axis === 'x'
              ? Math.abs(finalDelta.dx - aligned.dx) < 1e-6
              : Math.abs(finalDelta.dy - aligned.dy) < 1e-6
          ))
          clampedDelta = finalDelta
        }
      }
      for (let i = 0; i < drag.memberNodeIds.length; i += 1) {
        const id = drag.memberNodeIds[i]
        const node = scene.nodeById.get(id)
        const start = drag.startNodePosById[id]
        if (!node || !start) continue
        node.x = start.x + clampedDelta.dx
        node.y = start.y + clampedDelta.dy
      }
      runtime.dirty = true
      ctx.args.positionsDirtySinceCommitRef.current = true
      ctx.scheduleDragRelax()
      requestFlowNativeDraw(runtime, ctx.args.buildDrawArgs())
      scheduleFlowAlignmentGuides(runtime, guides)
      ctx.args.onInteractionFrame?.()
      return
    }

    if (drag.type === 'group') {
      const t0 = runtime.transform || d3.zoomIdentity
      const wx = (sx - t0.x) / t0.k
      const wy = (sy - t0.y) / t0.k
      const dx = wx - drag.startWorldX
      const dy = wy - drag.startWorldY
      const grid = drag.snapGrid
      const allowSnap = grid.enabled && e.altKey !== true
      const scene = runtime.scene
      if (!scene) return
      const anchorId = drag.memberNodeIds[0] || ''
      const anchorStart = anchorId ? drag.startNodePosById[anchorId] : null
      const snappedDelta = allowSnap ? snapDeltaToGridByAnchor({ anchorStart, rawDelta: { dx, dy }, gridSize: grid }) : { dx, dy }
      const clampedDelta = drag.deltaClamp
        ? clampFlowDelta({ clamp: drag.deltaClamp, dx: snappedDelta.dx, dy: snappedDelta.dy })
        : snappedDelta
      for (let i = 0; i < drag.memberNodeIds.length; i += 1) {
        const id = drag.memberNodeIds[i]
        const node = scene.nodeById.get(id)
        const start = drag.startNodePosById[id]
        if (!node || !start) continue
        node.x = start.x + clampedDelta.dx
        node.y = start.y + clampedDelta.dy
      }
      runtime.dirty = true
      ctx.args.positionsDirtySinceCommitRef.current = true
      ctx.scheduleDragRelax()
      requestFlowNativeDraw(runtime, ctx.args.buildDrawArgs())
      ctx.args.onInteractionFrame?.()
      return
    }

    const t0 = runtime.transform || d3.zoomIdentity
    const wx = (sx - t0.x) / t0.k
    const wy = (sy - t0.y) / t0.k
    const dx = wx - drag.startWorldX
    const dy = wy - drag.startWorldY
    const grid = drag.snapGrid
    const allowSnap = grid.enabled && e.altKey !== true
    const scene = runtime.scene
    const node = scene?.nodeById.get(drag.nodeId)
    if (!scene || !node) return
    const nextX0 = drag.startNodeX + dx
    const nextY0 = drag.startNodeY + dy
    let nextX = allowSnap ? snapScalarToGrid(nextX0, grid, 'x') : nextX0
    let nextY = allowSnap ? snapScalarToGrid(nextY0, grid, 'y') : nextY0
    if (drag.clamp) {
      const clamped = clampFlowNodeTopLeft({ clamp: drag.clamp, x: nextX, y: nextY })
      nextX = clamped.x
      nextY = clamped.y
    }
    let guides: AlignmentGuide[] = []
    if (drag.helperLinesEnabled && e.altKey !== true) {
      const snapped = resolveAlignmentSnap({
        moving: alignmentRectFromTopLeft({
          id: node.id,
          x: nextX,
          y: nextY,
          width: node.width,
          height: node.height,
        }),
        stationary: stationaryAlignmentRects(scene, new Set([node.id])),
        scale: t0.k,
      })
      const aligned = { x: nextX + snapped.dx, y: nextY + snapped.dy }
      const finalPosition = drag.clamp
        ? clampFlowNodeTopLeft({ clamp: drag.clamp, x: aligned.x, y: aligned.y })
        : aligned
      guides = snapped.guides.filter(guide => (
        guide.axis === 'x'
          ? Math.abs(finalPosition.x - aligned.x) < 1e-6
          : Math.abs(finalPosition.y - aligned.y) < 1e-6
      ))
      nextX = finalPosition.x
      nextY = finalPosition.y
    }
    node.x = nextX
    node.y = nextY
    runtime.dirty = true
    ctx.args.positionsDirtySinceCommitRef.current = true
    ctx.scheduleDragRelax()
    requestFlowNativeDraw(runtime, ctx.args.buildDrawArgs())
    scheduleFlowAlignmentGuides(runtime, guides)
    ctx.args.onInteractionFrame?.()
    try {
      e.preventDefault()
    } catch {
      void 0
    }
  }
}
