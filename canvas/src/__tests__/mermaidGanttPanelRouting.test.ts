import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { annotateInteractiveMermaidSelectionRows } from '@/lib/diagram/InteractiveMermaidDiagram'
import {
  buildMermaidGanttCodeFromNeutralTimelinePayload,
  parseMermaidDiagramCodeModel,
  readFrontmatterMermaidDiagramCodes,
  readYamlFrontmatterMermaidDiagramCodes,
  resolveMermaidDiagramCode,
} from '@/lib/mermaid/mermaidDiagramCode'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import { assertGanttPanelRoutingSurface } from './mermaidGanttPanelRoutingSurfaceAssertions'
import { assertGanttPanelRoutingTransport } from './mermaidGanttPanelRoutingTransportAssertions'
import { assertGanttPanelRoutingBehavior } from './mermaidGanttPanelRoutingBehaviorAssertions'

const root = () => resolve(process.cwd(), 'src')
const readSource = (...parts: string[]) => readFileSync(resolve(root(), ...parts), 'utf8')
export function testTimelineBarClickRequiresDragIntentBeforePreview() {
  const interactionsText = readSource('features', 'gitgraph', 'useGanttTimelineInteractions.ts')
  const dragCommitGuardIndex = interactionsText.indexOf('if (!resolveMermaidGanttBarDragCommitted(preview.deltaPx) && !displayLaneDelta) return')
  const dragPreviewUpdateIndex = interactionsText.indexOf('setDragPreview(nextPreview)')
  const trackPointerStartIndex = interactionsText.indexOf('const handleTrackPointerStart')
  const trackPointerStartEndIndex = interactionsText.indexOf('return {', trackPointerStartIndex)
  const trackPointerStartText = interactionsText.slice(trackPointerStartIndex, trackPointerStartEndIndex)
  if (
    dragCommitGuardIndex < 0 ||
    dragPreviewUpdateIndex < 0 ||
    dragCommitGuardIndex > dragPreviewUpdateIndex ||
    trackPointerStartText.includes('setDragPreview(') ||
    trackPointerStartText.includes('setTransportPlaybackPosition(span.startMinutes)')
  ) {
    throw new Error('expected Timeline bar clicks to select without seeking or entering visual drag preview before drag intent')
  }
}
export function testTypedMermaidDiagramResolverReadsGitGraphAndGanttFrontmatter() {
  const markdown = [
    '---',
    'flow_diagrams:',
    '  key: flow_diagrams',
    '  type: object',
    '  value:',
    '    source_flow:',
    '      key: source_flow',
    '      type: mermaid_gitgraph',
    '      value: |-',
    '        gitGraph',
    '          commit id:"source_input"',
    '          branch compute',
    '          checkout compute',
    '          commit id:"inline_compute"',
    '    time_flow:',
    '      key: time_flow',
    '      type: mermaid_gantt',
    '      value: |-',
    '        gantt',
    '          title Dynamic compute flow',
    '          section Critical path',
    '          Inline compute :crit, compute, 2026-06-05, 1d',
    '    chronology_flow:',
    '      key: chronology_flow',
    '      type: mermaid_timeline',
    '      value: |-',
    '        timeline LR',
    '          title Dynamic compute chronology',
    '          section Inputs',
    '            Source fields : KTV values',
    '          section Compute',
    '            Inline compute : Summary output',
    '    system_architecture:',
    '      key: system_architecture',
    '      type: mermaid_architecture',
    '      value: |-',
    '        architecture-beta',
    '          group cloud(cloud)[Cloud]',
    '          service agent(server)[Agent API] in cloud',
    '          service mcp(server)[MCP Worker] in cloud',
    '          agent:R --> L:mcp',
    '    run_events:',
    '      key: run_events',
    '      type: mermaid_eventmodeling',
    '      value: |-',
    '        eventmodeling',
    '        tf 01 ui UserBrief',
    '        tf 02 cmd StartRun',
    '        tf 03 evt RunStarted',
    '---',
    '',
    '# Flow diagrams',
  ].join('\n')
  const gitGraphCode = resolveMermaidDiagramCode(
    readYamlFrontmatterMermaidDiagramCodes(markdown, 'gitgraph'),
    'gitgraph',
  )
  if (!gitGraphCode.includes('commit id:"source_input"')) {
    throw new Error('expected typed mermaid_gitgraph frontmatter to resolve GitGraph code')
  }
  const ganttCode = resolveMermaidDiagramCode(
    readYamlFrontmatterMermaidDiagramCodes(markdown, 'gantt'),
    'gantt',
  )
  if (!ganttCode.includes('Inline compute :crit')) {
    throw new Error('expected typed mermaid_gantt frontmatter to resolve Gantt code')
  }
  const model = parseMermaidDiagramCodeModel(ganttCode, 'gantt')
  const criticalTask = model.rows.find(row => row.kind === 'task' && row.label === 'Inline compute')
  if (!criticalTask) {
    throw new Error('expected Gantt parser model to expose task rows')
  }
  const timelineCode = resolveMermaidDiagramCode(
    readYamlFrontmatterMermaidDiagramCodes(markdown, 'timeline'),
    'timeline',
  )
  if (!timelineCode.includes('timeline LR')) {
    throw new Error('expected typed mermaid_timeline frontmatter to resolve Timeline code with direction')
  }
  const timelineModel = parseMermaidDiagramCodeModel(timelineCode, 'timeline')
  const computeEvent = timelineModel.rows.find(row => row.kind === 'event' && row.label === 'Inline compute')
  if (!computeEvent) {
    throw new Error('expected Timeline parser model to expose chronology event rows')
  }
  const architectureCode = resolveMermaidDiagramCode(
    readYamlFrontmatterMermaidDiagramCodes(markdown, 'architecture'),
    'architecture',
  )
  if (!architectureCode.includes('architecture-beta') || !architectureCode.includes('service agent')) {
    throw new Error('expected typed mermaid_architecture frontmatter to resolve Architecture code')
  }
  const architectureModel = parseMermaidDiagramCodeModel(architectureCode, 'architecture')
  const serviceRow = architectureModel.rows.find(row => row.kind === 'service' && row.label === 'agent')
  if (!serviceRow) {
    throw new Error('expected Architecture parser model to expose service rows')
  }
  const eventModelingCode = resolveMermaidDiagramCode(
    readYamlFrontmatterMermaidDiagramCodes(markdown, 'eventmodeling'),
    'eventmodeling',
  )
  if (!eventModelingCode.includes('eventmodeling') || !eventModelingCode.includes('RunStarted')) {
    throw new Error('expected typed mermaid_eventmodeling frontmatter to resolve Event Modeling code')
  }
  const eventModel = parseMermaidDiagramCodeModel(eventModelingCode, 'eventmodeling')
  const eventRow = eventModel.rows.find(row => row.kind === 'event' && row.label === 'RunStarted')
  if (!eventRow) {
    throw new Error('expected Event Modeling parser model to expose event rows')
  }
}
export function testTypedMermaidDiagramResolverReadsParsedGraphMetadata() {
  const graphData = {
    type: 'Graph',
    nodes: [],
    edges: [],
    metadata: {
      frontmatterMeta: {
        flow_diagrams: {
          key: 'flow_diagrams',
          type: 'object',
          value: {
            time_flow: {
              key: 'time_flow',
              type: 'mermaid_gantt',
              value: [
                'gantt',
                '  title Runtime graph',
                '  section Panels',
                '  Render Gantt :crit, render, 2026-06-05, 1d',
              ].join('\n'),
            },
            chronology_flow: {
              key: 'chronology_flow',
              type: 'mermaid_timeline',
              value: [
                'timeline LR',
                '  title Runtime chronology',
                '  section Panels',
                '    Render Timeline : BottomPanel route',
              ].join('\n'),
            },
            system_architecture: {
              key: 'system_architecture',
              type: 'mermaid_architecture',
              value: [
                'architecture-beta',
                '  group cloud(cloud)[Cloud]',
                '  service mcp(server)[MCP Worker] in cloud',
              ].join('\n'),
            },
            run_events: {
              key: 'run_events',
              type: 'mermaid_eventmodeling',
              value: [
                'eventmodeling',
                'tf 01 ui UserBrief',
                'tf 02 cmd StartRun',
                'tf 03 evt RunStarted',
              ].join('\n'),
            },
          },
        },
      },
    },
  }
  const ganttCode = resolveMermaidDiagramCode(
    readFrontmatterMermaidDiagramCodes(graphData, 'gantt'),
    'gantt',
  )
  if (!ganttCode.includes('Render Gantt :crit')) {
    throw new Error('expected parsed graph frontmatter metadata to resolve typed Gantt code')
  }
  const timelineCode = resolveMermaidDiagramCode(
    readFrontmatterMermaidDiagramCodes(graphData, 'timeline'),
    'timeline',
  )
  if (!timelineCode.includes('Render Timeline')) {
    throw new Error('expected parsed graph frontmatter metadata to resolve typed Timeline code')
  }
  const architectureCode = resolveMermaidDiagramCode(
    readFrontmatterMermaidDiagramCodes(graphData, 'architecture'),
    'architecture',
  )
  if (!architectureCode.includes('MCP Worker')) {
    throw new Error('expected parsed graph frontmatter metadata to resolve typed Architecture code')
  }
  const eventModelingCode = resolveMermaidDiagramCode(
    readFrontmatterMermaidDiagramCodes(graphData, 'eventmodeling'),
    'eventmodeling',
  )
  if (!eventModelingCode.includes('RunStarted')) {
    throw new Error('expected parsed graph frontmatter metadata to resolve typed Event Modeling code')
  }
}
export function testTypedMermaidDiagramResolverReadsNeutralFlowTimelinePayload() {
  const timelinePayload = {
    title: 'URL to MP4 Agent Demo',
    timelineTracks: [
      { id: 'capture', label: 'Capture URL', startMs: 0, durationMs: 1200 },
      { id: 'extract', label: 'Extract identity', startMs: 1200, durationMs: 1200 },
      { id: 'storyboard', label: 'Storyboard scenes', startMs: 2400, durationMs: 1200 },
      { id: 'compose', label: 'Animate HTML', startMs: 3600, durationMs: 1200 },
      { id: 'artifact', label: 'Persist MP4', startMs: 4800, durationMs: 1200 },
    ],
    timelineLanes: [
      { id: 'lane:capture', label: 'Source capture', tracks: ['capture', 'extract'] },
      { id: 'lane:render', label: 'Composition render', tracks: ['storyboard', 'compose', 'artifact'] },
    ],
  }
  const directCode = buildMermaidGanttCodeFromNeutralTimelinePayload(timelinePayload)
  if (
    !directCode.includes('gantt') ||
    !directCode.includes('section Source capture') ||
    !directCode.includes('Capture URL : capture, kgpos_0, 00:00, 0.02m') ||
    !directCode.includes('Persist MP4 : artifact, kgpos_0_08, 00:05, 0.02m')
  ) {
    throw new Error(`expected neutral timeline payload to convert to source-backed Mermaid Gantt code, got ${directCode}`)
  }
  const graphData = {
    type: 'Graph',
    nodes: [{
      id: 'html_video_source_spec',
      type: 'InputWidget',
      label: 'Programmatic Video Render Spec',
      properties: {
        data_json: {
          key: 'data_json',
          type: 'json',
          value: JSON.stringify(timelinePayload),
        },
      },
    }],
    edges: [],
    metadata: {},
  }
  const ganttCode = resolveMermaidDiagramCode(
    readFrontmatterMermaidDiagramCodes(graphData, 'gantt'),
    'gantt',
  )
  if (!ganttCode.includes('URL to MP4 Agent Demo') || !ganttCode.includes('section Composition render')) {
    throw new Error('expected parsed Storyboard Widget graph data_json timelineTracks to resolve as Gantt code')
  }
  const model = parseMermaidDiagramCodeModel(ganttCode, 'gantt')
  const rows = model.rows.filter(row => row.kind === 'task')
  if (rows.length !== 5 || !rows.some(row => row.label === 'Animate HTML')) {
    throw new Error(`expected neutral Storyboard Widget timeline payload to expose five Gantt task rows, got ${JSON.stringify(rows)}`)
  }
}
export function testInteractiveMermaidSelectionAnnotatesSiblingChartGeometry() {
  const { dom, restore } = initJsdomHarness()
  const globalWithSerializer = globalThis as typeof globalThis & { XMLSerializer?: typeof XMLSerializer }
  const originalXmlSerializer = globalWithSerializer.XMLSerializer
  globalWithSerializer.XMLSerializer = dom.window.XMLSerializer as unknown as typeof XMLSerializer
  try {
    const backgroundRows = Array.from({ length: 20 }, (_, index) =>
      `<g class="background-row"><circle cx="${index}" cy="${index}" r="1"/><text>background ${index}</text></g>`,
    ).join('')
    const svg = [
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 120">',
      `<g id="whole-chart">${backgroundRows}`,
      '<g id="target-commit"><path id="target-lane" d="M10 40H160"/><circle id="target-dot" cx="80" cy="40" r="8"/><text x="86" y="44">source_input</text></g>',
      '</g>',
      '</svg>',
    ].join('')
    const annotated = annotateInteractiveMermaidSelectionRows(svg, [{
      key: 'line:1',
      labels: ['commit id:"source_input"', 'source_input'],
      kind: 'commit',
      lineNumber: 2,
    }])
    const doc = new DOMParser().parseFromString(annotated, 'image/svg+xml')
    const targetDot = doc.querySelector('#target-dot')
    const targetLane = doc.querySelector('#target-lane')
    const targetGroup = doc.querySelector('#target-commit')
    const broadGroup = doc.querySelector('#whole-chart')
    if (targetDot?.getAttribute('data-kg-mermaid-row-key') !== 'line:1') {
      throw new Error('expected direct click target circle to carry the matched Mermaid row key')
    }
    if (targetLane?.getAttribute('data-kg-mermaid-row-key') !== 'line:1') {
      throw new Error('expected direct click target path to carry the matched Mermaid row key')
    }
    if (targetGroup?.getAttribute('data-kg-mermaid-row-target') !== '1') {
      throw new Error('expected bounded chart group to be selectable from rendered SVG geometry')
    }
    if (broadGroup?.getAttribute('data-kg-mermaid-row-key')) {
      throw new Error('expected broad aggregate chart group not to inherit a row key from descendant text')
    }
    if (annotated.includes('data-kg-mermaid-diagram-row-marker')) {
      throw new Error('expected direct SVG selection annotation without proxy row markers')
    }
  } finally {
    if (typeof originalXmlSerializer === 'undefined') {
      delete globalWithSerializer.XMLSerializer
    } else {
      globalWithSerializer.XMLSerializer = originalXmlSerializer
    }
    restore()
  }
}
export async function testGanttPanelRoutingUsesSharedGitGraphMermaidUtilities() {
  const toolbarText = readSource('lib', 'toolbar', 'ToolbarToolMenu.impl.tsx') + readSource('features', 'toolbar', 'FloatingPanelViewTabs.tsx')
  const canvasViewMenuText = readSource('components', 'toolbar', 'canvasViewMenu.ts')
  const canvasViewActionsText = readSource('components', 'toolbar', 'canvasViewActions.ts')
  const canvasViewSelectText = readSource('components', 'toolbar', 'Canvas2dRendererSelect.tsx')
  const canvasViewTypesText = readSource('components', 'toolbar', 'canvasViewTypes.ts')
  const canvasViewportText = readSource('components', 'CanvasViewport.tsx')
  const configRenderText = readSource('lib', 'config.render.ts')
  const uiCopyText = readSource('lib', 'config-copy', 'uiCopy.ts')
  const bottomPanelText = readSource('features', 'strybldr', 'StrybldrTimelineBottomPanel.tsx')
  const floatingTypeText = readSource('hooks', 'store', 'store-types', 'graph-state-chat-import.ts')
  const uiInitialStateText = readSource('hooks', 'store', 'uiSliceInitialState.ts')
  const bottomTypeText = readSource('hooks', 'store', 'store-types', 'core.ts')
  const iconText = readSource('features', 'panels', 'ui', 'mainPanelHelpIconLibrary.tsx')
  const panelText = readSource('features', 'gitgraph', 'MermaidDiagramPanelView.tsx')
  const gitGraphFloatingText = readSource('features', 'gitgraph', 'GitGraphFloatingPanelView.tsx')
  const gitGraphCanvasText = readSource('components', 'MermaidGitGraphCanvas.tsx')
  const ganttCanvasText = readSource('components', 'MermaidGanttCanvas.tsx')
  const mediaCanvasText = readSource('components', 'MediaCanvas.tsx')
  const ganttFloatingText = readSource('features', 'gitgraph', 'GanttFloatingPanelView.tsx')
  const timelineFloatingText = readSource('features', 'gitgraph', 'TimelineFloatingPanelView.tsx')
  const gitGraphBottomText = readSource('features', 'gitgraph', 'GitGraphBottomPanelView.tsx')
  const ganttBottomText = readSource('features', 'gitgraph', 'GanttBottomPanelView.tsx')
  const ganttTransportText = readSource('features', 'gitgraph', 'GanttTimelineTransportPanel.tsx')
  const ganttTransportRouteModelText = readSource('features', 'gitgraph', 'useGanttTimelineTransportRouteModel.ts')
  const ganttTransportSurfaceModelText = readSource('features', 'gitgraph', 'useGanttTimelineTransportSurfaceModel.ts')
  const ganttTransportSurfaceText = readSource('features', 'gitgraph', 'GanttTimelineTransportSurface.tsx')
  const ganttTransportCommandModelText = readSource('features', 'gitgraph', 'useGanttTimelineTransportCommandModel.ts')
  const ganttDocumentActionsText = readSource('features', 'gitgraph', 'useGanttTimelineDocumentActions.ts')
  const ganttDisplayModelText = readSource('features', 'gitgraph', 'useGanttTimelineDisplayModel.ts')
  const ganttInteractionsText = readSource('features', 'gitgraph', 'useGanttTimelineInteractions.ts')
  const ganttTransportInteractionModelText = readSource('features', 'gitgraph', 'useGanttTimelineTransportInteractionModel.ts')
  const ganttMediaDurationText = readSource('features', 'gitgraph', 'useGanttTimelineMediaDuration.ts')
  const ganttPlaybackControlsText = readSource('features', 'gitgraph', 'useGanttTimelinePlaybackControls.ts')
  const ganttTransportPlaybackModelText = readSource('features', 'gitgraph', 'useGanttTimelineTransportPlaybackModel.ts')
  const ganttSelectionSyncText = readSource('features', 'gitgraph', 'useGanttTimelineSelectionSync.ts')
  const ganttTransportViewText = readSource('features', 'gitgraph', 'useGanttTimelineTransportView.ts')
  const timelineBottomText = readSource('features', 'gitgraph', 'TimelineBottomPanelView.tsx')
  const videoSequenceExportText = readSource('components', 'timeline', 'videoSequenceExport.ts')
  const timelineTransportText = readSource('components', 'timeline', 'timelineTransport.ts')
  const surfaceBindingsText = readSource('components', 'timeline', 'timelineSurfaceBindings.ts')
  const timelinePlanSyncText = readSource('components', 'timeline', 'timelinePlanSync.ts')
  const timelinePreviewBootstrapText = readSource('components', 'timeline', 'useTimelinePreviewBootstrap.ts')
  const timelinePreviewCollectionText = readSource('components', 'timeline', 'useTimelinePreviewCollection.ts')
  const timelinePreviewActivitySurfaceModelText = readSource('components', 'timeline', 'useTimelinePreviewActivitySurfaceModel.ts')
  const timelinePreviewFamilyCompactionModelText = readSource('components', 'timeline', 'useTimelinePreviewFamilyCompactionModel.ts')
  const timelinePreviewFamilyDisclosureControllerText = readSource('components', 'timeline', 'useTimelinePreviewFamilyDisclosureController.ts')
  const timelinePreviewFamilyDisclosureModelText = readSource('components', 'timeline', 'useTimelinePreviewFamilyDisclosureModel.ts')
  const timelinePreviewFamilyDisclosureSurfaceModelText = readSource('components', 'timeline', 'useTimelinePreviewFamilyDisclosureSurfaceModel.ts')
  const timelinePreviewFamilySectionLayoutModelText = readSource('components', 'timeline', 'useTimelinePreviewFamilySectionLayoutModel.ts')
  const timelinePreviewFamilySectionChromeModelText = readSource('components', 'timeline', 'useTimelinePreviewFamilySectionChromeModel.ts')
  const timelinePreviewFamilySectionBodyModelText = readSource('components', 'timeline', 'useTimelinePreviewFamilySectionBodyModel.ts')
  const timelinePreviewFamilySectionsModelText = readSource('components', 'timeline', 'useTimelinePreviewFamilySectionsModel.ts')
  const timelinePreviewMediaContextText = readSource('components', 'timeline', 'useTimelinePreviewMediaContext.ts')
  const timelinePreviewScopeProjectionText = readSource('components', 'timeline', 'useTimelinePreviewScopeProjection.ts')
  const timelinePreviewMonitorContextText = readSource('components', 'timeline', 'useTimelinePreviewMonitorContext.ts')
  const timelinePreviewMonitorBindingText = readSource('components', 'timeline', 'useTimelinePreviewMonitorBinding.ts')
  const timelinePreviewMediaCanvasBindingText = readSource('components', 'timeline', 'useTimelinePreviewMediaCanvasBinding.ts')
  const timelinePreviewRouteEntryText = readSource('components', 'timeline', 'useTimelinePreviewRouteEntry.ts')
  const ganttTransportPreviewSessionText = readSource('features', 'gitgraph', 'useGanttTimelineTransportPreviewSession.ts')
  const ganttTransportSessionText = readSource('features', 'gitgraph', 'useGanttTimelineTransportSession.ts')
  const ganttTransportChromeModelText = readSource('features', 'gitgraph', 'useGanttTimelineTransportChromeModel.ts')
  const ganttTransportContextControlsText = readSource('features', 'gitgraph', 'GanttTimelineTransportContextControls.tsx')
  const ganttTransportHeaderToolsText = readSource('features', 'gitgraph', 'GanttTimelineTransportHeaderTools.tsx')
  const ganttTransportRulerModelText = readSource('features', 'gitgraph', 'useGanttTimelineTransportRulerModel.ts')
  const ganttTransportRulerText = readSource('features', 'gitgraph', 'GanttTimelineTransportRuler.tsx')
  const ganttTransportShellModelText = readSource('features', 'gitgraph', 'useGanttTimelineTransportShellModel.ts')
  const ganttTransportShellText = readSource('features', 'gitgraph', 'GanttTimelineTransportShell.tsx')
  const timelinePreviewMediaCanvasRenderModelText = readSource('components', 'timeline', 'useTimelinePreviewMediaCanvasRenderModel.ts')
  const timelinePreviewMediaCanvasRenderText = readSource('components', 'timeline', 'TimelinePreviewMediaCanvasRender.tsx')
  const timelinePreviewMediaCanvasFrameModelText = readSource('components', 'timeline', 'useTimelinePreviewMediaCanvasFrameModel.ts')
  const timelinePreviewMediaCanvasFrameText = readSource('components', 'timeline', 'TimelinePreviewMediaCanvasFrame.tsx')
  const timelinePreviewSurfaceShellModelText = readSource('components', 'timeline', 'useTimelinePreviewSurfaceShellModel.ts')
  const timelineSourceActivityModelText = readSource('components', 'timeline', 'useTimelineSourceActivityModel.ts')
  const timelinePreviewSurfaceModelText = readSource('components', 'timeline', 'useTimelinePreviewSurfaceModel.ts')
  const timelinePreviewSurfaceText = readSource('components', 'timeline', 'TimelinePreviewSurface.tsx')
  const mediaFormatPreferenceText = readSource('lib', 'media', 'mediaFormatPreference.ts')
  const timelinePreviewSyncText = readSource('components', 'timeline', 'timelinePreviewSync.ts')
  const timelinePreviewVideoBindingText = readSource('components', 'timeline', 'useTimelinePreviewVideoBinding.ts')
  const videoSequenceSourceRegistryText = readSource('components', 'timeline', 'videoSequenceSourceRegistry.ts')
  const localImportText = [readSource('features', 'markdown-workspace', 'workspaceImport', 'localImport.ts'), readSource('features', 'markdown-workspace', 'workspaceImport', 'localImportShared.ts')].join('\n')
  const importActionsText = readSource('features', 'markdown-workspace', 'useWorkspaceFileActions', 'importActions.ts')
  const launchFallbackText = readSource('features', 'toolbar', 'launchDropdownFallbacks.ts')
  const urlImportText = readSource('features', 'markdown-workspace', 'workspaceImport', 'urlImport.ts')
  const urlContentText = readSource('features', 'markdown-workspace', 'workspaceImport', 'urlContent.ts')
  const videoSequenceImportText = readSource('features', 'markdown-workspace', 'workspaceImport', 'videoSequenceTimelineImport.ts')
  const canvasFrontmatterPresetText = readSource('features', 'parsers', 'canvasFrontmatterPreset.ts')
  const resolverText = readSource('lib', 'mermaid', 'mermaidDiagramCode.ts')
  const plainMermaidText = readSource('features', 'markdown', 'ui', 'PlainMermaidDiagram.tsx')
  const interactiveMermaidText = readSource('lib', 'diagram', 'InteractiveMermaidDiagram.tsx')
  const selectionHelperText = readSource('lib', 'diagram', 'diagramRowSelection.ts')
  const mermaidSelectionText = readSource('lib', 'mermaid', 'mermaidDiagramSelection.ts')
  const gitGraphSelectionText = readSource('lib', 'mermaid', 'mermaidGitGraphSelection.ts')
  const svgSurfaceZoomRuntimeText = ['useSvgSurfaceZoomRuntime.ts', 'svgSurfaceGeometry.ts', 'svgSurfaceSelection.ts'].map(file => readSource('components', 'GraphCanvas', 'hooks', file)).join('\n')
  const ganttBarInteractionText = readSource('lib', 'mermaid', 'mermaidGanttBarInteraction.ts')
  const sources = {
    toolbarText, canvasViewMenuText, canvasViewActionsText, canvasViewSelectText, canvasViewTypesText,
    canvasViewportText, configRenderText, uiCopyText, bottomPanelText, floatingTypeText, uiInitialStateText,
    bottomTypeText, iconText, panelText, gitGraphFloatingText, gitGraphCanvasText, ganttCanvasText,
    mediaCanvasText, ganttFloatingText, timelineFloatingText, gitGraphBottomText, ganttBottomText,
    ganttTransportText, ganttTransportRouteModelText, ganttTransportSurfaceModelText,
    ganttTransportSurfaceText, ganttTransportCommandModelText, ganttDocumentActionsText,
    ganttDisplayModelText, ganttInteractionsText, ganttTransportInteractionModelText, ganttMediaDurationText,
    ganttPlaybackControlsText, ganttTransportPlaybackModelText, ganttSelectionSyncText,
    ganttTransportViewText, timelineBottomText, videoSequenceExportText, timelineTransportText,
    surfaceBindingsText, timelinePlanSyncText, timelinePreviewBootstrapText, timelinePreviewCollectionText,
    timelinePreviewActivitySurfaceModelText, timelinePreviewFamilyCompactionModelText,
    timelinePreviewFamilyDisclosureControllerText, timelinePreviewFamilyDisclosureModelText,
    timelinePreviewFamilyDisclosureSurfaceModelText, timelinePreviewFamilySectionLayoutModelText,
    timelinePreviewFamilySectionChromeModelText, timelinePreviewFamilySectionBodyModelText,
    timelinePreviewFamilySectionsModelText, timelinePreviewMediaContextText,
    timelinePreviewScopeProjectionText, timelinePreviewMonitorContextText, timelinePreviewMonitorBindingText,
    timelinePreviewMediaCanvasBindingText, timelinePreviewRouteEntryText, ganttTransportPreviewSessionText,
    ganttTransportSessionText, ganttTransportChromeModelText, ganttTransportContextControlsText,
    ganttTransportHeaderToolsText, ganttTransportRulerModelText, ganttTransportRulerText,
    ganttTransportShellModelText, ganttTransportShellText, timelinePreviewMediaCanvasRenderModelText,
    timelinePreviewMediaCanvasRenderText, timelinePreviewMediaCanvasFrameModelText,
    timelinePreviewMediaCanvasFrameText, timelinePreviewSurfaceShellModelText,
    timelineSourceActivityModelText, timelinePreviewSurfaceModelText, timelinePreviewSurfaceText,
    mediaFormatPreferenceText, timelinePreviewSyncText, timelinePreviewVideoBindingText,
    videoSequenceSourceRegistryText, localImportText, importActionsText, launchFallbackText, urlImportText,
    urlContentText, videoSequenceImportText, canvasFrontmatterPresetText, resolverText, plainMermaidText,
    interactiveMermaidText, selectionHelperText, mermaidSelectionText, gitGraphSelectionText,
    svgSurfaceZoomRuntimeText, ganttBarInteractionText,
  }
  assertGanttPanelRoutingSurface(sources, readSource)
  assertGanttPanelRoutingTransport(sources)
  await assertGanttPanelRoutingBehavior(sources)
}
