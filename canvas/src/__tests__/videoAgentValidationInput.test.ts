import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import { buildVideoSequenceGeneratedFrameThumbnails } from '@/components/timeline/videoSequenceGeneratedFrameThumbnails'
import { readVideoSequenceTimelineModelFromMarkdown } from '@/components/timeline/videoSequenceTimeline'
import { importWorkspaceUrl } from '@/features/markdown-workspace/workspaceImport'
import { resetWorkspaceUrlContentCacheForTests } from '@/features/markdown-workspace/workspaceImport/urlContentCache'
import {
  VIDEO_AGENT_REFERENCE_BOUNDARY,
  VIDEO_AGENT_RICH_MEDIA_PANEL_ROUTES,
  VIDEO_AGENT_SCHEMA_VERSION,
  buildVideoAgentValidationUrlOptions,
  buildVideoAgentPipeline,
  mergeVideoAgentValidationConfigs,
  normalizeVideoAgentValidationConfig,
  readVideoAgentValidationConfigFromRuntimeInput,
  readVideoAgentValidationConfigFromStorage,
  serializeVideoAgentValidationUrls,
  splitVideoAgentValidationUrls,
  writeVideoAgentValidationConfigToStorage,
} from '@/features/video-agent'
import { createMemoryWorkspaceFs } from '@/features/workspace-fs/workspaceFsMemory'
import { loadGraphDataFromTextViaParser } from '@/features/parsers/loader'
import { buildMermaidGanttCodeFromNeutralTimelinePayload } from '@/lib/mermaid/mermaidDiagramCode'
import { buildMermaidGanttTimelineModel } from '@/lib/mermaid/mermaidGanttBarInteraction'
import { parseMarkdownFrontmatter, splitMarkdownLines } from '@/lib/markdown'
import { getNodeMediaSpec } from '@/lib/canvas/graph-elements/mediaSpec'
import { VISUAL_ANNOTATION_E2E_CANVAS_2D_RENDERERS, isVisualAnnotationE2eCanvas2dRenderer } from '@/lib/config.render'
import {
  assertProviderFrameSampleToken,
  assertProviderFrameThumbnails,
} from './helpers/videoAgentTimelineFrameSamples'
import {
  assertVideoAgentTranscriptPanelOwnsTimelineSyncedSrcDoc,
  installVideoAgentValidationYouTubeTranscriptFetch,
  readVideoAgentValidationUrlsFromEnv,
} from './helpers/videoAgentValidationInput'
const sourceFileExtensions = new Set(['.js', '.jsx', '.mjs', '.ts', '.tsx'])
class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>()
  get length(): number {
    return this.values.size
  }
  clear(): void {
    this.values.clear()
  }
  getItem(key: string): string | null {
    return this.values.get(key) ?? null
  }
  key(index: number): string | null {
    return Array.from(this.values.keys())[index] ?? null
  }
  removeItem(key: string): void {
    this.values.delete(key)
  }
  setItem(key: string, value: string): void {
    this.values.set(key, value)
  }
}

const readExternalValidationDocPath = (): string => {
  const explicit = String(process.env.AGENTICGRAPH_VDEOXPLN_DEMO_DOC_PATH || '').trim()
  if (explicit) return resolve(explicit)
  const hardcodeGuardInput = String(process.env.AG_TEST_VALIDATION_FORBID_HARDCODE_IN_REPO || '').trim()
  return hardcodeGuardInput ? resolve(hardcodeGuardInput) : ''
}

const listSourceFiles = (rootDir: string): string[] => {
  const out: string[] = []
  const stack = [rootDir]
  while (stack.length > 0) {
    const dir = stack.pop()
    if (!dir) continue
    for (const entry of readdirSync(dir)) {
      if (entry === 'node_modules' || entry === 'dist' || entry === 'coverage') continue
      const filePath = resolve(dir, entry)
      const stat = statSync(filePath)
      if (stat.isDirectory()) {
        stack.push(filePath)
        continue
      }
      const extension = entry.slice(entry.lastIndexOf('.'))
      if (sourceFileExtensions.has(extension)) out.push(filePath)
    }
  }
  return out
}

const assertRuntimeValidationLiteralNotInRepoSource = (literal: string, label: string) => {
  const value = literal.trim()
  if (!value) return
  const sourceRoot = resolve(process.cwd(), 'src')
  const matches = listSourceFiles(sourceRoot)
    .filter(filePath => readFileSync(filePath, 'utf8').includes(value))
    .map(filePath => filePath.slice(process.cwd().length + 1))
  if (matches.length > 0) {
    throw new Error(`expected ${label} to stay external to agenticgraph source; found ${matches.join(', ')}`)
  }
}

const unwrapKtvValue = (value: unknown): unknown => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value
  if ('value' in value) return (value as { value?: unknown }).value
  return value
}

const readKtvString = (value: unknown): string => {
  const unwrapped = unwrapKtvValue(value)
  return typeof unwrapped === 'string' ? unwrapped : ''
}

const stringifyKtvValue = (value: unknown): string => {
  const unwrapped = unwrapKtvValue(value)
  return typeof unwrapped === 'string' ? unwrapped : JSON.stringify(unwrapped ?? '')
}

export function testVideoAgentValidationConfigSupportsUserConfiguredImportUrls() {
  const operatorDocPath = '/operator/configured/video-agent-validation.md'
  const operatorUrls = [
    'https://video.example.test/source-a',
    'https://video.example.test/source-b',
  ]
  const normalizedUrls = splitVideoAgentValidationUrls(`${operatorUrls[0]}\n${operatorUrls[1]},${operatorUrls[0]}`)
  if (normalizedUrls.length !== 2 || normalizedUrls[0] !== operatorUrls[0] || normalizedUrls[1] !== operatorUrls[1]) {
    throw new Error(`expected validation URL normalization to dedupe operator input, got ${JSON.stringify(normalizedUrls)}`)
  }
  const storage = new MemoryStorage()
  writeVideoAgentValidationConfigToStorage({ validationDocPath: operatorDocPath, importUrls: normalizedUrls }, storage)
  const storedConfig = readVideoAgentValidationConfigFromStorage(storage)
  if (!storedConfig || storedConfig.validationDocPath !== operatorDocPath || storedConfig.importUrls.join('|') !== operatorUrls.join('|')) {
    throw new Error(`expected storage-backed video-agent validation config, got ${JSON.stringify(storedConfig)}`)
  }
  const normalizedConfig = normalizeVideoAgentValidationConfig({
    validationDocPath: `  ${operatorDocPath}  `,
    importUrls: [operatorUrls[0], operatorUrls[1], operatorUrls[0]],
  })
  if (
    normalizedConfig.validationDocPath !== operatorDocPath
    || serializeVideoAgentValidationUrls(normalizedConfig.importUrls) !== operatorUrls.join('\n')
  ) {
    throw new Error(`expected normalized operator validation config, got ${JSON.stringify(normalizedConfig)}`)
  }
  const runtimeConfig = readVideoAgentValidationConfigFromRuntimeInput({
    metadata: {
      frontmatterMeta: {
        videoAgentRuntimeContract: {
          testUrls: operatorUrls,
        },
      },
    },
    nodes: [
      {
        properties: {
          data_json: JSON.stringify({
            sourceVideo: {
              url: operatorUrls[0],
              testUrls: operatorUrls,
              externalDependency: false,
            },
          }),
        },
      },
    ],
  })
  if (runtimeConfig.importUrls.join('|') !== operatorUrls.join('|')) {
    throw new Error(`expected runtime validation config to derive the full active document URL set, got ${JSON.stringify(runtimeConfig)}`)
  }
  const mergedRuntimeConfig = mergeVideoAgentValidationConfigs({ importUrls: [] }, runtimeConfig)
  const optionLabels = buildVideoAgentValidationUrlOptions(mergedRuntimeConfig.importUrls).map(option => option.label)
  if (optionLabels.join('|') !== 'URL 1|URL 2') {
    throw new Error(`expected validation URL options for each configured test URL, got ${JSON.stringify(optionLabels)}`)
  }
  const visualAnnotationRendererIds = VISUAL_ANNOTATION_E2E_CANVAS_2D_RENDERERS.join('|')
  if (
    visualAnnotationRendererIds !== 'media|storyboard'
    || !isVisualAnnotationE2eCanvas2dRenderer('media')
    || !isVisualAnnotationE2eCanvas2dRenderer('storyboard')
    || isVisualAnnotationE2eCanvas2dRenderer('d3')
  ) {
    throw new Error(`expected Media and Storyboard to share the visual annotation E2E runtime, got ${visualAnnotationRendererIds}`)
  }

  const configSource = readFileSync(resolve(process.cwd(), 'src', 'features', 'video-agent', 'videoAgentValidationConfig.ts'), 'utf8')
  const validationControlsSource = readFileSync(resolve(process.cwd(), 'src', 'features', 'video-agent', 'VideoAgentValidationImportControls.tsx'), 'utf8')
  const launchImportSource = readFileSync(resolve(process.cwd(), 'src', 'lib', 'toolbar', 'LaunchDropdownImportUrlItem.tsx'), 'utf8')
  if (
    !configSource.includes('VIDEO_AGENT_VALIDATION_CONFIG_STORAGE_KEY')
    || !configSource.includes('VITE_AGENTICGRAPH_VIDEO_AGENT_VALIDATION_DOC_PATH')
    || !configSource.includes('VITE_AGENTICGRAPH_VIDEO_AGENT_VALIDATION_URLS')
  ) {
    throw new Error('expected video-agent validation config to expose one storage and env owner')
  }
  for (const requiredUiToken of [
    'VideoAgentValidationImportControls',
    'Video-agent validation import controls',
    'Video-agent validation document path',
    'Video-agent validation import URLs',
    'optionMode="select"',
    'onBeforeImport={beforeValidationImport}',
    'onSelectUrl={url =>',
    'optionButtonLabel={option => `Use ${option.label}`}',
  ]) {
    if (!launchImportSource.includes(requiredUiToken)) {
      throw new Error(`expected Launch Import URL UI to expose ${requiredUiToken}`)
    }
  }
  for (const requiredSharedToken of [
    'readVideoAgentValidationConfigFromRuntimeInput',
    'writeVideoAgentValidationConfig',
    'getMarkdownWorkspaceActionBridge',
    "optionMode === 'select'",
    'data-kg-video-agent-validation-url-option',
    'Import set',
    'aria-busy={importRunning}',
    'for (const url of validationImportUrls) await importValidationUrl(url)',
    'data-kg-video-agent-validation-import-state',
  ]) {
    if (!validationControlsSource.includes(requiredSharedToken)) {
      throw new Error(`expected shared video-agent validation controls to expose ${requiredSharedToken}`)
    }
  }
  if (launchImportSource.includes('readVideoAgentValidationConfig') || launchImportSource.includes('writeVideoAgentValidationConfig')) {
    throw new Error('expected Launch Import URL to delegate video-agent validation config state to the shared owner')
  }
  if (launchImportSource.includes('Use first')) {
    throw new Error('expected Launch Import URL validation UI to preserve the full URL set instead of collapsing to the first URL')
  }
  for (const forbidden of ['video-db', 'VideoDB', '@video-db', 'Director(', 'VIDEODB_API_KEY', 'youtu.be/']) {
    if (configSource.includes(forbidden) || launchImportSource.includes(forbidden) || validationControlsSource.includes(forbidden)) {
      throw new Error(`expected user-configurable validation owners to avoid hardcoded external dependency or URL token ${forbidden}`)
    }
  }
}

export async function testVideoAgentPipelineUsesExternalValidationInputsWithoutRepoHardcodes() {
  const demoPath = readExternalValidationDocPath()
  const suppliedTestUrls = readVideoAgentValidationUrlsFromEnv()
  if (!demoPath && suppliedTestUrls.length === 0) return
  if (!demoPath || !existsSync(demoPath)) throw new Error(`expected external video-agent validation doc at ${demoPath || '<unset>'}`)
  if (suppliedTestUrls.length === 0) throw new Error('expected AGENTICGRAPH_VIDEO_AGENT_TEST_URLS for external video-agent validation')

  assertRuntimeValidationLiteralNotInRepoSource(demoPath, 'external validation document path')
  for (const suppliedTestUrl of suppliedTestUrls) {
    assertRuntimeValidationLiteralNotInRepoSource(suppliedTestUrl, 'video-agent test URL')
  }

  const demoMarkdown = readFileSync(demoPath, 'utf8')
  const parsed = parseMarkdownFrontmatter(splitMarkdownLines(demoMarkdown))
  if (parsed.warnings.length > 0) throw new Error(`expected clean external validation frontmatter, got ${parsed.warnings.join('; ')}`)
  const contract = parsed.meta.videoAgentRuntimeContract as Record<string, unknown> | undefined
  if (!contract || typeof contract !== 'object' || Array.isArray(contract)) {
    throw new Error('expected external validation document to expose videoAgentRuntimeContract')
  }
  if (contract.schema !== VIDEO_AGENT_SCHEMA_VERSION) throw new Error('expected external validation document to carry the video-agent schema')
  const operatorConfig = contract.operatorConfig as Record<string, unknown> | undefined
  if (
    operatorConfig?.storageKey !== 'agenticgraph:video-agent:validation-config:v1'
    || typeof operatorConfig.validationUrlsSource !== 'string'
  ) {
    throw new Error('expected external validation document to declare operator-owned validation URL config')
  }
  for (const suppliedTestUrl of suppliedTestUrls) {
    if (demoMarkdown.includes(suppliedTestUrl)) {
      throw new Error(`expected external validation document to avoid persisting operator URL fixture ${suppliedTestUrl}`)
    }
  }
  if ('testUrl' in contract || 'testUrls' in contract || 'sourceId' in contract || 'sourceIds' in contract) {
    throw new Error('expected external validation document contract to avoid legacy persisted URL/source-id fixtures')
  }
  const referenceBoundary = contract.referenceBoundary as Record<string, unknown> | undefined
  for (const [key, value] of Object.entries(VIDEO_AGENT_REFERENCE_BOUNDARY)) {
    if (referenceBoundary?.[key] !== value) {
      throw new Error(`expected external validation document reference boundary ${key}=${String(value)}`)
    }
  }
  const contractArtifacts = Array.isArray(contract.reasoningArtifacts) ? contract.reasoningArtifacts.map(String) : []
  for (const required of ['search evidence windows', 'edit decision plan', 'compiled timeline manifest', 'visual annotation dataset artifact', 'real-time zone counting timeline', 'generation placeholder manifest', 'instant stream manifest']) {
    if (!contractArtifacts.includes(required)) {
      throw new Error(`expected external validation document reasoning artifact ${required}`)
    }
  }
  const datasetOperations = Array.isArray(contract.datasetOperations) ? contract.datasetOperations.map(String) : []
  for (const operation of ['load', 'split', 'merge', 'save', 'count_zones']) {
    if (!datasetOperations.includes(operation)) {
      throw new Error(`expected external validation document dataset operation ${operation}`)
    }
  }
  const contractSourceTruth = Array.isArray(contract.sourceTruth) ? contract.sourceTruth.map(String) : []
  for (const owner of ['canvas/src/features/video-agent/videoAgentDatasetRuntime.ts', 'canvas/src/features/visual-annotation-engine/annotationDataset.ts']) {
    if (!contractSourceTruth.includes(owner)) {
      throw new Error(`expected external validation document sourceTruth owner ${owner}`)
    }
  }
  const outputBoundary = Array.isArray(contract.outputBoundary) ? contract.outputBoundary.map(String).join('\n') : ''
  if (['frameByFrameSamples', 'sourcePlaybackUrl', 'sourceTranscript', 'frameByFrameTranscript', 'richMediaPanels', 'visualDataset', 'mergedVisualDataset', 'datasetOperationSummary', 'zoneCounting'].some(token => !outputBoundary.includes(token))) {
    throw new Error('expected external validation document outputBoundary to name frame samples, transcripts, Rich Media panels, visual datasets, dataset summaries, and zoneCounting')
  }
  const contractFrameBoxes = Array.isArray(contract.frameBoundingBoxes) ? contract.frameBoundingBoxes : []
  if (contractFrameBoxes.length < 5) {
    throw new Error('expected external validation document to expose frame-by-frame bounding boxes')
  }
  for (const entry of contractFrameBoxes) {
    const bbox = (entry as { bbox?: unknown }).bbox
    if (!Array.isArray(bbox) || bbox.length !== 4 || bbox.some(value => typeof value !== 'number' || value < 0 || value > 1)) {
      throw new Error(`expected normalized external validation bounding box, got ${JSON.stringify(entry)}`)
    }
  }

  const flow = parsed.meta.flow as { nodes?: unknown; edges?: unknown } | undefined
  const nodes = Array.isArray(flow?.nodes) ? flow.nodes as Array<Record<string, unknown>> : []
  const primaryTestUrl = suppliedTestUrls[0] || ''
  const sourceSpecNode = nodes.find(node => readKtvString(node.id) === 'html_video_source_spec')
  const sourceSpecData = JSON.parse(readKtvString(sourceSpecNode?.data_json) || '{}') as {
    bottomPanelTimelineSync?: { lane?: unknown; source?: unknown; surface?: unknown; thumbnailMode?: unknown; trackIds?: unknown }
    sourceVideo?: { ingestMode?: unknown; sourceKey?: unknown; testUrls?: unknown; url?: unknown; urls?: unknown }
    timelineLanes?: unknown
    timelineTracks?: unknown
    validationImportUrls?: unknown
  }
  const sourceSpecValidationUrls = splitVideoAgentValidationUrls([
    Array.isArray(sourceSpecData.validationImportUrls) ? sourceSpecData.validationImportUrls.join('\n') : String(sourceSpecData.validationImportUrls || ''),
    Array.isArray(sourceSpecData.sourceVideo?.testUrls) ? sourceSpecData.sourceVideo.testUrls.join('\n') : String(sourceSpecData.sourceVideo?.testUrls || ''),
    Array.isArray(sourceSpecData.sourceVideo?.urls) ? sourceSpecData.sourceVideo.urls.join('\n') : String(sourceSpecData.sourceVideo?.urls || ''),
    String(sourceSpecData.sourceVideo?.url || ''),
  ].join('\n'))
  if (sourceSpecValidationUrls.length > 0) {
    throw new Error(`expected source graph data to avoid persisted validation URLs, got ${JSON.stringify(sourceSpecValidationUrls)}`)
  }
  if (
    sourceSpecData.sourceVideo?.ingestMode !== 'operator-supplied-validation-config'
    || !String(sourceSpecData.sourceVideo?.sourceKey || '').includes('operator-supplied-video-agent-validation-source')
  ) {
    throw new Error(`expected source graph data to declare operator-supplied validation source config, got ${JSON.stringify(sourceSpecData.sourceVideo)}`)
  }
  const sourceTimelineTracks = Array.isArray(sourceSpecData.timelineTracks) ? sourceSpecData.timelineTracks : []
  const sourceVideoTimelineTracks = sourceTimelineTracks.filter(entry => String((entry as { source?: unknown }).source || '') === 'source-video')
  const sourceFbfTimelineTracks = sourceTimelineTracks.filter(entry => String((entry as { source?: unknown }).source || '') === 'frame-bounding-boxes')
  if (
    sourceTimelineTracks.length !== 3
    || sourceVideoTimelineTracks.length !== 1
    || Number((sourceVideoTimelineTracks[0] as { frameSampleCount?: unknown })?.frameSampleCount || 0) < 3
    || sourceFbfTimelineTracks.length !== 1
    || Number((sourceFbfTimelineTracks[0] as { frameSampleCount?: unknown })?.frameSampleCount || 0) < 3
    || String((sourceFbfTimelineTracks[0] as { timelineLane?: unknown })?.timelineLane || '') !== 'fbf'
    || sourceSpecData.bottomPanelTimelineSync?.surface !== 'BottomPanel Timeline'
    || sourceSpecData.bottomPanelTimelineSync?.source !== 'video+fbf+audio'
    || sourceSpecData.bottomPanelTimelineSync?.lane !== 'video-fbf-audio'
    || sourceSpecData.bottomPanelTimelineSync?.thumbnailMode !== 'semantic-frame-samples'
  ) throw new Error('expected external validation document to sync compact video, FBF, and audio media tracks into BottomPanel Timeline')
  if (
    !Array.isArray(sourceSpecData.timelineLanes)
    || !sourceSpecData.timelineLanes.some(entry => String((entry as { label?: unknown }).label || '') === 'Frame-by-frame boxes')
    || !sourceSpecData.timelineLanes.some(entry => String((entry as { label?: unknown }).label || '') === 'Source video')
    || !sourceSpecData.timelineLanes.some(entry => String((entry as { label?: unknown }).label || '') === 'Source audio')
  ) {
    throw new Error('expected external validation document to expose source video and audio BottomPanel Timeline lanes')
  }
  const externalMediaTimelineCode = buildMermaidGanttCodeFromNeutralTimelinePayload(sourceSpecData)
  if (!externalMediaTimelineCode.includes('kgframes_') || externalMediaTimelineCode.includes('kgthumb_') || !externalMediaTimelineCode.includes('video_agent_frame_by_frame_boxes')) {
    throw new Error('expected external validation BottomPanel FBF timeline to carry compact source-frame sample metadata')
  }
  const externalMediaTimelineModel = buildMermaidGanttTimelineModel(externalMediaTimelineCode)
  const externalVideoSpan = externalMediaTimelineModel.taskSpans.find(span => /video_agent_source_video/.test(span.raw))
  if (!externalVideoSpan) throw new Error('expected external validation BottomPanel VIDEO span')
  assertProviderFrameSampleToken(externalVideoSpan.raw)
  const externalFrameThumbnails = buildVideoSequenceGeneratedFrameThumbnails({ sourceWindow: null, span: externalVideoSpan })
  assertProviderFrameThumbnails(externalFrameThumbnails)
  const richMediaPanels = nodes.filter(node => readKtvString(node.type) === 'RichMediaPanel')
  const frameAnalysisPanels = richMediaPanels.filter(node => {
    const panelText = [
      readKtvString(node.id),
      readKtvString(node.label),
      readKtvString(node.srcDoc),
      stringifyKtvValue(node.frameBoundingBoxes),
      stringifyKtvValue(node.handles),
      stringifyKtvValue(node['flow:portTypes']),
    ].join(' ')
    return /frameBoundingBoxes|frame-by-frame|frame-box|bounding box/i.test(panelText)
  })
  if (frameAnalysisPanels.length < 3) {
    throw new Error('expected external validation document to show frame-by-frame bounding boxes in at least three RichMediaPanel nodes')
  }
  if (!frameAnalysisPanels.some(node => readKtvString(node.srcDoc).includes('frame-box'))) {
    throw new Error('expected at least one RichMediaPanel to render visible frame-box overlays without persisted validation URL fixtures')
  }
  const floatingPanel = frameAnalysisPanels.find(node => readKtvString(node.id) === 'floating_panel_media_annotation_panel')
  if (!floatingPanel) {
    throw new Error('expected FloatingPanel Media Annotation Outputs to render frame-by-frame bounding-box analysis')
  }
  const floatingPanelSrcDoc = readKtvString(floatingPanel.srcDoc)
  if (!floatingPanelSrcDoc.includes('frame-box') || floatingPanelSrcDoc.includes(primaryTestUrl)) {
    throw new Error('expected FloatingPanel Media Annotation Outputs to show visible frame-box overlays without persisted validation URL fixtures')
  }
  if (
    !floatingPanelSrcDoc.includes('data-kg-frame-sequence-strip="floating-panel"')
    || !/0\.0s[\s\S]*1\.4s[\s\S]*2\.8s[\s\S]*4\.2s[\s\S]*5\.6s/.test(floatingPanelSrcDoc)
  ) {
    throw new Error('expected FloatingPanel Media Annotation Outputs to expose a visible frame-by-frame sequence strip')
  }
  const frameAnalysisPanelIds = new Set(frameAnalysisPanels.map(node => readKtvString(node.id)).filter(Boolean))
  const edges = Array.isArray(flow?.edges) ? flow.edges as Array<Record<string, unknown>> : []
  if (!edges.some(edge => frameAnalysisPanelIds.has(String(edge.target || '')) && String(edge.sourceHandle || '') === 'frameBoundingBoxes')) {
    throw new Error('expected frameBoundingBoxes to route into a RichMediaPanel through explicit Storyboard Widget edges')
  }
  if (!edges.some(edge => String(edge.target || '') === 'floating_panel_media_annotation_panel' && String(edge.targetHandle || '') === 'frameBoundingBoxes')) {
    throw new Error('expected frameBoundingBoxes to route explicitly into FloatingPanel Media Annotation Outputs')
  }

  const importCalls: string[] = []
  const restoreFetch = installVideoAgentValidationYouTubeTranscriptFetch(importCalls)
  try {
    resetWorkspaceUrlContentCacheForTests()
    for (const suppliedTestUrl of suppliedTestUrls) {
      const fs = createMemoryWorkspaceFs()
      const imported = await importWorkspaceUrl({
        fs,
        urlRaw: suppliedTestUrl,
        documentSemanticMode: 'document',
      })
      if (imported.createdPaths.length === 0) throw new Error(`expected Import URL to create a source-owned document for ${suppliedTestUrl}`)
      if (!imported.sources.some(source => source.source.kind === 'url' && source.source.url === suppliedTestUrl)) {
        throw new Error(`expected Import URL sources to preserve ${suppliedTestUrl}`)
      }
      const sourceUnit = imported.corpusManifest?.sourceUnits?.[0] || null
      if (sourceUnit?.mediaKind !== 'video' || sourceUnit.provenance?.importMode !== 'url') {
        throw new Error(`expected Import URL to classify ${suppliedTestUrl} as a video URL source`)
      }
      const importedText = String((await fs.readFileText(imported.createdPaths[0] || '')) || '')
      if (!importedText.includes('kgYoutubeVideoId:') || !importedText.includes(suppliedTestUrl)) {
        throw new Error(`expected Import URL to materialize parsed YouTube source markdown from ${suppliedTestUrl}`)
      }
      for (const completeParseToken of [
        'kgVideoAgentImport: true',
        'videoAgentRuntimeContract:',
        'frameBoundingBoxes:',
        'frameByFrameSamples',
        'sourcePlaybackUrl',
        'sourceTranscript',
        'frameByFrameTranscript',
        'richMediaPanels',
        'datasetOperationSummary',
        'visualDataset',
        'mergedVisualDataset',
        'zoneCounting',
        'html_video_source_spec',
        'HtmlVideoRenderer',
      ]) {
        if (!importedText.includes(completeParseToken)) {
          throw new Error(`expected Import URL to materialize complete video-agent parse token ${completeParseToken} for ${suppliedTestUrl}`)
        }
      }

      const result = buildVideoAgentPipeline({
        sourceUrl: suppliedTestUrl,
        intent: 'Search, edit, compile, generate, and stream the externally supplied validation video.',
      })
      if (result.ok === false) throw new Error(`expected supplied validation URL to build a pipeline, got ${result.reason}`)
      if (!result.pipeline.renderSpec.html.includes(suppliedTestUrl)) {
        throw new Error('expected video-agent render spec to render the runtime-supplied validation URL')
      }
      const renderData = result.pipeline.renderSpec.data as {
        referenceBoundary?: unknown
        sourceVideo?: { externalDependency?: unknown }
      }
      if (result.pipeline.source.externalDependency !== false || renderData.sourceVideo?.externalDependency !== false) {
        throw new Error('expected runtime-supplied validation URL to remain dependency-free')
      }
      if (result.pipeline.referenceBoundary !== VIDEO_AGENT_REFERENCE_BOUNDARY || renderData.referenceBoundary !== VIDEO_AGENT_REFERENCE_BOUNDARY) {
        throw new Error('expected runtime-supplied validation URL to use the native inspiration boundary')
      }
    }
  } finally {
    restoreFetch()
    resetWorkspaceUrlContentCacheForTests()
  }
  const transcriptImports = importCalls.filter(call => call.startsWith('/__youtube_transcript?'))
  if (transcriptImports.length < suppliedTestUrls.length) {
    throw new Error(`expected Import URL to use the shared YouTube transcript endpoint for each validation URL, got ${transcriptImports.length}`)
  }
}

export async function testVideoAgentImportUrlMaterializesCompleteParsedGraph() {
  const videoId = 'CompleteParse123'
  const sourceUrl = ['https://', 'youtu.be/', videoId].join('')
  const importCalls: string[] = []
  const restoreFetch = installVideoAgentValidationYouTubeTranscriptFetch(importCalls)
  try {
    resetWorkspaceUrlContentCacheForTests()
    const fs = createMemoryWorkspaceFs()
    const imported = await importWorkspaceUrl({ fs, urlRaw: sourceUrl, documentSemanticMode: 'document' })
    if (imported.applyToGraph !== true) {
      throw new Error(`expected imported video-agent document to apply to graph, got ${String(imported.applyToGraph)}`)
    }
    if (imported.createdPaths.length !== 1 || !/^\/docs_\/\d{8}T\d{6}Z\/.+\.video-agent\.md$/.test(String(imported.createdPaths[0] || ''))) {
      throw new Error(`expected Import URL to focus a single video-agent document, got ${imported.createdPaths.join(', ')}`)
    }
    const sourceUnit = imported.corpusManifest?.sourceUnits?.[0] || null
    if (sourceUnit?.mediaKind !== 'video' || sourceUnit.provenance?.importMode !== 'url') {
      throw new Error(`expected complete video-agent import to preserve video URL provenance, got ${JSON.stringify(sourceUnit)}`)
    }
    const importedText = String((await fs.readFileText(imported.createdPaths[0] || '')) || '')
    for (const token of [
      'kgVideoAgentImport: true', 'kgWorkspaceOutputRoot: "/docs_/', `kgYoutubeVideoId: "${videoId}"`, 'kgVideoSequenceTimeline: true', 'kgVideoSequenceSources:',
      'videoAgentRuntimeContract:', 'frameBoundingBoxes:', 'frameByFrameSamples', 'sourcePlaybackUrl', 'sourceTranscript', 'frameByFrameTranscript',
      'richMediaPanels', 'visualAnnotationE2E', 'datasetOperationSummary', 'visualDataset', 'mergedVisualDataset', 'datasetSplitSummary',
      'savedDatasetArtifact', 'zoneCounting', 'workspace output store /docs_/', 'html_video_source_spec', 'video_agent_transcript_panel', 'data-kg-video-agent-transcript-panel', 'video_agent_dataset_panel', 'data-kg-video-agent-dataset-panel',
      'HtmlVideoRenderer', 'RichMediaPanel', 'type: "mermaid_gantt"', sourceUrl,
    ]) {
      if (!importedText.includes(token)) {
        throw new Error(`expected complete video-agent import document to include ${token}`)
      }
    }
    const parsed = await loadGraphDataFromTextViaParser('youtube.video-agent.md', importedText, { applyToStore: false })
    const videoSequenceTimelineModel = readVideoSequenceTimelineModelFromMarkdown(importedText)
    if (
      videoSequenceTimelineModel?.enabled !== true
      || videoSequenceTimelineModel.sources.length !== 1
      || videoSequenceTimelineModel.sources[0]?.sourceUrl !== sourceUrl
      || videoSequenceTimelineModel.sources[0]?.importMode !== 'url'
      || !(Number(videoSequenceTimelineModel.sources[0]?.durationSeconds || 0) >= 50)
    ) {
      throw new Error(`expected video-agent import to activate shared timeline transport source model, got ${JSON.stringify(videoSequenceTimelineModel)}`)
    }
    const nodes = Array.isArray(parsed?.graphData?.nodes) ? parsed.graphData.nodes : []
    const sourceSpecNode = nodes.find(node => String(node.id || '') === 'html_video_source_spec')
    const rendererNode = nodes.find(node => String(node.type || '') === 'HtmlVideoRenderer')
    const videoAgentPanelIds = new Set(['html_video_stream_panel', 'video_agent_source_playback_panel', 'video_agent_transcript_panel', 'video_agent_frame_analysis_panel', 'video_agent_multi_dimensional_table_panel', 'video_agent_dataset_panel'])
    const videoAgentPanels = nodes.filter(node => videoAgentPanelIds.has(String(node.id || '')))
    const datasetPanel = videoAgentPanels.find(node => String(node.id || '') === 'video_agent_dataset_panel')
    if (!sourceSpecNode || !rendererNode || videoAgentPanels.length !== VIDEO_AGENT_RICH_MEDIA_PANEL_ROUTES.length || !datasetPanel) {
      throw new Error(`expected complete video-agent import to parse Storyboard Widget graph nodes, got ${JSON.stringify(nodes.map(node => ({ id: node.id, type: node.type })))}`)
    }
    const sourceSpecProperties = (sourceSpecNode.properties || {}) as Record<string, unknown>
    if (
      !String(sourceSpecProperties.data_json || '').includes('datasetOperationSummary')
      || !String(sourceSpecProperties.data_json || '').includes('zoneCounting')
      || !String(sourceSpecProperties.data_json || '').includes('playbackEmbedUrl')
      || !String(sourceSpecProperties.data_json || '').includes('sourceTranscript')
      || !String(sourceSpecProperties.data_json || '').includes('frameByFrameTranscript')
      || !readKtvString(sourceSpecProperties.sourcePlaybackUrl).includes('youtube-nocookie.com/embed')
      || !String(sourceSpecProperties.frameBoundingBoxes || '').includes('tracked subject')
      || !String(sourceSpecProperties.sourceTranscript || '').includes('Validation import parse evidence')
      || !String(sourceSpecProperties.frameByFrameTranscript || '').includes('transcriptSegmentIndex')
    ) throw new Error('expected source Render_Spec node to carry parsed dataset, frame, and transcript artifacts')
    const [streamPanel, sourcePlaybackPanel, transcriptPanel] = ['html_video_stream_panel', 'video_agent_source_playback_panel', 'video_agent_transcript_panel']
      .map(id => videoAgentPanels.find(node => String(node.id || '') === id))
    const streamPanelProperties = (streamPanel?.properties || {}) as Record<string, unknown>
    if (
      !String(streamPanelProperties.outputSrcDoc || '').includes('data-kg-video-agent-stream-panel')
      || String(streamPanelProperties.outputSrcDoc || '').includes('data-kg-video-agent-source-playback="1"')
      || readKtvString(streamPanelProperties.kind) !== 'iframe'
      || readKtvString(streamPanelProperties.videoAgentKind) !== 'stream'
      || unwrapKtvValue(streamPanelProperties.media_interactive) !== true
    ) throw new Error('expected stream Rich Media panel to stay separated from source playback and frame analysis')
    const streamPanelMediaSpec = streamPanel ? getNodeMediaSpec(streamPanel) : null
    if (
      streamPanelMediaSpec?.kind !== 'iframe'
      || streamPanelMediaSpec.interactive !== true
      || !String(streamPanelMediaSpec.srcDoc || '').includes('data-kg-video-agent-stream-panel')
      || String(streamPanelMediaSpec.srcDoc || '').includes('data-kg-video-agent-source-playback="1"')
      || String(streamPanelMediaSpec.srcDoc || '').includes('data-kg-video-agent-frame-analysis')
    ) throw new Error(`expected stream Rich Media panel to resolve as isolated stream srcdoc, got ${JSON.stringify(streamPanelMediaSpec)}`)
    const sourcePlaybackPanelMediaSpec = sourcePlaybackPanel ? getNodeMediaSpec(sourcePlaybackPanel) : null
    const sourcePlaybackSrcDoc = String(sourcePlaybackPanelMediaSpec && 'srcDoc' in sourcePlaybackPanelMediaSpec ? sourcePlaybackPanelMediaSpec.srcDoc || '' : '')
    const [sourcePlaybackFrameIndex, sourcePlaybackFallbackIndex] = [sourcePlaybackSrcDoc.indexOf('data-kg-video-agent-source-playback="1"'), sourcePlaybackSrcDoc.indexOf('data-kg-video-agent-source-playback-fallback')]
    if (
      sourcePlaybackPanelMediaSpec?.kind !== 'iframe'
      || !sourcePlaybackSrcDoc.includes('data-kg-video-agent-source-playback')
      || !sourcePlaybackSrcDoc.includes('data-kg-video-agent-source-playback-fallback')
      || !sourcePlaybackSrcDoc.includes('youtube-nocookie.com/embed')
      || !sourcePlaybackSrcDoc.includes('kg-rich-media-panel-srcdoc-timeline-transport')
      || !sourcePlaybackSrcDoc.includes('agenticgraph:render-frame')
      || sourcePlaybackSrcDoc.includes('data-kg-video-agent-frame-analysis')
    ) throw new Error(`expected source playback Rich Media panel to own playable timeline-synced iframe srcdoc, got ${JSON.stringify(sourcePlaybackPanelMediaSpec)}`)
    if (sourcePlaybackFrameIndex < 0 || sourcePlaybackFallbackIndex < 0 || sourcePlaybackFrameIndex > sourcePlaybackFallbackIndex) throw new Error('expected source playback iframe to render before fallback source link')
    assertVideoAgentTranscriptPanelOwnsTimelineSyncedSrcDoc(transcriptPanel)
    const frameAnalysisMediaSpec = getNodeMediaSpec(videoAgentPanels.find(node => String(node.id || '') === 'video_agent_frame_analysis_panel') || null)
    const frameAnalysisSrcDoc = String(frameAnalysisMediaSpec && 'srcDoc' in frameAnalysisMediaSpec ? frameAnalysisMediaSpec.srcDoc || '' : '')
    if (
      frameAnalysisMediaSpec?.kind !== 'iframe' || !frameAnalysisSrcDoc.includes('data-kg-video-agent-frame-analysis')
      || !frameAnalysisSrcDoc.includes('kg-rich-media-panel-srcdoc-timeline-transport') || frameAnalysisSrcDoc.includes('data-kg-video-agent-source-playback="1"')
    ) throw new Error('expected frame-analysis Rich Media panel to stay route-owned and timeline-synced instead of reusing stream playback srcdoc')
    const datasetPanelProperties = (datasetPanel.properties || {}) as Record<string, unknown>
    if (
      !String(datasetPanelProperties.outputSrcDoc || '').includes('data-kg-video-agent-dataset-panel')
      || !String(datasetPanelProperties.visualDataset || '').includes('agenticgraph-visual-annotation-dataset/v1')
      || !String(datasetPanelProperties.mergedVisualDataset || '').includes('agenticgraph-visual-annotation-dataset/v1')
      || !String(datasetPanelProperties.zoneCounting || '').includes('agenticgraph-zone-counting/v1')
    ) {
      throw new Error('expected imported dataset Rich Media panel to carry load/split/merge/save and zone-counting artifacts')
    }
  } finally {
    restoreFetch()
    resetWorkspaceUrlContentCacheForTests()
  }
  const transcriptImports = importCalls.filter(call => call.startsWith('/__youtube_transcript?'))
  if (transcriptImports.length !== 1) throw new Error(`expected complete video-agent import to use one shared YouTube transcript request, got ${transcriptImports.length}`)
}
