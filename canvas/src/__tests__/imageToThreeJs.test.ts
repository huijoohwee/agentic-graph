import { readFileSync } from 'node:fs'
import * as THREE from 'three'
import {
  IMAGE_TO_THREEJS_RENDER_MODE,
  IMAGE_TO_THREEJS_SCHEMA,
  IMAGE_TO_THREEJS_BINDING_TOKEN,
  IMAGE_TO_THREEJS_COMMAND_TOKEN,
  IMAGE_TO_THREEJS_OUTPUT_PANEL_LABEL,
  IMAGE_TO_THREEJS_SEMANTIC_TOKEN,
  IMAGE_TO_THREEJS_SKILL_FORM_ID,
  IMAGE_TO_THREEJS_SKILL_NODE_TYPE_ID,
  buildImageToThreeJsConversion,
  isImageToThreeJsOutputPanel,
  isImageToThreeJsSkillNode,
  resolveImageToThreeJsRunInput,
  resolveImageToThreeJsSourceKind,
  resolveImageToThreeJsSourceUrl,
} from '@/features/image-to-threejs/imageToThreeJsContract'
import { buildImageToThreeJsSkillRegistryDraft } from '@/features/image-to-threejs/imageToThreeJsWidget'
import {
  buildImageThreeJsSvgGroup,
  disposeImageThreeJsObject,
} from '@/features/image-to-threejs/ImageThreeJsSurface'
import { getNodeMediaSpec } from '@/lib/canvas/graph-elements/mediaSpec'
import { applyConnectedValuesToNodeForRender } from '@/lib/render/effectiveMediaNode'
import { listMediaOverlayNodes } from '@/lib/render/mediaOverlayPool'
import { applyCanonicalNodePropertyAuthority } from '@/lib/graph/applyCanonicalNodePropertyAuthority'
import { buildWidgetCompactPreviewViewModel } from '@/features/storyboard-widget-manager/widgetCompactPreview'
import { runStoryboardWidgetMediaWorkflowNode } from '@/components/StoryboardWidgetCanvas/runtime/storyboardWidgetWorkflowMediaRunHandlers'
import { createStoryboardWidgetWorkflowRichMediaPublishers } from '@/components/StoryboardWidgetCanvas/runtime/storyboardWidgetWorkflowRichMediaPublication'
import { IMAGE_TO_THREEJS_OUTPUT_EDGE_PROPERTY } from '@/components/StoryboardWidgetCanvas/runtime/storyboardWidgetWorkflowRichMediaPanel'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import type { GraphData, GraphNode } from '@/lib/graph/types'

export function testImageToThreeJsSupportsPngJpgAndSvgIncludingProxyUrls() {
  const cases = [
    ['https://assets.example/object.png', 'raster'],
    ['https://assets.example/object.JPG?rev=1', 'raster'],
    ['data:image/jpeg;base64,AA==', 'raster'],
    ['data:image/svg+xml,%3Csvg%2F%3E', 'svg'],
    ['/__fetch_remote?url=https%3A%2F%2Fassets.example%2Fobject.svg', 'svg'],
  ] as const
  for (const [url, expected] of cases) {
    const actual = resolveImageToThreeJsSourceKind(url)
    if (actual !== expected) throw new Error(`expected ${url} to resolve as ${expected}, got ${String(actual)}`)
  }
  if (resolveImageToThreeJsSourceKind('https://assets.example/object.webp') !== null) {
    throw new Error('expected unsupported image extensions to fail closed')
  }
}

export function testImageToThreeJsBuildsTypedZeroCostRenderPatch() {
  const result = buildImageToThreeJsConversion('https://assets.example/object.svg')
  if (result.ok === false) throw new Error(result.reason)
  if (result.manifest.schema !== IMAGE_TO_THREEJS_SCHEMA) throw new Error('expected the image-to-threejs schema')
  if (result.manifest.render.primitive !== 'shape-geometry') throw new Error('expected SVG shape geometry')
  if (result.manifest.cost.estimated_cost_usd !== 0) throw new Error('expected a zero-cost local conversion')
  if (result.patch.mediaRenderMode !== IMAGE_TO_THREEJS_RENDER_MODE) throw new Error('expected Three.js render mode')
  if (result.patch.richMediaActiveTab !== 'image') throw new Error('expected Rich Media image tab projection')
}

export function testImageToThreeJsRejectsMissingAndUnsupportedSources() {
  const missing = buildImageToThreeJsConversion('')
  const unsupported = buildImageToThreeJsConversion('workspace:/media/object.webp')
  if (missing.ok !== false || missing.errorCode !== 'missing-source') throw new Error('expected missing source failure')
  if (unsupported.ok !== false || unsupported.errorCode !== 'unsupported-format') throw new Error('expected unsupported format failure')
}

export function testImageToThreeJsSkillUsesConnectedImageBeforeLocalFallback() {
  const sourceUrl = resolveImageToThreeJsSourceUrl({
    node: { properties: { sourceImageUrl: 'workspace:/media/local.png' } },
    connectedValuesBySchemaPath: {
      'properties.sourceImageUrl': {
        value: 'workspace:/media/connected.jpg',
        sources: [{ edgeId: 'edge-image', nodeId: 'source-image', portKey: 'imageUrl' }],
      },
    },
  })
  if (sourceUrl !== 'workspace:/media/connected.jpg') throw new Error(`expected connected source, got ${sourceUrl}`)
}

export function testImageToThreeJsInlineCardInvocationUsesSharedTokensAndAttachedMedia() {
  const inlineRun = resolveImageToThreeJsRunInput({
    node: {
      type: 'TextGeneration',
      properties: {
        prompt: `Generate ${IMAGE_TO_THREEJS_COMMAND_TOKEN} ${IMAGE_TO_THREEJS_SEMANTIC_TOKEN} ${IMAGE_TO_THREEJS_BINDING_TOKEN} from the attached source.`,
        storyboardMediaItems: [{
          kind: 'image',
          url: 'workspace:/media/buddydrone-preview.jpg',
          sourceUrl: 'workspace:/media/buddydrone-source.png',
        }],
      },
    } as never,
  })
  if (!inlineRun || inlineRun.invocation !== 'inline-command') {
    throw new Error('expected the shared inline image-to-threejs command to create a native run intent')
  }
  if (inlineRun.sourceUrl !== 'workspace:/media/buddydrone-source.png') {
    throw new Error(`expected attached image source, got ${inlineRun.sourceUrl}`)
  }
  for (const token of [IMAGE_TO_THREEJS_COMMAND_TOKEN, IMAGE_TO_THREEJS_SEMANTIC_TOKEN, IMAGE_TO_THREEJS_BINDING_TOKEN]) {
    if (!inlineRun.invocationTokens.includes(token)) throw new Error(`expected shared invocation token ${token}`)
  }

  const inlineMediaRun = resolveImageToThreeJsRunInput({
    node: {
      type: 'TextGeneration',
      properties: {
        prompt: `Generate ${IMAGE_TO_THREEJS_COMMAND_TOKEN} from ![buddydrone](workspace:/media/buddydrone-inline.jpg).`,
      },
    } as never,
  })
  if (inlineMediaRun?.sourceUrl !== 'workspace:/media/buddydrone-inline.jpg') {
    throw new Error(`expected inline media source, got ${inlineMediaRun?.sourceUrl || 'none'}`)
  }

  const semanticOnly = resolveImageToThreeJsRunInput({
    node: {
      type: 'TextGeneration',
      properties: { prompt: `${IMAGE_TO_THREEJS_SEMANTIC_TOKEN} ${IMAGE_TO_THREEJS_BINDING_TOKEN}` },
    } as never,
  })
  if (semanticOnly) throw new Error('expected semantic and binding tags alone to remain non-executable')

  const dedicatedSkill = resolveImageToThreeJsRunInput({
    node: {
      type: IMAGE_TO_THREEJS_SKILL_NODE_TYPE_ID,
      properties: { sourceImageUrl: 'workspace:/media/dedicated-skill.svg' },
    } as never,
  })
  if (!dedicatedSkill || dedicatedSkill.invocation !== 'skill-node') {
    throw new Error('expected the dedicated image-to-threejs skill node to keep its native run path')
  }
}

export async function testImageToThreeJsInlineCardRunPublishesThreeJsRichMedia() {
  const node = {
    id: 'inline-image-to-threejs',
    label: 'Widget Card',
    type: 'TextGeneration',
    properties: {
      prompt: `Generate ${IMAGE_TO_THREEJS_COMMAND_TOKEN} ${IMAGE_TO_THREEJS_SEMANTIC_TOKEN} ${IMAGE_TO_THREEJS_BINDING_TOKEN} from ![buddydrone](workspace:/media/buddydrone-inline.png).`,
    },
  } as GraphNode
  const graph = { type: 'graph', nodes: [node], edges: [] } as GraphData
  const nodeById = new Map([[String(node.id), node]])
  const context = {
    graphSemanticKey: 'image-to-threejs-inline-workflow',
    draftGraph: graph,
    renderGraph: graph,
    baseGraph: graph,
    storeGraph: graph,
    draftNodes: [node],
    renderNodes: [node],
    baseNodes: [node],
    storeNodes: [node],
    draftNodeById: nodeById,
    renderNodeById: nodeById,
    baseNodeById: nodeById,
    storeNodeById: nodeById,
  } as never
  let cardOutputWriteCount = 0
  let cardLoadingWriteCount = 0
  let genericPublished = false
  let threeJsPublished: { patch?: Record<string, unknown> } | null = null
  const handled = await runStoryboardWidgetMediaWorkflowNode({
    id: 'inline-image-to-threejs',
    node,
    rawNodeProperties: node.properties,
    context,
    graphForRun: graph,
    writableNodeId: node.id,
    widgetRegistry: [],
    activeWorkspacePath: '',
    generationRuntime: {
      chatProvider: '',
      chatAuthMode: 'serverManaged',
      chatApiKey: '',
      chatEndpointUrl: '',
      chatModel: '',
      markdownDocumentText: '',
    },
    updateRunOutputForKnownNodeIds: () => { cardOutputWriteCount += 1 },
    setRunLoadingStateForKnownNodeIds: () => { cardLoadingWriteCount += 1 },
    publishMediaRunOutputToRichMediaPanel: () => { genericPublished = true },
    publishImageToThreeJsRunOutputToRichMediaPanel: args => { threeJsPublished = args },
    publishAnnotationRunOutputToRichMediaPanel: () => undefined,
    upsertUiToast: () => undefined,
  })
  if (!handled) throw new Error('expected the inline image-to-threejs run to be handled before generic text generation')
  if (cardOutputWriteCount !== 0 || cardLoadingWriteCount !== 0 || genericPublished) {
    throw new Error('expected image-to-threejs to leave its input Widget Card and generic media publisher untouched')
  }
  if (threeJsPublished?.patch?.mediaRenderMode !== IMAGE_TO_THREEJS_RENDER_MODE || threeJsPublished.patch?.imageUrl !== 'workspace:/media/buddydrone-inline.png') {
    throw new Error(`expected Three.js output patch, got ${JSON.stringify(threeJsPublished)}`)
  }
  const invocation = threeJsPublished.patch?.imageThreeJsInvocation as { kind?: unknown; tokens?: unknown } | undefined
  if (invocation?.kind !== 'inline-command' || !Array.isArray(invocation.tokens) || !invocation.tokens.includes(IMAGE_TO_THREEJS_COMMAND_TOKEN)) {
    throw new Error(`expected inline invocation proof, got ${JSON.stringify(invocation)}`)
  }
}

export function testImageToThreeJsSkillRegistryAndMediaProjectionShareCanonicalMode() {
  const draft = buildImageToThreeJsSkillRegistryDraft()
  if (draft.nodeTypeId !== IMAGE_TO_THREEJS_SKILL_NODE_TYPE_ID || draft.formId !== IMAGE_TO_THREEJS_SKILL_FORM_ID) {
    throw new Error('expected canonical image-to-threejs skill registry identity')
  }
  const node = {
    id: 'image-threejs',
    type: IMAGE_TO_THREEJS_SKILL_NODE_TYPE_ID,
    label: 'Three.js image',
    properties: {
      'flow:widgetFormId': IMAGE_TO_THREEJS_SKILL_FORM_ID,
      imageUrl: 'https://assets.example/object.png',
      mediaRenderMode: IMAGE_TO_THREEJS_RENDER_MODE,
    },
  } as const
  if (!isImageToThreeJsSkillNode(node as never)) throw new Error('expected skill-node detection')
  const media = getNodeMediaSpec(node as never)
  if (!media || media.kind !== 'image' || media.renderMode !== IMAGE_TO_THREEJS_RENDER_MODE) {
    throw new Error(`expected Three.js node media projection, got ${JSON.stringify(media)}`)
  }
  const view = buildWidgetCompactPreviewViewModel({
    preview: {
      kind: 'image',
      schemaPath: 'properties.imageUrl',
      portKey: 'imageUrl',
      source: 'local',
      editable: false,
      url: 'https://assets.example/object.png',
    },
    node: node as never,
  })
  if (!view || view.kind !== 'image' || view.renderMode !== IMAGE_TO_THREEJS_RENDER_MODE) {
    throw new Error(`expected Widget preview to preserve Three.js mode, got ${JSON.stringify(view)}`)
  }
}

export function testImageToThreeJsSurvivesConnectedRichMediaPanelProjection() {
  const sourceUrl = 'https://assets.example/buddydrone.jpg'
  const panel: import('@/lib/graph/types').GraphNode = {
    id: 'image-to-threejs-panel',
    type: 'RichMediaPanel',
    label: 'Rich Media Panel',
    properties: { imageUrl: sourceUrl },
  }
  const connectedValuesBySchemaPath = {
    'properties.imageUrl': {
      value: sourceUrl,
      sources: [{ edgeId: 'card-to-panel', nodeId: 'inline-image-to-threejs', portKey: 'imageUrl' }],
    },
  }

  const rawProjection = applyConnectedValuesToNodeForRender({ node: panel, connectedValuesBySchemaPath })
  if (getNodeMediaSpec(rawProjection)?.renderMode) {
    throw new Error('expected the connected panel to begin as a normal image projection')
  }

  panel.properties = { ...panel.properties, mediaRenderMode: IMAGE_TO_THREEJS_RENDER_MODE }
  const threeJsProjection = applyConnectedValuesToNodeForRender({ node: panel, connectedValuesBySchemaPath })
  const media = getNodeMediaSpec(threeJsProjection)
  if (media?.renderMode !== IMAGE_TO_THREEJS_RENDER_MODE) {
    throw new Error(`expected the connected Rich Media Panel to retain Three.js mode, got ${JSON.stringify(media)}`)
  }
}

export function testImageToThreeJsPublishesNativeThreeJsPanelProjection() {
  const sourceUrl = 'workspace:/media/buddydrone-native.jpg'
  const sourceNode = {
    id: 'inline-image-to-threejs-source',
    type: 'TextGeneration',
    label: 'Widget Card',
    properties: {
      prompt: `Generate ${IMAGE_TO_THREEJS_COMMAND_TOKEN} from the attached image.`,
      storyboardMediaItems: [{ kind: 'image', url: sourceUrl }],
    },
  } as import('@/lib/graph/types').GraphNode
  const inputPanelNode = {
    id: 'inline-image-to-threejs-input-panel',
    type: 'RichMediaPanel',
    label: 'Rich Media Panel',
    properties: { imageUrl: sourceUrl, richMediaActiveTab: 'image' },
  } as import('@/lib/graph/types').GraphNode
  const sourceNodeBeforeRun = JSON.stringify(sourceNode.properties)
  const inputPanelBeforeRun = JSON.stringify(inputPanelNode.properties)
  let draft = {
    type: 'Graph',
    nodes: [sourceNode, inputPanelNode],
    edges: [],
    metadata: {},
  } as import('@/lib/graph/types').GraphData
  let canonical = {
    type: 'Graph',
    nodes: [
      { ...sourceNode, properties: { ...sourceNode.properties } },
      { ...inputPanelNode, properties: { ...inputPanelNode.properties } },
    ],
    edges: [],
    metadata: {},
  } as import('@/lib/graph/types').GraphData
  const resolveNode = (id: string) => draft.nodes.find(node => node.id === id) || null
  const context = {
    graphSemanticKey: 'image-to-threejs-panel-publication',
    draftGraph: draft,
    renderGraph: draft,
    baseGraph: draft,
    storeGraph: canonical,
    draftNodes: draft.nodes,
    renderNodes: draft.nodes,
    baseNodes: draft.nodes,
    storeNodes: canonical.nodes,
    draftNodeById: new Map(draft.nodes.map(node => [node.id, node])),
    renderNodeById: new Map(draft.nodes.map(node => [node.id, node])),
    baseNodeById: new Map(draft.nodes.map(node => [node.id, node])),
    storeNodeById: new Map(canonical.nodes.map(node => [node.id, node])),
  } as never
  const conversion = buildImageToThreeJsConversion(sourceUrl)
  if (conversion.ok === false) throw new Error(conversion.reason)
  const publishers = createStoryboardWidgetWorkflowRichMediaPublishers({
    context,
    graphForRun: draft,
    allowCreateRichMediaPanel: true,
    withRunLayoutMutationGuard: run => run(),
    scheduleWorkflowOutputEdgeRefresh: () => undefined,
    readLiveDraftGraphData: () => draft,
    appendDraftNode: () => { throw new Error('image-derived publication must use the atomic graph transaction') },
    commitDraftGraphDataUpdate: (_current, next) => { draft = next },
    commitPublishedGraphData: next => {
      draft = next
      canonical = {
        ...next,
        nodes: next.nodes.map(node => ({ ...node, properties: { ...(node.properties || {}) } })),
        edges: next.edges.map(edge => ({ ...edge, properties: { ...(edge.properties || {}) } })),
      }
    },
    updateNode: (id, patch) => {
      canonical = {
        ...canonical,
        nodes: canonical.nodes.map(node => node.id === id ? { ...node, ...patch } : node),
      }
    },
    appendWorkflowOutputEdge: edge => {
      canonical = { ...canonical, edges: [...canonical.edges, edge] }
    },
    resolveNodeByIdAcrossGraphs: resolveNode,
  })
  publishers.publishImageToThreeJsRunOutputToRichMediaPanel({ anchorNode: sourceNode, patch: conversion.patch })

  if (JSON.stringify(sourceNode.properties) !== sourceNodeBeforeRun) {
    throw new Error('expected the input Widget Card to remain unchanged')
  }
  const unchangedInputPanel = resolveNode(inputPanelNode.id)
  if (JSON.stringify(unchangedInputPanel?.properties) !== inputPanelBeforeRun) {
    throw new Error('expected the input Rich Media Panel to remain unchanged')
  }

  const publishedPanel = draft.nodes.find(node => isImageToThreeJsOutputPanel(node.properties)) || null
  if (!publishedPanel || (publishedPanel.properties as Record<string, unknown>).mediaRenderMode !== IMAGE_TO_THREEJS_RENDER_MODE) {
    throw new Error(`expected the native Three.js patch on a generated Rich Media Panel, got ${JSON.stringify(publishedPanel)}`)
  }
  if (publishedPanel.id === inputPanelNode.id || publishedPanel.label !== 'Three.js Rich Media Panel') {
    throw new Error(`expected a distinct generated Three.js Rich Media Panel, got ${JSON.stringify(publishedPanel)}`)
  }
  const outputEdges = draft.edges.filter(edge => edge.source === sourceNode.id && edge.target === publishedPanel.id)
  if (outputEdges.length !== 1 || (outputEdges[0]?.properties as Record<string, unknown>)[IMAGE_TO_THREEJS_OUTPUT_EDGE_PROPERTY] !== true) {
    throw new Error(`expected exactly one marker-owned source-to-output edge, got ${JSON.stringify(outputEdges)}`)
  }
  const canonicalOutputEdges = canonical.edges.filter(edge => edge.source === sourceNode.id && edge.target === publishedPanel.id)
  if (canonicalOutputEdges.length !== 1) {
    throw new Error(`expected source-to-output edge canonical writeback, got ${JSON.stringify(canonicalOutputEdges)}`)
  }
  const canonicalPanel = canonical.nodes.find(node => node.id === publishedPanel.id)
  if ((canonicalPanel?.properties as Record<string, unknown> | undefined)?.mediaRenderMode !== IMAGE_TO_THREEJS_RENDER_MODE) {
    throw new Error(`expected canonical output-panel writeback, got ${JSON.stringify(canonicalPanel)}`)
  }
  const authorityProjectedGraph = applyCanonicalNodePropertyAuthority({
    graphData: draft,
    propertyAuthorityGraphData: canonical,
  })
  const overlays = listMediaOverlayNodes({
    enabled: true,
    nodes: authorityProjectedGraph?.nodes || [],
    poolMax: 8,
    connectedValuesByNodeId: new Map([[inputPanelNode.id, {
      'properties.imageUrl': {
        value: sourceUrl,
        sources: [{ edgeId: 'card-to-input-panel', nodeId: sourceNode.id, portKey: 'imageUrl' }],
      },
    }]]),
  })
  const publishedOverlay = overlays.find(overlay => overlay.id === publishedPanel.id)
  if (publishedOverlay?.renderMode !== IMAGE_TO_THREEJS_RENDER_MODE) {
    throw new Error(`expected a renderable Three.js Rich Media overlay, got ${JSON.stringify(publishedOverlay)}`)
  }
  if (publishedOverlay?.title !== IMAGE_TO_THREEJS_OUTPUT_PANEL_LABEL) {
    throw new Error(`expected the generated overlay to retain its Three.js output title, got ${JSON.stringify(publishedOverlay)}`)
  }
  if (overlays.find(overlay => overlay.id === inputPanelNode.id)?.renderMode === IMAGE_TO_THREEJS_RENDER_MODE) {
    throw new Error('expected the input Rich Media Panel to remain a normal image projection')
  }
}

export function testImageToThreeJsRecoversOnlyLegacyMispublishedInputs() {
  const sourceUrl = 'workspace:/media/legacy-input.png'
  const staleCardMediaUrl = 'workspace:/media/legacy-card.jpg'
  const conversion = buildImageToThreeJsConversion(sourceUrl)
  if (conversion.ok === false) throw new Error(conversion.reason)
  const legacyInvocation = { kind: 'inline-command', tokens: [IMAGE_TO_THREEJS_COMMAND_TOKEN] }
  const legacyOutput = {
    mediaRenderMode: IMAGE_TO_THREEJS_RENDER_MODE,
    output: JSON.stringify(conversion.manifest),
    outputPath: 'chat-log/legacy/output.json',
    outputManifestPath: 'chat-log/legacy/manifest.json',
    outputStorageUrl: 'workspace:/media/legacy-output.json',
    outputMimeType: 'application/vnd.agenticgraph.image-threejs+json',
    outputModel: 'local-threejs',
    outputSourceUrl: sourceUrl,
    outputSavedName: 'output.json',
    outputSrcDoc: '<main>legacy</main>',
    outputLoading: false,
    outputLoadingKind: 'image',
    renderErrorCode: 'legacy',
    renderErrorReason: 'legacy output',
    renderJobId: 'legacy-job',
    lastRunAt: '2026-07-15T00:00:00.000Z',
  }
  const sourceNode = {
    id: 'legacy-image-to-threejs-card', type: 'TextGeneration', label: 'Widget Card',
    properties: {
      prompt: 'Generate a response for the active request.',
      imageUrl: staleCardMediaUrl,
      media_url: staleCardMediaUrl,
      media_kind: 'image',
      storyboardMediaItems: [{ kind: 'image', url: sourceUrl }],
      ...legacyOutput,
    },
  } as GraphNode
  const inputPanel = {
    id: 'legacy-image-to-threejs-input', type: 'RichMediaPanel', label: 'Rich Media Panel',
    properties: {
      imageUrl: sourceUrl,
      media_url: sourceUrl,
      media_kind: 'image',
      storyboardMediaItems: [{ kind: 'image', url: sourceUrl }],
      ...legacyOutput,
    },
  } as GraphNode
  const authoredThreePanel = {
    id: 'authored-three-panel', type: 'RichMediaPanel', label: 'Rich Media Panel',
    properties: { imageUrl: sourceUrl, mediaRenderMode: IMAGE_TO_THREEJS_RENDER_MODE, imageThreeJsManifest: conversion.manifest },
  } as GraphNode
  const authoredThreePanelBefore = JSON.stringify(authoredThreePanel.properties)
  const recoveredRunInput = resolveImageToThreeJsRunInput({ node: sourceNode })
  if (recoveredRunInput?.sourceUrl !== sourceUrl || recoveredRunInput.invocation !== 'inline-command' || !recoveredRunInput.invocationTokens.includes(IMAGE_TO_THREEJS_COMMAND_TOKEN)) {
    throw new Error(`expected overwritten Card recovery from the legacy manifest, got ${JSON.stringify(recoveredRunInput)}`)
  }
  if (resolveImageToThreeJsRunInput({ node: { ...sourceNode, properties: { ...sourceNode.properties, imageThreeJsOutputPanel: true } } })) {
    throw new Error('expected marker-owned Three.js output panels to stay non-runnable as legacy input Cards')
  }

  let draft = { type: 'Graph', nodes: [sourceNode, inputPanel, authoredThreePanel], edges: [{ source: sourceNode.id, target: inputPanel.id }], metadata: {} } as GraphData
  let canonical = { ...draft, nodes: draft.nodes.map(node => ({ ...node, properties: { ...(node.properties || {}) } })) } as GraphData
  const resolveNode = (id: string) => draft.nodes.find(node => node.id === id) || null
  const context = {
    graphSemanticKey: 'legacy-image-to-threejs-recovery', draftGraph: draft, renderGraph: draft, baseGraph: draft, storeGraph: canonical,
    draftNodes: draft.nodes, renderNodes: draft.nodes, baseNodes: draft.nodes, storeNodes: canonical.nodes,
    draftNodeById: new Map(draft.nodes.map(node => [node.id, node])), renderNodeById: new Map(draft.nodes.map(node => [node.id, node])),
    baseNodeById: new Map(draft.nodes.map(node => [node.id, node])), storeNodeById: new Map(canonical.nodes.map(node => [node.id, node])),
  } as never
  const publishers = createStoryboardWidgetWorkflowRichMediaPublishers({
    context, graphForRun: draft, allowCreateRichMediaPanel: true, withRunLayoutMutationGuard: run => run(),
    scheduleWorkflowOutputEdgeRefresh: () => undefined, readLiveDraftGraphData: () => draft,
    appendDraftNode: () => { throw new Error('image-derived publication must use the atomic graph transaction') },
    commitDraftGraphDataUpdate: (_current, next) => { draft = next },
    commitPublishedGraphData: next => {
      draft = next
      canonical = {
        ...next,
        nodes: next.nodes.map(node => ({ ...node, properties: { ...(node.properties || {}) } })),
        edges: next.edges.map(edge => ({ ...edge, properties: { ...(edge.properties || {}) } })),
      }
    },
    updateNode: (id, patch) => { canonical = { ...canonical, nodes: canonical.nodes.map(node => node.id === id ? { ...node, ...patch } : node) } },
    resolveNodeByIdAcrossGraphs: resolveNode,
  })
  publishers.publishImageToThreeJsRunOutputToRichMediaPanel({ anchorNode: sourceNode, patch: { ...conversion.patch, imageThreeJsInvocation: legacyInvocation } })

  const derivedKeys = ['mediaRenderMode', 'imageThreeJsManifest', 'imageThreeJsInvocation', 'output', 'outputPath', 'outputManifestPath', 'outputStorageUrl', 'outputMimeType', 'outputModel', 'outputSourceUrl', 'outputSavedName', 'outputSrcDoc', 'outputLoading', 'outputLoadingKind', 'renderErrorCode', 'renderErrorReason', 'renderJobId', 'lastRunAt']
  for (const id of [sourceNode.id, inputPanel.id]) {
    const properties = (resolveNode(id)?.properties || {}) as Record<string, unknown>
    if (derivedKeys.some(key => key in properties)) throw new Error(`expected only legacy derived fields to clear from ${id}: ${JSON.stringify(properties)}`)
    const expectedRawMediaUrl = id === sourceNode.id ? staleCardMediaUrl : sourceUrl
    if (properties.imageUrl !== expectedRawMediaUrl || properties.media_url !== expectedRawMediaUrl || properties.media_kind !== 'image' || !Array.isArray(properties.storyboardMediaItems)) {
      throw new Error(`expected raw input media to survive recovery for ${id}: ${JSON.stringify(properties)}`)
    }
    const canonicalProperties = (canonical.nodes.find(node => node.id === id)?.properties || {}) as Record<string, unknown>
    if (derivedKeys.some(key => key in canonicalProperties)) throw new Error(`expected canonical legacy cleanup for ${id}`)
  }
  if ((resolveNode(sourceNode.id)?.properties as Record<string, unknown>).prompt !== '/image.to-threejs @image-to-threejs #image-to-threejs') {
    throw new Error('expected the overwritten legacy Card prompt to recover the shared image-to-threejs preset')
  }
  if ((resolveNode(inputPanel.id)?.properties as Record<string, unknown>).richMediaActiveTab !== 'image') {
    throw new Error('expected the recovered raw Rich Media input to return to the image tab')
  }
  if (JSON.stringify(resolveNode(authoredThreePanel.id)?.properties) !== authoredThreePanelBefore) {
    throw new Error('expected unconnected authored Three.js panels to remain untouched')
  }
  const outputPanel = draft.nodes.find(node => isImageToThreeJsOutputPanel(node.properties)) || null
  if ((outputPanel?.properties as Record<string, unknown> | undefined)?.mediaRenderMode !== IMAGE_TO_THREEJS_RENDER_MODE) {
    throw new Error('expected the marker-owned Three.js output panel to retain conversion output')
  }
}

export function testImageToThreeJsSurfaceUsesNativeThreeLoadersAndExplicitDisposal() {
  const source = readFileSync(new URL('../features/image-to-threejs/ImageThreeJsSurface.tsx', import.meta.url), 'utf8')
  const required = [
    'new THREE.TextureLoader()',
    'loaded.colorSpace = THREE.SRGBColorSpace',
    'new SVGLoader().parse(text)',
    'SVGLoader.createShapes(path)',
    'SVGLoader.pointsToStroke(',
    'ownedTexture?.dispose()',
    'disposeImageThreeJsObject(ownedGroup)',
    'frameloop="demand"',
    'key={`svg:${sourceUrl}`}',
    'key={`raster:${sourceUrl}`}',
  ]
  for (const token of required) {
    if (!source.includes(token)) throw new Error(`missing native Three.js lifecycle contract: ${token}`)
  }
  if (source.includes('Three.js-Object-Sculptor-Codex-Plugin')) {
    throw new Error('forbid copied or runtime-dependent external plugin source')
  }
  const workflowSource = readFileSync(new URL('../components/StoryboardWidgetCanvas/runtime/storyboardWidgetWorkflowMediaRunHandlers.ts', import.meta.url), 'utf8')
  for (const token of [
    'resolveImageToThreeJsRunInput({',
    'buildImageToThreeJsConversion(imageToThreeJsRunInput.sourceUrl)',
    'imageThreeJsInvocation:',
    'publishImageToThreeJsRunOutputToRichMediaPanel({ anchorNode: args.node, patch: outputPatch })',
  ]) {
    if (!workflowSource.includes(token)) throw new Error(`missing image-to-threejs workflow projection: ${token}`)
  }
  const cardSource = readFileSync(new URL('../lib/cards/CardMediaPreview.tsx', import.meta.url), 'utf8')
  if (!cardSource.includes('<ImageThreeJsSurface')) throw new Error('expected shared Card media projection to own the Three.js surface')
}

export function testImageToThreeJsBuildsAndDisposesRealSvgGeometry() {
  const harness = initJsdomHarness()
  try {
    const group = buildImageThreeJsSvgGroup([
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 80">',
      '<rect x="4" y="4" width="112" height="72" rx="8" fill="#2563eb"/>',
      '<path d="M16 58 L52 20 L104 60" fill="none" stroke="#f8fafc" stroke-width="6"/>',
      '</svg>',
    ].join(''))
    const meshes: THREE.Mesh[] = []
    group.traverse(object => {
      if (object instanceof THREE.Mesh) meshes.push(object)
    })
    if (meshes.length < 2) throw new Error(`expected SVG fill and stroke meshes, got ${meshes.length}`)

    const renderedBounds = new THREE.Box3().setFromObject(group)
    const renderedSize = renderedBounds.getSize(new THREE.Vector3())
    const largestDimension = Math.max(renderedSize.x, renderedSize.y)
    if (!Number.isFinite(largestDimension) || Math.abs(largestDimension - 2.2) > 0.001) {
      throw new Error(`expected bounded SVG fit at 2.2 units, got ${largestDimension}`)
    }

    let disposedGeometryCount = 0
    let disposedMaterialCount = 0
    for (const mesh of meshes) {
      mesh.geometry.addEventListener('dispose', () => { disposedGeometryCount += 1 })
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
      materials.forEach(material => material.addEventListener('dispose', () => { disposedMaterialCount += 1 }))
    }
    disposeImageThreeJsObject(group)
    if (disposedGeometryCount !== meshes.length || disposedMaterialCount !== meshes.length) {
      throw new Error(`expected every SVG mesh resource to dispose, got geometry=${disposedGeometryCount} material=${disposedMaterialCount}`)
    }
  } finally {
    harness.restore()
  }
}

export function testImageToThreeJsForbidsExternalPluginRuntimeDependency() {
  const packageJson = readFileSync(new URL('../../package.json', import.meta.url), 'utf8')
  const contractSource = readFileSync(new URL('../features/image-to-threejs/imageToThreeJsContract.ts', import.meta.url), 'utf8')
  const surfaceSource = readFileSync(new URL('../features/image-to-threejs/ImageThreeJsSurface.tsx', import.meta.url), 'utf8')
  const combinedRuntimeSource = [packageJson, contractSource, surfaceSource].join('\n')
  for (const forbidden of ['Three.js-Object-Sculptor-Codex-Plugin', 'object-to-threejs-procedural']) {
    if (combinedRuntimeSource.includes(forbidden)) {
      throw new Error(`forbid external Object Sculptor runtime dependency: ${forbidden}`)
    }
  }
}
