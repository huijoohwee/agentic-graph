import * as d3 from 'd3'
import type { GraphNode, GraphEdge, GraphData } from '@/lib/graph/types'
import type { GraphSchema } from '@/lib/graph/schema'
import { nodeDragBehavior } from '@/components/GraphCanvas/utils'
import { createEdgeScrollController } from '@/lib/canvas/edge-scroll'
import { deriveGraphGroups } from '@/components/GraphCanvas/layout/graphGroups'
import type { GraphGroup } from '@/components/GraphCanvas/layout/graphGroupsTypes'
import { getNodeAabbHalfExtentsWithLabel } from '@/components/GraphCanvas/layout/overlap'
import { clampNodeCenterToRect } from '@/lib/canvas/groupContainment'
import {
  buildDeepestGroupRectByNodeId,
  buildDynamicGroupRectById,
  buildGroupRectByIdFromSchemaOverrides,
} from '@/lib/canvas/groupExplicitBounds'
import { useGraphStore } from '@/hooks/useGraphStore'
import {
  preserveAbsolutePositionForParent,
  selectParentDropTarget,
  type ParentDropCandidate,
} from '@/lib/canvas/parentChildRelation'
import { subgraphIdFromGroupId } from '@/lib/graph/subgraphs'
import { getNodeHalfExtents2d } from '@/components/GraphCanvas/nodeSizing2d'
import {
  alignmentRectFromCenter,
  resolveAlignmentSnap,
  type AlignmentGuide,
} from '@/lib/canvas/alignmentGuides'
import {
  clearGraphAlignmentGuides,
  ensureGraphAlignmentGuideLayer,
  renderGraphAlignmentGuides,
} from '@/components/GraphCanvas/alignmentGuides'
import { readHelperLinesDisplayControlActive } from '@/lib/canvas/canvasGridDisplayControls'

export function bindNodeDraggingWithGroupContainment(args: {
  g: d3.Selection<SVGGElement, unknown, null, undefined>
  nodeSel: d3.Selection<SVGElement, GraphNode, SVGGElement, unknown>
  mediaInteractiveSel: d3.Selection<SVGElement, GraphNode, SVGGElement, unknown> | null
  simulation: d3.Simulation<GraphNode, GraphEdge>
  graphData: GraphData
  schema: GraphSchema
  onCommitNodePosition?: (args: { id: string; x: number; y: number }) => void
  edgeScroll?: { enabled: () => boolean; panByPx: (dx: number, dy: number) => void }
}) {
  const groups = deriveGraphGroups(args.graphData)
  const groupRectById = buildDynamicGroupRectById({
    groups: groups as GraphGroup[],
    graphNodes: args.graphData.nodes as GraphNode[],
    schema: args.schema,
  })
  const explicitGroupRectById = buildGroupRectByIdFromSchemaOverrides({
    groups: groups as GraphGroup[],
    graphNodes: args.graphData.nodes as GraphNode[],
    schema: args.schema,
  })
  explicitGroupRectById.forEach((bounds, groupId) => groupRectById.set(groupId, bounds))
  const nodeGroupBoundsById = buildDeepestGroupRectByNodeId({ groups: groups as GraphGroup[], groupRectById })
  const alignmentLayer = ensureGraphAlignmentGuideLayer(args.g)
  const helperLinesEnabled = readHelperLinesDisplayControlActive(args.schema)
  const stationaryAlignmentRects = (activeNodeId: string) => args.graphData.nodes.flatMap((candidate) => {
    const id = String(candidate.id || '').trim()
    if (!id || id === activeNodeId) return []
    const cx = typeof candidate.x === 'number' && Number.isFinite(candidate.x) ? candidate.x : null
    const cy = typeof candidate.y === 'number' && Number.isFinite(candidate.y) ? candidate.y : null
    if (cx == null || cy == null) return []
    const ext = getNodeHalfExtents2d(candidate, args.schema)
    return [alignmentRectFromCenter({
      id,
      cx,
      cy,
      width: ext.halfW * 2,
      height: ext.halfH * 2,
    })]
  })

  const dragBehavior = nodeDragBehavior(args.simulation, args.schema, {
    clampNodePosition: ({ node, x, y, disableSnap }) => {
      const constraint = args.schema.behavior.dragConstraint || 'free'
      if (constraint === 'none') {
        clearGraphAlignmentGuides(alignmentLayer)
        return { x: node.x, y: node.y }
      }
      let nextX = constraint === 'axis-y' ? node.x : x
      let nextY = constraint === 'axis-x' ? node.y : y
      const rect = nodeGroupBoundsById.get(String(node.id)) || null
      const containmentExt = getNodeAabbHalfExtentsWithLabel(node, args.schema)
      const clampToParent = (cx: number, cy: number) => {
        if (!rect) return { x: cx, y: cy }
        const clamped = clampNodeCenterToRect({
          cx,
          cy,
          halfW: containmentExt.halfW,
          halfH: containmentExt.halfH,
          rect,
        })
        return { x: clamped.cx, y: clamped.cy }
      }
      const contained = clampToParent(nextX, nextY)
      nextX = contained.x
      nextY = contained.y
      if (disableSnap || !helperLinesEnabled) {
        clearGraphAlignmentGuides(alignmentLayer)
        return { x: nextX, y: nextY }
      }

      const id = String(node.id || '').trim()
      const ext = getNodeHalfExtents2d(node, args.schema)
      const moving = alignmentRectFromCenter({
        id,
        cx: nextX,
        cy: nextY,
        width: ext.halfW * 2,
        height: ext.halfH * 2,
      })
      const svgEl = args.g.node()?.ownerSVGElement
      const scale = svgEl ? d3.zoomTransform(svgEl).k : 1
      const snapped = resolveAlignmentSnap({
        moving,
        stationary: stationaryAlignmentRects(id),
        scale,
      })
      const alignedX = constraint === 'axis-y' ? nextX : nextX + snapped.dx
      const alignedY = constraint === 'axis-x' ? nextY : nextY + snapped.dy
      const finalPosition = clampToParent(alignedX, alignedY)
      const guides: AlignmentGuide[] = snapped.guides.filter(guide => (
        guide.axis === 'x'
          ? constraint !== 'axis-y' && Math.abs(finalPosition.x - alignedX) < 1e-6
          : constraint !== 'axis-x' && Math.abs(finalPosition.y - alignedY) < 1e-6
      ))
      if (svgEl) {
        renderGraphAlignmentGuides({ layer: alignmentLayer, svgEl, guides })
      } else {
        clearGraphAlignmentGuides(alignmentLayer)
      }
      return finalPosition
    },
    onNodeDragEnd: (d) => {
      clearGraphAlignmentGuides(alignmentLayer)
      const id = String(d.id || '').trim()
      let x = typeof d.x === 'number' && Number.isFinite(d.x) ? d.x : null
      let y = typeof d.y === 'number' && Number.isFinite(d.y) ? d.y : null
      if (!id || x == null || y == null) return
      const candidates: ParentDropCandidate[] = []
      args.g
        .selectAll<SVGGraphicsElement, GraphGroup>('g[data-kg-layer="groups"] > g[data-kg-group-id]')
        .each(function (group) {
          if (group?.source !== 'userSubgraph') return
          const groupId = String(group.id || '').trim()
          const subgraphId = subgraphIdFromGroupId(groupId)
          if (!groupId || !subgraphId) return
          try {
            const bounds = this.getBBox()
            if (!(bounds.width > 0 && bounds.height > 0)) return
            candidates.push({
              groupId,
              subgraphId,
              depth: group.depth,
              memberNodeIds: group.memberNodeIds,
              bounds: {
                minX: bounds.x,
                minY: bounds.y,
                maxX: bounds.x + bounds.width,
                maxY: bounds.y + bounds.height,
              },
            })
          } catch {
            void 0
          }
        })
      const ext = getNodeAabbHalfExtentsWithLabel(d, args.schema)
      const target = selectParentDropTarget({
        nodeId: id,
        nodeBounds: {
          minX: x - ext.halfW,
          minY: y - ext.halfH,
          maxX: x + ext.halfW,
          maxY: y + ext.halfH,
        },
        candidates,
      })
      const position = target
        ? preserveAbsolutePositionForParent({ x, y }, target.bounds)
        : null
      if (target && position) {
        x = position.absolute.x
        y = position.absolute.y
        d.x = x
        d.y = y
      }
      try {
        args.onCommitNodePosition?.({ id, x, y })
      } catch {
        void 0
      }
      if (target && position) {
        const state = useGraphStore.getState()
        const result = state.attachNodeToUserSubgraph(target.subgraphId, id)
        if (result.ok === false) {
          state.pushUiToast({
            id: 'parent-child-attach-error',
            kind: 'error',
            message: result.message,
          })
        }
      }
    },
  })

  if (args.edgeScroll) {
    const edgeScroll = createEdgeScrollController()
    dragBehavior.on('start.kgEdgeScroll', () => edgeScroll.reset())
    dragBehavior.on('drag.kgEdgeScroll', (event: unknown) => {
      if (!args.edgeScroll) return
      if (!args.edgeScroll.enabled()) {
        edgeScroll.reset()
        return
      }
      const ev = event as { sourceEvent?: unknown }
      const src = ev?.sourceEvent as { clientX?: unknown; clientY?: unknown; pointerType?: unknown } | undefined
      const clientX = typeof src?.clientX === 'number' ? src.clientX : NaN
      const clientY = typeof src?.clientY === 'number' ? src.clientY : NaN
      if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) return
      const svgEl = args.g.node()?.ownerSVGElement
      if (!svgEl) return
      const rect = svgEl.getBoundingClientRect()
      const sx = clientX - rect.left
      const sy = clientY - rect.top
      const d = edgeScroll.update({
        nowMs: Date.now(),
        pointer: {
          sx,
          sy,
          kind: src?.pointerType === 'touch' ? 'touch' : src?.pointerType === 'pen' ? 'pen' : 'mouse',
        },
        viewport: { w: rect.width, h: rect.height },
        zoomK: d3.zoomTransform(svgEl).k || 1,
        enabled: true,
      })
      if (Math.abs(d.dx) > 1e-6 || Math.abs(d.dy) > 1e-6) {
        args.edgeScroll.panByPx(d.dx, d.dy)
      }
    })
    dragBehavior.on('end.kgEdgeScroll', () => edgeScroll.reset())
  }

  args.nodeSel.call(dragBehavior as d3.DragBehavior<SVGElement, GraphNode, unknown>)
  if (args.mediaInteractiveSel) {
    args.mediaInteractiveSel.call(dragBehavior as d3.DragBehavior<SVGElement, GraphNode, unknown>)
  }
}
