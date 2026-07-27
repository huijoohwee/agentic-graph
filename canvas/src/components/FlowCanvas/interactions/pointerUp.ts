import * as d3 from 'd3'

import { useGraphStore } from '@/hooks/useGraphStore'
import { computeFlowGroupAabb, requestFlowNativeDraw } from '@/components/FlowCanvas/nativeRuntime'
import { commitGroupBoundsOverrideToStore } from '@/lib/canvas/groupBoundsOverridesStore'
import { unlockGlobalUserSelect } from '@/lib/canvas/interaction-user-select'
import {
  preserveAbsolutePositionForParent,
  selectParentDropTarget,
  type ParentDropCandidate,
} from '@/lib/canvas/parentChildRelation'
import { readSubgraphs, subgraphIdFromGroupId } from '@/lib/graph/subgraphs'
import {
  selectSubFlowParentDropTarget,
  type SubFlowDropCandidate,
} from '@/lib/canvas/subFlow'
import { cancelFlowAlignmentGuideFrame } from '@/components/FlowCanvas/alignmentGuides'

import type { FlowNativeInteractionsContext } from '@/components/FlowCanvas/interactions/context'

export function createFlowNativePointerUpHandler(ctx: FlowNativeInteractionsContext) {
  const runtime = ctx.runtime
  const canvasEl = ctx.canvasEl

  return (e: PointerEvent) => {
    if (canvasEl.style.cursor !== 'default') canvasEl.style.cursor = 'default'
    if (ctx.args.userSelectLockPointerIdRef.current === e.pointerId) {
      ctx.args.userSelectLockPointerIdRef.current = null
      unlockGlobalUserSelect()
    }

    const drag = ctx.args.dragRef.current
    if (!drag) return

    if (e.pointerType === 'touch') {
      ctx.touchPointsById.delete(e.pointerId)
    }

    if (drag.type === 'pinch') {
      if (e.pointerId !== drag.pointerIdA && e.pointerId !== drag.pointerIdB) return
      ctx.args.dragRef.current = null
      ctx.edgeScroll.reset()
      ctx.args.requestCommit()
      try {
        e.preventDefault()
      } catch {
        void 0
      }
      return
    }

    if (drag.pointerId !== e.pointerId) return

    if (drag.type === 'groupResize') {
      ctx.args.dragRef.current = null
      ctx.edgeScroll.reset()
      const scene = runtime.scene
      const group = scene?.groups?.find(g => String(g.id || '').trim() === String(drag.groupId || '').trim()) || null
      const explicit =
        group &&
        (group as unknown as { bounds?: unknown }).bounds &&
        typeof (group as any).bounds === 'object' &&
        !Array.isArray((group as any).bounds)
          ? (group as any).bounds
          : null
      if (explicit) {
        const x = typeof explicit.x === 'number' ? explicit.x : Number.NaN
        const y = typeof explicit.y === 'number' ? explicit.y : Number.NaN
        const width = typeof explicit.width === 'number' ? explicit.width : Number.NaN
        const height = typeof explicit.height === 'number' ? explicit.height : Number.NaN
        if (Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0) {
          commitGroupBoundsOverrideToStore(drag.groupId, { x, y, width, height })
        }
      }
      ctx.args.requestCommit()
      try {
        e.preventDefault()
      } catch {
        void 0
      }
      return
    }

    if (drag.type === 'lasso') {
      ctx.args.dragRef.current = null
      ctx.edgeScroll.reset()
      ctx.args.setSelectionBox(null)
      const scene = runtime.scene
      if (!scene) {
        ctx.args.requestCommit()
        return
      }
      const t0 = runtime.transform || d3.zoomIdentity
      const leftSx = Math.min(drag.startSx, drag.lastSx)
      const topSy = Math.min(drag.startSy, drag.lastSy)
      const rightSx = Math.max(drag.startSx, drag.lastSx)
      const bottomSy = Math.max(drag.startSy, drag.lastSy)
      const minX = (leftSx - t0.x) / t0.k
      const minY = (topSy - t0.y) / t0.k
      const maxX = (rightSx - t0.x) / t0.k
      const maxY = (bottomSy - t0.y) / t0.k
      const selected: string[] = []
      for (let i = 0; i < scene.nodes.length; i += 1) {
        const n = scene.nodes[i]
        const nMinX = n.x
        const nMinY = n.y
        const nMaxX = n.x + n.width
        const nMaxY = n.y + n.height
        const intersects = nMinX <= maxX && nMaxX >= minX && nMinY <= maxY && nMaxY >= minY
        if (intersects) selected.push(String(n.id))
      }
      const state = useGraphStore.getState()
      state.setSelectionSource('canvas')
      const prevIdsRaw = Array.isArray(state.selectedNodeIds) ? state.selectedNodeIds : []
      const prevIds = prevIdsRaw.map(v => String(v || '').trim()).filter(Boolean)
      if (drag.mode === 'remove') {
        const drop = new Set<string>(selected.map(v => String(v || '').trim()).filter(Boolean))
        const next = prevIds.filter(id => !drop.has(id))
        state.selectNodesExpanded({ nodeIds: next, activeNodeId: next.length > 0 ? next[next.length - 1] : null })
      } else if (drag.mode === 'add') {
        const set = new Set<string>(prevIds)
        for (let i = 0; i < selected.length; i += 1) {
          const id = String(selected[i] || '').trim()
          if (id) set.add(id)
        }
        const next = Array.from(set)
        state.selectNodesExpanded({ nodeIds: next, activeNodeId: next.length > 0 ? next[next.length - 1] : null })
      } else {
        state.selectNodesExpanded({ nodeIds: selected, activeNodeId: selected.length > 0 ? selected[selected.length - 1] : null })
      }
      requestFlowNativeDraw(runtime, ctx.args.buildDrawArgs())
      ctx.args.requestCommit()
      ctx.args.onInteractionFrame?.()
      try {
        e.preventDefault()
      } catch {
        void 0
      }
      return
    }

    if (drag.type === 'node' && e.type !== 'pointercancel') {
      const scene = runtime.scene
      const node = scene?.nodeById.get(drag.nodeId) || null
      if (scene && node) {
        const groupsPresentation = runtime.presentation.groups
        const candidates: ParentDropCandidate[] = []
        const groups = groupsPresentation.enabled && Array.isArray(scene.groups) ? scene.groups : []
        for (let i = 0; i < groups.length; i += 1) {
          const group = groups[i]!
          if (group.source !== 'userSubgraph') continue
          const subgraphId = subgraphIdFromGroupId(group.id)
          if (!subgraphId) continue
          const bounds = computeFlowGroupAabb({
            scene,
            group,
            paddingPx: groupsPresentation.paddingPx,
            labelTopExtraPx: groupsPresentation.labelTopExtraPx,
          })
          if (!bounds) continue
          candidates.push({
            groupId: group.id,
            subgraphId,
            depth: group.depth,
            memberNodeIds: group.memberNodeIds,
            bounds,
          })
        }
        const target = selectParentDropTarget({
          nodeId: drag.nodeId,
          nodeBounds: {
            minX: node.x,
            minY: node.y,
            maxX: node.x + node.width,
            maxY: node.y + node.height,
          },
          candidates,
        })
        const position = target
          ? preserveAbsolutePositionForParent({ x: node.x, y: node.y }, target.bounds)
          : null
        if (target && position) {
          node.x = position.absolute.x
          node.y = position.absolute.y
          const state = useGraphStore.getState()
          const result = state.attachNodeToUserSubgraph(target.subgraphId, drag.nodeId)
          if (result.ok === false) {
            state.pushUiToast({
              id: 'parent-child-attach-error',
              kind: 'error',
              message: result.message,
            })
          }
        }
      }
    }

    const groupMoved = drag.type === 'group' && drag.memberNodeIds.some(nodeId => {
      const node = runtime.scene?.nodeById.get(nodeId) || null
      const start = drag.startNodePosById[nodeId]
      return !!node && !!start && (Math.abs(node.x - start.x) > 0.01 || Math.abs(node.y - start.y) > 0.01)
    })
    if (drag.type === 'group' && groupMoved && e.type !== 'pointercancel') {
      const scene = runtime.scene
      const group = scene?.groups?.find(candidate => String(candidate.id || '').trim() === String(drag.groupId || '').trim()) || null
      const childSubgraphId = group?.source === 'userSubgraph' ? subgraphIdFromGroupId(group.id) : ''
      if (scene && group && childSubgraphId) {
        const presentation = runtime.presentation.groups
        const groupBounds = computeFlowGroupAabb({
          scene,
          group,
          paddingPx: presentation.paddingPx,
          labelTopExtraPx: presentation.labelTopExtraPx,
        })
        const candidates: SubFlowDropCandidate[] = []
        for (const candidate of scene.groups || []) {
          if (candidate.source !== 'userSubgraph') continue
          const subgraphId = subgraphIdFromGroupId(candidate.id)
          if (!subgraphId) continue
          const bounds = computeFlowGroupAabb({
            scene,
            group: candidate,
            paddingPx: presentation.paddingPx,
            labelTopExtraPx: presentation.labelTopExtraPx,
          })
          if (!bounds) continue
          candidates.push({
            groupId: candidate.id,
            subgraphId,
            parentGroupId: candidate.parentGroupId,
            depth: candidate.depth,
            bounds,
          })
        }
        const target = groupBounds
          ? selectSubFlowParentDropTarget({
            groupId: group.id,
            groupBounds,
            candidates,
          })
          : null
        if (target) {
          const state = useGraphStore.getState()
          const currentParentId = readSubgraphs(state.graphData)
            .find(subgraph => subgraph.id === childSubgraphId)?.parentId || null
          if (currentParentId !== target.subgraphId) {
            const result = state.updateUserSubgraph(childSubgraphId, { parentId: target.subgraphId })
            if (result.ok === false) {
              state.pushUiToast({
                id: 'sub-flow-attach-error',
                kind: 'error',
                message: result.message,
              })
            }
          }
        }
      }
    }

    cancelFlowAlignmentGuideFrame(runtime)
    runtime.dirty = true
    requestFlowNativeDraw(runtime, ctx.args.buildDrawArgs())
    ctx.args.dragRef.current = null
    ctx.edgeScroll.reset()
    ctx.args.requestCommit()
    try {
      e.preventDefault()
    } catch {
      void 0
    }
  }
}
