import { screenToWorld, worldToScreen } from '@/lib/zoom/viewport'

export type StoryboardWidgetRunExecutionAnchorSnapshot = {
  nodeId: string
  graphMetaKey: string
  authority: 'rendered' | 'screen' | 'world' | 'graph'
  world: { x: number; y: number }
  screen: {
    left: number
    top: number
    width?: number
    height?: number
  } | null
  defaultFixedCardSize?: {
    width: number
    height: number
  }
  paintScale: number
  transform: { k: number; x: number; y: number }
  visibleViewport: {
    left: number
    top: number
    right: number
    bottom: number
    width: number
    height: number
  }
}

const finitePoint = (
  point: { x?: unknown; y?: unknown } | null | undefined,
): point is { x: number; y: number } => (
  !!point
  && typeof point.x === 'number'
  && Number.isFinite(point.x)
  && typeof point.y === 'number'
  && Number.isFinite(point.y)
)

export const finitePositiveStoryboardWidgetRunSize = (
  size: { width?: unknown; height?: unknown } | null | undefined,
): size is { width: number; height: number } => (
  !!size
  && typeof size.width === 'number'
  && Number.isFinite(size.width)
  && size.width > 0
  && typeof size.height === 'number'
  && Number.isFinite(size.height)
  && size.height > 0
)

const finiteScreenRect = (
  rect: {
    left?: unknown
    top?: unknown
    width?: unknown
    height?: unknown
  } | null | undefined,
): rect is { left: number; top: number; width: number; height: number } => (
  !!rect
  && typeof rect.left === 'number'
  && Number.isFinite(rect.left)
  && typeof rect.top === 'number'
  && Number.isFinite(rect.top)
  && finitePositiveStoryboardWidgetRunSize(rect)
)

export function buildStoryboardWidgetRunExecutionAnchorSnapshot(args: {
  nodeId: string
  graphMetaKey: string
  graphPosition?: { x?: unknown; y?: unknown } | null
  liveWorldPosition?: { x?: unknown; y?: unknown } | null
  storedWorldPosition?: { x?: unknown; y?: unknown } | null
  storedScreenPosition?: { left?: unknown; top?: unknown } | null
  screenAuthority: boolean
  worldPositionMode?: 'top-left' | 'center'
  worldPositionSize?: { width?: unknown; height?: unknown } | null
  renderedScreenRect?: {
    left?: unknown
    top?: unknown
    width?: unknown
    height?: unknown
  } | null
  defaultFixedCardSize?: { width?: unknown; height?: unknown } | null
  paintScale?: unknown
  transform?: { k?: unknown; x?: unknown; y?: unknown } | null
  visibleViewport: StoryboardWidgetRunExecutionAnchorSnapshot['visibleViewport']
}): StoryboardWidgetRunExecutionAnchorSnapshot | null {
  const nodeId = String(args.nodeId || '').trim()
  if (!nodeId) return null
  const transform = {
    k: typeof args.transform?.k === 'number' && Number.isFinite(args.transform.k) && args.transform.k > 0
      ? args.transform.k
      : 1,
    x: typeof args.transform?.x === 'number' && Number.isFinite(args.transform.x)
      ? args.transform.x
      : 0,
    y: typeof args.transform?.y === 'number' && Number.isFinite(args.transform.y)
      ? args.transform.y
      : 0,
  }
  const defaultFixedCardSize = finitePositiveStoryboardWidgetRunSize(args.defaultFixedCardSize)
    ? {
        width: args.defaultFixedCardSize.width,
        height: args.defaultFixedCardSize.height,
      }
    : undefined
  const sourceNaturalSize = finitePositiveStoryboardWidgetRunSize(args.worldPositionSize)
    ? args.worldPositionSize
    : defaultFixedCardSize
  const renderedPaintScale = finiteScreenRect(args.renderedScreenRect)
    && finitePositiveStoryboardWidgetRunSize(sourceNaturalSize)
    ? (
        args.renderedScreenRect.width / sourceNaturalSize.width
        + args.renderedScreenRect.height / sourceNaturalSize.height
      ) / 2
    : null
  const paintScale =
    typeof args.paintScale === 'number'
    && Number.isFinite(args.paintScale)
    && args.paintScale > 0
      ? args.paintScale
      : typeof renderedPaintScale === 'number'
        && Number.isFinite(renderedPaintScale)
        && renderedPaintScale > 0
        ? renderedPaintScale
        : transform.k
  if (finiteScreenRect(args.renderedScreenRect)) {
    const renderedCenterWorld = screenToWorld({
      transform,
      sx: args.renderedScreenRect.left + args.renderedScreenRect.width / 2,
      sy: args.renderedScreenRect.top + args.renderedScreenRect.height / 2,
    })
    const world = finitePositiveStoryboardWidgetRunSize(sourceNaturalSize)
      ? {
          x: renderedCenterWorld.x - sourceNaturalSize.width / 2,
          y: renderedCenterWorld.y - sourceNaturalSize.height / 2,
        }
      : screenToWorld({
          transform,
          sx: args.renderedScreenRect.left,
          sy: args.renderedScreenRect.top,
        })
    return {
      nodeId,
      graphMetaKey: String(args.graphMetaKey || '').trim(),
      authority: 'rendered',
      world,
      screen: {
        left: args.renderedScreenRect.left,
        top: args.renderedScreenRect.top,
        width: args.renderedScreenRect.width,
        height: args.renderedScreenRect.height,
      },
      ...(defaultFixedCardSize ? { defaultFixedCardSize } : {}),
      paintScale,
      transform,
      visibleViewport: args.visibleViewport,
    }
  }
  const storedScreen = args.storedScreenPosition
  const hasStoredScreen = (
    typeof storedScreen?.left === 'number'
    && Number.isFinite(storedScreen.left)
    && typeof storedScreen?.top === 'number'
    && Number.isFinite(storedScreen.top)
  )
  if (args.screenAuthority && hasStoredScreen) {
    const world = screenToWorld({
      transform,
      sx: storedScreen.left as number,
      sy: storedScreen.top as number,
    })
    return {
      nodeId,
      graphMetaKey: String(args.graphMetaKey || '').trim(),
      authority: 'screen',
      world,
      screen: { left: storedScreen.left as number, top: storedScreen.top as number },
      ...(defaultFixedCardSize ? { defaultFixedCardSize } : {}),
      paintScale,
      transform,
      visibleViewport: args.visibleViewport,
    }
  }
  const world = finitePoint(args.liveWorldPosition)
    ? args.liveWorldPosition
    : finitePoint(args.storedWorldPosition)
      ? args.storedWorldPosition
      : finitePoint(args.graphPosition)
        ? args.graphPosition
        : null
  if (!world) return null
  const width = typeof args.worldPositionSize?.width === 'number' && Number.isFinite(args.worldPositionSize.width)
    ? Math.max(0, args.worldPositionSize.width)
    : 0
  const height = typeof args.worldPositionSize?.height === 'number' && Number.isFinite(args.worldPositionSize.height)
    ? Math.max(0, args.worldPositionSize.height)
    : 0
  const centerWorld = args.worldPositionMode === 'center'
    ? world
    : { x: world.x + width / 2, y: world.y + height / 2 }
  const topLeftWorld = { x: centerWorld.x - width / 2, y: centerWorld.y - height / 2 }
  const screenCenter = worldToScreen({ transform, x: centerWorld.x, y: centerWorld.y })
  return {
    nodeId,
    graphMetaKey: String(args.graphMetaKey || '').trim(),
    authority: finitePoint(args.liveWorldPosition) || finitePoint(args.storedWorldPosition)
      ? 'world'
      : 'graph',
    world: topLeftWorld,
    screen: {
      left: screenCenter.sx - width * paintScale / 2,
      top: screenCenter.sy - height * paintScale / 2,
      ...(width > 0 && height > 0
        ? { width: width * paintScale, height: height * paintScale }
        : {}),
    },
    ...(defaultFixedCardSize ? { defaultFixedCardSize } : {}),
    paintScale,
    transform,
    visibleViewport: args.visibleViewport,
  }
}
