import { resolveEffectiveFlowWidgetPinnedInCanvas } from '@/lib/storyboardWidget/widgetPlacementAuthority'
import { isStoryboardFixedCardOwnedNode } from '@/components/StoryboardWidgetCanvas/storyboardCardOwnership2d'
import { buildStoryboardBoardModel } from '@/components/StoryboardCanvas/storyboardModel'
import type { WidgetRegistryEntry } from '@/features/storyboard-widget-manager/widgetRegistryTypes'
import { resolveCanvasAspectRatioSize, type CanvasAspectRatioMode } from '@/lib/canvas/canvasAspectRatioDisplayControls'
import { readSnapGridConfigFromSchema, snapPointToGrid } from '@/lib/canvas/gridSnap'
import type { GraphSchema } from '@/lib/graph/schema'
import type { GraphData, GraphNode } from '@/lib/graph/types'
import { readFlowWidgetPinnedInCanvas, type FlowWidgetPinnedById } from '@/lib/storyboardWidget/flowWidgetPinnedState'
import { isProbeTreeLayoutOwnedNode } from '@/lib/storyboardWidget/probeTreeLayoutContract'
import { RICH_MEDIA_PANEL_DEFAULT_WIDTH_PX } from '@/lib/render/richMediaPanelDefaults'
import { readStableRichMediaPanelSize } from '@/lib/render/mediaPanelLayout'

const DEFAULT_GRID_GAP = 64

export type StoryboardCardPlacement = {
  x: number
  y: number
}

type ReadStoryboardPlacementSize = (node: GraphNode) => { width: number; height: number }

export const readStoryboardCardSize2d = (node: GraphNode, aspectRatioMode: CanvasAspectRatioMode): { width: number; height: number } => {
  const defaultSize = readDefaultStoryboardCardSize2d(aspectRatioMode)
  const props = (node.properties || {}) as Record<string, unknown>
  const stablePanelSize = readStableRichMediaPanelSize(props, aspectRatioMode)
  if (!stablePanelSize) return defaultSize
  return { width: stablePanelSize.w, height: stablePanelSize.h }
}

export const readStoryboardWidgetPlacementSize2d = (node: GraphNode, aspectRatioMode: CanvasAspectRatioMode): { width: number; height: number } => {
  return readStoryboardCardSize2d(node, aspectRatioMode)
}

export const readDefaultStoryboardCardSize2d = (aspectRatioMode: CanvasAspectRatioMode): { width: number; height: number } =>
  resolveCanvasAspectRatioSize({
    defaultWidth: RICH_MEDIA_PANEL_DEFAULT_WIDTH_PX,
    mode: aspectRatioMode,
  })

export const readStoryboardCardCenter2d = (node: GraphNode | undefined): StoryboardCardPlacement | null => {
  if (!node) return null
  const x = typeof node.x === 'number' && Number.isFinite(node.x) ? node.x : null
  const y = typeof node.y === 'number' && Number.isFinite(node.y) ? node.y : null
  return x == null || y == null ? null : { x, y }
}

const ceilToStep = (value: number, step: number): number => {
  const v = Number.isFinite(value) ? Math.max(1, value) : 1
  const s = Number.isFinite(step) ? Math.max(1, step) : 1
  return Math.ceil(v / s) * s
}

const buildStoryboardCardPlacements2d = (args: {
  aspectRatioMode: CanvasAspectRatioMode
  board: ReturnType<typeof buildStoryboardBoardModel>
  flowWidgetPinnedByNodeId?: FlowWidgetPinnedById | null
  includeUnpinned: boolean
  nodeById: Map<string, GraphNode>
  readPlacementSize?: ReadStoryboardPlacementSize
  schema: GraphSchema | null | undefined
}): Map<string, StoryboardCardPlacement> => {
  const { aspectRatioMode, board, flowWidgetPinnedByNodeId, includeUnpinned, nodeById, schema } = args
  const readPlacementSize = args.readPlacementSize || ((node: GraphNode) => readStoryboardCardSize2d(node, aspectRatioMode))
  const out = new Map<string, StoryboardCardPlacement>()
  const orderedCards = board.lanes
    .flatMap(lane => lane.cards)
    .filter(card => isStoryboardFixedCardOwnedNode(nodeById.get(card.id)))
    .filter(card => includeUnpinned || readFlowWidgetPinnedInCanvas(flowWidgetPinnedByNodeId, card.id))
  if (orderedCards.length === 0) return out

  const packedCards = orderedCards.filter(card => {
    const node = nodeById.get(card.id)
    if (!node || !isProbeTreeLayoutOwnedNode(node)) return true
    const center = readStoryboardCardCenter2d(node)
    if (center) out.set(card.id, center)
    return center == null
  })
  if (packedCards.length === 0) return out

  const centers: StoryboardCardPlacement[] = []
  const defaultSize = readDefaultStoryboardCardSize2d(aspectRatioMode)
  let maxCardWidth: number = defaultSize.width
  let maxCardHeight: number = defaultSize.height
  for (let i = 0; i < packedCards.length; i += 1) {
    const node = nodeById.get(packedCards[i]!.id)
    if (!node) continue
    const center = readStoryboardCardCenter2d(node)
    const centerOwnsReferenceOrigin = !includeUnpinned || readFlowWidgetPinnedInCanvas(flowWidgetPinnedByNodeId, packedCards[i]!.id)
    if (center && centerOwnsReferenceOrigin) centers.push(center)
    const size = readPlacementSize(node)
    maxCardWidth = Math.max(maxCardWidth, size.width)
    maxCardHeight = Math.max(maxCardHeight, size.height)
  }

  const origin = centers.length > 0
    ? {
        x: centers.reduce((sum, p) => sum + p.x, 0) / centers.length,
        y: centers.reduce((sum, p) => sum + p.y, 0) / centers.length,
      }
    : { x: 0, y: 0 }
  const grid = readSnapGridConfigFromSchema(schema)
  const gapX = grid.enabled ? Math.max(grid.x * 2, DEFAULT_GRID_GAP) : DEFAULT_GRID_GAP
  const gapY = grid.enabled ? Math.max(grid.y * 2, DEFAULT_GRID_GAP) : DEFAULT_GRID_GAP
  const cellWidth = grid.enabled ? ceilToStep(maxCardWidth + gapX, grid.x) : maxCardWidth + gapX
  const cellHeight = grid.enabled ? ceilToStep(maxCardHeight + gapY, grid.y) : maxCardHeight + gapY
  const cardCount = packedCards.length
  const targetAspect = 16 / 9
  const cellAspect = cellWidth / Math.max(1, cellHeight)
  const columnCount = Math.max(1, Math.min(cardCount, Math.ceil(Math.sqrt(cardCount * targetAspect / cellAspect))))
  const rowCount = Math.max(1, Math.ceil(cardCount / columnCount))
  const centerLaneOffset = (columnCount - 1) / 2
  const centerRowOffset = (rowCount - 1) / 2

  for (let index = 0; index < packedCards.length; index += 1) {
    const card = packedCards[index]!
    const node = nodeById.get(card.id)
    const size = node ? readPlacementSize(node) : defaultSize
    const columnIndex = index % columnCount
    const rowIndex = Math.floor(index / columnCount)
    const rawCenter = {
      x: origin.x + (columnIndex - centerLaneOffset) * cellWidth,
      y: origin.y + (rowIndex - centerRowOffset) * cellHeight,
    }
    if (!grid.enabled) {
      out.set(card.id, rawCenter)
      continue
    }
    const snappedTopLeft = snapPointToGrid({
      x: rawCenter.x - size.width / 2,
      y: rawCenter.y - size.height / 2,
    }, grid)
    out.set(card.id, {
      x: snappedTopLeft.x + size.width / 2,
      y: snappedTopLeft.y + size.height / 2,
    })
  }
  return out
}

export const buildFixedStoryboardCardPlacements2d = (args: {
  aspectRatioMode: CanvasAspectRatioMode
  board: ReturnType<typeof buildStoryboardBoardModel>
  flowWidgetPinnedByNodeId?: FlowWidgetPinnedById | null
  nodeById: Map<string, GraphNode>
  readPlacementSize?: ReadStoryboardPlacementSize
  schema: GraphSchema | null | undefined
}): Map<string, StoryboardCardPlacement> => buildStoryboardCardPlacements2d({ ...args, includeUnpinned: false })

export const buildFixedStoryboardCardReferencePlacements2d = (args: {
  aspectRatioMode: CanvasAspectRatioMode
  board: ReturnType<typeof buildStoryboardBoardModel>
  flowWidgetPinnedByNodeId?: FlowWidgetPinnedById | null
  nodeById: Map<string, GraphNode>
  readPlacementSize?: ReadStoryboardPlacementSize
  schema: GraphSchema | null | undefined
}): Map<string, StoryboardCardPlacement> => buildStoryboardCardPlacements2d({ ...args, includeUnpinned: true })

export const applyFixedStoryboardCardPlacementsToGraphData2d = (args: {
  aspectRatioMode: CanvasAspectRatioMode
  flowWidgetPinnedByNodeId?: FlowWidgetPinnedById | null
  graphData: GraphData | null
  graphRevision: number
  referencePlacements?: ReadonlyMap<string, StoryboardCardPlacement> | null
  readPlacementSize?: ReadStoryboardPlacementSize
  schema: GraphSchema | null | undefined
  widgetRegistry?: ReadonlyArray<WidgetRegistryEntry> | null
}): GraphData | null => {
  const { aspectRatioMode, graphData, graphRevision, readPlacementSize, schema, widgetRegistry } = args
  const nodes = Array.isArray(graphData?.nodes) ? (graphData!.nodes as GraphNode[]) : []
  if (!graphData || nodes.length === 0) return graphData
  const board = buildStoryboardBoardModel({ graphData, graphRevision, widgetRegistry })
  const nodeById = new Map<string, GraphNode>()
  for (let i = 0; i < nodes.length; i += 1) {
    const node = nodes[i]
    const id = String(node?.id || '').trim()
    if (id) nodeById.set(id, node)
  }
  const placements = args.referencePlacements || buildFixedStoryboardCardReferencePlacements2d({
    aspectRatioMode,
    board,
    flowWidgetPinnedByNodeId: args.flowWidgetPinnedByNodeId,
    nodeById,
    readPlacementSize,
    schema,
  })
  if (placements.size === 0) return graphData
  let changed = false
  const nextNodes = nodes.map(node => {
    const id = String(node?.id || '').trim()
    let placement = id ? placements.get(id) : null
    if (id && isProbeTreeLayoutOwnedNode(node)) {
      placement = readStoryboardCardCenter2d(node) || placement
    }
    if (!placement || !resolveEffectiveFlowWidgetPinnedInCanvas({ graphMetaKind: String(graphData.metadata?.kind || ''), node, pinnedValue: args.flowWidgetPinnedByNodeId?.[id] })) return node
    if (node.x === placement.x && node.y === placement.y) return node
    changed = true
    return { ...node, x: placement.x, y: placement.y } as GraphNode
  })
  return changed ? { ...graphData, nodes: nextNodes } : graphData
}
