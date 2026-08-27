import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  HTML_VIDEO_ENGINE_IDS,
  createHtmlVideoEngineRegistry,
  runHtmlVideoRenderJob,
  validateRenderSpec,
  type RenderEngine,
} from '@/features/html-video-renderer'
import { buildHtmlVideoPreviewSrcDocFromNode } from '@/features/html-video-renderer/htmlVideoFlowNode'
import {
  FLOW_HTML_VIDEO_RENDERER_NODE_LABEL,
  FLOW_HTML_VIDEO_RENDERER_NODE_TYPE_ID,
  FLOW_RICH_MEDIA_PANEL_NODE_TYPE_ID,
} from '@/lib/config.storyboard-widget'
import { parseMarkdownFrontmatter, splitMarkdownLines } from '@/lib/markdown'
import { VIDEO_AGENT_REFERENCE_BOUNDARY } from '@/features/video-agent'
import { readVideoAgentValidationUrlsFromEnv } from './helpers/videoAgentValidationInput'

const mockEngine = (engineId: string): RenderEngine => ({
  engineId,
  async render(spec) {
    return {
      blob: new Blob([`mp4:${engineId}:${spec.html}`], { type: 'video/mp4' }),
      engineId,
      durationMs: spec.durationMs,
      fps: spec.fps,
      width: spec.width,
      height: spec.height,
    }
  },
})

const readVdeoxplnDemoDocumentPath = (): string => {
  const fromEnv = String(process.env.AGENTICGRAPH_VDEOXPLN_DEMO_DOC_PATH || '').trim()
  if (fromEnv) return resolve(fromEnv)
  const hardcodeGuardInput = String(process.env.AG_TEST_VALIDATION_FORBID_HARDCODE_IN_REPO || '').trim()
  return hardcodeGuardInput ? resolve(hardcodeGuardInput) : ''
}

const unwrapKtvValue = (value: unknown): unknown => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value
  const record = value as Record<string, unknown>
  if (Object.prototype.hasOwnProperty.call(record, 'value')) return record.value
  return value
}

const readKtvString = (record: Record<string, unknown>, key: string): string => {
  const value = unwrapKtvValue(record[key])
  return typeof value === 'string' ? value : ''
}

const readKtvNumber = (record: Record<string, unknown>, key: string): number => {
  const value = unwrapKtvValue(record[key])
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

export async function testHtmlVideoRendererIngestsVdeoxplnDemoAnimatedMp4SpecWithoutHardcodedRuntimeArtifacts() {
  const demoPath = readVdeoxplnDemoDocumentPath()
  if (!demoPath) return
  if (!existsSync(demoPath)) throw new Error(`expected vdeoxpln validation doc at ${demoPath}`)
  const expectedVideoAgentTestUrls = readVideoAgentValidationUrlsFromEnv()
  if (expectedVideoAgentTestUrls.length === 0) {
    throw new Error('expected AGENTICGRAPH_VIDEO_AGENT_TEST_URLS to be provided for external video-agent validation')
  }
  const markdown = readFileSync(demoPath, 'utf8')
  for (const expectedVideoAgentTestUrl of expectedVideoAgentTestUrls) {
    if (markdown.includes(expectedVideoAgentTestUrl)) {
      throw new Error(`validation input must not persist operator URL fixture ${expectedVideoAgentTestUrl}`)
    }
  }
  for (const staleRuntimeLiteral of [
    ['blob', 'http://'].join(':'),
    ['outputManifestPath', ''].join(':'),
    ['outputSavedName', ''].join(':'),
    ['lastRunAt', ''].join(':'),
    ['outputLoading', ''].join(':'),
    ['renderErrorCode', ''].join(':'),
    ['renderErrorReason', ''].join(':'),
    'engine returned a blob that is not video',
  ]) {
    if (markdown.includes(staleRuntimeLiteral)) {
      throw new Error(`validation input must not persist runtime artifact ${staleRuntimeLiteral}`)
    }
  }

  const parsed = parseMarkdownFrontmatter(splitMarkdownLines(markdown))
  if (parsed.warnings.length > 0) throw new Error(`expected clean frontmatter parse, got ${parsed.warnings.join('; ')}`)
  if (parsed.meta.validation_input_forbid_hardcode_in_repo !== true || parsed.meta.copyhardcode_forbid !== true) {
    throw new Error('expected validation input to declare hardcode-forbid flags')
  }
  const videoAgentContract = parsed.meta.videoAgentRuntimeContract as Record<string, unknown> | undefined
  if (!videoAgentContract || typeof videoAgentContract !== 'object' || Array.isArray(videoAgentContract)) {
    throw new Error('expected validation input to declare a video-agent runtime contract')
  }
  if (videoAgentContract.schema !== 'agenticgraph-video-agent/v1') {
    throw new Error('expected validation input to declare agenticgraph-video-agent/v1')
  }
  if ('testUrl' in videoAgentContract || 'testUrls' in videoAgentContract || 'sourceId' in videoAgentContract || 'sourceIds' in videoAgentContract) {
    throw new Error('expected validation input video-agent contract to avoid persisted URL/source-id fixtures')
  }
  const operatorConfig = videoAgentContract.operatorConfig as Record<string, unknown> | undefined
  if (
    operatorConfig?.storageKey !== 'agenticgraph:video-agent:validation-config:v1'
    || typeof operatorConfig.validationUrlsSource !== 'string'
  ) {
    throw new Error('expected validation input video-agent contract to declare operator-owned validation URL config')
  }
  const dependencyPolicy = Array.isArray(videoAgentContract.dependencyPolicy) ? videoAgentContract.dependencyPolicy.map(String) : []
  for (const requiredPolicy of ['no copied Director code', 'no VideoDB runtime dependency', 'no external API key requirement']) {
    if (!dependencyPolicy.includes(requiredPolicy)) throw new Error(`expected video-agent dependency policy ${requiredPolicy}`)
  }
  const referenceBoundary = videoAgentContract.referenceBoundary as Record<string, unknown> | undefined
  for (const [key, value] of Object.entries(VIDEO_AGENT_REFERENCE_BOUNDARY)) {
    if (referenceBoundary?.[key] !== value) {
      throw new Error(`expected video-agent reference boundary ${key}=${String(value)}`)
    }
  }
  const contractCapabilities = Array.isArray(videoAgentContract.capabilities) ? videoAgentContract.capabilities.map(String) : []
  for (const requiredCapability of ['ingest', 'parse', 'search', 'edit', 'compile', 'generate', 'stream']) {
    if (!contractCapabilities.includes(requiredCapability)) throw new Error(`expected video-agent contract capability ${requiredCapability}`)
  }

  const flow = parsed.meta.flow
  if (!flow || typeof flow !== 'object' || Array.isArray(flow)) throw new Error('expected frontmatter flow graph')
  const nodes = (flow as { nodes?: unknown }).nodes
  if (!Array.isArray(nodes)) throw new Error('expected flow.nodes array')
  const records = nodes.filter((node): node is Record<string, unknown> => !!node && typeof node === 'object' && !Array.isArray(node))
  const rendererNode = records.find(node => readKtvString(node, 'type') === FLOW_HTML_VIDEO_RENDERER_NODE_TYPE_ID)
  if (!rendererNode) throw new Error('expected HtmlVideoRenderer node from validation input')
  const panelNode = records.find(node => readKtvString(node, 'type') === FLOW_RICH_MEDIA_PANEL_NODE_TYPE_ID)
  if (!panelNode) throw new Error('expected RichMediaPanel node from validation input')
  for (const runtimeKey of ['lastRunAt', 'output', 'outputSrcDoc', 'renderErrorCode', 'renderErrorReason']) {
    if (Object.prototype.hasOwnProperty.call(panelNode, runtimeKey)) {
      throw new Error(`validation input Rich Media Panel must not persist runtime field ${runtimeKey}`)
    }
  }

  const specCandidate = {
    html: readKtvString(rendererNode, 'html'),
    css: readKtvString(rendererNode, 'css'),
    data: JSON.parse(readKtvString(rendererNode, 'data_json') || '{}') as unknown,
    durationMs: readKtvNumber(rendererNode, 'duration_ms'),
    fps: readKtvNumber(rendererNode, 'fps'),
    width: readKtvNumber(rendererNode, 'width'),
    height: readKtvNumber(rendererNode, 'height'),
    engineHint: readKtvString(rendererNode, 'engine_hint'),
  }
  const validated = validateRenderSpec(specCandidate)
  if (validated.ok === false) throw new Error(`expected validation doc Render_Spec to validate: ${validated.reason}`)
  if (validated.spec.engineHint !== HTML_VIDEO_ENGINE_IDS.canvas2d) throw new Error('expected validation doc to select canvas-2d')
  if (validated.spec.durationMs <= 0 || validated.spec.fps !== 24) throw new Error('expected validation doc to expose a runnable 24fps composition')
  for (const requiredHtml of ['data-duration=', '<main', '<section', '<article', '<figure', 'Video agent reasoning trace', 'Instant stream']) {
    if (!validated.spec.html.includes(requiredHtml)) throw new Error(`expected validation doc Render_Spec HTML to include ${requiredHtml}`)
  }
  if (!String(validated.spec.css || '').includes('@keyframes')) throw new Error('expected validation doc Render_Spec CSS keyframes')
  if (!validated.spec.html.includes('operator-supplied validation source')) throw new Error('expected validation doc Render_Spec HTML to display an operator-supplied validation source placeholder')
  for (const expectedVideoAgentTestUrl of expectedVideoAgentTestUrls) {
    if (validated.spec.html.includes(expectedVideoAgentTestUrl)) {
      throw new Error(`expected validation doc Render_Spec HTML to avoid persisted operator URL fixture ${expectedVideoAgentTestUrl}`)
    }
  }

  const responsivePreviewSrcDoc = buildHtmlVideoPreviewSrcDocFromNode({
    id: 'html-video-preview-validation',
    type: FLOW_HTML_VIDEO_RENDERER_NODE_TYPE_ID,
    label: FLOW_HTML_VIDEO_RENDERER_NODE_LABEL,
    properties: {
      html: specCandidate.html,
      css: specCandidate.css,
      data_json: JSON.stringify(specCandidate.data),
      duration_ms: specCandidate.durationMs,
      fps: specCandidate.fps,
      width: specCandidate.width,
      height: specCandidate.height,
      engine_hint: specCandidate.engineHint,
    },
  })
  for (const requiredPreviewFragment of [
    'data-kg-html-video-preview-frame',
    'data-kg-html-video-preview-stage',
    'aspect-ratio:1280/720',
    'ResizeObserver',
    '--kg-html-video-preview-scale',
    '--kg-html-video-preview-width',
    '--kg-html-video-preview-height',
    'var scale=frameWidth/sourceWidth;',
    'stage.style.setProperty("--kg-html-video-preview-width",sourceWidth+"px")',
    'stage.style.setProperty("--kg-html-video-preview-height",sourceHeight+"px")',
    'section[data-kg-html-video-preview-stage]{position:absolute;left:0;top:0;width:1280px;height:720px;overflow:hidden;transform-origin:0 0;transform:scale(var(--kg-html-video-preview-scale,1));}',
    'frame.style.width=frameWidth+"px"',
    'frame.style.height=frameHeight+"px"',
  ]) {
    if (!responsivePreviewSrcDoc.includes(requiredPreviewFragment)) {
      throw new Error(`expected responsive 16:9 HTML video preview fragment ${requiredPreviewFragment}`)
    }
  }

  const data = validated.spec.data as {
    agents?: unknown
    capabilities?: unknown
    composition?: { id?: unknown }
    reasoningArtifacts?: unknown
    sourceVideo?: { externalDependency?: unknown; sourceKey?: unknown }
    streaming?: { fallback?: unknown; panel?: unknown; primary?: unknown }
    timelineTracks?: unknown
    workspaceFiles?: unknown
  }
  if (typeof data.composition?.id !== 'string' || !data.composition.id.includes('video-agent')) throw new Error('expected validation doc data_json to identify a video-agent composition')
  if (
    data.sourceVideo?.externalDependency !== false
    || !String(data.sourceVideo?.sourceKey || '').includes('operator-supplied-video-agent-validation-source')
  ) throw new Error('expected validation doc data_json to expose operator-owned validation input without a persisted URL fixture')
  const capabilities = Array.isArray(data.capabilities) ? data.capabilities.map(String) : []
  for (const requiredCapability of ['ingest', 'parse', 'search', 'edit', 'compile', 'generate', 'stream']) {
    if (!capabilities.includes(requiredCapability)) throw new Error(`expected validation doc data_json capability ${requiredCapability}`)
  }
  if (!Array.isArray(data.agents) || data.agents.length < capabilities.length) throw new Error('expected validation doc data_json to expose one or more agent stages per video-agent capability')
  if (!Array.isArray(data.reasoningArtifacts) || !data.reasoningArtifacts.some(entry => String((entry as { streamSignal?: unknown }).streamSignal || '') === 'stream-ready')) {
    throw new Error('expected validation doc data_json to expose stream-ready reasoning artifacts')
  }
  if (data.streaming?.primary !== 'video/mp4' || data.streaming.fallback !== 'outputSrcDoc' || data.streaming.panel !== 'RichMediaPanel') throw new Error('expected validation doc data_json to expose streamable Rich Media output boundaries')
  if (
    !Array.isArray(data.timelineTracks)
    || data.timelineTracks.length !== 3
    || !data.timelineTracks.some(entry => String((entry as { source?: unknown }).source || '') === 'source-video')
    || !data.timelineTracks.some(entry => String((entry as { source?: unknown }).source || '') === 'frame-bounding-boxes' && String((entry as { timelineLane?: unknown }).timelineLane || '') === 'fbf')
    || !data.timelineTracks.some(entry => String((entry as { source?: unknown }).source || '') === 'source-audio')
  ) throw new Error('expected validation doc data_json to expose compact source video, FBF, and source audio timeline tracks')
  if (!Array.isArray(data.workspaceFiles) || !data.workspaceFiles.some((entry) => {
    const path = String((entry as { path?: unknown } | null)?.path || '')
    const role = String((entry as { role?: unknown } | null)?.role || '')
    return path.startsWith('video-agent/') && path.endsWith('.json') && ['parse-output', 'generation-plan', 'stream-output'].includes(role)
  })) {
    throw new Error('expected validation doc data_json to expose parse, generation, and stream workspace outputs')
  }

  const renderResult = await runHtmlVideoRenderJob({
    spec: validated.spec,
    node: {
      id: readKtvString(rendererNode, 'id') || 'html-video-validation-node',
      type: FLOW_HTML_VIDEO_RENDERER_NODE_TYPE_ID,
      label: readKtvString(rendererNode, 'label') || FLOW_HTML_VIDEO_RENDERER_NODE_LABEL,
      properties: {},
    },
    registry: createHtmlVideoEngineRegistry([mockEngine(validated.spec.engineHint)]),
  })
  if (renderResult.ok === false) throw new Error(`expected validation doc Render_Spec to render, got ${renderResult.reason}`)
  if (renderResult.blob.type !== 'video/mp4' || renderResult.engineId !== HTML_VIDEO_ENGINE_IDS.canvas2d) throw new Error('expected validation doc render to produce a canvas-2d video/mp4 result')
  const previewSrcDoc = buildHtmlVideoPreviewSrcDocFromNode({
    id: readKtvString(rendererNode, 'id') || 'html-video-validation-node',
    type: FLOW_HTML_VIDEO_RENDERER_NODE_TYPE_ID,
    label: readKtvString(rendererNode, 'label') || FLOW_HTML_VIDEO_RENDERER_NODE_LABEL,
    properties: {
      html: validated.spec.html,
      css: validated.spec.css,
      data_json: JSON.stringify(validated.spec.data || {}),
      duration_ms: validated.spec.durationMs,
      fps: validated.spec.fps,
      width: validated.spec.width,
      height: validated.spec.height,
      engine_hint: validated.spec.engineHint,
    },
  })
  for (const requiredPreviewText of ['agenticgraph-html-video-data', '@keyframes', 'operator-supplied validation source', 'AgenticGraph video agent', 'Video agent reasoning trace', 'Instant stream']) {
    if (!previewSrcDoc.includes(requiredPreviewText)) throw new Error(`expected validation doc preview to include ${requiredPreviewText}`)
  }
  for (const expectedVideoAgentTestUrl of expectedVideoAgentTestUrls) {
    if (previewSrcDoc.includes(expectedVideoAgentTestUrl)) {
      throw new Error(`expected validation doc preview to avoid persisted operator URL fixture ${expectedVideoAgentTestUrl}`)
    }
  }

  const originalTestText = readFileSync(resolve(process.cwd(), 'src', '__tests__', 'htmlVideoRenderer.test.ts'), 'utf8')
  if (originalTestText.includes(validated.spec.html) || originalTestText.includes(validated.spec.css)) {
    throw new Error('test must ingest validation source instead of copying HTML/CSS payloads into repo fixtures')
  }
}
