import type { GraphEdge, GraphNode } from '@/lib/graph/types'
import type { WidgetRegistryEntry } from '@/features/storyboard-widget-manager/widgetRegistryTypes'
import type { FlowConnectedValuesBySchemaPath } from '@/lib/storyboardWidget/flowDataflow'
import { UI_LABELS } from '@/lib/config'
import { Z_INDEX_GRAPH_OVERLAY_BASE, Z_INDEX_GRAPH_OVERLAY_SELECTED } from '@/lib/ui/zIndex'

export {
  RICH_MEDIA_PANEL_DEFAULT_HEIGHT_PX as RICH_MEDIA_ASPECT_DEFAULT_HEIGHT,
  RICH_MEDIA_PANEL_DEFAULT_VIEW_SIZE,
  RICH_MEDIA_PANEL_DEFAULT_WIDTH_PX as RICH_MEDIA_ASPECT_DEFAULT_WIDTH,
} from '@/lib/render/richMediaPanelDefaults'
export {
  handleWidgetInnerPanelScrollCapture,
  handleWidgetInnerPanelWheelCapture,
} from '@/lib/canvas/widgetInnerPanelScrolling'

export type FlowWidgetOverlayProps = {
  visible?: boolean
  active: boolean
  forceFloating?: boolean
  storyboardWidgetSurfaceId?: string
  editorSurfaceKind?: WidgetEditorSurfaceKind
  overlayCollectiveCount?: number
  node: GraphNode
  nodeById?: ReadonlyMap<string, GraphNode>
  viewportW: number
  viewportH: number
  canvasWindowOffset?: { left: number; top: number } | null
  autoRevealKey?: number
  stackIndex?: number
  getLiveNodeWorldPos?: (nodeId: string) => { x: number; y: number } | null
  getLiveZoomTransform?: () => { k: number; x: number; y: number } | null
  getLiveContainmentGroupAabbForNode?: (nodeId: string) => { groupId: string; minX: number; minY: number; maxX: number; maxY: number } | null
  graphMetaKind?: string | null
  graphMetaKey?: string | null
  portHandleEdges?: ReadonlyArray<GraphEdge>
  registryEntries?: ReadonlyArray<WidgetRegistryEntry>
  connectedValuesBySchemaPath?: FlowConnectedValuesBySchemaPath
  toolMode?: 'select' | 'addEdge'
  pendingEdgeSourceId?: string | null
  zoomViewKey?: string | null
  onBeginAddEdgeFromNode?: (nodeId: string, portKey?: string | null) => void
  onFinalizeAddEdgeToNode?: (nodeId: string, portKey?: string | null) => void
  onSetLabel: (label: string) => void
  onSetType: (type: string) => void
  onPatchProperties: (patch: Record<string, unknown>) => void
  onSetProperties: (properties: Record<string, unknown>) => void
  onValidate: () => void
  onRun: () => void
  onDuplicate: () => void
  onRemove: () => void
  onClearOutput: () => void
  onHelp: () => void
  onConvertToLoopNode: () => void
  onEnableHandlesForAllInputs: () => void
  onUpdateKvEntry?: () => void
  onPinnedInCanvasChange?: (pinnedInCanvas: boolean) => void
  onRenameSchemaFieldId?: (args: { prevId: string; nextId: string }) => void
}

export type WidgetEditorSurfaceKind = 'card' | 'widget'

export function resolveWidgetEditorSurfaceLabel(surfaceKind?: WidgetEditorSurfaceKind | null): string {
  return surfaceKind === 'card' ? UI_LABELS.storyboardCard : UI_LABELS.flowWidget
}

export const FLOW_WIDGET_OVERLAY_Z_INDEX_BASE = Z_INDEX_GRAPH_OVERLAY_BASE
export const FLOW_WIDGET_OVERLAY_Z_INDEX_SELECTED = Z_INDEX_GRAPH_OVERLAY_SELECTED
export const WIDGET_ACTIONS_TOOLBAR_OFFSET_PX = 40
export const WIDGET_ACTIONS_TOOLBAR_CLEARANCE_PX = 48
export const WIDGET_ACTIONS_TOOLBAR_VIEWPORT_MARGIN_PX = 8
export const WIDGET_ACTIONS_TOOLBAR_MAX_WIDTH_PX = 360
export const RICH_MEDIA_ASPECT_MIN_WIDTH = 220
export const RICH_MEDIA_ASPECT_MIN_HEIGHT = 160

export type StoryboardWidgetSurfacePointerPolicy = {
  rootClassName: string
  panelPointerEventsClassName: string
  toolbarPointerEventsClassName: string
  canvasWheelIgnore: 'true' | 'false'
}

export function resolveStoryboardWidgetSurfacePointerPolicy(): StoryboardWidgetSurfacePointerPolicy {
  return {
    rootClassName: 'fixed',
    panelPointerEventsClassName: 'pointer-events-auto',
    toolbarPointerEventsClassName: 'pointer-events-auto',
    canvasWheelIgnore: 'true',
  }
}
