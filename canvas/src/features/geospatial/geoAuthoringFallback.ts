export type GeoAuthoringFallbackInput = {
  intent: string
  datasetId: string
  kind: 'building' | 'road' | 'asset'
}

const FALLBACK_FETCH_TIMEOUT_MS = 10_000
const FALLBACK_FETCH_MAX_BYTES = 25 * 1024 * 1024

const normalizeLayerId = (datasetId: string): string => {
  const normalized = datasetId
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return normalized || 'geo-layer'
}

const createExtrusionRender = (
  layerId: string,
  extrusionKind: 'building' | 'road',
): Record<string, unknown> => ({
  kind: 'extrusion',
  extrusionKind,
  id: `${layerId}:${extrusionKind}`,
  visible: false,
  heightProperty: 'height',
  defaultHeightMeters: extrusionKind === 'building' ? 8 : 0.2,
  baseHeightMeters: 0,
  fillColor: '#9aa5b1',
  fillOpacity: 0.85,
  tags: [],
})

const createAssetRender = (layerId: string): Record<string, unknown> => ({
  kind: 'asset3d',
  id: `${layerId}:asset`,
  visible: false,
  lat: 0,
  lng: 0,
  altitudeMeters: 0,
  scale: 1,
  rotationDegrees: 0,
  tags: [],
})

export const createDisabledGeoAuthoringFallbackDraft = (
  input: GeoAuthoringFallbackInput,
): Record<string, unknown> => {
  const layerId = normalizeLayerId(input.datasetId)
  return {
    id: layerId,
    enabled: false,
    source: {
      kind: 'url',
      url: '',
    },
    fetchBounds: {
      timeoutMs: FALLBACK_FETCH_TIMEOUT_MS,
      maxBytes: FALLBACK_FETCH_MAX_BYTES,
    },
    render: input.kind === 'asset'
      ? createAssetRender(layerId)
      : createExtrusionRender(layerId, input.kind),
    authoringFallback: {
      state: 'disabled',
      reason: 'model-unavailable',
      intent: input.intent,
    },
  }
}
