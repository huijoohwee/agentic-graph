import type { Canvas2dRendererId, Canvas3dModeId } from '@/lib/config'
import type { BottomSurfaceTab } from '@/hooks/store/store-types/core'
import type { GraphSchema } from '@/lib/graph/schema'
import { togglePortHandlesEnabledInSchema } from '@/lib/graph/portHandlesBehavior'
import {
  CANVAS_GRID_DISPLAY_CONTROL_ID,
  HELPER_LINES_DISPLAY_CONTROL_ID,
  SNAP_GRID_DISPLAY_CONTROL_ID,
  buildCanvasGridVisibilityBehaviorPatch,
  buildHelperLinesBehaviorPatch,
  buildSnapGridBehaviorPatch,
} from '@/lib/canvas/canvasGridDisplayControls'
import {
  CANVAS_ASPECT_RATIO_DISPLAY_CONTROL_ID,
  type CanvasAspectRatioMode,
  toggleCanvasAspectRatioMode,
} from '@/lib/canvas/canvasAspectRatioDisplayControls'
import {
  CANVAS_BOARD_LAYOUT_DISPLAY_CONTROL_ID,
  type CanvasBoardLayoutMode,
  toggleCanvasBoardLayoutMode,
} from '@/lib/canvas/canvasBoardLayoutDisplayControls'
import {
  CANVAS_CARD_DISPLAY_CONTROL_ID,
  CANVAS_WIDGET_DISPLAY_CONTROL_ID,
  readCanvasCardWidgetDisplayMode,
  type CanvasCardWidgetDisplayMode,
} from '@/lib/canvas/canvasCardWidgetDisplayControls'
import type { CanvasViewOptionId } from '@/components/toolbar/canvasViewTypes'
import {
  isFrontmatterOnlyCanvas2dRenderer,
  isFrontmatterOnlyPolicyActive,
  isMultiDimTableCanvas2dRenderer,
  isTableGraphCanvas2dRenderer,
  supportsCanvas2dMinimap,
} from '@/lib/config.render'
import { applyCanvasSurfaceModeSelection, type CanvasSurfaceModeId } from '@/lib/canvas/canvas3dMode'

type CanvasViewActionParams = {
  id: CanvasViewOptionId
  ensureBaselineUnlocked: () => boolean
  geospatialEnabled: boolean
  onOpenGeospatialMode: () => void
  onOpenShared3dPanel?: (mode: '3d' | 'xr') => void
  canvas2dRenderer: Canvas2dRendererId
  canvas3dMode: string
  canvasRenderMode: '2d' | '3d'
  documentSemanticMode: string
  frontmatterModeEnabled: boolean
  multiDimTableModeEnabled: boolean
  renderMediaAsNodes: boolean
  timelineEnabled: boolean
  bottomSurfaceCollapsed: boolean
  bottomSurfaceTab: BottomSurfaceTab
  minimapCollapsed?: boolean
  schema: GraphSchema
  setCanvas2dRenderer: (id: Canvas2dRendererId) => void
  setCanvasRenderMode: (mode: '2d' | '3d') => void
  setCanvas3dMode: (mode: Canvas3dModeId) => void
  setSchema: (schema: GraphSchema) => void
  setBehavior?: (behavior: Partial<GraphSchema['behavior']>) => void
  setRenderMediaAsNodes: (enabled: boolean) => void
  setTimelineEnabled: (enabled: boolean) => void
  setBottomSurfaceCollapsed: (collapsed: boolean) => void
  setBottomSurfaceTab: (tab: BottomSurfaceTab) => void
  setMinimapCollapsed?: (collapsed: boolean) => void
  aspectRatioMode?: CanvasAspectRatioMode
  setAspectRatioMode?: (mode: CanvasAspectRatioMode) => void
  boardLayoutMode?: CanvasBoardLayoutMode
  setBoardLayoutMode?: (mode: CanvasBoardLayoutMode) => void
  storyboardDisplayMode?: CanvasCardWidgetDisplayMode
  setStoryboardDisplayMode?: (mode: CanvasCardWidgetDisplayMode) => void
  setDocumentSemanticMode: (mode: 'document' | 'keyword') => void
  setFrontmatterModeEnabled: (enabled: boolean) => void
  setMultiDimTableModeEnabled: (enabled: boolean) => void
  requestStoryboardWidgetLayoutRebalance?: () => void
}

export const applyCanvasViewSelection = (params: CanvasViewActionParams) => {
  const {
    id,
    ensureBaselineUnlocked,
    geospatialEnabled,
    onOpenGeospatialMode,
    onOpenShared3dPanel,
    canvas2dRenderer,
    canvas3dMode,
    canvasRenderMode,
    documentSemanticMode,
    frontmatterModeEnabled,
    multiDimTableModeEnabled,
    renderMediaAsNodes,
    bottomSurfaceCollapsed,
    bottomSurfaceTab,
    minimapCollapsed = false,
    aspectRatioMode,
    boardLayoutMode,
    storyboardDisplayMode,
    schema,
    setCanvas2dRenderer,
    setCanvasRenderMode,
    setCanvas3dMode,
    setSchema,
    setBehavior,
    setRenderMediaAsNodes,
    setBottomSurfaceCollapsed,
    setBottomSurfaceTab,
    setMinimapCollapsed,
    setAspectRatioMode,
    setBoardLayoutMode,
    setStoryboardDisplayMode,
    setDocumentSemanticMode,
    setFrontmatterModeEnabled,
    setMultiDimTableModeEnabled,
    requestStoryboardWidgetLayoutRebalance,
  } = params

  if (!ensureBaselineUnlocked()) return
  const frontmatterOnlyAllowed = isFrontmatterOnlyPolicyActive({ canvasRenderMode, canvas2dRenderer })

  if (id.startsWith('renderer:')) {
    if (id === 'renderer:menu') return
    const nextRenderer = id.slice('renderer:'.length) as Canvas2dRendererId
    const rendererChanged = nextRenderer !== canvas2dRenderer
    const nextRendererIsMultiDimTable = isMultiDimTableCanvas2dRenderer(nextRenderer)
    if (canvasRenderMode !== '2d') setCanvasRenderMode('2d')
    if (rendererChanged) setCanvas2dRenderer(nextRenderer)
    if (nextRendererIsMultiDimTable) {
      if (frontmatterModeEnabled) setFrontmatterModeEnabled(false)
      if (!multiDimTableModeEnabled || canvasRenderMode !== '2d' || !isTableGraphCanvas2dRenderer(canvas2dRenderer)) {
        setMultiDimTableModeEnabled(true)
      }
      if (documentSemanticMode !== 'document') setDocumentSemanticMode('document')
      return
    }
    if (multiDimTableModeEnabled) setMultiDimTableModeEnabled(false)
    if (isFrontmatterOnlyCanvas2dRenderer(nextRenderer)) {
      if (!frontmatterModeEnabled) setFrontmatterModeEnabled(true)
      if (documentSemanticMode !== 'document') setDocumentSemanticMode('document')
    }
    return
  }
  if (id === 'layout:block' || id === 'layout:radial') {
    const nextMode = id === 'layout:block' ? 'block' : 'radial'
    if (schema.layout?.mode === nextMode) return
    setSchema({
      ...schema,
      layout: {
        ...(schema.layout || {}),
        mode: nextMode,
      },
    })
    return
  }
  if (id === 'layout:storyboardWidgetRebalance') {
    if (canvasRenderMode !== '2d' || canvas2dRenderer !== 'storyboard') return
    requestStoryboardWidgetLayoutRebalance?.()
    return
  }
  if (id === 'document:menu') {
    return
  }
  if (id === 'layout:menu') {
    return
  }
  if (id === 'animation:menu') {
    return
  }
  if (id === 'control:menu') {
    return
  }
  if (id === 'surface:menu') {
    return
  }
  if (id === 'document:documentStructure') {
    if (geospatialEnabled) return
    if (frontmatterOnlyAllowed) {
      if (multiDimTableModeEnabled) setMultiDimTableModeEnabled(false)
      if (!frontmatterModeEnabled) setFrontmatterModeEnabled(true)
      if (documentSemanticMode !== 'document') setDocumentSemanticMode('document')
      return
    }
    if (multiDimTableModeEnabled) setMultiDimTableModeEnabled(false)
    if (frontmatterModeEnabled) setFrontmatterModeEnabled(false)
    setDocumentSemanticMode('document')
    return
  }
  if (id === 'document:keyword') {
    if (geospatialEnabled || frontmatterOnlyAllowed) return
    if (multiDimTableModeEnabled) setMultiDimTableModeEnabled(false)
    if (frontmatterModeEnabled) setFrontmatterModeEnabled(false)
    setDocumentSemanticMode('keyword')
    return
  }
  if (id === 'document:frontmatter') {
    if (geospatialEnabled) return
    if (multiDimTableModeEnabled) setMultiDimTableModeEnabled(false)
    if (!frontmatterModeEnabled) setFrontmatterModeEnabled(true)
    if (documentSemanticMode !== 'document') setDocumentSemanticMode('document')
    return
  }
  if (id === 'document:multiDimTable') {
    if (geospatialEnabled) return
    if (frontmatterModeEnabled) setFrontmatterModeEnabled(false)
    if (
      !multiDimTableModeEnabled ||
      canvasRenderMode !== '2d' ||
      !isTableGraphCanvas2dRenderer(canvas2dRenderer)
    ) {
      setMultiDimTableModeEnabled(true)
    }
    if (documentSemanticMode !== 'document') setDocumentSemanticMode('document')
    return
  }
  if (id.startsWith('surface:')) {
    const mode = id.slice('surface:'.length) as CanvasSurfaceModeId
    if (mode === 'xr') {
      onOpenShared3dPanel?.('xr')
      return
    }
    const activated = applyCanvasSurfaceModeSelection({
      mode,
      geospatialEnabled,
      onOpenGeospatialMode,
      canvas2dRenderer,
      documentSemanticMode,
      frontmatterModeEnabled,
      multiDimTableModeEnabled,
      schema,
      setCanvas2dRenderer,
      setCanvasRenderMode,
      setCanvas3dMode,
      setSchema,
    })
    if (activated && mode === '3d') onOpenShared3dPanel?.(mode)
    return
  }
  if (id === 'animation:force' || id === 'animation:orbit') {
    const semanticApplicable =
      frontmatterModeEnabled ||
      multiDimTableModeEnabled ||
      documentSemanticMode === 'document' ||
      documentSemanticMode === 'keyword'
    const rendererApplicable =
      (canvasRenderMode === '3d' && canvas3dMode !== 'voxel') ||
      (canvasRenderMode === '2d' && canvas2dRenderer === 'd3')
    if (!(semanticApplicable && rendererApplicable)) return
    const nextEnabled = id === 'animation:orbit'
    if ((schema.layout?.forces?.radialOrbitEnabled !== false) === nextEnabled) return
    setSchema({
      ...schema,
      layout: {
        ...(schema.layout || {}),
        forces: {
          ...((schema.layout || {}).forces || {}),
          radialOrbitEnabled: nextEnabled,
        },
      },
    })
    return
  }
  if (id === 'control:richMedia') {
    setRenderMediaAsNodes(!renderMediaAsNodes)
    return
  }
  if (id === 'control:timeline') {
    if (geospatialEnabled) return
    const nextTab: BottomSurfaceTab = 'timeline'
    if (bottomSurfaceCollapsed !== true && bottomSurfaceTab === nextTab) {
      setBottomSurfaceCollapsed(true)
      return
    }
    setBottomSurfaceTab(nextTab)
    setBottomSurfaceCollapsed(false)
    return
  }
  if (id === 'control:flowchart' || id === 'control:gitGraph' || id === 'control:gantt' || id === 'control:architecture' || id === 'control:eventModeling') {
    if (geospatialEnabled) return
    const nextTab: BottomSurfaceTab =
      id === 'control:flowchart'
        ? 'flowchart'
        : id === 'control:gitGraph'
        ? 'gitGraph'
        : id === 'control:gantt'
          ? 'gantt'
          : id === 'control:architecture'
            ? 'architecture'
            : 'eventModeling'
    if (bottomSurfaceCollapsed !== true && bottomSurfaceTab === nextTab) {
      setBottomSurfaceCollapsed(true)
      return
    }
    setBottomSurfaceTab(nextTab)
    setBottomSurfaceCollapsed(false)
    return
  }
  if (id === 'control:minimap') {
    if (geospatialEnabled || canvasRenderMode !== '2d' || !supportsCanvas2dMinimap(canvas2dRenderer)) return
    setMinimapCollapsed?.(!minimapCollapsed)
    return
  }
  if (id === CANVAS_ASPECT_RATIO_DISPLAY_CONTROL_ID) {
    setAspectRatioMode?.(toggleCanvasAspectRatioMode(aspectRatioMode))
    return
  }
  if (id === CANVAS_BOARD_LAYOUT_DISPLAY_CONTROL_ID) {
    setBoardLayoutMode?.(toggleCanvasBoardLayoutMode(boardLayoutMode))
    return
  }
  if (id === CANVAS_CARD_DISPLAY_CONTROL_ID || id === CANVAS_WIDGET_DISPLAY_CONTROL_ID) {
    if (geospatialEnabled) return
    const nextMode = readCanvasCardWidgetDisplayMode(id === CANVAS_WIDGET_DISPLAY_CONTROL_ID ? 'widget' : 'card')
    if (canvasRenderMode !== '2d') setCanvasRenderMode('2d')
    if (readCanvasCardWidgetDisplayMode(storyboardDisplayMode) !== nextMode) setStoryboardDisplayMode?.(nextMode)
    if (multiDimTableModeEnabled) setMultiDimTableModeEnabled(false)
    return
  }
  if (id === 'control:nodeShape') {
    const currentMode = schema.behavior?.nodeShapeMode
    const current: 'circle' | 'rect' | 'diamond' | 'hex' =
      currentMode === 'rect' || currentMode === 'diamond' || currentMode === 'hex' ? currentMode : 'circle'
    const order: ReadonlyArray<'circle' | 'rect' | 'diamond' | 'hex'> = ['circle', 'rect', 'diamond', 'hex']
    const index = order.indexOf(current)
    const nextMode = order[(index >= 0 ? index + 1 : 0) % order.length]
    setSchema({
      ...schema,
      behavior: {
        ...schema.behavior,
        nodeShapeMode: nextMode,
      },
    })
    return
  }
  if (id === 'control:clusterShape') {
    const currentShape = schema.layout?.groups?.shape === 'rect' ? 'rect' : 'geo'
    setSchema({
      ...schema,
      layout: {
        ...(schema.layout || {}),
        groups: {
          ...((schema.layout || {}).groups || {}),
          shape: currentShape === 'rect' ? 'geo' : 'rect',
        },
      },
    })
    return
  }
  if (id === 'control:portHandles') {
    const next = togglePortHandlesEnabledInSchema(schema)
    if (next.changed) setSchema(next.schema)
    return
  }
  if (id === CANVAS_GRID_DISPLAY_CONTROL_ID) {
    const behavior = schema.behavior
    const nextBehavior = buildCanvasGridVisibilityBehaviorPatch(schema)
    if (typeof setBehavior === 'function') {
      setBehavior(nextBehavior)
      return
    }
    setSchema({
      ...schema,
      behavior: {
        ...behavior,
        ...nextBehavior,
      },
    })
    return
  }
  if (id === SNAP_GRID_DISPLAY_CONTROL_ID) {
    const behavior = schema.behavior
    const nextBehavior = buildSnapGridBehaviorPatch(schema)
    if (typeof setBehavior === 'function') {
      setBehavior(nextBehavior)
      return
    }
    setSchema({
      ...schema,
      behavior: {
        ...behavior,
        ...nextBehavior,
      },
    })
    return
  }
  if (id === HELPER_LINES_DISPLAY_CONTROL_ID) {
    const behavior = schema.behavior
    const nextBehavior = buildHelperLinesBehaviorPatch(schema)
    if (typeof setBehavior === 'function') {
      setBehavior(nextBehavior)
      return
    }
    setSchema({
      ...schema,
      behavior: {
        ...behavior,
        ...nextBehavior,
      },
    })
    return
  }
  onOpenGeospatialMode()
}
