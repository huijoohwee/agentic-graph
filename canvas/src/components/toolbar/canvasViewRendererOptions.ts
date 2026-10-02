import { CalendarDays, LayoutGrid, ChartGantt, CircleDot, Columns2, GitGraph, GitMerge, Grid3x3, Image as ImageIcon, Images, MonitorPlay, Palette, PanelsTopLeft, Table } from 'lucide-react'
import type { Canvas2dRendererId } from '@/lib/config'
import { getCanvasSurfaceModeSpec } from '@/lib/canvas/canvas3dMode'
import type { CanvasViewRendererOption, CanvasViewModelState, CanvasViewOptionId } from './canvasViewTypes'

export const CANVAS_VIEW_RENDERER_OPTION_ICON: Record<Canvas2dRendererId, CanvasViewRendererOption['Icon']> = {
  d3: CircleDot,
  dashboard: Grid3x3,
  gallery: Images,
  media: ImageIcon,
  flowchart: Columns2,
  multiDimTable: Table,
  kanban: LayoutGrid,
  calendar: CalendarDays,
  gitGraph: GitGraph,
  gantt: ChartGantt,
  flow: GitMerge,
  animatic: MonitorPlay,
  storyboard: PanelsTopLeft,
  design: Palette,
}

export const isAnimationApplicable = (state: CanvasViewModelState) => {
  if (
    !(
      state.frontmatterModeEnabled ||
      state.multiDimTableModeEnabled ||
      state.documentSemanticMode === 'document' ||
      state.documentSemanticMode === 'keyword'
    )
  ) {
    return false
  }
  return (
    (state.canvasRenderMode === '3d' && state.canvas3dMode !== 'voxel') ||
    (state.canvasRenderMode === '2d' && state.canvas2dRenderer === 'd3')
  )
}

export const getCanvasViewTriggerState = (
  state: CanvasViewModelState,
  rendererOptions: CanvasViewRendererOption[],
): { id: CanvasViewOptionId; title: string; label: string } => {
  if (state.geospatialEnabled && state.canvasRenderMode === '3d' && state.canvas3dMode === 'xr') {
    const spec = getCanvasSurfaceModeSpec('geo-xr')
    return { id: 'surface:geo-xr', title: spec.title, label: spec.label }
  }
  if (state.geospatialEnabled) {
    const spec = getCanvasSurfaceModeSpec('geospatial')
    return { id: 'surface:geospatial', title: spec.title, label: spec.label }
  }
  if (state.canvasRenderMode === '3d') {
    const spec = getCanvasSurfaceModeSpec(state.canvas3dMode === 'voxel' ? 'voxel' : state.canvas3dMode === 'xr' ? 'xr' : '3d')
    return { id: `surface:${spec.id}` as CanvasViewOptionId, title: spec.title, label: spec.label }
  }
  const activeRenderer = rendererOptions.find(o => o.id === state.canvas2dRenderer) || rendererOptions[0]
  return {
    id: `renderer:${activeRenderer.id}` as CanvasViewOptionId,
    title: activeRenderer.title,
    label: activeRenderer.label,
  }
}
