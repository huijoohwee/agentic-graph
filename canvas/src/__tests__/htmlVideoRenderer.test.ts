import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  HTML_VIDEO_ENGINE_IDS,
  AGENTIC_OS_HTML_VIDEO_ENGINE,
  buildHtmlVideoRendererRegistryDraft,
  buildRenderJobId,
  createHtmlVideoEngineRegistry,
  createHtmlVideoEngineRegistryFromRuntimeConfig,
  resolveHtmlVideoEngine,
  runHtmlVideoRenderJob,
  validateRenderSpec,
  type RenderEngine,
  type RenderSpec,
} from '@/features/html-video-renderer'
import {
  FLOW_HTML_VIDEO_RENDERER_FORM_ID,
  FLOW_HTML_VIDEO_RENDERER_NODE_LABEL,
  FLOW_HTML_VIDEO_RENDERER_NODE_TYPE_ID,
  FLOW_HTML_VIDEO_RENDERER_WIDGET_TYPE_ID,
  FLOW_RICH_MEDIA_PANEL_NODE_TYPE_ID,
} from '@/lib/config.storyboard-widget'
import { buildCanonicalWidgetRegistryDraft, getWidgetRegistryEntryLabel } from '@/features/storyboard-widget-manager/registryTemplates'
import { isRichMediaOutputTargetNode, resolveRichMediaWidgetKind } from '@/features/chat/richMediaRun'

const validSpec = (): RenderSpec => ({
  html: '<main><h1>Quarterly Update</h1></main>',
  css: 'main { color: black; }',
  data: { b: 2, a: { nested: true } },
  durationMs: 3000,
  fps: 30,
  width: 1280,
  height: 720,
})

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

export function testHtmlVideoRendererValidatesSpecAndRejectsInvalidInput() {
  const ok = validateRenderSpec(validSpec())
  if (ok.ok === false) throw new Error(`expected valid spec, got ${ok.reason}`)
  if (ok.spec.html !== validSpec().html || ok.spec.fps !== 30) throw new Error('expected validator to preserve input fields')

  for (const candidate of [
    { ...validSpec(), html: '   ' },
    { ...validSpec(), durationMs: 0 },
    { ...validSpec(), fps: 121 },
    { ...validSpec(), width: 7681 },
    { ...validSpec(), height: 4321 },
    { ...validSpec(), engineHint: 'x'.repeat(256) },
  ]) {
    const result = validateRenderSpec(candidate)
    if (result.ok === true) throw new Error(`expected invalid spec for ${JSON.stringify(candidate)}`)
  }
}

export function testHtmlVideoEngineResolverReadsEnvAtInvocationAndHonorsHint() {
  const previous = process.env[AGENTIC_OS_HTML_VIDEO_ENGINE]
  try {
    const registry = createHtmlVideoEngineRegistry([
      mockEngine(HTML_VIDEO_ENGINE_IDS.headlessBrowser),
      mockEngine(HTML_VIDEO_ENGINE_IDS.canvas2d),
    ])
    delete process.env[AGENTIC_OS_HTML_VIDEO_ENGINE]
    const missing = resolveHtmlVideoEngine(registry)
    if (missing.ok === true || missing.errorCode !== 'engine_not_configured') throw new Error('expected missing env to fail')

    process.env[AGENTIC_OS_HTML_VIDEO_ENGINE] = HTML_VIDEO_ENGINE_IDS.headlessBrowser
    const fromEnv = resolveHtmlVideoEngine(registry)
    if (!fromEnv.ok || fromEnv.engine.engineId !== HTML_VIDEO_ENGINE_IDS.headlessBrowser) throw new Error('expected env-selected engine')

    process.env[AGENTIC_OS_HTML_VIDEO_ENGINE] = HTML_VIDEO_ENGINE_IDS.headlessBrowser
    const fromHint = resolveHtmlVideoEngine(registry, HTML_VIDEO_ENGINE_IDS.canvas2d)
    if (!fromHint.ok || fromHint.engine.engineId !== HTML_VIDEO_ENGINE_IDS.canvas2d) throw new Error('expected hint to override env')
  } finally {
    if (typeof previous === 'string') process.env[AGENTIC_OS_HTML_VIDEO_ENGINE] = previous
    else delete process.env[AGENTIC_OS_HTML_VIDEO_ENGINE]
  }
}

export function testHtmlVideoEngineRegistryReadsRuntimeInjectedAdaptersWithoutHardcodedFallback() {
  const globalConfig = globalThis as typeof globalThis & { agenticGraphHtmlVideoEngines?: RenderEngine[] | null }
  const previous = globalConfig.agenticGraphHtmlVideoEngines
  try {
    globalConfig.agenticGraphHtmlVideoEngines = [mockEngine('runtime-engine')]
    const registry = createHtmlVideoEngineRegistryFromRuntimeConfig()
    const resolved = resolveHtmlVideoEngine(registry, 'runtime-engine')
    if (resolved.ok === false || resolved.engine.engineId !== 'runtime-engine') {
      throw new Error('expected runtime-injected adapter to resolve')
    }
    const missing = resolveHtmlVideoEngine(createHtmlVideoEngineRegistryFromRuntimeConfig({ adapters: [] }), 'runtime-engine')
    if (missing.ok === true || missing.engineId !== 'runtime-engine') {
      throw new Error('expected explicit empty runtime config to avoid global fallback')
    }
  } finally {
    if (typeof previous === 'undefined') delete globalConfig.agenticGraphHtmlVideoEngines
    else globalConfig.agenticGraphHtmlVideoEngines = previous
  }
}

export function testHtmlVideoRenderJobSemanticKeyIsDeterministicAndEngineSpecific() {
  const spec = validSpec()
  const first = buildRenderJobId(spec, HTML_VIDEO_ENGINE_IDS.headlessBrowser)
  const second = buildRenderJobId({ ...spec, data: { a: { nested: true }, b: 2 } }, HTML_VIDEO_ENGINE_IDS.headlessBrowser)
  const differentEngine = buildRenderJobId(spec, HTML_VIDEO_ENGINE_IDS.canvas2d)
  const differentSpec = buildRenderJobId({ ...spec, fps: 24 }, HTML_VIDEO_ENGINE_IDS.headlessBrowser)
  if (!first || first !== second) throw new Error('expected stable semantic key for equivalent spec')
  if (first === differentEngine) throw new Error('expected engine id to affect semantic key')
  if (first === differentSpec) throw new Error('expected spec fields to affect semantic key')
}

export async function testHtmlVideoRenderJobReturnsStructuredErrorsWithoutEngineOrThrows() {
  const node = { id: 'html-video-1', type: FLOW_HTML_VIDEO_RENDERER_NODE_TYPE_ID, label: FLOW_HTML_VIDEO_RENDERER_NODE_LABEL, properties: {} }
  const missing = await runHtmlVideoRenderJob({
    spec: validSpec(),
    node,
    registry: createHtmlVideoEngineRegistry([]),
  })
  if (missing.ok === true || missing.errorCode !== 'engine_not_configured') throw new Error('expected missing engine to stay structured')

  const throwing = await runHtmlVideoRenderJob({
    spec: { ...validSpec(), engineHint: 'throwing-engine' },
    node,
    registry: createHtmlVideoEngineRegistry([{
      engineId: 'throwing-engine',
      async render() {
        throw new Error('boom')
      },
    }]),
  })
  if (throwing.ok === true || throwing.errorCode !== 'render_failed' || !String(throwing.reason || '').includes('boom')) {
    throw new Error(`expected render_failed, got ${JSON.stringify(throwing)}`)
  }

  const browserNativeWebm = await runHtmlVideoRenderJob({
    spec: { ...validSpec(), engineHint: 'browser-native-webm' },
    node,
    registry: createHtmlVideoEngineRegistry([{
      engineId: 'browser-native-webm',
      async render(spec) {
        return {
          blob: new Blob([`webm:${spec.html}`], { type: 'video/webm; codecs="vp8"' }),
          engineId: 'browser-native-webm',
          durationMs: spec.durationMs,
          fps: spec.fps,
          width: spec.width,
          height: spec.height,
        }
      },
    }]),
  })
  if (browserNativeWebm.ok === false) {
    throw new Error(`expected browser-native video/webm blobs to publish as video artifacts, got ${browserNativeWebm.reason}`)
  }
  if (browserNativeWebm.blob.type !== 'video/webm; codecs="vp8"') {
    throw new Error(`expected browser-native recorder MIME to be preserved, got ${browserNativeWebm.blob.type}`)
  }
}

export function testHtmlVideoRendererFlowRegistryAndRichMediaKind() {
  const direct = buildHtmlVideoRendererRegistryDraft()
  const canonical = buildCanonicalWidgetRegistryDraft({ nodeTypeId: FLOW_HTML_VIDEO_RENDERER_NODE_TYPE_ID })
  if (!canonical) throw new Error('expected canonical HTML video registry draft')
  if (direct.nodeTypeId !== FLOW_HTML_VIDEO_RENDERER_NODE_TYPE_ID || canonical.nodeTypeId !== FLOW_HTML_VIDEO_RENDERER_NODE_TYPE_ID) {
    throw new Error('expected HTML video node type id')
  }
  if (direct.widgetTypeId !== FLOW_HTML_VIDEO_RENDERER_WIDGET_TYPE_ID || direct.formId !== FLOW_HTML_VIDEO_RENDERER_FORM_ID) {
    throw new Error('expected HTML video widget identity constants')
  }
  if (getWidgetRegistryEntryLabel({ nodeTypeId: FLOW_HTML_VIDEO_RENDERER_NODE_TYPE_ID }) !== FLOW_HTML_VIDEO_RENDERER_NODE_LABEL) {
    throw new Error('expected HTML video widget label')
  }
  const fieldPaths = new Set(canonical.fields.map(field => field.schemaPath))
  for (const path of ['properties.html', 'properties.css', 'properties.data_json', 'properties.duration_ms', 'properties.fps', 'properties.width', 'properties.height', 'properties.engine_hint']) {
    if (!fieldPaths.has(path)) throw new Error(`expected field path ${path}`)
  }
  const outputPortPaths = new Set(canonical.ports.filter(port => port.direction === 'output').map(port => port.schemaPath))
  for (const path of ['properties.videoUrl', 'properties.outputSrcDoc', 'properties.outputPath', 'properties.renderJobId']) {
    if (!outputPortPaths.has(path)) throw new Error(`expected HTML video output port path ${path}`)
  }
  const kind = resolveRichMediaWidgetKind({ id: 'html-video-1', type: FLOW_HTML_VIDEO_RENDERER_NODE_TYPE_ID, label: '', properties: {} })
  if (kind !== 'video') throw new Error(`expected rich media video kind, got ${kind}`)
  if (!isRichMediaOutputTargetNode({ id: 'html-video-1', type: FLOW_HTML_VIDEO_RENDERER_NODE_TYPE_ID, label: '', properties: {} })) {
    throw new Error('expected HTML video renderer to be a video output source target')
  }
  if (!isRichMediaOutputTargetNode({ id: 'rich-media-panel-1', type: FLOW_RICH_MEDIA_PANEL_NODE_TYPE_ID, label: '', properties: {} })) {
    throw new Error('expected Rich Media Panel to accept rendered video output')
  }
}

export function testHtmlVideoRendererSourceContractsAvoidParallelStorageAndAdapterImports() {
  const ssotText = readFileSync(resolve(process.cwd(), 'src', 'features', 'html-video-renderer', 'htmlVideoRendererSsot.ts'), 'utf8')
  for (const forbidden of ['headlessBrowserAdapter', 'canvas2dAdapter', 'serverSideAdapter']) {
    if (ssotText.includes(forbidden)) throw new Error(`SSOT must not import adapter module ${forbidden}`)
  }
  if (!ssotText.includes('Object.freeze({')) throw new Error('expected frozen engine id map')

  const jobText = readFileSync(resolve(process.cwd(), 'src', 'features', 'html-video-renderer', 'htmlVideoRenderJob.ts'), 'utf8')
  if (!jobText.includes("import { writeRichMediaWidgetRunOutputArtifact } from '@/features/chat/richMediaRun'")) {
    throw new Error('expected render job to reuse shared rich media artifact writer')
  }
  if (!jobText.includes("buildScopedGraphSemanticKey('html-video-render'")) {
    throw new Error('expected render job to use shared scoped semantic key helper')
  }
  if (!jobText.includes("['engineId', engineId]")) {
    throw new Error('expected render job to pass engineId into manifest metadata')
  }

  const richMediaRunText = readFileSync(resolve(process.cwd(), 'src', 'features', 'chat', 'richMediaRun.ts'), 'utf8')
  if (!richMediaRunText.includes('manifestMetadata')) {
    throw new Error('expected shared rich media writer to accept manifest metadata')
  }
  const workflowText = readFileSync(resolve(process.cwd(), 'src', 'components', 'StoryboardWidgetCanvas', 'runtime', 'storyboardWidgetWorkflowRunAction.ts'), 'utf8')
  if (!workflowText.includes('createHtmlVideoEngineRegistryFromRuntimeConfig()')) {
    throw new Error('expected Storyboard Widget runner to read runtime-injected HTML video engines')
  }
}

export async function testHtmlVideoHeadlessBrowserAdapterIsNativeFossRuntimeAdapter() {
  const adapterPath = resolve(process.cwd(), 'src', 'features', 'html-video-renderer', 'engines', 'headlessBrowserAdapter.ts')
  const adapterText = readFileSync(adapterPath, 'utf8')
  for (const required of [
    "await import('playwright')",
    "await import('node:child_process')",
    'FFmpeg exited with code',
    'AGENTIC_OS_HTML_VIDEO_FFMPEG_BIN',
    'AGENTIC_OS_HTML_VIDEO_FFMPEG_VIDEO_CODEC',
    'window.__agenticGraphRenderFrame',
    'window.__hyperframesSeek',
    'window.__timelines',
    "DEFAULT_MP4_VIDEO_CODEC = 'mpeg4'",
  ]) {
    if (!adapterText.includes(required)) throw new Error(`expected headless browser adapter to include ${required}`)
  }
  for (const forbidden of ['@hyperframes/', 'hyperframes.com', "DEFAULT_MP4_VIDEO_CODEC = 'libx264'"]) {
    if (adapterText.includes(forbidden)) throw new Error(`headless browser adapter must not copy or force ${forbidden}`)
  }

  const { headlessBrowserAdapter, AGENTIC_OS_HTML_VIDEO_MAX_FRAMES } = await import('@/features/html-video-renderer/engines/headlessBrowserAdapter')
  const previous = process.env[AGENTIC_OS_HTML_VIDEO_MAX_FRAMES]
  try {
    process.env[AGENTIC_OS_HTML_VIDEO_MAX_FRAMES] = '1'
    let failed = false
    try {
      await headlessBrowserAdapter.render({ ...validSpec(), durationMs: 1000, fps: 30 })
    } catch (error) {
      failed = String(error instanceof Error ? error.message : error).includes('blocks 30 requested frames')
    }
    if (!failed) throw new Error('expected max frame guard to fail before browser or FFmpeg execution')
  } finally {
    if (typeof previous === 'string') process.env[AGENTIC_OS_HTML_VIDEO_MAX_FRAMES] = previous
    else delete process.env[AGENTIC_OS_HTML_VIDEO_MAX_FRAMES]
  }
}

export async function testHtmlVideoCanvas2dAdapterIsBrowserNativeRecorderRuntimeAdapter() {
  const adapterPath = resolve(process.cwd(), 'src', 'features', 'html-video-renderer', 'engines', 'canvas2dAdapter.ts')
  const adapterText = readFileSync(adapterPath, 'utf8')
  const forbiddenExternalMediaToolkit = ['media', 'bunny'].join('')
  for (const required of [
    'MediaRecorder',
    'canvas.captureStream(spec.fps)',
    'requestCanvasFrame(stream)',
    'stopMediaStream(stream)',
    'CANVAS_2D_RECORDER_MIME_CANDIDATES',
    'MEDIA_VIDEO_RECORDER_MIME_TYPE_CANDIDATES',
    "await import('html2canvas')",
    'rasterizer=html2canvas',
    'recorder=MediaRecorder',
    'data-kg-html-video-frame-host',
    "document.createElement('iframe')",
    "host.setAttribute('aria-label', 'HTML video frame raster host')",
    "host.setAttribute('sandbox', 'allow-scripts allow-same-origin')",
    'host.srcdoc = buildFrameDocument(spec, timeMs)',
    'const renderRoot = frameDocument.querySelector',
    'host.remove()',
  ]) {
    if (!adapterText.includes(required)) throw new Error(`expected canvas-2d browser MP4 adapter to include ${required}`)
  }
  if (
    adapterText.includes("document.createElement('div')") ||
    adapterText.includes("document.createElement('main')") ||
    adapterText.includes('host.innerHTML =') ||
    adapterText.includes('host.append(style') ||
    adapterText.includes('style.textContent = buildFrameStyle')
  ) {
    throw new Error('expected canvas-2d adapter to isolate render CSS in a frame document instead of the top document')
  }
  for (const forbidden of [forbiddenExternalMediaToolkit, 'Mp4OutputFormat', 'CanvasSource', 'BufferTarget', 'ffmpeg', '@ffmpeg/', '@hyperframes/', 'Puppeteer']) {
    if (adapterText.includes(forbidden)) throw new Error(`canvas-2d adapter must not require ${forbidden}`)
  }

  const { canvas2dAdapter } = await import('@/features/html-video-renderer/engines/canvas2dAdapter')
  let failed = false
  try {
    await canvas2dAdapter.render(validSpec())
  } catch (error) {
    failed = String(error instanceof Error ? error.message : error).includes('requires a browser runtime')
  }
  if (!failed) throw new Error('expected canvas-2d adapter to fail closed outside a browser runtime')
}

export async function testHtmlVideoBrowserRuntimeRegistersCanvas2dWithoutFallbackEngine() {
  const globalConfig = globalThis as typeof globalThis & { agenticGraphHtmlVideoEngines?: RenderEngine[] | null }
  const previous = globalConfig.agenticGraphHtmlVideoEngines
  try {
    globalConfig.agenticGraphHtmlVideoEngines = []
    const { installHtmlVideoBrowserRuntimeAdapters } = await import('@/features/html-video-renderer/htmlVideoBrowserRuntime')
    installHtmlVideoBrowserRuntimeAdapters()
    installHtmlVideoBrowserRuntimeAdapters()
    const registry = createHtmlVideoEngineRegistryFromRuntimeConfig()
    const canvas2d = resolveHtmlVideoEngine(registry, HTML_VIDEO_ENGINE_IDS.canvas2d)
    if (canvas2d.ok === false || canvas2d.engine.engineId !== HTML_VIDEO_ENGINE_IDS.canvas2d) {
      throw new Error('expected browser runtime to register canvas-2d adapter')
    }
    const headless = resolveHtmlVideoEngine(registry, HTML_VIDEO_ENGINE_IDS.headlessBrowser)
    if (headless.ok === true) {
      throw new Error('expected browser runtime not to register headless-browser as a fallback engine')
    }
    if ((globalConfig.agenticGraphHtmlVideoEngines || []).length !== 1) {
      throw new Error('expected browser runtime registration to dedupe adapters')
    }
  } finally {
    if (typeof previous === 'undefined') delete globalConfig.agenticGraphHtmlVideoEngines
    else globalConfig.agenticGraphHtmlVideoEngines = previous
  }
}

export function testHtmlVideoWorkflowPublishesRenderedMp4ToRichMediaPanel() {
  const mainText = readFileSync(resolve(process.cwd(), 'src', 'main.tsx'), 'utf8')
  if (!mainText.includes('installHtmlVideoBrowserRuntimeAdapters()')) {
    throw new Error('expected browser runtime to install HTML video runtime adapters at app startup')
  }
  const workflowRunText = readFileSync(resolve(process.cwd(), 'src', 'components', 'StoryboardWidgetCanvas', 'runtime', 'storyboardWidgetWorkflowRunAction.ts'), 'utf8')
  const mediaHandlersText = readFileSync(resolve(process.cwd(), 'src', 'components', 'StoryboardWidgetCanvas', 'runtime', 'storyboardWidgetWorkflowMediaRunHandlers.ts'), 'utf8')
  const richMediaPublicationText = readFileSync(resolve(process.cwd(), 'src', 'components', 'StoryboardWidgetCanvas', 'runtime', 'storyboardWidgetWorkflowRichMediaPublication.ts'), 'utf8')
  const workflowText = [workflowRunText, mediaHandlersText, richMediaPublicationText].join('\n')
  for (const required of [
    'runStoryboardWidgetMediaWorkflowNode',
    'publishMediaRunOutputToRichMediaPanel',
    'resolveStoryboardWidgetWorkflowDownstreamRunTargetIds',
    "richMediaActiveTab: 'video'",
    "readConnectedHtmlVideoProperty('properties.html', 'html')",
    'createHtmlVideoEngineRegistryFromRuntimeConfig()',
    'isRichMediaOutputTargetNode(args.resolveNodeByIdAcrossGraphs(targetId))',
    'buildHtmlVideoPreviewSrcDocFromNode(htmlVideoNode)',
    '...(outputSrcDoc.trim() ? { outputSrcDoc } : null)',
    'resolveMediaPatchActiveTab',
    'stabilizeHtmlVideoPreviewPatchForExistingProps',
    'HTML_VIDEO_PREVIEW_STABILITY_KEYS',
    'lastRunAt: currentProps.lastRunAt',
    '!areStoryboardWidgetWorkflowRecordValuesEqual(existingPanelProps, nextPanelProps)',
  ]) {
    if (!workflowText.includes(required)) throw new Error(`expected workflow runner to include ${required}`)
  }
  const htmlVideoRunBranch = mediaHandlersText.slice(
    mediaHandlersText.indexOf("String(args.node.type || '').trim() === FLOW_HTML_VIDEO_RENDERER_NODE_TYPE_ID"),
    mediaHandlersText.indexOf('if (readWorkflowString(args.node.type) === FLOW_ANNOTATION_ENGINE_NODE_TYPE_ID)'),
  )
  if (htmlVideoRunBranch.includes('setRunLoadingStateForKnownNodeIds({ loading: true')) {
    throw new Error('expected HTML video preview-capable runs to avoid blanking Rich Media Panel with a loading skeleton')
  }
  const runAllSequenceText = readFileSync(resolve(process.cwd(), 'src', 'lib', 'storyboardWidget', 'runAllSequenceSsot.ts'), 'utf8')
  for (const required of [
    'FLOW_HTML_VIDEO_RENDERER_NODE_TYPE_ID',
    "typeId === normalizeText(FLOW_HTML_VIDEO_RENDERER_NODE_TYPE_ID)) return 'video'",
  ]) {
    if (!runAllSequenceText.includes(required)) throw new Error(`expected run-all sequence to include ${required}`)
  }
}
