import fs from 'node:fs'
import path from 'node:path'
import { parse as parseYaml } from 'yaml'
import { loadGraphDataFromTextViaParser } from '@/features/parsers/loader'
import { buildStoryboardBoardModel, buildStoryboardInlineMediaCommandContext } from '@/components/StoryboardCanvas/storyboardModel'
import { collectInlineMediaCommandCandidates } from '@/lib/command-menu/inlineCommandMenuCatalog'
import { syncActiveMarkdownDocumentTextFromParsedGraph } from '@/hooks/store/graph-data-slice/graphDataFrontmatterFlowSync'
import type { GraphData, GraphNode } from '@/lib/graph/types'
import {
  appendStrybldrStoryboardMarkdownElement,
  applyStrybldrImageArtifactToGraphData,
  buildStrybldrGraphData,
  buildStrybldrStoryboardDocument,
  buildStrybldrWorkflowGanttCode,
  buildStrybldrImageHandoffMarkdown,
  buildStrybldrLocalImageDataUri,
  buildStrybldrVideoHandoffFromGraphData,
  buildStrybldrVideoHandoffMarkdown,
  applyStrybldrVideoArtifactToGraphData,
  clearStrybldrVideoArtifactMarkdownOverrides,
  isStrybldrImageGenerationIntent,
  mergeStrybldrElementsIntoGraphData,
  parseStrybldrStoryboardMarkdown,
  readStrybldrWorkflowGanttCodesFromMarkdown,
  removeStrybldrStoryboardMarkdownElement,
  resolveStrybldrVideoArtifactTargetNodeId,
  serializeStrybldrStoryboardMarkdown,
  syncStrybldrStoryboardMarkdownWorkflowEdges,
  updateStrybldrStoryboardMarkdownCardOverride,
} from '@/features/strybldr/strybldrStoryboard'
import { createStrybldrLocalVideoArtifactFromGraphData } from '@/features/strybldr/strybldrVideoHandoffArtifact'
import { getWorkspaceFs, resetWorkspaceFsForTests } from '@/features/workspace-fs/workspaceFs'
import { STRYBLDR_CAMERA_PROPERTY_KEY, readStrybldrCameraSettings, resolveStrybldrCameraOrbit, serializeStrybldrCameraSettings } from '@/features/strybldr/strybldrCamera'
import {
  resolveCameraOrbitFrameRay,
  resolveCameraOrbitSphereGridMeridianGeometry,
  resolveCameraOrbitSpherePointFromGridPoint,
  type CameraOrbitSphereConfig,
} from '@/lib/camera/orbitSphere'
import {
  createStrytreeCandidateRunAction,
  createStrytreeContinuationDraftAction,
  publishStrytreeCandidateAction,
  toggleStrytreeLikeAction,
  unlockStrytreeNodeAction,
} from '@/features/strybldr/strytreeWorkflow'
import { getCanvas2dSurfaceId, isStoryboardCanvas2dRenderer, resolveCanvas2dRendererId, supportsToolbarRunAll } from '@/lib/config.render'
import { parseWorkspaceStrybldrStoryboardGraphDataCached } from '@/hooks/active-graph-data/workspaceStructuredGraph'
import {
  FLOW_STORYBOARD_ELEMENT_FORM_ID,
  FLOW_STORYBOARD_ELEMENT_NODE_TYPE_ID,
  FLOW_STORYBOARD_ELEMENT_WIDGET_TYPE_ID,
} from '@/lib/config.storyboard-widget'
import { extractYamlFrontmatterHeaderBlock, readYamlFrontmatterValue } from '@/lib/markdown/frontmatter'
import { buildMermaidGanttTimelineModel } from '@/lib/mermaid/mermaidGanttBarInteraction'
import { readYamlFrontmatterMermaidDiagramCodes } from '@/lib/mermaid/mermaidDiagramCode'
import { RICH_MEDIA_PANEL_DEFAULT_HEIGHT_PX, RICH_MEDIA_PANEL_DEFAULT_WIDTH_PX } from '@/lib/render/richMediaPanelDefaults'
import { resolveGraphNodeIdForGanttTaskSpan } from '@/features/gitgraph/ganttGraphNodeSelection'
function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

const readTypedValue = (value: unknown): unknown => {
  if (!value || typeof value !== 'object' || !('value' in value)) return value
  return (value as Record<string, unknown>).value
}

const readSource = (...parts: string[]): string => fs.readFileSync(path.resolve(process.cwd(), 'src', ...parts), 'utf8')
const STRYBLDR_STARTER_TEMPLATE_NAME = ['agenticgraph-strybldr', 'starter-template.md'].join('-')
const STRYBLDR_STARTER_TEMPLATE_REFERENCE = ['docs', STRYBLDR_STARTER_TEMPLATE_NAME].join('/')

const resolveStrybldrStarterTemplatePath = (): string => {
  const externalValidationInput = String(process.env.AG_TEST_VALIDATION_FORBID_HARDCODE_IN_REPO || '').trim()
  if (externalValidationInput && path.basename(externalValidationInput) === STRYBLDR_STARTER_TEMPLATE_NAME) return externalValidationInput
  return path.resolve(process.cwd(), '../..', 'huijoohwee', 'docs', STRYBLDR_STARTER_TEMPLATE_NAME)
}

const readStrybldrStarterTemplateText = (): string => fs.readFileSync(resolveStrybldrStarterTemplatePath(), 'utf8')

const assertStrybldrStarterTemplateHasNoRepoHardcodedRuntimeMedia = (text: string): void => {
  const forbiddenRuntimeMediaPatterns: Array<[RegExp, string]> = [
    [/\bkg_media_token=/i, 'local media access tokens'],
    [/\blocalhost:\d+\/api\/storage\/media\//i, 'localhost storage media URLs'],
    [/\/api\/storage\/media\/[^ \n"'`]+\/runs\/upload-[^ \n"'`]+/i, 'persisted upload storage URLs'],
    [/\bupload-[a-z0-9]{8,}/i, 'source-specific upload ids'],
  ]
  for (const [pattern, label] of forbiddenRuntimeMediaPatterns) {
    assert(!pattern.test(text), `expected starter template not to store ${label}`)
  }
}

const readStrybldrDemoText = (): string => {
  const demoPath = path.resolve(process.cwd(), '../..', 'huijoohwee/docs/agenticgraph-strybldr-demo.md')
  return fs.readFileSync(demoPath, 'utf8')
}

const readStrybldrDemoFrontmatterValue = (text: string, key: string): string => {
  const block = extractYamlFrontmatterHeaderBlock(text)
  return block ? readYamlFrontmatterValue(block.rawBlock, key).trim() : ''
}

const readStrybldrDemoVideoId = (text: string): string => {
  return readStrybldrDemoFrontmatterValue(text, 'kgYoutubeVideoId')
}

const readStrybldrDemoWatchUrl = (text: string): string => {
  return readStrybldrDemoFrontmatterValue(text, 'kgWebpageUrl')
}

export async function testStrybldrStoryboardMarkdownParsesToStoryboardGraph() {
  const doc = buildStrybldrStoryboardDocument({
    createdAtMs: 1,
    mediaUrlBySourceUnitId: {
      'corpus-source-demo': 'blob:strybldr-demo',
    },
    sourceUnits: [
      {
        id: 'corpus-source-demo',
        workspacePath: '/demo.png.source.md',
        relativePath: 'demo.png',
        originalName: 'demo.png',
        mediaKind: 'image',
        mimeHint: 'image/png',
        byteSize: 128,
        textHash: 'abc123',
        status: 'unsupported',
        provenance: { importMode: 'file', importedAtMs: 1 },
      },
    ],
  })
  const text = serializeStrybldrStoryboardMarkdown(doc)
  assert(text.includes('\nstrybldr_storyboard:\n'), 'expected serialized Strybldr markdown to store storyboard payload as YAML frontmatter')
  assert(!text.includes('\nstrybldr_storyboard: |\n'), 'expected serialized Strybldr markdown not to store storyboard payload as a JSON string literal')
  assert(!text.includes('```json strybldr-storyboard'), 'expected serialized Strybldr markdown not to duplicate storyboard payload in the Markdown body')
  const parsed = await loadGraphDataFromTextViaParser('demo.strybldr.md', text, { applyToStore: false })
  assert(parsed?.parserId === 'strybldr-storyboard', `expected strybldr parser, got ${parsed?.parserId}`)
  assert(parsed.graphData?.metadata && String((parsed.graphData.metadata as Record<string, unknown>).kgCanvas2dRenderer || '') === 'storyboard', 'expected Strybldr graph to advertise Storyboard renderer metadata')
  assert(String((parsed.graphData.metadata as Record<string, unknown>).graphSemanticKey || '').length > 0, 'expected shared graph semantic key metadata')
  assert((parsed.graphData.nodes || []).some(node => String(node.type || '') === FLOW_STORYBOARD_ELEMENT_NODE_TYPE_ID), 'expected storyboard element nodes')
  assert(
    (parsed.graphData.nodes || []).some(node => (
      String(node.type || '') === FLOW_STORYBOARD_ELEMENT_NODE_TYPE_ID
      && String(node.properties?.['flow:widgetTypeId'] || '') === FLOW_STORYBOARD_ELEMENT_WIDGET_TYPE_ID
      && String(node.properties?.['flow:widgetFormId'] || '') === FLOW_STORYBOARD_ELEMENT_FORM_ID
    )),
    'expected storyboard element nodes to carry shared widget identity for Workflow Manager mapping deep links',
  )
  assert((parsed.graphData.nodes || []).some(node => String(node.properties?.strybldrSourceUnitId || '') === 'corpus-source-demo'), 'expected provenance source-unit id on cards')
  assert((parsed.graphData.nodes || []).some(node => String(node.properties?.mediaKind || '') === 'image' && String(node.properties?.mimeHint || '') === 'image/png'), 'expected image media metadata for Viewer and Canvas rendering')
  const storyboardCardNodes = (parsed.graphData.nodes || []).filter(node => (
    String(node.type || '') === 'StrybldrImageSource'
    || String(node.type || '') === 'StoryboardFrame'
    || String(node.type || '') === FLOW_STORYBOARD_ELEMENT_NODE_TYPE_ID
  ))
  assert(storyboardCardNodes.length >= 2, 'expected parsed Strybldr graph to expose storyboard card nodes')
  for (const node of storyboardCardNodes) {
    assert(node.properties?.['visual:shape'] === 'rect', `expected Storyboard card ${String(node.id)} to render as a rect`)
    assert(node.properties?.['visual:width'] === RICH_MEDIA_PANEL_DEFAULT_WIDTH_PX, `expected Storyboard card ${String(node.id)} width to reuse Rich Media panel geometry`)
    assert(node.properties?.['visual:height'] === RICH_MEDIA_PANEL_DEFAULT_HEIGHT_PX, `expected Storyboard card ${String(node.id)} height to reuse Rich Media panel geometry`)
    assert(node.properties?.['visual:fill'] === 'var(--kg-panel-bg)', `expected Storyboard card ${String(node.id)} to use panel fill`)
    assert(node.properties?.['visual:stroke'] === 'var(--kg-border)', `expected Storyboard card ${String(node.id)} to use panel border`)
    assert(node.properties?.['visual:preserveBody'] === true, `expected Storyboard card ${String(node.id)} to preserve card shell under media overlays`)
    assert(node.properties?.['visual:hideLabel'] === true, `expected Storyboard card ${String(node.id)} to hide duplicate graph labels under restored card overlay`)
  }

  const board = buildStoryboardBoardModel({ graphData: parsed.graphData, graphRevision: 1 })
  assert(board.totalCards >= 2, `expected Storyboard canvas cards from Strybldr graph, got ${board.totalCards}`)
  assert(board.lanes.some(lane => lane.id === 'Elements'), 'expected element lane in Strybldr board')
}

export async function testStrybldrConsolidatedDemoRoutesPanelsAndStoryboardRenderers() {
  const text = readStrybldrDemoText()
  const parsed = await loadGraphDataFromTextViaParser('agenticgraph-strybldr-demo.md', text, {
    applyToStore: false,
    syncMarkdownDocument: false,
  })
  assert(parsed?.parserId === 'strybldr-storyboard', `expected Strybldr demo to use Strybldr parser, got ${parsed?.parserId}`)
  const graph = parsed.graphData
  assert(graph, 'expected parsed Strybldr graph')
  assert((graph.nodes || []).length > 0, 'expected Strybldr graph nodes for 2D renderers')
  assert((graph.edges || []).length > 0, 'expected Strybldr graph edges for Storyboard Widget projection')
  const metadata = (graph.metadata || {}) as Record<string, unknown>
  assert(String(metadata.kind || '') === 'strybldr-storyboard', `expected Strybldr graph kind to remain strybldr-storyboard, got ${String(metadata.kind || '')}`)
  assert(String(metadata.kgCanvas2dRenderer || '') === 'storyboard', 'expected Strybldr graph to advertise Storyboard renderer intent')
  assert(String(metadata.workflowForkId || '') === 'workflow-fork-rest-or-mcp', 'expected Strybldr graph metadata to preserve workflow fork')
  assert(String(metadata.workflowPublishId || '') === 'workflow-local-publish-packet', 'expected Strybldr graph metadata to preserve workflow publish packet')
  assert(Number(metadata.workflowEdgesCount || 0) >= 8, 'expected Strybldr graph metadata to count restored workflow edges')
  assert(
    (graph.edges || []).some(edge => edge.source === 'videodb-recreate-api-mcp-execution-card' && edge.target === 'workflow-fork-rest-mcp-card' && edge.label === 'operator_fork'),
    'expected parsed Strybldr graph to preserve the explicit REST/MCP fork edge',
  )
  assert(
    (graph.edges || []).some(edge => edge.source === 'videodb-recreate-review-card' && edge.target === 'videodb-recreate-publish-card' && edge.label === 'review_to_publish'),
    'expected parsed Strybldr graph to preserve the explicit publish edge',
  )
  const frontmatterMeta = metadata.frontmatterMeta as Record<string, unknown> | undefined
  assert(frontmatterMeta && String(frontmatterMeta.kgCanvas2dRenderer || '') === 'storyboard', 'expected Strybldr graph to preserve frontmatter renderer metadata')
  const flowDiagrams = frontmatterMeta?.flow_diagrams as Record<string, unknown> | undefined
  assert(flowDiagrams && typeof flowDiagrams === 'object', 'expected Strybldr graph to preserve routed flow_diagrams metadata')
  const flowDiagramEntries = Object.values((flowDiagrams.value || flowDiagrams) as Record<string, unknown>)
  for (const kind of ['mermaid_gitgraph', 'mermaid_architecture', 'mermaid_eventmodeling', 'mermaid_flowchart']) {
    assert(
      flowDiagramEntries.some(entry => String((entry as Record<string, unknown>)?.type || '') === kind),
      `expected Strybldr routed diagram metadata for ${kind}`,
    )
  }
  const board = buildStoryboardBoardModel({ graphData: graph, graphRevision: 1 })
  assert(board.totalCards > 0, `expected Storyboard/Strybldr board cards from Strybldr graph, got ${board.totalCards}`)
  const laneIds = new Set(board.lanes.map(lane => lane.id))
  for (const laneId of ['Source', 'Storyboard', 'Elements', 'Runtime', 'Fork', 'Review', 'Publish']) {
    assert(laneIds.has(laneId), `expected Strybldr board to expose ${laneId} lane, got ${Array.from(laneIds).join(', ')}`)
  }
  const forkLane = board.lanes.find(lane => lane.id === 'Fork')
  assert(forkLane?.cards.some(card => card.title === 'Workflow fork: REST or MCP'), 'expected REST/MCP fork card to render in the Fork lane')
  const runtimeLane = board.lanes.find(lane => lane.id === 'Runtime')
  assert(runtimeLane?.cards.some(card => card.title === 'SenseNova media outputs'), 'expected SenseNova media output card to render in the Runtime lane')
  const reviewLane = board.lanes.find(lane => lane.id === 'Review')
  assert(reviewLane?.cards.some(card => card.title === 'Review search and stream'), 'expected review/search card to render in the Review lane')
  const publishLane = board.lanes.find(lane => lane.id === 'Publish')
  assert(publishLane?.cards.some(card => card.title === 'Local publish packet'), 'expected local publish packet card to render in the Publish lane')
  assert(!board.lanes.some(lane => lane.id === 'Storytree' || lane.id === 'ForkCompare'), 'expected cleaned Strybldr demo to omit unrelated Storytree and ForkCompare lanes')
  const storyboardCanvasText = readSource('components', 'StoryboardCanvas.tsx')
  assert(storyboardCanvasText.includes('strybldrWorkflowEdge'), 'expected Storyboard/Strybldr canvas edge layer to render graph-marked Strybldr workflow edges')
  const sourceCard = board.lanes.find(lane => lane.id === 'Source')?.cards.find(card => card.title === 'Import Url Source')
  assert(sourceCard, 'expected Strybldr demo Source lane to expose the imported URL source card')
  const commandContextText = buildStoryboardInlineMediaCommandContext(sourceCard)
  const mediaCommandCandidates = collectInlineMediaCommandCandidates({ draftText: commandContextText })
  const sourceWatchUrl = String(sourceCard.media?.sourceUrl || sourceCard.href || '').trim()
  assert(sourceWatchUrl && mediaCommandCandidates.some(candidate => candidate.kind === 'video' && candidate.url === sourceWatchUrl), 'expected Source card @ media commands to resolve the source video URL from storyboard media context')
  assert(mediaCommandCandidates.some(candidate => candidate.kind === 'image' && candidate.thumbnailUrl), 'expected Source card @ media commands to resolve an image thumbnail from storyboard media context')
  const nextSourceAction = `Review source evidence with ${sourceWatchUrl}`
  const updatedText = updateStrybldrStoryboardMarkdownCardOverride({
    text,
    nodeId: sourceCard.id,
    patch: { action: nextSourceAction },
  })
  assert(updatedText && updatedText !== text, 'expected Strybldr Source card action update to persist into the markdown payload')
  const updatedParsed = await loadGraphDataFromTextViaParser('agenticgraph-strybldr-demo.md', updatedText, {
    applyToStore: false,
    syncMarkdownDocument: false,
  })
  const updatedBoard = buildStoryboardBoardModel({ graphData: updatedParsed.graphData, graphRevision: 2 })
  const updatedSourceCard = updatedBoard.lanes.find(lane => lane.id === 'Source')?.cards.find(card => card.id === sourceCard.id)
  assert(updatedSourceCard?.action === nextSourceAction, 'expected updated Strybldr markdown payload to regenerate the Source card action')
}

export async function testStrybldrStarterTemplateStaysRunnableAndNeutral() {
  const starterName = STRYBLDR_STARTER_TEMPLATE_NAME
  const text = readStrybldrStarterTemplateText()
  const frontmatter = extractYamlFrontmatterHeaderBlock(text)
  assert(frontmatter, 'expected starter template to keep byte-zero YAML frontmatter')
  const frontmatterPayload = parseYaml(frontmatter.rawBlock.replace(/^---\n?/, '').replace(/\n---\s*$/, '')) as Record<string, unknown>
  assert(readYamlFrontmatterValue(frontmatter.rawBlock, 'kgCanvas2dRenderer').trim() === 'storyboard', 'expected starter template to route to the shared Storyboard renderer')
  assert(readYamlFrontmatterValue(frontmatter.rawBlock, 'kgFloatingPanelView').trim() === 'gantt', 'expected starter template to route the shared FloatingPanel Gantt-Timeline')
  assert(readYamlFrontmatterValue(frontmatter.rawBlock, 'kgBottomPanelTab').trim() === 'gantt', 'expected starter template to route the shared BottomPanel Gantt-Timeline')
  assert(readYamlFrontmatterValue(frontmatter.rawBlock, 'validation_input_forbid_hardcode_in_repo').trim() === 'true', 'expected starter template to declare hardcode-free validation input mode')
  assertStrybldrStarterTemplateHasNoRepoHardcodedRuntimeMedia(text)
  assert(!text.includes('localhost:'), 'expected starter template not to store localhost media URLs')
  assert(!text.includes('kg_media_token='), 'expected starter template not to store local media access tokens')
  assert(!text.includes('upload-730fe6850f0fc26f'), 'expected starter template not to store copied upload ids')
  assert(!text.includes('\n  cards:\n'), 'expected starter template not to store runtime card override payloads')
  assert(!text.includes('seedream-'), 'expected starter template not to store provider-specific generated model ids')
  assert(!text.includes('video-url'), 'expected starter template not to store placeholder media URLs')
  assert(!text.includes('Generated Strybldr'), 'expected starter template not to store generated runtime handoff copy')
  assert(!text.includes('New storyboard card') && text.includes('An individually pinned Card, Widget, or Rich Media Panel rejects local drag in every board layout while collective canvas pan remains available.'), 'expected starter template to avoid ad hoc cards and declare universal individual pin movement semantics')
  const parsedDoc = parseStrybldrStoryboardMarkdown(text)
  assert(parsedDoc, 'expected starter template to expose a structured Strybldr storyboard payload')
  const parsed = await loadGraphDataFromTextViaParser(starterName, text, {
    applyToStore: false,
    syncMarkdownDocument: false,
  })
  assert(parsed?.parserId === 'strybldr-storyboard', `expected Strybldr starter to use Strybldr parser, got ${parsed?.parserId}`)
  const graph = parsed.graphData
  assert(graph, 'expected parsed starter graph')
  const flowRecord = frontmatterPayload.flow as Record<string, unknown> | undefined
  const authoredFlowNodes = Array.isArray(flowRecord?.nodes) ? flowRecord.nodes : []
  const authoredFlowEdges = Array.isArray(flowRecord?.edges) ? flowRecord.edges : []
  const authoredEdgeIds = authoredFlowEdges
    .map(edge => {
      if (!edge || typeof edge !== 'object') return ''
      return String((edge as { id?: unknown }).id || '').trim()
    })
    .filter(Boolean)
  assert(new Set(authoredEdgeIds).size === authoredEdgeIds.length, 'expected starter template flow.edges to avoid duplicate authored edge ids')
  for (const authoredNode of authoredFlowNodes) {
    if (!authoredNode || typeof authoredNode !== 'object') continue
    const authoredRecord = authoredNode as Record<string, unknown>
    if (String(readTypedValue(authoredRecord.type) || '') !== 'RichMediaPanel') continue
    for (const key of ['output', 'imageUrl', 'outputSrcDoc', 'mediaUrl', 'renderUrl']) {
      assert(!String(readTypedValue(authoredRecord[key]) || '').trim(), `expected starter template Rich Media panel ${String(readTypedValue(authoredRecord.id) || '')} to keep ${key} blank until runtime`)
    }
  }
  const graphNodeById = new Map((graph.nodes || []).map(node => [String(node.id), node]))
  const missingParsedFields: string[] = []
  for (const authoredNode of authoredFlowNodes) {
    if (!authoredNode || typeof authoredNode !== 'object') continue
    const authoredRecord = authoredNode as Record<string, unknown>
    const authoredId = String(readTypedValue(authoredRecord.id) || '')
    const parsedNode = graphNodeById.get(authoredId)
    if (!parsedNode) continue
    for (const key of Object.keys(authoredRecord)) {
      if (key === 'id' || key === 'type' || key === 'label') continue
      if (!(key in (parsedNode.properties || {}))) missingParsedFields.push(`${authoredId}:${key}`)
    }
  }
  assert(missingParsedFields.length === 0, `expected parser to preserve all materialized authored flow node fields, missing ${missingParsedFields.join(', ')}`)
  const board = buildStoryboardBoardModel({ graphData: graph, graphRevision: 1 })
  const laneIds = new Set(board.lanes.map(lane => lane.id))
  for (const laneId of ['Source', 'Storyboard', 'Elements', 'Runtime', 'Review', 'Publish']) assert(laneIds.has(laneId), `expected starter board to expose ${laneId} lane, got ${Array.from(laneIds).join(', ')}`)
  assert(board.totalCards === parsedDoc.sources.length * 2 + parsedDoc.elements.length, `expected neutral starter to render source-owned cards, got ${board.totalCards}`)
  assert((graph.edges || []).length === parsedDoc.sources.length + parsedDoc.elements.length + parsedDoc.edges.length, `expected neutral starter to render source-owned edges, got ${(graph.edges || []).length}`)
  assert(!board.lanes.some(lane => lane.cards.some(card => card.title === 'New storyboard card')), 'expected board not to render ad hoc duplicated cards')
  const sourceNode = graphNodeById.get('strybldr:source:3725310941')
  assert(sourceNode, 'expected parsed starter graph to keep source node')
  assert(sourceNode.properties?.mediaKind === 'doc', `expected source mediaKind to parse, got ${String(sourceNode.properties?.mediaKind || '')}`)
  assert(sourceNode.properties?.mimeHint === 'text/markdown', `expected source mimeHint to parse, got ${String(sourceNode.properties?.mimeHint || '')}`)
  assert(sourceNode.properties?.['graph:degree'] === 1, `expected source graph degree to parse, got ${String(sourceNode.properties?.['graph:degree'] || '')}`)
  assert(sourceNode.properties?.['visual:nodeSize'] === 14, `expected source visual node size to parse, got ${String(sourceNode.properties?.['visual:nodeSize'] || '')}`)
  assert(
    Array.isArray(sourceNode.properties?.references) && sourceNode.properties.references.includes(STRYBLDR_STARTER_TEMPLATE_REFERENCE),
    `expected source references to parse, got ${JSON.stringify(sourceNode.properties?.references)}`,
  )
  const runtimeNode = graphNodeById.get('starter-runtime-gate-card')
  assert(runtimeNode, 'expected parsed starter graph to keep runtime gate node')
  assert(runtimeNode.properties?.provider === 'agenticgraph-local-animatic', `expected runtime provider to parse, got ${String(runtimeNode.properties?.provider || '')}`)
  assert(runtimeNode.properties?.evidenceKind === 'runtime-plan', `expected runtime evidenceKind to parse, got ${String(runtimeNode.properties?.evidenceKind || '')}`)
  assert(runtimeNode.properties?.strybldrElementId === 'starter-runtime-gate-card', `expected runtime strybldrElementId to parse, got ${String(runtimeNode.properties?.strybldrElementId || '')}`)
  assert(runtimeNode.properties?.mimeHint === 'text/markdown', `expected runtime mimeHint to parse, got ${String(runtimeNode.properties?.mimeHint || '')}`)
  assert(runtimeNode.properties?.['flow:widgetTypeId'] === FLOW_STORYBOARD_ELEMENT_WIDGET_TYPE_ID, 'expected runtime node to keep storyboard widget type id')
  assert(runtimeNode.properties?.['flow:widgetFormId'] === FLOW_STORYBOARD_ELEMENT_FORM_ID, 'expected runtime node to keep storyboard widget form id')
}

export function testStrybldrSourceBackedCardFieldCommitDoesNotUseFloatingPanel() {
  const graphSyncText = readSource('hooks', 'store', 'graph-data-slice', 'graphDataFrontmatterFlowSync.ts')
  const storyboardCanvasText = readSource('components', 'StoryboardCanvas.tsx')
  const cardInlineTextEditorText = readSource('lib', 'cards', 'CardInlineTextEditor.tsx')
  assert(!fs.existsSync(path.resolve(process.cwd(), 'src', 'features', 'strybldr', 'StrybldrFloatingPanelView.tsx')), 'expected Strybldr FloatingPanel card editor owner to be removed')
  assert(!fs.existsSync(path.resolve(process.cwd(), 'src', 'features', 'strybldr', 'StrybldrCardEditorSection.tsx')), 'expected stale Strybldr panel card editor section to be removed')
  assert(graphSyncText.includes('buildStrybldrCardOverridePatchFromGraphNodeChange'), 'expected source-backed card field commits to persist through the shared graph/frontmatter sync owner')
  assert(storyboardCanvasText.includes('updateStrybldrStoryboardMarkdownCardOverride({'), 'expected Storyboard card edits to write Strybldr card overrides without a panel-local editor')
  assert(cardInlineTextEditorText.includes('textareaInvocationProjection'), 'expected card field editing to reuse shared invocation/media textarea projection')
}

export function testStrybldrStoryboardAppendElementPersistsToStructuredPayload() {
  const starterName = STRYBLDR_STARTER_TEMPLATE_NAME
  const text = readStrybldrStarterTemplateText()
  const appendedId = 'storyboard-card-append-regression'
  const updatedText = appendStrybldrStoryboardMarkdownElement({
    text,
    nodeId: appendedId,
    title: 'New storyboard card',
    type: 'Storyboard',
    lane: 'Elements',
    order: 99,
    sourceUnitId: 'strybldr-starter-source',
  })
  assert(updatedText && updatedText !== text, 'expected Strybldr structured append to update the markdown payload')
  assert(
    updatedText.includes('\n    - id: storyboard-card-append-regression\n'),
    'expected appended storyboard record to be written into the structured Strybldr elements payload',
  )
  const graph = parseWorkspaceStrybldrStoryboardGraphDataCached({
    markdownName: starterName,
    markdownText: updatedText,
  })
  assert(graph, 'expected workspace Strybldr parser to parse the appended starter template payload')
  const board = buildStoryboardBoardModel({ graphData: graph, graphRevision: 1 })
  const appendedCard = board.lanes
    .find(lane => lane.id === 'Elements')
    ?.cards.find(card => card.id === appendedId)
  assert(appendedCard, 'expected appended Strybldr element to render as a visible Elements storyboard card')
  assert(appendedCard?.title === 'New storyboard card', `expected appended card title, got ${String(appendedCard?.title || '')}`)
}

export function testStrybldrStoryboardRemoveElementPersistsToStructuredPayload() {
  const starterName = STRYBLDR_STARTER_TEMPLATE_NAME
  const text = readStrybldrStarterTemplateText()
  const removedId = 'starter-elements-card'
  const updatedText = removeStrybldrStoryboardMarkdownElement({
    text,
    nodeId: removedId,
  })
  assert(updatedText && updatedText !== text, 'expected Strybldr structured remove to update the markdown payload')
  assert(!updatedText.includes(`id: ${removedId}`), 'expected removed storyboard record to leave the structured Strybldr payload')
  const graph = parseWorkspaceStrybldrStoryboardGraphDataCached({
    markdownName: starterName,
    markdownText: updatedText,
  })
  assert(graph, 'expected workspace Strybldr parser to parse the removed starter template payload')
  const board = buildStoryboardBoardModel({ graphData: graph, graphRevision: 1 })
  const removedCard = board.lanes
    .find(lane => lane.id === 'Elements')
    ?.cards.find(card => card.id === removedId)
  assert(!removedCard, 'expected removed Strybldr element to disappear from the rendered Elements storyboard lane')
}

export function testStrybldrWorkspaceStructuredGraphFeedsStoryboardRenderers() {
  const demoName = 'agenticgraph-strybldr-demo.md'
  const demoPath = path.resolve(process.cwd(), '../..', 'huijoohwee/docs', demoName)
  const text = fs.readFileSync(demoPath, 'utf8')
  const graph = parseWorkspaceStrybldrStoryboardGraphDataCached({
    markdownName: demoName,
    markdownText: text,
  })
  assert(graph, 'expected workspace structured parser to reuse the Strybldr parser graph')
  const metadata = (graph.metadata || {}) as Record<string, unknown>
  assert(String(graph.context || '') === 'strybldr-storyboard', `expected Strybldr context, got ${String(graph.context || '')}`)
  assert(String(metadata.kind || '') === 'strybldr-storyboard', `expected Strybldr graph kind, got ${String(metadata.kind || '')}`)
  assert(String(metadata.source || '') === `markdown:${demoName}`, `expected workspace markdown source metadata, got ${String(metadata.source || '')}`)
  assert((graph.nodes || []).length > 0, 'expected workspace Strybldr graph nodes for Storyboard renderer')
  const board = buildStoryboardBoardModel({ graphData: graph, graphRevision: 1 })
  assert(board.totalCards > 0, `expected workspace Strybldr graph to feed Storyboard/Strybldr board cards, got ${board.totalCards}`)

  const activeGraphHook = readSource('hooks', 'active-graph-data', 'useActiveGraphData.impl.ts')
  assert(activeGraphHook.includes('parseWorkspaceStrybldrStoryboardGraphDataCached'), 'expected active graph hook to reuse workspace Strybldr structured parser')
  assert(
    activeGraphHook.includes('if (workspaceStrybldrStoryboardGraphData) return workspaceStrybldrStoryboardGraphData'),
    'expected frontmatter-only renderers to prefer Strybldr storyboard graph over pending Markdown',
  )
}

export async function testStrybldrStoryboardParsesStrytreeStorytreeSnapshot() {
  const text = [
    '---',
    'kgStrybldrStoryboard: true',
    'kgCanvasRenderMode: "2d"',
    'kgCanvas2dRenderer: "storyboard"',
    '---',
    '',
    '# Strytree fixture',
    '',
    '```json strybldr-storyboard',
    JSON.stringify({
      version: 1,
      runId: 'strytree-test',
      createdAtMs: 1,
      sources: [
        {
          sourceUnitId: 'strytree-contract',
          workspacePath: 'docs/documents/agenticgraph-strytree-prd-tad.md',
          relativePath: 'agenticgraph-strytree-prd-tad.md',
          originalName: 'Strytree contract',
          mediaKind: 'doc',
          mimeHint: 'text/markdown',
          byteSize: 0,
          textHash: 'contract',
          mediaUrl: 'docs/documents/agenticgraph-strytree-prd-tad.md',
        },
      ],
      elements: [
        {
          id: 'element-ledger',
          sourceUnitId: 'strytree-contract',
          label: 'Server ledger quote',
          confidence: 1,
          evidenceKind: 'user-edit',
          provider: 'fallback',
          order: 1,
          summary: 'Quote generation cost before spend.',
          action: 'Keep credit state server-owned.',
          prompt: 'Prepare a provider-safe handoff.',
        },
      ],
      storytree: {
        storyId: 'story-test',
        title: 'Original Strytree fixture',
        tokenBalance: 120,
        generationCostCredits: 5,
        nodes: [
          {
            nodeId: 'root',
            title: 'Root branch',
            synopsis: 'A root branch opens the story universe.',
            status: 'hot',
            isFreeWindow: true,
            likes: 10,
            impressions: 100,
            ownAssetIds: ['root-asset'],
          },
          {
            nodeId: 'child',
            parentNodeId: 'root',
            title: 'Child branch',
            synopsis: 'A child branch derives its edge from parentNodeId.',
            status: 'locked',
            isProtected: true,
            unlockPriceCredits: 6,
            likes: 4,
            impressions: 20,
            paidUnlocks: 2,
            ownAssetIds: ['child-asset'],
          },
        ],
        candidateRuns: [
          {
            candidateRunId: 'candrun-root',
            parentNodeId: 'root',
            status: 'completed',
            maxCandidates: 2,
            quotedCostCredits: 10,
            scorecardMode: 'cost_continuity',
            candidates: [
              {
                candidateId: 'cand-a',
                title: 'Candidate A',
                synopsis: 'A private candidate that can be compared before publishing.',
                prompt: 'Continue with inherited visual continuity.',
                provider: 'local-harness',
                status: 'succeeded',
                creditCost: 5,
                elapsedMs: 42000,
                fallbackStatus: 'none',
                moderationStatus: 'approved',
                inheritedAssetCount: 1,
                continuityScore: 0.84,
                publishEligible: true,
              },
              {
                candidateId: 'cand-b',
                title: 'Candidate B',
                synopsis: 'A second candidate kept private until selected.',
                prompt: 'Continue with a sharper conflict.',
                provider: 'local-harness',
                status: 'succeeded',
                creditCost: 5,
                elapsedMs: 51000,
                fallbackStatus: 'fallback-preview',
                moderationStatus: 'approved',
                inheritedAssetCount: 1,
                continuityScore: 0.72,
                publishEligible: true,
              },
            ],
          },
        ],
      },
    }, null, 2),
    '```',
    '',
  ].join('\n')
  const parsed = await loadGraphDataFromTextViaParser('strytree.strybldr.md', text, { applyToStore: false })
  assert(parsed?.parserId === 'strybldr-storyboard', `expected strybldr parser, got ${parsed?.parserId}`)
  const graph = parsed.graphData
  const overview = (graph.nodes || []).find(node => String(node.type || '') === 'StorytreeSnapshot')
  assert(overview, 'expected Strytree overview node')
  assert(Number(overview.properties?.maxDepth || 0) === 1, `expected storytree runtime maxDepth, got ${String(overview.properties?.maxDepth || '')}`)
  assert(Number(overview.properties?.protectedBranchCount || 0) === 1, `expected protected branch count, got ${String(overview.properties?.protectedBranchCount || '')}`)
  const root = (graph.nodes || []).find(node => String(node.type || '') === 'StorytreeNode' && String(node.properties?.strytreeNodeId || '') === 'root')
  assert(root && Number(root.properties?.childBranchCount || 0) === 1, 'expected root branch to calculate childBranchCount')
  const child = (graph.nodes || []).find(node => String(node.type || '') === 'StorytreeNode' && String(node.properties?.parent_node_id || '') === 'root')
  assert(child, 'expected child node to preserve parent_node_id')
  assert(child.properties?.unlockRequired === true, 'expected child branch to calculate unlockRequired')
  assert(String(child.properties?.accessState || '') === 'unlock-ready', `expected child branch accessState, got ${String(child.properties?.accessState || '')}`)
  assert(Number(child.properties?.depth || -1) === 1, `expected child branch depth, got ${String(child.properties?.depth || '')}`)
  assert(Number(child.properties?.likeRate || 0) === 20, `expected child likeRate calculation, got ${String(child.properties?.likeRate || '')}`)
  assert(Number(child.properties?.projectedBalanceAfterUnlock || 0) === 114, `expected unlock balance projection, got ${String(child.properties?.projectedBalanceAfterUnlock || '')}`)
  assert(Array.isArray(child.properties?.inheritedAssetIds) && child.properties?.inheritedAssetIds.includes('root-asset'), 'expected child branch to inherit parent assets')
  assert((graph.edges || []).some(edge => edge.source === root.id && edge.target === child.id && edge.label === 'parent_node_id'), 'expected parent-derived storytree edge to connect root and child cards')
  const candidate = (graph.nodes || []).find(node => String(node.type || '') === 'StorytreeCandidate' && String(node.properties?.strytreeCandidateId || '') === 'cand-a')
  assert(candidate, 'expected ForkCompare candidate scorecard node')
  assert(Number(candidate.properties?.continuityScore || 0) === 0.84, `expected candidate continuity score, got ${String(candidate.properties?.continuityScore || '')}`)
  assert(candidate.properties?.publishEligible === true, 'expected candidate publish eligibility')
  assert((graph.edges || []).some(edge => edge.source === root.id && edge.target === candidate.id && edge.label === 'candidateOption'), 'expected candidate option edge from parent branch')
  assert(String((graph.metadata as Record<string, unknown>)?.strytreeStoryId || '') === 'story-test', 'expected storytree metadata')
  assert(Number((graph.metadata as Record<string, unknown>)?.strytreeCandidateRunsCount || 0) === 1, 'expected candidate run metadata')
  const board = buildStoryboardBoardModel({ graphData: graph, graphRevision: 1 })
  const storytreeLane = board.lanes.find(lane => lane.id === 'Storytree')
  assert(storytreeLane && storytreeLane.cards.some(card => card.title === 'Child branch'), `expected Strybldr board to expose Storytree lane cards, got ${JSON.stringify(board.lanes.map(lane => ({ id: lane.id, titles: lane.cards.map(card => card.title) })))}`)
  const forkCompareLane = board.lanes.find(lane => lane.id === 'ForkCompare')
  assert(forkCompareLane && forkCompareLane.cards.some(card => card.title === 'Candidate A'), 'expected Strybldr board to expose ForkCompare candidate cards')
  const handoff = buildStrybldrVideoHandoffFromGraphData(graph)
  assert(handoff.cards.some(card => card.lane === 'Storytree' && card.title === 'Child branch'), 'expected Run All handoff to include Storytree branch cards')
  assert(handoff.cards.some(card => card.lane === 'ForkCompare' && card.title === 'Candidate A'), 'expected Run All handoff to include ForkCompare candidate cards')
  assert(handoff.prompt.includes('approved Strybldr storyboard cards'), 'expected shared Strybldr handoff prompt')
}

export async function testStrybldrStorytreeWorkflowActionsMutateGraphState() {
  const text = [
    '---',
    'kgStrybldrStoryboard: true',
    'kgCanvasRenderMode: "2d"',
    'kgCanvas2dRenderer: "storyboard"',
    '---',
    '',
    '```json strybldr-storyboard',
    JSON.stringify({
      version: 1,
      runId: 'strytree-workflow-test',
      createdAtMs: 1,
      sources: [
        {
          sourceUnitId: 'workflow-source',
          workspacePath: 'docs/documents/agenticgraph-strytree-prd-tad.md',
          relativePath: 'agenticgraph-strytree-prd-tad.md',
          originalName: 'Strytree workflow source',
          mediaKind: 'doc',
          mimeHint: 'text/markdown',
          byteSize: 0,
          textHash: 'workflow',
          mediaUrl: 'docs/documents/agenticgraph-strytree-prd-tad.md',
        },
      ],
      elements: [],
      storytree: {
        storyId: 'workflow-story',
        title: 'Workflow story',
        tokenBalance: 12,
        generationCostCredits: 5,
        nodes: [
          {
            nodeId: 'root',
            title: 'Root branch',
            synopsis: 'Root branch.',
            status: 'active',
            isFreeWindow: true,
            likes: 1,
            impressions: 10,
            ownAssetIds: ['root-asset'],
          },
          {
            nodeId: 'locked-child',
            parentNodeId: 'root',
            title: 'Locked child',
            synopsis: 'Locked child branch.',
            status: 'locked',
            isProtected: true,
            unlockPriceCredits: 4,
            likes: 2,
            impressions: 20,
            ownAssetIds: ['child-asset'],
          },
        ],
      },
    }, null, 2),
    '```',
  ].join('\n')
  const parsed = await loadGraphDataFromTextViaParser('workflow.strybldr.md', text, { applyToStore: false })
  assert(parsed?.graphData, 'expected Strytree workflow graph')
  const root = (parsed.graphData.nodes || []).find(node => String(node.type || '') === 'StorytreeNode' && String(node.properties?.strytreeNodeId || '') === 'root')
  const child = (parsed.graphData.nodes || []).find(node => String(node.type || '') === 'StorytreeNode' && String(node.properties?.strytreeNodeId || '') === 'locked-child')
  assert(root?.id && child?.id, 'expected root and child storytree graph nodes')

  const liked = toggleStrytreeLikeAction(parsed.graphData, child.id)
  assert(liked.changed, 'expected like action to mutate graph')
  const likedChild = (liked.graphData.nodes || []).find(node => node.id === child.id)
  assert(likedChild?.properties?.likedByCurrentUser === true, 'expected branch to store local like state')
  assert(Number(likedChild?.properties?.likes || 0) === 3, `expected like count increment, got ${String(likedChild?.properties?.likes || '')}`)

  const unlocked = unlockStrytreeNodeAction(liked.graphData, child.id, 1000)
  assert(unlocked.changed, 'expected unlock action to mutate graph')
  const unlockedChild = (unlocked.graphData.nodes || []).find(node => node.id === child.id)
  const unlockedSnapshot = (unlocked.graphData.nodes || []).find(node => String(node.type || '') === 'StorytreeSnapshot')
  assert(String(unlockedChild?.properties?.accessState || '') === 'open', `expected unlock to open branch, got ${String(unlockedChild?.properties?.accessState || '')}`)
  assert(Number(unlockedSnapshot?.properties?.tokenBalance || 0) === 8, `expected unlock debit to update token balance, got ${String(unlockedSnapshot?.properties?.tokenBalance || '')}`)
  assert(Array.isArray(unlockedSnapshot?.properties?.strytreeLedgerEvents), 'expected unlock to append a ledger event')

  const drafted = createStrytreeContinuationDraftAction(unlocked.graphData, root.id, { prompt: 'Continue this branch safely.', nowMs: 2000 })
  assert(drafted.changed && drafted.createdNodeId, 'expected continuation action to create a draft child branch')
  const draftNode = (drafted.graphData.nodes || []).find(node => node.id === drafted.createdNodeId)
  const debitedSnapshot = (drafted.graphData.nodes || []).find(node => String(node.type || '') === 'StorytreeSnapshot')
  assert(String(draftNode?.type || '') === 'StorytreeNode', 'expected draft branch node')
  assert(String(draftNode?.properties?.strytreeStatus || '') === 'draft', 'expected draft branch status')
  assert(Array.isArray(draftNode?.properties?.inheritedAssetIds) && draftNode?.properties?.inheritedAssetIds.includes('root-asset'), 'expected draft branch to inherit parent assets')
  assert((drafted.graphData.edges || []).some(edge => edge.source === root.id && edge.target === drafted.createdNodeId && edge.label === 'parent_node_id'), 'expected draft edge to derive from parent branch')
  assert(Number(debitedSnapshot?.properties?.tokenBalance || 0) === 3, `expected generation debit to update token balance, got ${String(debitedSnapshot?.properties?.tokenBalance || '')}`)
  const handoff = buildStrybldrVideoHandoffFromGraphData(drafted.graphData)
  assert(handoff.cards.some(card => card.id === drafted.createdNodeId && card.lane === 'Storytree'), 'expected draft branch to feed Strybldr Run All')
}

export async function testStrybldrForkCompareCandidateWorkflowActions() {
  const text = [
    '---',
    'kgStrybldrStoryboard: true',
    'kgCanvasRenderMode: "2d"',
    'kgCanvas2dRenderer: "storyboard"',
    '---',
    '',
    '```json strybldr-storyboard',
    JSON.stringify({
      version: 1,
      runId: 'forkcompare-workflow-test',
      createdAtMs: 1,
      sources: [
        {
          sourceUnitId: 'forkcompare-source',
          workspacePath: 'docs/documents/agenticgraph-strytree-prd-tad.md',
          relativePath: 'agenticgraph-strytree-prd-tad.md',
          originalName: 'Strytree ForkCompare source',
          mediaKind: 'doc',
          mimeHint: 'text/markdown',
          byteSize: 0,
          textHash: 'forkcompare',
          mediaUrl: 'docs/documents/agenticgraph-strytree-prd-tad.md',
        },
      ],
      elements: [],
      storytree: {
        storyId: 'forkcompare-story',
        title: 'ForkCompare story',
        tokenBalance: 40,
        generationCostCredits: 5,
        nodes: [
          {
            nodeId: 'root',
            title: 'Root branch',
            synopsis: 'Root branch.',
            prompt: 'Continue with a bounded candidate comparison.',
            status: 'active',
            isFreeWindow: true,
            likes: 1,
            impressions: 10,
            ownAssetIds: ['root-asset'],
          },
        ],
      },
    }, null, 2),
    '```',
  ].join('\n')
  const parsed = await loadGraphDataFromTextViaParser('forkcompare.strybldr.md', text, { applyToStore: false })
  assert(parsed?.graphData, 'expected ForkCompare graph')
  const root = (parsed.graphData.nodes || []).find(node => String(node.type || '') === 'StorytreeNode' && String(node.properties?.strytreeNodeId || '') === 'root')
  assert(root?.id, 'expected root branch')

  const compared = createStrytreeCandidateRunAction(parsed.graphData, root.id, { nowMs: 3000 })
  assert(compared.changed, 'expected candidate run action to mutate graph')
  const candidates = (compared.graphData.nodes || []).filter(node => String(node.type || '') === 'StorytreeCandidate')
  assert(candidates.length === 3, `expected bounded fan-out of 3 candidates, got ${candidates.length}`)
  assert(candidates.every(node => node.properties?.publishEligible === true), 'expected all deterministic candidates to be publish eligible')
  assert((compared.graphData.edges || []).filter(edge => edge.label === 'candidateOption').length === 3, 'expected candidate option edges from parent branch')
  const debitedSnapshot = (compared.graphData.nodes || []).find(node => String(node.type || '') === 'StorytreeSnapshot')
  assert(Number(debitedSnapshot?.properties?.tokenBalance || 0) === 25, `expected candidate run debit to update token balance, got ${String(debitedSnapshot?.properties?.tokenBalance || '')}`)

  const published = publishStrytreeCandidateAction(compared.graphData, String(candidates[0]?.id || ''), 4000)
  assert(published.changed, 'expected candidate publish action to mutate graph')
  const publishedChild = (published.graphData.nodes || []).find(node => String(node.type || '') === 'StorytreeNode' && String(node.properties?.selectedCandidateId || '') === String(candidates[0]?.properties?.strytreeCandidateId || ''))
  assert(publishedChild, 'expected selected candidate to become one durable Storytree child')
  assert((published.graphData.edges || []).some(edge => edge.source === root.id && edge.target === publishedChild.id && edge.label === 'parent_node_id'), 'expected published candidate edge to derive from parent_node_id')
  const nextCandidates = (published.graphData.nodes || []).filter(node => String(node.type || '') === 'StorytreeCandidate')
  assert(nextCandidates.filter(node => String(node.properties?.candidateStatus || '') === 'published').length === 1, 'expected exactly one candidate to publish')
  assert(nextCandidates.filter(node => String(node.properties?.candidateStatus || '') === 'rejected').length === 2, 'expected rejected candidates to remain private audit artifacts')
}

export function testStrybldrRendererModeUsesSharedSurfaceRegistry() {
  const renderConfigText = readSource('lib', 'config.render.ts')
  const canvasViewportText = readSource('components', 'CanvasViewport.tsx')
  const storyboardCanvasText = readSource('components', 'StoryboardCanvas.tsx')
  const canvasViewMenuText = readSource('components', 'toolbar', 'canvasViewMenu.ts')
  const uiCopyText = readSource('lib', 'config-copy', 'uiCopy.ts')
  const strybldrStoryboardText = readSource('features', 'strybldr', 'strybldrStoryboard.ts')
  const importPresetsText = readSource('features', 'markdown-workspace', 'workspaceImport', 'canvasPresets.ts')
  const rendererDocText = fs.readFileSync(path.resolve(process.cwd(), '..', 'docs/documents/agenticgraph-renderer-document.md'), 'utf8')
  const strybldrDocText = fs.readFileSync(path.resolve(process.cwd(), '..', 'docs/documents/agenticgraph-strybldr-prd-tad.md'), 'utf8')
  const floatingPanelText = readSource('lib', 'toolbar', 'ToolbarToolMenu.impl.tsx')
  const timelineVisibilityText = readSource('lib', 'timeline', 'timelineVisibility.ts')
  const timelineBottomPanelText = readSource('features', 'strybldr', 'StrybldrTimelineBottomPanel.tsx')
  const timelinePanelText = readSource('features', 'strybldr', 'StrybldrTimelinePanel.tsx')
  const storyboardTimelineText = readSource('components', 'StoryboardCanvas', 'storyboardTimeline.ts')
  const uiSliceInitialStateText = readSource('hooks', 'store', 'uiSliceInitialState.ts')
  const retiredRendererId = ['story', 'bldr'].join('')
  assert(resolveCanvas2dRendererId('strybldr') === undefined, 'expected Strybldr to be retired as a renderer id')
  assert(resolveCanvas2dRendererId(retiredRendererId) === undefined, 'expected no retired renderer remap')
  assert(resolveCanvas2dRendererId('storyboard') === 'storyboard', 'expected Storyboard to be the canonical Strybldr host renderer')
  const staleStorybldrText = ['story', 'bldr'].join('')
  for (const [label, text] of [
    ['renderer registry', renderConfigText],
    ['canvas view menu', canvasViewMenuText],
    ['ui copy', uiCopyText],
    ['strybldr markdown serializer', strybldrStoryboardText],
    ['workspace import presets', importPresetsText],
    ['renderer docs', rendererDocText],
    ['strybldr docs', strybldrDocText],
  ] as const) {
    assert(!new RegExp(staleStorybldrText, 'i').test(text), `expected ${label} to use storyboard, not stale storybldr naming`)
  }
  assert(!renderConfigText.includes('aliases:'), 'expected renderer registry to avoid per-renderer alias lists')
  assert(!renderConfigText.includes('CANVAS_2D_RENDERER_ID_BY_ALIAS'), 'expected renderer lookup to use canonical normalized tokens only')
  assert(getCanvas2dSurfaceId('storyboard') === 'storyboard', 'expected Storyboard to own the Strybldr-capable surface')
  assert(isStoryboardCanvas2dRenderer('storyboard'), 'expected shared Storyboard renderer helper to include Storyboard mode')
  assert(supportsToolbarRunAll('storyboard'), 'expected Storyboard to reuse Toolbar Run All without mounting a duplicate Strybldr panel')
  assert(!renderConfigText.includes("'strybldr',"), 'expected renderer registry to remove the Strybldr renderer id')
  assert(!renderConfigText.includes("registryLabel: 'Strybldr'"), 'expected renderer registry to remove the Strybldr renderer menu entry')
  assert(canvasViewportText.includes('StrybldrTimelineBottomPanelLazy'), 'expected Strybldr timeline to mount as the CanvasViewport bottom panel')
  assert(canvasViewportText.includes('workspaceEditorOverlayOpen={workspaceEditorOverlayOpen}'), 'expected Timeline bottom panel to receive Editor Workspace overlay state from CanvasViewport')
  assert(floatingPanelText.includes("floatingPanelView === 'timeline'"), 'expected Timeline to remain in the FloatingPanel view registry')
  assert(timelineVisibilityText.includes('TIMELINE_ENABLED_DEFAULT'), 'expected Timeline visibility default to live in shared timeline utils')
  assert(timelineVisibilityText.includes('shouldRenderTimelineSurface'), 'expected Timeline visibility gating to live in shared timeline utils')
  assert(timelineBottomPanelText.includes('HeaderActions'), 'expected Timeline bottom panel to reuse shared panel header actions')
  assert(timelineBottomPanelText.includes('onPinToggle={handlePinToggle}'), 'expected Timeline bottom panel to expose shared pin/unpin controls')
  assert(timelineBottomPanelText.includes('onMinimize={!minimized ? handleMinimize : undefined}'), 'expected Timeline bottom panel to reuse shared FloatingPanel minimize control')
  assert(timelineBottomPanelText.includes('onRestore={minimized ? handleRestore : undefined}'), 'expected Timeline bottom panel to reuse shared FloatingPanel restore control')
  assert(timelineBottomPanelText.includes('setTimelineEnabled(false)'), 'expected Timeline bottom panel close to update the shared Timeline setting')
  assert(timelineBottomPanelText.includes('beginOverlayPanelPositionDrag'), 'expected Timeline bottom panel drag to reuse the shared overlay panel drag utility')
  assert(timelineBottomPanelText.includes('UI_SELECTORS.draggablePanelIgnorePointerDown'), 'expected Timeline bottom panel drag to reuse shared no-drag heuristics')
  assert(timelineBottomPanelText.includes('data-kg-floating-panel-root="true"'), 'expected Timeline bottom panel to be excluded from FlowCanvas proxy-pan capture')
  assert(timelineBottomPanelText.includes('data-kg-strybldr-bottom-timeline-panel'), 'expected Timeline bottom panel to expose a bottom-panel marker')
  assert(timelineBottomPanelText.includes("import { WORKSPACE_LEFT_PANE_SELECTOR } from '@/lib/canvas/viewportMeasureElement'"), 'expected Timeline bottom panel to measure the shared Workspace left pane obstacle')
  assert(timelineBottomPanelText.includes('resolveWorkspaceCanvasLayerInsetLeft'), 'expected Timeline bottom panel to resolve canvas-only bounds from shared workspace geometry')
  assert(timelineBottomPanelText.includes('workspaceEditorOverlayOpen = false'), 'expected Timeline bottom panel to default workspace overlay bounds off')
  assert(timelineBottomPanelText.includes('data-kg-strybldr-bottom-timeline-root="canvas-viewport"'), 'expected Timeline bottom panel root to stay scoped to CanvasViewport')
  assert(timelineBottomPanelText.includes('data-kg-strybldr-bottom-timeline-layer="canvas-viewport"'), 'expected Timeline bottom panel layer to stay scoped to CanvasViewport')
  assert(timelineBottomPanelText.includes("className=\"absolute inset-0 z-[230] pointer-events-none\""), 'expected Timeline bottom panel layer to avoid fixed viewport overlay over Editor Workspace')
  assert(timelineBottomPanelText.includes("className=\"absolute inset-y-0 right-0 pointer-events-none\""), 'expected Timeline bottom panel bounds to occupy only the canvas-side strip when Editor Workspace is open')
  assert(timelineBottomPanelText.includes('style={layerStyle}'), 'expected Timeline bottom panel layer to apply measured workspace inset')
  assert(timelineBottomPanelText.includes("position: 'absolute' as const"), 'expected Timeline bottom panel geometry to be CanvasViewport-relative')
  assert(!timelineBottomPanelText.includes('className="fixed inset-0 z-[230] pointer-events-none"'), 'expected Timeline bottom panel to avoid viewport-fixed layer ownership')
  assert(timelinePanelText.includes('TimelineTransportChrome'), 'expected Strybldr timeline panel to reuse the shared timeline transport chrome')
  assert(timelinePanelText.includes('splitTimelineTransportCurrentTotalLabel'), 'expected Strybldr timeline panel to reuse shared current/total label splitting')
  assert(timelinePanelText.includes('resolveTimelineTransportPlayheadPercent'), 'expected Strybldr timeline panel to reuse shared transport playhead normalization')
  assert(timelinePanelText.includes('data-kg-timeline-transport-playhead-percent'), 'expected Strybldr timeline panel to expose shared playhead state without local chrome drift')
  assert(timelinePanelText.includes('useTimelineTransportPlayback'), 'expected Strybldr timeline panel to reuse the shared playback loop')
  assert(timelinePanelText.includes('buildStoryboardBoardModel'), 'expected Strybldr timeline panel to reuse the Storyboard board model')
  assert(timelinePanelText.includes('board.semanticKey'), 'expected Strybldr timeline state to reset from the shared Storyboard semantic key')
  assert(timelinePanelText.includes('const hasSelectedTimelineItem = React.useMemo(() => {'), 'expected Strybldr timeline selection sync to detect when the active selection is not part of the timeline')
  assert(timelinePanelText.includes('if (selectedNodeId && !hasSelectedTimelineItem) return'), 'expected Strybldr timeline not to overwrite non-timeline selections such as Rich Media panels')
  assert(!timelinePanelText.includes('type="range"'), 'expected Strybldr timeline panel to avoid a local range input duplicate')
  assert(storyboardTimelineText.includes('buildStoryboardTimelineItems'), 'expected Storyboard timeline projection to live in a shared helper')
  assert(storyboardTimelineText.includes('resolveStoryboardTimelineIndex'), 'expected Strybldr selection to use shared timeline index semantics')
  assert(storyboardCanvasText.includes('toggleStrytreeLikeAction'), 'expected Strytree like parity to stay in the existing Storyboard surface')
  assert(storyboardCanvasText.includes('unlockStrytreeNodeAction'), 'expected Strytree unlock parity to stay in the existing Storyboard surface')
  assert(storyboardCanvasText.includes('createStrytreeContinuationDraftAction'), 'expected Strytree continuation parity to stay in the existing Storyboard surface')
  assert(storyboardCanvasText.includes('Storytree filter'), 'expected Strytree status filtering to stay in the existing Storyboard lane header')
  assert(storyboardCanvasText.includes('StorytreeEdgeConnector'), 'expected Storytree parent-child edge rendering to stay in the existing Storyboard surface')
  assert(storyboardCanvasText.includes('storytreeIncomingEdgeByCardId'), 'expected Storytree edge rendering to use active graph edges, not card hardcodes')
  assert(storyboardCanvasText.includes('data-kg-storytree-edge'), 'expected Storytree edge rendering to expose a validation marker')
  assert(storyboardCanvasText.includes('data-kg-storyboard-canvas-edge-layer'), 'expected Storyboard canvas to render visible graph edge layer between cards')
  assert(storyboardCanvasText.includes('candidateOption'), 'expected ForkCompare candidate option edges to use graph edges, not card hardcodes')
  assert(storyboardCanvasText.includes('ForkCompare scorecard'), 'expected ForkCompare scorecards to render in the existing Storyboard surface')
  assert(storyboardCanvasText.includes('createStrytreeCandidateRunAction'), 'expected ForkCompare fan-out action to stay in the Storyboard surface')
  assert(storyboardCanvasText.includes('publishStrytreeCandidateAction'), 'expected ForkCompare publish action to stay in the Storyboard surface')
  const xrCameraFramingPath = path.resolve(process.cwd(), 'src', 'features', 'three', 'XrCameraFramingSection.tsx')
  const strybldrCameraFloatingPanelText = readSource('features', 'strybldr', 'StrybldrCameraFloatingPanelView.tsx')
  const strybldrCameraFramingText = readSource('features', 'strybldr', 'StrybldrCameraFramingSection.tsx')
  const strybldrCameraPanelText = readSource('features', 'strybldr', 'StrybldrCameraPanel.tsx')
  const strybldrCameraModelText = readSource('features', 'strybldr', 'strybldrCamera.ts')
  const cameraOrbitSphereText = readSource('lib', 'camera', 'orbitSphere.ts')
  assert(storyboardCanvasText.includes('Storytree filters'), 'expected Strytree filters to stay in the Storyboard surface')
  assert(storyboardCanvasText.includes('ForkCompare candidates'), 'expected ForkCompare candidate run to stay in the Storyboard surface')
  assert(!fs.existsSync(path.resolve(process.cwd(), 'src', 'features', 'strybldr', 'StrybldrFloatingPanelView.tsx')), 'expected duplicate Strybldr FloatingPanel to be removed')
  assert(strybldrCameraFloatingPanelText.includes('aria-label="Camera panel"') && strybldrCameraFloatingPanelText.includes('StrybldrCameraFramingSection'), 'expected FloatingPanel Camera to mount the shared camera framing owner')
  assert(!fs.existsSync(xrCameraFramingPath), 'expected the duplicate FloatingPanel XR Camera projection to be removed')
  for (const ownerToken of ['buildStoryboardBoardModel', 'updateNode', 'STRYBLDR_CAMERA_PROPERTY_KEY', 'serializeStrybldrCameraSettings']) assert(!strybldrCameraFloatingPanelText.includes(ownerToken) && strybldrCameraFramingText.includes(ownerToken), `expected only the canonical Camera framing section to own ${ownerToken}`)
  assert(strybldrCameraFramingText.includes('StrybldrCameraPanel') && strybldrCameraFramingText.includes('PanelSelect'), 'expected the shared camera framing section to own card selection and the Strybldr metadata editor')
  assert(strybldrCameraModelText.includes('Left Side') && strybldrCameraModelText.includes('Right Side') && strybldrCameraModelText.includes('Eye Level') && strybldrCameraModelText.includes('Wide') && strybldrCameraModelText.includes('Medium') && strybldrCameraModelText.includes('Close-up'), 'expected Camera model to own side, eye-level, and shot-size labels')
  assert(strybldrCameraModelText.includes('resolveStrybldrCameraOrbit') && strybldrCameraModelText.includes('orbitX') && strybldrCameraModelText.includes('orbitY'), 'expected Camera model to own reusable orbit-to-label mapping')
  assert(strybldrCameraPanelText.includes('Strybldr camera orbit sphere') && strybldrCameraPanelText.includes('onPointerDown') && strybldrCameraPanelText.includes('setPointerCapture') && strybldrCameraPanelText.includes('onPointerMove'), 'expected Camera preview to support dragging the camera around the sphere')
  assert(strybldrCameraPanelText.includes('role="tablist"') && strybldrCameraPanelText.includes('role="tab"') && strybldrCameraPanelText.includes('aria-selected={selected}') && strybldrCameraPanelText.includes('data-kg-strybldr-camera-shot-tabs'), 'expected Camera Wide/Medium/Close-up control to use Boords-like tab semantics')
  assert(strybldrCameraPanelText.includes('data-kg-strybldr-camera-selected-overlay="1"') && strybldrCameraPanelText.includes('clipPath: `inset(0 ${rightClipPercent}% 0 ${leftClipPercent}% round 6px)`') && strybldrCameraPanelText.includes("transition: 'clip-path 150ms ease-out'"), 'expected Camera shot-size selected state to use a clipped overlay highlight')
  assert(strybldrCameraPanelText.includes('STRYBLDR_CAMERA_SHOT_FRAMES') && strybldrCameraPanelText.includes('x: 99.25') && strybldrCameraPanelText.includes('y: 97.078125') && strybldrCameraPanelText.includes('width: 81.5') && strybldrCameraPanelText.includes('height: 45.84375'), 'expected Camera Medium shot to own the Boords-like SVG image frame geometry')
  assert(strybldrCameraPanelText.includes('data-kg-strybldr-camera-shot-frame={shot}') && strybldrCameraPanelText.includes('shot={settings.shot}') && !strybldrCameraPanelText.includes('const STRYBLDR_CAMERA_FRAME ='), 'expected controlled Camera shot-size selection to drive the sphere image frame without a stale fixed frame constant')
  assert(!strybldrCameraPanelText.includes('text-type-subdued') && !strybldrCameraPanelText.includes('bg-surface-add_frame') && !strybldrCameraPanelText.includes('bg-surface-light'), 'expected Camera shot-size parity to stay repo-native without copying Boords class names')
  assert(strybldrCameraPanelText.includes('STRYBLDR_CAMERA_HANDLE_BODY_RECT') && strybldrCameraPanelText.includes('isPointOnStrybldrCameraHandle') && strybldrCameraPanelText.indexOf('if (!isPointOnStrybldrCameraHandle(point, settings)) return') < strybldrCameraPanelText.indexOf('event.currentTarget.setPointerCapture(event.pointerId)'), 'expected controlled Camera dragging to start from the black camera handle rather than whole-sphere click repositioning')
  assert(strybldrCameraPanelText.includes('dragOffsetRef') && strybldrCameraPanelText.includes('point.x - pose.cameraX') && strybldrCameraPanelText.includes('resolveCameraOrbitSphereGridPointFromRenderedPoint') && !strybldrCameraPanelText.includes('Math.min(rect.width, rect.height) * 0.42'), 'expected Camera drag math to preserve the handle offset and resolve from rendered degree-grid points instead of stale DOM-radius pointer mapping')
  assert(strybldrCameraPanelText.indexOf('if (draggingCamera) setSettingsFromPreviewPoint(event.clientX, event.clientY)') < strybldrCameraPanelText.indexOf('dragOffsetRef.current = { x: 0, y: 0 }'), 'expected controlled Camera pointer-up to publish the final rendered degree-grid target before clearing drag state')
  assert(cameraOrbitSphereText.includes('Math.atan2(ray.rayLookTargetY - cameraPoint.cameraY, ray.rayLookTargetX - cameraPoint.cameraX) * 180 / Math.PI'), 'expected Camera glyph rotation to point from the degree-grid camera handle toward the storyboard frame center')
  assert(strybldrCameraPanelText.includes('data-kg-strybldr-camera-handle-body="1"') && strybldrCameraPanelText.includes('x: -7') && strybldrCameraPanelText.includes('width: 11') && strybldrCameraPanelText.includes('radius: 1.5'), 'expected Camera body handle to preserve the Boords-like black rect geometry')
  assert(strybldrCameraPanelText.includes('StrybldrCameraSphereGraphic') && strybldrCameraPanelText.includes('viewBox="0 0 280 240"') && strybldrCameraPanelText.includes('<linearGradient') && strybldrCameraPanelText.includes('<polygon') && strybldrCameraPanelText.includes('active:cursor-grabbing'), 'expected Camera preview to render a Boords-like 3D sphere grid with camera ray fidelity, not a flat 2D circle')
  assert(!strybldrCameraPanelText.includes('<clipPath') && strybldrCameraPanelText.indexOf('<image') < strybldrCameraPanelText.indexOf('<polygon'), 'expected Camera SVG child ordering to mirror the live Boords reference without stale clip-path layering')
  assert(strybldrCameraPanelText.includes("from '@/lib/camera/orbitSphere'") && cameraOrbitSphereText.includes('resolveCameraOrbitFrameAwarePoint') && cameraOrbitSphereText.includes('isPointWithinCameraOrbitRect({ x: cameraPoint.cameraX, y: cameraPoint.cameraY }, frame)') && strybldrCameraPanelText.includes('clearance: STRYBLDR_CAMERA_HANDLE_BODY_RECT.height * 0.36') && cameraOrbitSphereText.includes('rotation: Math.atan2(ray.rayLookTargetY - cameraPoint.cameraY, ray.rayLookTargetX - cameraPoint.cameraX) * 180 / Math.PI') && !strybldrCameraPanelText.includes('STRYBLDR_CAMERA_FRONT_EYE_LEVEL_CAMERA_POINT') && !strybldrCameraPanelText.includes('STRYBLDR_CAMERA_FRONT_EYE_LEVEL_CAMERA_POSE'), 'expected Camera handle point to be frame-aware from shared degree-grid geometry without a front eye-level hardcode')
  assert(cameraOrbitSphereText.includes('resolveCameraOrbitFrameRay') && cameraOrbitSphereText.includes('resolveCameraOrbitFrameRayTarget(cameraPoint, frame, options.projection)') && cameraOrbitSphereText.includes('resolveCameraOrbitFrameRayDirection') && cameraOrbitSphereText.includes('orbitVectorZ * depthPitchRatio') && cameraOrbitSphereText.includes('resolveCameraOrbitFrameRayFootprint') && cameraOrbitSphereText.includes('rayEdgeStartX') && cameraOrbitSphereText.includes('rayEdgeEndY') && !cameraOrbitSphereText.includes('resolveCameraOrbitFrameEdgePoints'), 'expected Camera ray to target the storyboard frame from shared 3D orbit-vector geometry with a clamped polygon footprint')
  assert(cameraOrbitSphereText.includes('resolveCameraOrbitSmoothPath') && cameraOrbitSphereText.includes('pathD: resolveCameraOrbitSmoothPath(meridianPoints)') && cameraOrbitSphereText.includes('const vector = resolveCameraOrbitSphereVectorFromGridPoint(gridPoint)') && cameraOrbitSphereText.includes('cameraX: config.centerX + latitudeGeometry.rx * Math.sin(longitudeRadians)') && cameraOrbitSphereText.includes('cameraY: latitudeGeometry.cy + latitudeGeometry.ry * Math.cos(longitudeRadians)') && !cameraOrbitSphereText.includes('Math.sqrt(Math.max(0, 1 - yProgress ** 2))'), 'expected Camera meridians, handle positions, and ray vectors to share the tuned degree-grid latitude ellipse intersections')
  assert(strybldrCameraPanelText.includes('STRYBLDR_CAMERA_SPHERE_LATITUDE_ROWS') && strybldrCameraPanelText.includes('STRYBLDR_CAMERA_SPHERE_LATITUDE_DEGREES = [-90, -45, 0, 45, 90]') && strybldrCameraPanelText.includes('resolveCameraOrbitSphereGridHighlight(STRYBLDR_CAMERA_ORBIT_SPHERE_CONFIG, orbitX, orbitY)') && strybldrCameraPanelText.includes('data-kg-strybldr-camera-grid-latitude={row.degree}') && strybldrCameraPanelText.includes("data-kg-strybldr-camera-grid-active={active ? '1' : undefined}"), 'expected Camera sphere grid to preserve the tuned five-band latitude geometry with degree-based highlight behavior')
  assert(strybldrCameraPanelText.includes('STRYBLDR_CAMERA_SPHERE_ACTIVE_STROKE_OPACITY') && strybldrCameraPanelText.includes('activeLatitudeGeometry') && strybldrCameraPanelText.includes('data-kg-strybldr-camera-grid-active-latitude={activeLatitudeGeometry.degree}') && !strybldrCameraPanelText.includes('cx="140" cy="120" rx="82" ry="16.400000000000002" opacity="0.58"'), 'expected Camera sphere highlight overlay to follow the active latitude degree instead of hardcoding the center row')
  assert(strybldrCameraPanelText.includes('STRYBLDR_CAMERA_SPHERE_LONGITUDE_DEGREES = [0, 45, 90, 135, 180, 225, 270, 315]') && strybldrCameraPanelText.includes('STRYBLDR_CAMERA_ORBIT_LONGITUDE_SPAN_DEGREES = 180') && cameraOrbitSphereText.includes('resolveCameraOrbitSphereGridPoints') && strybldrCameraPanelText.includes('resolveCameraOrbitSphereGridMeridianGeometry(STRYBLDR_CAMERA_ORBIT_SPHERE_CONFIG, longitude)') && cameraOrbitSphereText.includes('resolveCameraOrbitSpherePointFromGridPoint(config, gridPoint)') && strybldrCameraPanelText.includes('resolveCameraOrbitSphereOrbitFromGridPoint(STRYBLDR_CAMERA_ORBIT_SPHERE_CONFIG, gridPoint)') && cameraOrbitSphereText.includes('normalizeCameraOrbitDegrees(orbitX * config.longitudeSpanDegrees)') && cameraOrbitSphereText.includes('signedLongitude / config.longitudeSpanDegrees') && cameraOrbitSphereText.includes('sweepFlag: normalizedLongitude > 180 ? 0 : 1') && strybldrCameraPanelText.includes('data-kg-strybldr-camera-grid-longitude={longitude}') && strybldrCameraPanelText.includes('data-kg-strybldr-camera-grid-active-meridian={activeMeridianGeometry.longitude}') && strybldrCameraPanelText.includes('STRYBLDR_CAMERA_SPHERE_ACTIVE_MERIDIAN_OPACITY') && !strybldrCameraPanelText.includes('normalizeStrybldrCameraDegrees(orbitX * 90)') && !strybldrCameraPanelText.includes('<line x1="140" y1="38" x2="140" y2="202" opacity="0.68"'), 'expected Camera active meridian highlight and draggable handle to round-trip the full degree-grid longitude span from shared geometry')
  assert(strybldrCameraPanelText.includes('aria-label="Strybldr camera preview"') && !strybldrCameraPanelText.includes("cn('rounded-md border p-2'") && !strybldrCameraPanelText.includes('<span className={UI_THEME_TOKENS.text.tertiary}>Camera</span>'), 'expected Camera preview wrapper to avoid a duplicate inner frame and duplicate Camera angle heading around the orbit sphere')
  assert(strybldrCameraPanelText.includes('<image') && strybldrCameraPanelText.includes('xlinkHref={previewImageUrl}') && strybldrCameraPanelText.includes('preserveAspectRatio="xMidYMid slice"'), 'expected Camera sphere frame to render the selected storyboard card preview image via SVG image semantics')
  assert(strybldrCameraFramingText.includes('media?.thumbnailUrl') && strybldrCameraFramingText.includes("reference.kind === 'image'"), 'expected the canonical Camera owner to source preview images from storyboard media and image references')
  assert(strybldrCameraPanelText.includes('Add a note (optional)') && strybldrCameraPanelText.includes('Reframe') && strybldrCameraPanelText.includes('data-kg-strybldr-camera-panel="1"'), 'expected Camera panel to expose note and Reframe controls with a validation marker')
  assert(strybldrCameraModelText.includes("STRYBLDR_CAMERA_PROPERTY_KEY = 'strybldrCamera'") && strybldrStoryboardText.includes('buildStrybldrCameraHandoffLine'), 'expected Camera metadata to stay graph-owned and feed the Strybldr video handoff compiler')
  const draggedCameraOrbit = resolveStrybldrCameraOrbit(-0.66, -0.44)
  assert(draggedCameraOrbit.angle === 'left-side' && draggedCameraOrbit.level === 'high-angle' && draggedCameraOrbit.orbitX === -0.66 && draggedCameraOrbit.orbitY === -0.44, 'expected Camera orbit drag to resolve left-side high-angle framing')
  const rightCameraSettings = readStrybldrCameraSettings({ angle: 'right-side', level: 'low-angle', shot: 'medium' })
  assert(rightCameraSettings.orbitX === 0.25 && rightCameraSettings.orbitY === 0.5, 'expected saved right-side low-angle settings to hydrate onto the 45-degree longitude grid')
  const testCameraOrbitConfig: CameraOrbitSphereConfig<0 | 45 | 90 | 135 | 180 | 225 | 270 | 315, -90 | -45 | 0 | 45 | 90> = {
    centerX: 140,
    centerY: 120,
    radius: 82,
    longitudeSpanDegrees: 180,
    longitudeDegrees: [0, 45, 90, 135, 180, 225, 270, 315],
    latitudeDegrees: [-90, -45, 0, 45, 90],
    latitudeRows: [
      { degree: -90, key: 'bottom-pole', cy: 187.53994388482693, rx: 43.4533796671228, ry: 8.690675933424561 },
      { degree: -45, key: 'bottom', cy: 161, rx: 71.01408311032398, ry: 14.202816622064796 },
      { degree: 0, key: 'equator', cy: 120, rx: 82, ry: 16.400000000000002 },
      { degree: 45, key: 'upper', cy: 80.25, rx: 71.01408311032398, ry: 14.202816622064796 },
      { degree: 90, key: 'top', cy: 52.460056115173074, rx: 43.4533796671228, ry: 8.690675933424561 },
    ],
  }
  const frontEyeLevelPoint = resolveCameraOrbitSpherePointFromGridPoint(testCameraOrbitConfig, { longitude: 0, latitude: 0 })
  assert(Math.abs(frontEyeLevelPoint.cameraX - 140) < 0.001 && Math.abs(frontEyeLevelPoint.cameraY - 136.4) < 0.001, 'expected front eye-level camera point to intersect the equator latitude ellipse at longitude zero')
  assert(Math.abs(frontEyeLevelPoint.orbitVectorX) < 0.001 && Math.abs(frontEyeLevelPoint.orbitVectorY) < 0.001 && Math.abs(frontEyeLevelPoint.orbitVectorZ - 1) < 0.001, 'expected front eye-level ray vector to keep the camera on the 3D meridian origin')
  const rightLowAnglePoint = resolveCameraOrbitSpherePointFromGridPoint(testCameraOrbitConfig, { longitude: 45, latitude: -45 })
  assert(Math.abs(rightLowAnglePoint.cameraX - 190.214) < 0.001 && Math.abs(rightLowAnglePoint.cameraY - 171.043) < 0.001, 'expected diagonal camera point to intersect both longitude 45 and latitude -45 without row-center offset')
  assert(Math.abs(rightLowAnglePoint.orbitVectorX - 0.5) < 0.001 && Math.abs(rightLowAnglePoint.orbitVectorY + 0.707) < 0.001 && Math.abs(rightLowAnglePoint.orbitVectorZ - 0.5) < 0.001, 'expected diagonal ray vector to preserve longitude, latitude, and depth instead of reusing the flat SVG offset')
  const rightMeridian = resolveCameraOrbitSphereGridMeridianGeometry(testCameraOrbitConfig, 45)
  assert(rightMeridian.kind === 'curve' && rightMeridian.pathD.includes(`${rightLowAnglePoint.cameraX.toFixed(3)} ${rightLowAnglePoint.cameraY.toFixed(3)}`), 'expected active meridian curve to pass through the rendered diagonal latitude intersection')
  const mediumFrame = { x: 99.25, y: 97.078125, width: 81.5, height: 45.84375 }
  const frontEyeLevelRay = resolveCameraOrbitFrameRay(frontEyeLevelPoint, mediumFrame)
  const frontRayWidth = frontEyeLevelRay.rayEdgeEndX - frontEyeLevelRay.rayEdgeStartX
  assert(Math.abs(frontEyeLevelRay.rayTargetX - 140) < 0.001 && Math.abs(frontEyeLevelRay.rayTargetY - (mediumFrame.y + mediumFrame.height)) < 0.001 && frontRayWidth > mediumFrame.width * 0.4 && frontRayWidth < mediumFrame.width * 0.5, 'expected meridian-zero ray polygon to stay centered and clamped instead of spanning the full frame edge')
  const rightLowRay = resolveCameraOrbitFrameRay(rightLowAnglePoint, mediumFrame)
  assert(rightLowRay.rayTargetX > 152 && rightLowRay.rayTargetX < 153 && Math.abs(rightLowRay.rayTargetY - (mediumFrame.y + mediumFrame.height)) < 0.001, 'expected lower-right diagonal ray to intersect the bottom frame edge from the shared 3D longitude-latitude vector')
  const leftHighAnglePoint = resolveCameraOrbitSpherePointFromGridPoint(testCameraOrbitConfig, { longitude: 315, latitude: 45 })
  const leftHighRay = resolveCameraOrbitFrameRay(leftHighAnglePoint, mediumFrame)
  assert(leftHighRay.rayTargetX > 116 && leftHighRay.rayTargetX < 117 && Math.abs(leftHighRay.rayTargetY - mediumFrame.y) < 0.001 && Math.abs(leftHighRay.rayEdgeStartY - mediumFrame.y) < 0.001 && Math.abs(leftHighRay.rayEdgeEndY - mediumFrame.y) < 0.001, 'expected upper-left diagonal ray polygon to intersect the top frame edge from the shared 3D longitude-latitude vector')
}

export function testStrybldrImportImageAndStoryboardOwnersAreWired() {
  const launchText = readSource('lib', 'toolbar', 'LaunchDropdown.impl.tsx')
  const bridgeText = readSource('features', 'markdown-explorer', 'workspaceActionBridge.ts')
  const actionsText = readSource('features', 'markdown-workspace', 'useWorkspaceFileActions', 'importActions.ts')
  const canvasPresetsText = readSource('features', 'markdown-workspace', 'workspaceImport', 'canvasPresets.ts')
  const urlImportText = readSource('features', 'markdown-workspace', 'workspaceImport', 'urlImport.ts')
  const floatingPanelText = readSource('lib', 'toolbar', 'ToolbarToolMenu.impl.tsx')
  const fallbackText = readSource('features', 'toolbar', 'launchDropdownFallbacks.ts')
  const imageBridgeText = readSource('lib', 'toolbar', 'launchImageImportBridge.ts')

  assert(launchText.includes('Import Image'), 'expected Launch dropdown to expose Import Image')
  assert(launchText.includes('importLocalImages'), 'expected Launch dropdown to use the workspace image import bridge')
  assert(launchText.includes('importLocalImagesWithWorkspaceBridgeRetry'), 'expected Launch dropdown to reuse the image-import bridge retry helper')
  assert(imageBridgeText.includes("setWorkspaceViewMode('editor')"), 'expected Launch image import to mount Workspace before retrying the workspace bridge')
  assert(imageBridgeText.includes('launch:import:localImages:bridge'), 'expected Launch image import to surface a bridge retry warning only after workspace-open retry fails')
  assert(bridgeText.includes('importLocalImages'), 'expected workspace action bridge to expose image import')
  assert(actionsText.includes('buildStrybldrStoryboardDocument'), 'expected image import to generate Strybldr storyboard document through the feature owner')
  assert(actionsText.includes('activateStrybldrImportSurface'), 'expected image import to switch to Storyboard mode through the shared import-surface owner')
  assert(actionsText.includes('storyPath || createdPath'), 'expected image import focus to land on the generated Strybldr artifact, not a raw image source file')
  assert(canvasPresetsText.includes("'storyboard'"), 'expected Import URL renderer presets to expose Storyboard without a Strybldr renderer alias')
  assert(!canvasPresetsText.includes("'strybldr'"), 'expected Import URL renderer presets to remove the Strybldr renderer option')
  assert(urlImportText.includes("args.canvas2dRenderer === 'storyboard'"), 'expected URL import to create Strybldr storyboard documents through the workspace import owner')
  assert(actionsText.includes("selectedCanvas2dRenderer === 'storyboard'"), 'expected renderer-selected URL import to activate the Strybldr surface')
  assert(!fallbackText.includes(`importLocalImages${'Fallback'}`), 'expected no duplicate image import fallback outside workspace owner')
  assert(!floatingPanelText.includes('StrybldrFloatingPanelView'), 'expected Floating Panel registry to remove the duplicate Strybldr owner view')
  assert(!floatingPanelText.includes("view: 'strybldr'"), 'expected Floating Panel view registry to omit Strybldr')
  assert(actionsText.includes('registerStrybldrImageFiles'), 'expected image import to register selected image Files for same-session local analysis')
  assert(readSource('components', 'Toolbar.tsx').includes('supportsToolbarRunAll'), 'expected toolbar Run All support to use the shared renderer helper')
  assert(readSource('components', 'Toolbar.tsx').includes('createStrybldrLocalVideoArtifactFromGraphData'), 'expected Toolbar Run All to create the local Strybldr video-agent handoff directly')
  assert(!readSource('components', 'Toolbar.tsx').includes('getToolbarRunAllFloatingPanelTab'), 'expected Toolbar Run All not to route through a Strybldr FloatingPanel helper')
  assert(!readSource('components', 'Toolbar.tsx').includes("setFloatingPanelView(runAllFloatingPanelTab)"), 'expected Toolbar Run All not to mount a floating panel for Storyboard execution')
}

export function testStrybldrPanelCanvasSelectionKeepsNonStorytreeCardsSelectable() {
  const storyboardCanvasText = readSource('components', 'StoryboardCanvas.tsx')
  assert(storyboardCanvasText.includes('visibleLanes'), 'expected Source/Storyboard card selection to stay in the Storyboard canvas owner')
  assert(!storyboardCanvasText.includes("const elementCards = cards.filter(card => card.lane === 'Elements')"), 'expected Storyboard canvas card selection to avoid an Elements-only selection gate')
  assert(!fs.existsSync(path.resolve(process.cwd(), 'src', 'features', 'strybldr', 'StrybldrFloatingPanelView.tsx')), 'expected Strybldr panel selection fork to be removed')
}

export async function testStrybldrVideoHandoffReusesBytePlusOwnerWithFallbackArtifact() {
  const doc = buildStrybldrStoryboardDocument({
    createdAtMs: 1,
    sourceUnits: [
      {
        id: 'corpus-source-video',
        workspacePath: '/reference.png.source.md',
        relativePath: 'reference.png',
        originalName: 'reference.png',
        mediaKind: 'image',
        mimeHint: 'image/png',
        byteSize: 256,
        textHash: 'def456',
        status: 'unsupported',
        provenance: { importMode: 'file', importedAtMs: 1 },
      },
    ],
    elements: [
      {
        id: 'approved-card',
        sourceUnitId: 'corpus-source-video',
        label: 'Hero product',
        confidence: 0.9,
        sourceBox: { xmin: 0.2, ymin: 0.2, xmax: 0.8, ymax: 0.8, unit: 'percentage' },
        evidenceKind: 'user-edit',
        provider: 'fallback',
        order: 2,
        summary: 'Approved edited product card.',
        action: 'Pan in slowly.',
        prompt: 'Create a premium product reveal.',
      },
    ],
  })
  const parsed = await loadGraphDataFromTextViaParser('reference.strybldr.md', serializeStrybldrStoryboardMarkdown(doc), { applyToStore: false })
  const graphWithCamera = parsed?.graphData
    ? {
      ...parsed.graphData,
      nodes: (parsed.graphData.nodes || []).map(node => node.id === 'approved-card'
        ? {
          ...node,
          properties: {
            ...(node.properties || {}),
            [STRYBLDR_CAMERA_PROPERTY_KEY]: serializeStrybldrCameraSettings({
              angle: 'front',
              level: 'eye-level',
              shot: 'close-up',
              note: 'Keep lens stable.',
            }),
          },
        }
        : node),
    }
    : null
  const handoff = buildStrybldrVideoHandoffFromGraphData(graphWithCamera)
  const markdown = buildStrybldrVideoHandoffMarkdown({
    handoff,
    status: 'fallback',
    provider: 'byteplus-modelark',
    errorReason: 'test fallback',
    elapsedMs: 42,
    paidCallCount: 0,
  })
  assert(handoff.prompt.includes('Approved edited product card.'), 'expected handoff prompt to read updated graph card text')
  assert(handoff.prompt.includes('Camera: Front · Eye Level · Close-up · Keep lens stable.'), 'expected handoff prompt to include saved Strybldr camera metadata')
  assert(handoff.cards.some(card => card.camera === 'Camera: Front · Eye Level · Close-up · Keep lens stable.'), 'expected handoff card to preserve camera settings as data')
  assert(handoff.cards.some(card => card.sourceUnitId === 'corpus-source-video'), 'expected handoff cards to preserve source-unit provenance')
  assert(markdown.includes('kgStrybldrVideoHandoff: true'), 'expected fallback artifact frontmatter')
  assert(markdown.includes('paidCallCount: 0'), 'expected handoff cost evidence')
  const handoffArtifactText = readSource('features', 'strybldr', 'strybldrVideoHandoffArtifact.ts')
  assert(handoffArtifactText.includes('publishGeneratedWorkspaceEntriesToAgenticGraphStorage'), 'expected generated Strybldr handoff artifacts to publish through the shared storage helper when runtime sync is enabled')
  assert(handoffArtifactText.includes('readAgenticGraphStorageRuntimeSyncEnabled'), 'expected generated Strybldr handoff storage publication to stay runtime-sync gated')
  assert(handoffArtifactText.includes('createStrybldrLocalVideoArtifactFromGraphData'), 'expected Toolbar Run All to use the shared local video-agent artifact helper')
  assert(handoffArtifactText.includes('notifyWorkspaceFsChanged'), 'expected Strybldr handoff artifacts to refresh Source Files')
  assert(handoffArtifactText.includes('buildStrybldrVideoHandoffMarkdown'), 'expected Strybldr artifact helper to write structured fallback artifacts')
  assert(!fs.existsSync(path.resolve(process.cwd(), 'src', 'features', 'strybldr', 'StrybldrFloatingPanelView.tsx')), 'expected deleted FloatingPanel not to own video handoff generation')

  const twoSourceDoc = buildStrybldrStoryboardDocument({
    createdAtMs: 1,
    sourceUnits: [
      {
        id: 'corpus-source-merge-a',
        workspacePath: '/merge-a.png.source.md',
        relativePath: 'merge-a.png',
        originalName: 'merge-a.png',
        mediaKind: 'image',
        mimeHint: 'image/png',
        byteSize: 128,
        textHash: 'merge-a',
        status: 'unsupported',
        provenance: { importMode: 'file', importedAtMs: 1 },
      },
      {
        id: 'corpus-source-merge-b',
        workspacePath: '/merge-b.png.source.md',
        relativePath: 'merge-b.png',
        originalName: 'merge-b.png',
        mediaKind: 'image',
        mimeHint: 'image/png',
        byteSize: 128,
        textHash: 'merge-b',
        status: 'unsupported',
        provenance: { importMode: 'file', importedAtMs: 1 },
      },
    ],
  })
  const twoSourceParsed = await loadGraphDataFromTextViaParser('merge.strybldr.md', serializeStrybldrStoryboardMarkdown(twoSourceDoc), { applyToStore: false })
  assert(twoSourceParsed?.graphData, 'expected two-source Strybldr graph for merge regression')
  const merged = mergeStrybldrElementsIntoGraphData({
    graphData: twoSourceParsed.graphData,
    elements: [
      {
        id: 'merge-detected-a',
        sourceUnitId: 'corpus-source-merge-a',
        label: 'Detected cart',
        confidence: 0.8,
        sourceBox: { xmin: 0.1, ymin: 0.2, xmax: 0.5, ymax: 0.6, unit: 'percentage' },
        evidenceKind: 'local-object-detection',
        provider: 'transformers-detr',
        order: 2,
        summary: 'Detected cart from local analysis.',
        action: 'Animate the cart.',
        prompt: 'Move the cart through the frame.',
      },
    ],
  })
  const mergedElementNodes = (merged.nodes || []).filter(node => String(node.type || '') === 'StoryboardElement')
  assert(mergedElementNodes.some(node => String(node.properties?.strybldrSourceUnitId || '') === 'corpus-source-merge-a' && String(node.properties?.evidenceKind || '') === 'local-object-detection'), 'expected analyzed source to receive local detection cards')
  assert(mergedElementNodes.some(node => String(node.properties?.strybldrSourceUnitId || '') === 'corpus-source-merge-b' && String(node.properties?.evidenceKind || '') === 'source-metadata'), 'expected local analysis merge to preserve fallback cards for un-analyzed sources')
}

export async function testStrybldrVideoHandoffKeepsProviderBackedRecreationReachable() {
  const renderUrl = '/__chat_asset_proxy/strybldr-generated-video.mp4'
  const sourceUrl = ['https://assets.example.test', '/strybldr-generated-video.mp4'].join('')
  const generatedMarkdown = buildStrybldrVideoHandoffMarkdown({
    handoff: {
      prompt: 'Create one approved generated video.',
      referenceImageUrl: null,
      cards: [
        {
          id: 'generated-card',
          lane: 'Elements',
          title: 'Generated card',
          summary: 'Approved generated summary.',
          action: 'Render the edited beat.',
          prompt: 'Use the approved card fields.',
          camera: '',
          references: [],
          order: 1,
          sourceUnitId: 'generated-source',
        },
      ],
    },
    status: 'generated',
    provider: 'byteplus-modelark',
    model: 'video-model',
    renderUrl,
    sourceUrl,
    elapsedMs: 1234,
    paidCallCount: 1,
    cacheHit: false,
  })
  const artifactText = readSource('features', 'strybldr', 'strybldrVideoHandoffArtifact.ts')
  assert(artifactText.includes("provider: 'agenticgraph-local-animatic'"), 'expected unconfigured Strybldr runs to generate a local animatic instead of a fallback-only handoff')
  assert(artifactText.includes("model: 'strybldr-local-animatic-v1'"), 'expected local Strybldr animatic generation to expose a stable model label')
  assert(artifactText.includes('buildVideoAgentPipeline'), 'expected local video handoff to include a provider-neutral video-agent analysis packet')
  assert(generatedMarkdown.includes('status: "generated"'), 'expected generated handoff markdown status')
  assert(generatedMarkdown.includes(`renderUrl: "${renderUrl}"`), 'expected generated handoff markdown to expose the render URL')
  assert(generatedMarkdown.includes(`sourceUrl: "${sourceUrl}"`), 'expected generated handoff markdown to preserve the source URL')
  assert(generatedMarkdown.includes('paidCallCount: 1'), 'expected generated handoff markdown to record paid call count')
  assert(generatedMarkdown.includes('## Video'), 'expected generated handoff markdown to include a playable video body')
  assert(generatedMarkdown.includes(`<video controls playsinline src="${renderUrl}"`), 'expected generated handoff markdown to render the shared proxied video URL')
  assert(!generatedMarkdown.includes('errorReason:'), 'expected generated handoff markdown not to carry a fallback error reason')

  const copiedMarkdown = buildStrybldrVideoHandoffMarkdown({
    handoff: {
      prompt: 'Copy one approved source video.',
      referenceImageUrl: null,
      sourceVideoUrl: sourceUrl,
      renderVideoUrl: renderUrl,
      cards: [
        {
          id: 'copied-card',
          lane: 'Source',
          title: 'Copied source',
          summary: 'Approved source video.',
          action: 'Fork the source motion.',
          prompt: 'Use the imported source video as the playable fork.',
          camera: '',
          references: [sourceUrl],
          order: 1,
          sourceUnitId: 'copied-source',
        },
      ],
    },
    status: 'copied',
    provider: 'byteplus-modelark',
    renderUrl,
    sourceUrl,
    copyReason: 'provider inactive; copied source video',
    elapsedMs: 123,
    paidCallCount: 0,
    cacheHit: false,
  })
  assert(copiedMarkdown.includes('status: "copied"'), 'expected copied source video handoff status')
  assert(copiedMarkdown.includes(`renderUrl: "${renderUrl}"`), 'expected copied handoff markdown to expose a render URL')
  assert(copiedMarkdown.includes(`sourceUrl: "${sourceUrl}"`), 'expected copied handoff markdown to preserve the source URL')
  assert(copiedMarkdown.includes('paidCallCount: 0'), 'expected copied source video to avoid paid generation cost')
  assert(copiedMarkdown.includes('copyReason:'), 'expected copied handoff markdown to explain the source-video fork')
  assert(copiedMarkdown.includes(`<video controls playsinline src="${renderUrl}"`), 'expected copied direct video handoff to stay visibly playable')

  const youtubeVideoId = ['Stry', 'Copied', '123'].join('')
  const youtubeSourceUrl = ['https://www.youtube.com/watch', `?v=${youtubeVideoId}`].join('')
  const youtubeRenderUrl = ['https://www.youtube.com/embed/', youtubeVideoId].join('')
  const youtubeCopiedMarkdown = buildStrybldrVideoHandoffMarkdown({
    handoff: {
      prompt: 'Copy one approved YouTube source.',
      referenceImageUrl: null,
      sourceVideoUrl: youtubeSourceUrl,
      renderVideoUrl: youtubeRenderUrl,
      cards: [
        {
          id: 'copied-youtube-card',
          lane: 'Source',
          title: 'Copied YouTube source',
          summary: 'Approved source video.',
          action: 'Fork the source motion.',
          prompt: 'Use the imported source video as the playable fork.',
          camera: '',
          references: [youtubeSourceUrl],
          order: 1,
          sourceUnitId: 'copied-youtube-source',
        },
      ],
    },
    status: 'copied',
    provider: 'byteplus-modelark',
    renderUrl: youtubeRenderUrl,
    sourceUrl: youtubeSourceUrl,
    copyReason: 'provider inactive; copied source video',
    elapsedMs: 123,
    paidCallCount: 0,
    cacheHit: false,
  })
  assert(youtubeCopiedMarkdown.includes(`<iframe src="${youtubeRenderUrl}"`), 'expected copied YouTube handoff to render the embeddable source video')
  assert(youtubeCopiedMarkdown.includes(`[Open source video](${youtubeSourceUrl})`), 'expected copied YouTube handoff to retain the source link')
}

export async function testStrybldrRunGeneratedVideoUpdatesStoryboardCardOutputAndMedia() {
  const doc = buildStrybldrStoryboardDocument({
    createdAtMs: 1,
    sourceUnits: [
      {
        id: 'source-run-output',
        workspacePath: '/source-run-output.png.source.md',
        relativePath: 'source-run-output.png',
        originalName: 'source-run-output.png',
        mediaKind: 'image',
        mimeHint: 'image/png',
        byteSize: 128,
        textHash: 'source-run-output',
        status: 'unsupported',
        provenance: { importMode: 'file', importedAtMs: 1 },
      },
    ],
  })
  const parsed = await loadGraphDataFromTextViaParser('run-output.strybldr.md', serializeStrybldrStoryboardMarkdown(doc), { applyToStore: false })
  assert(parsed?.graphData, 'expected Strybldr graph for generated output regression')
  const handoff = buildStrybldrVideoHandoffFromGraphData(parsed.graphData)
  const targetCard = handoff.cards[0]
  assert(targetCard?.id, 'expected handoff to expose a target storyboard card')
  const artifactText = buildStrybldrVideoHandoffMarkdown({
    handoff,
    status: 'generated',
    provider: 'agenticgraph-local-animatic',
    model: 'strybldr-local-animatic-v1',
    renderUrl: handoff.renderVideoUrl,
    sourceUrl: handoff.sourceVideoUrl,
    elapsedMs: 12,
    paidCallCount: 0,
    cacheHit: false,
  })
  const updated = applyStrybldrVideoArtifactToGraphData({
    graphData: parsed.graphData,
    targetNodeId: targetCard.id,
    handoff,
    status: 'generated',
    artifactPath: '/strybldr-video-test.md',
    artifactText,
    provider: 'agenticgraph-local-animatic',
    model: 'strybldr-local-animatic-v1',
    renderUrl: handoff.renderVideoUrl,
    sourceUrl: handoff.sourceVideoUrl,
  })
  assert(updated, 'expected Strybldr generated video artifact to update graph data')
  const board = buildStoryboardBoardModel({ graphData: updated, graphRevision: 1 })
  const card = board.lanes.flatMap(lane => lane.cards).find(candidate => candidate.id === targetCard.id)
  assert(card, 'expected generated artifact target card to remain visible on the storyboard')
  assert(card.output.includes('Generated Strybldr local animatic handoff.'), `expected generated artifact output on target card, got ${JSON.stringify(card.output)}`)
  assert(card.output.includes('/strybldr-video-test.md'), 'expected generated artifact output to link the workspace handoff path')
  assert(card.media?.kind === 'iframe' && card.media.srcDoc, 'expected generated local animatic to render as card media via outputSrcDoc')
  assert(card.references.some(reference => reference.url === '/strybldr-video-test.md'), 'expected generated artifact path to be preserved as a card reference')

  const updatedMarkdown = updateStrybldrStoryboardMarkdownCardOverride({
    text: serializeStrybldrStoryboardMarkdown(doc),
    nodeId: targetCard.id,
    patch: {
      output: 'Generated Strybldr local animatic handoff.\nArtifact: /strybldr-video-test.md',
      outputSrcDoc: handoff.localAnimaticHtml,
      mediaKind: 'iframe',
      mediaUrl: '/strybldr-video-test.md',
    },
  })
  assert(updatedMarkdown, 'expected generated output/media fields to persist through Strybldr Markdown card overrides')
  const reparsed = await loadGraphDataFromTextViaParser('run-output-updated.strybldr.md', updatedMarkdown, { applyToStore: false })
  const reparsedBoard = buildStoryboardBoardModel({ graphData: reparsed?.graphData || null, graphRevision: 1 })
  const reparsedCard = reparsedBoard.lanes.flatMap(lane => lane.cards).find(candidate => candidate.id === targetCard.id)
  assert(reparsedCard?.output.includes('/strybldr-video-test.md'), 'expected generated output to survive Strybldr Markdown reparse')
  assert(reparsedCard?.media?.kind === 'iframe' && reparsedCard.media.srcDoc, 'expected generated outputSrcDoc media to survive Strybldr Markdown reparse')
}

export async function testStrybldrRunImageIntentUpdatesStoryboardCardImageMedia() {
  const storyboardCanvasText = readSource('components', 'StoryboardCanvas.tsx')
  const strybldrStoryboardText = readSource('features', 'strybldr', 'strybldrStoryboard.ts')
  assert(!fs.existsSync(path.resolve(process.cwd(), 'src', 'features', 'strybldr', 'StrybldrFloatingPanelView.tsx')), 'expected image handoff persistence not to depend on a Strybldr FloatingPanel')
  assert(strybldrStoryboardText.includes('applyStrybldrImageArtifactToGraphData'), 'expected generated image media writeback to live in the Strybldr storyboard data owner')
  assert(strybldrStoryboardText.includes("strybldrImageStatus: 'generated'"), 'expected generated image status to persist as card data')
  assert(storyboardCanvasText.includes('CardMediaLoadingSkeleton') && storyboardCanvasText.includes('readStoryboardCardMediaLoadingState'), 'expected storyboard cards to reuse the shared in-progress media loading visuals')
  const doc = buildStrybldrStoryboardDocument({
    createdAtMs: 1,
    sourceUnits: [
      {
        id: 'source-run-image',
        workspacePath: '/source-run-image.png.source.md',
        relativePath: 'source-run-image.png',
        originalName: 'source-run-image.png',
        mediaKind: 'image',
        mimeHint: 'image/png',
        byteSize: 128,
        textHash: 'source-run-image',
        status: 'unsupported',
        provenance: { importMode: 'file', importedAtMs: 1 },
      },
    ],
  })
  const serialized = serializeStrybldrStoryboardMarkdown(doc)
  const parsed = await loadGraphDataFromTextViaParser('run-image.strybldr.md', serialized, { applyToStore: false })
  assert(parsed?.graphData, 'expected Strybldr graph for generated image regression')
  const handoff = buildStrybldrVideoHandoffFromGraphData(parsed.graphData)
  const targetCard = handoff.cards[0]
  assert(targetCard?.id, 'expected handoff to expose a target storyboard card')
  const prompt = 'Generate image on wukong as a clean storyboard source frame.'
  assert(isStrybldrImageGenerationIntent(prompt), 'expected Wukong image action to route to image generation')
  const imageUrl = buildStrybldrLocalImageDataUri({
    title: targetCard.title,
    prompt,
    provider: 'mirothinker',
    model: 'agnes-2.0-flash',
  })
  const artifactText = buildStrybldrImageHandoffMarkdown({
    title: targetCard.title,
    prompt,
    provider: 'agenticgraph-local-image',
    model: 'agnes-2.0-flash',
    imageUrl,
    elapsedMs: 12,
    paidCallCount: 0,
    cacheHit: false,
  })
  const updated = applyStrybldrImageArtifactToGraphData({
    graphData: parsed.graphData,
    targetNodeId: targetCard.id,
    artifactPath: '/strybldr-image-test.md',
    artifactText,
    provider: 'agenticgraph-local-image',
    model: 'agnes-2.0-flash',
    imageUrl,
    prompt,
  })
  assert(updated, 'expected Strybldr generated image artifact to update graph data')
  const resolvedTargetNodeId = resolveStrybldrVideoArtifactTargetNodeId({ graphData: parsed.graphData, targetNodeId: targetCard.id })
  assert(resolvedTargetNodeId, 'expected image artifact writer to resolve a storyboard target node')
  const board = buildStoryboardBoardModel({ graphData: updated, graphRevision: 1 })
  const card = board.lanes.flatMap(lane => lane.cards).find(candidate => candidate.id === resolvedTargetNodeId)
  assert(card, 'expected generated image target card to remain visible on the storyboard')
  assert(card.output.includes('Generated Strybldr image handoff.'), `expected image artifact output on target card, got ${JSON.stringify(card.output)}`)
  assert((card.media?.kind === 'image' || card.media?.kind === 'svg') && card.media.url === imageUrl, 'expected image intent to render as image media, not local animatic iframe')
  assert(!card.media?.srcDoc, 'expected image run to clear stale outputSrcDoc iframe media')
  assert(card.references.some(reference => reference.url === '/strybldr-image-test.md'), 'expected generated image artifact path to be preserved as a card reference')

  const staleAnimatic = '<main>stale local animatic</main>'
  const staleMarkdown = updateStrybldrStoryboardMarkdownCardOverride({
    text: serialized,
    nodeId: resolvedTargetNodeId,
    patch: {
      output: 'Generated Strybldr local animatic handoff.',
      outputSrcDoc: staleAnimatic,
      mediaKind: 'iframe',
      mediaUrl: '/strybldr-video-test.md',
    },
  })
  assert(staleMarkdown, 'expected stale animatic fixture to persist before image replacement')
  const updatedMarkdown = updateStrybldrStoryboardMarkdownCardOverride({
    text: staleMarkdown,
    nodeId: resolvedTargetNodeId,
    patch: {
      output: 'Generated Strybldr image handoff.\nArtifact: /strybldr-image-test.md',
      outputSrcDoc: null,
      imageUrl,
      mediaKind: 'image',
      mediaUrl: imageUrl,
      renderUrl: imageUrl,
      sourceUrl: null,
    },
  })
  assert(updatedMarkdown, 'expected generated image fields to persist through Strybldr Markdown card overrides')
  assert(!updatedMarkdown.includes(staleAnimatic), 'expected image override to remove stale local animatic srcdoc')
  const reparsed = await loadGraphDataFromTextViaParser('run-image-updated.strybldr.md', updatedMarkdown, { applyToStore: false })
  const reparsedBoard = buildStoryboardBoardModel({ graphData: reparsed?.graphData || null, graphRevision: 1 })
  const reparsedCard = reparsedBoard.lanes.flatMap(lane => lane.cards).find(candidate => candidate.id === resolvedTargetNodeId)
  assert((reparsedCard?.media?.kind === 'image' || reparsedCard?.media?.kind === 'svg') && reparsedCard.media.url === imageUrl, 'expected generated image media to survive Strybldr Markdown reparse')
  assert(!reparsedCard?.media?.srcDoc, 'expected generated image reparse not to resurrect stale iframe srcdoc')
}

export function testStrybldrVideoPromptsDoNotMisrouteToImageIntent() {
  const videoPrompt = 'Create a short video storyboard beat from Strybldr starter source frame.'
  assert(!isStrybldrImageGenerationIntent(videoPrompt), 'expected video storyboard prompts with frame wording to stay on the video path')
  const explicitImagePrompt = 'Generate image on wukong as a clean storyboard source frame.'
  assert(isStrybldrImageGenerationIntent(explicitImagePrompt), 'expected explicit image prompts to keep routing to image generation')
}

export function testStrybldrGenerateVideoPathStaysVideoOnly() {
  const toolbarText = readSource('components', 'Toolbar.tsx')
  const toolbarMenuText = readSource('lib', 'toolbar', 'ToolbarToolMenu.impl.tsx')
  const chatSkillRegistryText = readSource('features', 'chat', 'chatSkillRegistry.ts')
  assert(!fs.existsSync(path.resolve(process.cwd(), 'src', 'features', 'strybldr', 'StrybldrFloatingPanelView.tsx')), 'expected Generate Video not to be owned by a Strybldr FloatingPanel')
  assert(chatSkillRegistryText.includes("slashCommand: '/video-agent'"), 'expected video-agent invocation to be exposed through slash-command grammar')
  assert(toolbarText.includes('createStrybldrLocalVideoArtifactFromGraphData'), 'expected Storyboard Run All to stay video-only through the local video handoff helper')
  assert(!toolbarMenuText.includes('title="Generate Video"'), 'expected FloatingPanel toolbar not to duplicate Generate Video')
  assert(!toolbarMenuText.includes('title="Analyze locally"'), 'expected FloatingPanel toolbar not to duplicate local analysis')
  assert(!toolbarText.includes('generateRunImageWithBytePlus('), 'expected Storyboard Run All to avoid image-provider routing')
}

export function testStrybldrVideoArtifactTargetPrefersStoryboardFrameOverElementCard() {
  const graphData = {
    nodes: [
      {
        id: 'starter-source-brief-card',
        type: 'StoryboardElement',
        properties: {
          lane: 'Elements',
          strybldrRunId: 'strybldr-starter-template',
          strybldrSourceUnitId: 'strybldr-starter-source',
        } as never,
      },
      {
        id: 'strybldr:frame:3595615238',
        type: 'StoryboardFrame',
        properties: {
          lane: 'Storyboard',
          strybldrRunId: 'strybldr-starter-template',
          strybldrSourceUnitId: 'strybldr-starter-source',
        } as never,
      },
    ],
    edges: [],
  } as never
  const resolvedTargetNodeId = resolveStrybldrVideoArtifactTargetNodeId({
    graphData,
    targetNodeId: 'starter-source-brief-card',
  })
  assert(resolvedTargetNodeId === 'strybldr:frame:3595615238', `expected video artifacts to prefer the storyboard frame target, got ${resolvedTargetNodeId}`)
}

export function testStrybldrVideoArtifactCleanupKeepsOnlyTargetOverride() {
  const baseText = readStrybldrStarterTemplateText()
  const withSourceArtifact = updateStrybldrStoryboardMarkdownCardOverride({
    text: baseText,
    nodeId: 'strybldr:source:3725310941',
    patch: {
      output: 'Generated Strybldr local animatic handoff.',
      outputSrcDoc: '<html><body>source</body></html>',
      mediaKind: 'iframe',
      mediaUrl: 'source-url',
    },
  })
  const withTargetPrompt = updateStrybldrStoryboardMarkdownCardOverride({
    text: String(withSourceArtifact || ''),
    nodeId: 'strybldr:frame:3595615238',
    patch: {
      prompt: 'keep me',
    },
  })
  const cleaned = clearStrybldrVideoArtifactMarkdownOverrides({
    text: String(withTargetPrompt || ''),
    targetNodeId: 'strybldr:frame:3595615238',
  })
  const parsed = parseStrybldrStoryboardMarkdown(String(cleaned || ''))
  const sourceCard = (parsed?.cards || []).find(card => card.nodeId === 'strybldr:source:3725310941') || null
  const targetCard = (parsed?.cards || []).find(card => card.nodeId === 'strybldr:frame:3595615238') || null
  assert(!sourceCard, 'expected stale source artifact override to be removed entirely')
  assert(targetCard?.prompt === 'keep me', `expected target card non-artifact overrides to remain, got ${JSON.stringify(targetCard)}`)
}

export async function testStrybldrConsolidatedDemoGeneratesLocalPlayableAnimatic() {
  try {
    resetWorkspaceFsForTests()
    const text = readStrybldrDemoText()
    const demoVideoId = readStrybldrDemoVideoId(text)
    const demoWatchUrl = readStrybldrDemoWatchUrl(text)
    assert(demoWatchUrl, 'expected consolidated demo to declare source URL frontmatter')
    assert(text.startsWith('---\n'), 'expected consolidated demo to expose runnable YAML frontmatter')
    assert(text.includes('\n---\n\n# AgenticGraph Strybldr Demo'), 'expected consolidated demo frontmatter to close before Markdown body')
    assert(text.includes('| Stage | Required behavior | Shared owner |\n|---|---|---|'), 'expected consolidated demo proof table to be valid Markdown')
    assert(text.includes('| Evidence | Value |\n|---|---|'), 'expected consolidated demo evidence table to be valid Markdown')
    const parsed = await loadGraphDataFromTextViaParser('agenticgraph-strybldr-demo.md', text, { applyToStore: false })
    assert(parsed?.parserId === 'strybldr-storyboard', `expected consolidated demo to parse as Strybldr, got ${String(parsed?.parserId || '')}`)
    assert(text.includes('videodb_character_clips_contract'), 'expected consolidated demo to include the VideoDB character clips contract')
    assert(text.includes('video.generate_stream(timeline=subject_timeline_ranges)'), 'expected consolidated demo to include the VideoDB timeline stream primitive')
    assert(text.includes('subject_clip_urls:'), 'expected consolidated demo to keep subject clip URLs in the publish packet schema')
    assert(text.includes("creator_setup: ''"), 'expected consolidated demo to keep character clip URLs blank until live VideoDB responses')
    const handoff = buildStrybldrVideoHandoffFromGraphData(parsed.graphData)
    assert(handoff.cards.length >= 12, `expected consolidated demo handoff cards, got ${handoff.cards.length}`)
    assert(handoff.cards.some(card => card.id === 'videodb-character-clips-card'), 'expected consolidated demo handoff to include the VideoDB character clips card')
    assert(demoVideoId && String(handoff.sourceVideoUrl || '').includes(demoVideoId), `expected demo handoff to preserve import URL video source, got ${String(handoff.sourceVideoUrl || '')}`)
    assert(demoVideoId && String(handoff.renderVideoUrl || '').includes(`/embed/${demoVideoId}`), `expected demo handoff to preserve renderable source preview, got ${String(handoff.renderVideoUrl || '')}`)
    assert(String(handoff.localAnimaticHtml || '').includes('Strybldr Local Generated Video'), 'expected demo handoff to include generated local animatic HTML')
    assert(String(handoff.localAnimaticHtml || '').includes('agenticgraph local animatic'), 'expected generated local animatic to identify the local generator')
    assert(String(handoff.localAnimaticHtml || '').includes('Chapter clips'), 'expected generated local animatic to expose runnable chapter clips')
    assert(!String(handoff.localAnimaticHtml || '').includes('stream.videodb.io'), 'expected local generated animatic not to fabricate VideoDB stream URLs')
    const markdown = buildStrybldrVideoHandoffMarkdown({
      handoff,
      status: 'generated',
      provider: 'agenticgraph-local-animatic',
      model: 'strybldr-local-animatic-v1',
      renderUrl: handoff.renderVideoUrl,
      sourceUrl: handoff.sourceVideoUrl,
      elapsedMs: 25,
      paidCallCount: 0,
      cacheHit: false,
    })
    assert(markdown.includes('status: "generated"'), 'expected local generated animatic artifact status')
    assert(markdown.includes('provider: "agenticgraph-local-animatic"'), 'expected local generated animatic provider')
    assert(markdown.includes('paidCallCount: 0'), 'expected local generated animatic to avoid paid calls')
    assert(markdown.includes('srcdoc='), 'expected local generated animatic to render as an embedded playable artifact')
    assert(markdown.includes(`[Open source video](${demoWatchUrl})`), 'expected generated artifact to preserve import URL provenance')
    const generated = await createStrybldrLocalVideoArtifactFromGraphData(parsed.graphData)
    assert(generated.ok === true, `expected consolidated demo to write a generated local artifact, got ${JSON.stringify(generated)}`)
    const fsRuntime = await getWorkspaceFs()
    const generatedText = await fsRuntime.readFileText(generated.path)
    assert(String(generatedText || '').includes('kgStrybldrVideoHandoff: true'), 'expected generated local artifact frontmatter')
    assert(String(generatedText || '').includes('status: "generated"'), 'expected generated local artifact status')
    assert(String(generatedText || '').includes('provider: "agenticgraph-local-animatic"'), 'expected generated local artifact provider')
    assert(String(generatedText || '').includes('srcdoc='), 'expected generated local artifact to include playable srcdoc')
    assert(!String(generatedText || '').includes('stream.videodb.io'), 'expected generated local artifact not to fabricate VideoDB media')
  } finally {
    resetWorkspaceFsForTests()
  }
}

export async function testStrybldrVideoSourceKeepsRenderableMediaAcrossMergeAndHandoff() {
  const videoId = ['Stry', 'Media', '123'].join('')
  const watchUrl = ['https://www.youtube.com/watch', `?v=${videoId}`].join('')
  const doc = buildStrybldrStoryboardDocument({
    createdAtMs: 1,
    mediaUrlBySourceUnitId: {
      'corpus-source-video-provider': watchUrl,
    },
    sourceUnits: [
      {
        id: 'corpus-source-video-provider',
        workspacePath: '/video-source.md',
        relativePath: 'video-source.md',
        originalName: 'video-source.md',
        mediaKind: 'video',
        mimeHint: 'text/markdown',
        byteSize: 64,
        textHash: 'provider-video',
        status: 'parsed',
        provenance: { importMode: 'url', importedAtMs: 1 },
      },
    ],
  })
  const parsed = await loadGraphDataFromTextViaParser('provider-video.strybldr.md', serializeStrybldrStoryboardMarkdown(doc), { applyToStore: false })
  assert(parsed?.graphData, 'expected provider video Strybldr graph')
  const board = buildStoryboardBoardModel({ graphData: parsed.graphData, graphRevision: 1 })
  const cards = board.lanes.flatMap(lane => lane.cards)
  assert(cards.some(card => card.media?.kind === 'iframe' && card.media.url.includes('/embed/')), 'expected Strybldr provider video cards to render through an iframe URL')
  assert(cards.some(card => card.references.some(reference => reference.kind === 'image' && reference.url.includes(`/vi/${videoId}/`))), 'expected Strybldr provider video cards to expose thumbnail image references')

  const merged = mergeStrybldrElementsIntoGraphData({
    graphData: parsed.graphData,
    elements: [
      {
        id: 'provider-video-edit',
        sourceUnitId: 'corpus-source-video-provider',
        label: 'Approved video beat',
        confidence: 0.8,
        sourceBox: { xmin: 0, ymin: 0, xmax: 1, ymax: 1, unit: 'percentage' },
        evidenceKind: 'user-edit',
        provider: 'fallback',
        order: 3,
        summary: 'Approved video source beat.',
        action: 'Use the source video as motion reference.',
        prompt: 'Animate from the approved provider video source.',
      },
    ],
  })
  const sourceNode = (merged.nodes || []).find(node => String(node.properties?.strybldrSourceUnitId || '') === 'corpus-source-video-provider')
  assert(String(sourceNode?.properties?.mediaKind || '') === 'video', 'expected Strybldr merge to preserve provider video mediaKind')
  const mergedBoard = buildStoryboardBoardModel({ graphData: merged, graphRevision: 2 })
  assert(mergedBoard.lanes.flatMap(lane => lane.cards).some(card => card.media?.kind === 'iframe'), 'expected merged Strybldr graph to keep renderable provider video media')
  const handoff = buildStrybldrVideoHandoffFromGraphData(merged)
  assert(String(handoff.referenceImageUrl || '').includes(`/vi/${videoId}/`), `expected video handoff reference image to use provider thumbnail, got ${String(handoff.referenceImageUrl || '')}`)
  assert(handoff.sourceVideoUrl === watchUrl, `expected video handoff to preserve source video URL, got ${String(handoff.sourceVideoUrl || '')}`)
  assert(String(handoff.renderVideoUrl || '').includes('/embed/'), `expected video handoff to expose a playable embed URL, got ${String(handoff.renderVideoUrl || '')}`)
  assert(handoff.cards.some(card => card.references.includes(watchUrl) && card.references.some(reference => reference.includes(`/vi/${videoId}/`))), 'expected video handoff cards to retain source URL and thumbnail references')
}

export function testStrybldrVisionHarnessUsesRequiredProvidersWithPrivacyGuard() {
  const localVisionText = readSource('features', 'strybldr', 'strybldrLocalVision.ts')
  assert(localVisionText.includes("@huggingface/transformers"), 'expected transformers.js package import')
  assert(localVisionText.includes("Xenova/detr-resnet-50"), 'expected DETR object detection model')
  assert(localVisionText.includes("@vladmandic/human"), 'expected @vladmandic/human package import')
  assert(localVisionText.includes('description: { enabled: false }'), 'expected Human face descriptor disabled')
  assert(localVisionText.includes('emotion: { enabled: false }'), 'expected Human emotion inference disabled')
  assert(localVisionText.includes("evidenceKind: 'local-object-detection'"), 'expected local object detection evidence tags')
  assert(localVisionText.includes("evidenceKind: 'local-human-geometry'"), 'expected privacy-safe human geometry evidence tags')
}
