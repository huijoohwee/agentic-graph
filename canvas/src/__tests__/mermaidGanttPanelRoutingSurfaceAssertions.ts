export type GanttPanelRoutingSources = Readonly<{
  toolbarText: string
  canvasViewMenuText: string
  canvasViewActionsText: string
  canvasViewSelectText: string
  canvasViewTypesText: string
  canvasViewportText: string
  configRenderText: string
  uiCopyText: string
  bottomPanelText: string
  floatingTypeText: string
  uiInitialStateText: string
  bottomTypeText: string
  iconText: string
  panelText: string
  gitGraphFloatingText: string
  gitGraphCanvasText: string
  ganttCanvasText: string
  mediaCanvasText: string
  ganttFloatingText: string
  timelineFloatingText: string
  gitGraphBottomText: string
  ganttBottomText: string
  ganttTransportText: string
  ganttTransportRouteModelText: string
  ganttTransportSurfaceModelText: string
  ganttTransportSurfaceText: string
  ganttTransportCommandModelText: string
  ganttDocumentActionsText: string
  ganttDisplayModelText: string
  ganttInteractionsText: string
  ganttTransportInteractionModelText: string
  ganttMediaDurationText: string
  ganttPlaybackControlsText: string
  ganttTransportPlaybackModelText: string
  ganttSelectionSyncText: string
  ganttTransportViewText: string
  timelineBottomText: string
  videoSequenceExportText: string
  timelineTransportText: string
  surfaceBindingsText: string
  timelinePlanSyncText: string
  timelinePreviewBootstrapText: string
  timelinePreviewCollectionText: string
  timelinePreviewActivitySurfaceModelText: string
  timelinePreviewFamilyCompactionModelText: string
  timelinePreviewFamilyDisclosureControllerText: string
  timelinePreviewFamilyDisclosureModelText: string
  timelinePreviewFamilyDisclosureSurfaceModelText: string
  timelinePreviewFamilySectionLayoutModelText: string
  timelinePreviewFamilySectionChromeModelText: string
  timelinePreviewFamilySectionBodyModelText: string
  timelinePreviewFamilySectionsModelText: string
  timelinePreviewMediaContextText: string
  timelinePreviewScopeProjectionText: string
  timelinePreviewMonitorContextText: string
  timelinePreviewMonitorBindingText: string
  timelinePreviewMediaCanvasBindingText: string
  timelinePreviewRouteEntryText: string
  ganttTransportPreviewSessionText: string
  ganttTransportSessionText: string
  ganttTransportChromeModelText: string
  ganttTransportContextControlsText: string
  ganttTransportHeaderToolsText: string
  ganttTransportRulerModelText: string
  ganttTransportRulerText: string
  ganttTransportShellModelText: string
  ganttTransportShellText: string
  timelinePreviewMediaCanvasRenderModelText: string
  timelinePreviewMediaCanvasRenderText: string
  timelinePreviewMediaCanvasFrameModelText: string
  timelinePreviewMediaCanvasFrameText: string
  timelinePreviewSurfaceShellModelText: string
  timelineSourceActivityModelText: string
  timelinePreviewSurfaceModelText: string
  timelinePreviewSurfaceText: string
  mediaFormatPreferenceText: string
  timelinePreviewSyncText: string
  timelinePreviewVideoBindingText: string
  videoSequenceSourceRegistryText: string
  localImportText: string
  importActionsText: string
  launchFallbackText: string
  urlImportText: string
  urlContentText: string
  videoSequenceImportText: string
  canvasFrontmatterPresetText: string
  resolverText: string
  plainMermaidText: string
  interactiveMermaidText: string
  selectionHelperText: string
  mermaidSelectionText: string
  gitGraphSelectionText: string
  svgSurfaceZoomRuntimeText: string
  ganttBarInteractionText: string
}>

export function assertGanttPanelRoutingSurface(
  sources: GanttPanelRoutingSources,
  readSource: (...parts: string[]) => string,
) {
  const {
    toolbarText, canvasViewMenuText, canvasViewActionsText, canvasViewSelectText, canvasViewTypesText,
    canvasViewportText, configRenderText, uiCopyText, bottomPanelText, floatingTypeText, uiInitialStateText,
    bottomTypeText, iconText, panelText, gitGraphFloatingText, gitGraphCanvasText, ganttCanvasText,
    ganttFloatingText, timelineFloatingText, gitGraphBottomText, ganttBottomText, ganttTransportText,
    timelineBottomText, timelinePreviewBootstrapText, timelinePreviewCollectionText,
    timelinePreviewMediaCanvasBindingText, timelinePreviewRouteEntryText, ganttTransportChromeModelText,
    videoSequenceSourceRegistryText, importActionsText, launchFallbackText, canvasFrontmatterPresetText,
    plainMermaidText, interactiveMermaidText, selectionHelperText, mermaidSelectionText,
    gitGraphSelectionText, svgSurfaceZoomRuntimeText, ganttBarInteractionText,
  } = sources
  if (!floatingTypeText.includes("| 'gantt'") || !floatingTypeText.includes("| 'timeline'")) {
    throw new Error('expected FloatingPanelView to include first-class Gantt and Timeline views')
  }
  if (
    !floatingTypeText.includes('mermaidDiagramSelectedRowKeyByKind') ||
    !floatingTypeText.includes('setMermaidDiagramSelectedRowKey') ||
    !uiInitialStateText.includes('mermaidDiagramSelectedRowKeyByKind: {}') ||
    !uiInitialStateText.includes('setMermaidDiagramSelectedRowKey')
  ) {
    throw new Error('expected Mermaid GitGraph/Gantt/Timeline selected rows to live in shared store state for BottomPanel/FloatingPanel sync')
  }
  if (
    !bottomTypeText.includes("'gantt'") ||
    !bottomTypeText.includes("'timeline'") ||
    !bottomTypeText.includes("'architecture'") ||
    !bottomTypeText.includes("'eventModeling'") ||
    !bottomTypeText.includes("'documentVersionGraph'")
  ) {
    throw new Error('expected BottomSurfaceTab to keep document-version graph separate from first-class Mermaid tabs')
  }
  if (
    !configRenderText.includes("'gitGraph', 'gantt'") ||
    !configRenderText.includes("surfaceId: 'gantt'") ||
    !configRenderText.includes("animatic: {\n    surfaceId: 'animatic'") ||
    !configRenderText.includes("registryLabel: 'Animatic'") ||
    !configRenderText.includes('isGanttCanvas2dRenderer') ||
    !uiCopyText.includes('2D Renderer: Gantt-timeline') ||
    !readSource('components', 'toolbar', 'canvasViewRendererOptions.ts').includes('gantt: ChartGantt') ||
    !canvasViewMenuText.includes('canvasViewRendererGanttTitle') ||
    !canvasViewportText.includes('MermaidGanttCanvasLazy') ||
    !canvasViewportText.includes("active2dSurface === 'gantt'") ||
    !canvasViewportText.includes('AnimaticCanvasLazy') ||
    !canvasViewportText.includes("active2dSurface === 'animatic'")
  ) {
    throw new Error('expected Canvas 2D Renderer Gantt-timeline to remain mounted while Animatic restores its own first-class canvas surface')
  }
  if (
    !canvasViewTypesText.includes("'control:gitGraph'") ||
    !canvasViewTypesText.includes("'control:gantt'") ||
    !canvasViewTypesText.includes("'control:timeline'") ||
    !canvasViewTypesText.includes("'control:architecture'") ||
    !canvasViewTypesText.includes("'control:eventModeling'") ||
    !canvasViewMenuText.includes("id: 'control:gitGraph'") ||
    !canvasViewMenuText.includes("id: 'control:gantt'") ||
    !canvasViewMenuText.includes("id: 'control:timeline'") ||
    !canvasViewMenuText.includes("id: 'control:architecture'") ||
    !canvasViewMenuText.includes("id: 'control:eventModeling'")
  ) {
    throw new Error('expected Canvas View Display Controls to expose BottomPanel GitGraph, Gantt, Timeline, Architecture, and Event Model controls')
  }
  if (
    !canvasViewActionsText.includes("const nextTab: BottomSurfaceTab = 'timeline'") ||
    !canvasViewActionsText.includes("id === 'control:gitGraph' || id === 'control:gantt' || id === 'control:architecture' || id === 'control:eventModeling'") ||
    !canvasViewActionsText.includes("? 'architecture'") ||
    !canvasViewActionsText.includes(": 'eventModeling'") ||
    !canvasViewActionsText.includes("setBottomSurfaceTab(nextTab)") ||
    !canvasViewActionsText.includes('setBottomSurfaceCollapsed(false)') ||
    !canvasViewSelectText.includes('setBottomSurfaceTab: s.setBottomSurfaceTab')
  ) {
    throw new Error('expected Canvas View Display Controls to route Mermaid diagrams through shared bottom-surface setters')
  }
  if (
    !toolbarText.includes('GanttFloatingPanelViewLazy') ||
    !toolbarText.includes('TimelineFloatingPanelViewLazy') ||
    !toolbarText.includes("{ view: 'gantt', title: UI_LABELS.gantt") ||
    !toolbarText.includes("{ view: 'timeline', title: UI_LABELS.timeline") ||
    !toolbarText.includes("floatingPanelView === 'gantt'") ||
    !toolbarText.includes("floatingPanelView === 'timeline'")
  ) {
    throw new Error('expected FloatingPanel toolbar to route Gantt and Timeline through the shared view registry')
  }
  if (
    !bottomPanelText.includes('GanttBottomPanelViewLazy') ||
    !bottomPanelText.includes('TimelineBottomPanelViewLazy') ||
    !bottomPanelText.includes('ArchitectureBottomPanelViewLazy') ||
    !bottomPanelText.includes('EventModelingBottomPanelViewLazy') ||
    !bottomPanelText.includes('GitGraphBottomPanelViewLazy') ||
    !bottomPanelText.includes('DocumentVersionGitGraphPanelLazy') ||
    !bottomPanelText.includes("bottomSurfaceTab === 'documentVersionGraph'") ||
    !bottomPanelText.includes("setBottomSurfaceTab('documentVersionGraph')") ||
    !bottomPanelText.includes("bottomSurfaceTab === 'gantt'") ||
    !bottomPanelText.includes("bottomSurfaceTab === 'timeline'") ||
    !bottomPanelText.includes("bottomSurfaceTab === 'architecture'") ||
    !bottomPanelText.includes("bottomSurfaceTab === 'eventModeling'") ||
    !bottomPanelText.includes("view === 'documentVersionGraph'") ||
    !bottomPanelText.includes("view === 'gitGraph'") ||
    !bottomPanelText.includes("view === 'gantt'") ||
    !bottomPanelText.includes("view === 'timeline'") ||
    !bottomPanelText.includes("view === 'architecture'") ||
    !bottomPanelText.includes("view === 'eventModeling'") ||
    !bottomPanelText.includes('data-kg-strybldr-bottom-timeline-document-version-graph-toggle') ||
    !bottomPanelText.includes('data-kg-strybldr-bottom-timeline-gantt-toggle') ||
    !bottomPanelText.includes('data-kg-strybldr-bottom-timeline-timeline-toggle') ||
    !bottomPanelText.includes('data-kg-strybldr-bottom-timeline-architecture-toggle') ||
    !bottomPanelText.includes('data-kg-strybldr-bottom-timeline-event-modeling-toggle') ||
    !bottomPanelText.includes('data-kg-strybldr-bottom-timeline-scroll="body"') ||
    !bottomPanelText.includes('overflow-y-auto')
  ) {
    throw new Error('expected BottomPanel to route separate Version Graph, GitGraph, Gantt, Timeline, Architecture, Event Model tabs, and retain a scrollable body for tall Timeline editors')
  }
  if (
    !iconText.includes("'floatingPanel.gantt'") ||
    !iconText.includes("'floatingPanel.timeline'") ||
    !iconText.includes("'floatingPanel.architecture'") ||
    !iconText.includes("'floatingPanel.eventModeling'") ||
    !iconText.includes('ChartGantt') ||
    !iconText.includes('HistoryIcon') ||
    !iconText.includes('Network') ||
    !iconText.includes('Workflow')
  ) {
    throw new Error('expected Mermaid diagram icon ownership to live in the shared FloatingPanel type icon registry')
  }
  if (
    !panelText.includes('InteractiveMermaidDiagram') ||
    !panelText.includes('StructuredMermaidFallbackPreview') ||
    !panelText.includes('data-kg-mermaid-diagram-renderer="structured-fallback"') ||
    !panelText.includes("kind === 'architecture' || kind === 'eventmodeling'") ||
    !panelText.includes('data-kg-mermaid-diagram-kind') ||
    !interactiveMermaidText.includes('useSvgSurfaceZoomRuntime({') ||
    !interactiveMermaidText.includes('renderPlainMermaidSvgCached') ||
    !interactiveMermaidText.includes('data-kg-interactive-svg-diagram-surface') ||
    !interactiveMermaidText.includes('data-kg-interactive-svg-diagram-key')
  ) {
    throw new Error('expected BottomPanel Mermaid rendering to reuse the shared interactive SVG diagram surface')
  }
  if (
    !panelText.includes("export type MermaidDiagramPanelRenderMode = 'diagram' | 'list' | 'split'") ||
    !panelText.includes("renderMode = surface === 'bottomPanel' ? 'diagram' : 'list'") ||
    !panelText.includes("const showDiagram = renderMode !== 'list'") ||
    !panelText.includes("const showRowList = renderMode !== 'diagram'") ||
    !panelText.includes('state.mermaidDiagramSelectedRowKeyByKind[kind]') ||
    !panelText.includes('setMermaidDiagramSelectedRowKey(kind, rowKey)') ||
    !panelText.includes('data-kg-mermaid-diagram-render-mode={renderMode}') ||
    !panelText.includes('data-kg-mermaid-diagram-command-list="1"')
  ) {
    throw new Error('expected Mermaid panels to split BottomPanel diagrams from FloatingPanel row lists while sharing selected-row state')
  }
  if (
    !selectionHelperText.includes('resolveDiagramRowKey') ||
    !mermaidSelectionText.includes('readDiagramSelectionLabels') ||
    !mermaidSelectionText.includes('findMermaidDiagramRowKeyForSvgLabel') ||
    !mermaidSelectionText.includes('buildMermaidInteractiveSelectionRows') ||
    !panelText.includes('buildMermaidInteractiveSelectionRows') ||
    !panelText.includes('findMermaidDiagramRowKeyForSvgLabel') ||
    !panelText.includes('selectionRows={selectionRows}') ||
    !panelText.includes('selectedRowKey={selectedRowKey}') ||
    !panelText.includes('onSelectedRowKeyChange={onSelectRowKey}') ||
    !panelText.includes('data-kg-mermaid-diagram-direct-selection="1"') ||
    !panelText.includes('svgSurfaceKey={`mermaid:${kind}`}') ||
    !plainMermaidText.includes('selectedLabels') ||
    !plainMermaidText.includes('baseSvg') ||
    !plainMermaidText.includes('setBaseSvg(processed.svg)') ||
    !plainMermaidText.includes('data-kg-mermaid-row-selected') ||
    !plainMermaidText.includes('data-kg-mermaid-row-dimmed') ||
    !plainMermaidText.includes('data-kg-mermaid-selection-active') ||
    !interactiveMermaidText.includes('annotateInteractiveMermaidSelectionRows') ||
    !interactiveMermaidText.includes('propagateInteractiveMermaidRowAnnotations') ||
    !interactiveMermaidText.includes('deriveInteractiveMermaidClassAliases') ||
    !interactiveMermaidText.includes('data-kg-mermaid-row-key') ||
    !interactiveMermaidText.includes('data-kg-mermaid-row-target') ||
    !interactiveMermaidText.includes('readSelectedElementPeers') ||
    !interactiveMermaidText.includes('onSelectedElementLabelChange') ||
    !interactiveMermaidText.includes('svgSurfaceKey,') ||
    !interactiveMermaidText.includes('data-kg-svg-dimmed') ||
    !interactiveMermaidText.includes('data-kg-svg-selected') ||
    !svgSurfaceZoomRuntimeText.includes('SVG_DIRECT_SELECTION_TARGET_SELECTOR') ||
    !svgSurfaceZoomRuntimeText.includes('findNearestSvgSelectionTarget') ||
    !svgSurfaceZoomRuntimeText.includes('resolveSvgSelectionClickCandidate') ||
    !svgSurfaceZoomRuntimeText.includes('readSvgContentClientBounds') ||
    !svgSurfaceZoomRuntimeText.includes('readSvgStoredIntrinsicBounds') ||
    !svgSurfaceZoomRuntimeText.includes('readSvgSurfaceFitViewportRect') ||
    !svgSurfaceZoomRuntimeText.includes('readSvgViewportRect') ||
    !svgSurfaceZoomRuntimeText.includes('viewportWidth = runtime?.viewport.width || dims.width') ||
    !svgSurfaceZoomRuntimeText.includes('fitAllTransform(visualGraphData.nodes, viewportWidth, viewportHeight') ||
    !svgSurfaceZoomRuntimeText.includes("group.removeAttribute('transform')") ||
    !svgSurfaceZoomRuntimeText.includes("data-kg-svg-fit-source', useIntrinsicBounds ? 'intrinsic' : contentBounds ? 'content' : 'root'") ||
    !svgSurfaceZoomRuntimeText.includes('{ notify: false }')
  ) {
    throw new Error('expected GitGraph, Gantt, and Timeline diagrams to reuse direct SVG canvas-to-row selection, interactive SVG dimming, and cached render output')
  }
  if (
    !ganttCanvasText.includes('InteractiveMermaidDiagram') ||
    !ganttCanvasText.includes('useMermaidGanttDocument') ||
    !ganttCanvasText.includes("from '@/lib/mermaid/mermaidGanttBarInteraction'") ||
    !ganttCanvasText.includes('shouldExposeMermaidGanttBarInteraction(selectedRow)') ||
    !ganttCanvasText.includes('buildMermaidGanttTimelineModel') ||
    !ganttCanvasText.includes('resolveMermaidGanttBarDragPreview') ||
    !ganttCanvasText.includes('resolveMermaidGanttBarDragCommitted') ||
    !ganttCanvasText.includes('resolveMermaidGanttTimelineDragEffectiveDelta') ||
    !ganttCanvasText.includes('readGanttMinutesPerPixel') ||
    !ganttCanvasText.includes('const timelineSpan = timelineModel.taskSpans.find(span => span.lineIndex === dragState.rowLineIndex)') ||
    !ganttCanvasText.includes('deltaMinutes: effectiveDeltaMinutes') ||
    !ganttCanvasText.includes('updateMermaidGanttCodeRowTiming') ||
    !ganttCanvasText.includes('replaceFirstMermaidGanttFrontmatterCode') ||
    !ganttCanvasText.includes('setMarkdownDocument(markdownDocumentName, nextMarkdownText, { applyViewPreset: false })') ||
    !ganttCanvasText.includes("setMermaidDiagramSelectedRowKey('gantt', `${dragState.rowLineIndex}:task:${nextLine}`)") ||
    !ganttCanvasText.includes("element.tagName.toLowerCase() === 'rect'") ||
    !ganttCanvasText.includes('isVerticalMilestoneRow') ||
    !ganttCanvasText.includes('setPointerCapture') ||
    !ganttCanvasText.includes("window.addEventListener('pointermove'") ||
    !ganttCanvasText.includes('let maxMovedPx = 0') ||
    !ganttCanvasText.includes('maxMovedPx = Math.max(maxMovedPx, Math.abs(preview.deltaPx))') ||
    !ganttCanvasText.includes('!resolveMermaidGanttBarDragCommitted(maxMovedPx)') ||
    !ganttCanvasText.includes('const onPointerCancel = (event: PointerEvent)') ||
    !ganttCanvasText.includes("window.addEventListener('pointercancel', onPointerCancel") ||
    !ganttCanvasText.includes('stopGanttHandleClick') ||
    !ganttCanvasText.includes('data-kg-gantt-bar-interaction-overlay="1"') ||
    !ganttCanvasText.includes('data-kg-gantt-bar-drag-mode="move"') ||
    !ganttCanvasText.includes('data-kg-gantt-bar-drag-mode="resize-start"') ||
    !ganttCanvasText.includes('data-kg-gantt-bar-drag-mode="resize-end"') ||
    !ganttCanvasText.includes('data-kg-canvas-pointer-ignore="true"') ||
    !ganttCanvasText.includes('state.mermaidDiagramSelectedRowKeyByKind.gantt') ||
    !ganttCanvasText.includes("setMermaidDiagramSelectedRowKey('gantt'") ||
    !ganttCanvasText.includes('buildMermaidInteractiveSelectionRows') ||
    !ganttCanvasText.includes('readMermaidDirectSelectionLabels') ||
    !ganttCanvasText.includes('findMermaidDiagramRowForRowKey') ||
    !ganttCanvasText.includes('rendererId="gantt"') ||
    !ganttCanvasText.includes('svgFitMode="wideTimeline"') ||
    !ganttCanvasText.includes('data-kg-gantt-canvas="1"') ||
    !ganttCanvasText.includes("setFloatingPanelView('gantt')")
  ) {
    throw new Error('expected Canvas Gantt-timeline to share row-key selection state, selected-bar drag handles, and interactive Mermaid selection utilities with BottomPanel and FloatingPanel Gantt-Timeline')
  }
  if (
    !timelinePreviewMediaCanvasBindingText.includes('useTimelinePreviewRouteEntry') ||
    timelinePreviewMediaCanvasBindingText.includes('useTimelinePreviewBootstrap') ||
    !timelinePreviewRouteEntryText.includes('useTimelinePreviewRouteEntry') ||
    !timelinePreviewRouteEntryText.includes('useTimelinePreviewBootstrap') ||
    !timelinePreviewBootstrapText.includes('useTimelinePreviewCollection') ||
    !timelinePreviewCollectionText.includes('useTimelinePreviewMediaSession') ||
    !ganttCanvasText.includes('isVideoSequenceTimeline') ||
    ganttCanvasText.includes(['VideoSequenceCanvas', 'Preview'].join('')) ||
    ganttCanvasText.includes(['data-kg-video-sequence', 'canvas'].join('-')) ||
    !canvasFrontmatterPresetText.includes("current.setBottomSurfaceTab('timeline')") ||
    !canvasFrontmatterPresetText.includes("current.setFloatingPanelView('timeline')") ||
    !canvasFrontmatterPresetText.includes('current.setFloatingPanelOpen(true)') ||
    !videoSequenceSourceRegistryText.includes('registerVideoSequenceSourceFiles') ||
    !videoSequenceSourceRegistryText.includes('URL.createObjectURL(file)') ||
    !videoSequenceSourceRegistryText.includes('registryBySignature') ||
    !videoSequenceSourceRegistryText.includes('buildVideoSequenceSourceFileSignature(file)') ||
    !videoSequenceSourceRegistryText.includes('resolveVideoSequenceSourceRuntimeUrl') ||
    !videoSequenceSourceRegistryText.includes('OBJECT_URL_REVOKE_DELAY_MS = 2000') ||
    !videoSequenceSourceRegistryText.includes('scheduleObjectUrlRevoke(previous.objectUrl)') ||
    !importActionsText.includes('registerVideoSequenceSourceFiles(snapshot)') ||
    !launchFallbackText.includes('registerVideoSequenceSourceFiles(snapshot)')
  ) {
    throw new Error('expected video sequence docs to render playback through Media Canvas while BottomPanel/FloatingPanel Timeline own editing and rows')
  }
  if (
    ganttCanvasText.includes('TimelineTransportControls') ||
    ganttCanvasText.includes('useTimelineTransportPlayback') ||
    ganttCanvasText.includes('data-kg-gantt-timeline-transport') ||
    ganttCanvasText.includes('data-kg-gantt-timeline-ruler')
  ) {
    throw new Error('expected Canvas Gantt-timeline to avoid duplicate bottom playback transport; BottomPanel Timeline owns the scrubber')
  }
  if (
    !ganttBarInteractionText.includes("export type MermaidGanttBarDragMode = 'move' | 'resize-start' | 'resize-end'") ||
    !ganttBarInteractionText.includes('MERMAID_GANTT_BAR_DRAG_COMMIT_MIN_DELTA_PX') ||
    !ganttBarInteractionText.includes('MERMAID_GANTT_BAR_DRAG_EDGE_SCROLL_THRESHOLD_PX') ||
    !ganttBarInteractionText.includes('resolveMermaidGanttBarDragPreview') ||
    !ganttBarInteractionText.includes('buildMermaidGanttTimelineModel') ||
    !ganttBarInteractionText.includes('buildMermaidGanttTimelineTicks') ||
    !ganttBarInteractionText.includes('resolveMermaidGanttTimelineRowKeyAtPosition') ||
    !ganttBarInteractionText.includes('updateMermaidGanttCodeRowTiming') ||
    !ganttBarInteractionText.includes('splitMermaidGanttVideoSequenceClipGroupAtOffset') ||
    !ganttBarInteractionText.includes('resolveVideoSequenceClipGroupKey') ||
    !ganttBarInteractionText.includes('replaceFirstMermaidGanttFrontmatterCode') ||
    !ganttBarInteractionText.includes('shouldExposeMermaidGanttBarInteraction') ||
    ganttBarInteractionText.includes('agentic-graph-animatic-demo') ||
    ganttBarInteractionText.includes('/Users/')
  ) {
    throw new Error('expected Gantt-timeline drag/resize bar behavior to live in neutral shared Mermaid utilities without fixture paths')
  }
  if (
    !interactiveMermaidText.includes('svgFitMode?: SvgSurfaceFitMode') ||
    !interactiveMermaidText.includes('svgFitMode,') ||
    !svgSurfaceZoomRuntimeText.includes("export type SvgSurfaceFitMode = 'auto' | 'wideTimeline'") ||
    !svgSurfaceZoomRuntimeText.includes('computeSvgSurfaceWideTimelineFitTransform') ||
    !svgSurfaceZoomRuntimeText.includes("prepareSvgForInteractiveViewport({ svgEl, fitMode: svgFitMode })") ||
    !svgSurfaceZoomRuntimeText.includes("svgFitMode === 'wideTimeline' ? 'wideTimeline:v2' : svgFitMode") ||
    !svgSurfaceZoomRuntimeText.includes('[data-kg-floating-panel-root="true"]') ||
    !svgSurfaceZoomRuntimeText.includes('[data-kg-strybldr-bottom-timeline-panel="1"]') ||
    !svgSurfaceZoomRuntimeText.includes('data-kg-svg-fit-viewport-w') ||
    !svgSurfaceZoomRuntimeText.includes('graphDataRevisionRef.current') ||
    !svgSurfaceZoomRuntimeText.includes("data-kg-svg-fit-policy', timelineFitted ? 'wideTimeline' : 'fitAll'") ||
    !svgSurfaceZoomRuntimeText.includes("`fit:${normalizedFitMode}`")
  ) {
    throw new Error('expected Gantt-timeline Canvas to reuse shared SVG fit policy for readable wide timelines')
  }
  if (
    panelText.includes('resolveDiagramPointerRowIndex') ||
    panelText.includes('resolveDiagramRowPositionPercent') ||
    panelText.includes('showRowMarkers') ||
    panelText.includes('data-kg-mermaid-diagram-row-marker')
  ) {
    throw new Error('expected BottomPanel Mermaid diagrams to select rows from rendered SVG elements instead of proxy row markers')
  }
  if (
    gitGraphFloatingText.includes('MermaidDiagramRenderPreview') ||
    !gitGraphFloatingText.includes('data-kg-mermaid-diagram-render-mode="list"') ||
    !gitGraphFloatingText.includes('mermaidDiagramSelectedRowKeyByKind.gitgraph') ||
    !gitGraphFloatingText.includes("setMermaidDiagramSelectedRowKey('gitgraph'") ||
    !gitGraphFloatingText.includes('resolveGitGraphCommandRowKey') ||
    !ganttFloatingText.includes('MermaidDiagramPanelView') ||
    !ganttFloatingText.includes('renderMode="list"') ||
    !timelineFloatingText.includes('MermaidDiagramPanelView') ||
    !timelineFloatingText.includes('kind="timeline"') ||
    !timelineFloatingText.includes('kind="gantt"') ||
    !timelineFloatingText.includes('renderMode="list"') ||
    !timelineFloatingText.includes('Grade: false') ||
    !timelineFloatingText.includes('Mask: false') ||
    !timelineFloatingText.includes('Audio: true') ||
    !timelineFloatingText.includes('Video: true') ||
    !timelineFloatingText.includes('buildVideoSequenceFloatingPanelRowTree') ||
    !timelineFloatingText.includes('MarkdownTocExpandGlyph') ||
    !timelineFloatingText.includes('rowTree={videoSequenceFloatingRowTree}') ||
    !timelineFloatingText.includes('rowFilter={videoSequenceModel?.enabled ? videoSequenceFloatingRowFilter : undefined}') ||
    !timelineFloatingText.includes('data-kg-video-sequence-floating-panel-tree-controls="1"') ||
    !timelineFloatingText.includes('data-kg-video-sequence-floating-panel-lane-checkbox') ||
    !timelineFloatingText.includes('PanelCheckbox') ||
    !timelineFloatingText.includes('useMermaidGanttDocument') ||
    !timelineFloatingText.includes('model={ganttModel}') ||
    !timelineFloatingText.includes('rootThemeMode={ganttThemeMode}') ||
    !panelText.includes('rowTree?: MermaidDiagramPanelRowTreeResolver') ||
    !panelText.includes('rowFilter?: MermaidDiagramPanelRowFilter') ||
    !panelText.includes('role="tree"') ||
    !panelText.includes('role="treeitem"') ||
    !panelText.includes('data-kg-mermaid-diagram-command-tree={rowTree ?') ||
    !panelText.includes('rowEntries.length === model.rows.length') ||
    timelineFloatingText.includes('VideoSequenceFloatingPanelControls') ||
    timelineFloatingText.includes('rowControls={videoSequenceFloatingControls}') ||
    panelText.includes('data-kg-mermaid-diagram-row-controls="1"') ||
    timelineFloatingText.includes('GanttTimelineTransportPanel') ||
    timelineFloatingText.includes('TimelineVideoSequenceEmptyState') ||
    timelineFloatingText.includes('TimelineTransportControls') ||
    timelineFloatingText.includes('useTimelineTransportPlayback') ||
    timelineFloatingText.includes('data-kg-gantt-timeline-transport')
  ) {
    throw new Error('expected FloatingPanel Mermaid diagrams to keep Timeline video sequences as row lists without duplicating the BottomPanel Gantt transport')
  }
  if (
    !gitGraphSelectionText.includes('resolveGitGraphSelectedCommand') ||
    !gitGraphSelectionText.includes('findGitGraphCommandForRowKey') ||
    !gitGraphSelectionText.includes('findGitGraphCommandForExactLabel') ||
    !gitGraphCanvasText.includes('resolveGitGraphSelectedCommand') ||
    !gitGraphCanvasText.includes("setMermaidDiagramSelectedRowKey('gitgraph'") ||
    !gitGraphCanvasText.includes('handleDiagramSelectedRowKeyChange(rowKey') ||
    !gitGraphBottomText.includes('findGitGraphCommandForRowKey') ||
    !gitGraphBottomText.includes('setGitGraphSelectedCommandLineIndex(command?.lineIndex ?? null)') ||
    !gitGraphBottomText.includes("setMermaidDiagramSelectedRowKey('gitgraph', rowKey)") ||
    !gitGraphFloatingText.includes('findGitGraphCommandForRowKey') ||
    !gitGraphFloatingText.includes('return null')
  ) {
    throw new Error('expected Canvas GitGraph, BottomPanel GitGraph, and FloatingPanel GitGraph to share command row-key and line-index selection utilities without surface-local defaults')
  }
  if (
    !gitGraphBottomText.includes('MermaidDiagramPanelView') ||
    !gitGraphBottomText.includes("kind=\"gitgraph\"") ||
    !gitGraphBottomText.includes('renderMode="diagram"') ||
    gitGraphBottomText.includes('DocumentVersionGitGraphPanel') ||
    gitGraphBottomText.includes('fallbackToLatest')
  ) {
    throw new Error('expected BottomPanel GitGraph to render only typed Mermaid GitGraph and forbid document-version fallback')
  }
  if (
    !ganttBottomText.includes('GanttTimelineTransportPanel') ||
    !ganttBottomText.includes("useMermaidGanttDocument({ purpose: 'workflow' })") ||
    !ganttBottomText.includes('onSelectedRowKeyChange={handleDiagramSelectedRowKeyChange}') ||
    ganttBottomText.includes('MermaidDiagramPanelView') ||
    ganttBottomText.includes('renderMode="diagram"')
  ) {
    throw new Error('expected BottomPanel Gantt-Timeline to reuse the shared transport bar UI as the workflow surface')
  }
  if (
    !timelineBottomText.includes('GanttTimelineTransportPanel') ||
    !timelineBottomText.includes("useMermaidGanttDocument({ purpose: 'media' })") ||
    !/<GanttTimelineTransportPanel\b[^>]*code=\{mediaGanttCode\}[^>]*compact=\{compact\}[^>]*mode="media"[^>]*\/>/.test(timelineBottomText) ||
    timelineBottomText.includes('MermaidDiagramPanelView') ||
    timelineBottomText.includes('useMermaidTimelineDocument') ||
    timelineBottomText.includes('kind="timeline"') ||
    timelineBottomText.includes('renderMode="diagram"') ||
    timelineBottomText.includes('<GanttTimelineTransportPanel code={ganttCode} compact={compact} />') ||
    timelineBottomText.includes('TimelineTransportControls') ||
    timelineBottomText.includes('useTimelineTransportPlayback') ||
    timelineBottomText.includes('buildMermaidGanttTimelineModel') ||
    timelineBottomText.includes('data-kg-gantt-timeline-transport')
  ) {
    throw new Error('expected BottomPanel Timeline to always mount the shared media editor transport while workflow diagrams stay under BottomPanel Gantt-Timeline')
  }
  if (
    ganttTransportText.includes('<TimelineTransportChrome') ||
    ganttTransportText.includes('useTimelineTransportPlayback') ||
    !ganttTransportText.includes('useGanttTimelineTransportRouteModel') ||
    !ganttTransportText.includes('GanttTimelineTransportSurface') ||
    ganttTransportText.includes('useGanttTimelineTransportSurfaceModel') ||
    ganttTransportText.includes('useGanttTimelineTransportCommandModel') ||
    ganttTransportText.includes('useGanttTimelineTransportInteractionModel') ||
    ganttTransportText.includes('useGanttTimelineTransportPlaybackModel') ||
    ganttTransportText.includes('useGanttTimelineTransportSession') ||
    ganttTransportText.includes('useGanttTimelineTransportChromeModel') ||
    ganttTransportText.includes('useGanttTimelineTransportRulerModel') ||
    ganttTransportText.includes('useGanttTimelineTransportShellModel') ||
    ganttTransportText.includes('useGanttTimelineDocumentActions') ||
    ganttTransportText.includes('resolveMermaidGanttTimelineRowKeyAtPosition') ||
    ganttTransportText.includes('useGanttTimelineInteractions') ||
    ganttTransportText.includes('useGanttTimelineSelectionSync') ||
    ganttTransportText.includes('useGanttTimelineTransportView') ||
    ganttTransportText.includes('showRange={false}') ||
    ganttTransportText.includes('shellClassName="timeline-transport-shell--video-sequence"') ||
    ganttTransportText.includes('<VideoSequenceTimelineRuler') ||
    ganttTransportText.includes('VideoSequenceMonitorPanel') ||
    ganttTransportText.includes('rulerBelow={(') ||
    !ganttTransportChromeModelText.includes('VIDEO_SEQUENCE_TIMELINE_TOOLS') ||
    ganttTransportText.includes('useTimelinePreviewBootstrap') ||
    ganttTransportText.includes('useTimelinePreviewMonitorContext') ||
    ganttTransportText.includes('previewMonitorContext.monitorScopes') ||
    ganttTransportText.includes('previewBootstrap.collection') ||
    ganttTransportText.includes('previewBootstrap.documentKey') ||
    ganttTransportText.includes('previewBootstrap.exportPlan') ||
    ganttTransportText.includes('buildVideoSequenceExportPlan') ||
    ganttTransportText.includes('readVideoSequenceTimelineModelFromMarkdown') ||
    ganttTransportText.includes('buildVideoSequenceTimelineToolStatus') ||
    ganttTransportText.includes('resolveVisibleVideoSequenceTimelineLaneCount') ||
    ganttTransportText.includes('useTimelinePreviewMonitorBinding') ||
    ganttTransportText.includes('cleanTimelinePreviewDocumentKey') ||
    ganttTransportText.includes('useGanttTimelineDisplayModel') ||
    ganttTransportText.includes('useGanttTimelineMediaDuration') ||
    ganttTransportText.includes('data-kg-video-sequence-export="video"') ||
    ganttTransportText.includes('data-kg-video-sequence-export="audio"') ||
    ganttTransportText.includes('Download edited video') ||
    ganttTransportText.includes('Download edited audio') ||
    ganttTransportText.includes('data-kg-video-sequence-timeline') ||
    ganttTransportText.includes('timeline-transport-chrome--mermaid-gantt') ||
    ganttTransportText.includes('timeline-video-sequence-tool-strip') ||
    ganttTransportText.includes('timeline-transport-chrome-actions') ||
    ganttTransportText.includes('totalLabel={transportRulerModel.chrome.totalLabel}') ||
    ganttTransportText.includes("'data-kg-gantt-timeline-transport': 'bottomPanel'") ||
    ganttTransportText.includes('timelineTransportDocumentKey') ||
    ganttTransportText.includes('timelineTransportPosition') ||
    ganttTransportText.includes('timelineTransportPlaying') ||
    ganttTransportText.includes('timelineTransportPlaybackRate') ||
    ganttTransportText.includes('markdownDocumentName: state.markdownDocumentName') ||
    ganttTransportText.includes('markdownText: state.markdownDocumentText') ||
    ganttTransportText.includes("selectedRowKey: state.mermaidDiagramSelectedRowKeyByKind.gantt") ||
    ganttTransportText.includes('setMermaidDiagramSelectedRowKey: state.setMermaidDiagramSelectedRowKey') ||
    ganttTransportText.includes('useGraphStore.getState()') ||
    ganttTransportText.includes('dispatchTimelineTransportPlaybackRequest') ||
    ganttTransportText.includes('transportDocumentKey === documentKey') ||
    ganttTransportText.includes('resolveTimelineTransportPlaybackRate(') ||
    ganttTransportText.includes('timeline-transport-chrome--capcut') ||
    ganttTransportText.includes('GANTT_TIMELINE_TRANSPORT_ZOOM_LEVELS') ||
    ganttTransportText.includes('aregrid/frame') ||
    ganttTransportText.includes('/Users/')
  ) {
    throw new Error('expected shared Gantt-Timeline transport to own playback/scrub state, row-key sync, and neutral BottomPanel markers without copied fixture/source tokens')
  }
}
