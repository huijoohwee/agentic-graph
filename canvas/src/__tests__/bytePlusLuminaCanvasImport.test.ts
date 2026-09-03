import { createMemoryWorkspaceFs } from '@/features/workspace-fs/workspaceFsMemory'
import { existsSync, readFileSync } from 'node:fs'
import { basename } from 'node:path'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import { useGraphStore } from '@/hooks/useGraphStore'
import { fetchWorkspaceUrlContent, importWorkspaceLocalFiles } from '@/features/markdown-workspace/workspaceImport'
import { resolveImportedCanvasDocumentApplyToGraph } from '@/features/markdown-workspace/useWorkspaceFileActions/importRuntimeActions'
import { shouldApplyImportedCanvasDocumentToGraph } from '@/features/markdown-workspace/workspaceImport/applyPolicy'
import { applyWorkspaceImportToCanvas } from '@/features/workspace-fs/applyWorkspaceImportToCanvas'
import { parseGraphFromJson } from '@/lib/graph/io/adapter'
import { looksLikeBytePlusLuminaCanvasText } from '@/lib/graph/io/byteplusLuminaCanvas'
import { buildStoryboardBoardModel } from '@/components/StoryboardCanvas/storyboardModel'
import { resetWorkspaceFsForTests } from '@/features/workspace-fs/workspaceFs'
import { loadGraphDataFromTextViaParser } from '@/features/parsers/loader'
import { tryBuildJsonMarkdownDocumentFromText } from '@/features/markdown/jsonToMarkdownDocument'
import { readMarkdownSourceFidelityTextFromValue } from '@/features/markdown/jsonMarkdownSourceFidelity'
import { listMediaOverlayNodes } from '@/lib/render/mediaOverlayPool'
import { getCachedGraphLookup } from '@/lib/graph/lookupCache'
import { dedupeCommandMenuRichMediaItems, type CommandMenuRichMediaItem } from '@/lib/command-menu/commandMenuRichMediaInventory'
import { tryParseMarkdownFrontmatterFlowGraph } from '@/features/parsers/markdownFrontmatterFlowGraph.core'

const createFile = (name: string, text: string) => {
  const blob = new Blob([text], { type: 'application/json' })
  return new File([blob], name, { type: 'application/json' })
}

type JsonRecord = Record<string, unknown>

type RawLuminaGroup = {
  id: string
  title: string
}

type RawLuminaLink = {
  id: string
  source: string
  target: string
  sourceHandle: string
  targetHandle: string
  edgeId: string
}

const asJsonRecord = (value: unknown): JsonRecord | null => {
  return !!value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : null
}

const asJsonArray = (value: unknown): unknown[] => {
  return Array.isArray(value) ? value : []
}

const normalizeTestText = (value: unknown): string => {
  return String(value ?? '').replace(/\s+/g, ' ').trim()
}

const readNumberPair = (value: unknown): { first: number; second: number } | null => {
  if (!Array.isArray(value)) return null
  const [first, second] = value
  if (typeof first !== 'number' || !Number.isFinite(first)) return null
  if (typeof second !== 'number' || !Number.isFinite(second)) return null
  return { first, second }
}

const readRawNodeId = (node: unknown, index: number): string => {
  return normalizeTestText(asJsonRecord(node)?.id) || `lumina-node-${index + 1}`
}

const readRawNodePosition = (node: unknown): { x: number; y: number } | null => {
  const meta = asJsonRecord(asJsonRecord(node)?.meta)
  const position = readNumberPair(meta?.pos)
  return position ? { x: position.first, y: position.second } : null
}

const readRawGroup = (group: unknown): RawLuminaGroup | null => {
  const record = asJsonRecord(group)
  const meta = asJsonRecord(record?.meta)
  const id = normalizeTestText(record?.id)
  const title = normalizeTestText(meta?.title)
  const position = readNumberPair(meta?.pos)
  const size = readNumberPair(meta?.size)
  if (!id || !title || !position || !size) return null
  return { id, title }
}

const readRawLink = (link: unknown, index: number, nodeIds: ReadonlySet<string>): RawLuminaLink | null => {
  if (!Array.isArray(link) || link.length < 4) return null
  const source = normalizeTestText(link[1])
  const target = normalizeTestText(link[3])
  if (!source || !target || !nodeIds.has(source) || !nodeIds.has(target)) return null
  const id = normalizeTestText(link[0]) || String(index + 1)
  return {
    id,
    source,
    target,
    sourceHandle: normalizeTestText(link[2]),
    targetHandle: normalizeTestText(link[4]),
    edgeId: `lumina-link-${id}-${source}-${target}`,
  }
}

const readRawLuminaCanvasShape = (value: unknown) => {
  const record = asJsonRecord(value)
  const rawNodes = asJsonArray(record?.nodes).filter(entry => asJsonRecord(entry))
  const groups = asJsonArray(record?.groups).map(readRawGroup).filter(Boolean) as RawLuminaGroup[]
  const rawNodeIds = rawNodes.map(readRawNodeId)
  const graphNodeIds = new Set([...rawNodeIds, ...groups.map(group => group.id)])
  const links = asJsonArray(record?.links)
    .map((link, index) => readRawLink(link, index, graphNodeIds))
    .filter(Boolean) as RawLuminaLink[]
  return {
    groups,
    links,
    rawNodes,
    rawNodeIds,
  }
}

const readGraphProperties = (value: { properties?: unknown } | null | undefined): JsonRecord => {
  return asJsonRecord(value?.properties) || {}
}

const typedStringField = (key: string, value: string): string => {
  return `${key}: {key: ${key}, type: string, value: ${JSON.stringify(value)}}`
}

const imageReferenceUrlPattern = /\.(?:png|jpe?g|webp|gif|svg)(?:\?|#|$)/i
const starterCarryOverPattern = /(?:starter[-_ ]template|storyboard-card-)/i

function readLuminaCanvasFixtureInput(): { name: string; text: string } | null {
  const inputPath = String(process.env.AGENTIC_OS_LUMINA_CANVAS_FIXTURE || '').trim()
    || String(process.env.AG_TEST_VALIDATION_FORBID_HARDCODE_IN_REPO || '').trim()
  if (!existsSync(inputPath)) return null
  return {
    name: basename(inputPath) || 'lumina-canvas.json',
    text: readFileSync(inputPath, 'utf8'),
  }
}

export async function testWorkspaceImportBytePlusLuminaCanvasJsonBuildsStoryboardStrybldrSurface() {
  const input = readLuminaCanvasFixtureInput()
  if (!input) return

  if (!looksLikeBytePlusLuminaCanvasText(input.text)) {
    throw new Error('expected Lumina fixture to be recognized by the structural text detector before JSON parsing')
  }
  if (looksLikeBytePlusLuminaCanvasText('{"nodes":[],"links":[]}')) {
    throw new Error('expected generic nodes/links JSON to avoid the Lumina text detector')
  }
  const rawJsonMarkdown = tryBuildJsonMarkdownDocumentFromText(input.text, 'table', { documentName: input.name })
  if (!rawJsonMarkdown?.markdown.startsWith('---\n')) {
    throw new Error('expected raw Lumina JSON-to-Markdown conversion to prefer byte-zero YAML frontmatter')
  }
  if (!rawJsonMarkdown.markdown.includes('flow:\n  direction: {key: direction, type: string, value: "LR"}\n  nodes:')) {
    throw new Error(`expected raw Lumina JSON-to-Markdown conversion to expose typed YAML flow nodes, got:\n${rawJsonMarkdown.markdown.slice(0, 1000)}`)
  }
  if (rawJsonMarkdown.markdown.includes('## groups')) {
    throw new Error('expected raw Lumina JSON-to-Markdown conversion to avoid generic object-array table fallback')
  }

  const parsedJson = JSON.parse(input.text) as unknown
  const rawShape = readRawLuminaCanvasShape(parsedJson)
  if (rawShape.rawNodes.length === 0 || rawShape.links.length === 0) {
    throw new Error(`expected Lumina validation input to expose raw nodes and valid links, got ${rawShape.rawNodes.length}/${rawShape.links.length}`)
  }
  const expectedGraphNodeCount = rawShape.rawNodes.length + rawShape.groups.length
  const expectedGraphEdgeCount = rawShape.links.length
  const firstRawLink = rawShape.links[0]
  const firstRawNode = rawShape.rawNodes[0]
  const firstRawNodeId = rawShape.rawNodeIds[0]
  if (!firstRawNode || !firstRawNodeId || !firstRawLink) {
    throw new Error('expected Lumina validation input to expose first raw node and first valid link')
  }
  const firstRawNodePosition = readRawNodePosition(firstRawNode)
  const firstRawLinkWithHandle = rawShape.links.find(link => link.sourceHandle || link.targetHandle)
  const parsed = parseGraphFromJson(input.name, parsedJson).data
  const metadata = parsed.metadata as Record<string, unknown> | null
  if (parsed.context !== 'strybldr-storyboard') {
    throw new Error(`expected Lumina canvas to parse as strybldr-storyboard context, got ${String(parsed.context || '')}`)
  }
  if (metadata?.sourceKind !== 'byteplus-lumina-canvas' || metadata?.kgStrybldrStoryboard !== true) {
    throw new Error(`expected Lumina metadata to opt into shared Storyboard/Strybldr rendering, got ${JSON.stringify(metadata)}`)
  }
  if (parsed.nodes.length !== expectedGraphNodeCount || parsed.edges.length !== expectedGraphEdgeCount) {
    throw new Error(`expected Lumina fidelity to preserve raw nodes, groups, and links, got ${parsed.nodes.length}/${parsed.edges.length} from ${expectedGraphNodeCount}/${expectedGraphEdgeCount}`)
  }
  if (!parsed.edges.every(edge => (edge.properties as Record<string, unknown> | undefined)?.strybldrWorkflowEdge === true)) {
    throw new Error('expected every preserved Lumina link to opt into shared Storyboard edge rendering')
  }
  const parsedLuminaModelProperties = parsed.nodes
    .map(node => readGraphProperties(node))
    .filter(properties => normalizeTestText(properties.luminaModelName))
  if (parsedLuminaModelProperties.some(properties => normalizeTestText(properties.chatModel))) {
    throw new Error('expected Lumina source model metadata to avoid editable chatModel projection')
  }
  const parsedRawLuminaProperties = parsed.nodes
    .filter(node => rawShape.rawNodeIds.includes(String(node.id)))
    .map(node => readGraphProperties(node))
  const canonicalCardTextLeaks = parsedRawLuminaProperties.flatMap((properties, index) => {
    const leakedKeys = ['summary', 'output', 'action', 'dialogue'].filter(key => normalizeTestText(properties[key]))
    return leakedKeys.length > 0 ? [`${rawShape.rawNodeIds[index]}:${leakedKeys.join(',')}`] : []
  })
  if (canonicalCardTextLeaks.length > 0) {
    throw new Error(`expected Lumina source text to avoid starter-style canonical Storyboard fields, got ${canonicalCardTextLeaks.join('; ')}`)
  }
  const parsedNodeIds = new Set(parsed.nodes.map(node => String(node.id)))
  const missingEdgeEndpointIds = rawShape.links.flatMap(link => [link.source, link.target]).filter(nodeId => !parsedNodeIds.has(nodeId))
  if (missingEdgeEndpointIds.length > 0) {
    throw new Error(`expected every Lumina link endpoint to resolve to parsed graph nodes, missing ${Array.from(new Set(missingEdgeEndpointIds)).join(', ')}`)
  }
  const graphLookup = getCachedGraphLookup({
    cacheScope: 'byteplus-lumina-canvas-test',
    graphData: parsed,
    graphRevision: 1,
    graphSemanticKey: 'byteplus-lumina-canvas-test',
  })
  const graphMedia = listMediaOverlayNodes({
    enabled: true,
    nodes: parsed.nodes,
    poolMax: parsed.nodes.length,
    nodeById: graphLookup.nodeById,
  })
  const graphMediaNodeIds = graphMedia.map(media => String(media.id))
  if (new Set(graphMediaNodeIds).size !== graphMediaNodeIds.length) {
    throw new Error(`expected shared media overlay inventory to preserve media by graph node id without duplicate rows, got ${graphMediaNodeIds.join(', ')}`)
  }
  const graphMediaItems = graphMedia.map((media): CommandMenuRichMediaItem => {
    const kind = media.kind === 'svg'
      ? 'image'
      : media.kind === 'video' || media.kind === 'audio' || media.kind === 'model' || media.kind === 'iframe'
        ? media.kind
        : 'image'
    const openUrl = String(media.openUrl || media.url || '').trim()
    return {
      key: `graph-node-media:${media.id}:${kind}:${openUrl || media.url || 'srcdoc'}`,
      kind,
      source: 'graph',
      startLine: 0,
      label: `Node media: ${String(media.title || media.id)}`,
      panelTitle: String(media.title || media.id),
      src: String(media.url || ''),
      srcDoc: String(media.srcDoc || '') || undefined,
      openUrl: openUrl || undefined,
      nodeId: String(media.id),
    }
  })
  if (graphMediaItems.length > 0) {
    const firstGraphMediaItem = graphMediaItems[0]
    if (!firstGraphMediaItem) {
      throw new Error('expected graph media item guard to expose the first graph media item')
    }
    const markdownDuplicateOfFirstGraphMedia: CommandMenuRichMediaItem = {
      ...firstGraphMediaItem,
      key: 'markdown-duplicate-of-first-lumina-media',
      source: 'markdown',
      nodeId: undefined,
      renameOwner: { type: 'markdownLine', startLine: 1, href: firstGraphMediaItem.openUrl || firstGraphMediaItem.src || '', syntax: 'link' },
    }
    const dedupedGraphMediaItems = dedupeCommandMenuRichMediaItems([markdownDuplicateOfFirstGraphMedia, ...graphMediaItems])
    const graphMediaItemCount = dedupedGraphMediaItems.filter(item => item.source === 'graph').length
    const markdownDuplicateSurvived = dedupedGraphMediaItems.some(item => item.key === markdownDuplicateOfFirstGraphMedia.key)
    if (graphMediaItemCount !== graphMediaItems.length || markdownDuplicateSurvived) {
      throw new Error(`expected FloatingPanel Media inventory dedupe to preserve graph media rows and drop Markdown duplicates, got ${graphMediaItemCount}/${graphMediaItems.length} graph rows and duplicate=${markdownDuplicateSurvived}`)
    }
  }
  const markdownSource = readMarkdownSourceFidelityTextFromValue(parsed)
  if (!markdownSource?.startsWith('---\n')) {
    throw new Error('expected Lumina JSON graph to carry a byte-zero Markdown YAML frontmatter source projection')
  }
  if (!markdownSource.includes('flow:\n  direction: {key: direction, type: string, value: "LR"}\n  nodes:')) {
    throw new Error(`expected Lumina Markdown source projection to expose YAML-native flow nodes, got:\n${markdownSource.slice(0, 1000)}`)
  }
  if (!markdownSource.includes(`- ${typedStringField('id', firstRawNodeId)}`)) {
    throw new Error('expected Lumina Markdown source projection to keep flow.nodes ids as typed inline YAML maps')
  }
  if (firstRawNodePosition && !markdownSource.includes(`position: {key: position, type: object, value: ${JSON.stringify(firstRawNodePosition)}}`)) {
    throw new Error('expected Lumina Markdown source projection to preserve typed position objects')
  }
  if (markdownSource.includes(`- id: ${JSON.stringify(firstRawNodeId)}`)) {
    throw new Error('expected Lumina Markdown source projection to forbid scalar id fallback for typed flow.nodes')
  }
  if (!markdownSource.includes('strybldrWorkflowEdge: {key: strybldrWorkflowEdge, type: boolean, value: true}')) {
    throw new Error('expected Lumina Markdown source projection to preserve shared Strybldr workflow edge semantics')
  }
  if (firstRawLinkWithHandle?.sourceHandle && !markdownSource.includes(typedStringField('sourceHandle', firstRawLinkWithHandle.sourceHandle))) {
    throw new Error('expected Lumina Markdown source projection to preserve edge source handles')
  }
  if (firstRawLinkWithHandle?.targetHandle && !markdownSource.includes(typedStringField('targetHandle', firstRawLinkWithHandle.targetHandle))) {
    throw new Error('expected Lumina Markdown source projection to preserve edge target handles')
  }
  const rebuiltMarkdown = tryBuildJsonMarkdownDocumentFromText(JSON.stringify(parsed), 'table')
  if (!rebuiltMarkdown || rebuiltMarkdown.markdown !== markdownSource) {
    throw new Error('expected JSON <-> Markdown builder to recover the Lumina YAML frontmatter source from metadata.markdownSource')
  }
  if (starterCarryOverPattern.test(rawJsonMarkdown.markdown) || starterCarryOverPattern.test(markdownSource)) {
    throw new Error('expected Lumina Markdown projection to avoid starter-template carry-over markers')
  }
  const markdownRoundTrip = tryParseMarkdownFrontmatterFlowGraph(`${input.name.replace(/\.[^.]+$/, '')}.md`, markdownSource)
  if (!markdownRoundTrip) {
    throw new Error('expected Lumina Markdown source projection to parse back through the shared frontmatter-flow pipeline')
  }
  if (markdownRoundTrip.graphData.nodes.length !== expectedGraphNodeCount || markdownRoundTrip.graphData.edges.length !== expectedGraphEdgeCount) {
    throw new Error(`expected Lumina Markdown round-trip to keep graph cardinality, got ${markdownRoundTrip.graphData.nodes.length}/${markdownRoundTrip.graphData.edges.length} from ${expectedGraphNodeCount}/${expectedGraphEdgeCount}`)
  }
  const roundTripWorkflowEdges = markdownRoundTrip.graphData.edges.filter(edge => (edge.properties as Record<string, unknown> | undefined)?.strybldrWorkflowEdge === true)
  if (roundTripWorkflowEdges.length !== expectedGraphEdgeCount) {
    throw new Error(`expected Lumina Markdown round-trip to keep all Storyboard-renderable workflow edges, got ${roundTripWorkflowEdges.length}/${expectedGraphEdgeCount}`)
  }
  if (markdownRoundTrip.warnings.length > 0) {
    throw new Error(`expected Lumina Markdown round-trip to stay warning-free, got ${markdownRoundTrip.warnings.join(' | ')}`)
  }
  const roundTripFirstEdge = markdownRoundTrip.graphData.edges.find(edge => edge.id === firstRawLink.edgeId)
  if (
    !roundTripFirstEdge ||
    (roundTripFirstEdge.properties as Record<string, unknown> | undefined)?.sourcePort !== firstRawLink.sourceHandle ||
    (roundTripFirstEdge.properties as Record<string, unknown> | undefined)?.targetPort !== firstRawLink.targetHandle
  ) {
    throw new Error(`expected Lumina Markdown round-trip to keep source/target port metadata, got ${JSON.stringify(roundTripFirstEdge)}`)
  }
  const roundTripNodeById = new Map(markdownRoundTrip.graphData.nodes.map(node => [node.id, node]))
  for (const node of parsed.nodes) {
    const roundTripNode = roundTripNodeById.get(node.id)
    if (!roundTripNode) throw new Error(`expected Lumina Markdown round-trip to keep node ${node.id}`)
    const sourceProps = (node.properties || {}) as Record<string, unknown>
    const roundTripProps = (roundTripNode.properties || {}) as Record<string, unknown>
    const missingProps = Object.keys(sourceProps).filter(key => !Object.prototype.hasOwnProperty.call(roundTripProps, key))
    if (missingProps.length > 0) {
      throw new Error(`expected Lumina Markdown round-trip to preserve all source node properties for ${node.id}, missing ${missingProps.join(', ')}`)
    }
    const changedProps = Object.keys(sourceProps).filter(key => JSON.stringify(sourceProps[key]) !== JSON.stringify(roundTripProps[key]))
    if (changedProps.length > 0) {
      throw new Error(`expected Lumina Markdown round-trip to preserve source node property values for ${node.id}, changed ${changedProps.join(', ')}`)
    }
  }

  const board = buildStoryboardBoardModel({ graphData: parsed, graphRevision: 1 })
  const parsedNodeById = new Map(parsed.nodes.map(node => [String(node.id), node]))
  const lanes = new Set(board.lanes.map(lane => lane.id))
  const expectedStoryboardLanes = new Set(parsed.nodes
    .filter(node => rawShape.rawNodeIds.includes(String(node.id)))
    .map(node => normalizeTestText(readGraphProperties(node).lane))
    .filter(Boolean))
  for (const expectedLane of expectedStoryboardLanes) {
    if (!lanes.has(expectedLane)) {
      throw new Error(`expected Lumina groups/fallbacks to become Storyboard lanes including ${expectedLane}, got ${Array.from(lanes).join(', ')}`)
    }
  }
  const cards = board.lanes.flatMap(lane => lane.cards)
  const cardIds = new Set(cards.map(card => card.id))
  const missingRawNodeCards = rawShape.rawNodeIds.filter(nodeId => !cardIds.has(nodeId))
  if (board.totalCards !== rawShape.rawNodes.length || missingRawNodeCards.length > 0) {
    throw new Error(`expected Lumina raw nodes to render as Storyboard cards, got ${board.totalCards}/${rawShape.rawNodes.length} cards and missing ${missingRawNodeCards.join(', ')}`)
  }
  const mismatchedTypeLabels = cards.flatMap(card => {
    const nodeProperties = readGraphProperties(parsedNodeById.get(card.id))
    const expectedTypeLabel = normalizeTestText(nodeProperties.cardTypeLabel || nodeProperties.nodeTypeLabel)
    return expectedTypeLabel && card.typeLabel !== expectedTypeLabel
      ? [`${card.id}:${card.typeLabel}->${expectedTypeLabel}`]
      : []
  })
  if (mismatchedTypeLabels.length > 0) {
    throw new Error(`expected Lumina Storyboard cards to render native node type labels, got ${mismatchedTypeLabels.join(', ')}`)
  }
  const mismatchedSourceModels = cards.flatMap(card => {
    const nodeProperties = readGraphProperties(parsedNodeById.get(card.id))
    const expectedSourceModel = normalizeTestText(nodeProperties.luminaModelName || nodeProperties.sourceModel)
    return expectedSourceModel && card.sourceModelLabel !== expectedSourceModel
      ? [`${card.id}:${card.sourceModelLabel}->${expectedSourceModel}`]
      : []
  })
  if (mismatchedSourceModels.length > 0) {
    throw new Error(`expected Lumina Storyboard cards to render native source model labels, got ${mismatchedSourceModels.join(', ')}`)
  }
  const genericTextFieldCards = cards.flatMap(card => {
    const genericFields = [
      ['summary', card.summary],
      ['output', card.output],
      ['action', card.action],
      ['dialogue', card.dialogue],
    ].filter(([, value]) => normalizeTestText(value))
    return genericFields.length > 0 ? [`${card.id}:${genericFields.map(([key]) => key).join(',')}`] : []
  })
  if (genericTextFieldCards.length > 0) {
    throw new Error(`expected Lumina Storyboard cards to avoid generic Summary/Output/Action/Dialogue projection, got ${genericTextFieldCards.join('; ')}`)
  }
  const unlabeledSourcePromptCards = cards.flatMap(card => {
    const nodeProperties = readGraphProperties(parsedNodeById.get(card.id))
    return normalizeTestText(card.prompt) && !normalizeTestText(card.sourcePromptLabel || nodeProperties.sourcePromptLabel)
      ? [card.id]
      : []
  })
  if (unlabeledSourcePromptCards.length > 0) {
    throw new Error(`expected Lumina Storyboard prompt cards to carry native source prompt labels, got ${unlabeledSourcePromptCards.join(', ')}`)
  }
  const cardProjectionText = cards.map(card => [
    card.id,
    card.title,
    card.typeLabel,
    card.lane,
    card.summary,
    card.prompt,
    card.output,
  ].join('\n')).join('\n')
  if (starterCarryOverPattern.test(cardProjectionText)) {
    throw new Error('expected Lumina Storyboard cards to avoid starter-template carry-over markers')
  }
  const mediaCards = cards.filter(card => card.media)
  if (mediaCards.length !== graphMedia.length) {
    throw new Error(`expected Storyboard cards to preserve graph media inventory, got ${mediaCards.length}/${graphMedia.length}`)
  }
  const localMediaCardsWithoutRenderableUrl = mediaCards.flatMap(card => {
    const sourceUrl = normalizeTestText(card.media?.sourceUrl)
    if (!/^(?:input|output)\//.test(sourceUrl)) return []
    const renderUrl = normalizeTestText(card.media?.url)
    return renderUrl.startsWith('https://lumi-api.console.byteplus.com/api/storage/objects/lumi/')
      || renderUrl.startsWith('data:image/svg+xml')
      ? []
      : [`${card.id}:${renderUrl}->${sourceUrl}`]
  })
  if (localMediaCardsWithoutRenderableUrl.length > 0) {
    throw new Error(`expected local Lumina media cards to expose renderable URLs while retaining source paths, got ${localMediaCardsWithoutRenderableUrl.join('; ')}`)
  }
  const graphMediaKinds = new Set(graphMedia
    .map(media => media.kind === 'svg' ? 'image' : media.kind)
    .filter((kind): kind is 'image' | 'video' | 'audio' | 'iframe' => kind === 'image' || kind === 'video' || kind === 'audio' || kind === 'iframe'))
  const cardMediaKinds = new Set(mediaCards.map(card => card.media?.kind === 'svg' ? 'image' : card.media?.kind).filter(Boolean))
  for (const mediaKind of graphMediaKinds) {
    if (!cardMediaKinds.has(mediaKind)) {
      throw new Error(`expected Storyboard cards to preserve graph media kind ${mediaKind}, got ${Array.from(cardMediaKinds).join(', ')}`)
    }
  }
  const parsedVideoWithImageReference = parsed.nodes.find(node => {
    const properties = readGraphProperties(node)
    const references = Array.isArray(properties.referenceUrls) ? properties.referenceUrls : []
    return properties.mediaKind === 'video' && references.some(reference => imageReferenceUrlPattern.test(String(reference)))
  })
  if (parsedVideoWithImageReference) {
    const videoCard = cards.find(card => card.id === String(parsedVideoWithImageReference.id))
    if (!videoCard || videoCard.media?.kind !== 'video' || !videoCard.references.some(reference => reference.kind === 'image' || reference.kind === 'svg')) {
      throw new Error(`expected generated video card to retain image references, got ${JSON.stringify(videoCard)}`)
    }
  }
  if (!shouldApplyImportedCanvasDocumentToGraph({ path: input.name, text: input.text })) {
    throw new Error('expected Lumina JSON import policy to opt into graph-aware landing')
  }
  const loadedOnce = await loadGraphDataFromTextViaParser(input.name, input.text, { applyToStore: false, syncMarkdownDocument: false })
  if (loadedOnce?.parserId !== 'json' || loadedOnce.graphData?.nodes.length !== expectedGraphNodeCount) {
    throw new Error(`expected Lumina loader fast path to parse fixture as json once, got ${String(loadedOnce?.parserId || '')}/${loadedOnce?.graphData?.nodes.length || 0}`)
  }
  const previousJsonParse = JSON.parse
  let jsonParseCalls = 0
  JSON.parse = ((source: string, reviver?: Parameters<typeof JSON.parse>[1]) => {
    jsonParseCalls += 1
    return previousJsonParse(source, reviver)
  }) as typeof JSON.parse
  try {
    const loadedAgain = await loadGraphDataFromTextViaParser(input.name, input.text, { applyToStore: false, syncMarkdownDocument: false })
    if (loadedAgain?.parserId !== 'json' || loadedAgain.graphData?.edges.length !== expectedGraphEdgeCount) {
      throw new Error(`expected cached Lumina loader result to preserve graph fidelity, got ${String(loadedAgain?.parserId || '')}/${loadedAgain?.graphData?.edges.length || 0}`)
    }
  } finally {
    JSON.parse = previousJsonParse
  }
  if (jsonParseCalls !== 0) {
    throw new Error(`expected repeated Lumina loader import to reuse parser cache without reparsing JSON, saw ${jsonParseCalls} JSON.parse calls`)
  }

  const { restore } = initJsdomHarness()
  try {
    resetWorkspaceFsForTests()
    const store = useGraphStore.getState()
    store.resetAll()
    store.setCanvasRenderMode('2d')
    store.setCanvas2dRenderer('d3')

    const fs = createMemoryWorkspaceFs()
    await fs.ensureSeed()
    const result = await importWorkspaceLocalFiles({
      fs,
      files: [createFile(input.name, input.text)] as unknown as FileList,
      parentPath: '/',
    })
    const applyToGraph = await resolveImportedCanvasDocumentApplyToGraph({ fs, createdPaths: result.createdPaths })
    if (!applyToGraph) throw new Error('expected imported Lumina JSON to resolve graph-aware apply')
    await applyWorkspaceImportToCanvas({
      fs,
      createdPaths: result.createdPaths,
      opts: { applyToGraph: true, skipComposedGraphApply: true },
    })

    const next = useGraphStore.getState()
    if (next.canvasRenderMode !== '2d' || next.canvas2dRenderer !== 'storyboard') {
      throw new Error(`expected Lumina import to activate 2D Storyboard renderer, got ${next.canvasRenderMode}/${next.canvas2dRenderer}`)
    }
    if (String(next.floatingPanelView) === 'strybldr') {
      throw new Error('expected Lumina import to avoid stale FloatingPanel Strybldr activation')
    }
    const parsedSource = next.sourceFiles.find(file => file.name === input.name)?.parsedGraphData
    if (!parsedSource || parsedSource.nodes.length !== expectedGraphNodeCount || parsedSource.edges.length !== expectedGraphEdgeCount) {
      throw new Error(`expected imported Lumina source file to keep parsed graph data, got ${parsedSource?.nodes.length || 0}/${parsedSource?.edges.length || 0}`)
    }

    const previousFetch = globalThis.fetch
    const fetchCalls: string[] = []
    globalThis.fetch = (async (fetchInput: RequestInfo | URL) => {
      fetchCalls.push(String(fetchInput))
      return new Response(input.text, {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }) as typeof fetch
    try {
      const fetched = await fetchWorkspaceUrlContent(`http://localhost/@fs/Users/test/${input.name}?agentic_os_lumina_same_origin=1`, { mode: 'import' })
      if (fetchCalls[0] !== `/@fs/Users/test/${input.name}?agentic_os_lumina_same_origin=1`) {
        throw new Error(`expected same-origin /@fs Lumina URL import to use direct fetch path, got ${String(fetchCalls[0] || '')}`)
      }
      if (fetched.text !== input.text || fetched.name !== input.name) {
        throw new Error(`expected same-origin /@fs URL import to preserve JSON text/name, got ${fetched.name} and ${fetched.text.length} chars`)
      }
    } finally {
      globalThis.fetch = previousFetch
    }
  } finally {
    restore()
  }
}
