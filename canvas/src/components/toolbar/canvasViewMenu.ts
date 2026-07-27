import { AlignCenter, Box, ChartGantt, Circle, CircleDot, Columns2, Cuboid, Diamond, FileText, Frame, GitGraph, GitMerge, Glasses, Grid3x3, Hexagon, History, Image as ImageIcon, Images, LayoutPanelTop, Magnet, Map, MonitorPlay, Network, Palette, PanelsTopLeft, Pencil, Share2, Square, Table, Tags, Workflow } from 'lucide-react'
import type { Canvas2dRendererId } from '@/lib/config'
import { UI_COPY, UI_LABELS } from '@/lib/config'
import {
  CANVAS_2D_RENDERER_MENU_ORDER,
  getCanvas2dRendererMenuBadges,
  getCanvas2dRendererMenuDescription,
  getCanvas2dRendererMenuLabel,
  isD3Like2dRenderer,
  supportsCanvas2dMinimap,
} from '@/lib/config.render'
import type { CanvasViewModelState, CanvasViewOption, CanvasViewOptionId, CanvasViewRendererOption } from '@/components/toolbar/canvasViewTypes'
import {
  CANVAS_GRID_DISPLAY_CONTROL_DESCRIPTION,
  CANVAS_GRID_DISPLAY_CONTROL_ID,
  CANVAS_GRID_DISPLAY_CONTROL_LABEL,
  CANVAS_GRID_DISPLAY_CONTROL_TITLE,
  HELPER_LINES_DISPLAY_CONTROL_DESCRIPTION,
  HELPER_LINES_DISPLAY_CONTROL_ID,
  HELPER_LINES_DISPLAY_CONTROL_LABEL,
  HELPER_LINES_DISPLAY_CONTROL_TITLE,
  SNAP_GRID_DISPLAY_CONTROL_DESCRIPTION,
  SNAP_GRID_DISPLAY_CONTROL_ID,
  SNAP_GRID_DISPLAY_CONTROL_LABEL,
  SNAP_GRID_DISPLAY_CONTROL_TITLE,
  readCanvasGridDisplayControlActive,
  readHelperLinesDisplayControlActive,
  readSnapGridDisplayControlActive,
} from '@/lib/canvas/canvasGridDisplayControls'
import {
  CANVAS_ASPECT_RATIO_DISPLAY_CONTROL_DESCRIPTION,
  CANVAS_ASPECT_RATIO_DISPLAY_CONTROL_ID,
  CANVAS_ASPECT_RATIO_DISPLAY_CONTROL_LABEL,
  readCanvasAspectRatioDisplayControlActive,
  readCanvasAspectRatioDisplayControlTitle,
} from '@/lib/canvas/canvasAspectRatioDisplayControls'
import {
  CANVAS_BOARD_LAYOUT_DISPLAY_CONTROL_DESCRIPTION,
  CANVAS_BOARD_LAYOUT_DISPLAY_CONTROL_ID,
  CANVAS_BOARD_LAYOUT_DISPLAY_CONTROL_LABEL,
  readCanvasBoardLayoutDisplayControlActive,
  readCanvasBoardLayoutDisplayControlTitle,
} from '@/lib/canvas/canvasBoardLayoutDisplayControls'
import {
  CANVAS_CARD_DISPLAY_CONTROL_ID,
  CANVAS_WIDGET_DISPLAY_CONTROL_ID,
  readCanvasCardWidgetDisplayControlActive,
  readCanvasCardWidgetDisplayControlTitle,
} from '@/lib/canvas/canvasCardWidgetDisplayControls'
import {
  getCanvasSurfaceModeDisabledCopy,
  getCanvasSurfaceModeSpec,
  listCanvasSurfaceModeSpecs,
  type CanvasSurfaceModeId,
} from '@/lib/canvas/canvas3dMode'
import { isRichMediaPanelDisplayEnabled } from '@/lib/render/richMediaSsot'

const isAnimationApplicable = (state: CanvasViewModelState) => {
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

const CANVAS_VIEW_RENDERER_OPTION_ICON: Record<Canvas2dRendererId, CanvasViewRendererOption['Icon']> = {
  d3: CircleDot,
  dashboard: Grid3x3,
  gallery: Images,
  media: ImageIcon,
  flowchart: Columns2,
  multiDimTable: Table,
  gitGraph: GitGraph,
  gantt: ChartGantt,
  flow: GitMerge,
  animatic: MonitorPlay,
  storyboard: PanelsTopLeft,
  design: Palette,
}

const CANVAS_VIEW_RENDERER_OPTION_TITLE: Record<Canvas2dRendererId, string> = {
  d3: UI_COPY.canvasViewRendererD3Title,
  dashboard: UI_COPY.canvasViewRendererDashboardTitle,
  gallery: UI_COPY.canvasViewRendererGalleryTitle,
  media: UI_COPY.canvasViewRendererMediaTitle,
  flowchart: UI_COPY.canvasViewRendererD3FlowchartTitle,
  multiDimTable: UI_COPY.canvasViewRendererMultiDimTableTitle,
  gitGraph: UI_COPY.canvasViewRendererGitGraphTitle,
  gantt: UI_COPY.canvasViewRendererGanttTitle,
  flow: UI_COPY.canvasViewRendererFlowTitle,
  animatic: UI_COPY.canvasViewRendererAnimaticTitle,
  storyboard: UI_COPY.canvasViewRendererStoryboardTitle,
  design: UI_COPY.canvasViewRendererDesignTitle,
}

const CANVAS_VIEW_SURFACE_MODE_ICON: Record<CanvasSurfaceModeId, CanvasViewOption['Icon']> = {
  '2d': Columns2,
  '3d': Box,
  xr: Glasses,
  voxel: Cuboid,
  geospatial: Map,
}

export const getCanvasViewRendererOptions = (): CanvasViewRendererOption[] =>
  CANVAS_2D_RENDERER_MENU_ORDER.map(id => ({
    id,
    title: CANVAS_VIEW_RENDERER_OPTION_TITLE[id],
    Icon: CANVAS_VIEW_RENDERER_OPTION_ICON[id],
    label: getCanvas2dRendererMenuLabel(id),
    description: getCanvas2dRendererMenuDescription(id),
    badges: getCanvas2dRendererMenuBadges(id),
  }))

export const buildCanvasViewOptions = (
  state: CanvasViewModelState,
  rendererOptions: CanvasViewRendererOption[],
): CanvasViewOption[] => {
  const animationApplicable = isAnimationApplicable(state)
  const bottomSurfaceOpen = state.bottomSurfaceCollapsed !== true
  const timelineBottomPanelVisible = bottomSurfaceOpen && state.bottomSurfaceTab === 'timeline'
  const flowchartBottomPanelVisible = bottomSurfaceOpen && state.bottomSurfaceTab === 'flowchart'
  const gitGraphBottomPanelVisible = bottomSurfaceOpen && state.bottomSurfaceTab === 'gitGraph'
  const ganttBottomPanelVisible = bottomSurfaceOpen && state.bottomSurfaceTab === 'gantt'
  const architectureBottomPanelVisible = bottomSurfaceOpen && state.bottomSurfaceTab === 'architecture'
  const eventModelingBottomPanelVisible = bottomSurfaceOpen && state.bottomSurfaceTab === 'eventModeling'
  const minimapSupported = state.canvasRenderMode === '2d' && supportsCanvas2dMinimap(state.canvas2dRenderer)
  const minimapVisible = minimapSupported && state.minimapCollapsed !== true
  const surfaceModeArgs = {
    canvas2dRenderer: state.canvas2dRenderer,
    documentSemanticMode: state.documentSemanticMode,
    frontmatterModeEnabled: state.frontmatterModeEnabled,
    multiDimTableModeEnabled: state.multiDimTableModeEnabled,
    geospatialEnabled: state.geospatialEnabled,
    layoutMode: state.layoutMode,
    schema: state.schema,
  }
  const getSurfaceModeDisabledCopy = (mode: CanvasSurfaceModeId) => getCanvasSurfaceModeDisabledCopy(surfaceModeArgs, mode)
  const surfaceModeChildren = listCanvasSurfaceModeSpecs().map(spec => {
    const disabledCopy = spec.id === 'geospatial' ? null : getSurfaceModeDisabledCopy(spec.id)
    return {
      id: `surface:${spec.id}` as const,
      title: spec.title,
      label: spec.label,
      Icon: CANVAS_VIEW_SURFACE_MODE_ICON[spec.id],
      disabled: !!disabledCopy,
      disabledReason: disabledCopy?.reason,
      enableHint: disabledCopy?.hint,
    } satisfies CanvasViewOption
  })
  const richMediaDisplayEnabled = isRichMediaPanelDisplayEnabled({
    renderMediaAsNodes: state.renderMediaAsNodes,
    canvasRenderMode: state.canvasRenderMode,
    canvas3dMode: state.canvas3dMode,
    canvas2dRenderer: state.canvas2dRenderer,
    frontmatterModeEnabled: state.frontmatterModeEnabled,
    documentSemanticMode: state.documentSemanticMode,
    geospatialEnabled: state.geospatialEnabled,
  })
  const nodeShapeMode = state.schema.behavior?.nodeShapeMode
  const nodeShapeIcon =
    nodeShapeMode === 'rect'
      ? Square
      : nodeShapeMode === 'diamond'
        ? Diamond
        : nodeShapeMode === 'hex'
          ? Hexagon
          : Circle
  const nodeShapeTitle =
    nodeShapeMode === 'rect'
      ? 'Node Shape: Rect'
      : nodeShapeMode === 'diamond'
        ? 'Node Shape: Diamond'
        : nodeShapeMode === 'hex'
          ? 'Node Shape: Hex'
          : 'Node Shape: Circle'
  const storyboardWidgetLayoutChildren: readonly CanvasViewOption[] = [
    {
      id: 'layout:storyboardWidgetRebalance',
      title: 'Re-balance Storyboard Widget layout',
      label: 'Re-balance',
      Icon: Columns2,
      disabled: state.geospatialEnabled,
      disabledReason: state.geospatialEnabled ? 'Disabled in Geospatial Mode' : undefined,
      enableHint: state.geospatialEnabled ? 'Switch to Document Mode to enable' : undefined,
    },
  ]
  const d3LikeLayoutChildren: readonly CanvasViewOption[] = [
    {
      id: 'layout:block',
      title: 'Block layout',
      label: 'Block',
      Icon: Columns2,
      disabled: state.geospatialEnabled || !state.isD3Like2dLayoutToggle,
      disabledReason: state.geospatialEnabled
        ? 'Disabled in Geospatial Mode'
        : !state.isD3Like2dLayoutToggle
          ? 'Available for D3 and Flowchart renderer'
          : undefined,
      enableHint: state.geospatialEnabled
        ? 'Switch to Document Mode to enable'
        : !state.isD3Like2dLayoutToggle
          ? 'Switch renderer to D3 or Flowchart'
          : undefined,
    },
    {
      id: 'layout:radial',
      title: 'Radial layout',
      label: 'Radial',
      Icon: CircleDot,
      disabled: state.geospatialEnabled || !state.isD3Like2dLayoutToggle,
      disabledReason: state.geospatialEnabled
        ? 'Disabled in Geospatial Mode'
        : !state.isD3Like2dLayoutToggle
          ? 'Available for D3 and Flowchart renderer'
          : undefined,
      enableHint: state.geospatialEnabled
        ? 'Switch to Document Mode to enable'
        : !state.isD3Like2dLayoutToggle
          ? 'Switch renderer to D3 or Flowchart'
          : undefined,
    },
  ]

  const optionsWithDisabled = rendererOptions.map(option => {
    const supportsD3LikeLayout = isD3Like2dRenderer(option.id)
    const disabledForRadial = state.layoutMode === 'radial' && !supportsD3LikeLayout
    const disabledForGeospatial = state.geospatialEnabled
    const disabledOption = disabledForRadial || disabledForGeospatial
    return {
      id: `renderer:${option.id}` as const,
      title: option.title,
      label: option.label,
      description: option.description,
      badges: option.badges,
      Icon: option.Icon,
      disabled: disabledOption,
      disabledReason: disabledForGeospatial
        ? 'Disabled in Geospatial Mode'
        : disabledForRadial
            ? 'Disabled in Radial Layout'
            : undefined,
      enableHint: disabledForGeospatial
        ? 'Switch to Document Mode to enable'
        : disabledForRadial
            ? 'Switch layout mode to Block to enable'
            : undefined,
    } satisfies CanvasViewOption
  })

  return [
    {
      id: 'renderer:menu',
      title: '2D Renderer',
      label: '2D',
      Icon: CircleDot,
      children: optionsWithDisabled,
    },
    {
      id: 'layout:menu',
      title: 'Layout Mode',
      label: 'Layout',
      Icon: Columns2,
      dividerBefore: true,
      children: state.canvas2dRenderer === 'storyboard' ? storyboardWidgetLayoutChildren : d3LikeLayoutChildren,
    },
    {
      id: 'document:menu',
      title: 'Document Modes',
      label: 'Docs',
      Icon: FileText,
      dividerBefore: true,
      children: [
        {
          id: 'document:documentStructure',
          title: UI_LABELS.documentStructureMode,
          label: 'Doc',
          Icon: FileText,
          disabled: state.geospatialEnabled || state.frontmatterOnlyAllowed,
          disabledReason: state.geospatialEnabled ? 'Disabled in Geospatial Mode' : state.frontmatterOnlyAllowed ? UI_COPY.frontmatterModeTooltip : undefined,
        },
        {
          id: 'document:keyword',
          title: UI_LABELS.keywordMode,
          label: 'Key',
          Icon: Tags,
          disabled: state.geospatialEnabled || state.frontmatterOnlyAllowed,
          disabledReason: state.geospatialEnabled ? 'Disabled in Geospatial Mode' : state.frontmatterOnlyAllowed ? UI_COPY.frontmatterModeTooltip : undefined,
        },
        {
          id: 'document:frontmatter',
          title: UI_LABELS.frontmatterMode,
          label: 'Front',
          Icon: GitMerge,
          disabled: state.geospatialEnabled,
          disabledReason: state.geospatialEnabled ? 'Disabled in Geospatial Mode' : undefined,
        },
        {
          id: 'document:multiDimTable',
          title: UI_LABELS.multiDimTableMode,
          label: 'Table',
          Icon: Table,
          disabled: state.geospatialEnabled || state.frontmatterOnlyAllowed,
          disabledReason: state.geospatialEnabled ? 'Disabled in Geospatial Mode' : state.frontmatterOnlyAllowed ? UI_COPY.frontmatterModeTooltip : undefined,
        },
      ],
    },
    {
      id: 'surface:menu',
      title: 'Surface Mode',
      label: 'Surface',
      Icon: Box,
      dividerBefore: true,
      children: surfaceModeChildren,
    },
    {
      id: 'animation:menu',
      title: 'Animation Mode',
      label: 'Anim',
      Icon: GitMerge,
      dividerBefore: true,
      children: [
        {
          id: 'animation:force',
          title: 'Force-directed Graph',
          label: 'Force',
          Icon: GitMerge,
          disabled: state.geospatialEnabled || !animationApplicable,
          disabledReason: state.geospatialEnabled ? 'Disabled in Geospatial Mode' : 'Animation is not applicable in current view',
          enableHint: state.geospatialEnabled ? 'Switch to Document Mode to enable' : undefined,
        },
        {
          id: 'animation:orbit',
          title: 'Orbit-style nested radial',
          label: 'Orbit',
          Icon: GitMerge,
          disabled: state.geospatialEnabled || !animationApplicable,
          disabledReason: state.geospatialEnabled ? 'Disabled in Geospatial Mode' : 'Animation is not applicable in current view',
          enableHint: state.geospatialEnabled ? 'Switch to Document Mode to enable' : undefined,
        },
      ],
    },
    {
      id: 'control:menu',
      title: 'Display Controls',
      label: 'Display',
      Icon: Grid3x3,
      dividerBefore: true,
      children: [
        {
          id: 'control:richMedia',
          title: UI_LABELS.renderMediaAsNodes,
          label: 'Media',
          Icon: ImageIcon,
          isActive: richMediaDisplayEnabled,
        },
        {
          id: 'control:nodeShape',
          title: nodeShapeTitle,
          label: 'Node',
          Icon: nodeShapeIcon,
        },
        {
          id: 'control:clusterShape',
          title: state.schema.layout?.groups?.shape === 'rect' ? UI_LABELS.groupShapeRect : UI_LABELS.groupShapePolygon,
          label: 'Group',
          Icon: state.schema.layout?.groups?.shape === 'rect' ? Square : Hexagon,
        },
        {
          id: 'control:portHandles',
          title: UI_LABELS.portHandles,
          label: 'Ports',
          Icon: Share2,
          isActive: state.schema.behavior?.portHandles?.enabled === true,
        },
        {
          id: 'control:minimap',
          title: 'Minimap',
          label: 'Minimap',
          Icon: Map,
          isActive: minimapVisible,
          disabled: state.geospatialEnabled || !minimapSupported,
          disabledReason: state.geospatialEnabled
            ? 'Disabled in Geospatial Mode'
            : !minimapSupported
              ? 'Current renderer does not support Minimap'
              : undefined,
          enableHint: state.geospatialEnabled
            ? 'Switch to Document Mode to enable'
            : !minimapSupported
              ? 'Switch to a minimap-capable 2D renderer'
              : undefined,
        },
        {
          id: CANVAS_GRID_DISPLAY_CONTROL_ID,
          title: CANVAS_GRID_DISPLAY_CONTROL_TITLE,
          label: CANVAS_GRID_DISPLAY_CONTROL_LABEL,
          Icon: Grid3x3,
          description: CANVAS_GRID_DISPLAY_CONTROL_DESCRIPTION,
          isActive: readCanvasGridDisplayControlActive(state.schema),
        },
        {
          id: SNAP_GRID_DISPLAY_CONTROL_ID,
          title: SNAP_GRID_DISPLAY_CONTROL_TITLE,
          label: SNAP_GRID_DISPLAY_CONTROL_LABEL,
          Icon: Magnet,
          description: SNAP_GRID_DISPLAY_CONTROL_DESCRIPTION,
          isActive: readSnapGridDisplayControlActive(state.schema),
        },
        {
          id: HELPER_LINES_DISPLAY_CONTROL_ID,
          title: HELPER_LINES_DISPLAY_CONTROL_TITLE,
          label: HELPER_LINES_DISPLAY_CONTROL_LABEL,
          Icon: AlignCenter,
          description: HELPER_LINES_DISPLAY_CONTROL_DESCRIPTION,
          isActive: readHelperLinesDisplayControlActive(state.schema),
        },
        {
          id: CANVAS_ASPECT_RATIO_DISPLAY_CONTROL_ID,
          title: readCanvasAspectRatioDisplayControlTitle(state.aspectRatioMode),
          label: CANVAS_ASPECT_RATIO_DISPLAY_CONTROL_LABEL,
          Icon: Frame,
          description: CANVAS_ASPECT_RATIO_DISPLAY_CONTROL_DESCRIPTION,
          isActive: readCanvasAspectRatioDisplayControlActive(state.aspectRatioMode),
        },
        {
          id: CANVAS_BOARD_LAYOUT_DISPLAY_CONTROL_ID,
          title: readCanvasBoardLayoutDisplayControlTitle(state.boardLayoutMode),
          label: CANVAS_BOARD_LAYOUT_DISPLAY_CONTROL_LABEL,
          Icon: LayoutPanelTop,
          description: CANVAS_BOARD_LAYOUT_DISPLAY_CONTROL_DESCRIPTION,
          isActive: readCanvasBoardLayoutDisplayControlActive(state.boardLayoutMode),
        },
        {
          id: CANVAS_CARD_DISPLAY_CONTROL_ID,
          title: readCanvasCardWidgetDisplayControlTitle('card'),
          label: 'Card',
          Icon: PanelsTopLeft,
          description: 'Card presentation',
          isActive: readCanvasCardWidgetDisplayControlActive(state.storyboardDisplayMode, 'card'),
          disabled: state.geospatialEnabled,
          disabledReason: state.geospatialEnabled ? 'Disabled in Geospatial Mode' : undefined,
        },
        {
          id: CANVAS_WIDGET_DISPLAY_CONTROL_ID,
          title: readCanvasCardWidgetDisplayControlTitle('widget'),
          label: 'Widget',
          Icon: Pencil,
          description: 'Widget presentation',
          isActive: readCanvasCardWidgetDisplayControlActive(state.storyboardDisplayMode, 'widget'),
          disabled: state.geospatialEnabled,
          disabledReason: state.geospatialEnabled ? 'Disabled in Geospatial Mode' : undefined,
        },
        {
          id: 'control:timeline',
          title: 'Timeline',
          label: 'Time',
          Icon: History,
          isActive: timelineBottomPanelVisible,
          disabled: state.geospatialEnabled,
          disabledReason: state.geospatialEnabled ? 'Disabled in Geospatial Mode' : undefined,
        },
        {
          id: 'control:flowchart',
          title: 'Flowchart',
          label: 'Flow',
          Icon: Columns2,
          isActive: flowchartBottomPanelVisible,
          disabled: state.geospatialEnabled,
          disabledReason: state.geospatialEnabled ? 'Disabled in Geospatial Mode' : undefined,
        },
        {
          id: 'control:gitGraph',
          title: 'GitGraph',
          label: 'Git',
          Icon: GitGraph,
          isActive: gitGraphBottomPanelVisible,
          disabled: state.geospatialEnabled,
          disabledReason: state.geospatialEnabled ? 'Disabled in Geospatial Mode' : undefined,
        },
        {
          id: 'control:gantt',
          title: 'Gantt-Timeline',
          label: 'Gantt',
          Icon: ChartGantt,
          isActive: ganttBottomPanelVisible,
          disabled: state.geospatialEnabled,
          disabledReason: state.geospatialEnabled ? 'Disabled in Geospatial Mode' : undefined,
        },
        {
          id: 'control:architecture',
          title: 'Architecture',
          label: 'Arch',
          Icon: Network,
          isActive: architectureBottomPanelVisible,
          disabled: state.geospatialEnabled,
          disabledReason: state.geospatialEnabled ? 'Disabled in Geospatial Mode' : undefined,
        },
        {
          id: 'control:eventModeling',
          title: 'Event Model',
          label: 'Event',
          Icon: Workflow,
          isActive: eventModelingBottomPanelVisible,
          disabled: state.geospatialEnabled,
          disabledReason: state.geospatialEnabled ? 'Disabled in Geospatial Mode' : undefined,
        },
      ],
    },
  ]
}

export const getCanvasViewTriggerState = (
  state: CanvasViewModelState,
  rendererOptions: CanvasViewRendererOption[],
): { id: CanvasViewOptionId; title: string; label: string } => {
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
