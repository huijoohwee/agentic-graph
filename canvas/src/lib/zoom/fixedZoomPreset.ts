import type { GraphState } from '@/hooks/store/types'
import { buildActive2dZoomViewKey } from '@/lib/canvas/active-2d-zoom-view-key'
import { getEffectiveZoomStateForKey } from '@/lib/canvas/zoom-effective'
import { clampScale, safeScaleExtent } from '@/lib/zoom/scaleExtent'
import { computeTransformScaleAboutViewportCenter } from '@/lib/zoom/viewport'

export const FIXED_ZOOM_PRESETS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4] as const

export type FixedZoomPreset = typeof FIXED_ZOOM_PRESETS[number]

export const NATURAL_CANVAS_ZOOM_PRESET: FixedZoomPreset = 1

export function formatFixedZoomPercent(k: unknown): string {
  const value = typeof k === 'number' && Number.isFinite(k) && k > 0 ? k : NATURAL_CANVAS_ZOOM_PRESET
  return `${Math.round(value * 100)}%`
}

function buildZoomViewKey(state: GraphState): string {
  return buildActive2dZoomViewKey({
    canvasRenderMode: state.canvasRenderMode,
    canvas2dRenderer: state.canvas2dRenderer,
    schema: state.schema,
    graphData: state.graphData,
    documentSemanticMode: state.documentSemanticMode,
    frontmatterModeEnabled: state.frontmatterModeEnabled,
    multiDimTableModeEnabled: state.multiDimTableModeEnabled,
    documentStructureBaselineLock: state.documentStructureBaselineLock,
    renderMediaAsNodes: state.renderMediaAsNodes,
    mediaPanelDensity: state.mediaPanelDensity,
    collapsedGroupIds: state.collapsedGroupIds,
    designRendererWebpageLayoutKey: state.designRendererWebpageLayoutKey,
  })
}

export function readFixedZoomScale(state: GraphState): number {
  const zoomState = getEffectiveZoomStateForKey({
    zoomViewKey: buildZoomViewKey(state),
    zoomStateByKey: state.zoomStateByKey,
    zoomState: state.zoomState,
  })
  return typeof zoomState?.k === 'number' && Number.isFinite(zoomState.k) && zoomState.k > 0
    ? zoomState.k
    : NATURAL_CANVAS_ZOOM_PRESET
}

export function computeFixedZoomPresetTransform(args: {
  state: GraphState
  preset: FixedZoomPreset
}): { k: number; x: number; y: number } {
  const state = args.state
  const zoomState = getEffectiveZoomStateForKey({
    zoomViewKey: buildZoomViewKey(state),
    zoomStateByKey: state.zoomStateByKey,
    zoomState: state.zoomState,
  })
  const extent = safeScaleExtent({
    minK: state.schema.performance?.zoom?.minScale ?? 0.001,
    maxK: state.schema.performance?.zoom?.maxScale ?? 8,
  })
  return computeTransformScaleAboutViewportCenter({
    transform: zoomState,
    viewportW: zoomState?.viewportW || state.canvasDims.w,
    viewportH: zoomState?.viewportH || state.canvasDims.h,
    nextK: clampScale(args.preset, extent),
  })
}

export function computeNaturalCanvasInitialTransform(
  state: GraphState,
): { k: number; x: number; y: number } {
  const zoomState = getEffectiveZoomStateForKey({
    zoomViewKey: buildZoomViewKey(state),
    zoomStateByKey: state.zoomStateByKey,
    zoomState: state.zoomState,
  })
  const viewportW = Math.max(1, zoomState?.viewportW || state.canvasDims.w)
  const viewportH = Math.max(1, zoomState?.viewportH || state.canvasDims.h)
  const extent = safeScaleExtent({
    minK: state.schema.performance?.zoom?.minScale ?? 0.001,
    maxK: state.schema.performance?.zoom?.maxScale ?? 8,
  })
  return {
    k: clampScale(NATURAL_CANVAS_ZOOM_PRESET, extent),
    x: viewportW / 2,
    y: viewportH / 2,
  }
}
