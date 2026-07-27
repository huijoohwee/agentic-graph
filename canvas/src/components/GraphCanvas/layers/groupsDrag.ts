import * as d3 from 'd3'

import type { GroupLayoutCacheEntry } from '@/components/GraphCanvas/layers/groupsLayout'
import { beginDragForceTuning } from '@/components/GraphCanvas/dragForceTuning'
import { markGraphCanvasUserInteracted } from '@/components/GraphCanvas/userInteractionFlag'
import { readLayoutMode } from '@/components/GraphCanvas/layout/fitConfig'
import type { GraphGroup } from '@/components/GraphCanvas/layout/graphGroupsTypes'
import { useGraphStore } from '@/hooks/useGraphStore'
import {
  clampDelta,
  computeDeltaClampForRectWithinRect,
  type DeltaClamp,
  type RectBounds,
} from '@/lib/canvas/groupContainment'
import { readCanvasDragIntentThresholdPx } from '@/lib/canvas/dragIntent'
import {
  selectSubFlowParentDropTarget,
  type SubFlowDropCandidate,
} from '@/lib/canvas/subFlow'
import {
  DEFAULT_DRAG_ALPHA_TARGET,
  DEFAULT_DRAG_ALPHA_TARGET_HARD_CAP,
} from '@/lib/graph/layoutDefaults'
import type { GraphSchema } from '@/lib/graph/schema'
import { readSubgraphs, subgraphIdFromGroupId } from '@/lib/graph/subgraphs'
import type { GraphEdge, GraphNode } from '@/lib/graph/types'

type GroupBounds = {
  x: number
  y: number
  width: number
  height: number
  labelX?: number
  labelY?: number
}

export const bindGroupsDrag = <T extends GraphGroup>(args: {
  labelSelection: d3.Selection<SVGTextElement, T, SVGGElement, unknown>
  visibleGroups: T[]
  parentGroupIdById: Map<string, string | null>
  nodeById: Map<string, GraphNode>
  graphNodeById: Map<string, GraphNode>
  schema: GraphSchema
  simulation: d3.Simulation<GraphNode, GraphEdge> | null
  updateNode?: (id: string, updates: Partial<GraphNode>) => void
  setSelectionSource: (source: 'canvas') => void
  selectGroup: (id: string | null) => void
  readExplicitBounds: (group: T) => GroupBounds | null
  computeBoundsAndLabel: (group: T) => GroupLayoutCacheEntry
  applyComputedToGroup: (group: T, computed: GroupLayoutCacheEntry, selectedGroupId: string) => void
  commitGroupBounds: (groupId: string, bounds: GroupBounds) => void
}) => {
  const behavior = args.schema.behavior as unknown as { allowGroupDrag?: unknown }
  const groupsConfig = args.schema.layout?.groups as unknown as { draggable?: unknown } | undefined
  if (behavior?.allowGroupDrag === false || groupsConfig?.draggable === false) return

  let dragNodes: GraphNode[] = []
  let frozen = false
  let dragBoundsOnly = false
  let dragActivated = false
  let dragThresholdPx = 0
  let dragStartClientX = Number.NaN
  let dragStartClientY = Number.NaN
  let dragBoundsRef: GroupBounds | null = null
  let dragBoundsStart: GroupBounds | null = null
  let dragStartNodePosById = new Map<string, { x: number; y: number }>()
  let dragDeltaClamp: DeltaClamp | null = null
  let dragRawDx = 0
  let dragRawDy = 0
  let dragZoomK = 1
  let endForceTune: null | (() => void) = null

  const toRectBounds = (bounds: GroupBounds | GroupLayoutCacheEntry): RectBounds => ({
    x: bounds.x,
    y: bounds.y,
    width: 'width' in bounds ? bounds.width : bounds.w,
    height: 'height' in bounds ? bounds.height : bounds.h,
  })
  const computeNestedDragClamp = (
    group: T,
    subject: GroupBounds | GroupLayoutCacheEntry,
  ): DeltaClamp | null => {
    const parentGroupId = args.parentGroupIdById.get(String(group.id || '').trim()) || null
    const parent = parentGroupId
      ? args.visibleGroups.find(candidate => String(candidate.id || '').trim() === parentGroupId) || null
      : null
    if (!parent || parent.containChildren === false) return null
    return computeDeltaClampForRectWithinRect({
      subject: toRectBounds(subject),
      container: toRectBounds(args.computeBoundsAndLabel(parent)),
      inset: Math.max(2, typeof parent.style?.strokeWidth === 'number' ? parent.style.strokeWidth : 1),
    })
  }
  const attachDraggedGroupToParent = (group: T) => {
    if (group.source !== 'userSubgraph') return
    const childSubgraphId = subgraphIdFromGroupId(group.id)
    if (!childSubgraphId) return
    const subjectBounds = args.computeBoundsAndLabel(group)
    const candidates: SubFlowDropCandidate[] = []
    for (const candidate of args.visibleGroups) {
      if (candidate.source !== 'userSubgraph') continue
      const subgraphId = subgraphIdFromGroupId(candidate.id)
      if (!subgraphId) continue
      const bounds = args.computeBoundsAndLabel(candidate)
      if (!(bounds.w > 0 && bounds.h > 0)) continue
      candidates.push({
        groupId: candidate.id,
        subgraphId,
        parentGroupId: candidate.parentGroupId,
        depth: candidate.depth,
        bounds: {
          minX: bounds.x,
          minY: bounds.y,
          maxX: bounds.x + bounds.w,
          maxY: bounds.y + bounds.h,
        },
      })
    }
    const target = selectSubFlowParentDropTarget({
      groupId: group.id,
      groupBounds: {
        minX: subjectBounds.x,
        minY: subjectBounds.y,
        maxX: subjectBounds.x + subjectBounds.w,
        maxY: subjectBounds.y + subjectBounds.h,
      },
      candidates,
    })
    if (!target) return
    const state = useGraphStore.getState()
    const currentParentId = readSubgraphs(state.graphData)
      .find(subgraph => subgraph.id === childSubgraphId)?.parentId || null
    if (currentParentId === target.subgraphId) return
    const result = state.updateUserSubgraph(childSubgraphId, { parentId: target.subgraphId })
    if (result.ok === false) {
      state.pushUiToast({
        id: 'sub-flow-attach-error',
        kind: 'error',
        message: result.message,
      })
    }
  }
  const resetDragState = () => {
    dragNodes = []
    dragStartNodePosById = new Map()
    dragDeltaClamp = null
    dragRawDx = 0
    dragRawDy = 0
    frozen = false
    dragBoundsOnly = false
    dragBoundsRef = null
    dragBoundsStart = null
    dragActivated = false
    dragThresholdPx = 0
    dragStartClientX = Number.NaN
    dragStartClientY = Number.NaN
    dragZoomK = 1
  }
  const activateGroupDrag = (event: d3.D3DragEvent<SVGElement, T, T>, group: T) => {
    if (dragActivated) return
    dragActivated = true
    const svgEl = (event?.sourceEvent?.target as SVGElement | null)?.ownerSVGElement
    markGraphCanvasUserInteracted(svgEl)
    frozen = svgEl?.getAttribute('data-kg-layout-frozen') === '1'
    try {
      const zoom = d3.zoomTransform(svgEl as unknown as SVGSVGElement).k
      dragZoomK = typeof zoom === 'number' && Number.isFinite(zoom) && zoom > 0 ? zoom : 1
    } catch {
      dragZoomK = 1
    }
    dragBoundsOnly = false
    dragBoundsRef = null
    dragBoundsStart = null
    dragStartNodePosById = new Map()
    dragDeltaClamp = null
    dragRawDx = 0
    dragRawDy = 0

    const explicit = args.readExplicitBounds(group)
    if (explicit) {
      dragBoundsOnly = true
      dragBoundsRef = { ...explicit }
      dragBoundsStart = { ...explicit }
      dragDeltaClamp = computeNestedDragClamp(group, explicit)
      ;(group as unknown as { bounds?: unknown }).bounds = dragBoundsRef as never
      return
    }

    dragNodes = []
    for (const memberNodeId of group.memberNodeIds) {
      const node = args.nodeById.get(String(memberNodeId))
      if (!node) continue
      dragNodes.push(node)
      dragStartNodePosById.set(String(node.id), {
        x: typeof node.x === 'number' && Number.isFinite(node.x) ? node.x : 0,
        y: typeof node.y === 'number' && Number.isFinite(node.y) ? node.y : 0,
      })
    }
    dragDeltaClamp = computeNestedDragClamp(group, args.computeBoundsAndLabel(group))
    const structured = readLayoutMode(args.schema) === 'radial'
    if (args.simulation && !structured && !frozen && !event.active) {
      const alphaTarget = (() => {
        try {
          const value = useGraphStore.getState().graphDragAlphaTarget2d
          return typeof value === 'number' && Number.isFinite(value)
            ? Math.max(0, Math.min(0.6, value))
            : DEFAULT_DRAG_ALPHA_TARGET
        } catch {
          return DEFAULT_DRAG_ALPHA_TARGET
        }
      })()
      endForceTune = beginDragForceTuning(args.simulation)
      args.simulation.alphaTarget(Math.min(alphaTarget, DEFAULT_DRAG_ALPHA_TARGET_HARD_CAP)).restart()
    }
    for (const node of dragNodes) {
      node.fx = node.x ?? 0
      node.fy = node.y ?? 0
    }
  }
  const updateGroupZOrder = (event: d3.D3DragEvent<SVGElement, T, T>, group: T): boolean => {
    const sourceEvent = event?.sourceEvent as unknown as { altKey?: unknown; shiftKey?: unknown } | undefined
    if (!sourceEvent?.altKey || typeof args.updateNode !== 'function') return false
    const id = String(group.id || '').trim()
    const depth = typeof group.depth === 'number' && Number.isFinite(group.depth)
      ? Math.max(0, Math.floor(group.depth))
      : 0
    const zRaw = (group as unknown as { zIndex?: unknown }).zIndex
    const currentZ = typeof zRaw === 'number' && Number.isFinite(zRaw) ? Math.floor(zRaw) : 0
    let minZ = currentZ
    let maxZ = currentZ
    for (const candidate of args.visibleGroups) {
      const candidateDepth = typeof candidate.depth === 'number' && Number.isFinite(candidate.depth)
        ? Math.max(0, Math.floor(candidate.depth))
        : 0
      if (candidateDepth !== depth) continue
      const candidateRawZ = (candidate as unknown as { zIndex?: unknown }).zIndex
      const candidateZ = typeof candidateRawZ === 'number' && Number.isFinite(candidateRawZ)
        ? Math.floor(candidateRawZ)
        : 0
      minZ = Math.min(minZ, candidateZ)
      maxZ = Math.max(maxZ, candidateZ)
    }
    const subgraphNode = args.graphNodeById.get(id) || null
    if (!subgraphNode) return true
    const properties = ((subgraphNode as unknown as { properties?: unknown }).properties || {}) as Record<string, unknown>
    try {
      args.updateNode(id, {
        properties: { ...properties, 'visual:zIndex': sourceEvent.shiftKey ? minZ - 1 : maxZ + 1 } as never,
      })
    } catch {
      void 0
    }
    return true
  }

  const dragBehavior = d3.drag<SVGElement, T>()
    .on('start', (event, group) => {
      const sourceEvent = (event as unknown as { sourceEvent?: { stopPropagation?: () => void } }).sourceEvent
      sourceEvent?.stopPropagation?.()
      args.setSelectionSource('canvas')
      args.selectGroup(group.id)
      const source = sourceEvent && typeof sourceEvent === 'object' ? sourceEvent as Record<string, unknown> : null
      resetDragState()
      dragThresholdPx = readCanvasDragIntentThresholdPx(source?.pointerType)
      dragStartClientX = typeof source?.clientX === 'number' ? source.clientX : Number.NaN
      dragStartClientY = typeof source?.clientY === 'number' ? source.clientY : Number.NaN
      if (updateGroupZOrder(event, group)) return
      if (!(dragThresholdPx > 0)) activateGroupDrag(event, group)
    })
    .on('drag', (event, group) => {
      if (!dragActivated && dragThresholdPx > 0) {
        const sourceEvent = (event as unknown as { sourceEvent?: unknown }).sourceEvent
        const source = sourceEvent && typeof sourceEvent === 'object' ? sourceEvent as Record<string, unknown> : null
        const clientX = typeof source?.clientX === 'number' ? source.clientX : Number.NaN
        const clientY = typeof source?.clientY === 'number' ? source.clientY : Number.NaN
        if (
          Number.isFinite(clientX) &&
          Number.isFinite(clientY) &&
          Number.isFinite(dragStartClientX) &&
          Number.isFinite(dragStartClientY) &&
          Math.hypot(clientX - dragStartClientX, clientY - dragStartClientY) < dragThresholdPx
        ) return
        activateGroupDrag(event, group)
      } else if (!dragActivated) {
        activateGroupDrag(event, group)
      }
      const zoom = Number.isFinite(dragZoomK) && dragZoomK > 0 ? dragZoomK : 1
      const dx = (typeof event.dx === 'number' && Number.isFinite(event.dx) ? event.dx : 0) / zoom
      const dy = (typeof event.dy === 'number' && Number.isFinite(event.dy) ? event.dy : 0) / zoom
      if (dx === 0 && dy === 0) return
      dragRawDx += dx
      dragRawDy += dy
      const delta = dragDeltaClamp
        ? clampDelta({ clamp: dragDeltaClamp, dx: dragRawDx, dy: dragRawDy })
        : { dx: dragRawDx, dy: dragRawDy }
      if (dragBoundsOnly && dragBoundsRef && dragBoundsStart) {
        dragBoundsRef.x = dragBoundsStart.x + delta.dx
        dragBoundsRef.y = dragBoundsStart.y + delta.dy
        if (typeof dragBoundsStart.labelX === 'number') dragBoundsRef.labelX = dragBoundsStart.labelX + delta.dx
        if (typeof dragBoundsStart.labelY === 'number') dragBoundsRef.labelY = dragBoundsStart.labelY + delta.dy
        const subject = event.subject as unknown as T
        args.applyComputedToGroup(subject, args.computeBoundsAndLabel(subject), String(subject.id || '').trim())
        return
      }
      const structured = readLayoutMode(args.schema) === 'radial'
      for (const node of dragNodes) {
        const start = dragStartNodePosById.get(String(node.id)) || { x: 0, y: 0 }
        node.fx = start.x + delta.dx
        node.fy = start.y + delta.dy
        if (structured || frozen) {
          node.x = node.fx
          node.y = node.fy
        }
      }
      if ((structured || frozen) && args.simulation) {
        const tickHandler = args.simulation.on('tick')
        if (typeof tickHandler === 'function') (tickHandler as unknown as () => void)()
      }
    })
    .on('end', event => {
      const group = event.subject as unknown as T
      if (dragActivated && dragBoundsOnly && dragBoundsRef) {
        const id = String(group.id || '').trim()
        if (id) args.commitGroupBounds(id, dragBoundsRef)
        if (Math.hypot(dragRawDx, dragRawDy) > 0.01) attachDraggedGroupToParent(group)
        resetDragState()
        return
      }
      const structured = readLayoutMode(args.schema) === 'radial'
      if (dragActivated && args.simulation && !structured && !frozen && !event.active) {
        args.simulation.alphaTarget(0)
      }
      try {
        endForceTune?.()
      } catch {
        void 0
      } finally {
        endForceTune = null
      }
      if (dragActivated) {
        for (const node of dragNodes) {
          if (!structured && !frozen) {
            node.fx = null
            node.fy = null
          }
          node.vx = 0
          node.vy = 0
        }
        if (structured && args.simulation) args.simulation.stop()
        if (Math.hypot(dragRawDx, dragRawDy) > 0.01) attachDraggedGroupToParent(group)
      }
      resetDragState()
    })

  args.labelSelection.call(dragBehavior as unknown as d3.DragBehavior<SVGTextElement, T, unknown>)
}
