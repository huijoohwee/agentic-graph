import { DEFAULT_VIEWPORT_CONTROLS_PRESET } from '@/lib/config.viewport-controls'
import { DEFAULT_DRAG_ALPHA_TARGET } from '@/lib/graph/layoutDefaults'
import { CANVAS_WHEEL_ZOOM_CTRL_META_BOOST_MULTIPLIER_DEFAULT } from '@/lib/canvas/zoom-input'
import { CANVAS_INTERACTION_SPEED_MULTIPLIER_DEFAULT, CANVAS_PAN_SPEED_MULTIPLIER_DEFAULT } from '@/lib/canvas/camera-options-2d'
import { FLOW_WHEEL_ZOOM_INCREMENT_MULTIPLIER_DEFAULT, FLOW_WHEEL_ZOOM_SMOOTH_MAX_DURATION_DEFAULT_MS,
  FLOW_WHEEL_ZOOM_SMOOTH_MIN_DURATION_DEFAULT_MS, FLOW_WHEEL_ZOOM_SPEED_MULTIPLIER_DEFAULT } from '@/lib/canvas/flow-zoom-tuning'
import { CANVAS_ASPECT_RATIO_MODE_DEFAULT } from '@/lib/canvas/canvasAspectRatioDisplayControls'
import { defaultSchema } from '@/lib/graph/schema'

type ReadOnlyCanvasState = Record<string, unknown> & {
  schema: typeof defaultSchema
  viewportFitFillRatio: undefined
  canvasPointerMode2d: 'select'
  viewportControlsPreset: typeof DEFAULT_VIEWPORT_CONTROLS_PRESET
}
type Selector<T> = (state: ReadOnlyCanvasState) => T
type ReadOnlyCanvasStore = {
  <T>(selector: Selector<T>): T
  (): ReadOnlyCanvasState
  getState: () => ReadOnlyCanvasState
  subscribe: (listener: () => void) => () => void
  setState: () => void
}

const noChange = () => undefined
const state = Object.freeze({
  schema: defaultSchema,
  viewportFitFillRatio: undefined,
  canvasPointerMode2d: 'select',
  viewportControlsPreset: DEFAULT_VIEWPORT_CONTROLS_PRESET,
  strybldrStoryboardCardAspectMode: CANVAS_ASPECT_RATIO_MODE_DEFAULT,
  graphDragAlphaTarget2d: DEFAULT_DRAG_ALPHA_TARGET,
  wheelZoomCtrlMetaBoostMultiplier: CANVAS_WHEEL_ZOOM_CTRL_META_BOOST_MULTIPLIER_DEFAULT,
  canvasPanSpeedMultiplier: CANVAS_PAN_SPEED_MULTIPLIER_DEFAULT,
  canvasInteractionSpeedMultiplier: CANVAS_INTERACTION_SPEED_MULTIPLIER_DEFAULT,
  flowWheelZoomSpeedMultiplier: FLOW_WHEEL_ZOOM_SPEED_MULTIPLIER_DEFAULT,
  flowWheelZoomIncrementMultiplier: FLOW_WHEEL_ZOOM_INCREMENT_MULTIPLIER_DEFAULT,
  flowWheelZoomSmoothMinDurationMs: FLOW_WHEEL_ZOOM_SMOOTH_MIN_DURATION_DEFAULT_MS,
  flowWheelZoomSmoothMaxDurationMs: FLOW_WHEEL_ZOOM_SMOOTH_MAX_DURATION_DEFAULT_MS,
  selectedGroupId: null,
  clearZoomRequest: noChange,
  setLifecycleStage: noChange,
  selectNodesExpanded: noChange,
  setLayoutPositionsForMode: noChange,
}) as ReadOnlyCanvasState

const useGraphStore = Object.assign(
  <T>(selector?: Selector<T>) => selector ? selector(state) : state,
  { getState: () => state, subscribe: (_listener: () => void) => () => undefined, setState: noChange },
) as ReadOnlyCanvasStore

/** Static, mutation-free Graph renderer state for the standalone observation build only. */
export { useGraphStore }
