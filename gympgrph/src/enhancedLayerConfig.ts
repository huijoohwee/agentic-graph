import type {
  Asset3DConfig,
  ConfigDiagnostic,
  ExtrusionKind,
  ExtrusionLayerConfig,
  FetchBound,
  NormalizedEnhancedConfig,
} from 'grph-shared/geospatial/enhancedLayerContract'

const DEFAULT_EXTRUSION_HEIGHT_METERS = 8
const DEFAULT_FILL_COLOR = '#9aa5b1'
const DEFAULT_FILL_OPACITY = 0.85

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

const finiteNumber = (value: unknown): number | null => {
  const numberValue = Number(value)
  return Number.isFinite(numberValue) ? numberValue : null
}

const clamp = (value: unknown, minimum: number, maximum: number, fallback: number): number => {
  const numberValue = finiteNumber(value)
  if (numberValue == null) return fallback
  return Math.max(minimum, Math.min(maximum, numberValue))
}

const normalizeTags = (value: unknown): readonly string[] => {
  if (!Array.isArray(value)) return []
  return [...new Set(value
    .map(item => String(item || '').trim().toLowerCase())
    .filter(Boolean)
    .map(tag => tag.startsWith('#') ? tag : `#${tag}`))]
}

const normalizeUrl = (record: Record<string, unknown>): string => {
  const source = isRecord(record.source) ? record.source : null
  const sourceUrl = source?.kind === 'url' ? source.url : null
  return String(record.url || sourceUrl || '').trim()
}

export function resolveFetchBound(
  scope: { layer?: Partial<FetchBound>; config?: Partial<FetchBound> },
): { ok: true; bound: FetchBound } | { ok: false; missing: 'timeoutMs' | 'maxBytes' } {
  const timeoutMs = finiteNumber(scope.layer?.timeoutMs ?? scope.config?.timeoutMs)
  if (timeoutMs == null || timeoutMs <= 0) return { ok: false, missing: 'timeoutMs' }
  const maxBytes = finiteNumber(scope.layer?.maxBytes ?? scope.config?.maxBytes)
  if (maxBytes == null || maxBytes <= 0) return { ok: false, missing: 'maxBytes' }
  return {
    ok: true,
    bound: {
      timeoutMs: Math.max(1_000, Math.min(300_000, Math.floor(timeoutMs))),
      maxBytes: Math.max(1, Math.min(100 * 1024 * 1024, Math.floor(maxBytes))),
    },
  }
}

const readFetchBound = (
  record: Record<string, unknown>,
  render: Record<string, unknown>,
  target: string,
  diagnostics: ConfigDiagnostic[],
): FetchBound | null => {
  const result = resolveFetchBound({
    layer: isRecord(render.fetchBounds) ? render.fetchBounds : undefined,
    config: isRecord(record.fetchBounds) ? record.fetchBounds : undefined,
  })
  if (result.ok) return result.bound
  diagnostics.push({ code: 'missing-fetch-bound', target, key: result.missing })
  return null
}

const normalizeExtrusion = (
  record: Record<string, unknown>,
  render: Record<string, unknown>,
  index: number,
  diagnostics: ConfigDiagnostic[],
): ExtrusionLayerConfig | null => {
  const datasetId = String(record.id || '').trim() || `dataset-${index + 1}`
  const kind: ExtrusionKind = render.extrusionKind === 'road' ? 'road' : 'building'
  const id = String(render.id || '').trim() || `${datasetId}:${kind}`
  const url = normalizeUrl(record)
  const heightProperty = String(render.heightProperty || '').trim()
  const fetchBound = readFetchBound(record, render, id, diagnostics)
  if (!url || !heightProperty || !fetchBound) {
    if (!url) diagnostics.push({ code: 'invalid-config', target: id, field: 'url', value: record.url })
    if (!heightProperty) diagnostics.push({ code: 'invalid-config', target: id, field: 'heightProperty', value: render.heightProperty })
    return null
  }
  const fillColor = /^#[0-9a-f]{6}$/i.test(String(render.fillColor || ''))
    ? String(render.fillColor)
    : DEFAULT_FILL_COLOR
  if (render.fillColor != null && fillColor === DEFAULT_FILL_COLOR && render.fillColor !== DEFAULT_FILL_COLOR) {
    diagnostics.push({ code: 'invalid-paint', layerId: id, field: 'fillColor', value: render.fillColor })
  }
  return {
    id,
    datasetId,
    url,
    kind,
    heightProperty,
    defaultHeightMeters: clamp(render.defaultHeightMeters, 0, 10_000, DEFAULT_EXTRUSION_HEIGHT_METERS),
    baseHeightMeters: clamp(render.baseHeightMeters, 0, 10_000, 0),
    fillColor,
    fillOpacity: clamp(render.fillOpacity, 0, 1, DEFAULT_FILL_OPACITY),
    tags: normalizeTags(render.tags),
    visible: record.enabled !== false && render.visible !== false,
    fetchBound,
  }
}

const normalizeAsset = (
  record: Record<string, unknown>,
  render: Record<string, unknown>,
  index: number,
  diagnostics: ConfigDiagnostic[],
): Asset3DConfig | null => {
  const id = String(render.id || record.id || '').trim() || `asset-${index + 1}`
  const url = normalizeUrl(record)
  const lat = finiteNumber(render.lat)
  const lng = finiteNumber(render.lng)
  const fetchBound = readFetchBound(record, render, id, diagnostics)
  if (lat == null || lat < -90 || lat > 90) {
    diagnostics.push({ code: 'invalid-coordinate', assetId: id, field: 'lat', value: render.lat })
  }
  if (lng == null || lng < -180 || lng > 180) {
    diagnostics.push({ code: 'invalid-coordinate', assetId: id, field: 'lng', value: render.lng })
  }
  if (!url) diagnostics.push({ code: 'invalid-config', target: id, field: 'url', value: record.url })
  if (!url || lat == null || lat < -90 || lat > 90 || lng == null || lng < -180 || lng > 180 || !fetchBound) return null
  return {
    id,
    url,
    lat,
    lng,
    altitudeMeters: finiteNumber(render.altitudeMeters) ?? 0,
    scale: clamp(render.scale, 0.000001, 1_000_000, 1),
    rotationDegrees: finiteNumber(render.rotationDegrees) ?? 0,
    tags: normalizeTags(render.tags),
    visible: record.enabled !== false && render.visible !== false,
    fetchBound,
  }
}

export function normalizeEnhancedConfig(raw: unknown): NormalizedEnhancedConfig {
  if (!Array.isArray(raw)) return { extrusions: [], assets: [], diagnostics: [] }
  const extrusions: ExtrusionLayerConfig[] = []
  const assets: Asset3DConfig[] = []
  const diagnostics: ConfigDiagnostic[] = []
  raw.forEach((value, index) => {
    if (!isRecord(value) || !isRecord(value.render)) return
    if (value.render.kind === 'extrusion') {
      const extrusion = normalizeExtrusion(value, value.render, index, diagnostics)
      if (extrusion) extrusions.push(extrusion)
    } else if (value.render.kind === 'asset3d') {
      const asset = normalizeAsset(value, value.render, index, diagnostics)
      if (asset) assets.push(asset)
    }
  })
  return { extrusions, assets, diagnostics }
}
