import { resolveStoryboardPaintScale } from '@/components/StoryboardCanvas/storyboardInfiniteZoomMetrics'
import { readStoryboardScalar } from '@/components/StoryboardCanvas/storyboardValueReaders'
import { readDefaultStoryboardCardSize2d } from '@/components/StoryboardWidgetCanvas/storyboardCardPlacements2d'
import { buildStoryboardWidgetRunExecutionAnchorSnapshot } from '@/components/StoryboardWidgetCanvas/runtime/storyboardWidgetRunExecutionAnchor'
import { isCanonicalNodeIdEqual, resolveGraphNodeByCanonicalId } from '@/lib/graph/canonicalNodeIds'
import type { GraphData } from '@/lib/graph/types'

export function buildStoryboardRunExecutionAnchorCapture(args: {
  graphData: GraphData | null
  rawNodeId: string
  cardElements: ReadonlyMap<string, HTMLElement>
  viewportElement: HTMLElement | null
  graphMetaKey: string | null
  aspectMode: '16:9' | '9:16'
  transform: { k: number; x: number; y: number }
}) {
  const requestedNodeId = readStoryboardScalar(args.rawNodeId)
  const node = resolveGraphNodeByCanonicalId(args.graphData, requestedNodeId)
  const nodeId = readStoryboardScalar(node?.id || requestedNodeId)
  if (!args.graphData || !node || !nodeId) return null
  const cardElement = Array.from(args.cardElements.entries())
    .find(([cardId]) => isCanonicalNodeIdEqual(cardId, nodeId))?.[1] || null
  const cardRect = cardElement?.getBoundingClientRect() || null
  const viewportRect = args.viewportElement?.getBoundingClientRect() || null
  const viewportWidth = Math.max(
    1,
    Math.floor(Number(
      args.viewportElement?.clientWidth
      || viewportRect?.width
      || (typeof window !== 'undefined' ? window.innerWidth : 1),
    )),
  )
  const viewportHeight = Math.max(
    1,
    Math.floor(Number(
      args.viewportElement?.clientHeight
      || viewportRect?.height
      || (typeof window !== 'undefined' ? window.innerHeight : 1),
    )),
  )
  const hasLiveScreenAnchor = Boolean(cardRect && viewportRect)
  const fixedCardSize = readDefaultStoryboardCardSize2d(args.aspectMode)
  const paintScale = resolveStoryboardPaintScale(args.transform.k)
  return buildStoryboardWidgetRunExecutionAnchorSnapshot({
    nodeId,
    graphMetaKey: args.graphMetaKey || '',
    graphPosition: { x: node.x, y: node.y },
    storedScreenPosition: hasLiveScreenAnchor
      ? {
          left: Number(cardRect!.left) - Number(viewportRect!.left),
          top: Number(cardRect!.top) - Number(viewportRect!.top),
        }
      : null,
    renderedScreenRect: hasLiveScreenAnchor
      ? {
          left: Number(cardRect!.left) - Number(viewportRect!.left),
          top: Number(cardRect!.top) - Number(viewportRect!.top),
          width: Number(cardRect!.width),
          height: Number(cardRect!.height),
        }
      : null,
    defaultFixedCardSize: fixedCardSize,
    paintScale,
    screenAuthority: hasLiveScreenAnchor,
    worldPositionMode: 'center',
    worldPositionSize: fixedCardSize,
    transform: {
      k: paintScale,
      x: args.transform.x - Number(args.viewportElement?.scrollLeft || 0),
      y: args.transform.y - Number(args.viewportElement?.scrollTop || 0),
    },
    visibleViewport: {
      left: 0,
      top: 0,
      right: viewportWidth,
      bottom: viewportHeight,
      width: viewportWidth,
      height: viewportHeight,
    },
  })
}
