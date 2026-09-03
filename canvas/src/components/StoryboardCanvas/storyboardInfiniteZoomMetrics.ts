import * as d3 from 'd3'
import type { GraphData, GraphNode } from '@/lib/graph/types'
import { computeBoundedOverlayPaintScale } from '@/lib/canvas/overlayWidgetZoom'
import {
  GRAPH_ELEMENT_FIT_ROLE_BOUNDS_ONLY,
  GRAPH_ELEMENT_FIT_ROLE_PROPERTY,
} from '@/lib/canvas/graph-elements/fitRoles'

export const STORYBOARD_CANVAS_PADDING_PX = 16
export const STORYBOARD_FIT_NODE_ID = '__agentic_os_storyboard_board__'

export type StoryboardInfiniteMetrics = {
  graphData: GraphData
  height: number
  signature: string
  signatureKey: string
  width: number
}

export const buildStoryboardTransform = (value: { k?: unknown; x?: unknown; y?: unknown } | null | undefined): d3.ZoomTransform => {
  const k = typeof value?.k === 'number' && Number.isFinite(value.k) && value.k > 0 ? value.k : 1
  const x = typeof value?.x === 'number' && Number.isFinite(value.x) ? value.x : STORYBOARD_CANVAS_PADDING_PX
  const y = typeof value?.y === 'number' && Number.isFinite(value.y) ? value.y : STORYBOARD_CANVAS_PADDING_PX
  return d3.zoomIdentity.translate(x, y).scale(k)
}

export const isSameStoryboardTransform = (a: d3.ZoomTransform, b: d3.ZoomTransform): boolean =>
  Math.abs(a.k - b.k) < 1e-6 && Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.y - b.y) < 1e-6

export const resolveStoryboardPaintScale = (zoomK: number): number =>
  computeBoundedOverlayPaintScale(zoomK)

export const buildStoryboardTransformCss = (transform: d3.ZoomTransform): string =>
  `translate(${transform.x}px, ${transform.y}px) scale(${resolveStoryboardPaintScale(transform.k)})`

export const buildStoryboardTransformKey = (transform: d3.ZoomTransform): string =>
  `${transform.x.toFixed(3)}:${transform.y.toFixed(3)}:${transform.k.toFixed(5)}`

const readFinitePositive = (value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback

const hashStoryboardMetricSignature = (value: string): string => {
  let hash = 2166136261
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(36)
}

function readCardRectRelativeToContent(args: {
  cardElement: HTMLElement
  contentElement: HTMLElement
  readContentRect: () => DOMRect | undefined
  scale: number
}): { left: number; top: number; width: number; height: number } {
  const { cardElement, contentElement } = args
  let left = 0
  let top = 0
  let cursor: HTMLElement | null = cardElement
  while (cursor && cursor !== contentElement) {
    left += cursor.offsetLeft || 0
    top += cursor.offsetTop || 0
    cursor = cursor.offsetParent as HTMLElement | null
  }
  const width = readFinitePositive(cardElement.offsetWidth, 0)
  const height = readFinitePositive(cardElement.offsetHeight, 0)
  if (cursor === contentElement && width > 0 && height > 0) return { left, top, width, height }

  const contentRect = args.readContentRect()
  const cardRect = cardElement.getBoundingClientRect()
  const scale = readFinitePositive(args.scale, 1)
  return {
    left: contentRect ? (cardRect.left - contentRect.left) / scale : 0,
    top: contentRect ? (cardRect.top - contentRect.top) / scale : 0,
    width: Math.max(1, cardRect.width / scale),
    height: Math.max(1, cardRect.height / scale),
  }
}

export function readStoryboardInfiniteMetrics(contentElement: HTMLElement | null, scale: number): StoryboardInfiniteMetrics {
  const safeScale = readFinitePositive(scale, 1)
  let contentRect: DOMRect | undefined
  const readContentRect = () => {
    if (!contentElement) return undefined
    if (!contentRect) contentRect = contentElement.getBoundingClientRect()
    return contentRect
  }
  const readContentSize = (): { width: number; height: number } => {
    if (!contentElement) return { width: 1, height: 1 }
    const width = contentElement.scrollWidth || contentElement.offsetWidth
    const height = contentElement.scrollHeight || contentElement.offsetHeight
    if (width > 0 && height > 0) return { width, height }
    const rect = readContentRect()
    return {
      width: (rect?.width || 1) / safeScale,
      height: (rect?.height || 1) / safeScale,
    }
  }
  const contentSize = readContentSize()
  const width = Math.max(1, Math.ceil(contentSize.width))
  const height = Math.max(1, Math.ceil(contentSize.height))
  const signatureParts = [`board:${width}x${height}`]
  const nodes: GraphNode[] = [{
    id: STORYBOARD_FIT_NODE_ID,
    label: 'Storyboard board',
    type: 'StoryboardBoard',
    x: width / 2,
    y: height / 2,
    properties: {
      'visual:height': height,
      [GRAPH_ELEMENT_FIT_ROLE_PROPERTY]: GRAPH_ELEMENT_FIT_ROLE_BOUNDS_ONLY,
      'visual:shape': 'rect',
      'visual:width': width,
    } as GraphNode['properties'],
  } as GraphNode]

  if (contentElement) {
    const cardElements = Array.from(contentElement.querySelectorAll<HTMLElement>('[data-kg-storyboard-card-id]'))
    for (const cardElement of cardElements) {
      const id = String(cardElement.getAttribute('data-kg-storyboard-card-id') || '').trim()
      if (!id) continue
      const rect = readCardRectRelativeToContent({ cardElement, contentElement, readContentRect, scale: safeScale })
      const cardWidth = Math.max(1, rect.width)
      const cardHeight = Math.max(1, rect.height)
      signatureParts.push(`${id}:${Math.round(rect.left)},${Math.round(rect.top)},${Math.round(cardWidth)}x${Math.round(cardHeight)}`)
      nodes.push({
        id,
        label: id,
        type: 'StoryboardCard',
        x: rect.left + cardWidth / 2,
        y: rect.top + cardHeight / 2,
        properties: {
          'visual:height': cardHeight,
          'visual:shape': 'rect',
          'visual:width': cardWidth,
        } as GraphNode['properties'],
      } as GraphNode)
    }
  }

  const signature = signatureParts.join('|')
  return {
    graphData: {
      context: 'Storyboard infinite canvas',
      type: 'Graph',
      nodes,
      edges: [],
      metadata: { kind: 'storyboard-infinite-canvas' },
    } as GraphData,
    height,
    signature,
    signatureKey: hashStoryboardMetricSignature(signature),
    width,
  }
}
