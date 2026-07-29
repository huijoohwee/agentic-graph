import type React from 'react'
import type { BottomSurfaceTab } from '@/hooks/store/store-types/core'
import type { Canvas2dRendererId, Canvas3dModeId } from '@/lib/config'
import type { CanvasAspectRatioMode } from '@/lib/canvas/canvasAspectRatioDisplayControls'
import type { CanvasBoardLayoutMode } from '@/lib/canvas/canvasBoardLayoutDisplayControls'
import type { CanvasCardWidgetDisplayMode } from '@/lib/canvas/canvasCardWidgetDisplayControls'
import type { CanvasSurfaceModeId } from '@/lib/canvas/canvas3dMode'
import type { GraphSchema } from '@/lib/graph/schema'

export type CanvasViewOptionId =
  | 'renderer:menu'
  | `renderer:${Canvas2dRendererId}`
  | 'layout:menu'
  | 'layout:block'
  | 'layout:radial'
  | 'layout:storyboardWidgetRebalance'
  | 'document:menu'
  | 'document:documentStructure'
  | 'document:keyword'
  | 'document:frontmatter'
  | 'document:multiDimTable'
  | 'surface:menu'
  | `surface:${CanvasSurfaceModeId}`
  | 'animation:menu'
  | 'animation:force'
  | 'animation:orbit'
  | 'control:menu'
  | 'control:richMedia'
  | 'control:nodeShape'
  | 'control:clusterShape'
  | 'control:portHandles'
  | 'control:minimap'
  | 'control:grid'
  | 'control:snapGrid'
  | 'control:helperLines'
  | 'control:aspectRatio'
  | 'control:boardLayout'
  | 'control:card'
  | 'control:widget'
  | 'control:timeline'
  | 'control:flowchart'
  | 'control:gitGraph'
  | 'control:gantt'
  | 'control:architecture'
  | 'control:eventModeling'

export type CanvasViewOption = {
  id: CanvasViewOptionId
  title: string
  label: string
  description?: string
  badges?: readonly string[]
  Icon: React.ComponentType<{ className?: string; strokeWidth?: number | string }>
  children?: readonly CanvasViewOption[]
  isActive?: boolean
  dividerBefore?: boolean
  disabled?: boolean
  disabledReason?: string
  enableHint?: string
}

export type CanvasViewRendererOption = {
  id: Canvas2dRendererId
  title: string
  Icon: React.ComponentType<{ className?: string; strokeWidth?: number | string }>
  label: string
  description: string
  badges: readonly string[]
}

export type CanvasViewModelState = {
  canvas2dRenderer: Canvas2dRendererId
  canvas3dMode: Canvas3dModeId
  canvasRenderMode: '2d' | '3d'
  documentSemanticMode: string
  frontmatterModeEnabled: boolean
  multiDimTableModeEnabled: boolean
  renderMediaAsNodes: boolean
  timelineEnabled: boolean
  bottomSurfaceCollapsed: boolean
  bottomSurfaceTab: BottomSurfaceTab
  minimapCollapsed?: boolean
  aspectRatioMode?: CanvasAspectRatioMode
  boardLayoutMode?: CanvasBoardLayoutMode
  storyboardDisplayMode?: CanvasCardWidgetDisplayMode
  geospatialEnabled: boolean
  layoutMode?: string
  schema: GraphSchema
  frontmatterOnlyAllowed: boolean
  isD3Like2dLayoutToggle: boolean
}
