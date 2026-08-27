import type { GraphData, GraphEdge, GraphNode, JSONValue } from '../types'
import { isPlainObject } from '../value'

type JsonRecord = Record<string, unknown>
type TypedYamlField = [string, unknown, string?]

const LUMINA_NODE_TYPE_RE = /^BA[A-Za-z]+/
const LUMINA_NODE_TYPE_JSON_RE = /"type"\s*:\s*"BA[A-Za-z]+"/
const LUMINA_NODES_JSON_RE = /"nodes"\s*:/
const LUMINA_LINKS_JSON_RE = /"links"\s*:/
const LUMINA_PROMPT_JSON_RE = /"ba_extra"\s*:/
const GENERATED_MEDIA_PATH_RE = /(?:^|["'\s])((?:input|output)\/[^"'\s]+\.(?:png|jpe?g|webp|gif|mp4|webm|mov|m4v|mp3|wav|ogg))/gi
const GENERIC_NODE_TITLES = new Set(['image generation', 'video generation', 'script planning'])
const MARKDOWN_SOURCE_FIDELITY_KIND = 'agenticgraph.markdown-source'
const MARKDOWN_SOURCE_FIDELITY_VERSION = 1
const LUMINA_STORAGE_OBJECT_BASE_URL = 'https://lumi-api.console.byteplus.com/api/storage/objects/lumi'

const normalizeText = (value: unknown): string => String(value ?? '').replace(/\s+/g, ' ').trim()
const cleanMultilineText = (value: unknown): string => String(value ?? '').replace(/\r\n?/g, '\n').trim()

const asRecord = (value: unknown): JsonRecord | null => {
  return isPlainObject(value) ? value as JsonRecord : null
}

const asArray = (value: unknown): unknown[] => {
  return Array.isArray(value) ? value : []
}

const asJson = (value: unknown): JSONValue => value as JSONValue

const asJsonRecord = (value: unknown): Record<string, JSONValue> => value as Record<string, JSONValue>

const yamlKey = (key: string): string => {
  return /^[A-Za-z0-9_-]+$/.test(key) ? key : `"${key.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}

const yamlValue = (value: unknown): string => {
  if (value == null) return 'null'
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  if (typeof value === 'string') return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')}"`
  return JSON.stringify(value)
}

const yamlTypedMapKeyValue = (value: string): string => {
  return /^[A-Za-z0-9_-]+$/.test(value) ? value : yamlValue(value)
}

const typedYamlField = (fieldKey: string, value: unknown, valueType?: string): string => {
  const inferredType = valueType || (Array.isArray(value) ? 'array' : value === null ? 'null' : typeof value)
  return `${yamlKey(fieldKey)}: {key: ${yamlTypedMapKeyValue(fieldKey)}, type: ${yamlTypedMapKeyValue(inferredType)}, value: ${yamlValue(value)}}`
}

const hasTypedYamlValue = (field: TypedYamlField): boolean => field[1] !== undefined

const readLuminaEdgeSocketType = (properties: JsonRecord): string => {
  const sourcePort = normalizeText(properties.sourcePort)
  const targetPort = normalizeText(properties.targetPort)
  if (sourcePort && sourcePort === targetPort) return sourcePort
  if (sourcePort && targetPort) return `${sourcePort}_to_${targetPort}`.replace(/[^A-Za-z0-9_-]+/g, '_')
  return sourcePort || targetPort || 'luminaLink'
}

const appendTypedYamlPropertyFields = (fields: TypedYamlField[], properties: JsonRecord): void => {
  const authoredKeys = new Set(fields.map(field => field[0]))
  for (const [key, value] of Object.entries(properties)) {
    if (authoredKeys.has(key)) continue
    if (value === undefined) continue
    fields.push([key, value])
    authoredKeys.add(key)
  }
}

const readMeta = (node: JsonRecord): JsonRecord => {
  return asRecord(node.meta) || {}
}

const readExtra = (node: JsonRecord): JsonRecord => {
  return asRecord(readMeta(node).extra) || {}
}

const readPosition = (value: unknown): { x?: number; y?: number } => {
  if (!Array.isArray(value)) return {}
  const [x, y] = value
  return {
    ...(typeof x === 'number' && Number.isFinite(x) ? { x } : {}),
    ...(typeof y === 'number' && Number.isFinite(y) ? { y } : {}),
  }
}

const readSize = (value: unknown): { width?: number; height?: number } => {
  if (!Array.isArray(value)) return {}
  const [width, height] = value
  return {
    ...(typeof width === 'number' && Number.isFinite(width) ? { width } : {}),
    ...(typeof height === 'number' && Number.isFinite(height) ? { height } : {}),
  }
}

const uniqueTexts = (values: readonly unknown[]): string[] => {
  const seen = new Set<string>()
  const out: string[] = []
  for (const value of values) {
    const text = typeof value === 'string' ? cleanMultilineText(value) : normalizeText(value)
    if (!text) continue
    const key = text.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(text)
  }
  return out
}

const extractRichText = (value: unknown): string => {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return cleanMultilineText(value)
  }
  const fragments: string[] = []
  const visit = (entry: unknown, keyHint = ''): void => {
    if (typeof entry === 'string' || typeof entry === 'number' || typeof entry === 'boolean') {
      if (keyHint === 'text') fragments.push(cleanMultilineText(entry))
      return
    }
    if (Array.isArray(entry)) {
      entry.forEach(item => visit(item, keyHint))
      return
    }
    const record = asRecord(entry)
    if (!record) return
    for (const [key, child] of Object.entries(record)) visit(child, key)
  }
  visit(value)
  return uniqueTexts(fragments).join('\n').trim()
}

const readInputValue = (node: JsonRecord, names: readonly string[]): unknown => {
  const wanted = new Set(names.map(name => name.toLowerCase()))
  for (const input of asArray(node.inputs)) {
    const record = asRecord(input)
    const name = normalizeText(record?.name).toLowerCase()
    if (record && wanted.has(name) && record.value != null) return record.value
  }
  return undefined
}

const readInputLabel = (node: JsonRecord, names: readonly string[]): string => {
  const wanted = new Set(names.map(name => name.toLowerCase()))
  for (const input of asArray(node.inputs)) {
    const record = asRecord(input)
    const name = normalizeText(record?.name)
    if (!record || !wanted.has(name.toLowerCase()) || record.value == null) continue
    const explicit = normalizeText(record.label)
    return explicit || name
  }
  return ''
}

const formatSourceFieldLabel = (value: string): string => {
  const normalized = normalizeText(value).replace(/[_-]+/g, ' ')
  if (!normalized) return ''
  return normalized
    .split(' ')
    .filter(Boolean)
    .map(token => token.charAt(0).toUpperCase() + token.slice(1))
    .join(' ')
}

const readPrompt = (node: JsonRecord, promptRecord: JsonRecord | null): string => {
  const extra = readExtra(node)
  const promptInputs = asRecord(promptRecord?.inputs)
  const candidates = [
    readInputValue(node, ['user_prompt', 'prompt', 'text']),
    promptInputs?.user_prompt,
    promptInputs?.prompt,
    extra.user_prompt,
    extra.prompt,
    extra.inputTexts,
  ]
  return uniqueTexts(candidates.map(value => extractRichText(value))).join('\n\n').trim()
}

const parseResultUrl = (value: unknown): string => {
  const text = typeof value === 'string' ? value : ''
  if (!text.trim()) return ''
  try {
    const parsed = JSON.parse(text) as unknown
    const stack = [parsed]
    while (stack.length > 0) {
      const current = stack.shift()
      if (Array.isArray(current)) {
        stack.push(...current)
        continue
      }
      const record = asRecord(current)
      if (!record) continue
      if (record.name === 'url' && typeof record.value === 'string' && record.value.trim()) {
        return record.value.trim()
      }
      stack.push(...Object.values(record))
    }
  } catch {
    return ''
  }
  return ''
}

const isLuminaRelativeMediaPath = (value: string): boolean => /^(?:input|output)\//i.test(value)

const isImageMediaPath = (value: string): boolean => /\.(?:png|jpe?g|webp|gif)(?:\?|#|$)/i.test(value)

const encodeLuminaObjectPath = (value: string): string => (
  value
    .replace(/^\/+/, '')
    .split('/')
    .filter(Boolean)
    .map(part => encodeURIComponent(part))
    .join('/')
)

const encodeSvgDataUrl = (svg: string): string => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`

const escapeSvgText = (value: string): string => (
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
)

const buildLuminaSourceImageDataUrl = (args: { path: string; title: string; kind: string }): string => {
  const title = normalizeText(args.title) || formatSourceFieldLabel(args.kind) || 'Lumina media'
  const sourcePath = normalizeText(args.path)
  const svg = [
    '<svg xmlns="http://www.w3.org/2000/svg" width="960" height="540" viewBox="0 0 960 540" role="img">',
    '<rect width="960" height="540" fill="#f8fafc"/>',
    '<rect x="48" y="48" width="864" height="444" rx="24" fill="#ffffff" stroke="#cbd5e1" stroke-width="2"/>',
    '<circle cx="126" cy="126" r="34" fill="#e0f2fe" stroke="#38bdf8" stroke-width="2"/>',
    '<path d="M111 134l23-28 34 45H94l17-17z" fill="#0284c7"/>',
    `<text x="190" y="125" font-family="Inter, ui-sans-serif, system-ui, sans-serif" font-size="34" font-weight="700" fill="#0f172a">${escapeSvgText(title)}</text>`,
    `<text x="190" y="172" font-family="Inter, ui-sans-serif, system-ui, sans-serif" font-size="22" fill="#475569">${escapeSvgText(sourcePath)}</text>`,
    '<text x="190" y="224" font-family="Inter, ui-sans-serif, system-ui, sans-serif" font-size="18" fill="#64748b">Lumina source media reference</text>',
    '</svg>',
  ].join('')
  return encodeSvgDataUrl(svg)
}

const toRenderableLuminaMediaUrl = (value: unknown, context: { title?: string; kind?: string } = {}): string => {
  const raw = normalizeText(value)
  if (!raw) return ''
  if (/^(?:https?:|data:|blob:|\/__codebase_asset\?)/i.test(raw)) return raw
  if (isLuminaRelativeMediaPath(raw) && isImageMediaPath(raw)) {
    return buildLuminaSourceImageDataUrl({
      path: raw,
      title: normalizeText(context.title),
      kind: normalizeText(context.kind),
    })
  }
  if (isLuminaRelativeMediaPath(raw)) return `${LUMINA_STORAGE_OBJECT_BASE_URL}/${encodeLuminaObjectPath(raw)}`
  return `/__codebase_asset?path=${encodeURIComponent(raw.replace(/^\/+/, ''))}`
}

const readMediaValuesFromList = (value: unknown): string[] => {
  const out: string[] = []
  for (const item of asArray(value)) {
    const record = asRecord(item)
    if (!record) continue
    for (const candidate of asArray(record.values)) {
      const text = normalizeText(candidate)
      if (text) out.push(text)
    }
  }
  return uniqueTexts(out)
}

const collectGeneratedMediaPaths = (value: unknown): string[] => {
  const text = JSON.stringify(value || '')
  const out: string[] = []
  for (const match of text.matchAll(GENERATED_MEDIA_PATH_RE)) {
    if (match[1]) out.push(match[1])
  }
  return uniqueTexts(out)
}

const readPrimaryMediaPath = (node: JsonRecord): string => {
  const extra = readExtra(node)
  const remoteResultUrl = parseResultUrl(extra.respJson)
  if (remoteResultUrl) return remoteResultUrl
  const filePath = normalizeText(extra.filePath)
  if (filePath) return filePath
  const value = asArray(extra.value).find(item => normalizeText(item))
  if (value) return normalizeText(value)
  return ''
}

const readMediaKind = (node: JsonRecord, primaryPath: string): string => {
  const type = normalizeText(node.type).toLowerCase()
  const path = primaryPath.toLowerCase()
  if (type.includes('video') || /\.(mp4|webm|mov|m4v)(?:\?|#|$)/i.test(path)) return 'video'
  if (type.includes('image') || /\.(png|jpe?g|webp|gif)(?:\?|#|$)/i.test(path)) return 'image'
  if (type.includes('text')) return 'text'
  if (type.includes('script')) return 'script'
  return 'unknown'
}

const readReferencePaths = (node: JsonRecord, primaryPath: string): string[] => {
  const extra = readExtra(node)
  const values = uniqueTexts([
    ...readMediaValuesFromList(extra.inputImages),
    ...readMediaValuesFromList(extra.inputVideos),
    ...collectGeneratedMediaPaths(node),
  ])
  const primary = normalizeText(primaryPath).toLowerCase()
  return values.filter(value => value.toLowerCase() !== primary)
}

const readModelName = (node: JsonRecord): string => {
  const model = asRecord(readExtra(node).model)
  return normalizeText(model?.name_en || model?.name || model?.model_name || model?.key)
}

const readConfiguredValue = (node: JsonRecord, key: string): JSONValue | undefined => {
  const modelConfig = asRecord(readExtra(node).modelConfig)
  const entry = asRecord(modelConfig?.[key])
  return entry && entry.value !== undefined ? asJson(entry.value) : undefined
}

const readTitleFromPrompt = (prompt: string): string => {
  const firstLine = cleanMultilineText(prompt).split('\n').map(line => line.trim()).find(Boolean) || ''
  const match = firstLine.match(/^(Video|Scene|Shot)\s*(\d+)\s*\|[^|]*\|\s*(.+)$/i)
  if (match) return `${match[1]} ${match[2]} - ${match[3]}`.trim()
  return firstLine.length <= 96 ? firstLine : ''
}

type LuminaGroupBox = {
  id: string
  title: string
  x: number
  y: number
  width: number
  height: number
  area: number
}

const readGroupBoxes = (groups: unknown): LuminaGroupBox[] => {
  return asArray(groups)
    .map(group => {
      const record = asRecord(group)
      const meta = asRecord(record?.meta)
      const { x, y } = readPosition(meta?.pos)
      const { width, height } = readSize(meta?.size)
      const title = normalizeText(meta?.title)
      const id = normalizeText(record?.id)
      if (!id || !title || x == null || y == null || width == null || height == null) return null
      return { id, title, x, y, width, height, area: width * height }
    })
    .filter(Boolean)
    .sort((left, right) => left!.area - right!.area) as LuminaGroupBox[]
}

const findContainingGroup = (node: JsonRecord, groups: readonly LuminaGroupBox[]): LuminaGroupBox | null => {
  const { x, y } = readPosition(readMeta(node).pos)
  if (x == null || y == null) return null
  return groups.find(group => (
    x >= group.x &&
    y >= group.y &&
    x <= group.x + group.width &&
    y <= group.y + group.height
  )) || null
}

const buildLuminaGroupNode = (group: LuminaGroupBox, index: number): GraphNode => ({
  id: group.id,
  type: 'group',
  label: group.title,
  x: group.x,
  y: group.y,
  properties: {
    title: group.title,
    lane: 'Groups',
    order: index + 1,
    width: group.width,
    height: group.height,
    luminaGroup: true,
  },
})

const readFallbackLane = (node: JsonRecord): string => {
  const type = normalizeText(node.type).toLowerCase()
  if (type.includes('script') || type.includes('text')) return 'Source'
  if (type.includes('video')) return 'Runtime'
  if (type.includes('image')) return 'Storyboard'
  return 'Storyboard'
}

const buildLuminaNode = (args: {
  node: JsonRecord
  index: number
  group: LuminaGroupBox | null
  promptRecord: JsonRecord | null
}): GraphNode | null => {
  const id = normalizeText(args.node.id) || `lumina-node-${args.index + 1}`
  const type = normalizeText(args.node.type) || 'LuminaNode'
  const meta = readMeta(args.node)
  const extra = readExtra(args.node)
  const prompt = readPrompt(args.node, args.promptRecord)
  const promptTitle = readTitleFromPrompt(prompt)
  const metaTitle = normalizeText(meta.title)
  const nativeTypeLabel = metaTitle || type
  const label = !metaTitle || GENERIC_NODE_TITLES.has(metaTitle.toLowerCase()) ? promptTitle || metaTitle || id : metaTitle
  const primaryMediaPath = readPrimaryMediaPath(args.node)
  const mediaKind = readMediaKind(args.node, primaryMediaPath)
  const { x, y } = readPosition(meta.pos)
  const { width, height } = readSize(meta.size)
  const lane = args.group?.title || readFallbackLane(args.node)
  const referencePaths = readReferencePaths(args.node, primaryMediaPath)
  const nativeModelName = readModelName(args.node)
  const promptInputLabel = formatSourceFieldLabel(readInputLabel(args.node, ['user_prompt', 'prompt', 'text']))
  const mediaUrl = toRenderableLuminaMediaUrl(primaryMediaPath, { title: label, kind: mediaKind })
  const references = referencePaths.map(referencePath => toRenderableLuminaMediaUrl(referencePath, { title: label, kind: readMediaKind(args.node, referencePath) }))
  const properties: Record<string, JSONValue> = {
    title: label,
    lane,
    group: lane,
    prompt,
    sourcePromptLabel: promptInputLabel || 'Prompt',
    order: args.index + 1,
    mediaKind,
    references: asJson(references),
    referenceUrls: asJson(references),
    luminaReferencePaths: asJson(referencePaths),
    cardTypeLabel: nativeTypeLabel,
    nodeTypeLabel: nativeTypeLabel,
    luminaTitle: metaTitle,
    luminaNodeType: type,
    ...(nativeModelName ? { sourceModel: nativeModelName, modelLabel: nativeModelName, luminaModelName: nativeModelName } : {}),
    ...(extra.output_preview_names !== undefined ? { luminaOutputPreviewNames: asJson(extra.output_preview_names) } : {}),
    ...(args.group ? { luminaGroupId: args.group.id, scene: args.group.title } : {}),
    ...(primaryMediaPath ? { luminaOutputPath: primaryMediaPath, mediaSourceUrl: primaryMediaPath, mediaUrl, ...(mediaKind === 'image' ? { imageUrl: mediaUrl } : {}), ...(mediaKind === 'video' ? { videoUrl: mediaUrl } : {}) } : {}),
    ...(readConfiguredValue(args.node, 'duration') !== undefined ? { duration: readConfiguredValue(args.node, 'duration')! } : {}),
    ...(readConfiguredValue(args.node, 'ratio') !== undefined ? { aspectRatio: readConfiguredValue(args.node, 'ratio')! } : {}),
    ...(readConfiguredValue(args.node, 'resolution') !== undefined ? { resolution: readConfiguredValue(args.node, 'resolution')! } : {}),
    luminaStatus: asJson(extra.status ?? null),
    luminaFailed: asJson(extra.failed ?? false),
  }
  return {
    id,
    type,
    label,
    ...(x != null ? { x } : {}),
    ...(y != null ? { y } : {}),
    properties: {
      ...properties,
      ...(width != null ? { width } : {}),
      ...(height != null ? { height } : {}),
    },
  }
}

const buildLuminaEdgeFromArray = (entry: unknown, index: number, nodeIds: ReadonlySet<string>): GraphEdge | null => {
  if (!Array.isArray(entry) || entry.length < 4) return null
  const source = normalizeText(entry[1])
  const target = normalizeText(entry[3])
  if (!source || !target || !nodeIds.has(source) || !nodeIds.has(target)) return null
  const meta = asRecord(entry[5]) || {}
  const sourcePort = normalizeText(entry[2])
  const targetPort = normalizeText(entry[4])
  const label = normalizeText(meta.type) || [sourcePort, targetPort].filter(Boolean).join(' -> ') || 'luminaLink'
  const linkId = normalizeText(entry[0]) || String(index + 1)
  return {
    id: `lumina-link-${linkId}-${source}-${target}`,
    source,
    target,
    label,
    properties: {
      sourcePort,
      targetPort,
      evidenceKind: 'lumina-link',
      confidence: 'high',
      luminaLink: true,
      strybldrWorkflowEdge: true,
    },
  }
}

const readGraphNodeProperty = (node: GraphNode, key: string): unknown => {
  const properties = asRecord(node.properties) || {}
  if (key === 'type') return node.type
  if (key === 'label') return node.label
  if (key === 'x') return node.x
  if (key === 'y') return node.y
  return properties[key]
}

const buildLuminaMarkdownSource = (args: {
  name: string
  graphData: Omit<GraphData, 'metadata'> & { metadata: Record<string, JSONValue> }
}): string => {
  const metadata = args.graphData.metadata
  const socketTypes = new Set<string>()
  const portTypesByNodeId = new Map<string, { in: Record<string, string>; out: Record<string, string> }>()
  const ensurePortTypes = (nodeId: string): { in: Record<string, string>; out: Record<string, string> } => {
    const previous = portTypesByNodeId.get(nodeId)
    if (previous) return previous
    const next = { in: {} as Record<string, string>, out: {} as Record<string, string> }
    portTypesByNodeId.set(nodeId, next)
    return next
  }
  for (const edge of args.graphData.edges) {
    const properties = asRecord(edge.properties) || {}
    const sourcePort = normalizeText(properties.sourcePort)
    const targetPort = normalizeText(properties.targetPort)
    if (!sourcePort && !targetPort) continue
    const socketType = readLuminaEdgeSocketType(properties)
    socketTypes.add(socketType)
    if (sourcePort) ensurePortTypes(edge.source).out[sourcePort] = socketType
    if (targetPort) ensurePortTypes(edge.target).in[targetPort] = socketType
  }
  const lines = [
    '---',
    `title: ${yamlValue(String(args.name || 'Lumina Storyboard'))}`,
    'kgStrybldrStoryboard: "true"',
    'kgCanvasRenderMode: "2d"',
    'kgCanvas2dRenderer: "storyboard"',
    'source:',
    `  kind: ${yamlValue(metadata.sourceKind)}`,
    `  name: ${yamlValue(args.name)}`,
    `  parserId: ${yamlValue(metadata.parserId)}`,
    'socket_types:',
    ...(Array.from(socketTypes).sort().map(socketType => (
      `  ${yamlKey(socketType)}: {color: "#38bdf8", edgeWidthPx: 2, handleStrokeWidthPx: 2, accepts: ${yamlValue([socketType])}}`
    ))),
    'flow:',
    '  direction: {key: direction, type: string, value: "LR"}',
    '  nodes:',
  ]

  for (const node of args.graphData.nodes) {
    const properties = asRecord(node.properties) || {}
    const mediaUrl = readGraphNodeProperty(node, 'mediaUrl')
    const flowPortTypes = portTypesByNodeId.get(node.id)
    const fields: TypedYamlField[] = [
      ['id', node.id, 'string'],
      ['type', node.type || 'node', 'string'],
      ['label', node.label || node.id, 'string'],
      ['lane', properties.lane || properties.group || '', 'string'],
      ['order', properties.order, 'number'],
      ['position', { x: node.x ?? null, y: node.y ?? null }, 'object'],
      ['mediaKind', properties.mediaKind, 'string'],
    ]
    if (flowPortTypes && (Object.keys(flowPortTypes.in).length > 0 || Object.keys(flowPortTypes.out).length > 0)) {
      fields.push(['flow:portTypes', flowPortTypes, 'object'])
    }
    if (mediaUrl) fields.push(['mediaUrl', mediaUrl, 'string'])
    appendTypedYamlPropertyFields(fields, properties)
    const visibleFields = fields.filter(hasTypedYamlValue)
    const [first, ...rest] = visibleFields
    lines.push(`    - ${typedYamlField(first[0], first[1], first[2])}`)
    for (const [key, value, type] of rest) {
      lines.push(`      ${typedYamlField(key, value, type)}`)
    }
  }

  lines.push('  edges:')
  for (const edge of args.graphData.edges) {
    const properties = asRecord(edge.properties) || {}
    const socketType = readLuminaEdgeSocketType(properties)
    const fields: TypedYamlField[] = [
      ['id', edge.id, 'string'],
      ['source', edge.source, 'string'],
      ['target', edge.target, 'string'],
      ['type', socketType, 'string'],
      ['label', edge.label || 'luminaLink', 'string'],
      ['sourceHandle', properties.sourcePort, 'string'],
      ['targetHandle', properties.targetPort, 'string'],
      ['sourcePort', properties.sourcePort, 'string'],
      ['targetPort', properties.targetPort, 'string'],
      ['evidenceKind', properties.evidenceKind, 'string'],
      ['confidence', properties.confidence, 'string'],
      ['luminaLink', properties.luminaLink === true, 'boolean'],
      ['strybldrWorkflowEdge', properties.strybldrWorkflowEdge === true, 'boolean'],
    ]
    const [first, ...rest] = fields
    lines.push(`    - ${typedYamlField(first[0], first[1], first[2])}`)
    for (const [key, value, type] of rest) {
      lines.push(`      ${typedYamlField(key, value, type)}`)
    }
  }

  lines.push('---', '', `# ${String(args.name || 'Lumina Storyboard')}`, '')
  return lines.join('\n')
}

export function isBytePlusLuminaCanvasJson(json: unknown): boolean {
  const record = asRecord(json)
  if (!record || !Array.isArray(record.nodes) || !Array.isArray(record.links)) return false
  return record.nodes.some(node => {
    const nodeRecord = asRecord(node)
    return !!nodeRecord && LUMINA_NODE_TYPE_RE.test(normalizeText(nodeRecord.type))
  })
}

export function looksLikeBytePlusLuminaCanvasText(text: string): boolean {
  const raw = String(text || '')
  const trimmed = raw.trimStart()
  if (!trimmed.startsWith('{')) return false
  if (!LUMINA_NODES_JSON_RE.test(raw) || !LUMINA_LINKS_JSON_RE.test(raw)) return false
  return LUMINA_NODE_TYPE_JSON_RE.test(raw) || LUMINA_PROMPT_JSON_RE.test(raw)
}

export function tryBuildBytePlusLuminaCanvasGraphData(args: {
  name: string
  json: unknown
}): { graphData: GraphData; warnings: string[] } | null {
  if (!isBytePlusLuminaCanvasJson(args.json)) return null
  const record = args.json as JsonRecord
  const promptRecords = asRecord(asRecord(record.ba_extra)?.prompt) || {}
  const groups = readGroupBoxes(record.groups)
  const nodes = asArray(record.nodes)
    .map((node, index) => {
      const nodeRecord = asRecord(node)
      if (!nodeRecord) return null
      const id = normalizeText(nodeRecord.id)
      return buildLuminaNode({
        node: nodeRecord,
        index,
        group: findContainingGroup(nodeRecord, groups),
        promptRecord: asRecord(promptRecords[id]),
      })
    })
    .filter(Boolean) as GraphNode[]
  const groupNodes = groups.map(buildLuminaGroupNode)
  const graphNodes = [...nodes, ...groupNodes]
  const nodeIds = new Set(graphNodes.map(node => node.id))
  const edges = asArray(record.links)
    .map((entry, index) => buildLuminaEdgeFromArray(entry, index, nodeIds))
    .filter(Boolean) as GraphEdge[]
  const graphMetadata = {
    source: args.name,
    sourceKind: 'byteplus-lumina-canvas',
    graphKind: 'storyboard',
    parserId: 'byteplus-lumina-canvas',
    kind: 'strybldr-storyboard',
    kgStrybldrStoryboard: true,
    kgCanvas2dRenderer: 'storyboard',
    luminaVersion: asJson(record.version ?? null),
    luminaGroupCount: groups.length,
  } as Record<string, JSONValue>
  const graphDataWithoutMarkdownSource = {
    type: 'apiGraph' as const,
    context: 'strybldr-storyboard',
    metadata: graphMetadata,
    nodes: graphNodes,
    edges,
  }
  const markdownSource = buildLuminaMarkdownSource({
    name: args.name,
    graphData: graphDataWithoutMarkdownSource,
  })
  return {
    graphData: {
      ...graphDataWithoutMarkdownSource,
      metadata: {
        ...graphMetadata,
        markdownSource: asJsonRecord({
          kind: MARKDOWN_SOURCE_FIDELITY_KIND,
          version: MARKDOWN_SOURCE_FIDELITY_VERSION,
          documentName: `${args.name.replace(/\.[^.]+$/, '') || 'lumina-storyboard'}.md`,
          text: markdownSource,
        }),
      },
    },
    warnings: [],
  }
}
