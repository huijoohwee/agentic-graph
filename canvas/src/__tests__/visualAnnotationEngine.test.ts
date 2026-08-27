import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { resolveRichMediaWidgetKind } from '@/features/chat/richMediaRun'
import {
  ANNOTATION_MODEL_IDS,
  ANNOTATION_SCHEMA_VERSION,
  ANNOTATION_TASK_IDS,
  buildAnnotationEngineRegistryDraft,
  buildAnnotationId,
  buildHorizontalVisualZones,
  convertVisualAnnotationDataset,
  countVisualDatasetZones,
  filterVisualAnnotationDatasetByZones,
  loadVisualAnnotationDataset,
  mergeVisualAnnotationDatasets,
  resolveAnnotationModel,
  runAnnotationJob,
  saveVisualAnnotationDataset,
  splitVisualAnnotationDataset,
  toAnnotationPreviewSrcDoc,
  toLlmReadyPayload,
  toMarkdownSummary,
  validateAnnotationSpec,
  type AnnotationWorkerHandle,
} from '@/features/visual-annotation-engine'
import { FLOW_ANNOTATION_ENGINE_FORM_ID, FLOW_ANNOTATION_ENGINE_NODE_TYPE_ID } from '@/lib/config.storyboard-widget'
import { buildFlowRunAllNodeSequence } from '@/lib/storyboardWidget/runAllSequenceSsot'
import { buildFlowWidgetEligibleNodeIdSet } from '@/lib/graph/flowWidgetEligibility'
import { resolveStoryboardWidgetWorkflowDownstreamRunTargetIds } from '@/components/StoryboardWidgetCanvas/runtime/storyboardWidgetWorkflowDownstreamRunTargets'
import { applyStoryboardWidgetWorkflowRichMediaPanelDraftPatch } from '@/components/StoryboardWidgetCanvas/runtime/storyboardWidgetWorkflowRichMediaPanel'
import { resolveStoryboardWidgetWorkflowNodeByIdAcrossGraphs } from '@/components/StoryboardWidgetCanvas/runtime/storyboardWidgetRenderGraph'
import { updateStoryboardWidgetWorkflowOutputForKnownNodeIds } from '@/components/StoryboardWidgetCanvas/runtime/storyboardWidgetWorkflowWriteback'
import type { GraphData, GraphNode } from '@/lib/graph/types'
import { buildAnnotationSpecCandidateFromNode } from '@/features/visual-annotation-engine/annotationFlowNode'
import { buildHeuristicAnnotationResult } from '@/features/visual-annotation-engine/annotationWorker'

const NODE: GraphNode = {
  id: 'annotation-node',
  label: 'Annotation Node',
  type: FLOW_ANNOTATION_ENGINE_NODE_TYPE_ID,
  properties: {},
} as GraphNode

const createMockWorker = (): AnnotationWorkerHandle => ({
  async dispatch(request) {
    return {
      assetUrl: request.spec.assetUrl,
      assetType: request.spec.assetType,
      modelId: request.modelId,
      tasks: Object.fromEntries(request.spec.tasks.map(task => {
        if (task === ANNOTATION_TASK_IDS.objectDetection) {
          return [task, { objects: [{ label: `mock-${task}`, bbox: [0, 0, 10, 10], confidence: 1 }] }]
        }
        return [task, { text: `mock-caption:${request.spec.assetUrl.slice(0, 20)}` }]
      })),
      processedAt: '2026-06-29T00:00:00.000Z',
      durationMs: 12,
      schemaVersion: ANNOTATION_SCHEMA_VERSION,
      ...(typeof request.spec.frameTimestampMs === 'number' ? { frameTimestampMs: request.spec.frameTimestampMs } : {}),
    }
  },
})

export function testVisualAnnotationSpecValidationAndModelResolution() {
  const valid = validateAnnotationSpec({
    assetUrl: 'https://example.test/image.png',
    assetType: 'image',
    tasks: [ANNOTATION_TASK_IDS.caption],
  })
  if (valid.ok === false) throw new Error(`expected valid annotation spec, got ${valid.field}:${valid.reason}`)

  const invalid = validateAnnotationSpec({
    assetUrl: '',
    assetType: 'video_frame',
    tasks: ['not-a-task'],
  })
  if (invalid.ok === true || invalid.field !== 'assetUrl') {
    throw new Error('expected validator to report first invalid field in contract order')
  }

  const invalidTask = validateAnnotationSpec({
    assetUrl: 'https://example.test/image.png',
    assetType: 'image',
    tasks: ['not-a-task'],
  })
  if (invalidTask.ok === true || invalidTask.field !== 'tasks') throw new Error('expected unrecognised task rejection')

  const videoMissingFrame = validateAnnotationSpec({
    assetUrl: 'https://example.test/video.mp4',
    assetType: 'video_frame',
    tasks: [ANNOTATION_TASK_IDS.caption],
  })
  if (videoMissingFrame.ok === true || videoMissingFrame.field !== 'frameTimestampMs') {
    throw new Error('expected video_frame specs to require frameTimestampMs')
  }

  const fallback = resolveAnnotationModel('   ')
  if (fallback.ok === false || fallback.modelId !== ANNOTATION_MODEL_IDS.florence2Base) {
    throw new Error('expected blank modelHint to fall back to registered florence2Base model')
  }
  const unknown = resolveAnnotationModel('unknown/model')
  if (unknown.ok === true || unknown.errorCode !== 'model_not_configured') {
    throw new Error('expected explicit unknown modelHint to fail before inference')
  }
}

export function testVisualAnnotationSemanticKeyAndSerializers() {
  const left = buildAnnotationId('https://example.test/a.png', [ANNOTATION_TASK_IDS.caption, ANNOTATION_TASK_IDS.objectDetection], ANNOTATION_MODEL_IDS.florence2Base)
  const right = buildAnnotationId('https://example.test/a.png', [ANNOTATION_TASK_IDS.objectDetection, ANNOTATION_TASK_IDS.caption], ANNOTATION_MODEL_IDS.florence2Base)
  if (!left || left !== right) throw new Error('expected annotationId to be deterministic and task-order independent')

  const result = {
    ok: true as const,
    annotationId: left,
    assetUrl: 'https://example.test/a.png',
    assetType: 'image' as const,
    modelId: ANNOTATION_MODEL_IDS.florence2Base,
    tasks: {
      [ANNOTATION_TASK_IDS.caption]: { text: 'A small object on a table.' },
      [ANNOTATION_TASK_IDS.objectDetection]: { objects: [{ label: 'object', bbox: [1, 2, 3, 4] as [number, number, number, number] }] },
    },
    processedAt: '2026-06-29T00:00:00.000Z',
    durationMs: 10,
    schemaVersion: ANNOTATION_SCHEMA_VERSION,
  }
  const payload = toLlmReadyPayload(result)
  const roundTrip = JSON.stringify(JSON.parse(JSON.stringify(payload)))
  if (roundTrip !== JSON.stringify(payload)) throw new Error('expected LLM-ready payload to JSON round-trip')
  if ('annotationId' in payload || 'durationMs' in payload || 'ok' in payload) {
    throw new Error('expected LLM-ready payload to exclude operational metadata')
  }
  const markdown = toMarkdownSummary(result)
  if (!markdown.startsWith('## Caption') || !markdown.includes('## Detected Objects')) {
    throw new Error('expected markdown summary to expose caption and detected object sections')
  }
  const preview = toAnnotationPreviewSrcDoc({
    ...result,
    tasks: {
      ...result.tasks,
      [ANNOTATION_TASK_IDS.objectDetection]: { objects: [{ label: '<object>', bbox: [0.1, 0.2, 0.3, 0.4], confidence: 0.8 }] },
    },
  })
  if (!preview.includes('<figure>') || !preview.includes('<img src="https://example.test/a.png"') || !preview.includes('--kg-x:10%')) {
    throw new Error('expected annotation preview to project normalized detections over source media')
  }
  if (preview.includes('<object>') || !preview.includes('&lt;object&gt;')) {
    throw new Error('expected annotation preview labels to be HTML escaped')
  }
  const videoPreview = toAnnotationPreviewSrcDoc({
    ...result,
    assetUrl: 'https://example.test/a.mp4',
    assetType: 'video_frame',
    frameTimestampMs: 1200,
  })
  if (!videoPreview.includes('<video ') || !videoPreview.includes('video frame at 1200ms')) {
    throw new Error('expected video-frame annotation preview to use the shared media projection')
  }
}

export function testVisualAnnotationDatasetLoadSplitMergeSaveAndZoneCounts() {
  const first = {
    ok: true as const,
    annotationId: 'annotation-left',
    assetUrl: 'workspace://media/left-frame.png',
    assetType: 'image' as const,
    modelId: ANNOTATION_MODEL_IDS.florence2Base,
    tasks: {
      [ANNOTATION_TASK_IDS.objectDetection]: {
        objects: [{
          label: 'person',
          bbox: [0.05, 0.2, 0.2, 0.3] as [number, number, number, number],
          confidence: 0.9,
          mask: [[0.05, 0.2], [0.25, 0.2], [0.25, 0.5], [0.05, 0.5]],
          trackId: 'track-person-1',
        }],
      },
    },
    processedAt: '2026-06-29T00:00:00.000Z',
    durationMs: 10,
    schemaVersion: ANNOTATION_SCHEMA_VERSION,
  }
  const second = {
    ...first,
    annotationId: 'annotation-right',
    assetUrl: 'workspace://media/right-frame.png',
    assetType: 'video_frame' as const,
    frameTimestampMs: 1200,
    tasks: {
      [ANNOTATION_TASK_IDS.objectDetection]: {
        objects: [{
          label: 'vehicle',
          bbox: [0.7, 0.25, 0.18, 0.22] as [number, number, number, number],
          confidence: 0.8,
          mask: [[0.7, 0.25], [0.88, 0.25], [0.88, 0.47], [0.7, 0.47]],
          trackId: 'track-vehicle-1',
        }],
      },
    },
  }
  const loaded = loadVisualAnnotationDataset([first, second])
  if (loaded.ok === false) throw new Error(`expected annotation results to load as dataset, got ${loaded.reason}`)
  if (loaded.dataset.samples.length !== 2 || loaded.dataset.samples.some(sample => sample.annotations.length !== 1)) {
    throw new Error(`expected loaded dataset samples and annotations, got ${JSON.stringify(loaded.dataset.samples)}`)
  }
  const loadedAnnotations = loaded.dataset.samples.flatMap(sample => sample.annotations)
  if (
    loadedAnnotations.some(annotation => !annotation.trackId)
    || loadedAnnotations.some(annotation => !annotation.mask?.polygons.length)
  ) {
    throw new Error(`expected dataset annotations to preserve persistent track IDs and masks, got ${JSON.stringify(loadedAnnotations)}`)
  }

  const split = splitVisualAnnotationDataset(loaded.dataset, {
    seed: 'dataset-contract',
    trainRatio: 0.5,
    validationRatio: 0.25,
    testRatio: 0.25,
  })
  if (split.summary.total !== 2 || split.summary.train + split.summary.validation + split.summary.test !== 2) {
    throw new Error(`expected deterministic split summary, got ${JSON.stringify(split.summary)}`)
  }

  const merged = mergeVisualAnnotationDatasets([split.splits.train, split.splits.validation, split.splits.test])
  if (merged.samples.length !== loaded.dataset.samples.length) {
    throw new Error(`expected merged dataset to restore samples without duplicates, got ${JSON.stringify(merged.samples)}`)
  }
  const saved = saveVisualAnnotationDataset(merged, { filename: 'visual-dataset.json' })
  if (saved.mimeType !== 'application/json' || saved.sampleCount !== 2 || saved.annotationCount !== 2) {
    throw new Error(`expected save artifact summary, got ${JSON.stringify(saved)}`)
  }
  const reloaded = loadVisualAnnotationDataset(saved.text)
  if (reloaded.ok === false || reloaded.dataset.samples.length !== 2) {
    throw new Error('expected saved dataset JSON to reload through the same loader')
  }

  const zones = buildHorizontalVisualZones(['left', 'middle', 'right'])
  const zoneTimeline = countVisualDatasetZones(merged, zones)
  const totalZoneHits = Object.values(zoneTimeline.totals).reduce((sum, count) => sum + count, 0)
  if (
    zoneTimeline.frames.length !== 2
    || totalZoneHits !== 2
    || zoneTimeline.frames.some(frame => frame.detections.length !== 1)
    || !zoneTimeline.frames[1]?.cumulativeCounts
  ) {
    throw new Error(`expected frame-ordered real-time zone counting, got ${JSON.stringify(zoneTimeline)}`)
  }
  const leftZoneId = zones[0]?.zoneId || ''
  const filtered = filterVisualAnnotationDatasetByZones(merged, zones, { includeZoneIds: [leftZoneId] })
  if (filtered.samples.length !== 1 || filtered.samples[0]?.annotations[0]?.label !== 'person') {
    throw new Error(`expected zone filtering to keep only detections inside the selected polygon, got ${JSON.stringify(filtered.samples)}`)
  }
  const coco = convertVisualAnnotationDataset(merged, { format: 'coco-json', filename: 'visual-dataset.coco.json' })
  const cocoJson = JSON.parse(coco.text) as { annotations?: Array<{ track_id?: string; segmentation?: unknown[] }>; categories?: unknown[] }
  if (
    coco.format !== 'coco-json'
    || coco.filename !== 'visual-dataset.coco.json'
    || !Array.isArray(cocoJson.categories)
    || cocoJson.categories.length !== 2
    || !cocoJson.annotations?.every(annotation => annotation.track_id && Array.isArray(annotation.segmentation))
  ) {
    throw new Error(`expected COCO conversion to preserve categories, track IDs, and masks, got ${coco.text}`)
  }
}

export async function testVisualAnnotationRunDelegatesArtifactOnce() {
  let calls = 0
  const result = await runAnnotationJob({
    spec: {
      assetUrl: 'https://example.test/a.png',
      assetType: 'image',
      tasks: [ANNOTATION_TASK_IDS.caption],
    },
    node: NODE,
    worker: createMockWorker(),
    artifactWriter: async (args) => {
      calls += 1
      if (args.kind !== 'annotation') throw new Error('expected annotation artifact kind')
      return { outputPath: '/mock/annotation.json', outputManifestPath: '/mock/annotation.md', outputStorageUrl: null }
    },
  })
  if (result.ok === false) throw new Error(`expected annotation run success, got ${result.errorCode}`)
  if (calls !== 1) throw new Error(`expected artifact writer once, got ${calls}`)
  if (result.annotationId !== buildAnnotationId(result.assetUrl, [ANNOTATION_TASK_IDS.caption], result.modelId)) {
    throw new Error('expected run result annotationId to match semantic key builder')
  }
}

export async function testVisualAnnotationRunReturnsStructuredInferenceError() {
  const worker: AnnotationWorkerHandle = {
    async dispatch() {
      throw new Error('inference_timeout')
    },
  }
  const result = await runAnnotationJob({
    spec: {
      assetUrl: 'https://example.test/a.png',
      assetType: 'image',
      tasks: [ANNOTATION_TASK_IDS.caption],
    },
    node: NODE,
    worker,
  })
  if (result.ok === true || result.errorCode !== 'inference_failed' || result.reason !== 'inference_timeout') {
    throw new Error('expected worker failure to return structured inference_failed result')
  }
}

export function testVisualAnnotationWorkerHeuristicProducesRuntimeOutput() {
  const imageResult = buildHeuristicAnnotationResult({
    type: 'annotate',
    requestId: 'image-annotation',
    modelId: ANNOTATION_MODEL_IDS.florence2Base,
    spec: {
      assetUrl: 'workspace://media/demo-image.png',
      assetType: 'image',
      tasks: [ANNOTATION_TASK_IDS.caption, ANNOTATION_TASK_IDS.objectDetection],
    },
  })
  const caption = imageResult.tasks[ANNOTATION_TASK_IDS.caption]
  const detection = imageResult.tasks[ANNOTATION_TASK_IDS.objectDetection]
  if (!caption || !('text' in caption) || !caption.text.includes('demo image')) {
    throw new Error('expected heuristic image caption to describe the source asset')
  }
  if (!detection || !('objects' in detection) || detection.objects.length < 1) {
    throw new Error('expected heuristic image object detection output')
  }

  const frameResult = buildHeuristicAnnotationResult({
    type: 'annotate',
    requestId: 'video-frame-annotation',
    modelId: ANNOTATION_MODEL_IDS.florence2Base,
    spec: {
      assetUrl: 'workspace://media/demo-video.mp4',
      assetType: 'video_frame',
      frameTimestampMs: 1200,
      tasks: [ANNOTATION_TASK_IDS.caption, ANNOTATION_TASK_IDS.denseRegionCaption],
    },
  })
  const frameCaption = frameResult.tasks[ANNOTATION_TASK_IDS.caption]
  const frameRegions = frameResult.tasks[ANNOTATION_TASK_IDS.denseRegionCaption]
  if (frameResult.frameTimestampMs !== 1200 || !frameCaption || !('text' in frameCaption) || !frameCaption.text.includes('1200ms')) {
    throw new Error('expected heuristic video-frame caption to preserve timestamp context')
  }
  if (!frameRegions || !('regions' in frameRegions) || frameRegions.regions.length < 1) {
    throw new Error('expected heuristic video-frame dense region output')
  }
}

export function testVisualAnnotationSpecReadsFrontmatterCells() {
  const spec = buildAnnotationSpecCandidateFromNode({
    id: 'frontmatter-annotation-node',
    label: 'Frontmatter Annotation',
    type: { key: 'type', type: 'string', value: FLOW_ANNOTATION_ENGINE_NODE_TYPE_ID } as never,
    properties: {
      asset_url: { key: 'asset_url', type: 'string', value: 'workspace://media/frontmatter-image' },
      asset_type: { key: 'asset_type', type: 'string', value: 'image' },
      tasks: { key: 'tasks', type: 'string', value: 'caption,object_detection' },
      frame_timestamp_ms: { key: 'frame_timestamp_ms', type: 'number', value: 1200 },
    },
  } as GraphNode)
  if (spec.assetUrl !== 'workspace://media/frontmatter-image') {
    throw new Error(`expected frontmatter asset_url cell to unwrap, got ${String(spec.assetUrl)}`)
  }
  if (!Array.isArray(spec.tasks) || spec.tasks.join(',') !== 'caption,object_detection') {
    throw new Error(`expected frontmatter tasks cell to unwrap, got ${JSON.stringify(spec.tasks)}`)
  }
  if (spec.frameTimestampMs !== 1200) {
    throw new Error(`expected frontmatter frame timestamp cell to unwrap, got ${String(spec.frameTimestampMs)}`)
  }
}

export async function testVisualAnnotationRegistriesAndMcpContract() {
  const widget = buildAnnotationEngineRegistryDraft()
  if (widget.nodeTypeId !== FLOW_ANNOTATION_ENGINE_NODE_TYPE_ID || widget.formId !== FLOW_ANNOTATION_ENGINE_FORM_ID) {
    throw new Error('expected annotation widget draft to use canonical Flow constants')
  }
  if (resolveRichMediaWidgetKind(NODE) !== 'annotation') {
    throw new Error('expected rich-media kind resolver to classify AnnotationEngine nodes as annotation')
  }

  const { buildAgenticGraphLocalMcpToolDefinitions } = await import('../../../mcp/local-tool-contract.js')
  const tools = buildAgenticGraphLocalMcpToolDefinitions()
  const names = new Set(tools.map((tool: { name: string }) => tool.name))
  if (!names.has('agenticgraph.annotate.image') || !names.has('agenticgraph.annotate.video_frame')) {
    throw new Error('expected local MCP contract to include annotation tools')
  }

  const { validateAgenticGraphVdeoxplnRegistry } = await import('@/features/agent-ready/agenticgraphVdeoxplnContract.mjs')
  const validation = validateAgenticGraphVdeoxplnRegistry()
  if (!validation.ok) throw new Error(`expected vdeoxpln registry to validate: ${validation.errors.join('; ')}`)
}

export function testVisualAnnotationSsotAvoidsMlImports() {
  const text = readFileSync(
    resolve(process.cwd(), 'src', 'features', 'visual-annotation-engine', 'annotationEngineSsot.ts'),
    'utf8',
  )
  if (text.includes('@huggingface') || text.includes('transformers')) {
    throw new Error('expected annotationEngineSsot to avoid ML-library imports')
  }
  if (!Object.isFrozen(ANNOTATION_TASK_IDS) || !Object.isFrozen(ANNOTATION_MODEL_IDS)) {
    throw new Error('expected annotation task/model registries to be frozen')
  }
}

export function testVisualAnnotationRunAllSequenceIncludesAnnotationNodes() {
  const plan = buildFlowRunAllNodeSequence({
    graphData: {
      nodes: [
        { id: 'annotation-source', type: 'InputWidget', x: 0, y: 0, properties: {} },
        { id: 'annotation-engine', type: FLOW_ANNOTATION_ENGINE_NODE_TYPE_ID, x: 100, y: 0, properties: {} },
        { id: 'video-renderer', type: 'HtmlVideoRenderer', x: 200, y: 0, properties: {} },
      ],
      edges: [
        { id: 'edge-annotation', source: 'annotation-source', target: 'annotation-engine' },
        { id: 'edge-video', source: 'annotation-engine', target: 'video-renderer' },
      ],
    } as never,
    eligibleNodeIds: new Set(['annotation-source', 'annotation-engine', 'video-renderer']),
  })
  if (!plan.orderedNodeIds.includes('annotation-engine')) {
    throw new Error(`expected Run All to include AnnotationEngine nodes, got ${plan.orderedNodeIds.join(',')}`)
  }
  if (plan.phaseCounts.annotation !== 1) {
    throw new Error(`expected one annotation phase node, got ${JSON.stringify(plan.phaseCounts)}`)
  }
  if (plan.orderedNodeIds.indexOf('annotation-engine') > plan.orderedNodeIds.indexOf('video-renderer')) {
    throw new Error('expected AnnotationEngine nodes to run before video renderers')
  }
}

export function testVisualAnnotationRunAllRoutesTypedFrontmatterNodes() {
  const annotationNode = {
    id: { key: 'id', type: 'string', value: 'typed-annotation-engine' },
    label: { key: 'label', type: 'string', value: 'Typed Annotation Engine' },
    type: { key: 'type', type: 'string', value: FLOW_ANNOTATION_ENGINE_NODE_TYPE_ID },
    x: 100,
    y: 0,
    properties: {},
  } as never as GraphNode
  const graphData = {
    nodes: [
      annotationNode,
      {
        id: { key: 'id', type: 'string', value: 'typed-annotation-panel' },
        type: { key: 'type', type: 'string', value: 'RichMediaPanel' },
        x: 200,
        y: 0,
        properties: {},
      },
    ],
    edges: [
      { id: 'typed-edge', source: 'typed-annotation-engine', target: 'typed-annotation-panel', properties: {} },
    ],
  } as unknown as GraphData
  const eligibleNodeIds = buildFlowWidgetEligibleNodeIdSet(graphData.nodes)
  const plan = buildFlowRunAllNodeSequence({
    graphData,
    eligibleNodeIds,
  })
  if (!eligibleNodeIds.has('typed-annotation-engine') || !eligibleNodeIds.has('typed-annotation-panel')) {
    throw new Error(`expected typed frontmatter widget ids to remain eligible, got ${Array.from(eligibleNodeIds).join(',')}`)
  }
  if (!plan.orderedNodeIds.includes('typed-annotation-engine') || plan.phaseCounts.annotation !== 1) {
    throw new Error(`expected typed frontmatter annotation node in Run All plan, got ${JSON.stringify(plan)}`)
  }
  const downstream = resolveStoryboardWidgetWorkflowDownstreamRunTargetIds({ node: annotationNode, graphData })
  if (downstream.join(',') !== 'typed-annotation-panel') {
    throw new Error(`expected typed frontmatter downstream panel routing, got ${downstream.join(',')}`)
  }
  const resolvedPanel = resolveStoryboardWidgetWorkflowNodeByIdAcrossGraphs({
    context: {
      graphSemanticKey: 'typed-annotation-test',
      draftGraph: graphData,
      renderGraph: null,
      baseGraph: null,
      storeGraph: null,
      draftNodes: graphData.nodes,
      renderNodes: [],
      baseNodes: [],
      storeNodes: [],
      draftNodeById: new Map(),
      renderNodeById: new Map(),
      baseNodeById: new Map(),
      storeNodeById: new Map(),
    },
    candidateNodeId: 'typed-annotation-panel',
    graphForRun: graphData,
  })
  if (!resolvedPanel) throw new Error('expected typed frontmatter panel lookup across workflow graphs')
  let committedGraph = graphData as never as { nodes: GraphNode[] }
  const updatedPanel = applyStoryboardWidgetWorkflowRichMediaPanelDraftPatch({
    panelNodeId: 'typed-annotation-panel',
    patch: { outputSrcDoc: '<figure>annotation</figure>' },
    readLiveDraftGraphData: () => committedGraph as never,
    commitDraftGraphDataUpdate: (_current, next) => { committedGraph = next as never },
    scheduleWorkflowOutputEdgeRefresh: () => undefined,
  })
  if (updatedPanel?.properties?.outputSrcDoc !== '<figure>annotation</figure>') {
    throw new Error('expected typed frontmatter RichMediaPanel id to accept runtime annotation output')
  }
  updateStoryboardWidgetWorkflowOutputForKnownNodeIds({
    nodeIds: ['typed-annotation-engine'],
    fallbackNode: annotationNode,
    fallbackWritableNodeId: 'typed-annotation-engine',
    readLiveDraftGraphData: () => committedGraph as never,
    resolveNodeByIdAcrossGraphs: () => null,
    commitDraftGraphDataUpdate: (_current, next) => { committedGraph = next as never },
    updateNode: () => { throw new Error('typed draft output must not fall through to store writeback') },
    scheduleWorkflowOutputEdgeRefresh: () => undefined,
    suppressStoreGraphWriteback: true,
    buildPatch: properties => ({ ...properties, outputSrcDoc: '<figure>engine</figure>' }),
  })
  const committedEngine = committedGraph.nodes.find(node => {
    const id = node.id as unknown as { value?: unknown }
    return id?.value === 'typed-annotation-engine'
  })
  if (committedEngine?.properties?.outputSrcDoc !== '<figure>engine</figure>') {
    throw new Error('expected typed frontmatter engine output to update the Run All draft')
  }
}
