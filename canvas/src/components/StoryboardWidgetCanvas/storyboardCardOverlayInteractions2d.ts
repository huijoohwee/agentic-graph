import React from 'react'

import { createRafValueScheduler } from '@/lib/react/rafValueScheduler'
import { beginRichMediaPanelResizeDrag, RichMediaPanelResizeHandle } from '@/components/RichMediaPanelResizeHandle'
import { installRichMediaOverlayWheelForwarding, startRichMediaPanelHeaderDrag } from '@/components/RichMediaPanelOverlayDrag'
import { shouldStoryboardWidgetHeaderYieldToInteractiveTarget } from '@/components/StoryboardWidget/storyboardWidgetHeaderInteractiveTarget'
import { isWidgetInnerPanelWheelTarget } from '@/lib/canvas/widgetInnerPanelScrolling'
import { readSnapGridConfigFromSchema, snapPointToGrid } from '@/lib/canvas/gridSnap'
import type { StoryboardWidgetOverlayDragTransform } from '@/lib/storyboardWidget/overlayWorldDrag'
import type { GraphNode, JSONValue } from '@/lib/graph/types'
import type { GraphSchema } from '@/lib/graph/schema'
import { useGraphStore } from '@/hooks/useGraphStore'
import { disableAutoZoomModesForUserGesture } from '@/lib/canvas/auto-zoom-modes'
import {
  clampGroupPanelChildCenter,
  type GroupPanelContainmentBounds,
} from '@/lib/storyboardWidget/groupPanelContainment'

type CardSize = { width: number; height: number }
type CardPoint = { x: number; y: number }

export const isStoryboardHeaderDragBlockedTarget = shouldStoryboardWidgetHeaderYieldToInteractiveTarget

export function StoryboardCardResizeHandle(props: {
  onPointerDown: React.PointerEventHandler<HTMLButtonElement>
}) {
  return React.createElement(RichMediaPanelResizeHandle, { placement: 'panel', onPointerDown: props.onPointerDown })
}

const readPointerWorldPoint = (
  transform: StoryboardWidgetOverlayDragTransform | null,
  clientX: number,
  clientY: number,
): CardPoint => {
  const k = typeof transform?.k === 'number' && Number.isFinite(transform.k) && transform.k > 0 ? transform.k : 1
  const x = typeof transform?.x === 'number' && Number.isFinite(transform.x) ? transform.x : 0
  const y = typeof transform?.y === 'number' && Number.isFinite(transform.y) ? transform.y : 0
  return { x: (clientX - x) / k, y: (clientY - y) / k }
}

const readNodeCenter = (node: GraphNode): CardPoint => ({
  x: typeof node.x === 'number' && Number.isFinite(node.x) ? node.x : 0,
  y: typeof node.y === 'number' && Number.isFinite(node.y) ? node.y : 0,
})

const writeNodeVisualSizePatch = (node: GraphNode, size: CardSize): Partial<GraphNode> => ({
  properties: {
    ...((node.properties || {}) as Record<string, JSONValue>),
    'visual:width': size.width,
    'visual:height': size.height,
  } as Record<string, JSONValue>,
})

export function useStoryboardCardOverlayWheelForwarding(args: {
  getWheelForwardTarget: (() => Element | null) | undefined
  rootRef: React.RefObject<HTMLElement | null>
}) {
  React.useEffect(() => {
    const root = args.rootRef.current
    if (!root || typeof args.getWheelForwardTarget !== 'function') return
    return installRichMediaOverlayWheelForwarding(root, {
      forwardWheelBeforeScrollableTarget: true,
      forwardWheelTo: args.getWheelForwardTarget,
      forwardedFlagKey: '__kgStoryboardCardWheelForwarded',
      shouldForwardWheel: event => !isWidgetInnerPanelWheelTarget(event, root),
      stopPropagationOnForward: true,
      stopPropagationOnPreventZoom: false,
    })
  }, [args.getWheelForwardTarget, args.rootRef])
}

export function useStoryboardCardOverlayInteractions2d(args: {
  addHistory: (label: string) => void
  getTransform: () => StoryboardWidgetOverlayDragTransform | null
  readContainmentBounds?: (nodeId: string) => GroupPanelContainmentBounds | null
  readNodeCenter?: (node: GraphNode) => CardPoint | null
  readNodeSize: (node: GraphNode) => CardSize
  schema: GraphSchema | null | undefined
  setDragVisualOverride?: (id: string, point: CardPoint | null) => void
  updateNode: (id: string, patch: Partial<GraphNode>) => void
}) {
  const resizeSchedulerRef = React.useRef(createRafValueScheduler((next: { el: HTMLElement | null; height: number; id: string; node: GraphNode; width: number }) => {
    if (next.el) {
      next.el.style.width = `${next.width}px`
      next.el.style.height = `${next.height}px`
    }
    args.updateNode(next.id, writeNodeVisualSizePatch(next.node, { width: next.width, height: next.height }))
  }))

  const beginHeaderDrag = React.useCallback((event: React.PointerEvent<HTMLElement>, node: GraphNode) => {
    if (event.button !== 0) return
    const id = String(node.id || '').trim()
    if (!id) return
    const startCenter = args.readNodeCenter?.(node) || readNodeCenter(node)
    const containmentBounds = args.readContainmentBounds?.(id) || null
    const nodeSize = args.readNodeSize(node)
    const startWorld = readPointerWorldPoint(args.getTransform(), event.clientX, event.clientY)
    const grab = { x: startWorld.x - startCenter.x, y: startWorld.y - startCenter.y }
    let latest = startCenter
    disableAutoZoomModesForUserGesture(useGraphStore.getState())
    useGraphStore.getState().setFlowWidgetDraggingNodeId(id)
    const started = startRichMediaPanelHeaderDrag(event.nativeEvent, {
      shouldStartHeaderDrag: native => native.button === 0,
      onHeaderDrag: ({ clientX, clientY }) => {
        const world = readPointerWorldPoint(args.getTransform(), clientX, clientY)
        latest = clampGroupPanelChildCenter({
          bounds: containmentBounds,
          center: { x: world.x - grab.x, y: world.y - grab.y },
          size: nodeSize,
        })
        args.setDragVisualOverride?.(id, latest)
      },
      onHeaderDragEnd: () => {
        const grid = readSnapGridConfigFromSchema(args.schema)
        const snapped = grid.enabled ? snapPointToGrid(latest, grid) : latest
        args.setDragVisualOverride?.(id, snapped)
        args.updateNode(id, { x: snapped.x, y: snapped.y })
        if (useGraphStore.getState().flowWidgetDraggingNodeId === id) useGraphStore.getState().setFlowWidgetDraggingNodeId(null)
        args.addHistory('Storyboard card move')
      },
    }, event.currentTarget)
    if (!started && useGraphStore.getState().flowWidgetDraggingNodeId === id) useGraphStore.getState().setFlowWidgetDraggingNodeId(null)
  }, [args])

  const beginResize = React.useCallback((event: React.PointerEvent<HTMLButtonElement>, node: GraphNode) => {
    if (event.button !== 0) return
    const id = String(node.id || '').trim()
    if (!id) return
    const start = args.readNodeSize(node)
    const x0 = event.clientX
    const y0 = event.clientY
    const root = event.currentTarget.closest('[data-kg-storyboard-fixed-card="1"]') as HTMLElement | null
    let latest = start
    beginRichMediaPanelResizeDrag({
      event,
      onResize: ({ clientX, clientY }) => {
        latest = {
          width: Math.max(160, Math.round(start.width + clientX - x0)),
          height: Math.max(96, Math.round(start.height + clientY - y0)),
        }
        resizeSchedulerRef.current.schedule({ el: root, id, node, width: latest.width, height: latest.height })
      },
      onResizeEnd: () => {
        resizeSchedulerRef.current.flush()
        args.updateNode(id, writeNodeVisualSizePatch(node, latest))
        args.addHistory('Storyboard card resize')
      },
    })
  }, [args])

  return { beginHeaderDrag, beginResize }
}
