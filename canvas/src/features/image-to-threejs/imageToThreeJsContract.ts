import type { GraphNode } from '@/lib/graph/types'
import type { FlowConnectedValuesBySchemaPath } from '@/lib/storyboardWidget/flowDataflow'
import { extractMarkdownMediaUrl } from '@/lib/canvas/graph-elements/mediaSpecMarkdown'
import {
  GRAPH_NODE_CARD_ACTION_PROPERTY_KEYS,
  GRAPH_NODE_CARD_DIALOGUE_PROPERTY_KEYS,
  GRAPH_NODE_CARD_PROMPT_PROPERTY_KEYS,
  GRAPH_NODE_CARD_SUMMARY_PROPERTY_KEYS,
} from '@/lib/cards/graphNodeCardFields'
import { splitInvocationTokenSegments } from '@/lib/markdown/invocationTokens'

export const IMAGE_TO_THREEJS_SKILL_NODE_TYPE_ID = 'ImageToThreeJsSkill' as const
export const IMAGE_TO_THREEJS_SKILL_NODE_LABEL = 'Image to Three.js Skill' as const
export const IMAGE_TO_THREEJS_SKILL_WIDGET_TYPE_ID = 'default' as const
export const IMAGE_TO_THREEJS_SKILL_FORM_ID = 'imageToThreeJsSkill' as const
export const IMAGE_TO_THREEJS_RENDER_MODE = 'threejs' as const
export const IMAGE_TO_THREEJS_SCHEMA = 'agenticgraph-image-to-threejs/v1' as const
export const IMAGE_TO_THREEJS_COMMAND_TOKEN = '/image.to-threejs' as const
export const IMAGE_TO_THREEJS_SEMANTIC_TOKEN = '#image-to-threejs' as const
export const IMAGE_TO_THREEJS_BINDING_TOKEN = '@image-to-threejs' as const
export const IMAGE_TO_THREEJS_OUTPUT_PANEL_PROPERTY = 'imageThreeJsOutputPanel' as const
export const IMAGE_TO_THREEJS_OUTPUT_PANEL_ANCHOR_ID_PROPERTY = 'imageThreeJsOutputAnchorNodeId' as const
export const IMAGE_TO_THREEJS_OUTPUT_PANEL_LABEL = 'Three.js Rich Media Panel' as const

export type ImageToThreeJsSourceKind = 'raster' | 'svg'
export type ImageToThreeJsRenderMode = typeof IMAGE_TO_THREEJS_RENDER_MODE
export type ImageToThreeJsRunInvocation = 'skill-node' | 'inline-command'

export type ImageToThreeJsRunInput = {
  invocation: ImageToThreeJsRunInvocation
  invocationTokens: readonly string[]
  sourceUrl: string
}

export type ImageToThreeJsManifest = {
  schema: typeof IMAGE_TO_THREEJS_SCHEMA
  source: {
    url: string
    kind: ImageToThreeJsSourceKind
    extension: 'jpg' | 'png' | 'svg'
  }
  render: {
    engine: 'three'
    primitive: 'shape-geometry' | 'textured-plane'
  }
  cost: {
    model: 'local-threejs'
    prompt_tokens: 0
    completion_tokens: 0
    cache_hits: 0
    estimated_cost_usd: 0
  }
}

export type ImageToThreeJsConversionResult =
  | { ok: true; manifest: ImageToThreeJsManifest; patch: Record<string, unknown> }
  | { ok: false; errorCode: 'missing-source' | 'unsupported-format'; reason: string }

const SUPPORTED_EXTENSION_PATTERN = /\.(png|jpe?g|svg)$/i
const SOURCE_PROPERTY_KEYS = ['sourceImageUrl', 'imageUrl', 'reference_image', 'media_url', 'mediaUrl', 'image'] as const
const SOURCE_SCHEMA_PATHS = SOURCE_PROPERTY_KEYS.map(key => `properties.${key}`)
const SOURCE_COLLECTION_PROPERTY_KEYS = ['storyboardMediaItems', 'referenceImages', 'reference_images', 'images', 'media'] as const
const INLINE_INVOCATION_PROPERTY_KEYS = [
  ...GRAPH_NODE_CARD_SUMMARY_PROPERTY_KEYS,
  ...GRAPH_NODE_CARD_ACTION_PROPERTY_KEYS,
  ...GRAPH_NODE_CARD_DIALOGUE_PROPERTY_KEYS,
  ...GRAPH_NODE_CARD_PROMPT_PROPERTY_KEYS,
  'invocation',
  'invocations',
  'command',
  'commands',
  'slash',
  'slashCommand',
  'slashCommands',
  'semantic',
  'semantics',
  'hash',
  'hashToken',
  'hashTokens',
  'at',
  'atToken',
  'atTokens',
  'binding',
  'bindings',
] as const
const IMAGE_TO_THREEJS_INVOCATION_TOKEN_SET = new Set<string>([
  IMAGE_TO_THREEJS_COMMAND_TOKEN,
  IMAGE_TO_THREEJS_SEMANTIC_TOKEN,
  IMAGE_TO_THREEJS_BINDING_TOKEN,
])

const LEGACY_IMAGE_TO_THREEJS_DERIVED_OUTPUT_PROPERTY_KEYS = [
  'mediaRenderMode',
  'imageThreeJsManifest',
  'imageThreeJsInvocation',
  'output',
  'outputPath',
  'outputManifestPath',
  'outputStorageUrl',
  'outputMimeType',
  'outputModel',
  'outputSourceUrl',
  'outputSavedName',
  'outputSrcDoc',
  'outputLoading',
  'outputLoadingKind',
  'renderErrorCode',
  'renderErrorReason',
  'renderJobId',
  'lastRunAt',
] as const

function cleanString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function unwrapScalar(value: unknown): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value) || !('value' in value)) return value
  return (value as { value?: unknown }).value
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value)
}

function parseRecord(value: unknown): Record<string, unknown> | null {
  const scalar = unwrapScalar(value)
  if (isRecord(scalar)) return scalar
  if (typeof scalar !== 'string') return null
  try {
    const parsed = JSON.parse(scalar) as unknown
    return isRecord(parsed) ? parsed : null
  } catch {
    return null
  }
}

function readNodePropertyRecords(value: unknown): Record<string, unknown>[] {
  if (!isRecord(value)) return []
  const nested = isRecord(value.properties) ? value.properties : null
  return nested ? [value, nested] : [value]
}

function collectTextValues(value: unknown, out: string[]): void {
  const scalar = unwrapScalar(value)
  if (typeof scalar === 'string') {
    const text = scalar.trim()
    if (text) out.push(text)
    return
  }
  if (Array.isArray(scalar)) scalar.forEach(item => collectTextValues(item, out))
}

function readInlineInvocationTextValues(properties: unknown): string[] {
  const values: string[] = []
  for (const record of readNodePropertyRecords(properties)) {
    for (const key of INLINE_INVOCATION_PROPERTY_KEYS) collectTextValues(record[key], values)
  }
  return values
}

function readSourceUrlFromCollection(value: unknown): string {
  if (!Array.isArray(value)) return ''
  let fallback = ''
  for (const item of value) {
    const record = isRecord(item) ? item : null
    const candidates = record
      ? [record.sourceUrl, record.imageUrl, record.mediaUrl, record.url]
      : [item]
    for (const candidate of candidates) {
      const url = cleanString(unwrapScalar(candidate))
      if (!url) continue
      if (!fallback) fallback = url
      if (resolveImageToThreeJsSourceKind(url)) return url
    }
  }
  return fallback
}

function readInlineImageSourceUrl(properties: unknown): string {
  for (const text of readInlineInvocationTextValues(properties)) {
    const media = extractMarkdownMediaUrl(text)
    if (!media || (media.kind !== 'image' && media.kind !== 'svg')) continue
    const url = cleanString(media.url)
    if (url) return url
  }
  return ''
}

/** Shared Card/Widget invocation scanner for image-derived native skills. */
export function readImageDerivedInlineInvocationTokens(properties: unknown): string[] {
  const found = new Set<string>()
  for (const text of readInlineInvocationTextValues(properties)) {
    for (const segment of splitInvocationTokenSegments(text)) {
      if (segment.kind !== 'token') continue
      const normalized = segment.value.toLowerCase()
      if (normalized) found.add(normalized)
    }
  }
  return [...found]
}

function readImageToThreeJsInvocationTokens(properties: unknown): string[] {
  return readImageDerivedInlineInvocationTokens(properties)
    .filter(token => IMAGE_TO_THREEJS_INVOCATION_TOKEN_SET.has(token))
}

function isImageToThreeJsOutputPanelRecord(properties: Record<string, unknown>): boolean {
  const value = unwrapScalar(properties[IMAGE_TO_THREEJS_OUTPUT_PANEL_PROPERTY])
  return value === true || cleanString(value).toLowerCase() === 'true'
}

function resolveLegacyImageToThreeJsRunInputFromRecord(properties: Record<string, unknown>): ImageToThreeJsRunInput | null {
  const manifest = parseRecord(properties.imageThreeJsManifest) || parseRecord(properties.output)
  if (!manifest) return null
  if (cleanString(unwrapScalar(manifest.schema)) !== IMAGE_TO_THREEJS_SCHEMA) return null
  const source = parseRecord(manifest.source)
  const sourceUrl = cleanString(unwrapScalar(source?.url))
  if (!resolveImageToThreeJsSourceKind(sourceUrl)) return null
  const invocation = parseRecord(properties.imageThreeJsInvocation)
  const rawTokens = unwrapScalar(invocation?.tokens)
  const invocationTokens = Array.isArray(rawTokens)
    ? rawTokens
      .map(token => cleanString(unwrapScalar(token)).toLowerCase())
      .filter(token => IMAGE_TO_THREEJS_INVOCATION_TOKEN_SET.has(token))
    : []
  const hasInlineInvocation = cleanString(unwrapScalar(invocation?.kind)) === 'inline-command'
    && invocationTokens.includes(IMAGE_TO_THREEJS_COMMAND_TOKEN)
  const outputMimeType = cleanString(unwrapScalar(properties.outputMimeType))
  const serializedOutput = cleanString(unwrapScalar(properties.output))
  const hasLegacySerializedOutput = outputMimeType === 'application/vnd.agenticgraph.image-threejs+json'
    || serializedOutput.includes(IMAGE_TO_THREEJS_SCHEMA)
  if (!hasInlineInvocation && !hasLegacySerializedOutput) return null
  return {
    invocation: 'inline-command',
    invocationTokens: invocationTokens.length > 0 ? invocationTokens : [IMAGE_TO_THREEJS_COMMAND_TOKEN],
    sourceUrl,
  }
}

export function isImageToThreeJsOutputPanel(properties: unknown): boolean {
  return readNodePropertyRecords(properties).some(isImageToThreeJsOutputPanelRecord)
}

/**
 * Old inline runs wrote their derived Three.js payload back into the input Card
 * and its connected media panel.  This deliberately requires the persisted
 * invocation and manifest together, so an authored Three.js panel is never
 * mistaken for that legacy output.
 */
export function resolveLegacyImageToThreeJsRunInput(properties: unknown): ImageToThreeJsRunInput | null {
  if (isImageToThreeJsOutputPanel(properties)) return null
  for (const record of readNodePropertyRecords(properties)) {
    const resolved = resolveLegacyImageToThreeJsRunInputFromRecord(record)
    if (resolved) return resolved
  }
  return null
}

/**
 * A marker-owned output panel cannot run itself, but it is an explicit,
 * trustworthy recovery record for its anchored source Card.
 */
export function resolveImageToThreeJsOutputPanelRunInput(properties: unknown): ImageToThreeJsRunInput | null {
  if (!isImageToThreeJsOutputPanel(properties)) return null
  for (const record of readNodePropertyRecords(properties)) {
    const resolved = resolveLegacyImageToThreeJsRunInputFromRecord(record)
    if (resolved) return resolved
  }
  return null
}

export function isLegacyImageToThreeJsDerivedOutput(properties: unknown): boolean {
  return readImageToThreeJsRenderMode(properties) === IMAGE_TO_THREEJS_RENDER_MODE
    && resolveLegacyImageToThreeJsRunInput(properties) !== null
}

export function clearLegacyImageToThreeJsDerivedOutputProperties(properties: Record<string, unknown> | null | undefined): Record<string, unknown> {
  const next = { ...(properties || {}) }
  for (const key of LEGACY_IMAGE_TO_THREEJS_DERIVED_OUTPUT_PROPERTY_KEYS) delete next[key]
  return next
}

function readExtension(url: string): 'jpg' | 'png' | 'svg' | null {
  const dataMime = url.match(/^data:image\/(png|jpeg|jpg|svg\+xml)(?:[;,])/i)?.[1]?.toLowerCase()
  if (dataMime === 'png') return 'png'
  if (dataMime === 'jpg' || dataMime === 'jpeg') return 'jpg'
  if (dataMime === 'svg+xml') return 'svg'
  try {
    const parsed = new URL(url, 'http://localhost')
    const pathname = parsed.pathname
    const match = pathname.match(SUPPORTED_EXTENSION_PATTERN)?.[1]?.toLowerCase()
    if (match === 'png') return 'png'
    if (match === 'jpg' || match === 'jpeg') return 'jpg'
    if (match === 'svg') return 'svg'
    for (const key of ['url', 'path', 'src']) {
      const nested = parsed.searchParams.get(key) || ''
      const nestedMatch = nested.split(/[?#]/, 1)[0]?.match(SUPPORTED_EXTENSION_PATTERN)?.[1]?.toLowerCase()
      if (nestedMatch === 'png') return 'png'
      if (nestedMatch === 'jpg' || nestedMatch === 'jpeg') return 'jpg'
      if (nestedMatch === 'svg') return 'svg'
    }
  } catch {
    const match = url.split(/[?#]/, 1)[0]?.match(SUPPORTED_EXTENSION_PATTERN)?.[1]?.toLowerCase()
    if (match === 'png') return 'png'
    if (match === 'jpg' || match === 'jpeg') return 'jpg'
    if (match === 'svg') return 'svg'
  }
  return null
}

export function resolveImageToThreeJsSourceKind(url: unknown): ImageToThreeJsSourceKind | null {
  const extension = readExtension(cleanString(url))
  if (extension === 'svg') return 'svg'
  return extension === 'jpg' || extension === 'png' ? 'raster' : null
}

export function readImageToThreeJsRenderMode(properties: unknown): ImageToThreeJsRenderMode | undefined {
  return readNodePropertyRecords(properties).some(record => (
    cleanString(unwrapScalar(record.mediaRenderMode)).toLowerCase() === IMAGE_TO_THREEJS_RENDER_MODE
  )) ? IMAGE_TO_THREEJS_RENDER_MODE : undefined
}

export function isImageToThreeJsSkillNode(node: Pick<GraphNode, 'type' | 'properties'> | null | undefined): boolean {
  if (!node) return false
  if (cleanString(unwrapScalar(node.type)) === IMAGE_TO_THREEJS_SKILL_NODE_TYPE_ID) return true
  return readNodePropertyRecords(node.properties).some(properties => (
    cleanString(unwrapScalar(properties['flow:widgetFormId'])) === IMAGE_TO_THREEJS_SKILL_FORM_ID
  ))
}

export function resolveImageToThreeJsSourceUrl(args: {
  node: Pick<GraphNode, 'properties'>
  connectedValuesBySchemaPath?: FlowConnectedValuesBySchemaPath
}): string {
  for (const schemaPath of SOURCE_SCHEMA_PATHS) {
    const connected = cleanString(unwrapScalar(args.connectedValuesBySchemaPath?.[schemaPath]?.value))
    if (connected) return connected
  }
  const propertyRecords = readNodePropertyRecords(args.node.properties)
  for (const properties of propertyRecords) {
    for (const key of SOURCE_PROPERTY_KEYS) {
      const local = cleanString(unwrapScalar(properties[key]))
      if (local) return local
    }
  }
  for (const properties of propertyRecords) {
    for (const key of SOURCE_COLLECTION_PROPERTY_KEYS) {
      const collectionSource = readSourceUrlFromCollection(unwrapScalar(properties[key]))
      if (collectionSource) return collectionSource
    }
  }
  return readInlineImageSourceUrl(args.node.properties)
}

export function resolveImageToThreeJsRunInput(args: {
  node: Pick<GraphNode, 'type' | 'properties'>
  connectedValuesBySchemaPath?: FlowConnectedValuesBySchemaPath
}): ImageToThreeJsRunInput | null {
  const invocationTokens = readImageToThreeJsInvocationTokens(args.node.properties)
  const invocation: ImageToThreeJsRunInvocation | null = isImageToThreeJsSkillNode(args.node)
    ? 'skill-node'
    : invocationTokens.includes(IMAGE_TO_THREEJS_COMMAND_TOKEN)
      ? 'inline-command'
      : null
  if (!invocation) {
    const nodeType = cleanString(unwrapScalar(args.node.type))
    return nodeType === 'TextGeneration' ? resolveLegacyImageToThreeJsRunInput(args.node.properties) : null
  }
  return {
    invocation,
    invocationTokens,
    sourceUrl: resolveImageToThreeJsSourceUrl(args),
  }
}

export function buildImageToThreeJsConversion(sourceUrl: unknown): ImageToThreeJsConversionResult {
  const url = cleanString(sourceUrl)
  if (!url) {
    return {
      ok: false,
      errorCode: 'missing-source',
      reason: 'Image to Three.js requires a PNG, JPG, or SVG source URL.',
    }
  }
  const extension = readExtension(url)
  if (!extension) {
    return {
      ok: false,
      errorCode: 'unsupported-format',
      reason: 'Image to Three.js supports only .png, .jpg, .jpeg, and .svg sources.',
    }
  }
  const kind: ImageToThreeJsSourceKind = extension === 'svg' ? 'svg' : 'raster'
  const manifest: ImageToThreeJsManifest = {
    schema: IMAGE_TO_THREEJS_SCHEMA,
    source: { url, kind, extension },
    render: {
      engine: 'three',
      primitive: kind === 'svg' ? 'shape-geometry' : 'textured-plane',
    },
    cost: {
      model: 'local-threejs',
      prompt_tokens: 0,
      completion_tokens: 0,
      cache_hits: 0,
      estimated_cost_usd: 0,
    },
  }
  return {
    ok: true,
    manifest,
    patch: {
      imageUrl: url,
      media_url: url,
      media_kind: kind === 'svg' ? 'svg' : 'image',
      mediaRenderMode: IMAGE_TO_THREEJS_RENDER_MODE,
      imageThreeJsManifest: manifest,
      output: JSON.stringify(manifest, null, 2),
      outputMimeType: 'application/vnd.agenticgraph.image-threejs+json',
      outputModel: 'local-threejs',
      outputSourceUrl: url,
      richMediaActiveTab: 'image',
      lastRunAt: new Date().toISOString(),
    },
  }
}
