import fs from 'node:fs'
import path from 'node:path'
import { parse as parseYaml } from 'yaml'
import { loadGraphDataFromTextViaParser } from '@/features/parsers/loader'
import { buildStoryboardBoardModel, buildStoryboardInlineMediaCommandContext } from '@/components/StoryboardCanvas/storyboardModel'
import { buildStoryboardCardTextModel } from '@/components/StoryboardWidgetCanvas/storyboardCardTextModel'
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
  createNextStrybldrStoryboardMarkdownNodeId,
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
  FLOW_RICH_MEDIA_PANEL_NODE_TYPE_ID,
  FLOW_TEXT_GENERATION_NODE_LABEL,
  FLOW_TEXT_GENERATION_NODE_TYPE_ID,
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
const STRYBLDR_STARTER_TEMPLATE_NAME = ['agentic-graph-strybldr', 'starter-template.md'].join('-')
const STRYBLDR_STARTER_TEMPLATE_REFERENCE = ['docs', STRYBLDR_STARTER_TEMPLATE_NAME].join('/')

const resolveStrybldrStarterTemplatePath = (): string => {
  const externalValidationInput = String(process.env.AG_TEST_VALIDATION_FORBID_HARDCODE_IN_REPO || '').trim()
  if (externalValidationInput && path.basename(externalValidationInput) === STRYBLDR_STARTER_TEMPLATE_NAME) return externalValidationInput
  return path.resolve(process.cwd(), '../..', 'huijoohwee', 'docs', STRYBLDR_STARTER_TEMPLATE_NAME)
}

const readStrybldrStarterTemplateText = (): string => fs.readFileSync(resolveStrybldrStarterTemplatePath(), 'utf8')

const assertStrybldrStarterTemplateHasNoRepoHardcodedRuntimeMedia = (text: string): void => {
  const forbiddenRuntimeMediaPatterns: Array<[RegExp, string]> = [
    [/\bagentic_os_media_token=/i, 'local media access tokens'],
    [/\blocalhost:\d+\/api\/storage\/media\//i, 'localhost storage media URLs'],
    [/\/api\/storage\/media\/[^ \n"'`]+\/runs\/upload-[^ \n"'`]+/i, 'persisted upload storage URLs'],
    [/\bupload-[a-z0-9]{8,}/i, 'source-specific upload ids'],
  ]
  for (const [pattern, label] of forbiddenRuntimeMediaPatterns) {
    assert(!pattern.test(text), `expected starter template not to store ${label}`)
  }
}

const readStrybldrDemoText = (): string => {
  const demoPath = path.resolve(process.cwd(), '../..', 'huijoohwee/docs/agentic-graph-strybldr-demo.md')
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

export function testStrybldrStarterWorkflowGanttStaysSynchronizedWithStoryboardCards() {
  const text = readStrybldrStarterTemplateText()
  const parsedDoc = parseStrybldrStoryboardMarkdown(text)
  assert(parsedDoc, 'expected starter template to expose a structured Strybldr storyboard payload')
  const derivedCodes = readStrybldrWorkflowGanttCodesFromMarkdown(text)
  assert(derivedCodes.length === 1, `expected one Strybldr-derived workflow Gantt, got ${derivedCodes.length}`)
  assert(derivedCodes[0] === buildStrybldrWorkflowGanttCode(parsedDoc), 'expected markdown reader to derive workflow Gantt from the parsed Strybldr payload')
  const derivedModel = buildMermaidGanttTimelineModel(derivedCodes[0])
  const expectedLabels = parsedDoc.elements
    .slice()
    .sort((a, b) => {
      const orderA = Number.isFinite(Number(a.order)) ? Number(a.order) : Number.MAX_SAFE_INTEGER
      const orderB = Number.isFinite(Number(b.order)) ? Number(b.order) : Number.MAX_SAFE_INTEGER
      if (orderA !== orderB) return orderA - orderB
      return String(a.label || '').localeCompare(String(b.label || ''))
    })
    .map(element => String(element.label || '').trim())
    .filter(Boolean)
  const derivedLabels = derivedModel.taskSpans.map(span => span.label)
  assert(
    derivedLabels.join('|') === expectedLabels.join('|'),
    `expected derived workflow Gantt rows to match Storyboard cards, got ${JSON.stringify({ derivedLabels, expectedLabels })}`,
  )
  assert(derivedLabels.length === 10, `expected starter workflow Gantt to expose 10 storyboard card rows, got ${derivedLabels.length}`)
  assert(
    derivedModel.taskSpans.every(span => /strybldr_/.test(span.raw) && Math.abs(span.durationMinutes - 0.167) < 0.0001),
    `expected derived workflow Gantt rows to reuse compact shared workflow timing, got ${JSON.stringify(derivedModel.taskSpans)}`,
  )
  const graph = buildStrybldrGraphData(parsedDoc)
  const generationSpan = derivedModel.taskSpans.find(span => span.label === 'Video-agent generation')
  assert(generationSpan, 'expected derived workflow Gantt to include Video-agent generation')
  assert(
    resolveGraphNodeIdForGanttTaskSpan({ graphData: graph, span: generationSpan }) === 'video-agent-generation-card',
    'expected derived workflow Gantt task id to resolve to the matching storyboard card for canvas focus',
  )
  assert(readYamlFrontmatterMermaidDiagramCodes(text, 'gantt').length === 0, 'expected starter template not to keep a duplicate authored mermaid_gantt workflow block')
  assert(!text.includes('video_agent_workflow:'), 'expected starter template to remove the stale static video_agent_workflow diagram')
  assert(text.includes('timelinePolicy: "Gantt-Timeline rows derive from strybldr_storyboard.elements'), 'expected starter template to declare Strybldr-owned Gantt derivation policy')
}

export async function testStrybldrFullGraphSyncReconcilesRichMediaPanelTopology() {
  let text = readStrybldrStarterTemplateText()
  for (const nodeId of ['probe-ledger-a', 'probe-ledger-b']) {
    text = appendStrybldrStoryboardMarkdownElement({
      text,
      nodeId,
      title: 'Probe-Tree Branches',
      type: FLOW_RICH_MEDIA_PANEL_NODE_TYPE_ID,
    }) || text
  }
  const document = parseStrybldrStoryboardMarkdown(text)
  assert(document, 'expected Strybldr payload after appending duplicate Probe-Tree ledgers')
  const graph = buildStrybldrGraphData(document)
  const nextOutput = '# Probe-Tree Branches\n\nCanonical ledger'
  const nextGraphData: GraphData = {
    ...graph,
    context: 'frontmatter-flow',
    nodes: graph.nodes
      .filter(node => String(node.id || '') !== 'probe-ledger-b')
      .map(node => String(node.id || '') === 'probe-ledger-a'
        ? { ...node, properties: { ...(node.properties || {}), output: nextOutput } }
        : node),
    edges: graph.edges.filter(edge => String(edge.source || '') !== 'probe-ledger-b' && String(edge.target || '') !== 'probe-ledger-b'),
  }
  const sourceFiles = [{
    id: 'strybldr-probe-ledger-topology',
    enabled: true,
    name: STRYBLDR_STARTER_TEMPLATE_NAME,
    text,
    source: { path: STRYBLDR_STARTER_TEMPLATE_REFERENCE },
    parsedGraphData: graph,
  }] as never
  const synced = syncActiveMarkdownDocumentTextFromParsedGraph({
    state: {
      markdownDocumentName: STRYBLDR_STARTER_TEMPLATE_REFERENCE,
      markdownDocumentText: text,
    } as never,
    sourceFiles,
    parsedGraphData: nextGraphData,
  })
  const nextText = String(synced.markdownDocumentText || '')
  const reparsed = parseStrybldrStoryboardMarkdown(nextText)
  const panelCards = (reparsed?.cards || []).filter(card => card.type === FLOW_RICH_MEDIA_PANEL_NODE_TYPE_ID && card.title === 'Probe-Tree Branches')
  assert(panelCards.length === 1 && panelCards[0]?.nodeId === 'probe-ledger-a', `expected one canonical Rich Media ledger in source, got ${JSON.stringify(panelCards)}`)
  assert(panelCards[0]?.output === nextOutput, `expected the canonical ledger output to persist, got ${JSON.stringify(panelCards[0])}`)
  const reparsedGraph = await loadGraphDataFromTextViaParser(STRYBLDR_STARTER_TEMPLATE_NAME, nextText, {
    applyToStore: false,
    syncMarkdownDocument: false,
  })
  const flowProbePanels = reparsedGraph.graphData.nodes.filter(node => (
    String(node.type || '') === FLOW_RICH_MEDIA_PANEL_NODE_TYPE_ID
    && String(node.label || '') === 'Probe-Tree Branches'
  ))
  assert(flowProbePanels.length === 1, `expected hybrid flow.nodes to retain one Probe-Tree ledger, got ${JSON.stringify(flowProbePanels)}`)
}

export async function testStrybldrStoryboardSummaryEditSyncPersistsCardOverride() {
  const text = readStrybldrStarterTemplateText()
  const parsed = await loadGraphDataFromTextViaParser(STRYBLDR_STARTER_TEMPLATE_NAME, text, {
    applyToStore: false,
    syncMarkdownDocument: false,
  })
  assert(parsed?.graphData, 'expected starter template graph before summary edit sync')
  const graph = parsed.graphData
  const previousNode = (graph.nodes || []).find(node => String(node.id || '') === 'strybldr:source:3725310941') as GraphNode | undefined
  assert(previousNode, 'expected starter source card node before summary edit sync')
  const nextTitle = 'Edited Strybldr Source'
  const nextSummary = 'Edited /source.ingest summary survives Strybldr reindex.'
  const nextAction = 'Review edited source evidence.'
  const nextPrompt = 'Use the edited source summary as the reference.'
  const nextOrder = 7
  const nextNode: GraphNode = {
    ...previousNode,
    label: nextTitle,
    properties: {
      ...(previousNode.properties || {}),
      title: nextTitle,
      summary: nextSummary,
      action: nextAction,
      prompt: nextPrompt,
      order: nextOrder,
    },
  }
  const nextGraphData: GraphData = {
    ...graph,
    nodes: (graph.nodes || []).map(node => String(node.id || '') === String(nextNode.id || '') ? nextNode : node),
  }
  const sourceFiles = [{
    id: 'strybldr-starter-template',
    enabled: true,
    name: STRYBLDR_STARTER_TEMPLATE_NAME,
    text,
    source: { path: STRYBLDR_STARTER_TEMPLATE_REFERENCE },
    parsedGraphData: graph,
  }] as never
  const textSync = syncActiveMarkdownDocumentTextFromParsedGraph({
    state: {
      markdownDocumentName: STRYBLDR_STARTER_TEMPLATE_REFERENCE,
      markdownDocumentText: text,
    } as never,
    sourceFiles,
    parsedGraphData: nextGraphData,
    previousNode,
    nextNode,
  })
  const nextText = String(textSync.markdownDocumentText || '')
  assert(nextText && nextText !== text, 'expected card edit sync to write a Strybldr card override into markdown text')
  assert(
    textSync.sourceFiles[0]?.text === nextText,
    'expected active source file text to receive the same card override markdown',
  )
  const reparsedDoc = parseStrybldrStoryboardMarkdown(nextText)
  const sourceCardOverride = (reparsedDoc?.cards || []).find(card => card.nodeId === 'strybldr:source:3725310941') || null
  assert(sourceCardOverride?.title === nextTitle, `expected source card title override to persist, got ${JSON.stringify(sourceCardOverride)}`)
  assert(sourceCardOverride?.summary === nextSummary, `expected source card summary override to persist, got ${JSON.stringify(sourceCardOverride)}`)
  assert(sourceCardOverride?.action === nextAction, `expected source card action override to persist, got ${JSON.stringify(sourceCardOverride)}`)
  assert(sourceCardOverride?.prompt === nextPrompt, `expected source card prompt override to persist, got ${JSON.stringify(sourceCardOverride)}`)
  assert(sourceCardOverride?.order === nextOrder, `expected source card order override to persist, got ${JSON.stringify(sourceCardOverride)}`)
  const reparsed = await loadGraphDataFromTextViaParser(STRYBLDR_STARTER_TEMPLATE_NAME, nextText, {
    applyToStore: false,
    syncMarkdownDocument: false,
  })
  const reparsedSourceNode = (reparsed.graphData.nodes || []).find(node => String(node.id || '') === 'strybldr:source:3725310941') || null
  assert(reparsedSourceNode?.label === nextTitle, `expected reindex to keep edited source title, got ${String(reparsedSourceNode?.label || '')}`)
  assert(reparsedSourceNode?.properties?.summary === nextSummary, `expected reindex to keep edited source summary, got ${String(reparsedSourceNode?.properties?.summary || '')}`)
  assert(reparsedSourceNode?.properties?.action === nextAction, `expected reindex to keep edited source action, got ${String(reparsedSourceNode?.properties?.action || '')}`)
  assert(reparsedSourceNode?.properties?.prompt === nextPrompt, `expected reindex to keep edited source prompt, got ${String(reparsedSourceNode?.properties?.prompt || '')}`)
  assert(reparsedSourceNode?.properties?.order === nextOrder, `expected reindex to keep edited source order, got ${String(reparsedSourceNode?.properties?.order || '')}`)
}

export function testStrybldrAddedCardSyncPersistsAndRehydrates() {
  const text = readStrybldrStarterTemplateText()
  const parsedDocument = parseStrybldrStoryboardMarkdown(text)
  assert(parsedDocument, 'expected starter template to parse before adding a card')
  const graph = buildStrybldrGraphData(parsedDocument)
  const nodeId = createNextStrybldrStoryboardMarkdownNodeId({ text })
  assert(nodeId, 'expected source-owned next card id')
  const order = Math.max(0, ...parsedDocument.elements.map(element => Number(element.order)).filter(Number.isFinite)) + 1
  const prompt = 'Generate a source-owned response for the active request.'
  const semanticValues = Object.fromEntries(['dialogue', 'style', 'chatModel', 'mediaUrl'].map(key => [key, `source-owned-${key}`]))
  const nextNode: GraphNode = {
    id: nodeId,
    type: FLOW_TEXT_GENERATION_NODE_TYPE_ID,
    label: FLOW_TEXT_GENERATION_NODE_LABEL,
    properties: {
      title: FLOW_TEXT_GENERATION_NODE_LABEL,
      lane: 'Text Generation',
      order,
      prompt,
      ...semanticValues,
    },
  }
  const sourceFiles = [{
    id: 'active-strybldr-source',
    enabled: true,
    name: STRYBLDR_STARTER_TEMPLATE_NAME,
    text,
    source: { path: STRYBLDR_STARTER_TEMPLATE_REFERENCE },
    parsedGraphData: graph,
  }] as never
  const textSync = syncActiveMarkdownDocumentTextFromParsedGraph({
    state: {
      markdownDocumentName: STRYBLDR_STARTER_TEMPLATE_REFERENCE,
      markdownDocumentText: text,
    } as never,
    sourceFiles,
    parsedGraphData: { ...graph, nodes: [...graph.nodes, nextNode] },
    nextNode,
  })
  const nextText = String(textSync.markdownDocumentText || '')
  assert(nextText && nextText !== text, 'expected canonical node creation to update the Strybldr source')
  assert(textSync.sourceFiles[0]?.text === nextText, 'expected the active source file to receive the added card')
  const reparsedDocument = parseStrybldrStoryboardMarkdown(nextText)
  const persistedElement = reparsedDocument?.elements.find(element => element.id === nodeId)
  const persistedCard = reparsedDocument?.cards?.find(card => card.nodeId === nodeId)
  assert(persistedElement?.prompt === prompt, `expected added card prompt in source element, got ${JSON.stringify(persistedElement)}`)
  assert(persistedCard?.type === FLOW_TEXT_GENERATION_NODE_TYPE_ID, `expected added card type override, got ${JSON.stringify(persistedCard)}`)
  assert(persistedCard?.lane === 'Text Generation', `expected added card lane override, got ${JSON.stringify(persistedCard)}`)
  for (const [key, value] of Object.entries(semanticValues)) {
    assert(persistedCard?.[key as keyof typeof persistedCard] === value, `expected added card ${key} override, got ${JSON.stringify(persistedCard)}`)
  }
  const rehydratedGraph = buildStrybldrGraphData(reparsedDocument!)
  const rehydratedNode = rehydratedGraph.nodes.find(node => String(node.id || '') === nodeId)
  assert(rehydratedNode, 'expected added source card to rematerialize after parse')
  assert(rehydratedNode.type === FLOW_TEXT_GENERATION_NODE_TYPE_ID, `expected rehydrated card type, got ${String(rehydratedNode.type || '')}`)
  assert(rehydratedNode.properties?.prompt === prompt, `expected rehydrated prompt, got ${String(rehydratedNode.properties?.prompt || '')}`)
  assert(!String(rehydratedNode.properties?.summary || '').trim(), 'expected user-authored prompt cards not to receive a generated summary that changes the edit target')
  assert(!String(rehydratedNode.properties?.action || '').trim(), 'expected user-authored prompt cards not to receive a generated action that changes the edit target')
  for (const [key, value] of Object.entries(semanticValues)) {
    assert(rehydratedNode.properties?.[key] === value, `expected rehydrated ${key}, got ${String(rehydratedNode.properties?.[key] || '')}`)
  }
  const card = buildStoryboardBoardModel({ graphData: rehydratedGraph, graphRevision: 1, widgetRegistry: [] }).lanes
    .flatMap(lane => lane.cards)
    .find(candidate => candidate.id === nodeId)
  const textModel = card ? buildStoryboardCardTextModel(card) : null
  assert(textModel?.primaryField.id === 'prompt', `expected rehydrated prompt card to keep Prompt as its Viewer edit target, got ${textModel?.primaryField.id || 'missing'}`)
}

export function testStrybldrExistingUnownedCardEditDoesNotBackfillSource() {
  const text = readStrybldrStarterTemplateText()
  const parsedDocument = parseStrybldrStoryboardMarkdown(text)
  assert(parsedDocument, 'expected starter template to parse before checking the no-backfill boundary')
  const graph = buildStrybldrGraphData(parsedDocument)
  const nodeId = createNextStrybldrStoryboardMarkdownNodeId({ text })
  assert(nodeId, 'expected a neutral unowned node id')
  const previousPrompt = `unowned-${nodeId}`
  const previousNode: GraphNode = {
    id: nodeId,
    type: FLOW_TEXT_GENERATION_NODE_TYPE_ID,
    label: FLOW_TEXT_GENERATION_NODE_LABEL,
    properties: { prompt: previousPrompt },
  }
  const nextNode: GraphNode = {
    ...previousNode,
    properties: { prompt: `edited-${previousPrompt}` },
  }
  const graphWithUnownedNode = { ...graph, nodes: [...graph.nodes, previousNode] }
  const sourceFiles = [{
    id: 'active-strybldr-source',
    enabled: true,
    name: STRYBLDR_STARTER_TEMPLATE_NAME,
    text,
    source: { path: STRYBLDR_STARTER_TEMPLATE_REFERENCE },
    parsedGraphData: graphWithUnownedNode,
  }] as never
  const textSync = syncActiveMarkdownDocumentTextFromParsedGraph({
    state: { markdownDocumentName: STRYBLDR_STARTER_TEMPLATE_REFERENCE, markdownDocumentText: text } as never,
    sourceFiles,
    parsedGraphData: { ...graphWithUnownedNode, nodes: [...graph.nodes, nextNode] },
    previousNode,
    nextNode,
  })
  assert(textSync.sourceFiles[0]?.text === text, 'expected editing an unowned existing node not to infer or mutate Strybldr source ownership')
  const reparsed = parseStrybldrStoryboardMarkdown(textSync.sourceFiles[0]?.text || '')
  assert(!reparsed?.elements.some(element => element.id === nodeId), 'expected no edit-time element backfill')
  assert(!reparsed?.cards?.some(card => card.nodeId === nodeId), 'expected no edit-time card override backfill')
}

export function testStrybldrWorkflowEdgeSyncPersistsAuthoredStoryboardConnections() {
  const baseText = readStrybldrStarterTemplateText()
  const parsed = parseStrybldrStoryboardMarkdown(baseText)
  assert(parsed, 'expected starter template to parse before workflow-edge sync')
  const nextText = syncStrybldrStoryboardMarkdownWorkflowEdges({
    text: baseText,
    graphData: {
      context: 'strybldr-storyboard',
      type: 'Graph',
      nodes: [],
      edges: [
        {
          id: 'starter-edge-1',
          source: 'starter-source-brief-card',
          target: 'starter-storyboard-beats-card',
          label: 'linksTo', properties: {},
        },
        {
          id: 'ignore-structural-edge',
          source: 'strybldr:frame:3595615238',
          target: 'starter-source-brief-card',
          label: 'containsElement', properties: {},
        },
      ],
    },
  })
  assert(nextText && nextText !== baseText, 'expected storyboard workflow-edge sync to persist authored edges into the structured payload')
  const reparsed = parseStrybldrStoryboardMarkdown(String(nextText || ''))
  assert(reparsed, 'expected synced storyboard markdown to remain parseable')
  assert((reparsed?.edges || []).length === 1, `expected only authored element-to-element edges to persist, got ${JSON.stringify(reparsed?.edges || [])}`)
  const authoredEdge = reparsed?.edges?.[0] || null
  assert(authoredEdge?.id === 'starter-edge-1', `expected authored edge id to persist, got ${JSON.stringify(authoredEdge)}`)
  assert(authoredEdge?.source === 'starter-source-brief-card' && authoredEdge?.target === 'starter-storyboard-beats-card', `expected authored storyboard edge endpoints to persist, got ${JSON.stringify(authoredEdge)}`)
  assert(authoredEdge?.label === 'linksTo', `expected authored storyboard edge label to persist, got ${JSON.stringify(authoredEdge)}`)
}
