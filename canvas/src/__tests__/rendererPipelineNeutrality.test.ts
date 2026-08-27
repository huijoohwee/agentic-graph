import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

export function test2dRendererPipelineUsesSharedSurfaceHelpers() {
  const root = resolve(process.cwd(), 'src')
  const renderConfigText = readFileSync(resolve(root, 'lib', 'config.render.ts'), 'utf8')
  const canvasViewportText = readFileSync(resolve(root, 'components', 'CanvasViewport.tsx'), 'utf8')
  const dashboardCanvasText = readFileSync(resolve(root, 'components', 'DashboardCanvas', 'index.tsx'), 'utf8')
  const dashboardModelText = readFileSync(resolve(root, 'components', 'DashboardCanvas', 'dashboardModel.ts'), 'utf8')
  const rendererSelectText = readFileSync(resolve(root, 'components', 'toolbar', 'Canvas2dRendererSelect.tsx'), 'utf8')
  const canvasViewMenuText = readFileSync(resolve(root, 'components', 'toolbar', 'canvasViewMenu.ts'), 'utf8')
  const mediaCanvasText = readFileSync(resolve(root, 'components', 'MediaCanvas.tsx'), 'utf8')
  const timelinePreviewMediaCanvasBindingText = readFileSync(resolve(root, 'components', 'timeline', 'useTimelinePreviewMediaCanvasBinding.ts'), 'utf8')
  const timelinePreviewBootstrapText = readFileSync(resolve(root, 'components', 'timeline', 'useTimelinePreviewBootstrap.ts'), 'utf8')
  const timelinePreviewRouteEntryText = readFileSync(resolve(root, 'components', 'timeline', 'useTimelinePreviewRouteEntry.ts'), 'utf8')
  const timelinePreviewCollectionText = readFileSync(resolve(root, 'components', 'timeline', 'useTimelinePreviewCollection.ts'), 'utf8')
  const timelinePreviewActivitySurfaceModelText = readFileSync(resolve(root, 'components', 'timeline', 'useTimelinePreviewActivitySurfaceModel.ts'), 'utf8')
  const timelinePreviewFamilyCompactionModelText = readFileSync(resolve(root, 'components', 'timeline', 'useTimelinePreviewFamilyCompactionModel.ts'), 'utf8')
  const timelinePreviewFamilyDisclosureControllerText = readFileSync(resolve(root, 'components', 'timeline', 'useTimelinePreviewFamilyDisclosureController.ts'), 'utf8')
  const timelinePreviewFamilyDisclosureModelText = readFileSync(resolve(root, 'components', 'timeline', 'useTimelinePreviewFamilyDisclosureModel.ts'), 'utf8')
  const timelinePreviewFamilyDisclosureSurfaceModelText = readFileSync(resolve(root, 'components', 'timeline', 'useTimelinePreviewFamilyDisclosureSurfaceModel.ts'), 'utf8')
  const timelinePreviewFamilySectionLayoutModelText = readFileSync(resolve(root, 'components', 'timeline', 'useTimelinePreviewFamilySectionLayoutModel.ts'), 'utf8')
  const timelinePreviewFamilySectionChromeModelText = readFileSync(resolve(root, 'components', 'timeline', 'useTimelinePreviewFamilySectionChromeModel.ts'), 'utf8')
  const timelinePreviewFamilySectionBodyModelText = readFileSync(resolve(root, 'components', 'timeline', 'useTimelinePreviewFamilySectionBodyModel.ts'), 'utf8')
  const timelinePreviewFamilySectionsModelText = readFileSync(resolve(root, 'components', 'timeline', 'useTimelinePreviewFamilySectionsModel.ts'), 'utf8')
  const timelinePreviewMediaContextText = readFileSync(resolve(root, 'components', 'timeline', 'useTimelinePreviewMediaContext.ts'), 'utf8')
  const timelinePreviewScopeProjectionText = readFileSync(resolve(root, 'components', 'timeline', 'useTimelinePreviewScopeProjection.ts'), 'utf8')
  const timelinePreviewMonitorContextText = readFileSync(resolve(root, 'components', 'timeline', 'useTimelinePreviewMonitorContext.ts'), 'utf8')
  const timelinePreviewMonitorBindingText = readFileSync(resolve(root, 'components', 'timeline', 'useTimelinePreviewMonitorBinding.ts'), 'utf8')
  const ganttTransportSessionText = readFileSync(resolve(root, 'features', 'gitgraph', 'useGanttTimelineTransportSession.ts'), 'utf8')
  const ganttTransportRouteModelText = readFileSync(resolve(root, 'features', 'gitgraph', 'useGanttTimelineTransportRouteModel.ts'), 'utf8')
  const ganttTransportSurfaceModelText = readFileSync(resolve(root, 'features', 'gitgraph', 'useGanttTimelineTransportSurfaceModel.ts'), 'utf8')
  const ganttTransportSurfaceText = readFileSync(resolve(root, 'features', 'gitgraph', 'GanttTimelineTransportSurface.tsx'), 'utf8')
  const ganttTransportCommandModelText = readFileSync(resolve(root, 'features', 'gitgraph', 'useGanttTimelineTransportCommandModel.ts'), 'utf8')
  const ganttTransportChromeModelText = readFileSync(resolve(root, 'features', 'gitgraph', 'useGanttTimelineTransportChromeModel.ts'), 'utf8')
  const ganttTransportContextControlsText = readFileSync(resolve(root, 'features', 'gitgraph', 'GanttTimelineTransportContextControls.tsx'), 'utf8')
  const ganttTransportHeaderToolsText = readFileSync(resolve(root, 'features', 'gitgraph', 'GanttTimelineTransportHeaderTools.tsx'), 'utf8')
  const ganttTransportRulerModelText = readFileSync(resolve(root, 'features', 'gitgraph', 'useGanttTimelineTransportRulerModel.ts'), 'utf8')
  const ganttTransportRulerText = readFileSync(resolve(root, 'features', 'gitgraph', 'GanttTimelineTransportRuler.tsx'), 'utf8')
  const ganttTransportInteractionModelText = readFileSync(resolve(root, 'features', 'gitgraph', 'useGanttTimelineTransportInteractionModel.ts'), 'utf8')
  const ganttTransportShellModelText = readFileSync(resolve(root, 'features', 'gitgraph', 'useGanttTimelineTransportShellModel.ts'), 'utf8')
  const ganttTransportShellText = readFileSync(resolve(root, 'features', 'gitgraph', 'GanttTimelineTransportShell.tsx'), 'utf8')
  const ganttTransportPlaybackModelText = readFileSync(resolve(root, 'features', 'gitgraph', 'useGanttTimelineTransportPlaybackModel.ts'), 'utf8')
  const ganttTransportPreviewSessionText = readFileSync(resolve(root, 'features', 'gitgraph', 'useGanttTimelineTransportPreviewSession.ts'), 'utf8')
  const timelinePreviewMediaCanvasRenderModelText = readFileSync(resolve(root, 'components', 'timeline', 'useTimelinePreviewMediaCanvasRenderModel.ts'), 'utf8')
  const timelinePreviewMediaCanvasRenderText = readFileSync(resolve(root, 'components', 'timeline', 'TimelinePreviewMediaCanvasRender.tsx'), 'utf8')
  const timelinePreviewMediaCanvasFrameModelText = readFileSync(resolve(root, 'components', 'timeline', 'useTimelinePreviewMediaCanvasFrameModel.ts'), 'utf8')
  const timelinePreviewMediaCanvasFrameText = readFileSync(resolve(root, 'components', 'timeline', 'TimelinePreviewMediaCanvasFrame.tsx'), 'utf8')
  const timelinePreviewSurfaceShellModelText = readFileSync(resolve(root, 'components', 'timeline', 'useTimelinePreviewSurfaceShellModel.ts'), 'utf8')
  const timelineSourceActivityModelText = readFileSync(resolve(root, 'components', 'timeline', 'useTimelineSourceActivityModel.ts'), 'utf8')
  const timelinePreviewSurfaceModelText = readFileSync(resolve(root, 'components', 'timeline', 'useTimelinePreviewSurfaceModel.ts'), 'utf8')
  const timelinePreviewSurfaceText = readFileSync(resolve(root, 'components', 'timeline', 'TimelinePreviewSurface.tsx'), 'utf8')
  const timelineAnimationEngineText = readFileSync(resolve(root, 'components', 'timeline', 'timelineAnimationEngine.ts'), 'utf8')
  const animaticTimelineModelText = readFileSync(resolve(root, 'components', 'AnimaticCanvas', 'useAnimaticTimelineModel.ts'), 'utf8')
  const responsiveToolbarCssText = readFileSync(resolve(root, 'styles', 'responsive-toolbar.css'), 'utf8')
  const toolbarRendererViewText = readFileSync(resolve(root, 'features', 'toolbar', 'ToolbarToolMenuRendererView.tsx'), 'utf8')
  const rendererGraphTopologySummaryText = readFileSync(resolve(root, 'features', 'toolbar', 'ui', 'RendererGraphTopologySummary.tsx'), 'utf8')
  const threeControlsText = readFileSync(resolve(root, 'features', 'three', 'Controls.tsx'), 'utf8')
  const minimapText = readFileSync(resolve(root, 'features', 'minimap', 'Minimap.tsx'), 'utf8')
  const minimapStoryboardWidgetOverlayProjectionText = readFileSync(resolve(root, 'features', 'minimap', 'storyboardWidgetOverlayProjection.ts'), 'utf8')
  const canvasSyncRuntimeText = readFileSync(resolve(root, 'features', 'canvas', 'CanvasSyncRuntime.tsx'), 'utf8')
  const canvasPreviewSyncInboundText = readFileSync(resolve(root, 'features', 'canvas', 'canvasPreviewSyncInbound.ts'), 'utf8')
  const toolbarToolMenuText = readFileSync(resolve(root, 'lib', 'toolbar', 'ToolbarToolMenu.impl.tsx'), 'utf8')
  const uiCopyText = readFileSync(resolve(root, 'lib', 'config-copy', 'uiCopy.ts'), 'utf8')
  const rendererRegistryText = readFileSync(resolve(root, 'lib', 'renderer', 'canvas2dRendererRegistry.ts'), 'utf8')
  const gitGraphCanvasText = readFileSync(resolve(root, 'components', 'MermaidGitGraphCanvas.tsx'), 'utf8')
  const gitGraphFloatingPanelText = readFileSync(resolve(root, 'features', 'gitgraph', 'GitGraphFloatingPanelView.tsx'), 'utf8')
  const gitGraphDocumentHookText = readFileSync(resolve(root, 'features', 'gitgraph', 'useMermaidGitGraphDocument.ts'), 'utf8')
  const svgSurfaceZoomRuntimeText = readFileSync(resolve(root, 'components', 'GraphCanvas', 'hooks', 'useSvgSurfaceZoomRuntime.ts'), 'utf8')

  if (!renderConfigText.includes('export const getCanvas2dSurfaceId')) {
    throw new Error('expected shared renderer surface helper in config.render')
  }
  if (!renderConfigText.includes('export const supportsCanvas2dMinimap')) {
    throw new Error('expected shared minimap support helper in config.render')
  }
  if (!renderConfigText.includes('export const isCanvas2dRendererId')) {
    throw new Error('expected shared 2D renderer id validator in config.render')
  }
  if (!renderConfigText.includes('export const CANVAS_2D_RENDERER_ORDER')) {
    throw new Error('expected shared 2D renderer order helper in config.render')
  }
  if (!renderConfigText.includes('export const getCanvas2dRendererMenuLabel')) {
    throw new Error('expected shared 2D renderer menu label helper in config.render')
  }
  if (!renderConfigText.includes('export const getCanvas2dRendererMenuDescription') || !renderConfigText.includes('export const getCanvas2dRendererMenuBadges')) {
    throw new Error('expected shared 2D renderer menu UX metadata helpers in config.render')
  }
  if (!renderConfigText.includes('export const isStoryboardCanvas2dRenderer')) {
    throw new Error('expected shared Storyboard renderer helper in config.render')
  }
  if (renderConfigText.includes('aliases:') || renderConfigText.includes('CANVAS_2D_RENDERER_ID_BY_ALIAS')) {
    throw new Error('expected shared renderer config to resolve canonical normalized tokens without alias lists')
  }
  if (!renderConfigText.includes('gitGraph') || !renderConfigText.includes('export const isGitGraphCanvas2dRenderer')) {
    throw new Error('expected GitGraph renderer to be registered through shared renderer config')
  }
  if (
    !renderConfigText.includes('dashboard') ||
    !renderConfigText.includes("surfaceId: 'dashboard'") ||
    !renderConfigText.includes('export const isDashboardCanvas2dRenderer') ||
    !renderConfigText.includes('!isDashboardCanvas2dRenderer(id)')
  ) {
    throw new Error('expected Dashboard renderer to be registered through shared renderer config and excluded from minimap')
  }
  if (
    !renderConfigText.includes("'media'") ||
    !renderConfigText.includes("surfaceId: 'media'") ||
    !renderConfigText.includes('export const isMediaCanvas2dRenderer') ||
    !renderConfigText.includes('!isMediaCanvas2dRenderer(id)')
  ) {
    throw new Error('expected Media renderer to be registered through shared renderer config and excluded from minimap')
  }
  if (!canvasViewportText.includes('getCanvas2dSurfaceId(canvas2dRenderer)')) {
    throw new Error('expected CanvasViewport to derive the active 2D surface from the shared renderer surface helper')
  }
  if (!canvasViewportText.includes("import('@/components/DashboardCanvas')") || !canvasViewportText.includes("active2dSurface === 'dashboard'")) {
    throw new Error('expected CanvasViewport to mount Dashboard through the shared 2D surface branch')
  }
  if (!canvasViewportText.includes("import('@/components/MediaCanvas')") || !canvasViewportText.includes("active2dSurface === 'media'")) {
    throw new Error('expected CanvasViewport to mount Media through the shared 2D surface branch')
  }
  if (!canvasViewportText.includes("import('@/components/MermaidGitGraphCanvas')") || !canvasViewportText.includes("active2dSurface === 'gitGraph'")) {
    throw new Error('expected CanvasViewport to mount GitGraph through the shared 2D surface branch')
  }
  if (
    !mediaCanvasText.includes('useTimelinePreviewMediaCanvasBinding') ||
    !mediaCanvasText.includes('mediaCanvasBinding.frameModel') ||
    !mediaCanvasText.includes('TimelinePreviewMediaCanvasFrame') ||
    !timelinePreviewMediaCanvasFrameText.includes('data-kg-media-canvas="1"') ||
    !timelineAnimationEngineText.includes("'css-property'") ||
    !timelineAnimationEngineText.includes("'svg-attribute'") ||
    !timelineAnimationEngineText.includes("'dom-attribute'") ||
    !timelineAnimationEngineText.includes("'js-object'") ||
    !["'html'", "'canvas-2d'", "'webgl-three'", "'data-kg-animation-inspired-by': 'motionkit'", "'data-kg-animation-reference': 'blender'", 'TimelineAnimationKeyframe', 'TimelineAnimationProperty', 'TimelineAnimationLayerMode', 'TimelineAnimationNestedMode', 'TimelineAnimationRenderPass', 'TimelineTextAnimationKeyframe', 'TimelineTextAnimationScope', 'TimelineTextAnimationProperty', 'TimelineVectorMorphShape', 'TimelineVectorBooleanOperation', 'buildTimelineTextKeyframes', 'buildTimelineVectorMorphPath', 'data-kg-animation-frame-count', 'data-kg-animation-fbf-workflow', 'data-kg-animation-layer-panel', 'data-kg-animation-nested', 'data-kg-animation-nested-composite', 'data-kg-animation-nested-fps', 'data-kg-animation-text-keyframes', 'data-kg-animation-text-properties', 'data-kg-animation-text-scopes', 'data-kg-animation-text-font-size', 'data-kg-animation-text-color', 'data-kg-animation-text-letter-spacing', 'data-kg-animation-text-line-height', 'data-kg-animation-vector-morph', 'data-kg-animation-vector-morph-interpolated-path', 'data-kg-animation-vector-morph-shapes', 'data-kg-animation-vector-morph-boolean-ops', 'data-kg-animation-recording-mode'].every(token => timelineAnimationEngineText.includes(token)) ||
    timelineAnimationEngineText.includes("from 'animejs'") ||
    !timelinePreviewMediaCanvasBindingText.includes('useCommandMenuRichMediaInventory') ||
    !timelinePreviewMediaCanvasBindingText.includes('useTimelineDocumentStoreBinding') ||
    !timelinePreviewMediaCanvasBindingText.includes('useTimelineGanttSelectionStoreBinding') ||
    !timelinePreviewMediaCanvasBindingText.includes('useTimelinePreviewRouteEntry') ||
    !timelinePreviewMediaCanvasBindingText.includes('useTimelinePreviewMediaContext') ||
    timelinePreviewMediaCanvasBindingText.includes('useTimelinePreviewBootstrap') ||
    !timelinePreviewMediaCanvasBindingText.includes('collection: previewRouteEntry.bootstrap.collection') ||
    !timelinePreviewMediaCanvasBindingText.includes('documentKey: previewRouteEntry.bootstrap.documentKey') ||
    !timelinePreviewMediaCanvasBindingText.includes('exportPlan: previewRouteEntry.bootstrap.exportPlan') ||
    !timelinePreviewMediaCanvasBindingText.includes('intent: previewRouteEntry.intent') ||
    !timelinePreviewMediaCanvasBindingText.includes('frameModel: previewMediaContext.mediaCanvasFrame') ||
    !timelinePreviewBootstrapText.includes('useTimelinePreviewBootstrap') ||
    !timelinePreviewBootstrapText.includes('useTimelinePreviewCollection') ||
    !timelinePreviewBootstrapText.includes('cleanTimelinePreviewDocumentKey') ||
    !timelinePreviewBootstrapText.includes('const documentKey = cleanTimelinePreviewDocumentKey(args.markdownDocumentName)') ||
    !timelinePreviewBootstrapText.includes('() => collection.previewPlan || collection.exportPlan') ||
    !timelinePreviewCollectionText.includes('useTimelinePreviewMediaSession') ||
    !timelinePreviewCollectionText.includes('inventoryItems') ||
    !timelinePreviewCollectionText.includes("source: 'video-sequence'") ||
    !timelinePreviewMediaContextText.includes('useTimelinePreviewMediaContext') ||
    !timelinePreviewMediaContextText.includes('useTimelinePreviewSurfaceModel') ||
    !timelinePreviewMediaContextText.includes('useTimelinePreviewActivitySurfaceModel') ||
    !timelinePreviewMediaContextText.includes('useTimelinePreviewFamilyCompactionModel') ||
    !timelinePreviewMediaContextText.includes('useTimelinePreviewFamilyDisclosureController') ||
    !timelinePreviewMediaContextText.includes('useTimelinePreviewFamilyDisclosureModel') ||
    !timelinePreviewMediaContextText.includes('useTimelinePreviewFamilyDisclosureSurfaceModel') ||
    !timelinePreviewMediaContextText.includes('useTimelinePreviewFamilySectionLayoutModel') ||
    !timelinePreviewMediaContextText.includes('useTimelinePreviewFamilySectionChromeModel') ||
    !timelinePreviewMediaContextText.includes('useTimelinePreviewFamilySectionBodyModel') ||
    !timelinePreviewMediaContextText.includes('useTimelinePreviewFamilySectionsModel') ||
    !timelinePreviewMediaContextText.includes('useTimelinePreviewMediaCanvasRenderModel') ||
    !timelinePreviewMediaContextText.includes('useTimelinePreviewMediaCanvasFrameModel') ||
    !timelinePreviewMediaContextText.includes('useTimelinePreviewSurfaceShellModel') ||
    !timelinePreviewScopeProjectionText.includes('useTimelinePreviewScopeProjection') ||
    !timelinePreviewScopeProjectionText.includes('buildVideoSequenceTimelineScopes') ||
    !timelinePreviewScopeProjectionText.includes('sourceCount') ||
    !timelinePreviewScopeProjectionText.includes('spanCount') ||
    !timelinePreviewMonitorContextText.includes('useTimelinePreviewMonitorContext') ||
    !timelinePreviewMonitorContextText.includes('useTimelinePreviewMediaContext') ||
    !timelinePreviewMonitorContextText.includes('useTimelinePreviewScopeProjection') ||
    !timelinePreviewMonitorContextText.includes('monitorScopes: scopeProjection.monitorScopes') ||
    !timelinePreviewMonitorBindingText.includes('useTimelinePreviewMonitorBinding') ||
    !timelinePreviewMonitorBindingText.includes('useTimelinePreviewRouteEntry') ||
    !timelinePreviewMonitorBindingText.includes('useTimelinePreviewMonitorContext') ||
    timelinePreviewMonitorBindingText.includes('useTimelinePreviewBootstrap') ||
    !timelinePreviewMonitorBindingText.includes('collection: previewRouteEntry.bootstrap.collection') ||
    !timelinePreviewMonitorBindingText.includes('documentKey: previewRouteEntry.bootstrap.documentKey') ||
    !timelinePreviewMonitorBindingText.includes('exportPlan: previewRouteEntry.bootstrap.exportPlan') ||
    !timelinePreviewMonitorBindingText.includes('intent: previewRouteEntry.intent') ||
    !timelinePreviewMonitorBindingText.includes('monitorScopes: previewMonitorContext.monitorScopes') ||
    !timelinePreviewRouteEntryText.includes('useTimelinePreviewRouteEntry') ||
    !timelinePreviewRouteEntryText.includes('useTimelinePreviewBootstrap') ||
    !timelinePreviewRouteEntryText.includes("intent: 'media'") ||
    !timelinePreviewRouteEntryText.includes("intent: 'monitor'") ||
    !timelinePreviewRouteEntryText.includes("args.intent === 'media' ? previewBootstrap.collection.sequenceMaxMinutes : args.maxMinutes") ||
    !timelinePreviewRouteEntryText.includes("args.intent === 'media' ? 0 : args.positionMinutes") ||
    !timelinePreviewRouteEntryText.includes('bootstrap: previewBootstrap') ||
    !ganttTransportSessionText.includes('useGanttTimelineTransportSession') ||
    !ganttTransportSessionText.includes('useTimelineDocumentStoreBinding') ||
    !ganttTransportSessionText.includes('useTimelineGanttSelectionStoreBinding') ||
    !ganttTransportSessionText.includes('useTimelineTransportStoreBinding') ||
    !ganttTransportSessionText.includes('useTimelineDocumentTransportController') ||
    !ganttTransportSessionText.includes('cleanTimelinePreviewDocumentKey') ||
    !ganttTransportSessionText.includes('useGanttTimelineMediaDuration') ||
    !ganttTransportSessionText.includes('useGanttTimelineDisplayModel') ||
    !ganttTransportSessionText.includes('useGanttTimelineTransportPreviewSession') ||
    !ganttTransportSessionText.includes('buildVideoSequenceTimelineToolStatus') ||
    ganttTransportSessionText.includes('buildVideoSequenceExportPlan') ||
    ganttTransportSessionText.includes('resolveVideoSequenceExportPlanError') ||
    ganttTransportSessionText.includes('useTimelinePreviewMonitorBinding') ||
    ganttTransportSessionText.includes('readVideoSequenceTimelineModelFromMarkdown') ||
    !ganttTransportSessionText.includes('resolveVisibleVideoSequenceTimelineLaneCount') ||
    !ganttTransportRouteModelText.includes('useGanttTimelineTransportRouteModel') ||
    !ganttTransportRouteModelText.includes('useGanttTimelineTransportSurfaceModel') ||
    !ganttTransportRouteModelText.includes('surfaceModel: transportSurfaceModel') ||
    !ganttTransportSurfaceModelText.includes('useGanttTimelineTransportSurfaceModel') ||
    !ganttTransportSurfaceModelText.includes('useGanttTimelineTransportSession') ||
    !ganttTransportSurfaceModelText.includes('useGanttTimelineTransportCommandModel') ||
    !ganttTransportSurfaceModelText.includes('useGanttTimelineTransportInteractionModel') ||
    !ganttTransportSurfaceModelText.includes('useGanttTimelineTransportChromeModel') ||
    !ganttTransportSurfaceModelText.includes('useGanttTimelineTransportRulerModel') ||
    !ganttTransportSurfaceModelText.includes('useGanttTimelineTransportPlaybackModel') ||
    !ganttTransportSurfaceModelText.includes('useGanttTimelineTransportShellModel') ||
    !ganttTransportSurfaceText.includes('GanttTimelineTransportSurface') ||
    !ganttTransportSurfaceText.includes('GanttTimelineTransportShell') ||
    !ganttTransportSurfaceText.includes('model: GanttTimelineTransportSurfaceModel') ||
    !ganttTransportPreviewSessionText.includes('useGanttTimelineTransportPreviewSession') ||
    !ganttTransportPreviewSessionText.includes('readVideoSequenceTimelineModelFromMarkdown') ||
    !ganttTransportPreviewSessionText.includes('useTimelinePreviewMonitorBinding') ||
    !ganttTransportPreviewSessionText.includes('buildVideoSequenceExportPlan') ||
    !ganttTransportPreviewSessionText.includes('resolveVideoSequenceExportPlanError') ||
    !ganttTransportCommandModelText.includes('useGanttTimelineTransportCommandModel') ||
    !ganttTransportCommandModelText.includes('useGanttTimelineDocumentActions') ||
    !ganttTransportCommandModelText.includes('chromeModelCommands') ||
    !ganttTransportChromeModelText.includes('useGanttTimelineTransportChromeModel') ||
    !ganttTransportChromeModelText.includes('VIDEO_SEQUENCE_TIMELINE_TOOLS.map') ||
    !ganttTransportChromeModelText.includes('exportSessionCollection.surface.items.map') ||
    !ganttTransportChromeModelText.includes('exportSessionCollection.retryControl') ||
    !ganttTransportChromeModelText.includes('handleRetryEditedMediaExportRunId') ||
    !ganttTransportChromeModelText.includes('handleRetryEditedMediaExport(args.latestRetryableExportSession)') ||
    !ganttTransportContextControlsText.includes('GanttTimelineTransportContextControls') ||
    ganttTransportContextControlsText.includes('VideoSequenceClipEditPanel') ||
    !ganttTransportChromeModelText.includes('buildVideoSequenceClipEditDetailsLabel') ||
    !ganttTransportContextControlsText.includes('data-kg-video-sequence-export-session-retry') ||
    !ganttTransportHeaderToolsText.includes('GanttTimelineTransportHeaderTools') ||
    !ganttTransportHeaderToolsText.includes('TimelineVideoSequenceToolButton') ||
    !ganttTransportHeaderToolsText.includes('data-kg-video-sequence-clip-edit={button.action}') ||
    !ganttTransportHeaderToolsText.includes('data-kg-video-sequence-export={button.dataValue}') ||
    !ganttTransportRulerModelText.includes('useGanttTimelineTransportRulerModel') ||
    !ganttTransportRulerModelText.includes('clampTimelineTransportValue') ||
    !ganttTransportRulerModelText.includes("'--kg-video-sequence-lane-count': args.visibleLaneCount") ||
    !ganttTransportRulerModelText.includes("subtitleLabel: `${args.taskSpans.length} timeline rows`") ||
    ganttTransportRulerModelText.includes("titleLabel: 'Gantt-Timeline'") ||
    !ganttTransportRulerModelText.includes('value: clampTimelineTransportValue(args.positionMinutes, 0, Math.max(1, args.maxMinutes))') ||
    !ganttTransportRulerText.includes('GanttTimelineTransportRuler') ||
    !ganttTransportRulerText.includes('VideoSequenceTimelineRuler') ||
    !ganttTransportRulerText.includes('scopes={args.model.scopes}') ||
    !ganttTransportInteractionModelText.includes('useGanttTimelineTransportInteractionModel') ||
    !ganttTransportInteractionModelText.includes('useGanttTimelineInteractions') ||
    !ganttTransportInteractionModelText.includes('useGanttTimelineTransportView') ||
    !ganttTransportInteractionModelText.includes('useGanttTimelineSelectionSync') ||
    !ganttTransportInteractionModelText.includes('resolveMermaidGanttTimelineRowKeyAtPosition(args.timelineModel, position)') ||
    !ganttTransportShellModelText.includes('useGanttTimelineTransportShellModel') ||
    !ganttTransportShellModelText.includes("ariaLabel: 'Scrub Gantt-timeline position'") ||
    !ganttTransportShellModelText.includes("chromeClassName: 'timeline-transport-chrome--mermaid-gantt p-2'") ||
    !ganttTransportShellModelText.includes("shellClassName: 'timeline-transport-shell--video-sequence'") ||
    !ganttTransportShellModelText.includes('showInlineProgress: false') ||
    !ganttTransportShellModelText.includes('showRange: false') ||
    !ganttTransportShellText.includes('GanttTimelineTransportShell') ||
    !ganttTransportShellText.includes('TimelineTransportChrome') ||
    !ganttTransportShellText.includes('GanttTimelineTransportContextControls') ||
    !ganttTransportShellText.includes('GanttTimelineTransportHeaderTools') ||
    !ganttTransportShellText.includes('GanttTimelineTransportRuler') ||
    !ganttTransportShellText.includes('contextLabel={args.rulerModel.chrome.subtitleLabel}') ||
    ganttTransportShellText.includes('titleLabel={args.rulerModel.chrome.titleLabel}') ||
    ganttTransportShellText.includes('subtitleLabel={args.rulerModel.chrome.subtitleLabel}') ||
    !ganttTransportPlaybackModelText.includes('useGanttTimelineTransportPlaybackModel') ||
    !ganttTransportPlaybackModelText.includes('useGanttTimelinePlaybackControls') ||
    !ganttTransportPlaybackModelText.includes('useTimelineTransportPlayback') ||
    !ganttTransportPlaybackModelText.includes('onPlaybackEnd: playbackControls.handlePlaybackEnd') ||
    !ganttTransportPlaybackModelText.includes('handleTogglePlayback: playbackControls.handleTogglePlayback') ||
    !timelinePreviewActivitySurfaceModelText.includes('useTimelinePreviewActivitySurfaceModel') ||
    !timelinePreviewActivitySurfaceModelText.includes("args.activityMode === 'selection' || args.activityMode === 'playhead'") ||
    !timelinePreviewActivitySurfaceModelText.includes("return 'active'") ||
    !timelinePreviewFamilyCompactionModelText.includes('useTimelinePreviewFamilyCompactionModel') ||
    !timelinePreviewFamilyCompactionModelText.includes("if (args.intent !== 'media') return false") ||
    !timelinePreviewFamilyCompactionModelText.includes('collapsedFamilyCount') ||
    !timelinePreviewFamilyDisclosureControllerText.includes('useTimelinePreviewFamilyDisclosureController') ||
    !timelinePreviewFamilyDisclosureControllerText.includes('React.useSyncExternalStore') ||
    !timelinePreviewFamilyDisclosureControllerText.includes('React.useEffect') ||
    !timelinePreviewFamilyDisclosureControllerText.includes('EMPTY_TIMELINE_PREVIEW_FAMILY_DISCLOSURE_SET') ||
    !timelinePreviewFamilyDisclosureControllerText.includes('areTimelinePreviewFamilyDisclosureSetsEqual') ||
    !timelinePreviewFamilyDisclosureControllerText.includes('if (areTimelinePreviewFamilyDisclosureSetsEqual(current, next)) return') ||
    !timelinePreviewFamilyDisclosureControllerText.includes('const documentKey = clean(args.documentKey)') ||
    !timelinePreviewFamilyDisclosureControllerText.includes('autoExpandFamilyId?: string | null') ||
    !timelinePreviewFamilyDisclosureControllerText.includes('familyIds: readonly string[]') ||
    !timelinePreviewFamilyDisclosureControllerText.includes('const familyIdSet = React.useMemo(() => new Set(familyIds), [familyIds])') ||
    !timelinePreviewFamilyDisclosureControllerText.includes('if (autoExpandFamilyId && familyIdSet.has(autoExpandFamilyId))') ||
    !timelinePreviewFamilyDisclosureModelText.includes('useTimelinePreviewFamilyDisclosureModel') ||
    !timelinePreviewFamilyDisclosureModelText.includes('controller: TimelinePreviewFamilyDisclosureController') ||
    !timelinePreviewFamilyDisclosureModelText.includes('toggleFamily') ||
    !timelinePreviewFamilyDisclosureModelText.includes("return args.expanded ? 'expanded' : 'collapsed'") ||
    timelinePreviewFamilyDisclosureModelText.includes('React.useState') ||
    !timelinePreviewFamilyDisclosureSurfaceModelText.includes('useTimelinePreviewFamilyDisclosureSurfaceModel') ||
    !timelinePreviewFamilyDisclosureSurfaceModelText.includes('headerVisible: toggleVisible') ||
    !timelinePreviewFamilyDisclosureSurfaceModelText.includes('Hide variants') ||
    !timelinePreviewFamilyDisclosureSurfaceModelText.includes('hidden variant') ||
    !timelinePreviewFamilySectionLayoutModelText.includes('useTimelinePreviewFamilySectionLayoutModel') ||
    !timelinePreviewFamilySectionLayoutModelText.includes('Rich media canvas sources') ||
    !timelinePreviewFamilySectionLayoutModelText.includes('No rich media sources found in the active document.') ||
    !timelinePreviewFamilySectionLayoutModelText.includes('sectionAttributes') ||
    !timelinePreviewFamilySectionChromeModelText.includes('useTimelinePreviewFamilySectionChromeModel') ||
    !timelinePreviewFamilySectionChromeModelText.includes('handleToggle: () => args.familyDisclosure.toggleFamily') ||
    !timelinePreviewFamilySectionChromeModelText.includes("icon: sectionLayout.familySurface.toggleMode === 'collapse' ? 'collapse' : 'expand'") ||
    !timelinePreviewFamilySectionChromeModelText.includes('dataValue: sectionLayout.familySummaryVisible ? sectionLayout.familySummaryLabel : undefined') ||
    !timelinePreviewFamilySectionBodyModelText.includes('useTimelinePreviewFamilySectionBodyModel') ||
    !timelinePreviewFamilySectionBodyModelText.includes('cardsLabel: sectionLayout.cardsLabel') ||
    !timelinePreviewFamilySectionBodyModelText.includes('props: {') ||
    !timelinePreviewFamilySectionBodyModelText.includes('documentKey: args.documentKey') ||
    !timelinePreviewFamilySectionBodyModelText.includes('exportPlan: args.exportPlan') ||
    !timelinePreviewFamilySectionBodyModelText.includes('sequenceMaxMinutes: args.sequenceMaxMinutes') ||
    !timelinePreviewFamilySectionsModelText.includes('useTimelinePreviewFamilySectionsModel') ||
    !timelinePreviewFamilySectionsModelText.includes('const bodySectionByFamilyId = new Map(') ||
    !timelinePreviewFamilySectionsModelText.includes('const sectionBody = bodySectionByFamilyId.get(sectionChrome.familyId)') ||
    !timelinePreviewFamilySectionsModelText.includes('cardsLabel: sectionBody.cardsLabel') ||
    !timelinePreviewFamilySectionsModelText.includes('surfaces: sectionBody.surfaces') ||
    !timelinePreviewMediaCanvasRenderModelText.includes('useTimelinePreviewMediaCanvasRenderModel') ||
    !timelinePreviewMediaCanvasRenderModelText.includes("contentMode: args.surfaceShell.hasItems ? 'sections' : 'empty'") ||
    !timelinePreviewMediaCanvasRenderModelText.includes('hostAttributes: {') ||
    !timelinePreviewMediaCanvasRenderModelText.includes('listLabel: args.familySections.listLabel') ||
    !timelinePreviewMediaCanvasRenderModelText.includes('shellLabel: args.surfaceShell.shellLabel') ||
    !timelinePreviewMediaCanvasFrameModelText.includes('useTimelinePreviewMediaCanvasFrameModel') ||
    !timelinePreviewMediaCanvasFrameModelText.includes('buildTimelineAnimationState') ||
    !timelinePreviewMediaCanvasFrameModelText.includes('hostAttributes: args.renderModel.hostAttributes') ||
    !timelinePreviewMediaCanvasFrameModelText.includes('renderModel: args.renderModel') ||
    !timelinePreviewMediaCanvasFrameText.includes('TimelinePreviewMediaCanvasFrame') ||
    !timelinePreviewMediaCanvasFrameText.includes('data-kg-media-canvas-group-count') ||
    !timelinePreviewMediaCanvasFrameText.includes('args.model.animationState.attributes') ||
    !timelinePreviewMediaCanvasFrameText.includes('<TimelinePreviewMediaCanvasRender model={args.model.renderModel} />') ||
    !timelinePreviewSurfaceShellModelText.includes('useTimelinePreviewSurfaceShellModel') ||
    !timelinePreviewSurfaceShellModelText.includes("shellLabel: 'Media canvas'") ||
    !timelinePreviewSurfaceShellModelText.includes("titleLabel: 'Media'") ||
    !timelinePreviewSurfaceShellModelText.includes('collapsedFamilyCount') ||
    !timelinePreviewSurfaceShellModelText.includes('groupCount: args.familySectionLayout.sections.length') ||
    !timelinePreviewMediaContextText.includes("autoExpandFamilyId: sourceActivity.activityMode === 'fallback'") ||
    !timelinePreviewMediaContextText.includes('familyIds: familyCompaction.families.map(family => family.familyId)') ||
    !timelinePreviewMediaContextText.includes('useTimelineSourceActivityModel') ||
    !timelineSourceActivityModelText.includes('useTimelineSourceActivityModel') ||
    !timelineSourceActivityModelText.includes('resolveTimelinePlanSegmentAtPosition') ||
    !timelineSourceActivityModelText.includes('areVideoSequenceExportSourcesEqual') ||
    !timelinePreviewSurfaceModelText.includes('resolveTimelinePreviewFamilyId') ||
    !timelinePreviewSurfaceModelText.includes('isTimelinePreviewItemVisibleForSurfaceIntent') ||
    !timelinePreviewSurfaceModelText.includes("args.intent === 'media'") ||
    !timelinePreviewSurfaceModelText.includes("args.intent === 'monitor' || args.intent === 'timeline'") ||
    !timelinePreviewSurfaceText.includes('<RichMediaPanel') ||
    !timelinePreviewSurfaceText.includes('buildStaticRichMediaPanelOverlayState') ||
    !timelinePreviewSurfaceText.includes('panelChrome="storyboardWidget"') ||
    !timelinePreviewSurfaceText.includes('data-kg-media-canvas-rich-media-panel="1"') ||
    !timelinePreviewSurfaceText.includes('data-kg-media-canvas-item-active') ||
    !timelinePreviewSurfaceText.includes('data-kg-media-canvas-item-dimmed') ||
    !timelinePreviewSurfaceText.includes('data-kg-media-canvas-item-family-collapsed') ||
    !timelinePreviewSurfaceText.includes('data-kg-media-canvas-item-family-disclosure-state') ||
    !timelinePreviewSurfaceText.includes('data-kg-media-canvas-item-family-expanded') ||
    !timelinePreviewSurfaceText.includes('data-kg-media-canvas-item-family-hidden-count') ||
    !timelinePreviewSurfaceText.includes('data-kg-media-canvas-item-style-mode') ||
    !timelinePreviewSurfaceText.includes('buildTimelineAnimationState') ||
    !timelinePreviewSurfaceText.includes('useTimelinePreviewVideoBinding')
  ) {
    throw new Error('expected Media renderer to reuse shared rich-media inventory, RichMediaPanel state/chrome, and video-sequence source model')
  }
  if (
    !timelinePreviewCollectionText.includes('shouldIncludeTimelinePreviewCollectionItem') ||
    !timelinePreviewCollectionText.includes("item.kind === 'mermaid'") ||
    !timelinePreviewCollectionText.includes("nodeId.startsWith('flow-diagram-')") ||
    !timelinePreviewCollectionText.includes('data-kg-flow-diagram') ||
    !timelinePreviewCollectionText.includes('data-kg-mermaid-source')
  ) {
    throw new Error('expected Media renderer to exclude Mermaid/Gantt flow-diagram panels so diagram charts stay in BottomPanel')
  }
  if (
    !mediaCanvasText.includes('<TimelinePreviewMediaCanvasFrame') ||
    !mediaCanvasText.includes('model={mediaCanvasBinding.frameModel}') ||
    !timelinePreviewMediaCanvasRenderText.includes('TimelinePreviewMediaCanvasRender') ||
    !timelinePreviewMediaCanvasRenderText.includes('TimelinePreviewSurface') ||
    !timelinePreviewMediaCanvasRenderText.includes('aria-label={args.model.listLabel}') ||
    !timelinePreviewMediaCanvasRenderText.includes('aria-label={args.model.emptyState.label}') ||
    !timelinePreviewMediaCanvasRenderText.includes('{args.model.emptyState.message}') ||
    !timelinePreviewMediaCanvasRenderText.includes('data-kg-media-canvas-family-surface-tone') ||
    !timelinePreviewMediaCanvasRenderText.includes('data-kg-media-canvas-family-summary=') ||
    !timelinePreviewMediaCanvasRenderText.includes('data-kg-media-canvas-family-toggle-mode') ||
    !timelinePreviewMediaCanvasRenderText.includes('data-kg-media-canvas-family-active-id') ||
    !timelinePreviewMediaCanvasRenderText.includes('title={section.toggle.title}') ||
    !timelinePreviewMediaCanvasRenderText.includes('onClick={section.toggle.handleToggle}') ||
    !timelinePreviewMediaCanvasRenderText.includes("section.toggle.icon === 'collapse'") ||
    !timelinePreviewMediaCanvasRenderText.includes('key={surface.renderKey}') ||
    !timelinePreviewMediaCanvasRenderText.includes('{...surface.props}')
  ) {
    throw new Error('expected Media renderer to reuse the shared media-canvas binding/frame/render adapters and upstream presentation contracts')
  }
  const blockedChartRuntimeTokens = [['chart', 'js'].join('.'), ['chart', 'js'].join('')]
  if (!dashboardCanvasText.includes("import * as d3 from 'd3'") || blockedChartRuntimeTokens.some(token => dashboardCanvasText.toLowerCase().includes(token))) {
    throw new Error('expected Dashboard renderer to reuse D3 and avoid introducing an alternate chart runtime')
  }
  if (
    !dashboardCanvasText.includes('buildScopedGraphSemanticKey') ||
    !dashboardCanvasText.includes('data-kg-dashboard-canvas="1"') ||
    !dashboardCanvasText.includes('data-kg-dashboard-grid-enabled')
  ) {
    throw new Error('expected Dashboard renderer to reuse shared semantic keys and expose neutral runtime markers')
  }
  if (!dashboardModelText.includes('readCanvasGridConfigFromSchema(schema)') || !dashboardModelText.includes('buildDashboardCanvasModel')) {
    throw new Error('expected Dashboard model to derive grid state from the shared canvas grid config')
  }
  if (!gitGraphCanvasText.includes('useSvgSurfaceZoomRuntime({') || !gitGraphCanvasText.includes('data-kg-gitgraph-interactive="1"')) {
    throw new Error('expected GitGraph renderer to delegate interaction to the shared SVG surface zoom runtime')
  }
  if (!gitGraphCanvasText.includes('selectedElementLabel: selectedCommandLabel') || !gitGraphCanvasText.includes('onSelectedElementLabelChange: handleSelectedElementLabelChange')) {
    throw new Error('expected GitGraph FloatingPanel selection to flow through the shared SVG surface runtime')
  }
  if (!svgSurfaceZoomRuntimeText.includes('readSelectedElementLabel?:') || !svgSurfaceZoomRuntimeText.includes('readSelectedElementLabel?.({ svgEl: args.svgEl, target: target || candidate, candidate })')) {
    throw new Error('expected shared SVG surface runtime to expose neutral clicked-element label resolution')
  }
  if (!svgSurfaceZoomRuntimeText.includes('resolveSelectedElementByLabel?:') || !svgSurfaceZoomRuntimeText.includes('readSelectedElementPeers?:')) {
    throw new Error('expected shared SVG surface runtime to let renderers keep related selected SVG parts undimmed')
  }
  if (
    !gitGraphCanvasText.includes('resolveGitGraphSvgElementLabel') ||
    !gitGraphCanvasText.includes('readGitGraphSvgElementLabelCandidates') ||
    !gitGraphCanvasText.includes('findGitGraphCommandForExactLabel') ||
    !gitGraphCanvasText.includes('resolveGitGraphSelectedSvgElementByLabel') ||
    !gitGraphCanvasText.includes('readGitGraphSelectedSvgElementPeers') ||
    !gitGraphCanvasText.includes("setFloatingPanelView('gitGraph')")
  ) {
    throw new Error('expected GitGraph canvas-to-row selection to resolve SVG labels through parsed commands and open the shared FloatingPanel')
  }
  if (
    !gitGraphFloatingPanelText.includes('data-kg-gitgraph-command-line') ||
    !gitGraphFloatingPanelText.includes("scrollIntoView({ block: 'center' })") ||
    !gitGraphFloatingPanelText.includes('ring-2')
  ) {
    throw new Error('expected GitGraph FloatingPanel rows to highlight and scroll to canvas-selected commands')
  }
  if (!gitGraphCanvasText.includes('[data-kg-svg-dimmed="1"]')) {
    throw new Error('expected GitGraph canvas to render shared SVG selection dimming markers')
  }
  if (gitGraphCanvasText.includes('[data-kg-svg-selected="1"]') || gitGraphCanvasText.includes('stroke: var(--kg-canvas-accent)') || gitGraphCanvasText.includes('paint-order: stroke')) {
    throw new Error('expected GitGraph row-to-canvas selection to avoid selected-SVG highlight styling while preserving dimming')
  }
  if (gitGraphCanvasText.includes('CardInlineTextEditor') || gitGraphCanvasText.includes('data-kg-gitgraph-crud-panel="1"')) {
    throw new Error('expected GitGraph canvas to stay SVG-only after command CRUD consolidation into FloatingPanel')
  }
  if (!gitGraphFloatingPanelText.includes('CardInlineTextEditor') || !gitGraphFloatingPanelText.includes('data-kg-gitgraph-floating-panel="1"')) {
    throw new Error('expected GitGraph FloatingPanel view to reuse the shared inline editor owner')
  }
  if (!gitGraphFloatingPanelText.includes("GITGRAPH_CREATE_ACTION_GRID_CLASS_NAME = 'grid min-w-0 grid-cols-2 gap-1 px-1 sm:grid-cols-4'")) {
    throw new Error('expected GitGraph create actions to use a mobile-first responsive grid owner')
  }
  if (gitGraphFloatingPanelText.includes('grid grid-cols-4 gap-1 px-1')) {
    throw new Error('expected GitGraph create actions to avoid a fixed four-column mobile grid literal')
  }
  if (!gitGraphDocumentHookText.includes('replaceMermaidGitGraphCodeInMarkdown') || !gitGraphDocumentHookText.includes('writeWorkspaceSourceTextIfPresent')) {
    throw new Error('expected GitGraph interactive CRUD to write through shared source-text owners')
  }
  const gitGraphMarkdownSourceIndex = gitGraphDocumentHookText.indexOf('readYamlFrontmatterMermaidCode(markdownDocumentText || \'\')')
  const gitGraphParsedSourceIndex = gitGraphDocumentHookText.indexOf('readFrontmatterMermaidCode(graphData)')
  if (gitGraphMarkdownSourceIndex < 0 || gitGraphParsedSourceIndex < 0 || gitGraphMarkdownSourceIndex > gitGraphParsedSourceIndex) {
    throw new Error('expected GitGraph renderer to prefer live Markdown frontmatter over stale parsed graph metadata')
  }
  if (
    gitGraphCanvasText.includes('window.prompt(') ||
    gitGraphFloatingPanelText.includes('window.prompt(') ||
    gitGraphDocumentHookText.includes('localStorage.setItem(')
  ) {
    throw new Error('expected GitGraph interactive CRUD to avoid prompt/local renderer storage patches')
  }
  for (const token of [
    "import { createZoom } from '@/components/GraphCanvas/zoom'",
    "import { useZoomEffects } from '@/components/GraphCanvas/hooks/useZoomEffects'",
    "import { fitAllTransform } from '@/components/GraphCanvas/fit'",
    'useAutoZoomModes2d({',
    'buildActive2dZoomViewKey({',
    'commitZoomTransformToStore({',
    'createRafLatestScheduler',
    'pickZoomStateForView({',
    'pickInitialZoomTransform({',
    'data-kg-svg-zoom-content',
    'data-kg-svg-viewport-hitbox',
    'data-kg-svg-selected',
    'data-kg-svg-dimmed',
    'data-kg-svg-has-selection',
    'setSelectedElementByLabel',
    'findSvgSelectionCandidateByLabel',
    'updateSvgSelectionDimming',
    'resolveSelectedElementByLabel',
    'readSelectedElementPeers',
    'buildSvgSurfaceGraphData({',
  ]) {
    if (!svgSurfaceZoomRuntimeText.includes(token)) {
      throw new Error(`expected SVG surface zoom runtime to reuse shared D3 viewport owner: ${token}`)
    }
  }
  if (
    gitGraphCanvasText.includes('ref={svgHostRef}\n          className="absolute inset-0 h-full w-full overflow-auto"') ||
    gitGraphCanvasText.includes('ref={svgHostRef}\n          className="absolute inset-0 h-full w-full overflow-scroll"')
  ) {
    throw new Error('expected GitGraph renderer to avoid scroll-only interaction after shared zoom runtime adoption')
  }
  for (const staleToken of ['agenticgraph-gitgraph-demo', 'source_md', 'e2e_proof']) {
    if (gitGraphCanvasText.includes(staleToken) || svgSurfaceZoomRuntimeText.includes(staleToken)) {
      throw new Error('expected GitGraph interactive runtime to stay project- and file-agnostic')
    }
  }
  if (!canvasViewportText.includes('supportsCanvas2dMinimap(canvas2dRenderer)')) {
    throw new Error('expected CanvasViewport minimap gating to use the shared helper')
  }
  if (!canvasViewportText.includes("const StoryboardWidgetCanvasLazy = React.lazy(() => importWithRetry(() => import('@/components/StoryboardWidgetCanvas')")) {
    throw new Error('expected CanvasViewport to lazy-load the StoryboardWidgetCanvas startup surface through the shared retry import path')
  }
  if (!rendererSelectText.includes('isD3Like2dRenderer(state.canvas2dRenderer)')) {
    throw new Error('expected Canvas2dRendererSelect to reuse the shared D3-like helper')
  }
  if (!canvasViewMenuText.includes('isD3Like2dRenderer(option.id)')) {
    throw new Error('expected Canvas view menu to reuse the shared D3-like helper for renderer option gating')
  }
  if (!canvasViewMenuText.includes('CANVAS_2D_RENDERER_ORDER.map')) {
    throw new Error('expected Canvas view menu renderer options to derive menu order from the shared renderer spec')
  }
  if (!canvasViewMenuText.includes('getCanvas2dRendererMenuLabel(id)')) {
    throw new Error('expected Canvas view menu renderer options to derive menu labels from the shared renderer spec')
  }
  if (!canvasViewMenuText.includes('getCanvas2dRendererMenuDescription(id)') || !canvasViewMenuText.includes('getCanvas2dRendererMenuBadges(id)')) {
    throw new Error('expected Canvas view menu renderer options to derive UX metadata from the shared renderer spec')
  }
  if (!rendererSelectText.includes('option.description') || !rendererSelectText.includes('option.badges')) {
    throw new Error('expected Canvas2dRendererSelect to render shared renderer UX metadata without local option aliases')
  }
  if (!rendererSelectText.includes('kg-toolbar-dropdown-option-copy') || !responsiveToolbarCssText.includes('--kg-toolbar-dropdown-width')) {
    throw new Error('expected rich renderer menu metadata to use shared toolbar sizing and copy wrapping primitives')
  }
  if (!animaticTimelineModelText.includes('buildScopedGraphSemanticKey') || !animaticTimelineModelText.includes("'animatic-timeline-model'")) {
    throw new Error('expected Animatic timeline model caching to reuse the shared graph semantic-key helper')
  }
  if (!toolbarRendererViewText.includes('isD3Like2dRenderer(canvas2dRenderer)')) {
    throw new Error('expected renderer settings panel to reuse the shared D3-like helper')
  }
  if (!rendererGraphTopologySummaryText.includes("RENDERER_GRAPH_TOPOLOGY_STATS_GRID_CLASS_NAME = 'grid min-w-0 grid-cols-1 gap-x-3 gap-y-1 text-xs sm:grid-cols-2'")) {
    throw new Error('expected renderer topology stats to use a mobile-first responsive grid owner')
  }
  if (rendererGraphTopologySummaryText.includes('grid grid-cols-2 gap-x-3 gap-y-1 text-xs')) {
    throw new Error('expected renderer topology stats to avoid fixed mobile two-column grid literals')
  }
  if (!threeControlsText.includes('isD3Like2dRenderer(canvas2dRenderer)')) {
    throw new Error('expected Three controls bridge to reuse the shared D3-like helper')
  }
  if (
    !minimapText.includes('buildMinimapStoryboardWidgetOverlaySubset({') ||
    !minimapStoryboardWidgetOverlayProjectionText.includes('isStoryboardCanvas2dRenderer(args.canvas2dRenderer)')
  ) {
    throw new Error('expected minimap overlay subset logic to reuse the shared Storyboard Widget helper')
  }
  if (!canvasSyncRuntimeText.includes('applyCanvasPreviewSyncPayload')) {
    throw new Error('expected CanvasSyncRuntime to delegate inbound preview-sync payload handling to the shared owner')
  }
  if (!canvasPreviewSyncInboundText.includes('isStoryboardCanvas2dRenderer(store.canvas2dRenderer)')) {
    throw new Error('expected preview-sync inbound renderer lock to reuse the shared Storyboard Widget helper')
  }
  if (toolbarToolMenuText.includes('isStoryboardCanvas2dRenderer')) {
    throw new Error('expected floating toolbar owner to avoid stale unused Storyboard Widget helper references')
  }
  if (!uiCopyText.includes('2D Renderer: Flow Canvas')) {
    throw new Error('expected Flow renderer to be labeled as 2D Renderer: Flow Canvas')
  }
  if (!uiCopyText.includes('2D Renderer: GitGraph')) {
    throw new Error('expected GitGraph renderer to be labeled as 2D Renderer: GitGraph')
  }
  if (!uiCopyText.includes('2D Renderer: Dashboard') || !canvasViewMenuText.includes('canvasViewRendererDashboardTitle')) {
    throw new Error('expected Dashboard renderer to be labeled and exposed through shared Canvas View copy')
  }
  if (!uiCopyText.includes('2D Renderer: Storyboard')) {
    throw new Error('expected Storyboard renderer to be labeled as 2D Renderer: Storyboard')
  }
  if (uiCopyText.includes('2D Renderer: Flow\'')) {
    throw new Error('expected legacy 2D Renderer: Flow naming to be removed')
  }
  if (!rendererRegistryText.includes("export { CANVAS_2D_RENDERER_ORDER, getCanvas2dRendererLabel } from '@/lib/config'")) {
    throw new Error('expected renderer registry to re-export shared renderer order and labels from the centralized renderer config')
  }
}

export function testWorkspaceJsonPipelineStaysNeutralAndFileAgnostic() {
  const text = readFileSync(resolve(process.cwd(), 'src', 'hooks', 'active-graph-data', 'workspaceStructuredGraph.ts'), 'utf8')
  const perDocumentUiStateText = readFileSync(resolve(process.cwd(), 'src', 'lib', 'persistence', 'perDocumentUiState.ts'), 'utf8')
  const canvasSliceText = readFileSync(resolve(process.cwd(), 'src', 'hooks', 'store', 'canvasSlice.ts'), 'utf8')
  if (!text.includes("const WORKSPACE_GRAPH_PARSE_HINT = 'workspace:inline-data'")) {
    throw new Error('expected neutral inline workspace parse hint for JSON fallback parsing')
  }
  if (text.includes("parseGraph(name || 'workspace.json', text)")) {
    throw new Error('expected workspace JSON fallback parsing to avoid file-specific workspace.json')
  }
  if (text.includes("parseGraph(name || 'workspace.data.json', text)")) {
    throw new Error('expected workspace JSON fallback parsing to avoid hardcoded .json file hints')
  }
  if (!text.includes('buildFlowchartSourceMeta({')) {
    throw new Error('expected workspace flowchart parsing to carry shared source metadata')
  }
  if (!text.includes("const WORKSPACE_GRAPH_SOURCE = 'workspace:graph'")) {
    throw new Error('expected workspace JSON pipeline to use a neutral workspace graph source identity')
  }
  if (!text.includes("const WORKSPACE_GRAPH_SOURCE_KIND = 'workspace'")) {
    throw new Error('expected workspace JSON pipeline to tag workspace source kind explicitly')
  }
  if (text.includes('return { ...graphData, nodes: [], edges: [] }')) {
    throw new Error('expected flowchart path to avoid synthetic empty graph placeholders')
  }
  if (!perDocumentUiStateText.includes('isCanvas2dRendererId(record.canvas2dRenderer)')) {
    throw new Error('expected per-document UI persistence to reuse the shared 2D renderer id validator')
  }
  if (!canvasSliceText.includes('isCanvas2dRendererId(v) ? v : DEFAULT_CANVAS_2D_RENDERER')) {
    throw new Error('expected canvas slice bootstrap to reuse the shared 2D renderer id validator')
  }
}
