import type { GraphSchema } from '@/lib/graph/schema'
import {
  CANVAS_GRID_MAJOR_ALPHA_DEFAULT,
  CANVAS_GRID_MAJOR_WIDTH_PX_DEFAULT,
  CANVAS_GRID_MINOR_ALPHA_DEFAULT,
  CANVAS_GRID_MINOR_WIDTH_PX_DEFAULT,
  clampCanvasGridAlpha,
  clampCanvasGridDotRadiusPx,
  clampCanvasGridMajorEvery,
  clampCanvasGridWidthPx,
  coerceCanvasGridStroke,
  coerceCanvasGridVariant,
} from '@/lib/canvas/canvasGridConfig'
import { SNAP_GRID_SIZE_DEFAULT, coerceSnapGridTuple, type SnapGridTuple } from '@/lib/canvas/snapGridSize'

export const CANVAS_GRID_DISPLAY_CONTROL_ID = 'control:grid' as const
export const SNAP_GRID_DISPLAY_CONTROL_ID = 'control:snapGrid' as const
export const HELPER_LINES_DISPLAY_CONTROL_ID = 'control:helperLines' as const

export const CANVAS_GRID_DISPLAY_CONTROL_TITLE = 'Grid'
export const CANVAS_GRID_DISPLAY_CONTROL_LABEL = 'Grid'
export const CANVAS_GRID_DISPLAY_CONTROL_DESCRIPTION = 'Show canvas grid'

export const SNAP_GRID_DISPLAY_CONTROL_TITLE = 'Snap to Grid'
export const SNAP_GRID_DISPLAY_CONTROL_LABEL = 'Snap'
export const SNAP_GRID_DISPLAY_CONTROL_DESCRIPTION = 'Align drag and keyboard movement to grid'

export const HELPER_LINES_DISPLAY_CONTROL_TITLE = 'Helper Lines'
export const HELPER_LINES_DISPLAY_CONTROL_LABEL = 'Guides'
export const HELPER_LINES_DISPLAY_CONTROL_DESCRIPTION = 'Show alignment guides and snap nodes to nearby nodes'

export type CanvasGridDisplayControlId =
  | typeof CANVAS_GRID_DISPLAY_CONTROL_ID
  | typeof SNAP_GRID_DISPLAY_CONTROL_ID

type GraphBehaviorConfig = NonNullable<GraphSchema['behavior']>
type CanvasGridBehavior = NonNullable<GraphBehaviorConfig['canvasGrid']>

export type CanvasGridBehaviorInput = {
  enabled?: unknown
  variant?: unknown
  majorEvery?: unknown
  dotRadiusPx?: unknown
  minorAlpha?: unknown
  majorAlpha?: unknown
  minorWidthPx?: unknown
  majorWidthPx?: unknown
  minorStroke?: unknown
  majorStroke?: unknown
}

const readBehavior = (schema: GraphSchema | null | undefined): NonNullable<GraphSchema['behavior']> =>
  (schema?.behavior || {}) as NonNullable<GraphSchema['behavior']>

const buildVisibleCanvasGridBehavior = (
  canvasGrid: CanvasGridBehaviorInput | null | undefined,
  enabled: boolean,
): CanvasGridBehavior => {
  const minorStroke = coerceCanvasGridStroke(canvasGrid?.minorStroke) || undefined
  const majorStroke = coerceCanvasGridStroke(canvasGrid?.majorStroke) || undefined
  return {
    ...canvasGrid,
    enabled,
    variant: coerceCanvasGridVariant(canvasGrid?.variant),
    majorEvery: clampCanvasGridMajorEvery(canvasGrid?.majorEvery),
    dotRadiusPx: clampCanvasGridDotRadiusPx(canvasGrid?.dotRadiusPx),
    minorAlpha: clampCanvasGridAlpha(canvasGrid?.minorAlpha, CANVAS_GRID_MINOR_ALPHA_DEFAULT),
    majorAlpha: clampCanvasGridAlpha(canvasGrid?.majorAlpha, CANVAS_GRID_MAJOR_ALPHA_DEFAULT),
    minorWidthPx: clampCanvasGridWidthPx(canvasGrid?.minorWidthPx, CANVAS_GRID_MINOR_WIDTH_PX_DEFAULT),
    majorWidthPx: clampCanvasGridWidthPx(canvasGrid?.majorWidthPx, CANVAS_GRID_MAJOR_WIDTH_PX_DEFAULT),
    minorStroke,
    majorStroke,
  }
}

const readSnapGridSizeForBehaviorPatch = (snapGrid: { size?: unknown } | null | undefined): number | SnapGridTuple => {
  if (Array.isArray(snapGrid?.size)) return coerceSnapGridTuple(snapGrid.size)
  if (typeof snapGrid?.size === 'number' && Number.isFinite(snapGrid.size)) return snapGrid.size
  return SNAP_GRID_SIZE_DEFAULT
}

export const readCanvasGridDisplayControlActive = (schema: GraphSchema | null | undefined): boolean =>
  readBehavior(schema).canvasGrid?.enabled === true

export const readSnapGridDisplayControlActive = (schema: GraphSchema | null | undefined): boolean =>
  readBehavior(schema).snapGrid?.enabled === true

export const readHelperLinesDisplayControlActive = (schema: GraphSchema | null | undefined): boolean =>
  readBehavior(schema).helperLines?.enabled !== false

export const buildCanvasGridVisibilityBehaviorPatch = (
  schema: GraphSchema | null | undefined,
): Partial<GraphSchema['behavior']> => {
  const behavior = readBehavior(schema)
  const canvasGrid = (behavior.canvasGrid || {}) as CanvasGridBehaviorInput
  return {
    canvasGrid: buildVisibleCanvasGridBehavior(canvasGrid, canvasGrid.enabled !== true),
  }
}

export const buildSnapGridBehaviorPatch = (
  schema: GraphSchema | null | undefined,
): Partial<GraphSchema['behavior']> => {
  const behavior = readBehavior(schema)
  const snapGrid = (behavior.snapGrid || {}) as { enabled?: boolean; size?: unknown }
  return {
    snapGrid: {
      ...snapGrid,
      enabled: snapGrid.enabled !== true,
      size: readSnapGridSizeForBehaviorPatch(snapGrid),
    },
  }
}

export const buildHelperLinesBehaviorPatch = (
  schema: GraphSchema | null | undefined,
): Partial<GraphSchema['behavior']> => ({
  helperLines: {
    enabled: !readHelperLinesDisplayControlActive(schema),
  },
})
