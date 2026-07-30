import { screenToWorld, worldToScreen } from '@/lib/zoom/viewport'
import {
  computeBalancedSpreadBaseGapPx,
  computeBalancedSpreadViewportMargins,
  type BalancedSpreadViewportPreset,
} from '@/lib/ui/overlayBalancedSpread'
import {
  finitePositiveStoryboardWidgetRunSize,
  type StoryboardWidgetRunExecutionAnchorSnapshot,
} from './storyboardWidgetRunExecutionAnchorSnapshot'

export {
  buildStoryboardWidgetRunExecutionAnchorSnapshot,
} from './storyboardWidgetRunExecutionAnchorSnapshot'
export type {
  StoryboardWidgetRunExecutionAnchorSnapshot,
} from './storyboardWidgetRunExecutionAnchorSnapshot'

export type StoryboardWidgetRunMaterializationItemProjection = {
  width: number
  height: number
  worldPositionMode?: 'top-left' | 'center'
}

export const STORYBOARD_WIDGET_RUN_COORDINATOR_FANOUT_TOPOLOGY_MODE =
  'coordinator-fanout-rightward-top-down' as const

export type StoryboardWidgetRunCoordinatorFanoutTopology = {
  mode: typeof STORYBOARD_WIDGET_RUN_COORDINATOR_FANOUT_TOPOLOGY_MODE
  coordinatorItemIndex: number
  fanoutItemIndices: readonly number[]
}

export const STORYBOARD_WIDGET_RUN_MATERIALIZATION_LAYOUT_MODE =
  'visible-viewport-balanced' as const
export const STORYBOARD_WIDGET_RUN_MATERIALIZATION_LAYOUT_VERSION = 3 as const
export const STORYBOARD_WIDGET_RUN_MATERIALIZATION_LAYOUT_MODE_PROPERTY =
  'workflowMaterializationLayoutMode' as const
export const STORYBOARD_WIDGET_RUN_MATERIALIZATION_LAYOUT_VERSION_PROPERTY =
  'workflowMaterializationLayoutVersion' as const

type StoryboardWidgetRunMaterializationPlannerBaseArgs = {
  snapshot: StoryboardWidgetRunExecutionAnchorSnapshot
  gridSize?: number
  preset?: BalancedSpreadViewportPreset
}

export type StoryboardWidgetRunHeterogeneousMaterializationPlannerArgs =
  StoryboardWidgetRunMaterializationPlannerBaseArgs & {
    items: readonly StoryboardWidgetRunMaterializationItemProjection[]
    sourceItem?: Pick<StoryboardWidgetRunMaterializationItemProjection, 'width' | 'height'>
    topology?: StoryboardWidgetRunCoordinatorFanoutTopology
  }

export type StoryboardWidgetRunLegacyMaterializationPlannerArgs =
  StoryboardWidgetRunMaterializationPlannerBaseArgs & {
    count: number
    itemWidth: number
    itemHeight: number
  }

type NormalizedMaterializationProjection = {
  width: number
  height: number
  worldPositionMode: 'top-left' | 'center'
}

type ScreenLayoutRect = {
  left: number
  top: number
  width: number
  height: number
}

const normalizeMaterializationProjection = (
  item: StoryboardWidgetRunMaterializationItemProjection,
): NormalizedMaterializationProjection => ({
  width: Math.max(1, Number(item.width) || 1),
  height: Math.max(1, Number(item.height) || 1),
  worldPositionMode: item.worldPositionMode === 'center' ? 'center' : 'top-left',
})

const rectIntersectionArea = (left: ScreenLayoutRect, right: ScreenLayoutRect): number => (
  Math.max(
    0,
    Math.min(left.left + left.width, right.left + right.width)
      - Math.max(left.left, right.left),
  )
  * Math.max(
    0,
    Math.min(left.top + left.height, right.top + right.height)
      - Math.max(left.top, right.top),
  )
)

const rectOverflowArea = (
  rect: ScreenLayoutRect,
  bounds: { left: number; top: number; right: number; bottom: number },
): number => {
  const area = Math.max(1, rect.width) * Math.max(1, rect.height)
  const intersectionWidth = Math.max(
    0,
    Math.min(rect.left + rect.width, bounds.right) - Math.max(rect.left, bounds.left),
  )
  const intersectionHeight = Math.max(
    0,
    Math.min(rect.top + rect.height, bounds.bottom) - Math.max(rect.top, bounds.top),
  )
  return Math.max(0, area - intersectionWidth * intersectionHeight)
}

const fitMaterializationTranslation = (
  desired: number,
  min: number,
  max: number,
): number => (
  min <= max
    ? Math.max(min, Math.min(max, desired))
    : (min + max) / 2
)

const normalizeCoordinatorFanoutTopology = (
  topology: StoryboardWidgetRunCoordinatorFanoutTopology | null | undefined,
  itemCount: number,
): {
  coordinatorItemIndex: number
  fanoutItemIndices: number[]
} | null => {
  if (
    topology?.mode !== STORYBOARD_WIDGET_RUN_COORDINATOR_FANOUT_TOPOLOGY_MODE
    || !Number.isInteger(topology.coordinatorItemIndex)
    || topology.coordinatorItemIndex < 0
    || topology.coordinatorItemIndex >= itemCount
  ) return null
  const fanoutItemIndices = Array.from(topology.fanoutItemIndices || [])
  const topologyItemIndices = [topology.coordinatorItemIndex, ...fanoutItemIndices]
  if (
    topologyItemIndices.length !== itemCount
    || topologyItemIndices.some(index => (
      !Number.isInteger(index)
      || index < 0
      || index >= itemCount
    ))
    || new Set(topologyItemIndices).size !== itemCount
  ) return null
  return {
    coordinatorItemIndex: topology.coordinatorItemIndex,
    fanoutItemIndices,
  }
}

export function planStoryboardWidgetRunMaterializationPositions(
  args: StoryboardWidgetRunHeterogeneousMaterializationPlannerArgs,
): Array<{ x: number; y: number }>
export function planStoryboardWidgetRunMaterializationPositions(
  args: StoryboardWidgetRunLegacyMaterializationPlannerArgs,
): Array<{ x: number; y: number }>
export function planStoryboardWidgetRunMaterializationPositions(
  args:
    | StoryboardWidgetRunHeterogeneousMaterializationPlannerArgs
    | StoryboardWidgetRunLegacyMaterializationPlannerArgs,
): Array<{ x: number; y: number }> {
  const materializedItems: NormalizedMaterializationProjection[] = 'items' in args
    ? args.items.map(normalizeMaterializationProjection)
    : Array.from(
        { length: Math.max(0, Math.floor(Number(args.count) || 0)) },
        () => normalizeMaterializationProjection({
          width: args.itemWidth,
          height: args.itemHeight,
        }),
      )
  const count = materializedItems.length
  if (count === 0) return []
  const viewport = args.snapshot.visibleViewport
  const transform = args.snapshot.transform
  const zoomK = Math.max(0.001, Number.isFinite(transform.k) ? transform.k : 1)
  const paintScale = Math.max(
    0.001,
    Number.isFinite(args.snapshot.paintScale) ? args.snapshot.paintScale : zoomK,
  )
  const viewportW = Math.max(1, Number(viewport.width) || 1)
  const viewportH = Math.max(1, Number(viewport.height) || 1)
  const preset = args.preset || 'richMedia'
  const margins = computeBalancedSpreadViewportMargins({ viewportW, viewportH, preset })
  const gapPx = computeBalancedSpreadBaseGapPx({ viewportW, viewportH, preset, margins })
  const screenGridSize = Math.max(1, Number(args.gridSize) || 1) * zoomK
  const derivedAnchorScreen = worldToScreen({
    transform,
    x: args.snapshot.world.x,
    y: args.snapshot.world.y,
  })
  const anchorScreen = args.snapshot.screen || {
    left: derivedAnchorScreen.sx,
    top: derivedAnchorScreen.sy,
  }
  const anchorLocal = {
    left: anchorScreen.left - viewport.left,
    top: anchorScreen.top - viewport.top,
  }
  const legacySource = 'items' in args
    ? args.sourceItem
    : { width: args.itemWidth, height: args.itemHeight }
  const sourceNaturalSize = finitePositiveStoryboardWidgetRunSize(legacySource)
    ? legacySource
    : materializedItems[0]!
  const sourceScreenSize = {
    width: typeof anchorScreen.width === 'number'
      && Number.isFinite(anchorScreen.width)
      && anchorScreen.width > 0
      ? anchorScreen.width
      : Math.max(1, sourceNaturalSize.width * paintScale),
    height: typeof anchorScreen.height === 'number'
      && Number.isFinite(anchorScreen.height)
      && anchorScreen.height > 0
      ? anchorScreen.height
      : Math.max(1, sourceNaturalSize.height * paintScale),
  }
  const projectedItems = materializedItems.map(item => ({
    ...item,
    screenWidth: item.width * paintScale,
    screenHeight: item.height * paintScale,
  }))
  const totalItemCount = count + 1
  const snap = (value: number) => Math.round(value / screenGridSize) * screenGridSize
  const usableW = Math.max(1, viewportW - margins.left - margins.right)
  const usableH = Math.max(1, viewportH - margins.top - margins.bottom)
  const projectPlacementsToWorld = (
    placements: Array<ScreenLayoutRect & { itemIndex: number }>,
  ): Array<{ x: number; y: number }> => placements
    .slice()
    .sort((left, right) => left.itemIndex - right.itemIndex)
    .map(rect => {
      const item = materializedItems[rect.itemIndex]!
      const centerWorld = screenToWorld({
        transform,
        sx: viewport.left + rect.left + rect.width / 2,
        sy: viewport.top + rect.top + rect.height / 2,
      })
      return item.worldPositionMode === 'center'
        ? centerWorld
        : {
            x: centerWorld.x - item.width / 2,
            y: centerWorld.y - item.height / 2,
          }
    })
  const coordinatorFanoutTopology = 'items' in args
    ? normalizeCoordinatorFanoutTopology(args.topology, count)
    : null
  if (coordinatorFanoutTopology) {
    // Prefer three semantic stages when they fit:
    // source -> coordinator -> an ordered, top-down fanout column.
    const coordinator = projectedItems[coordinatorFanoutTopology.coordinatorItemIndex]!
    const fanout = coordinatorFanoutTopology.fanoutItemIndices.map(itemIndex => ({
      itemIndex,
      item: projectedItems[itemIndex]!,
    }))
    const clampStackTop = (desired: number, stackHeight: number): number => (
      fitMaterializationTranslation(
        desired,
        margins.top,
        viewportH - margins.bottom - stackHeight,
      )
    )
    const fanoutStackHeight = fanout.reduce(
      (sum, entry) => sum + entry.item.screenHeight,
      0,
    ) + gapPx * Math.max(0, fanout.length - 1)
    const fanoutStackCenter = anchorLocal.top + sourceScreenSize.height / 2
    const coordinatorLeft = snap(anchorLocal.left + sourceScreenSize.width + gapPx)
    const coordinatorTop = snap(
      anchorLocal.top + (sourceScreenSize.height - coordinator.screenHeight) / 2,
    )
    const fanoutLeft = snap(coordinatorLeft + coordinator.screenWidth + gapPx)
    let strictFanoutTop = snap(clampStackTop(
      fanoutStackCenter - fanoutStackHeight / 2,
      fanoutStackHeight,
    ))
    const strictPlacements: Array<ScreenLayoutRect & { itemIndex: number }> = [{
      itemIndex: coordinatorFanoutTopology.coordinatorItemIndex,
      left: coordinatorLeft,
      top: coordinatorTop,
      width: coordinator.screenWidth,
      height: coordinator.screenHeight,
    }]
    for (const entry of fanout) {
      strictPlacements.push({
        itemIndex: entry.itemIndex,
        left: fanoutLeft,
        top: strictFanoutTop,
        width: entry.item.screenWidth,
        height: entry.item.screenHeight,
      })
      strictFanoutTop += entry.item.screenHeight + gapPx
    }

    // A natural-size 100% viewport may not fit three complete columns. Keep
    // the source stable and collapse only the downstream stages into one
    // rightward, top-down column rather than changing camera or card scale.
    const downstreamStack = [
      {
        itemIndex: coordinatorFanoutTopology.coordinatorItemIndex,
        item: coordinator,
      },
      ...fanout,
    ]
    const downstreamStackHeight = downstreamStack.reduce(
      (sum, entry) => sum + entry.item.screenHeight,
      0,
    ) + gapPx * Math.max(0, downstreamStack.length - 1)
    let compactTop = snap(clampStackTop(
      anchorLocal.top + sourceScreenSize.height / 2 - downstreamStackHeight / 2,
      downstreamStackHeight,
    ))
    const compactPlacements = downstreamStack.map(entry => {
      const rect = {
        itemIndex: entry.itemIndex,
        left: coordinatorLeft,
        top: compactTop,
        width: entry.item.screenWidth,
        height: entry.item.screenHeight,
      }
      compactTop += entry.item.screenHeight + gapPx
      return rect
    })
    const occupiedSource: ScreenLayoutRect = {
      left: anchorLocal.left,
      top: anchorLocal.top,
      width: sourceScreenSize.width,
      height: sourceScreenSize.height,
    }
    const topologyCandidateScore = (
      placements: Array<ScreenLayoutRect & { itemIndex: number }>,
    ): number => {
      const sourceOverlap = placements.reduce(
        (sum, rect) => sum + rectIntersectionArea(rect, occupiedSource),
        0,
      )
      const pairOverlap = placements.reduce((sum, rect, index) => (
        sum + placements.slice(index + 1).reduce(
          (pairSum, other) => pairSum + rectIntersectionArea(rect, other),
          0,
        )
      ), 0)
      const viewportOverflow = placements.reduce(
        (sum, rect) => sum + rectOverflowArea(rect, {
          left: 0,
          top: 0,
          right: viewportW,
          bottom: viewportH,
        }),
        0,
      )
      const marginOverflow = placements.reduce(
        (sum, rect) => sum + rectOverflowArea(rect, {
          left: margins.left,
          top: margins.top,
          right: viewportW - margins.right,
          bottom: viewportH - margins.bottom,
        }),
        0,
      )
      return (
        (sourceOverlap + pairOverlap) * 1_000_000_000
        + viewportOverflow * 1_000_000
        + marginOverflow * 1_000
      )
    }
    const strictScore = topologyCandidateScore(strictPlacements)
    const compactScore = topologyCandidateScore(compactPlacements)
    return projectPlacementsToWorld(
      strictScore <= compactScore ? strictPlacements : compactPlacements,
    )
  }
  const targetAspect = Math.max(0.5, Math.min(2.8, viewportW / Math.max(1, viewportH)))
  const candidates: Array<{
    placements: Array<ScreenLayoutRect & { itemIndex: number }>
    score: number
    sourceIndex: number
    columns: number
  }> = []

  // Evaluate each stable row-major topology and each possible source slot.
  // Rows use their actual tallest member and their actual summed widths, so a
  // portrait card does not impose its height on an unrelated Rich Media row.
  for (let columns = 1; columns <= totalItemCount; columns += 1) {
    for (let sourceIndex = 0; sourceIndex < totalItemCount; sourceIndex += 1) {
      let nextItemIndex = 0
      const ordered = Array.from({ length: totalItemCount }, (_, slotIndex) => {
        if (slotIndex === sourceIndex) {
          return {
            itemIndex: -1,
            width: sourceScreenSize.width,
            height: sourceScreenSize.height,
          }
        }
        const itemIndex = nextItemIndex
        nextItemIndex += 1
        const item = projectedItems[itemIndex]!
        return {
          itemIndex,
          width: item.screenWidth,
          height: item.screenHeight,
        }
      })
      const rows = Array.from(
        { length: Math.ceil(totalItemCount / columns) },
        (_, rowIndex) => ordered.slice(rowIndex * columns, (rowIndex + 1) * columns),
      )
      const rowMetrics = rows.map(row => ({
        width: row.reduce((sum, item) => sum + item.width, 0) + gapPx * Math.max(0, row.length - 1),
        height: Math.max(1, ...row.map(item => item.height)),
      }))
      const layoutW = Math.max(1, ...rowMetrics.map(row => row.width))
      const layoutH = rowMetrics.reduce((sum, row) => sum + row.height, 0)
        + gapPx * Math.max(0, rows.length - 1)
      let rowTop = margins.top + Math.max(0, (usableH - layoutH) / 2)
      const baseRects: Array<ScreenLayoutRect & { itemIndex: number }> = []
      rows.forEach((row, rowIndex) => {
        const metrics = rowMetrics[rowIndex]!
        let itemLeft = margins.left + Math.max(0, (usableW - metrics.width) / 2)
        row.forEach(item => {
          baseRects.push({
            itemIndex: item.itemIndex,
            left: snap(itemLeft),
            top: snap(rowTop + (metrics.height - item.height) / 2),
            width: item.width,
            height: item.height,
          })
          itemLeft += item.width + gapPx
        })
        rowTop += metrics.height + gapPx
      })
      const sourceRect = baseRects.find(rect => rect.itemIndex === -1)!
      const minLeft = Math.min(...baseRects.map(rect => rect.left))
      const minTop = Math.min(...baseRects.map(rect => rect.top))
      const maxRight = Math.max(...baseRects.map(rect => rect.left + rect.width))
      const maxBottom = Math.max(...baseRects.map(rect => rect.top + rect.height))
      const dx = fitMaterializationTranslation(
        anchorLocal.left - sourceRect.left,
        margins.left - minLeft,
        viewportW - margins.right - maxRight,
      )
      const dy = fitMaterializationTranslation(
        anchorLocal.top - sourceRect.top,
        margins.top - minTop,
        viewportH - margins.bottom - maxBottom,
      )
      const shiftedRects = baseRects.map(rect => ({
        ...rect,
        left: rect.left + dx,
        top: rect.top + dy,
      }))
      const shiftedSource = shiftedRects.find(rect => rect.itemIndex === -1)!
      const placements = shiftedRects
        .filter((rect): rect is ScreenLayoutRect & { itemIndex: number } => rect.itemIndex >= 0)
        .sort((left, right) => left.itemIndex - right.itemIndex)
      const occupiedSource: ScreenLayoutRect = {
        left: anchorLocal.left,
        top: anchorLocal.top,
        width: sourceScreenSize.width,
        height: sourceScreenSize.height,
      }
      const materializedOverlap = placements.reduce(
        (sum, rect) => sum + rectIntersectionArea(rect, occupiedSource),
        0,
      )
      const pairOverlap = placements.reduce((sum, rect, index) => (
        sum + placements.slice(index + 1).reduce(
          (pairSum, other) => pairSum + rectIntersectionArea(rect, other),
          0,
        )
      ), 0)
      const viewportOverflow = placements.reduce(
        (sum, rect) => sum + rectOverflowArea(rect, {
          left: 0,
          top: 0,
          right: viewportW,
          bottom: viewportH,
        }),
        0,
      )
      const marginOverflow = placements.reduce(
        (sum, rect) => sum + rectOverflowArea(rect, {
          left: margins.left,
          top: margins.top,
          right: viewportW - margins.right,
          bottom: viewportH - margins.bottom,
        }),
        0,
      )
      const residualX = shiftedSource.left - anchorLocal.left
      const residualY = shiftedSource.top - anchorLocal.top
      const layoutAspect = layoutW / Math.max(1, layoutH)
      const aspectPenalty = Math.abs(Math.log(Math.max(0.2, layoutAspect) / targetAspect))
      candidates.push({
        placements,
        sourceIndex,
        columns,
        score:
          (materializedOverlap + pairOverlap) * 1_000_000_000
          + viewportOverflow * 1_000_000
          + marginOverflow * 1_000
          + residualX * residualX
          + residualY * residualY
          + aspectPenalty * 10_000
          + layoutW * layoutH * 0.0001,
      })
    }
  }
  const selected = candidates.reduce((best, candidate) => (
    !best
    || candidate.score < best.score - 1e-9
    || (
      Math.abs(candidate.score - best.score) <= 1e-9
      && (
        candidate.columns < best.columns
        || (candidate.columns === best.columns && candidate.sourceIndex < best.sourceIndex)
      )
    )
      ? candidate
      : best
  ), candidates[0])
  if (!selected) return []
  return projectPlacementsToWorld(selected.placements)
}

export function convertStoryboardWidgetMaterializationTopLeftToFixedCardCenter(args: {
  position: { x: number; y: number }
  itemWidth: number
  itemHeight: number
}): { x: number; y: number } {
  const width = Number.isFinite(args.itemWidth) ? Math.max(0, args.itemWidth) : 0
  const height = Number.isFinite(args.itemHeight) ? Math.max(0, args.itemHeight) : 0
  return {
    x: args.position.x + width / 2,
    y: args.position.y + height / 2,
  }
}

export function buildStoryboardWidgetRunMaterializationLayoutProperties(): Record<string, string | number> {
  return {
    [STORYBOARD_WIDGET_RUN_MATERIALIZATION_LAYOUT_MODE_PROPERTY]:
      STORYBOARD_WIDGET_RUN_MATERIALIZATION_LAYOUT_MODE,
    [STORYBOARD_WIDGET_RUN_MATERIALIZATION_LAYOUT_VERSION_PROPERTY]:
      STORYBOARD_WIDGET_RUN_MATERIALIZATION_LAYOUT_VERSION,
  }
}

export function hasCurrentStoryboardWidgetRunMaterializationLayout(
  properties: Record<string, unknown> | null | undefined,
): boolean {
  return properties?.[STORYBOARD_WIDGET_RUN_MATERIALIZATION_LAYOUT_MODE_PROPERTY]
      === STORYBOARD_WIDGET_RUN_MATERIALIZATION_LAYOUT_MODE
    && Number(properties?.[STORYBOARD_WIDGET_RUN_MATERIALIZATION_LAYOUT_VERSION_PROPERTY])
      === STORYBOARD_WIDGET_RUN_MATERIALIZATION_LAYOUT_VERSION
}
