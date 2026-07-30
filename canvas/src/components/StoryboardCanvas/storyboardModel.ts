import { inferMediaKindFromResourceUrl, resolveRenderableMediaResource, type UrlMediaKind } from '@/lib/graph/mediaUrlKind'
import { buildScopedGraphSemanticKey } from '@/lib/graph/semanticKey'
import type { GraphData, GraphNode, JSONValue } from '@/lib/graph/types'
import type { WidgetRegistryEntry } from '@/features/storyboard-widget-manager/widgetRegistryTypes'
import type { FlowConnectedValuesBySchemaPath } from '@/lib/storyboardWidget/flowDataflow'
import { computeRichMediaOverlayConnectedValuesByNodeId } from '@/lib/render/richMediaSsot'
import { normalizeRichMediaPanelInlineSrcDoc } from '@/lib/render/richMediaPanelSrcDoc'
import { isRichMediaPanelNode } from '@/lib/render/richMediaPanelNode'
import { GRAPH_KEYWORD_LANE_PROPERTY_KEYS, readGraphKeywordTermsFromProperties } from '@/lib/graph/keywordTerms'
import { unwrapGraphCellValue } from '@/lib/graph/nodeProperties'
import {
  GRAPH_NODE_CARD_ACTION_PROPERTY_KEYS,
  GRAPH_NODE_CARD_DIALOGUE_PROPERTY_KEYS,
  GRAPH_NODE_CARD_OUTPUT_PROPERTY_KEYS,
  GRAPH_NODE_CARD_PROMPT_PROPERTY_KEYS,
  GRAPH_NODE_CARD_SUMMARY_PROPERTY_KEYS,
  GRAPH_NODE_CARD_TITLE_PROPERTY_KEYS,
  readGraphNodeAuthoredTextProperty,
} from '@/lib/cards/graphNodeCardFields'
import { buildStoryboardInvocationTokensByLane, readStoryboardCardInvocationTokens } from '@/components/StoryboardCanvas/storyboardInvocationTokens'
import { readImageToThreeJsRenderMode, type ImageToThreeJsRenderMode } from '@/features/image-to-threejs/imageToThreeJsContract'
import { readStoryboardProbeTreeMultiSelectModel, type StoryboardProbeTreeMultiSelectModel } from '@/components/StoryboardCanvas/storyboardProbeTreeMultiSelectModel'
import { projectStoryboardMediaAlbumItems, STORYBOARD_CARD_MEDIA_ALBUM_PROPERTY, type StoryboardMediaAlbumItem } from '@/components/StoryboardCanvas/storyboardCardMediaAlbum'
import { resolveWidgetNodeTitle } from '@/components/StoryboardWidget/widgetEditorTitle'
import {
  buildStoryboardCardConnectedProjection,
  type StoryboardCardConnectedProjection,
  type StoryboardCardSourceReference,
} from '@/components/StoryboardCanvas/storyboardCardConnectedSources'
import {
  isStructuralStoryboardNodeType,
  isStoryboardCardNodeType,
  resolveStoryboardCardLaneLabel,
  resolveStoryboardCardTypeLabel,
} from '@/components/StoryboardCanvas/storyboardCardIdentity'
import {
  normalizeStoryboardText as normalizeText,
  readStoryboardNumber as readNumber,
  readStoryboardString as readString,
  readStoryboardStringList as readStringList,
} from '@/components/StoryboardCanvas/storyboardModelScalars'
import { selectRenderableStoryboardCards } from '@/components/StoryboardCanvas/storyboardCardVisibility'
export const STORYBOARD_EMPTY_LANE = 'Storyboard'
export const STORYBOARD_CANVAS_RICH_MEDIA_PANEL_PROPERTY = 'storyboardCanvasRichMediaPanel' as const
const LANE_PROPERTY_KEYS = GRAPH_KEYWORD_LANE_PROPERTY_KEYS
export const STORYBOARD_TITLE_PROPERTY_KEYS = GRAPH_NODE_CARD_TITLE_PROPERTY_KEYS
export const STORYBOARD_SUMMARY_PROPERTY_KEYS = GRAPH_NODE_CARD_SUMMARY_PROPERTY_KEYS
export const STORYBOARD_OUTPUT_PROPERTY_KEYS = GRAPH_NODE_CARD_OUTPUT_PROPERTY_KEYS
const ORDER_PROPERTY_KEYS = ['order', 'sort', 'sequence', 'sceneOrder', 'shotOrder', 'index', 'rank'] as const
const INDEX_PROPERTY_KEYS = ['frame', 'frameNumber', 'sceneNumber', 'shotNumber', 'panelNumber', 'number', 'index', 'step', 'stepNumber', 'sequenceNumber', 'position', 'ordinal'] as const
const META_PROPERTY_KEYS = ['owner', 'priority'] as const
const MEDIA_PROPERTY_KEYS = ['renderUrl', 'embedUrl', 'media_url', 'mediaUrl', 'image', 'imageUrl', 'video', 'videoUrl', 'audio', 'audioUrl', 'audio_url', 'src', 'url'] as const
const LINK_PROPERTY_KEYS = ['url', 'href', 'link', 'sourceUrl', 'source_url', 'briefUrl', 'assetUrl', 'documentUrl'] as const
const MEDIA_SOURCE_PROPERTY_KEYS = ['mediaSourceUrl', 'media_source_url', 'sourceMediaUrl', 'source_media_url', 'luminaOutputPath'] as const
const THUMBNAIL_PROPERTY_KEYS = ['thumbnailUrl', 'thumbnail_url', 'posterUrl', 'poster_url', 'poster', 'coverUrl', 'cover_url'] as const
const TYPE_LABEL_PROPERTY_KEYS = ['cardTypeLabel', 'nodeTypeLabel', 'typeLabel', 'luminaTitle', 'luminaNodeTitle'] as const
const SOURCE_MODEL_PROPERTY_KEYS = ['sourceModel', 'modelLabel', 'nativeModel', 'luminaModelName'] as const
const SOURCE_PROMPT_LABEL_PROPERTY_KEYS = ['sourcePromptLabel', 'promptLabel', 'nativePromptLabel'] as const
const SLUGLINE_PROPERTY_KEYS = ['slugline'] as const
const LOCATION_PROPERTY_KEYS = ['location', 'setting', 'place', 'surface', 'context'] as const
const TIME_PROPERTY_KEYS = ['timeOfDay', 'time', 'dayPart', 'moment', 'state'] as const
export const STORYBOARD_ACTION_PROPERTY_KEYS = GRAPH_NODE_CARD_ACTION_PROPERTY_KEYS
export const STORYBOARD_DIALOGUE_PROPERTY_KEYS = GRAPH_NODE_CARD_DIALOGUE_PROPERTY_KEYS
export const STORYBOARD_PROMPT_PROPERTY_KEYS = GRAPH_NODE_CARD_PROMPT_PROPERTY_KEYS
const STYLE_PROPERTY_KEYS = ['style', 'look', 'treatment', 'theme', 'preset', 'variant'] as const
const REFERENCE_PROPERTY_KEYS = ['references', 'referenceUrls', 'reference_urls', 'referenceImages', 'reference_images', 'moodboard', 'referenceLinks', 'reference_links', 'refs', 'assets', 'assetRefs', 'asset_refs'] as const
type GraphNodeProperties = Record<string, JSONValue>
export const STORYBOARD_CARD_CLEAN_SLATE_PROPERTY_KEYS = [
  ...STORYBOARD_SUMMARY_PROPERTY_KEYS,
  ...STORYBOARD_OUTPUT_PROPERTY_KEYS,
  ...STORYBOARD_ACTION_PROPERTY_KEYS,
  ...STORYBOARD_DIALOGUE_PROPERTY_KEYS,
  ...STORYBOARD_PROMPT_PROPERTY_KEYS,
  ...MEDIA_PROPERTY_KEYS,
  ...LINK_PROPERTY_KEYS,
  ...MEDIA_SOURCE_PROPERTY_KEYS,
  ...THUMBNAIL_PROPERTY_KEYS,
  ...REFERENCE_PROPERTY_KEYS,
  'mediaKind',
  'media_kind',
  'outputSrcDoc',
] as const

export function clearStoryboardCardCleanSlateProperties(
  properties: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  const nextProperties: Record<string, unknown> = { ...(properties || {}) }
  const nestedProperties = isPlainObject(nextProperties.properties)
    ? { ...nextProperties.properties }
    : null
  for (const key of STORYBOARD_CARD_CLEAN_SLATE_PROPERTY_KEYS) {
    delete nextProperties[key]
    if (nestedProperties) delete nestedProperties[key]
  }
  if (nestedProperties) nextProperties.properties = nestedProperties
  return nextProperties
}

export type StoryboardCardMedia = {
  kind: UrlMediaKind
  url: string
  srcDoc?: string
  sourceUrl: string
  thumbnailUrl?: string | null
  renderMode?: ImageToThreeJsRenderMode
}
export type StoryboardCardReference = {
  kind: UrlMediaKind | 'link'
  url: string
}
export type StoryboardCardModel = {
  id: string
  title: string
  summary: string
  output: string
  lane: string
  lanePropertyKey: string
  typeLabel: string
  indexLabel: string
  slugline: string
  action: string
  dialogue: string
  prompt: string
  style: string
  tags: string[]
  meta: string[]
  invocationTokens: string[]
  sourceModelLabel: string
  sourcePromptLabel: string
  href: string
  media: StoryboardCardMedia | null
  mediaItems?: StoryboardMediaAlbumItem[]
  references: StoryboardCardReference[]
  order: number
  inputIndex: number
  candidateScore: number
  structural: boolean
  probeTreeMultiSelect?: StoryboardProbeTreeMultiSelectModel | null
  sourceReferences?: readonly StoryboardCardSourceReference[]
  connectedTextFieldId?: StoryboardCardConnectedProjection['connectedTextFieldId']
}
export type StoryboardLaneModel = {
  id: string
  label: string
  cards: StoryboardCardModel[]
}
export type StoryboardBoardModel = {
  semanticKey: string
  lanes: StoryboardLaneModel[]
  totalCards: number
}
const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}
const readNodeProperties = (node: GraphNode): GraphNodeProperties => {
  const properties = unwrapGraphCellValue(node.properties)
  return isPlainObject(properties) ? (properties as GraphNodeProperties) : {}
}

const isStoryboardCanvasRichMediaPanelNode = (node: GraphNode): boolean => {
  const properties = readNodeProperties(node)
  if (unwrapGraphCellValue(properties[STORYBOARD_CANVAS_RICH_MEDIA_PANEL_PROPERTY]) === true) return true
  return isRichMediaPanelNode(node) && MEDIA_PROPERTY_KEYS.some(key => !!readString(properties[key]))
}

const readFirstPropertyString = (properties: GraphNodeProperties, keys: readonly string[]): string => {
  for (const key of keys) {
    const text = readString(properties[key])
    if (text) return text
  }
  return ''
}

const readFirstPropertyScalar = (properties: GraphNodeProperties, keys: readonly string[]): string => {
  for (const key of keys) {
    const value = properties[key]
    const text = readString(value)
    if (text) return text
    if (Array.isArray(value) && value.length > 0) {
      const first = readString(value[0])
      if (first) return first
    }
  }
  return ''
}

const readFirstPropertyNumber = (properties: GraphNodeProperties, keys: readonly string[]): number | null => {
  for (const key of keys) {
    const value = readNumber(properties[key])
    if (value !== null) return value
  }
  return null
}

const readDeclaredMediaKind = (properties: GraphNodeProperties): UrlMediaKind | null => {
  const mediaKind = readString(properties.mediaKind).toLowerCase()
  const mimeHint = readString(properties.mimeHint).toLowerCase()
  if (mediaKind === 'image' || mimeHint.startsWith('image/')) return mimeHint.includes('svg') ? 'svg' : 'image'
  if (mediaKind === 'video' || mimeHint.startsWith('video/')) return 'video'
  if (mediaKind === 'audio' || mimeHint.startsWith('audio/')) return 'audio'
  return null
}

const uniqueStrings = (values: readonly string[]): string[] => {
  const seen = new Set<string>()
  const out: string[] = []
  for (const value of values) {
    const text = normalizeText(value)
    if (!text) continue
    const key = text.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(text)
  }
  return out
}

const STORYBOARD_INLINE_MEDIA_CONTEXT_IMAGE_KINDS = new Set<UrlMediaKind>(['image', 'svg'])
const STORYBOARD_INLINE_MEDIA_CONTEXT_VIDEO_KINDS = new Set<UrlMediaKind>(['video', 'iframe'])

export function buildStoryboardInlineMediaCommandContext(card: StoryboardCardModel): string {
  const lines: string[] = []
  const seen = new Set<string>()
  const pushUrl = (key: string, url: unknown) => {
    const text = readString(url)
    if (!text) return
    const dedupeKey = `${key}:${text}`.toLowerCase()
    if (seen.has(dedupeKey)) return
    seen.add(dedupeKey)
    lines.push(`${key}: "${text}"`)
  }

  const media = card.media
  if (media) {
    if (STORYBOARD_INLINE_MEDIA_CONTEXT_IMAGE_KINDS.has(media.kind)) pushUrl('imageUrl', media.url)
    if (STORYBOARD_INLINE_MEDIA_CONTEXT_VIDEO_KINDS.has(media.kind)) pushUrl('videoUrl', media.sourceUrl || media.url)
    if (media.thumbnailUrl) pushUrl('thumbnailUrl', media.thumbnailUrl)
  }

  card.references.forEach((reference, referenceIndex) => {
    if (reference.kind === 'image' || reference.kind === 'svg') {
      pushUrl(`referenceImageUrl${referenceIndex + 1}`, reference.url)
      return
    }
    if (reference.kind === 'video' || reference.kind === 'iframe') {
      pushUrl(`referenceVideoUrl${referenceIndex + 1}`, reference.url)
    }
  })

  return lines.join('\n')
}

const readPropertyLists = (properties: GraphNodeProperties, keys: readonly string[]): string[] => {
  return uniqueStrings(keys.flatMap(key => readStringList(properties[key])))
}

const readStoryboardMedia = (node: GraphNode, properties: GraphNodeProperties): StoryboardCardMedia | null => {
  const renderMode = readImageToThreeJsRenderMode(properties)
  const outputSrcDoc = readString(properties.outputSrcDoc)
  if (outputSrcDoc) {
    return {
      kind: 'iframe',
      url: '',
      srcDoc: normalizeRichMediaPanelInlineSrcDoc({
        srcDoc: outputSrcDoc,
        title: node.label || node.id || 'Storyboard card',
      }),
      sourceUrl: '',
      thumbnailUrl: null,
    }
  }
  const declaredKind = readDeclaredMediaKind(properties)
  const explicitThumbnailUrl = readFirstPropertyString(properties, THUMBNAIL_PROPERTY_KEYS)
  const explicitMediaSourceUrl = readFirstPropertyString(properties, MEDIA_SOURCE_PROPERTY_KEYS)
  for (const key of MEDIA_PROPERTY_KEYS) {
    const url = readString(properties[key])
    if (!url) continue
    const resource = resolveRenderableMediaResource(url, declaredKind)
    if (!resource) continue
    const sourceUrl = explicitMediaSourceUrl || (key === 'renderUrl' || key === 'embedUrl'
      ? readFirstPropertyString(properties, LINK_PROPERTY_KEYS) || readFirstPropertyString(properties, ['mediaUrl', 'media_url']) || resource.sourceUrl
      : resource.sourceUrl)
    return {
      ...resource,
      sourceUrl,
      thumbnailUrl: explicitThumbnailUrl || resource.thumbnailUrl || null,
      ...(renderMode && (resource.kind === 'image' || resource.kind === 'svg') ? { renderMode } : {}),
    }
  }
  if (typeof node.type === 'string' && /\b(image|video)\b/i.test(node.type)) {
    const url = readFirstPropertyString(properties, LINK_PROPERTY_KEYS)
    if (!url) return null
    const resource = resolveRenderableMediaResource(url, declaredKind)
    return resource
      ? {
          ...resource,
          thumbnailUrl: explicitThumbnailUrl || resource.thumbnailUrl || null,
          ...(renderMode && (resource.kind === 'image' || resource.kind === 'svg') ? { renderMode } : {}),
        }
      : null
  }
  return null
}

const readStoryboardReferences = (properties: GraphNodeProperties, media: StoryboardCardMedia | null): StoryboardCardReference[] => {
  const out: StoryboardCardReference[] = []
  const seen = new Set<string>()
  if (media?.url) seen.add(media.url.toLowerCase())
  if (media?.sourceUrl) seen.add(media.sourceUrl.toLowerCase())
  if (media?.thumbnailUrl) {
    const thumbnailUrl = media.thumbnailUrl
    const normalized = thumbnailUrl.toLowerCase()
    if (!seen.has(normalized)) {
      seen.add(normalized)
      out.push({ kind: 'image', url: thumbnailUrl })
    }
  }
  for (const url of readPropertyLists(properties, REFERENCE_PROPERTY_KEYS)) {
    const normalized = url.toLowerCase()
    if (seen.has(normalized)) continue
    seen.add(normalized)
    const kind = inferMediaKindFromResourceUrl(url)
    out.push({
      kind: kind ?? 'link',
      url,
    })
  }
  return out
}

const readStoryboardHref = (properties: GraphNodeProperties, media: StoryboardCardMedia | null): string => {
  if (media?.sourceUrl) return media.sourceUrl
  if (media?.url) return media.url
  return readFirstPropertyString(properties, LINK_PROPERTY_KEYS)
}

const readLaneLabel = (node: GraphNode, properties: GraphNodeProperties): string => {
  const explicit = readFirstPropertyString(properties, LANE_PROPERTY_KEYS)
  const nodeType = readString(node.type)
  return resolveStoryboardCardLaneLabel(nodeType, explicit, STORYBOARD_EMPTY_LANE)
}

const readLanePropertyKey = (properties: GraphNodeProperties): string => {
  for (const key of LANE_PROPERTY_KEYS) {
    const text = readString(properties[key])
    if (text) return key
    const value = properties[key]
    if (Array.isArray(value) && value.length > 0) {
      const first = readString(value[0])
      if (first) return key
    }
  }
  return 'stage'
}

const readTypeLabel = (node: GraphNode, properties: GraphNodeProperties): string => {
  const explicit = readFirstPropertyString(properties, TYPE_LABEL_PROPERTY_KEYS)
  const nodeType = readString(node.type)
  return resolveStoryboardCardTypeLabel(nodeType, explicit)
}

const readSourceModelLabel = (properties: GraphNodeProperties): string => {
  return readFirstPropertyString(properties, SOURCE_MODEL_PROPERTY_KEYS)
}

const readSourcePromptLabel = (properties: GraphNodeProperties): string => {
  return readFirstPropertyString(properties, SOURCE_PROMPT_LABEL_PROPERTY_KEYS)
}

const readIndexLabel = (properties: GraphNodeProperties): string => {
  return readFirstPropertyScalar(properties, INDEX_PROPERTY_KEYS)
}

const readCardTitle = (node: GraphNode, properties: GraphNodeProperties): string => {
  const label = readString(node.label)
  if (label) return resolveWidgetNodeTitle({ node })
  const propertyTitle = readFirstPropertyString(properties, STORYBOARD_TITLE_PROPERTY_KEYS)
  if (propertyTitle) return propertyTitle
  const id = readString(node.id)
  return id || 'Untitled'
}

const readCardSummary = (properties: GraphNodeProperties): string => {
  return readGraphNodeAuthoredTextProperty(properties, STORYBOARD_SUMMARY_PROPERTY_KEYS)
}

const readCardOutput = (properties: GraphNodeProperties): string => {
  return readGraphNodeAuthoredTextProperty(properties, STORYBOARD_OUTPUT_PROPERTY_KEYS)
}

const readCardSlugline = (properties: GraphNodeProperties): string => {
  const explicit = readFirstPropertyString(properties, SLUGLINE_PROPERTY_KEYS)
  if (explicit) return explicit
  const location = readFirstPropertyString(properties, LOCATION_PROPERTY_KEYS)
  const time = readFirstPropertyString(properties, TIME_PROPERTY_KEYS)
  if (location && time) return `${location} - ${time}`
  return location || time
}

const readCardAction = (properties: GraphNodeProperties): string => {
  return readGraphNodeAuthoredTextProperty(properties, STORYBOARD_ACTION_PROPERTY_KEYS)
}

const readCardDialogue = (properties: GraphNodeProperties): string => {
  return readGraphNodeAuthoredTextProperty(properties, STORYBOARD_DIALOGUE_PROPERTY_KEYS)
}

const readCardPrompt = (properties: GraphNodeProperties): string => {
  return readGraphNodeAuthoredTextProperty(properties, STORYBOARD_PROMPT_PROPERTY_KEYS)
}

const readCardStyle = (properties: GraphNodeProperties): string => {
  return readFirstPropertyString(properties, STYLE_PROPERTY_KEYS)
}

const readCardTags = (properties: GraphNodeProperties): string[] => {
  return readGraphKeywordTermsFromProperties(properties as Record<string, unknown>)
}

const readCardMeta = (properties: GraphNodeProperties): string[] => {
  return uniqueStrings(META_PROPERTY_KEYS.map(key => readString(properties[key])).filter(Boolean))
}

const computeCandidateScore = (args: {
  node: GraphNode
  lane: string
  summary: string
  output: string
  slugline: string
  action: string
  dialogue: string
  prompt: string
  style: string
  tags: string[]
  meta: string[]
  media: StoryboardCardMedia | null
  references: StoryboardCardReference[]
}): number => {
  let score = 0
  if (args.media) score += 4
  if (args.summary) score += 2
  if (args.output) score += 2
  if (args.slugline) score += 1
  if (args.action) score += 2
  if (args.dialogue) score += 2
  if (args.prompt) score += 1
  if (args.style) score += 1
  if (args.tags.length > 0) score += 1
  if (args.meta.length > 0) score += 1
  if (args.references.length > 0) score += 2
  if (args.lane !== STORYBOARD_EMPTY_LANE) score += 2
  const nodeType = readString(args.node.type)
  if (isStoryboardCardNodeType(nodeType)) score += 2
  return score
}

const buildCardModel = (node: GraphNode, inputIndex: number, stageTokensByLane: ReadonlyMap<string, readonly string[]>, connectedProjection: StoryboardCardConnectedProjection): StoryboardCardModel => {
  const properties = readNodeProperties(node)
  const media = readStoryboardMedia(node, properties)
  const references = readStoryboardReferences(properties, media)
  const lane = readLaneLabel(node, properties)
  const summary = readCardSummary(properties)
  const output = readCardOutput(properties)
  const slugline = readCardSlugline(properties)
  const action = readCardAction(properties)
  const dialogue = readCardDialogue(properties)
  const prompt = readCardPrompt(properties)
  const style = readCardStyle(properties)
  const tags = readCardTags(properties)
  const meta = readCardMeta(properties)
  const typeLabel = readTypeLabel(node, properties)
  const nodeType = readString(node.type)
  return {
    id: readString(node.id) || `node-${inputIndex}`,
    title: readCardTitle(node, properties),
    summary,
    output,
    lane,
    lanePropertyKey: readLanePropertyKey(properties),
    typeLabel,
    indexLabel: readIndexLabel(properties),
    slugline,
    action,
    dialogue,
    prompt,
    style,
    tags,
    meta,
    invocationTokens: readStoryboardCardInvocationTokens(node, lane, stageTokensByLane),
    sourceModelLabel: readSourceModelLabel(properties),
    sourcePromptLabel: readSourcePromptLabel(properties),
    href: readStoryboardHref(properties, media),
    media,
    mediaItems: projectStoryboardMediaAlbumItems(
      unwrapGraphCellValue(properties[STORYBOARD_CARD_MEDIA_ALBUM_PROPERTY]),
      media,
    ),
    references,
    order: readFirstPropertyNumber(properties, ORDER_PROPERTY_KEYS) ?? inputIndex,
    inputIndex,
    candidateScore: computeCandidateScore({
      node,
      lane,
      summary,
      output,
      slugline,
      action,
      dialogue,
      prompt,
      style,
      tags,
      meta,
      media,
      references,
    }),
    structural: isStructuralStoryboardNodeType(nodeType),
    probeTreeMultiSelect: readStoryboardProbeTreeMultiSelectModel(properties),
    sourceReferences: connectedProjection.sourceReferences,
    connectedTextFieldId: connectedProjection.connectedTextFieldId,
  }
}

const compareCards = (left: StoryboardCardModel, right: StoryboardCardModel): number => {
  if (left.order !== right.order) return left.order - right.order
  if (left.inputIndex !== right.inputIndex) return left.inputIndex - right.inputIndex
  return left.title.localeCompare(right.title)
}

export const buildStoryboardSemanticKey = (args: { graphData: GraphData | null; graphRevision: number }): string => {
  return buildScopedGraphSemanticKey('storyboard-canvas', {
    graphData: args.graphData,
    graphRevision: args.graphRevision,
  })
}

export const buildStoryboardBoardModel = (args: {
  graphData: GraphData | null
  graphRevision: number
  widgetRegistry?: ReadonlyArray<WidgetRegistryEntry> | null
  connectedValuesByNodeId?: ReadonlyMap<string, FlowConnectedValuesBySchemaPath> | null
}): StoryboardBoardModel => {
  const semanticKey = buildStoryboardSemanticKey(args)
  const nodes = Array.isArray(args.graphData?.nodes) ? args.graphData.nodes : []
  const cardNodes = nodes.filter(node => !isStoryboardCanvasRichMediaPanelNode(node))
  const stageTokensByLane = buildStoryboardInvocationTokensByLane(args.graphData)
  const connectedValuesByNodeId = args.connectedValuesByNodeId || (
    args.widgetRegistry
      ? computeRichMediaOverlayConnectedValuesByNodeId({
          graphData: args.graphData,
          registry: args.widgetRegistry,
          graphRevision: args.graphRevision,
          graphSemanticKey: semanticKey,
          extraNodeIds: cardNodes.map(node => String(node.id || '').trim()).filter(Boolean),
          includeMediaSpecNodes: true,
        })
      : null
  )
  const allCards = cardNodes.map((node, index) => {
    const connectedProjection = buildStoryboardCardConnectedProjection({
      graphData: args.graphData,
      node,
      connectedValuesBySchemaPath: connectedValuesByNodeId?.get(readString(node.id)),
    })
    return buildCardModel(connectedProjection.renderNode, index, stageTokensByLane, connectedProjection)
  })
  const cards = selectRenderableStoryboardCards(allCards)
  const lanesById = new Map<string, StoryboardLaneModel>()
  for (const card of cards) {
    const laneId = card.lane || STORYBOARD_EMPTY_LANE
    const existing = lanesById.get(laneId)
    if (existing) {
      existing.cards.push(card)
      continue
    }
    lanesById.set(laneId, { id: laneId, label: laneId, cards: [card] })
  }
  const lanes = Array.from(lanesById.values()).map(lane => ({
    ...lane,
    cards: lane.cards.slice().sort(compareCards),
  }))
  return {
    semanticKey,
    lanes,
    totalCards: cards.length,
  }
}
