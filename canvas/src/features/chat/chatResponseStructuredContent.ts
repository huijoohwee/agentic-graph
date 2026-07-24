import type { JSONValue } from '@/lib/graph/types'
import {
  FLOW_RICH_MEDIA_PANEL_NODE_TYPE_ID,
  FLOW_TEXT_GENERATION_NODE_TYPE_ID,
} from '@/lib/config.storyboard-widget'
import {
  appendEmbeddedStructuredTextCandidates,
  collectStructuredTextCandidates,
  parseYamlOrJsonValue,
  STRUCTURED_ENVELOPE_KEYS,
} from './chatResponseStructuredContentCandidates'
import { STRUCTURED_SURFACE_INLINE_COMPUTE_NODE_ID, STRUCTURED_SURFACE_INLINE_COMPUTE_SOURCE } from './chatResponseStructuredCompute'
import { collectStructuredFrontmatterFields, STRUCTURED_FRONTMATTER_FIELD_KEYS } from './chatResponseStructuredFrontmatter'
import { buildStructuredCardParentEdges } from './chatResponseStructuredParentEdges'
import { isRecord, mergeStructuredProperties, readFieldValue, readFirstString, readString, toJsonValue } from './chatResponseStructuredRecord'
import { containsMarkdownPipeTable } from '@/features/markdown/ui/markdownDataViewSerialize'
import { readStructuredTableMarkdown } from './chatResponseStructuredTables'
import { readGeospatialStructuredPayload } from './chatResponseStructuredGeospatial'
import {
  buildProbeTreeStructuredResponseProperties,
  isProbeTreeStructuredResponseCard,
  resolveProbeTreeStructuredResponseNodeTypeId,
} from './probeTreeStructuredResponseContract'
import {
  GENERATED_MARKDOWN_PIPE_TABLE_FORMAT,
  GENERATED_MARKDOWN_PIPE_TABLE_MIME_TYPE,
  normalizeGeneratedRichMediaTableProperties,
} from '@/features/rich-media/richMediaTablePersistence'
import {
  CHAT_RESPONSE_WIDGET_LAYOUT_META_KEYS,
  applyChatResponseWidgetPaletteLayout,
  inferChatResponseWidgetNodeTypeId,
  resolveChatResponseTargetHandleForKind,
  resolveChatResponseWidgetProjection,
  toChatResponseWidgetSeedProperties,
  type ChatResponseStructuredRole,
} from './chatResponseWidgetPaletteContract'
export { projectChatResponseStructuredSurfaceIntoKgcFrontmatter } from './chatResponseStructuredContentProjector'

export type ChatResponseSurfaceNode = {
  id: string
  label: string
  nodeTypeId: string
  kind: 'text' | 'image' | 'audio' | 'video' | 'html'
  sourceHandle: string
  targetHandle: string
  properties: Record<string, JSONValue>
}

export type ChatResponseSurfaceEdge = {
  id: string
  source: string
  target: string
  sourceHandle: string
  targetHandle: string
  label: string
}

export type ChatResponseStructuredSurface = {
  nodes: ChatResponseSurfaceNode[]
  edges: ChatResponseSurfaceEdge[]
  frontmatter?: Record<string, JSONValue>
}

const MAX_RESPONSE_SURFACE_NODES = 12
const FLOW_WIDGET_FORM_ID_KEY = 'flow:widgetFormId'
const FLOW_WIDGET_TYPE_ID_KEY = 'flow:widgetTypeId'
const STRUCTURED_NODE_META_KEYS = new Set([
  'id',
  'nodeId',
  'node_id',
  'label',
  'title',
  'name',
  'kind',
  'type',
  'mediaKind',
  'media_kind',
  'nodeTypeId',
  'node_type_id',
  'nodeType',
  'widgetNodeType',
  'widget_node_type',
  FLOW_WIDGET_FORM_ID_KEY,
  'widgetFormId',
  'widget_form_id',
  'formId',
  'form_id',
  FLOW_WIDGET_TYPE_ID_KEY,
  'widgetTypeId',
  'widget_type_id',
  'sourceHandle',
  'source_handle',
  'sourcePort',
  'source_port',
  'targetHandle',
  'target_handle',
  'targetPort',
  'target_port',
  'inputHandle',
  'input_handle',
  'inputPort',
  'input_port',
  'outputHandle',
  'output_handle',
  'outputPort',
  'output_port',
  ...CHAT_RESPONSE_WIDGET_LAYOUT_META_KEYS,
  'properties',
  'columns',
  'column',
  'headers',
  'header',
  'rows',
  'table',
  ...STRUCTURED_FRONTMATTER_FIELD_KEYS,
])

const slugify = (value: unknown, fallback: string): string => {
  const slug = String(value || '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
  return slug || fallback
}

const normalizeNodeId = (value: unknown, fallback: string): string =>
  `mcp-response-${slugify(value, fallback)}`

const normalizeKind = (value: unknown, props: Record<string, unknown>): ChatResponseSurfaceNode['kind'] => {
  const explicit = readString(value).toLowerCase()
  if (explicit === 'table' || explicit === 'markdown-table' || explicit === 'multi-dimensional-table') return 'text'
  if (explicit === 'geo' || explicit === 'geojson' || explicit === 'geospatial' || explicit === 'map') return 'html'
  if (explicit === 'image' || explicit === 'audio' || explicit === 'video' || explicit === 'html' || explicit === 'text') return explicit
  if (readFirstString(props, ['audioUrl', 'audio_url', 'audio'])) return 'audio'
  if (readFirstString(props, ['videoUrl', 'video_url', 'video'])) return 'video'
  if (readFirstString(props, ['imageUrl', 'image_url', 'image', 'mediaUrl', 'media_url'])) return 'image'
  if (readFirstString(props, ['outputSrcDoc', 'srcDoc', 'srcdoc', 'html'])) return 'html'
  if (typeof readGeospatialStructuredPayload(props) !== 'undefined') return 'html'
  return 'text'
}

const pickRichMediaTab = (kind: ChatResponseSurfaceNode['kind']): JSONValue => {
  if (kind === 'image' || kind === 'audio' || kind === 'video') return kind
  if (kind === 'html') return 'html'
  return 'text'
}

const normalizeNodeRecord = (value: unknown, index: number, role: ChatResponseStructuredRole, roleIndex = index): ChatResponseSurfaceNode | null => {
  if (!isRecord(value)) return null
  const authoredRecord = mergeStructuredProperties(value)
  const paletteResolution = applyChatResponseWidgetPaletteLayout(authoredRecord)
  const record = paletteResolution.record
  const probeTreeCard = isProbeTreeStructuredResponseCard(record, role)
  const geospatialPayload = readGeospatialStructuredPayload(record)
  const tableMarkdown = probeTreeCard ? '' : readStructuredTableMarkdown(record, role)
  const isTableOutput = containsMarkdownPipeTable(tableMarkdown)
  const inferredKind = normalizeKind(
    readFieldValue(record, 'kind') || readFieldValue(record, 'type') || readFieldValue(record, 'mediaKind') || readFieldValue(record, 'media_kind'),
    record,
  )
  const hasAuthoredHtml = Boolean(readFirstString(record, ['outputSrcDoc', 'srcDoc', 'srcdoc', 'html']))
  const kind = isTableOutput || (inferredKind === 'html' && !hasAuthoredHtml && typeof geospatialPayload === 'undefined')
    ? 'text'
    : inferredKind
  const nodeTypeId = resolveProbeTreeStructuredResponseNodeTypeId({
    record,
    role,
    fallbackNodeTypeId: inferChatResponseWidgetNodeTypeId({
      record,
      role,
      layout: paletteResolution.layout,
    }),
  })
  const widgetProjection = resolveChatResponseWidgetProjection({
    record,
    nodeTypeId,
    kind,
    hasGeospatialPayload: typeof geospatialPayload !== 'undefined',
    layout: paletteResolution.layout,
  })
  const { formId, widgetTypeId, sourceHandle, targetHandle } = widgetProjection
  const output = probeTreeCard ? '' : tableMarkdown || readFirstString(record, ['output', 'result', 'response', 'transcript', 'text', 'content', 'markdown', 'description'])
  const probeTreeQuestion = probeTreeCard ? readFirstString(record, ['question']) : ''
  const imageUrl = readFirstString(record, ['imageUrl', 'image_url', 'image', 'mediaUrl', 'media_url'])
  const audioUrl = readFirstString(record, ['audioUrl', 'audio_url', 'audio'])
  const videoUrl = readFirstString(record, ['videoUrl', 'video_url', 'video'])
  const outputSrcDoc = isTableOutput ? '' : readFirstString(record, ['outputSrcDoc', 'srcDoc', 'srcdoc', 'html'])
  const hasRenderableContent = Boolean(probeTreeQuestion || output || imageUrl || audioUrl || videoUrl || outputSrcDoc || typeof geospatialPayload !== 'undefined')
  const hasDeclaredWidgetInput = nodeTypeId !== FLOW_RICH_MEDIA_PANEL_NODE_TYPE_ID
    && Boolean(formId || readFirstString(record, ['prompt', 'input', 'instructions', 'systemPrompt', 'system_prompt']))
  const hasDeclaredPanelTarget = nodeTypeId === FLOW_RICH_MEDIA_PANEL_NODE_TYPE_ID && (role === 'panel' || role === 'media')
  if (!hasRenderableContent && !hasDeclaredWidgetInput && !hasDeclaredPanelTarget) return null

  const label = probeTreeQuestion
    || readFirstString(record, ['label', 'title', 'name'])
    || paletteResolution.layout?.seedLabel
    || `Response ${index + 1}`
  const rawId = readFirstString(record, ['id', 'nodeId', 'node_id']) || label
  const nodeId = normalizeNodeId(rawId, String(index + 1))
  const properties: Record<string, JSONValue> = {
    ...toChatResponseWidgetSeedProperties(paletteResolution.layout),
    'chat:structuredContent': true,
    'chat:structuredRole': role,
    [FLOW_WIDGET_FORM_ID_KEY]: formId,
    [FLOW_WIDGET_TYPE_ID_KEY]: widgetTypeId,
  }
  if (paletteResolution.layout) properties.title = label
  if (nodeTypeId === FLOW_RICH_MEDIA_PANEL_NODE_TYPE_ID) {
    properties.richMediaActiveTab = pickRichMediaTab(kind)
    properties.media_interactive = kind === 'audio' || kind === 'video' || kind === 'html'
  }
  if (output) properties.output = output
  if (isTableOutput) {
    properties.tableFormat = GENERATED_MARKDOWN_PIPE_TABLE_FORMAT
    properties.outputMimeType = GENERATED_MARKDOWN_PIPE_TABLE_MIME_TYPE
    properties.richMediaActiveTab = 'text'
    properties.media_interactive = false
    properties.kind = 'markdown-table'
  }
  if (imageUrl) properties.imageUrl = imageUrl
  if (audioUrl) properties.audioUrl = audioUrl
  if (videoUrl) properties.videoUrl = videoUrl
  if (outputSrcDoc) properties.outputSrcDoc = outputSrcDoc
  if (typeof geospatialPayload !== 'undefined') properties.geoJson = geospatialPayload
  for (const [key, raw] of Object.entries(record)) {
    if (STRUCTURED_NODE_META_KEYS.has(key)) continue
    if (
      Object.prototype.hasOwnProperty.call(properties, key)
      && !Object.prototype.hasOwnProperty.call(authoredRecord, key)
    ) continue
    const nextValue = toJsonValue(readFieldValue(record, key))
    if (typeof nextValue !== 'undefined') properties[key] = nextValue
  }
  if (probeTreeCard) properties.output = ''
  Object.assign(properties, buildProbeTreeStructuredResponseProperties({ record, role, index: roleIndex }))
  const normalizedProperties = normalizeGeneratedRichMediaTableProperties({
    nodeType: nodeTypeId,
    nodeLabel: label,
    properties,
  }) as Record<string, JSONValue>
  const normalizedAsTable = containsMarkdownPipeTable(normalizedProperties.output)

  return {
    id: nodeId,
    label,
    nodeTypeId,
    kind: normalizedAsTable ? 'text' : kind,
    sourceHandle: normalizedAsTable ? 'output' : sourceHandle,
    targetHandle: normalizedAsTable ? 'output' : targetHandle,
    properties: normalizedProperties,
  }
}

const collectRecords = (value: unknown): Array<{ role: ChatResponseStructuredRole; value: unknown }> => {
  if (!isRecord(value)) return []
  const out: Array<{ role: ChatResponseStructuredRole; value: unknown }> = []
  const pushArray = (role: ChatResponseStructuredRole, raw: unknown) => {
    if (Array.isArray(raw)) raw.forEach(item => out.push({ role, value: item }))
  }
  pushArray('widget', value.widgets)
  pushArray('panel', value.panels)
  pushArray('card', value.cards)
  pushArray('media', value.media)
  pushArray('media', value.richMedia)
  pushArray('media', value.rich_media)
  pushArray('table', value.tables)
  if (isRecord(value.table)) out.push({ role: 'table', value: value.table })
  pushArray('node', value.nodes)
  if (out.length === 0) out.push({ role: 'node', value })
  return out
}

const collectEdgeRecords = (value: unknown): unknown[] => {
  if (!isRecord(value)) return []
  return Array.isArray(value.edges) ? value.edges : []
}

const readDirectStructuredRecord = (record: Record<string, unknown>): Record<string, unknown> | null => {
  if (isRecord(record.structuredContent)) return record.structuredContent
  if (isRecord(record.structured_content)) return record.structured_content
  return null
}

const hasStructuredSurfaceLists = (record: Record<string, unknown>): boolean =>
  Array.isArray(record.widgets)
  || Array.isArray(record.panels)
  || Array.isArray(record.cards)
  || Array.isArray(record.media)
  || Array.isArray(record.richMedia)
  || Array.isArray(record.rich_media)
  || Array.isArray(record.tables)
  || isRecord(record.table)
  || Array.isArray(record.nodes)
  || Array.isArray(record.edges)

const readStructuredRoot = (parsed: unknown, allowFallback = true): Record<string, unknown> | null => {
  if (!isRecord(parsed)) return null
  const direct = readDirectStructuredRecord(parsed)
  if (direct) return hasStructuredSurfaceLists(direct) ? direct : (readStructuredRoot(direct, false) || direct)
  for (const key of STRUCTURED_ENVELOPE_KEYS) {
    const nested = isRecord(parsed[key]) ? readStructuredRoot(parsed[key], false) : null
    if (nested) return nested
  }
  if (hasStructuredSurfaceLists(parsed)) return parsed
  return allowFallback ? parsed : null
}

const parseYamlOrJsonCandidate = (text: string): Record<string, unknown> | null => {
  const parsed = parseYamlOrJsonValue(text)
  return readStructuredRoot(parsed)
}

const collectNodeReferenceKeys = (record: unknown, node: ChatResponseSurfaceNode, fallback: string): string[] => {
  if (!isRecord(record)) return [node.id]
  const normalized = mergeStructuredProperties(record)
  const rawId = readFirstString(normalized, ['id', 'nodeId', 'node_id'])
  const label = readFirstString(normalized, ['label', 'title', 'name'])
  const referenceKeys = [
    node.id,
    rawId,
    label,
    slugify(rawId, fallback),
    slugify(label, fallback),
    normalizeNodeId(rawId, fallback),
    normalizeNodeId(label, fallback),
  ]
  return referenceKeys.map(referenceKey => String(referenceKey || '').trim()).filter(Boolean)
}

const readEndpoint = (record: Record<string, unknown>, nodeKeys: readonly string[], handleKeys: readonly string[]): { nodeId: string; handle: string } | null => {
  let nodeId = readFirstString(record, nodeKeys)
  let handle = readFirstString(record, handleKeys)
  if (!nodeId) return null
  if (!handle) {
    const dot = nodeId.lastIndexOf('.')
    if (dot > 0 && dot < nodeId.length - 1) {
      handle = nodeId.slice(dot + 1).trim()
      nodeId = nodeId.slice(0, dot).trim()
    }
  }
  return nodeId ? { nodeId, handle } : null
}

const defaultSourceHandle = (sourceId: string, nodeHandleById: Map<string, string>): string =>
  sourceId === 'n-deliver' ? 'rendered' : (nodeHandleById.get(sourceId) || 'output')

const defaultTargetHandle = (targetId: string, nodeHandleById: Map<string, string>): string =>
  nodeHandleById.get(targetId) || 'input'

const normalizeStructuredEdge = (args: {
  raw: unknown
  index: number
  nodeIdByReferenceKey: Map<string, string>
  nodeSourceHandleById: Map<string, string>
  nodeTargetHandleById: Map<string, string>
}): ChatResponseSurfaceEdge | null => {
  if (!isRecord(args.raw)) return null
  const record = mergeStructuredProperties(args.raw)
  const source = readEndpoint(record, ['source', 'from', 'fromNode', 'from_node'], ['sourceHandle', 'source_handle', 'sourcePort', 'source_port', 'fromHandle', 'from_handle', 'fromPort', 'from_port'])
  const target = readEndpoint(record, ['target', 'to', 'toNode', 'to_node'], ['targetHandle', 'target_handle', 'targetPort', 'target_port', 'toHandle', 'to_handle', 'toPort', 'to_port'])
  if (!source || !target) return null
  const sourceId = args.nodeIdByReferenceKey.get(source.nodeId) || source.nodeId
  const targetId = args.nodeIdByReferenceKey.get(target.nodeId) || target.nodeId
  const sourceHandle = source.handle || defaultSourceHandle(sourceId, args.nodeSourceHandleById)
  const targetHandle = target.handle || defaultTargetHandle(targetId, args.nodeTargetHandleById)
  if (!sourceId || !targetId || !sourceHandle || !targetHandle) return null
  const rawId = readFirstString(record, ['id', 'edgeId', 'edge_id'])
  const label = readFirstString(record, ['label', 'name', 'title']) || `${sourceHandle}->${targetHandle}`
  const fallback = `${sourceId}-${sourceHandle}-${targetId}-${targetHandle}`
  return {
    id: `e-mcp-response-${slugify(rawId, fallback || String(args.index + 1))}`,
    source: sourceId,
    target: targetId,
    sourceHandle,
    targetHandle,
    label,
  }
}

const buildDefaultResponseEdge = (node: ChatResponseSurfaceNode, index: number): ChatResponseSurfaceEdge => ({
  id: `e-mcp-response-${index + 1}`,
  source: 'n-deliver',
  target: node.id,
  sourceHandle: 'rendered',
  targetHandle: node.targetHandle,
  label: node.targetHandle,
})

const edgeSignature = (edge: ChatResponseSurfaceEdge): string =>
  [edge.source, edge.sourceHandle, edge.target, edge.targetHandle].map(value => String(value || '').trim()).join('\u0000')

const readStructuredNodeRole = (node: ChatResponseSurfaceNode): ChatResponseStructuredRole | '' => {
  const raw = node.properties?.['chat:structuredRole']
  const role = typeof raw === 'string' ? raw.trim() : ''
  if (role === 'widget' || role === 'panel' || role === 'card' || role === 'media' || role === 'table' || role === 'node') return role
  return ''
}

const hasFlowComputeSource = (node: ChatResponseSurfaceNode): boolean =>
  typeof node.properties?.['flow:compute'] === 'string'
  && String(node.properties['flow:compute'] || '').trim().length > 0

const isStructuredDataflowSourceNode = (node: ChatResponseSurfaceNode): boolean => {
  const role = readStructuredNodeRole(node)
  if (role === 'card' || role === 'widget') return true
  return role === 'node' && node.nodeTypeId !== FLOW_RICH_MEDIA_PANEL_NODE_TYPE_ID
}

const isStructuredDataflowPanelTarget = (node: ChatResponseSurfaceNode): boolean => {
  const role = readStructuredNodeRole(node)
  return role === 'panel' || (role === 'media' && node.nodeTypeId === FLOW_RICH_MEDIA_PANEL_NODE_TYPE_ID)
}

const computeInputHandleForSource = (node: ChatResponseSurfaceNode): string => {
  const handle = String(node.sourceHandle || '').trim()
  if (!handle || handle === 'text_out' || handle === 'output') return 'prompt_in'
  return handle
}

const computeOutputHandleForPanel = (node: ChatResponseSurfaceNode): string => {
  const targetHandle = String(node.targetHandle || '').trim()
  if (targetHandle) return targetHandle
  return resolveChatResponseTargetHandleForKind(node.kind)
}

const uniqueSurfaceNodeId = (baseId: string, usedIds: ReadonlySet<string>): string => {
  const base = String(baseId || '').trim() || STRUCTURED_SURFACE_INLINE_COMPUTE_NODE_ID
  if (!usedIds.has(base)) return base
  for (let i = 2; i < 100; i += 1) {
    const candidate = `${base}-${i}`
    if (!usedIds.has(candidate)) return candidate
  }
  return `${base}-${usedIds.size + 1}`
}

const ensureStructuredSurfaceDataflow = (args: {
  nodes: ChatResponseSurfaceNode[]
  edges: ChatResponseSurfaceEdge[]
}): void => {
  if (args.nodes.length === 0 || args.nodes.length >= MAX_RESPONSE_SURFACE_NODES) return
  if (args.edges.length > 0) return
  if (args.nodes.some(hasFlowComputeSource)) return
  const sources = args.nodes.filter(isStructuredDataflowSourceNode)
  const panels = args.nodes.filter(isStructuredDataflowPanelTarget)
  if (sources.length === 0 || panels.length === 0) return

  const usedIds = new Set(args.nodes.map(node => String(node.id || '').trim()).filter(Boolean))
  const computeId = uniqueSurfaceNodeId(STRUCTURED_SURFACE_INLINE_COMPUTE_NODE_ID, usedIds)
  args.nodes.push({
    id: computeId,
    label: 'Structured Compute',
    nodeTypeId: FLOW_TEXT_GENERATION_NODE_TYPE_ID,
    kind: 'text',
    sourceHandle: 'output',
    targetHandle: 'prompt_in',
    properties: {
      'chat:structuredContent': true,
      'chat:structuredRole': 'widget',
      [FLOW_WIDGET_FORM_ID_KEY]: 'textGeneration',
      [FLOW_WIDGET_TYPE_ID_KEY]: 'default',
      'flow:compute': STRUCTURED_SURFACE_INLINE_COMPUTE_SOURCE,
      prompt: 'Headless structured-content compute runner',
    },
  })

  sources.forEach((source, index) => {
    const sourceHandle = String(source.sourceHandle || resolveChatResponseTargetHandleForKind(source.kind) || 'output').trim()
    args.edges.push({
      id: `e-mcp-response-${slugify(`${source.id}-${sourceHandle}-${computeId}-input`, String(index + 1))}`,
      source: source.id,
      target: computeId,
      sourceHandle,
      targetHandle: computeInputHandleForSource(source),
      label: `${sourceHandle}->${computeInputHandleForSource(source)}`,
    })
  })

  panels.forEach((panel, index) => {
    const targetHandle = computeOutputHandleForPanel(panel)
    args.edges.push({
      id: `e-mcp-response-${slugify(`${computeId}-${targetHandle}-${panel.id}`, String(index + 1))}`,
      source: computeId,
      target: panel.id,
      sourceHandle: targetHandle,
      targetHandle,
      label: `${targetHandle}->${targetHandle}`,
    })
  })
}

export const extractChatResponseStructuredSurface = (assistantText: string): ChatResponseStructuredSurface | null => {
  const candidates = collectStructuredTextCandidates(assistantText, 8)
  appendEmbeddedStructuredTextCandidates(candidates, 8)

  const frontmatter: Record<string, JSONValue> = {}
  const seenIds = new Set<string>()
  const nodeIdByReferenceKey = new Map<string, string>()
  const nodeSourceHandleById = new Map<string, string>()
  const nodeTargetHandleById = new Map<string, string>()
  const nodes: ChatResponseSurfaceNode[] = []
  const rawEdges: unknown[] = []
  for (let i = 0; i < candidates.length && nodes.length < MAX_RESPONSE_SURFACE_NODES; i += 1) {
    const root = parseYamlOrJsonCandidate(candidates[i] || '')
    if (!root) continue
    collectStructuredFrontmatterFields(root, frontmatter)
    const records = collectRecords(root)
    for (let j = 0; j < records.length && nodes.length < MAX_RESPONSE_SURFACE_NODES; j += 1) {
      const record = records[j]
      collectStructuredFrontmatterFields(record.value, frontmatter)
      const roleIndex = nodes.filter(node => node.properties['chat:structuredRole'] === record.role).length
      const node = normalizeNodeRecord(record.value, nodes.length, record.role, roleIndex)
      if (!node || seenIds.has(node.id)) continue
      seenIds.add(node.id)
      nodeSourceHandleById.set(node.id, node.sourceHandle)
      nodeTargetHandleById.set(node.id, node.targetHandle)
      collectNodeReferenceKeys(record.value, node, String(nodes.length + 1)).forEach(referenceKey => {
        if (!nodeIdByReferenceKey.has(referenceKey)) nodeIdByReferenceKey.set(referenceKey, node.id)
      })
      nodes.push(node)
    }
    rawEdges.push(...collectEdgeRecords(root))
  }
  if (nodes.length === 0 && Object.keys(frontmatter).length === 0) return null
  const edges: ChatResponseSurfaceEdge[] = []
  const seenEdges = new Set<string>()
  const pushEdge = (edge: ChatResponseSurfaceEdge) => {
    const signature = edgeSignature(edge)
    if (seenEdges.has(signature)) return
    seenEdges.add(signature)
    edges.push(edge)
  }
  for (let i = 0; i < rawEdges.length; i += 1) {
    const edge = normalizeStructuredEdge({ raw: rawEdges[i], index: i, nodeIdByReferenceKey, nodeSourceHandleById, nodeTargetHandleById })
    if (edge) pushEdge(edge)
  }
  buildStructuredCardParentEdges({ nodes, nodeIdByReferenceKey, nodeSourceHandleById }).forEach(pushEdge)
  ensureStructuredSurfaceDataflow({ nodes, edges })
  nodes.forEach((node, index) => pushEdge(buildDefaultResponseEdge(node, index)))
  return Object.keys(frontmatter).length > 0 ? { nodes, edges, frontmatter } : { nodes, edges }
}
