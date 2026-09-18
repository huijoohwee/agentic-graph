import type { JSONValue } from '@/lib/graph/types'
import { resolveCanvas2dRendererId } from '@/lib/config.render'
import { readKeyTypeValueField } from '@/lib/graph/keyTypeValue'

const CANVAS_FRONTMATTER_FIELD_KEYS = [
  'kgCanvasSurfaceMode',
  'kgCanvasRenderMode',
  'kgCanvas3dMode',
  'kgCanvas2dRenderer',
  'kgDocumentSemanticMode',
  'kgFrontmatterModeEnabled',
  'kgMultiDimTableModeEnabled',
  'kgDocumentStructureBaselineLock',
  'kgWorkflowManagerModeEnabled',
  'kgStrybldrStoryboard',
] as const

const ASSET_FRONTMATTER_FIELD_KEYS = [
  'kgAssetType',
  'kgAssetFormat',
  'kgAssetName',
  'kgAssetMimeType',
  'kgAssetDataUrl',
  'kgAssetUrl',
  'kgAssetPendingLocalImport',
  'kgAssetPendingLocalPath',
  'kgAssetBytes',
  'kgAssetValidGlbMagic',
  'kgAssetValidGlbContainer',
  'kgAssetValidGlbChunkOrder',
  'kgAssetValidGlbChunkAlignment',
  'kgAssetValidGlbJsonPadding',
  'kgAssetValidGlbBinPadding',
  'kgAssetValidGlbBinReference',
  'kgAssetValidGltfJson',
  'kgAssetValidGltfAsset',
  'kgAssetGltfVersion',
  'kgAssetExternalResourceCount',
  'kgAssetEmbeddedResourceCount',
  'kgAssetGlbJsonChunkBytes',
  'kgAssetGlbBinChunkBytes',
  'kgAssetGlbUnknownChunkCount',
] as const

const DIAGRAM_FRONTMATTER_FIELD_KEYS = [
  'flow_diagrams',
] as const

export const STRUCTURED_FRONTMATTER_FIELD_KEYS = new Set<string>([
  ...CANVAS_FRONTMATTER_FIELD_KEYS,
  ...ASSET_FRONTMATTER_FIELD_KEYS,
  ...DIAGRAM_FRONTMATTER_FIELD_KEYS,
])

const STRUCTURED_FRONTMATTER_ALIAS_BY_TOKEN: Readonly<Record<string, string>> = {
  canvassurfacemode: 'kgCanvasSurfaceMode',
  surfacemode: 'kgCanvasSurfaceMode',
  surface: 'kgCanvasSurfaceMode',
  canvasrenderermode: 'kgCanvasRenderMode',
  canvasrendermode: 'kgCanvasRenderMode',
  rendermode: 'kgCanvasRenderMode',
  render: 'kgCanvasRenderMode',
  canvas3dmode: 'kgCanvas3dMode',
  canvasthreedmode: 'kgCanvas3dMode',
  threedmode: 'kgCanvas3dMode',
  mode3d: 'kgCanvas3dMode',
  xrmode: 'kgCanvas3dMode',
  canvas2drenderer: 'kgCanvas2dRenderer',
  canvas2drendererid: 'kgCanvas2dRenderer',
  renderer: 'kgCanvas2dRenderer',
  rendererid: 'kgCanvas2dRenderer',
  renderid: 'kgCanvas2dRenderer',
  view: 'kgCanvas2dRenderer',
  viewmode: 'kgCanvas2dRenderer',
  documentsemanticmode: 'kgDocumentSemanticMode',
  semanticmode: 'kgDocumentSemanticMode',
  frontmattermodeenabled: 'kgFrontmatterModeEnabled',
  frontmatterenabled: 'kgFrontmatterModeEnabled',
  multidimtablemodeenabled: 'kgMultiDimTableModeEnabled',
  tablemodeenabled: 'kgMultiDimTableModeEnabled',
  documentstructurebaselinelock: 'kgDocumentStructureBaselineLock',
  baselinelock: 'kgDocumentStructureBaselineLock',
  assettype: 'kgAssetType',
  modeltype: 'kgAssetType',
  assetformat: 'kgAssetFormat',
  modelformat: 'kgAssetFormat',
  assetname: 'kgAssetName',
  modelname: 'kgAssetName',
  assetmimetype: 'kgAssetMimeType',
  modelmimetype: 'kgAssetMimeType',
  mimetype: 'kgAssetMimeType',
  assetdataurl: 'kgAssetDataUrl',
  modeldataurl: 'kgAssetDataUrl',
  dataurl: 'kgAssetDataUrl',
  asseturl: 'kgAssetUrl',
  modelurl: 'kgAssetUrl',
  sourceurl: 'kgAssetUrl',
  assetpendinglocalimport: 'kgAssetPendingLocalImport',
  pendinglocalimport: 'kgAssetPendingLocalImport',
  assetpendinglocalpath: 'kgAssetPendingLocalPath',
  pendinglocalpath: 'kgAssetPendingLocalPath',
  assetbytes: 'kgAssetBytes',
}

const STRUCTURED_FRONTMATTER_CONTAINER_KEYS = new Set([
  'canvas',
  'view',
  'surface',
  'render',
  'renderer',
  'asset',
  'model',
  'mode',
  'scene',
  'frontmatter',
])

const STRUCTURED_EXPLICIT_FRONTMATTER_CONTAINER_KEYS = new Set([
  'frontmatter',
])

const STRUCTURED_FRONTMATTER_RESERVED_KEY_TOKENS = new Set([
  'cards',
  'content',
  'edges',
  'flow',
  'media',
  'nodes',
  'panels',
  'response',
  'result',
  'richmedia',
  'structuredcontent',
  'table',
  'tables',
  'widgets',
])

const SAFE_STRUCTURED_FRONTMATTER_KEY_RE = /^[A-Za-z_][A-Za-z0-9_:-]{0,96}$/

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const toJsonValue = (value: unknown): JSONValue | undefined => {
  if (value === null) return null
  if (typeof value === 'string' || typeof value === 'boolean') return value
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined
  if (Array.isArray(value)) {
    const out: JSONValue[] = []
    for (const item of value) {
      const next = toJsonValue(item)
      if (typeof next !== 'undefined') out.push(next)
    }
    return out
  }
  if (isRecord(value)) {
    const out: Record<string, JSONValue> = {}
    for (const [key, raw] of Object.entries(value)) {
      const next = toJsonValue(raw)
      if (typeof next !== 'undefined') out[key] = next
    }
    return out
  }
  return undefined
}

const readString = (value: unknown): string =>
  typeof value === 'string'
    ? value.trim()
    : (typeof value === 'number' || typeof value === 'boolean')
      ? String(value).trim()
      : ''

const unwrapStructuredFieldValue = (raw: unknown, key: string): unknown =>
  readKeyTypeValueField({
    raw,
    path: `structuredContent.${key}`,
    expectedKey: key || undefined,
    warnings: [],
  })

const mergeStructuredProperties = (record: Record<string, unknown>): Record<string, unknown> => {
  const out: Record<string, unknown> = { ...record }
  const assignIfMissing = (keyRaw: unknown, valueRaw: unknown) => {
    const key = readString(unwrapStructuredFieldValue(keyRaw, 'key'))
    if (!key || Object.prototype.hasOwnProperty.call(out, key)) return
    out[key] = unwrapStructuredFieldValue(valueRaw, key)
  }
  const properties = record.properties
  if (isRecord(properties)) {
    for (const [key, value] of Object.entries(properties)) {
      if (!Object.prototype.hasOwnProperty.call(out, key)) out[key] = unwrapStructuredFieldValue(value, key)
    }
  } else if (Array.isArray(properties)) {
    for (const item of properties) {
      if (isRecord(item)) assignIfMissing(item.key, item)
    }
  }
  return out
}

const readFieldValue = (record: Record<string, unknown>, key: string): unknown =>
  unwrapStructuredFieldValue(record[key], key)

const normalizeStructuredKeyToken = (value: unknown): string =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')

const normalizeStructuredDisplayToken = (value: unknown): string =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\b(?:2d|3d|canvas|renderer|render|graph|mode|view|surface)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, '')

const readStructuredCanvasSurfaceModeValue = (value: unknown): JSONValue | undefined => {
  const raw = readString(value)
  if (!raw) return undefined
  const normalized = normalizeStructuredKeyToken(raw)
  const display = normalizeStructuredDisplayToken(raw)
  if (normalized === '2d' || normalized === '2dmode' || normalized === 'mode2d' || normalized === 'surface2d' || display === '2d') return '2d'
  if (normalized === '3d' || normalized === '3dmode' || normalized === 'mode3d' || normalized === 'surface3d' || display === '3d') return '3d'
  if (normalized === 'xr' || normalized === 'xrmode' || normalized === 'surfacexr' || display === 'xr') return 'xr'
  if (normalized === 'geospatial' || normalized === 'geomode' || normalized === 'geospatialmode' || display === 'geospatial' || display === 'geo') return 'geospatial'
  return undefined
}

const readStructuredCanvasRenderModeValue = (value: unknown): JSONValue | undefined => {
  const surface = readStructuredCanvasSurfaceModeValue(value)
  if (surface === '2d' || surface === '3d') return surface
  if (surface === 'xr') return '3d'
  const normalized = normalizeStructuredKeyToken(value)
  if (normalized === '2d' || normalized === '2dmode' || normalized === 'mode2d') return '2d'
  if (normalized === '3d' || normalized === '3dmode' || normalized === 'mode3d') return '3d'
  return undefined
}

const readStructuredCanvas3dModeValue = (value: unknown): JSONValue | undefined => {
  const raw = readString(value)
  if (!raw) return undefined
  const normalized = normalizeStructuredKeyToken(raw)
  const display = normalizeStructuredDisplayToken(raw)
  if (normalized === '3d' || normalized === '3dmode' || normalized === 'free3d' || display === '3d') return '3d'
  if (normalized === 'xr' || normalized === 'xrmode' || display === 'xr') return 'xr'
  if (normalized === 'voxel' || normalized === 'voxelmode' || display === 'voxel') return 'voxel'
  return undefined
}

const readStructuredCanvas2dRendererValue = (value: unknown): JSONValue | undefined => {
  const raw = readString(value)
  if (!raw) return undefined
  const direct = resolveCanvas2dRendererId(raw)
  if (direct) return direct
  return resolveCanvas2dRendererId(normalizeStructuredDisplayToken(raw))
}

const readStructuredDocumentSemanticModeValue = (value: unknown): JSONValue | undefined => {
  const normalized = normalizeStructuredKeyToken(value)
  if (normalized === 'document' || normalized === 'documentstructure' || normalized === 'documentstructuremode') return 'document'
  if (normalized === 'keyword' || normalized === 'keywordmode') return 'keyword'
  return undefined
}

const readStructuredBooleanValue = (value: unknown): JSONValue | undefined => {
  if (typeof value === 'boolean') return value
  const normalized = normalizeStructuredKeyToken(value)
  if (normalized === 'true' || normalized === '1' || normalized === 'yes' || normalized === 'on') return true
  if (normalized === 'false' || normalized === '0' || normalized === 'no' || normalized === 'off') return false
  return undefined
}

const readStructuredAssetTypeValue = (value: unknown): JSONValue | undefined => {
  const normalized = normalizeStructuredKeyToken(value)
  if (normalized === 'model' || normalized === '3dmodel' || normalized === 'threedmodel') return 'model'
  return readString(value) ? toJsonValue(readString(value)) : undefined
}

const readStructuredAssetFormatValue = (value: unknown): JSONValue | undefined => {
  const normalized = normalizeStructuredKeyToken(value)
  if (normalized === 'glb' || normalized === 'gltfbinary') return 'glb'
  if (normalized === 'gltf' || normalized === 'gltfjson') return 'gltf'
  return readString(value) ? toJsonValue(readString(value)) : undefined
}

const normalizeStructuredFrontmatterValue = (key: string, value: unknown): JSONValue | undefined => {
  if (key === 'kgCanvasSurfaceMode') return readStructuredCanvasSurfaceModeValue(value)
  if (key === 'kgCanvasRenderMode') return readStructuredCanvasRenderModeValue(value)
  if (key === 'kgCanvas3dMode') return readStructuredCanvas3dModeValue(value)
  if (key === 'kgCanvas2dRenderer') return readStructuredCanvas2dRendererValue(value)
  if (key === 'kgDocumentSemanticMode') return readStructuredDocumentSemanticModeValue(value)
  if (
    key === 'kgFrontmatterModeEnabled'
    || key === 'kgMultiDimTableModeEnabled'
    || key === 'kgDocumentStructureBaselineLock'
    || key === 'kgWorkflowManagerModeEnabled'
    || key === 'kgStrybldrStoryboard'
    || key === 'kgAssetPendingLocalImport'
  ) {
    return readStructuredBooleanValue(value)
  }
  if (key === 'kgAssetType') return readStructuredAssetTypeValue(value)
  if (key === 'kgAssetFormat') return readStructuredAssetFormatValue(value)
  if (key === 'flow_diagrams') return toJsonValue(value)
  return toJsonValue(value)
}

const isSafeExplicitFrontmatterKey = (key: string): boolean => {
  if (!SAFE_STRUCTURED_FRONTMATTER_KEY_RE.test(key)) return false
  return !STRUCTURED_FRONTMATTER_RESERVED_KEY_TOKENS.has(normalizeStructuredKeyToken(key))
}

const assignStructuredFrontmatterValue = (
  out: Record<string, JSONValue>,
  key: string,
  value: unknown,
): boolean => {
  if (!STRUCTURED_FRONTMATTER_FIELD_KEYS.has(key)) return false
  const normalized = normalizeStructuredFrontmatterValue(key, value)
  if (typeof normalized === 'undefined') return false
  out[key] = normalized
  return true
}

const assignExplicitStructuredFrontmatterValue = (
  out: Record<string, JSONValue>,
  key: string,
  value: unknown,
): boolean => {
  if (!isSafeExplicitFrontmatterKey(key)) return false
  const normalized = STRUCTURED_FRONTMATTER_FIELD_KEYS.has(key)
    ? normalizeStructuredFrontmatterValue(key, value)
    : toJsonValue(value)
  if (typeof normalized === 'undefined') return false
  out[key] = normalized
  return true
}

export const collectStructuredFrontmatterFields = (
  value: unknown,
  out: Record<string, JSONValue>,
  sourceKey = '',
): void => {
  if (!isRecord(value)) {
    const token = normalizeStructuredKeyToken(sourceKey)
    const field = token ? STRUCTURED_FRONTMATTER_ALIAS_BY_TOKEN[token] : ''
    if (field) assignStructuredFrontmatterValue(out, field, value)
    return
  }
  const record = mergeStructuredProperties(value)
  const sourceToken = normalizeStructuredKeyToken(sourceKey)
  for (const [rawKey] of Object.entries(record)) {
    const token = normalizeStructuredKeyToken(rawKey)
    const contextualToken = sourceToken ? `${sourceToken}${token}` : token
    const canonical = STRUCTURED_FRONTMATTER_FIELD_KEYS.has(rawKey)
      ? rawKey
      : STRUCTURED_FRONTMATTER_ALIAS_BY_TOKEN[token] || STRUCTURED_FRONTMATTER_ALIAS_BY_TOKEN[contextualToken]
    if (canonical) assignStructuredFrontmatterValue(out, canonical, readFieldValue(record, rawKey))
  }
  for (const [rawKey, rawValue] of Object.entries(record)) {
    const token = normalizeStructuredKeyToken(rawKey)
    if (!STRUCTURED_FRONTMATTER_CONTAINER_KEYS.has(token) || !isRecord(rawValue)) continue
    if (STRUCTURED_EXPLICIT_FRONTMATTER_CONTAINER_KEYS.has(token)) {
      const frontmatterRecord = mergeStructuredProperties(rawValue)
      for (const [frontmatterKey] of Object.entries(frontmatterRecord)) {
        assignExplicitStructuredFrontmatterValue(out, frontmatterKey, readFieldValue(frontmatterRecord, frontmatterKey))
      }
    }
    collectStructuredFrontmatterFields(rawValue, out, rawKey)
    if ((token === 'model' || token === 'scene') && !Object.prototype.hasOwnProperty.call(out, 'kgAssetType')) {
      assignStructuredFrontmatterValue(out, 'kgAssetType', 'model')
    }
  }
}
