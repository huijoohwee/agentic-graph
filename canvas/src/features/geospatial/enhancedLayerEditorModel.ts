import type {
  Asset3DConfig,
  ExtrusionLayerConfig,
  NormalizedEnhancedConfig,
} from 'grph-shared/geospatial/enhancedLayerContract'

export type EnhancedLayerEditorKind = 'building' | 'road' | 'asset3d'

export type EnhancedLayerEditorLayer = {
  id: string
  kind: EnhancedLayerEditorKind
  url: string
  visible: boolean
  tags: readonly string[]
  timeoutMs: number
  maxBytes: number
  heightProperty: string
  defaultHeightMeters: number
  baseHeightMeters: number
  fillColor: string
  fillOpacity: number
  lat: number
  lng: number
  altitudeMeters: number
  scale: number
  rotationDegrees: number
}

export type EnhancedLayerDraft = {
  id: string
  kind: EnhancedLayerEditorKind
  url: string
  visible: boolean
  tags: string
  timeoutMs: string
  maxBytes: string
  heightProperty: string
  defaultHeightMeters: string
  baseHeightMeters: string
  fillColor: string
  fillOpacity: string
  lat: string
  lng: string
  altitudeMeters: string
  scale: string
  rotationDegrees: string
}

export type EnhancedLayerDraftErrors = Partial<Record<keyof EnhancedLayerDraft, string>>

const DEFAULT_TIMEOUT_MS = 10_000
const DEFAULT_MAX_BYTES = 25 * 1024 * 1024
const DEFAULT_HEIGHT_METERS = 8
const DEFAULT_FILL_COLOR = '#9aa5b1'
const DEFAULT_FILL_OPACITY = 0.85
const MAX_TIMEOUT_MS = 300_000
const MAX_BYTES = 100 * 1024 * 1024
const MAX_HEIGHT_METERS = 10_000
const MAX_SCALE = 1_000_000
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/
const COLOR_PATTERN = /^#[0-9a-f]{6}$/i
const REMOTE_URL_PATTERN = /^https?:\/\//i

const formatNumber = (value: number): string => Number.isFinite(value) ? String(value) : ''

const parseTags = (value: string): readonly string[] => (
  [...new Set(
    value
      .split(/[\s,]+/)
      .map(tag => tag.trim().toLowerCase())
      .filter(Boolean)
      .map(tag => tag.startsWith('#') ? tag : `#${tag}`),
  )]
)

const parseFiniteNumber = (value: string): number | null => {
  if (!value.trim()) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

const validateNumberRange = (
  value: string,
  minimum: number,
  maximum: number,
  label: string,
): string | undefined => {
  const parsed = parseFiniteNumber(value)
  if (parsed == null) return `${label} must be a number.`
  if (parsed < minimum || parsed > maximum) {
    return `${label} must be between ${minimum} and ${maximum}.`
  }
  return undefined
}

const extrusionToEditorLayer = (layer: ExtrusionLayerConfig): EnhancedLayerEditorLayer => ({
  id: layer.id,
  kind: layer.kind,
  url: layer.url,
  visible: layer.visible,
  tags: layer.tags,
  timeoutMs: layer.fetchBound.timeoutMs,
  maxBytes: layer.fetchBound.maxBytes,
  heightProperty: layer.heightProperty,
  defaultHeightMeters: layer.defaultHeightMeters,
  baseHeightMeters: layer.baseHeightMeters,
  fillColor: layer.fillColor,
  fillOpacity: layer.fillOpacity,
  lat: 0,
  lng: 0,
  altitudeMeters: 0,
  scale: 1,
  rotationDegrees: 0,
})

const assetToEditorLayer = (asset: Asset3DConfig): EnhancedLayerEditorLayer => ({
  id: asset.id,
  kind: 'asset3d',
  url: asset.url,
  visible: asset.visible,
  tags: asset.tags,
  timeoutMs: asset.fetchBound.timeoutMs,
  maxBytes: asset.fetchBound.maxBytes,
  heightProperty: 'height',
  defaultHeightMeters: DEFAULT_HEIGHT_METERS,
  baseHeightMeters: 0,
  fillColor: DEFAULT_FILL_COLOR,
  fillOpacity: DEFAULT_FILL_OPACITY,
  lat: asset.lat,
  lng: asset.lng,
  altitudeMeters: asset.altitudeMeters,
  scale: asset.scale,
  rotationDegrees: asset.rotationDegrees,
})

export function normalizedConfigToEditorLayers(
  config: NormalizedEnhancedConfig,
): readonly EnhancedLayerEditorLayer[] {
  return [
    ...config.extrusions.map(extrusionToEditorLayer),
    ...config.assets.map(assetToEditorLayer),
  ]
}

export function createEnhancedLayerDraft(
  kind: EnhancedLayerEditorKind = 'building',
): EnhancedLayerDraft {
  return {
    id: '',
    kind,
    url: '',
    visible: true,
    tags: '',
    timeoutMs: String(DEFAULT_TIMEOUT_MS),
    maxBytes: String(DEFAULT_MAX_BYTES),
    heightProperty: 'height',
    defaultHeightMeters: String(DEFAULT_HEIGHT_METERS),
    baseHeightMeters: '0',
    fillColor: DEFAULT_FILL_COLOR,
    fillOpacity: String(DEFAULT_FILL_OPACITY),
    lat: '0',
    lng: '0',
    altitudeMeters: '0',
    scale: '1',
    rotationDegrees: '0',
  }
}

export function editorLayerToDraft(layer: EnhancedLayerEditorLayer): EnhancedLayerDraft {
  return {
    id: layer.id,
    kind: layer.kind,
    url: layer.url,
    visible: layer.visible,
    tags: layer.tags.join(', '),
    timeoutMs: formatNumber(layer.timeoutMs),
    maxBytes: formatNumber(layer.maxBytes),
    heightProperty: layer.heightProperty,
    defaultHeightMeters: formatNumber(layer.defaultHeightMeters),
    baseHeightMeters: formatNumber(layer.baseHeightMeters),
    fillColor: layer.fillColor,
    fillOpacity: formatNumber(layer.fillOpacity),
    lat: formatNumber(layer.lat),
    lng: formatNumber(layer.lng),
    altitudeMeters: formatNumber(layer.altitudeMeters),
    scale: formatNumber(layer.scale),
    rotationDegrees: formatNumber(layer.rotationDegrees),
  }
}

export function validateEnhancedLayerDraft(
  draft: EnhancedLayerDraft,
  existingLayers: readonly EnhancedLayerEditorLayer[],
  editingId?: string,
): EnhancedLayerDraftErrors {
  const errors: EnhancedLayerDraftErrors = {}
  const id = draft.id.trim()
  if (!id) errors.id = 'Layer ID is required.'
  else if (!ID_PATTERN.test(id)) errors.id = 'Use letters, numbers, dot, underscore, colon, or hyphen.'
  else if (existingLayers.some(layer => layer.id === id && layer.id !== editingId)) {
    errors.id = 'Layer ID must be unique.'
  }

  const url = draft.url.trim()
  if (!url) errors.url = 'Dataset or asset URL is required.'
  else if (!url.startsWith('/') && !REMOTE_URL_PATTERN.test(url)) {
    errors.url = 'Use an absolute same-origin path or an HTTP(S) URL.'
  }

  errors.timeoutMs = validateNumberRange(draft.timeoutMs, 1_000, MAX_TIMEOUT_MS, 'Timeout')
  errors.maxBytes = validateNumberRange(draft.maxBytes, 1, MAX_BYTES, 'Maximum bytes')

  if (draft.kind === 'asset3d') {
    errors.lat = validateNumberRange(draft.lat, -90, 90, 'Latitude')
    errors.lng = validateNumberRange(draft.lng, -180, 180, 'Longitude')
    errors.altitudeMeters = validateNumberRange(
      draft.altitudeMeters,
      -MAX_HEIGHT_METERS,
      MAX_HEIGHT_METERS,
      'Altitude',
    )
    errors.scale = validateNumberRange(draft.scale, 0.000001, MAX_SCALE, 'Scale')
    if (parseFiniteNumber(draft.scale) === 0) errors.scale = 'Scale must be greater than zero.'
    if (parseFiniteNumber(draft.rotationDegrees) == null) {
      errors.rotationDegrees = 'Rotation must be a number.'
    }
  } else {
    if (!draft.heightProperty.trim()) errors.heightProperty = 'Height property is required.'
    errors.defaultHeightMeters = validateNumberRange(
      draft.defaultHeightMeters,
      0,
      MAX_HEIGHT_METERS,
      'Fallback height',
    )
    errors.baseHeightMeters = validateNumberRange(
      draft.baseHeightMeters,
      0,
      MAX_HEIGHT_METERS,
      'Base height',
    )
    if (!COLOR_PATTERN.test(draft.fillColor.trim())) {
      errors.fillColor = 'Fill color must use six-digit hex format.'
    }
    errors.fillOpacity = validateNumberRange(draft.fillOpacity, 0, 1, 'Fill opacity')
  }

  return Object.fromEntries(
    Object.entries(errors).filter(([, message]) => Boolean(message)),
  ) as EnhancedLayerDraftErrors
}

export function draftToEditorLayer(draft: EnhancedLayerDraft): EnhancedLayerEditorLayer {
  return {
    id: draft.id.trim(),
    kind: draft.kind,
    url: draft.url.trim(),
    visible: draft.visible,
    tags: parseTags(draft.tags),
    timeoutMs: Number(draft.timeoutMs),
    maxBytes: Math.floor(Number(draft.maxBytes)),
    heightProperty: draft.heightProperty.trim(),
    defaultHeightMeters: Number(draft.defaultHeightMeters),
    baseHeightMeters: Number(draft.baseHeightMeters),
    fillColor: draft.fillColor.trim().toLowerCase(),
    fillOpacity: Number(draft.fillOpacity),
    lat: Number(draft.lat),
    lng: Number(draft.lng),
    altitudeMeters: Number(draft.altitudeMeters),
    scale: Number(draft.scale),
    rotationDegrees: Number(draft.rotationDegrees),
  }
}

export function upsertEditorLayer(
  layers: readonly EnhancedLayerEditorLayer[],
  nextLayer: EnhancedLayerEditorLayer,
  editingId?: string,
): readonly EnhancedLayerEditorLayer[] {
  if (!editingId) return [...layers, nextLayer]
  return layers.map(layer => layer.id === editingId ? nextLayer : layer)
}

export function removeEditorLayer(
  layers: readonly EnhancedLayerEditorLayer[],
  id: string,
): readonly EnhancedLayerEditorLayer[] {
  return layers.filter(layer => layer.id !== id)
}

export function serializeEditorLayers(layers: readonly EnhancedLayerEditorLayer[]): readonly unknown[] {
  return layers.map(layer => {
    const common = {
      id: layer.id,
      url: layer.url,
      enabled: true,
      fetchBounds: {
        timeoutMs: layer.timeoutMs,
        maxBytes: layer.maxBytes,
      },
    }
    if (layer.kind === 'asset3d') {
      return {
        ...common,
        render: {
          kind: 'asset3d',
          id: layer.id,
          lat: layer.lat,
          lng: layer.lng,
          altitudeMeters: layer.altitudeMeters,
          scale: layer.scale,
          rotationDegrees: layer.rotationDegrees,
          tags: layer.tags,
          visible: layer.visible,
        },
      }
    }
    return {
      ...common,
      render: {
        kind: 'extrusion',
        id: layer.id,
        extrusionKind: layer.kind,
        heightProperty: layer.heightProperty,
        defaultHeightMeters: layer.defaultHeightMeters,
        baseHeightMeters: layer.baseHeightMeters,
        fillColor: layer.fillColor,
        fillOpacity: layer.fillOpacity,
        tags: layer.tags,
        visible: layer.visible,
      },
    }
  })
}
