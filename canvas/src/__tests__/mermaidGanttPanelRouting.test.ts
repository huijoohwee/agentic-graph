import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { computeSvgSurfaceWideTimelineFitTransform } from '@/components/GraphCanvas/hooks/useSvgSurfaceZoomRuntime'
import { buildVideoSequenceExportPlan } from '@/components/timeline/videoSequenceExport'
import {
  readVideoSequenceSourcePlayableUrl,
  readVideoSequenceTimelineModelFromMarkdown,
} from '@/components/timeline/videoSequenceTimeline'
import { buildVideoSequenceSourceRegistryKeys } from '@/components/timeline/videoSequenceSourceRegistry'
import { buildVideoSequenceTimelineImportMarkdown } from '@/features/markdown-workspace/workspaceImport/videoSequenceTimelineImport'
import { fetchWorkspaceUrlContent } from '@/features/markdown-workspace/workspaceImport/urlContent'
import { annotateInteractiveMermaidSelectionRows } from '@/lib/diagram/InteractiveMermaidDiagram'
import {
  findMermaidDiagramRowKeyForSvgLabel,
  readMermaidDirectSelectionLabels,
} from '@/lib/mermaid/mermaidDiagramSelection'
import {
  MERMAID_GANTT_BAR_DRAG_COMMIT_MIN_DELTA_PX,
  MERMAID_GANTT_BAR_DRAG_EDGE_SCROLL_THRESHOLD_PX,
  buildMermaidGanttTimelineModel,
  buildMermaidGanttTimelineTicks,
  formatMermaidGanttTimelineOffset,
  insertMermaidGanttVideoSequenceOperationRow,
  isMermaidGanttBarDragMode,
  resolveMermaidGanttBarDragCommitted,
  resolveMermaidGanttBarDragPreview,
  resolveMermaidGanttTimelineDragEffectiveDelta,
  resolveMermaidGanttTimelineDragPreviewSpan,
  resolveMermaidGanttTimelineRowKeyAtPosition,
  replaceFirstMermaidGanttFrontmatterCode,
  splitMermaidGanttCodeRowAtOffset,
  splitMermaidGanttVideoSequenceClipGroupAtOffset,
  shouldExposeMermaidGanttBarInteraction,
  updateMermaidGanttCodeRowTiming,
  updateMermaidGanttVideoSequenceClipGroupTiming,
} from '@/lib/mermaid/mermaidGanttBarInteraction'
import {
  buildMermaidGanttCodeFromNeutralTimelinePayload,
  parseMermaidDiagramCodeModel,
  readFrontmatterMermaidDiagramCodes,
  readYamlFrontmatterMermaidDiagramCodes,
  resolveMermaidDiagramCode,
} from '@/lib/mermaid/mermaidDiagramCode'
import { parseCanvasWorkspaceFrontmatterPreset } from '@/lib/markdown/frontmatter'
import { normalizeWorkspaceImportUrlInput } from '@/lib/url'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import { useGraphStore } from '@/hooks/useGraphStore'
const root = () => resolve(process.cwd(), 'src')
const readSource = (...parts: string[]) => readFileSync(resolve(root(), ...parts), 'utf8')
export function testTimelineBarClickRequiresDragIntentBeforePreview() {
  const interactionsText = readSource('features', 'gitgraph', 'useGanttTimelineInteractions.ts')
  const dragCommitGuardIndex = interactionsText.indexOf('if (!resolveMermaidGanttBarDragCommitted(preview.deltaPx)) return')
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
    !directCode.includes('Capture URL : capture, 00:00, 1m') ||
    !directCode.includes('Persist MP4 : artifact, 00:05, 1m')
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
  const toolbarText = readSource('lib', 'toolbar', 'ToolbarToolMenu.impl.tsx')
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
  const svgSurfaceZoomRuntimeText = readSource('components', 'GraphCanvas', 'hooks', 'useSvgSurfaceZoomRuntime.ts')
  const ganttBarInteractionText = readSource('lib', 'mermaid', 'mermaidGanttBarInteraction.ts')
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
    !canvasViewMenuText.includes('gantt: ChartGantt') ||
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
    !timelineBottomText.includes('<GanttTimelineTransportPanel code={mediaGanttCode} compact={compact} mode="media" />') ||
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
    ganttTransportText.includes('VideoSequenceTimelineRuler') ||
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
  if (
    !videoSequenceExportText.includes('buildVideoSequenceExportPlan') ||
    !timelinePlanSyncText.includes('buildTimelinePreviewSyncPlan') ||
    !timelinePlanSyncText.includes('resolveTimelinePlanSourceTimeAtPosition') ||
    !timelinePlanSyncText.includes('resolveTimelinePlanPositionFromSourceTime') ||
    !timelinePlanSyncText.includes('resolveTimelinePlanDurationSeconds') ||
    !timelinePlanSyncText.includes('resolveTimelinePlanSourceUrl') ||
    !timelinePlanSyncText.includes('loadTimelineMediaReaderSummary') ||
    !timelinePlanSyncText.includes('loadTimelinePlanVideoMetadata') ||
    !timelinePlanSyncText.includes('selectedRowKey') ||
    !timelineTransportText.includes('resolveTimelineTransportSnapshot') ||
    !timelineTransportText.includes('useTimelineDocumentStoreBinding') ||
    !timelineTransportText.includes('useTimelineTransportSnapshotReader') ||
    !timelineTransportText.includes('useTimelineTransportStoreBinding') ||
    !surfaceBindingsText.includes('useTimelineGanttSelectionStoreBinding') ||
    !surfaceBindingsText.includes('useTimelineDocumentMutationStoreBinding') ||
    !surfaceBindingsText.includes('useTimelineDocumentSnapshotReader') ||
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
    !ganttTransportSurfaceModelText.includes('useTimelineMediaReaderSummary') ||
    !ganttTransportSurfaceModelText.includes('const mediaPreviewSourceUrl = React.useMemo') ||
    !ganttTransportSurfaceModelText.includes('const thumbnailSourceUrl = React.useMemo') ||
    !ganttTransportSurfaceModelText.includes('resolveTimelinePlanSourceUrl') ||
    !ganttTransportSurfaceModelText.includes('playbackUnitsPerMs: transportClockDisplayModel.playbackUnitsPerMs') ||
    !ganttTransportSurfaceModelText.includes('const selectedPreviewEmpty = !!transportSession.selectedSpan && !transportSession.previewPlan') ||
    ganttTransportSurfaceModelText.includes('transportSession.disabled || selectedPreviewEmpty') ||
    ganttTransportSurfaceModelText.includes('transportSession.setTransportPlaying(false)') ||
    !ganttTransportSurfaceModelText.includes('transportClockDisplayModel') ||
    ganttTransportSurfaceModelText.includes('emptySelectionCurrentLabel') ||
    ganttTransportSurfaceModelText.includes('emptySelectionTotalLabel') ||
    ganttTransportSurfaceModelText.includes('hasMediaDurationScale: selectedPreviewEmpty ? false') ||
    ganttTransportSurfaceModelText.includes('mediaDurationSeconds: selectedPreviewEmpty ? 0 : transportSession.mediaDurationSeconds') ||
    !ganttTransportSurfaceModelText.includes('hasMediaDurationScale: transportClockDisplayModel.hasMediaDurationScale') ||
    !ganttTransportSurfaceModelText.includes('mediaDurationSeconds: transportSession.mediaDurationSeconds') ||
    !ganttTransportSurfaceModelText.includes("timelineMode: workflowMode ? 'workflow' : (selectedPreviewEmpty ? 'empty' : 'source-backed')") ||
    !ganttTransportSurfaceModelText.includes('sourceThumbnails: thumbnailSummary.thumbnails') || !ganttTransportSurfaceModelText.includes('sourceThumbnailWindows') || !ganttTransportSurfaceModelText.includes('sourceThumbnailSets') ||
    !ganttTransportSurfaceText.includes('GanttTimelineTransportSurface') ||
    !ganttTransportSurfaceText.includes('GanttTimelineTransportShell') ||
    !ganttTransportSurfaceText.includes('model: GanttTimelineTransportSurfaceModel') ||
    !ganttTransportCommandModelText.includes('useGanttTimelineTransportCommandModel') ||
    !ganttTransportCommandModelText.includes('useGanttTimelineDocumentActions') ||
    !ganttTransportCommandModelText.includes('chromeModelCommands') ||
    !ganttTransportCommandModelText.includes('handleCommittedDragUpdate: documentActions.handleCommittedDragUpdate') ||
    !ganttTransportCommandModelText.includes('handleToggleVideoSequenceTimingSyncMode: documentActions.handleToggleVideoSequenceTimingSyncMode') ||
    !ganttTransportCommandModelText.includes('timingSyncMode: documentActions.timingSyncMode') ||
    !ganttDocumentActionsText.includes('useGanttTimelineDocumentActions') ||
    !ganttDocumentActionsText.includes('useTimelineDocumentMutationStoreBinding') ||
    !ganttDocumentActionsText.includes('downloadVideoSequenceExport') ||
    !ganttDocumentActionsText.includes('useTimelineTransportTimingSyncStoreBinding') ||
    !ganttDocumentActionsText.includes('setTimelineTransportTimingSyncMode(timingSyncMode ===') ||
    !ganttDocumentActionsText.includes('resolveGanttTimelineVideoSequenceSplitAction') ||
    !ganttDocumentActionsText.includes('insertMermaidGanttVideoSequenceOperationRow') ||
    !ganttDocumentActionsText.includes('useTimelineDocumentSnapshotReader') ||
    !ganttDocumentActionsText.includes('handleCommittedDragUpdate') ||
    !ganttDocumentActionsText.includes('updateGanttTimelineVideoSequenceClipTimingWithRipple') ||
    !ganttDocumentActionsText.includes('handleToggleVideoSequenceTimingSyncMode') ||
    !ganttDocumentActionsText.includes('resolveGanttTimelineVideoSequenceTimingSyncMode') ||
    !ganttDocumentActionsText.includes('syncMode: resolveGanttTimelineVideoSequenceTimingSyncMode({ span: actionContext.selectedSpan, timingSyncMode })') ||
    ganttDocumentActionsText.includes('const nextCode = updateMermaidGanttCodeRowTiming') ||
    !ganttDocumentActionsText.includes('replaceFirstMermaidGanttFrontmatterCode') ||
    !ganttDocumentActionsText.includes('upsertUiToast') ||
    !ganttDocumentActionsText.includes('AbortController') ||
    !ganttDocumentActionsText.includes('resolveVideoSequenceExportEvent') ||
    !ganttDocumentActionsText.includes('resolveVideoSequenceExportOutcome') ||
    !ganttDocumentActionsText.includes('createVideoSequenceExportSessionRecord') ||
    !ganttDocumentActionsText.includes('reduceVideoSequenceExportSessionRecord') ||
    !ganttDocumentActionsText.includes('resolveVideoSequenceExportRetryRequest') ||
    !ganttDocumentActionsText.includes('buildVideoSequenceExportSessionCollection') ||
    !ganttDocumentActionsText.includes('handleRetryEditedMediaExport') ||
    !ganttDocumentActionsText.includes('latestRetryableExportSession') ||
    !ganttDocumentActionsText.includes('handleRetryEditedMediaExportRunId') ||
    !ganttTransportChromeModelText.includes('exportSessionCollection.surface') ||
    !ganttTransportChromeModelText.includes('exportSessionCollection.retryControl') ||
    !ganttTransportChromeModelText.includes('handleRetryEditedMediaExport(args.latestRetryableExportSession)') ||
    !ganttTransportChromeModelText.includes('handleRetryEditedMediaExportRunId') ||
    !ganttTransportChromeModelText.includes('clipActionButtons') ||
    !ganttTransportChromeModelText.includes("action: 'nudge-back'") ||
    !ganttTransportChromeModelText.includes("action: 'trim-start-back'") ||
    !ganttTransportChromeModelText.includes("action: 'snap-to-playhead'") ||
    !ganttTransportChromeModelText.includes("action: 'split-at-playhead'") ||
    !ganttTransportChromeModelText.includes('Download edited video') ||
    !ganttTransportChromeModelText.includes('Download edited audio') ||
    !ganttTransportHeaderToolsText.includes('data-kg-video-sequence-clip-edit={button.action}') ||
    !ganttTransportHeaderToolsText.includes('renderClipActionIcon(button.icon)') ||
    !ganttTransportHeaderToolsText.includes('data-kg-video-sequence-export={button.dataValue}') ||
    !ganttTransportContextControlsText.includes('data-kg-video-sequence-export-session') ||
    !ganttTransportContextControlsText.includes('data-kg-video-sequence-export-session-mode') ||
    !ganttTransportContextControlsText.includes('data-kg-video-sequence-export-session-retry') ||
    !ganttTransportContextControlsText.includes('data-kg-video-sequence-export-session-tone') ||
    !ganttTransportRulerModelText.includes('useGanttTimelineTransportRulerModel') ||
    !ganttTransportRulerModelText.includes('clampTimelineTransportValue') ||
    !ganttTransportRulerModelText.includes("'--kg-video-sequence-lane-count': args.visibleLaneCount") ||
    !ganttTransportRulerModelText.includes("subtitleLabel: `${args.taskSpans.length} timeline rows`") ||
    ganttTransportRulerModelText.includes("titleLabel: 'Gantt-Timeline'") ||
    !ganttTransportRulerModelText.includes('value: clampTimelineTransportValue(args.positionMinutes, 0, Math.max(1, args.maxMinutes))') ||
    !ganttTransportRulerModelText.includes("'data-kg-gantt-timeline-ruler': 'bottomPanel'") ||
    !ganttTransportRulerModelText.includes('sourceThumbnails: readonly TimelineMediaReaderThumbnail[]') || !ganttTransportRulerModelText.includes('sourceThumbnailWindows: readonly VideoSequenceTimelineThumbnailWindow[]') || !ganttTransportRulerModelText.includes('sourceThumbnailSets: readonly VideoSequenceTimelineSourceThumbnailSet[]') ||
    !ganttTransportRulerModelText.includes('onSelectRowPosition: (rowKey: string, positionMinutes: number) => void') ||
    !ganttTransportRulerModelText.includes('scopes: args.scopes') ||
    !ganttTransportRulerText.includes('GanttTimelineTransportRuler') ||
    !ganttTransportRulerText.includes('VideoSequenceTimelineRuler') ||
    !ganttTransportRulerText.includes('projectionMode={args.model.mode}') ||
    !ganttTransportRulerText.includes('onSelectRowKey={args.model.onSelectRowKey}') ||
    !ganttTransportRulerText.includes('onSelectRowPosition={args.model.onSelectRowPosition}') ||
    !ganttTransportRulerText.includes('sourceThumbnails={args.model.sourceThumbnails}') || !ganttTransportRulerText.includes('sourceThumbnailWindows={args.model.sourceThumbnailWindows}') || !ganttTransportRulerText.includes('sourceThumbnailSets={args.model.sourceThumbnailSets}') ||
    !ganttTransportRulerText.includes('scopes={args.model.scopes}') ||
    !ganttTransportShellModelText.includes('useGanttTimelineTransportShellModel') ||
    !ganttTransportShellModelText.includes("ariaLabel: 'Scrub Gantt-timeline position'") ||
    !ganttTransportShellModelText.includes("chromeClassName: 'timeline-transport-chrome--mermaid-gantt p-2'") ||
    !ganttTransportShellModelText.includes("shellClassName: 'timeline-transport-shell--video-sequence'") ||
    !ganttTransportShellModelText.includes("'data-kg-gantt-timeline-transport': 'bottomPanel'") ||
    !ganttTransportShellModelText.includes("'data-kg-video-sequence-media-duration': args.mediaDurationSeconds > 0 ? args.mediaDurationSeconds : undefined") ||
    !ganttTransportShellModelText.includes("'data-kg-video-sequence-media-duration-scale': args.hasMediaDurationScale ? '1' : undefined") ||
    !ganttTransportShellModelText.includes("timelineMode: 'empty' | 'source-backed' | 'workflow'") ||
    !ganttTransportShellModelText.includes("'data-kg-video-sequence-timeline': args.timelineMode") ||
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
    !ganttTransportShellText.includes('showInlineProgress={args.shellModel.showInlineProgress}') ||
    !ganttTransportShellText.includes('showRange={args.shellModel.showRange}') ||
    !ganttTransportPlaybackModelText.includes('useGanttTimelineTransportPlaybackModel') ||
    !ganttTransportPlaybackModelText.includes('useGanttTimelinePlaybackControls') ||
    !ganttTransportPlaybackModelText.includes('useTimelineTransportPlayback') ||
    !ganttTransportPlaybackModelText.includes('onPlaybackEnd: playbackControls.handlePlaybackEnd') ||
    !ganttTransportPlaybackModelText.includes('handleTogglePlayback: playbackControls.handleTogglePlayback') ||
    !ganttTransportPlaybackModelText.includes('active: args.clockActive !== false && !args.disabled') ||
    !ganttTransportPlaybackModelText.includes('unitsPerMs: args.playbackUnitsPerMs') ||
    !ganttDocumentActionsText.includes('upsertVideoSequenceExportSessionHistory') ||
    !ganttDocumentActionsText.includes('recentExportSessions') || !ganttTransportSurfaceModelText.includes('resolveVideoSequenceTimelineScaleMaxMinutes') || !ganttTransportSurfaceModelText.includes('rulerScaleMaxMinutes') || !ganttTransportSurfaceModelText.includes('scrubMaxMinutes: rulerScaleMaxMinutes') ||
    !ganttDisplayModelText.includes('useGanttTimelineDisplayModel') ||
    !ganttDisplayModelText.includes('formatVideoSequenceTimelineSecondsOffset') ||
    !ganttDisplayModelText.includes('resolveVideoSequenceTimelineMediaSeconds') ||
    !ganttDisplayModelText.includes('resolveVideoSequenceTimelineUnitsPerMs') ||
    !ganttDisplayModelText.includes('formatMermaidGanttTimelineOffset') ||
    !ganttDisplayModelText.includes('displayTicks') ||
    !ganttDisplayModelText.includes('playbackUnitsPerMs') ||
    !ganttInteractionsText.includes('useGanttTimelineInteractions') ||
    !ganttInteractionsText.includes('rulerScrubState') || !ganttInteractionsText.includes('scrubMaxMinutes?: number') || !ganttInteractionsText.includes('Math.max(args.maxMinutes, args.scrubMaxMinutes || 0)') ||
    !ganttInteractionsText.includes('resolveMermaidGanttBarDragCommitted') ||
    !ganttInteractionsText.includes('resolveMermaidGanttBarDragPreview') ||
    !ganttInteractionsText.includes('resolveMermaidGanttTimelineDragEffectiveDelta') ||
    !ganttInteractionsText.includes('resolveMermaidGanttTimelineDragPreviewSpan') ||
    !ganttInteractionsText.includes('effectiveDeltaMinutes,') ||
    !ganttInteractionsText.includes('handleRulerPointerScrub') || !ganttInteractionsText.includes('resolveTimelineRulerScrubElement') || !ganttInteractionsText.includes('[data-kg-gantt-timeline-ruler-content="1"],[data-kg-video-sequence-ruler-axis="1"]') || !ganttInteractionsText.includes('const scrubElement = resolveTimelineRulerScrubElement(event.target, event.currentTarget)') || !ganttInteractionsText.includes('const rect = scrubElement.getBoundingClientRect()') || !ganttInteractionsText.includes('isTimelinePlayheadScrubTarget') || !ganttInteractionsText.includes('[data-kg-gantt-timeline-playhead="1"],[data-kg-video-sequence-ruler-playhead-marker="1"]') ||
    !ganttInteractionsText.includes('handleTrackPointerStart') ||
    !ganttTransportInteractionModelText.includes('useGanttTimelineTransportInteractionModel') ||
    !ganttTransportInteractionModelText.includes('useGanttTimelineInteractions') ||
    !ganttTransportInteractionModelText.includes('useGanttTimelineSelectionSync') ||
    !ganttTransportInteractionModelText.includes('useGanttTimelineTransportView') || !ganttTransportInteractionModelText.includes('scrubMaxMinutes: args.scrubMaxMinutes') ||
    !ganttTransportInteractionModelText.includes('resolveMermaidGanttTimelineRowKeyAtPosition(args.timelineModel, position)') ||
    !ganttTransportInteractionModelText.includes('centerTimelinePlayhead: transportView.centerTimelinePlayhead') ||
    !ganttTransportInteractionModelText.includes('handleRulerPointerScrub: interactions.handleRulerPointerScrub') ||
    !ganttMediaDurationText.includes('useGanttTimelineMediaDuration') ||
    !ganttMediaDurationText.includes('resolveTimelinePlanDurationSeconds') ||
    !ganttMediaDurationText.includes("from '@/components/timeline/timelinePlanSync'") ||
    !ganttMediaDurationText.includes('setMediaDurationSeconds(0)') ||
    !ganttMediaDurationText.includes('Number.isFinite(durationSeconds) && durationSeconds > 0 ? durationSeconds : 0') ||
    !ganttPlaybackControlsText.includes('useGanttTimelinePlaybackControls') ||
    !ganttPlaybackControlsText.includes('dispatchTimelineTransportPlaybackRequest') ||
    !ganttPlaybackControlsText.includes('requestTimelineTransportPlayback') ||
    !ganttPlaybackControlsText.includes('handleTogglePlayback') ||
    !ganttPlaybackControlsText.includes('handlePlaybackEnd') ||
    ganttPlaybackControlsText.includes('handlePlaybackPointerDown') ||
    !ganttSelectionSyncText.includes('useGanttTimelineSelectionSync') ||
    !ganttSelectionSyncText.includes('previousSelectedRowKeyRef') ||
    !ganttSelectionSyncText.includes('if (previousSelectedRowKey === args.selectedRowKey) return') ||
    !ganttSelectionSyncText.includes('args.taskSpans.find(span => span.rowKey === args.selectedRowKey)') ||
    !ganttSelectionSyncText.includes('args.positionMinutes >= selectedSpan.startMinutes') ||
    !ganttSelectionSyncText.includes('args.setTransportPlaybackPosition(selectedSpan.startMinutes)') ||
    !ganttSelectionSyncText.includes('if (selectedSpan && args.positionMinutes >= selectedSpan.startMinutes') ||
    !ganttSelectionSyncText.includes('resolveRowKeyAtPosition: (position: number) => string | null') ||
    !ganttSelectionSyncText.includes('args.resolveRowKeyAtPosition(args.positionMinutes)') ||
    !ganttSelectionSyncText.includes('args.setSelectedRowKey(rowKey)') ||
    !ganttSelectionSyncText.includes('skipNextPositionSelectionSyncRef') ||
    !ganttTransportInteractionModelText.includes('positionMinutes: args.positionMinutes') ||
    !ganttTransportInteractionModelText.includes('setSelectedRowKey: args.setSelectedRowKey') ||
    !ganttTransportViewText.includes('useGanttTimelineTransportView') ||
    !ganttTransportViewText.includes('TIMELINE_TRANSPORT_ZOOM_LEVELS') ||
    !ganttTransportViewText.includes('resolveTimelineTransportNextZoomIndex') ||
    !ganttTransportViewText.includes('resolveTimelineTransportPlayheadPercent') ||
    !ganttTransportViewText.includes('resolveTimelineTransportPlayheadScrollLeft') ||
    !ganttTransportViewText.includes('resolveTimelineTransportZoom') ||
    !ganttTransportViewText.includes('centerTimelinePlayhead') ||
    !ganttTransportViewText.includes('handleZoomOut') ||
    !ganttTransportViewText.includes('handleZoomIn') ||
    !ganttTransportViewText.includes('handleFitTimeline') ||
    !ganttTransportViewText.includes('canZoomOut') ||
    !ganttTransportViewText.includes('canZoomIn') ||
    !ganttTransportViewText.includes('canFitTimeline') ||
    !timelinePreviewSyncText.includes('useTimelineVideoPreviewSyncController') ||
    !timelinePreviewSyncText.includes('TIMELINE_TRANSPORT_PLAYBACK_REQUEST_EVENT') ||
    !timelinePreviewSyncText.includes('resolveTimelineVideoPreviewDurationSeconds') ||
    !timelinePreviewSyncText.includes('resolveTimelineVideoPreviewTargetSeconds') ||
    !timelinePreviewSyncText.includes('resolveTimelineVideoPreviewPositionMinutes') ||
    !timelinePreviewSyncText.includes('TimelineTransportSnapshotReader') ||
    !timelinePreviewSyncText.includes('data-kg-video-sequence-playback-fallback') ||
    !timelinePreviewSyncText.includes('if (video.paused || video.ended) writeTransportPosition()') ||
    !timelinePreviewVideoBindingText.includes('useTimelinePreviewVideoBinding') ||
    !timelinePreviewVideoBindingText.includes('useTimelineDocumentTransportController') ||
    !timelinePreviewVideoBindingText.includes('useTimelineTransportSnapshotReader') ||
    !timelinePreviewVideoBindingText.includes('useTimelineTransportStoreBinding') ||
    !timelinePreviewVideoBindingText.includes('useTimelineVideoPreviewSyncController') ||
    !timelinePreviewVideoBindingText.includes('useTimelineMediaReaderSummary') ||
    !timelinePreviewVideoBindingText.includes('mergeTimelineMediaReaderSummaryWithSource') || !timelinePreviewVideoBindingText.includes('readerDurationSeconds: resolvedMediaReaderSummary.durationSeconds') ||
    !timelinePreviewVideoBindingText.includes('handleVideoElement') ||
    !timelinePreviewVideoBindingText.includes('readVideo: () => videoElementRef.current') ||
    !videoSequenceExportText.includes('renderVideoSequenceExport') ||
    !videoSequenceExportText.includes('downloadVideoSequenceExport') ||
    !videoSequenceExportText.includes('MediaRecorder') ||
    !videoSequenceExportText.includes('captureStream') ||
    !videoSequenceExportText.includes('createMediaElementSource') ||
    !videoSequenceExportText.includes('resolveVideoSequenceExportEvent') ||
    !videoSequenceExportText.includes('resolveVideoSequenceExportOutcome') ||
    !videoSequenceExportText.includes('createVideoSequenceExportSessionRecord') ||
    !videoSequenceExportText.includes('reduceVideoSequenceExportSessionRecord') ||
    !videoSequenceExportText.includes('groupVideoSequenceExportSessions') ||
    !videoSequenceExportText.includes('resolveVideoSequenceExportRetryError') ||
    !videoSequenceExportText.includes('buildVideoSequenceExportSessionCollection') ||
    !videoSequenceExportText.includes('selectVideoSequenceExportSessionSurfaceSessions') ||
    !videoSequenceExportText.includes('buildVideoSequenceExportSessionSurfaceModel') ||
    !videoSequenceExportText.includes('resolveVideoSequenceExportRetryControl') ||
    !videoSequenceExportText.includes('resolveVideoSequenceExportRetryRequest') ||
    !videoSequenceExportText.includes('resolveVideoSequenceExportSessionToneStyle') ||
    !videoSequenceExportText.includes('upsertVideoSequenceExportSessionHistory') ||
    !videoSequenceExportText.includes('buildVideoSequenceExportProgress') ||
    !videoSequenceExportText.includes('resolveVideoSequenceExportErrorCode') ||
    !videoSequenceExportText.includes('resolveVideoSequenceExportErrorFeedback') ||
    !videoSequenceExportText.includes('resolveVideoSequenceExportErrorMessage') ||
    !videoSequenceExportText.includes('resolveVideoSequenceExportPlanError') ||
    !videoSequenceExportText.includes('completedSegments') ||
    !videoSequenceExportText.includes('totalSegments') ||
    !videoSequenceExportText.includes('onEvent?: (event: VideoSequenceExportEvent) => void') ||
    !videoSequenceExportText.includes('signal?: AbortSignal') ||
    !videoSequenceExportText.includes('downloadBlob') ||
    !videoSequenceExportText.includes('resolveTimelinePlanSourceUrl') ||
    !videoSequenceExportText.includes('loadTimelinePlanVideoMetadata') ||
    videoSequenceExportText.includes('resolveVideoSequenceSourceRuntimeUrl') ||
    !videoSequenceExportText.includes('hasMask') ||
    !videoSequenceExportText.includes('hasGrade') ||
    !ganttTransportChromeModelText.includes('Cancel edited video export') ||
    videoSequenceExportText.includes('/Users/') ||
    videoSequenceExportText.includes(['blender', 'blender'].join('/'))
  ) {
    throw new Error('expected video sequence export to render source-backed edited video/audio downloads through neutral browser media APIs without hardcoded fixture paths')
  }
  if (
    !floatingTypeText.includes('timelineTransportPosition') ||
    !floatingTypeText.includes('setTimelineTransportState') ||
    !uiInitialStateText.includes('timelineTransportPosition: 0') ||
    !uiInitialStateText.includes('setTimelineTransportState') ||
    !mediaCanvasText.includes('useTimelinePreviewMediaCanvasBinding') ||
    !mediaCanvasText.includes('TimelinePreviewMediaCanvasFrame') ||
    !mediaCanvasText.includes('mediaCanvasBinding.frameModel') ||
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
    !timelinePreviewCollectionText.includes('useTimelinePreviewCollection') ||
    !timelinePreviewCollectionText.includes('useTimelinePreviewMediaSession') ||
    !timelinePreviewCollectionText.includes('shouldIncludeTimelinePreviewCollectionItem') ||
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
    !timelinePreviewRouteEntryText.includes("args.intent === 'media' ? previewBootstrap.collection.sequenceMaxMinutes : args.maxMinutes") ||
    !timelinePreviewRouteEntryText.includes("args.intent === 'media' ? 0 : args.positionMinutes") ||
    !timelinePreviewRouteEntryText.includes('bootstrap: previewBootstrap') ||
    !ganttTransportPreviewSessionText.includes('useGanttTimelineTransportPreviewSession') ||
    !ganttTransportPreviewSessionText.includes('readVideoSequenceTimelineModelFromMarkdown') ||
    !ganttTransportPreviewSessionText.includes('useTimelinePreviewMonitorBinding') ||
    !ganttTransportPreviewSessionText.includes('sourceCount: videoSequenceModel?.sources.length || 0') ||
    !ganttTransportPreviewSessionText.includes('spanCount: args.taskSpans.length') ||
    !ganttTransportPreviewSessionText.includes('buildVideoSequenceExportPlan') ||
    !ganttTransportPreviewSessionText.includes('resolveVideoSequenceExportPlanError') ||
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
    !timelinePreviewActivitySurfaceModelText.includes('useTimelinePreviewActivitySurfaceModel') ||
    !timelinePreviewActivitySurfaceModelText.includes("args.activityMode === 'selection' || args.activityMode === 'playhead'") ||
    !timelinePreviewFamilyCompactionModelText.includes('useTimelinePreviewFamilyCompactionModel') ||
    !timelinePreviewFamilyCompactionModelText.includes("if (args.intent !== 'media') return false") ||
    !timelinePreviewFamilyDisclosureControllerText.includes('useTimelinePreviewFamilyDisclosureController') ||
    !timelinePreviewFamilyDisclosureControllerText.includes('React.useSyncExternalStore') ||
    !timelinePreviewFamilyDisclosureControllerText.includes('React.useEffect') ||
    !timelinePreviewFamilyDisclosureControllerText.includes('EMPTY_TIMELINE_PREVIEW_FAMILY_DISCLOSURE_SET') ||
    !timelinePreviewFamilyDisclosureControllerText.includes('familyIds: readonly string[]') ||
    !timelinePreviewFamilyDisclosureControllerText.includes('if (autoExpandFamilyId && familyIdSet.has(autoExpandFamilyId))') ||
    !timelinePreviewFamilyDisclosureModelText.includes('useTimelinePreviewFamilyDisclosureModel') ||
    !timelinePreviewFamilyDisclosureModelText.includes('controller: TimelinePreviewFamilyDisclosureController') ||
    !timelinePreviewFamilyDisclosureModelText.includes('toggleFamily') ||
    timelinePreviewFamilyDisclosureModelText.includes('React.useState') ||
    !timelinePreviewFamilyDisclosureSurfaceModelText.includes('useTimelinePreviewFamilyDisclosureSurfaceModel') ||
    !timelinePreviewFamilyDisclosureSurfaceModelText.includes('headerVisible: toggleVisible') ||
    !timelinePreviewFamilySectionLayoutModelText.includes('useTimelinePreviewFamilySectionLayoutModel') ||
    !timelinePreviewFamilySectionLayoutModelText.includes('cardsLabel') ||
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
    !timelinePreviewMediaCanvasFrameModelText.includes('hostAttributes: args.renderModel.hostAttributes') ||
    !timelinePreviewMediaCanvasFrameModelText.includes('renderModel: args.renderModel') ||
    !timelinePreviewMediaCanvasFrameText.includes('TimelinePreviewMediaCanvasFrame') ||
    !timelinePreviewMediaCanvasFrameText.includes('data-kg-media-canvas-group-count') ||
    !timelinePreviewMediaCanvasFrameText.includes('<TimelinePreviewMediaCanvasRender model={args.model.renderModel} />') ||
    !timelinePreviewSurfaceShellModelText.includes('useTimelinePreviewSurfaceShellModel') ||
    !timelinePreviewSurfaceShellModelText.includes("shellLabel: 'Media canvas'") ||
    !timelinePreviewSurfaceShellModelText.includes("titleLabel: 'Media'") ||
    !timelinePreviewSurfaceShellModelText.includes('collapsedFamilyCount') ||
    !timelinePreviewSurfaceShellModelText.includes('groupCount: args.familySectionLayout.sections.length') ||
    !timelinePreviewMediaContextText.includes("autoExpandFamilyId: sourceActivity.activityMode === 'fallback'") ||
    !timelinePreviewMediaContextText.includes('useTimelineSourceActivityModel') ||
    !timelineSourceActivityModelText.includes('useTimelineSourceActivityModel') ||
    !timelineSourceActivityModelText.includes('resolveTimelinePlanSegmentAtPosition') ||
    !timelineSourceActivityModelText.includes('areVideoSequenceExportSourcesEqual') ||
    !timelineSourceActivityModelText.includes("export type TimelineSourceActivityMode = 'selection' | 'playhead' | 'fallback' | 'empty'") ||
    !timelineSourceActivityModelText.includes('if (args.selectionActive) return args.collection.previewPlan || null') ||
    !timelineSourceActivityModelText.includes('selectedSegmentResolution?.contains ? selectedSegmentResolution.segment : null') ||
    !timelineSourceActivityModelText.includes("? 'empty'") ||
    !timelinePlanSyncText.includes('if (selectedRowKey && !selectedSpan) return null') ||
    !timelinePlanSyncText.includes('canTimelineSegmentDriveMediaPreview') ||
    !timelinePlanSyncText.includes("if (lane === 'audio') return sourceKind === 'audio' || sourceKind === 'video'") ||
    !timelinePlanSyncText.includes("return lane === 'video' && sourceKind === 'video'") ||
    !timelinePlanSyncText.includes('if (args.mediaPreviewOnly && !canTimelineSegmentDriveMediaPreview(segment, source)) return []') ||
    !timelinePreviewActivitySurfaceModelText.includes("if (args.activityMode === 'empty')") ||
    !timelinePreviewActivitySurfaceModelText.includes('families: []') ||
    !timelinePreviewSurfaceModelText.includes('useTimelinePreviewSurfaceModel') ||
    !timelinePreviewSurfaceModelText.includes('resolveTimelinePreviewFamilyId') ||
    !timelinePreviewSurfaceModelText.includes('isTimelinePreviewItemVisibleForSurfaceIntent') ||
    !timelinePreviewSurfaceText.includes('TimelinePreviewSurface') ||
    !timelinePreviewSurfaceText.includes('data-kg-video-sequence-media-sync') ||
    !timelinePreviewSurfaceText.includes('data-kg-video-sequence-media-reader') ||
    !timelinePreviewSurfaceText.includes('data-kg-video-sequence-media-reader-duration') ||
    !timelinePreviewSurfaceText.includes('data-kg-video-sequence-media-reader-frame-rate') ||
    !timelinePreviewSurfaceText.includes('data-kg-video-sequence-media-reader-resolution') ||
    !timelinePreviewSurfaceText.includes('data-kg-video-sequence-media-thumbnail-count') ||
    timelinePreviewSurfaceText.includes('data-kg-video-sequence-media-thumbnail-strip') ||
    timelinePreviewSurfaceText.includes('data-kg-video-sequence-media-thumbnail-format') ||
    timelinePreviewSurfaceText.includes('data-kg-video-sequence-media-thumbnail-raster-format') ||
    !timelinePreviewSurfaceText.includes('data-kg-video-sequence-media-thumbnail-image-format-preference') ||
    !timelinePreviewSurfaceText.includes('data-kg-video-sequence-media-thumbnail-video-format-preference') ||
    !mediaFormatPreferenceText.includes("MEDIA_IMAGE_FORMAT_PREFERENCE = ['svg', 'webp', 'png', 'jpeg']") ||
    !mediaFormatPreferenceText.includes("MEDIA_VIDEO_FORMAT_PREFERENCE = ['mp4', 'webm']") ||
    !timelinePreviewSurfaceText.includes('videoPoster={videoPoster}') ||
    !timelinePreviewSurfaceText.includes('data-kg-media-canvas-item-active') ||
    !timelinePreviewSurfaceText.includes('data-kg-media-canvas-item-dimmed') ||
    !timelinePreviewSurfaceText.includes('data-kg-media-canvas-item-family-collapsed') ||
    !timelinePreviewSurfaceText.includes('data-kg-media-canvas-item-family-disclosure-state') ||
    !timelinePreviewSurfaceText.includes('useTimelinePreviewVideoBinding') ||
    !timelinePreviewSurfaceText.includes('videoControls={syncEnabled ? false : undefined}') ||
    !timelinePreviewSurfaceText.includes('onVideoElement={args.item.kind ===') ||
    !timelinePreviewSurfaceText.includes('buildStaticRichMediaPanelOverlayState') ||
    !mediaCanvasText.includes('<TimelinePreviewMediaCanvasFrame') ||
    !mediaCanvasText.includes('model={mediaCanvasBinding.frameModel}') ||
    !timelinePreviewMediaCanvasRenderText.includes('TimelinePreviewMediaCanvasRender') ||
    !timelinePreviewMediaCanvasRenderText.includes('TimelinePreviewSurface') ||
    !timelinePreviewMediaCanvasRenderText.includes('aria-label={args.model.listLabel}') ||
    !timelinePreviewMediaCanvasRenderText.includes('aria-label={args.model.emptyState.label}') ||
    !timelinePreviewMediaCanvasRenderText.includes('{args.model.emptyState.message}') ||
    !timelinePreviewMediaCanvasRenderText.includes('title={section.toggle.title}') ||
    !timelinePreviewMediaCanvasRenderText.includes('onClick={section.toggle.handleToggle}') ||
    !timelinePreviewMediaCanvasRenderText.includes("section.toggle.icon === 'collapse'") ||
    !timelinePreviewMediaCanvasRenderText.includes('key={surface.renderKey}') ||
    !timelinePreviewMediaCanvasRenderText.includes('{...surface.props}') ||
    mediaCanvasText.includes("querySelector('video')") ||
    mediaCanvasText.includes('useTimelinePreviewVideoBinding') ||
    mediaCanvasText.includes('useTimelineVideoPreviewSyncController') ||
    mediaCanvasText.includes('useTimelineDocumentTransportController') ||
    mediaCanvasText.includes('useTimelineTransportSnapshotReader') ||
    mediaCanvasText.includes('useTimelineTransportStoreBinding') ||
    mediaCanvasText.includes('TIMELINE_TRANSPORT_PLAYBACK_REQUEST_EVENT') ||
    mediaCanvasText.includes('useGraphStore.getState()') ||
    mediaCanvasText.includes('markdownDocumentName: s.markdownDocumentName') ||
    mediaCanvasText.includes('markdownText: s.markdownDocumentText') ||
    mediaCanvasText.includes('selectedGanttRowKey: s.mermaidDiagramSelectedRowKeyByKind.gantt') ||
    mediaCanvasText.includes('timelineTransportDocumentKey') ||
    mediaCanvasText.includes('timelineTransportPosition') ||
    mediaCanvasText.includes('timelineTransportPlaying') ||
    mediaCanvasText.includes('timelineTransportPlaybackRate') ||
    mediaCanvasText.includes('resolveVideoSequenceTimelineMediaSeconds') ||
    mediaCanvasText.includes('resolveVideoSequenceTimelinePositionMinutes') ||
    mediaCanvasText.includes('resolveVideoSequenceSourceRuntimeUrl') ||
    mediaCanvasText.includes('transportDocumentKey === documentKey && transportPlaying')
  ) {
    throw new Error('expected Media Canvas video playback and BottomPanel Timeline slider to share the neutral Gantt transport state')
  }
  if (!timelineBottomText.includes('<GanttTimelineTransportPanel code={mediaGanttCode} compact={compact} mode="media" />') ||
    timelineBottomText.includes('TimelineVideoSequenceEmptyState') ||
    timelineBottomText.includes('TimelineVideoSequenceEmptyDropState') ||
    timelineBottomText.includes('onDropMedia={rulerModel.onDropMedia}')) {
    throw new Error('expected empty BottomPanel Timeline to reuse the shared Gantt transport shell instead of a separate empty Timeline UI')
  }
  if (
    !localImportText.includes('materializeVideoSequenceTimelineImportDocument') ||
    !localImportText.includes('pushLocalVideoSequenceImportAsset') ||
    !localImportText.includes('pruneVideoSequenceSourceDocuments') ||
    !localImportText.includes('args.fs.deleteEntry(path)') ||
    !localImportText.includes("inferCorpusMediaKind(args.originalName || args.relativePath, args.file.type) !== 'video'") ||
    !localImportText.includes('applyToGraph: true') ||
    !urlImportText.includes('materializeVideoSequenceTimelineImportDocument') ||
    !urlImportText.includes("sourceUnit.mediaKind === 'video'") ||
    !urlImportText.includes('removedVideoSourcePaths') ||
    !urlImportText.includes('args.fs.deleteEntry(normalized)') ||
    !urlContentText.includes('looksLikeVideo') ||
    !urlContentText.includes('buildCorpusMediaMetadataMarkdown') ||
    !urlContentText.includes("sourceMediaKind: 'video'") ||
    !videoSequenceImportText.includes('kgVideoSequenceTimeline: true') ||
    !videoSequenceImportText.includes('type: mermaid_gantt')
  ) {
    throw new Error('expected local-file and URL video imports to materialize a shared source-backed video sequence Timeline document')
  }
  for (const forbidden of ['/Users/', 'agentic-graph-research-agent-demo', 'agentic-graph-missalph-demo']) {
    if (
      localImportText.includes(forbidden) ||
      urlImportText.includes(forbidden) ||
      urlContentText.includes(forbidden) ||
      videoSequenceImportText.includes(forbidden)
    ) {
      throw new Error(`expected video sequence import projection to avoid hardcoded fixture token ${forbidden}`)
    }
  }
  if (!resolverText.includes('readTypedMermaidDiagramCodes') || !resolverText.includes('mermaid_gantt')) {
    throw new Error('expected typed Mermaid diagram parsing to live in the shared resolver')
  }
  if (!resolverText.includes('mermaid_timeline') || !resolverText.includes('readTimelineRowKind')) {
    throw new Error('expected typed Timeline parsing to live in the shared resolver')
  }
  if (
    !resolverText.includes('mermaid_architecture') ||
    !resolverText.includes('mermaid_eventmodeling') ||
    !resolverText.includes('readArchitectureRowKind') ||
    !resolverText.includes('readEventModelingRowKind')
  ) {
    throw new Error('expected typed Architecture and Event Modeling parsing to live in the shared resolver')
  }
  const sharedGanttModel = parseMermaidDiagramCodeModel([
    'gantt',
    '  title Shared Gantt',
    '  section Compute',
    '  Compute summary :crit, compute_summary, 2026-06-07, 1d',
  ].join('\n'), 'gantt')
  const sharedGanttTask = sharedGanttModel.rows.find(row => row.kind === 'task')
  const sharedGanttRowKey = findMermaidDiagramRowKeyForSvgLabel(sharedGanttModel.rows, 'Compute summary')
  if (!sharedGanttTask || !sharedGanttRowKey || !readMermaidDirectSelectionLabels(sharedGanttTask).includes('Compute summary')) {
    throw new Error('expected shared Mermaid Gantt selection helper to resolve task labels into reusable row keys')
  }
  const wideTimelineTransform = computeSvgSurfaceWideTimelineFitTransform({
    bounds: { minX: 0, minY: 0, width: 11869, height: 194.5 },
    viewportWidth: 1349,
    viewportHeight: 936,
  })
  if (!wideTimelineTransform || wideTimelineTransform.k <= 1 || wideTimelineTransform.x < 20 || wideTimelineTransform.y < 200) {
    throw new Error(`expected wide Gantt timeline fit to keep readable scale and centered vertical placement, got ${JSON.stringify(wideTimelineTransform)}`)
  }
  const sequenceCode = [
    'gantt',
    '  title Sequence',
    '  section Edit',
    '  Opening shot : clip_opening, 09:00, 6m',
  ].join('\n')
  const cutCode = splitMermaidGanttCodeRowAtOffset({ code: sequenceCode, rowLineIndex: 3, splitOffsetMinutes: 2 })
  if (!cutCode?.includes('Opening shot : clip_opening, kgsrc_0_2, 09:00, 2m') || !cutCode.includes('Opening shot splice : clip_opening_splice, kgsrc_2_6, 09:02, 4m')) {
    throw new Error(`expected video sequence cut to split selected Gantt row at playhead, got ${cutCode}`)
  }
  const maskCode = insertMermaidGanttVideoSequenceOperationRow({ code: sequenceCode, rowLineIndex: 3, operation: 'mask' })
  if (!maskCode?.includes('Opening shot mask : clip_opening_mask, kgsrc_0_6, 09:00, 6m')) {
    throw new Error(`expected video sequence mask to insert a source-backed operation lane, got ${maskCode}`)
  }
  const gradeCode = insertMermaidGanttVideoSequenceOperationRow({ code: sequenceCode, rowLineIndex: 3, operation: 'grade' })
  if (!gradeCode?.includes('Opening shot grade : clip_opening_grade, kgsrc_0_6, 09:00, 6m')) {
    throw new Error(`expected video sequence grade to insert a source-backed operation lane, got ${gradeCode}`)
  }
  const groupedSequenceCode = [
    'gantt',
    '  title Sequence',
    '  section Video',
    '  Opening shot : clip_opening, 09:00, 6m',
    '  section Mask',
    '  Opening shot mask : clip_opening_mask, 09:00, 6m',
    '  section Grade',
    '  Opening shot grade : clip_opening_grade, 09:00, 6m',
    '  section Audio',
    '  Opening shot audio : clip_opening_audio, 09:00, 6m',
  ].join('\n')
  const groupedCutCode = splitMermaidGanttVideoSequenceClipGroupAtOffset({
    code: groupedSequenceCode,
    rowLineIndex: 3,
    splitOffsetMinutes: 2,
  })
  if (
    !groupedCutCode?.includes('Opening shot : clip_opening, kgsrc_0_2, 09:00, 2m') ||
    !groupedCutCode.includes('Opening shot splice : clip_opening_splice, kgsrc_2_6, 09:02, 4m') ||
    !groupedCutCode.includes('Opening shot mask : clip_opening_mask, kgsrc_0_2, 09:00, 2m') ||
    !groupedCutCode.includes('Opening shot mask splice : clip_opening_mask_splice, kgsrc_2_6, 09:02, 4m') ||
    !groupedCutCode.includes('Opening shot grade splice : clip_opening_grade_splice, kgsrc_2_6, 09:02, 4m') ||
    !groupedCutCode.includes('Opening shot audio splice : clip_opening_audio_splice, kgsrc_2_6, 09:02, 4m')
  ) {
    throw new Error(`expected video sequence cut to split every source-backed clip lane, got ${groupedCutCode}`)
  }
  const groupedMovedCode = updateMermaidGanttVideoSequenceClipGroupTiming({
    code: groupedSequenceCode,
    rowLineIndex: 3,
    mode: 'move',
    deltaMinutes: 1,
  })
  if (
    !groupedMovedCode?.includes('Opening shot : clip_opening, 09:01, 6m') ||
    !groupedMovedCode.includes('Opening shot mask : clip_opening_mask, kgsrc_0_6, 09:01, 6m') ||
    !groupedMovedCode.includes('Opening shot grade : clip_opening_grade, kgsrc_0_6, 09:01, 6m') ||
    !groupedMovedCode.includes('Opening shot audio : clip_opening_audio, kgsrc_0_6, 09:01, 6m')
  ) {
    throw new Error(`expected generated video sequence bar move to keep companion lanes synchronized, got ${groupedMovedCode}`)
  }
  const duplicateGradeCode = insertMermaidGanttVideoSequenceOperationRow({
    code: groupedSequenceCode,
    rowLineIndex: 3,
    operation: 'grade',
  })
  if (duplicateGradeCode !== groupedSequenceCode) {
    throw new Error(`expected video sequence grade to reuse the existing operation lane without duplication, got ${duplicateGradeCode}`)
  }
  const spliceOnlyMovedCode = groupedCutCode
    ? updateMermaidGanttVideoSequenceClipGroupTiming({
      code: groupedCutCode,
      rowLineIndex: 4,
      mode: 'move',
      deltaMinutes: 1,
    })
    : null
  if (
    !spliceOnlyMovedCode?.includes('Opening shot : clip_opening, kgsrc_0_2, 09:00, 2m') ||
    !spliceOnlyMovedCode.includes('Opening shot splice : clip_opening_splice, kgsrc_2_6, 09:03, 4m') ||
    !spliceOnlyMovedCode.includes('Opening shot mask : clip_opening_mask, kgsrc_0_2, 09:00, 2m') ||
    !spliceOnlyMovedCode.includes('Opening shot mask splice : clip_opening_mask_splice, kgsrc_2_6, 09:03, 4m') ||
    !spliceOnlyMovedCode.includes('Opening shot grade splice : clip_opening_grade_splice, kgsrc_2_6, 09:03, 4m') ||
    !spliceOnlyMovedCode.includes('Opening shot audio splice : clip_opening_audio_splice, kgsrc_2_6, 09:03, 4m')
  ) {
    throw new Error(`expected video sequence splice segment edits to keep companion split strips synchronized, got ${spliceOnlyMovedCode}`)
  }
  const groupedExportPlan = buildVideoSequenceExportPlan({
    code: groupedCutCode || '',
    filenameHint: 'Sequence.md',
    sources: [{
      id: 'clip_opening',
      originalName: 'opening.mp4',
      relativePath: 'opening.mp4',
      workspacePath: '',
      sourceUrl: 'https://media.example.test/opening.mp4',
      mimeHint: 'video/mp4',
      byteSize: 100,
      importMode: 'url',
    }],
  })
  if (
    groupedExportPlan?.segments.length !== 2 ||
    groupedExportPlan.segments[0]?.sourceStartRatio !== 0 ||
    Math.abs((groupedExportPlan.segments[0]?.sourceEndRatio || 0) - (2 / 6)) > 0.0001 ||
    Math.abs((groupedExportPlan.segments[1]?.sourceStartRatio || 0) - (2 / 6)) > 0.0001 ||
    groupedExportPlan.segments[1]?.sourceEndRatio !== 1 ||
    groupedExportPlan.segments.some(segment => !segment.hasMask || !segment.hasGrade) ||
    groupedExportPlan.filenameBase !== 'sequence'
  ) {
    throw new Error(`expected edited video export plan to preserve cut source ranges and mask/grade operations, got ${JSON.stringify(groupedExportPlan)}`)
  }
  const importedSequenceMarkdown = buildVideoSequenceTimelineImportMarkdown([{
    workspacePath: '/workspace/clip-alpha.mp4.source.md',
    relativePath: 'clips/clip-alpha.mp4',
    originalName: 'clip-alpha.mp4',
    mimeHint: 'video/mp4',
    byteSize: 100,
    importMode: 'file',
  }, {
    workspacePath: '/workspace/clip-beta.webm.source.md',
    relativePath: 'clips/clip-beta.webm',
    originalName: 'clip-beta.webm',
    mimeHint: 'video/webm',
    byteSize: 200,
    importMode: 'folder',
  }])
  const importedSequenceCode = resolveMermaidDiagramCode(
    readYamlFrontmatterMermaidDiagramCodes(importedSequenceMarkdown, 'gantt'),
    'gantt',
  )
  const importedSequenceModel = buildMermaidGanttTimelineModel(importedSequenceCode)
  const importedVideoSequenceModel = readVideoSequenceTimelineModelFromMarkdown(importedSequenceMarkdown)
  const importedSequencePreset = parseCanvasWorkspaceFrontmatterPreset(importedSequenceMarkdown)
  const legacySequencePreset = parseCanvasWorkspaceFrontmatterPreset(importedSequenceMarkdown.replace('kgCanvas2dRenderer: "media"', 'kgCanvas2dRenderer: "gantt"'))
  if (
    !importedSequenceMarkdown.includes('kgCanvas2dRenderer: "media"') ||
    !importedSequenceMarkdown.includes('kgVideoSequenceTimeline: true') ||
    !importedSequenceCode.includes('section Video') ||
    !importedSequenceCode.includes('section Audio') ||
    importedSequenceCode.includes('section Mask') ||
    importedSequenceCode.includes('section Grade') ||
    !/clip-alpha\.mp4\s*:\s*clip_[a-z0-9]+,\s*kgsrc_0_300,\s*00:00,\s*5m/.test(importedSequenceCode) ||
    !/clip-beta\.webm audio\s*:\s*clip_[a-z0-9]+_audio,\s*kgsrc_0_300,\s*00:02,\s*5m/.test(importedSequenceCode) ||
    /\s:\s(?:video|mask|grade|audio|splice),/.test(importedSequenceCode) ||
    importedSequenceModel.durationMinutes !== 7 ||
    importedSequenceModel.taskSpans.length !== 4 ||
    importedSequencePreset?.canvas2dRenderer !== 'media' ||
    importedSequencePreset?.videoSequenceTimelineEnabled !== true ||
    legacySequencePreset?.canvas2dRenderer !== 'media'
  ) {
    throw new Error(`expected video import projection to emit runtime-ready typed Gantt sequence frontmatter, got ${JSON.stringify({ importedSequenceCode, importedSequenceModel })}`)
  }
  if (
    !importedVideoSequenceModel?.enabled ||
    importedVideoSequenceModel.sources.length !== 2 ||
    importedVideoSequenceModel.sources[0]?.originalName !== 'clip-alpha.mp4' ||
    importedVideoSequenceModel.sources[0]?.byteSize !== 100 ||
    readVideoSequenceSourcePlayableUrl(importedVideoSequenceModel.sources[0]!) !== '' ||
    !buildVideoSequenceSourceRegistryKeys(importedVideoSequenceModel.sources[0]!).some(key => key.includes('clip-alpha.mp4|100'))
  ) {
    throw new Error(`expected video sequence frontmatter parser to expose neutral local-source metadata without persisted object URLs, got ${JSON.stringify(importedVideoSequenceModel)}`)
  }
  const importedUrlSequenceMarkdown = buildVideoSequenceTimelineImportMarkdown([{
    sourceUrl: 'https://media.example.test/clip.mp4',
    relativePath: 'https://media.example.test/clip.mp4',
    originalName: 'clip.mp4',
    mimeHint: 'video/mp4',
    importMode: 'url',
  }])
  const importedUrlVideoSequenceModel = readVideoSequenceTimelineModelFromMarkdown(importedUrlSequenceMarkdown)
  const importedUrlSource = importedUrlVideoSequenceModel?.sources[0] || null
  if (!importedUrlSource || readVideoSequenceSourcePlayableUrl(importedUrlSource) !== 'https://media.example.test/clip.mp4') {
    throw new Error(`expected URL video sequence sources to resolve direct playable video URLs, got ${JSON.stringify(importedUrlVideoSequenceModel)}`)
  }
  const localVideoImportInput = '/tmp/agentic-graph-video/clip.mp4'
  if (normalizeWorkspaceImportUrlInput(localVideoImportInput) !== localVideoImportInput) {
    throw new Error('expected workspace Import URL to accept local absolute video paths without hardcoding fixture paths in source')
  }
  const localVideoContent = await fetchWorkspaceUrlContent(localVideoImportInput)
  if (
    localVideoContent.name !== 'clip.mp4.source.md' ||
    localVideoContent.sourceMediaKind !== 'video' ||
    !localVideoContent.text.includes('originalName: "clip.mp4"') ||
    !localVideoContent.text.includes('relativePath: "tmp/agentic-graph-video/clip.mp4"')
  ) {
    throw new Error(`expected local absolute video path import to preserve source basename metadata before binary fetch, got ${JSON.stringify(localVideoContent)}`)
  }
  const store = useGraphStore.getState()
  store.resetAll()
  store.setTimelineTransportState({
    documentKey: 'sequence-a.md',
    position: 2.5,
    playing: true,
    playbackRate: 1.5,
  })
  const afterTransportSet = useGraphStore.getState()
  if (
    afterTransportSet.timelineTransportDocumentKey !== 'sequence-a.md' ||
    afterTransportSet.timelineTransportPosition !== 2.5 ||
    afterTransportSet.timelineTransportPlaying !== true ||
    afterTransportSet.timelineTransportPlaybackRate !== 1.5
  ) {
    throw new Error(`expected shared Gantt transport state to update atomically, got ${JSON.stringify({ documentKey: afterTransportSet.timelineTransportDocumentKey, position: afterTransportSet.timelineTransportPosition, playing: afterTransportSet.timelineTransportPlaying, rate: afterTransportSet.timelineTransportPlaybackRate })}`)
  }
  store.setTimelineTransportState({ documentKey: 'sequence-b.md' })
  const afterTransportDocumentSwitch = useGraphStore.getState()
  if (
    afterTransportDocumentSwitch.timelineTransportDocumentKey !== 'sequence-b.md' ||
    afterTransportDocumentSwitch.timelineTransportPosition !== 0 ||
    afterTransportDocumentSwitch.timelineTransportPlaying !== false ||
    afterTransportDocumentSwitch.timelineTransportPlaybackRate !== 1
  ) {
    throw new Error(`expected shared Gantt transport state to reset on document switch, got ${JSON.stringify({
      documentKey: afterTransportDocumentSwitch.timelineTransportDocumentKey,
      position: afterTransportDocumentSwitch.timelineTransportPosition,
      playing: afterTransportDocumentSwitch.timelineTransportPlaying,
      rate: afterTransportDocumentSwitch.timelineTransportPlaybackRate,
    })}`)
  }
  afterTransportDocumentSwitch.setTimelineTransportTimingSyncMode('selected')
  if (useGraphStore.getState().timelineTransportTimingSyncMode !== 'selected') throw new Error('expected shared Gantt timing sync mode to leave component-local state')
  useGraphStore.getState().setTimelineTransportTimingSyncMode('grouped')
  if (useGraphStore.getState().timelineTransportTimingSyncMode !== 'grouped') throw new Error('expected shared Gantt timing sync mode to toggle back to grouped')
  const visibleFrameGanttTransform = computeSvgSurfaceWideTimelineFitTransform({
    bounds: { minX: 0, minY: 0, width: 1375, height: 196 },
    viewportWidth: 925,
    viewportHeight: 697,
  })
  if (
    !visibleFrameGanttTransform ||
    visibleFrameGanttTransform.k >= 0.7 ||
    visibleFrameGanttTransform.x < 20 ||
    visibleFrameGanttTransform.y < 250
  ) {
    throw new Error(`expected ordinary Gantt timeline fit to stay inside unobscured canvas frame, got ${JSON.stringify(visibleFrameGanttTransform)}`)
  }
  for (const forbidden of ['agentic-graph-research-agent-demo', 'agentic-graph-missalph-demo', '/Users/']) {
    if (resolverText.includes(forbidden) || panelText.includes(forbidden) || ganttBarInteractionText.includes(forbidden)) {
      throw new Error(`expected Mermaid panel path to avoid hardcoded fixture token ${forbidden}`)
    }
  }
  if (!isMermaidGanttBarDragMode('move') || !isMermaidGanttBarDragMode('resize-start') || isMermaidGanttBarDragMode('legacy')) {
    throw new Error('expected Gantt bar drag mode guard to accept only current move/resize modes')
  }
  if (!shouldExposeMermaidGanttBarInteraction({ kind: 'task' }) || shouldExposeMermaidGanttBarInteraction({ kind: 'config' })) {
    throw new Error('expected Gantt bar interaction helper to expose handles only for parsed task rows')
  }
  const movePreview = resolveMermaidGanttBarDragPreview({ mode: 'move', originClientX: 10, clientX: 18 })
  const resizeStartPreview = resolveMermaidGanttBarDragPreview({ mode: 'resize-start', originClientX: 10, clientX: 18 })
  const resizeEndPreview = resolveMermaidGanttBarDragPreview({ mode: 'resize-end', originClientX: 10, clientX: 18 })
  if (movePreview.offsetPx !== 8 || movePreview.widthDeltaPx !== 0) {
    throw new Error('expected Gantt move preview to translate without resizing')
  }
  if (resizeStartPreview.offsetPx !== 8 || resizeStartPreview.widthDeltaPx !== -8) {
    throw new Error('expected Gantt resize-start preview to move the leading edge')
  }
  if (resizeEndPreview.offsetPx !== 0 || resizeEndPreview.widthDeltaPx !== 8) {
    throw new Error('expected Gantt resize-end preview to extend the trailing edge')
  }
  if (
    MERMAID_GANTT_BAR_DRAG_COMMIT_MIN_DELTA_PX !== 4 ||
    MERMAID_GANTT_BAR_DRAG_EDGE_SCROLL_THRESHOLD_PX !== 72 ||
    resolveMermaidGanttBarDragCommitted(3) ||
    !resolveMermaidGanttBarDragCommitted(4)
  ) {
    throw new Error('expected Gantt drag thresholds to match the reused Animatic interaction contract')
  }
  const timelineModel = buildMermaidGanttTimelineModel([
    'gantt',
    '  dateFormat HH:mm',
    '  axisFormat %H:%M',
    '  Initial vert : vert, v1, 17:30, 2m',
    '  Task A : 3m',
    '  Task B : 8m',
    '  Final vert : vert, v2, 17:58, 4m',
  ].join('\n'))
  const taskARowKey = resolveMermaidGanttTimelineRowKeyAtPosition(timelineModel, 3)
  const ticks = buildMermaidGanttTimelineTicks(timelineModel)
  if (
    timelineModel.durationMinutes !== 32 ||
    timelineModel.taskSpans.length !== 4 ||
    !taskARowKey?.includes('Task A : 3m') ||
    ticks[0]?.label !== '0:00' ||
    ticks[ticks.length - 1]?.label !== '0:32' ||
    formatMermaidGanttTimelineOffset(125) !== '2:05'
  ) {
    throw new Error(`expected Gantt scrubber model to normalize HH:mm and relative rows into neutral timeline spans, got ${JSON.stringify({ timelineModel, ticks, taskARowKey })}`)
  }
  const editedGanttCode = updateMermaidGanttCodeRowTiming({
    code: [
      'gantt',
      '  dateFormat HH:mm',
      '  Initial vert : vert, v1, 17:30, 2m',
    ].join('\n'),
    rowLineIndex: 2,
    mode: 'move',
    deltaMinutes: 3,
  })
  if (!editedGanttCode?.includes('Initial vert : vert, v1, 17:33, 2m')) {
    throw new Error('expected Gantt move drag to update explicit HH:mm task timing')
  }
  const resizedGanttCode = updateMermaidGanttCodeRowTiming({
    code: [
      'gantt',
      '  dateFormat HH:mm',
      '  Initial vert : vert, v1, 17:30, 2m',
    ].join('\n'),
    rowLineIndex: 2,
    mode: 'resize-end',
    deltaMinutes: 2,
  })
  if (!resizedGanttCode?.includes('Initial vert : vert, v1, 17:30, 4m')) {
    throw new Error('expected Gantt resize-end drag to update explicit minute duration')
  }
  const initialSpan = timelineModel.taskSpans.find(span => span.label === 'Initial vert')
  if (!initialSpan) {
    throw new Error('expected Gantt timeline model to expose the initial milestone span')
  }
  const initialPreview = resolveMermaidGanttTimelineDragPreviewSpan({
    deltaMinutes: -5,
    maxMinutes: timelineModel.durationMinutes,
    mode: 'move',
    span: initialSpan,
  })
  const initialEffectiveDelta = resolveMermaidGanttTimelineDragEffectiveDelta({
    deltaMinutes: -5,
    maxMinutes: timelineModel.durationMinutes,
    mode: 'move',
    span: initialSpan,
  })
  if (initialPreview.startMinutes !== 0 || initialEffectiveDelta !== 0) {
    throw new Error('expected Gantt timeline transport to suppress source mutation when a start-boundary milestone cannot visually move')
  }
  const relativeMovedGanttCode = updateMermaidGanttCodeRowTiming({
    code: [
      'gantt',
      '  dateFormat HH:mm',
      '  Initial vert : vert, v1, 17:30, 2m',
      '  Task A : 3m',
    ].join('\n'),
    rowLineIndex: 3,
    mode: 'move',
    deltaMinutes: 4,
  })
  if (!relativeMovedGanttCode?.includes('Task A : 17:36, 3m')) {
    throw new Error('expected Gantt move drag to promote relative task rows to explicit HH:mm timing')
  }
  const markdownWithGantt = [
    '---',
    'flow_diagrams:',
    '  value:',
    '    time_flow:',
    '      type: mermaid_gantt',
    '      value: |-',
    '        gantt',
    '          dateFormat HH:mm',
    '          Initial vert : vert, v1, 17:30, 2m',
    '---',
    '',
  ].join('\n')
  const replacedMarkdown = replaceFirstMermaidGanttFrontmatterCode(markdownWithGantt, editedGanttCode || '')
  if (!replacedMarkdown?.includes('          Initial vert : vert, v1, 17:33, 2m')) {
    throw new Error('expected Gantt drag commit to rewrite the typed mermaid_gantt frontmatter block without fixture-specific paths')
  }
}
