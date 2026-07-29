import type { FeatureCollection } from 'geojson'
import type { ExtrusionLayerConfig } from 'grph-shared/geospatial/enhancedLayerContract'
import type { GeospatialPointStyleConfig } from './features/geospatial/pointStyleConfig.js'

const EMPTY_FEATURE_COLLECTION: FeatureCollection = { type: 'FeatureCollection', features: [] }

const pointColorExpression = (fallbackColor: string, pointStyleConfig?: GeospatialPointStyleConfig) => [
  'match',
  ['get', 'kgCategory'],
  'airport',
  pointStyleConfig?.colors.airport || '#2563eb',
  'hotel',
  pointStyleConfig?.colors.hotel || '#7c3aed',
  'poi',
  pointStyleConfig?.colors.poi || '#ea580c',
  'route',
  pointStyleConfig?.colors.route || '#0f766e',
  pointStyleConfig?.colors.other || fallbackColor,
]
const pointRadiusByZoomExpression = (radiusMultiplier: number) => [
  'match',
  ['get', 'kgCategory'],
  'airport',
  8 * radiusMultiplier,
  'hotel',
  6.5 * radiusMultiplier,
  'poi',
  7.5 * radiusMultiplier,
  'route',
  5 * radiusMultiplier,
  6.5 * radiusMultiplier,
]

const hasStyleAttached = (map: any): boolean => {
  if (!map) return false
  try {
    if (map.style) return true
  } catch {
    void 0
  }
  try {
    if (typeof map.getStyle === 'function' && !!map.getStyle?.()) return true
  } catch {
    void 0
  }
  try {
    const hasLayerApi = typeof map.getLayer === 'function' && typeof map.addLayer === 'function'
    const hasSourceApi = typeof map.getSource === 'function' && typeof map.addSource === 'function'
    if (hasLayerApi && hasSourceApi && typeof map.isStyleLoaded === 'function' && map.isStyleLoaded() === true) return true
    if (hasLayerApi && hasSourceApi && typeof map.loaded === 'function' && map.loaded() === true) return true
  } catch {
    void 0
  }
  return false
}

const isStyleReady = (map: any): boolean => {
  if (!map) return false
  if (!hasStyleAttached(map)) return false
  try {
    if (map.style && typeof map.style._loaded === 'boolean') return map.style._loaded === true
  } catch {
    return false
  }
  try {
    if (typeof map.isStyleLoaded === 'function') return map.isStyleLoaded() === true
  } catch {
    return false
  }
  try {
    if (typeof map.loaded === 'function' && map.loaded() === true) return true
  } catch {
    void 0
  }
  try {
    const hasStyleObject = hasStyleAttached(map)
    const tilesLoaded = typeof map.areTilesLoaded === 'function' && map.areTilesLoaded() === true
    if (hasStyleObject && tilesLoaded) return true
  } catch {
    void 0
  }
  return false
}

export function isMapLibreStyleReady(map: any): boolean {
  return isStyleReady(map)
}

export function readGeoJsonSourceData(source: unknown): FeatureCollection | null {
  if (!source || typeof source !== 'object') return null
  try {
    const serialize = (source as {
      serialize?: () => { data?: unknown }
    }).serialize
    const data = typeof serialize === 'function'
      ? serialize.call(source)?.data
      : null
    if (
      data
      && typeof data === 'object'
      && (data as { type?: unknown }).type === 'FeatureCollection'
      && Array.isArray((data as { features?: unknown }).features)
    ) {
      return data as FeatureCollection
    }
  } catch {
    return null
  }
  return null
}

export function setGeoJsonSourceData(map: any, sourceId: string, fc: FeatureCollection): void {
  if (!map || !sourceId) return
  if (!isStyleReady(map)) return
  const src = map.getSource?.(sourceId)
  if (src && typeof src.setData === 'function') {
    src.setData(fc)
    return
  }
  if (!src && typeof map.addSource === 'function') {
    try {
      map.addSource(sourceId, { type: 'geojson', data: fc })
    } catch {
      void 0
    }
    return
  }
}

export function clearGeoJsonSourceData(map: any, sourceId: string): void {
  if (!map || !sourceId) return
  setGeoJsonSourceData(map, sourceId, EMPTY_FEATURE_COLLECTION)
}

export function ensureDatasetLayer(
  map: any,
  sourceId: string,
  color: string,
  options?: {
    cluster?: boolean
    pointStyleConfig?: GeospatialPointStyleConfig
  },
): void {
  if (!map || !sourceId) return
  if (!isStyleReady(map)) return
  const cluster = options?.cluster === true
  const radiusMultiplier = (() => {
    const n = Number(options?.pointStyleConfig?.radiusMultiplier)
    return Number.isFinite(n) ? Math.max(0.6, Math.min(2.4, n)) : 1
  })()

  if (!map.getSource?.(sourceId)) {
    try {
      map.addSource?.(sourceId, { type: 'geojson', data: { type: 'FeatureCollection', features: [] }, cluster })
    } catch {
      void 0
    }
  }

  const addLayerOnce = (layer: any) => {
    if (map.getLayer?.(layer.id)) return
    try {
      map.addLayer?.(layer)
    } catch {
      void 0
    }
  }

  if (cluster) {
    addLayerOnce({
      id: `${sourceId}:cluster-bubbles`,
      type: 'circle',
      source: sourceId,
      filter: ['has', 'point_count'],
      paint: {
        'circle-color': pointColorExpression(color, options?.pointStyleConfig),
        'circle-radius': ['step', ['get', 'point_count'], 14, 10, 18, 50, 24, 200, 30],
        'circle-opacity': 0.92,
        'circle-stroke-color': '#ffffff',
        'circle-stroke-width': 2,
      },
    })
    addLayerOnce({
      id: `${sourceId}:cluster-count`,
      type: 'symbol',
      source: sourceId,
      filter: ['has', 'point_count'],
      layout: {
        'text-field': '{point_count_abbreviated}',
        'text-font': ['Noto Sans Regular', 'Arial Unicode MS Regular'],
        'text-size': 12,
      },
      paint: { 'text-color': '#FFFFFF' },
    })
  }

  addLayerOnce({
    id: `${sourceId}:routes`,
    type: 'line',
    source: sourceId,
    filter: ['all', ['==', ['geometry-type'], 'LineString'], ['==', ['get', 'kgCategory'], 'route']],
    paint: {
      'line-color': options?.pointStyleConfig?.colors.route || color,
      'line-width': 2.5,
      'line-opacity': 0.88,
    },
  })

  addLayerOnce({
    id: `${sourceId}:points`,
    type: 'circle',
    source: sourceId,
    filter: cluster
      ? ['all', ['==', ['geometry-type'], 'Point'], ['!', ['has', 'point_count']]]
      : ['==', ['geometry-type'], 'Point'],
    paint: {
      'circle-color': pointColorExpression(color, options?.pointStyleConfig),
      'circle-radius': pointRadiusByZoomExpression(radiusMultiplier),
      'circle-opacity': 0.96,
      'circle-stroke-color': '#ffffff',
      'circle-stroke-width': 1.5,
      'circle-stroke-opacity': 0.95,
      'circle-blur': 0.05,
    },
  })
}

export function buildExtrusionPaint(config: ExtrusionLayerConfig): Record<string, unknown> {
  return {
    'fill-extrusion-height': ['get', 'kgExtrusionHeightM'],
    'fill-extrusion-base': ['min', config.baseHeightMeters, ['get', 'kgExtrusionHeightM']],
    'fill-extrusion-color': config.fillColor,
    'fill-extrusion-opacity': config.fillOpacity,
  }
}

export function applyExtrusionLayerPaint(
  map: any,
  layerId: string,
  config: ExtrusionLayerConfig,
): void {
  if (!map || !layerId || !map.getLayer?.(layerId)) return
  for (const [property, value] of Object.entries(buildExtrusionPaint(config))) {
    try {
      map.setPaintProperty?.(layerId, property, value)
    } catch {
      void 0
    }
  }
}

export function ensureExtrusionLayer(
  map: any,
  sourceId: string,
  config: ExtrusionLayerConfig,
): boolean {
  if (!map || !sourceId || !isStyleReady(map)) return false
  if (!map.getSource?.(sourceId)) {
    try {
      map.addSource?.(sourceId, { type: 'geojson', data: EMPTY_FEATURE_COLLECTION })
    } catch (error) {
      console.error(`[kg-geo] Could not create extrusion source ${sourceId}.`, error)
      return false
    }
  }
  if (!map.getLayer?.(config.id)) {
    try {
      map.addLayer?.({
        id: config.id,
        type: 'fill-extrusion',
        source: sourceId,
        filter: [
          'any',
          ['==', ['geometry-type'], 'Polygon'],
          ['==', ['geometry-type'], 'MultiPolygon'],
        ],
        layout: { visibility: config.visible ? 'visible' : 'none' },
        paint: buildExtrusionPaint(config),
      })
    } catch (error) {
      console.error(`[kg-geo] Could not create extrusion layer ${config.id}.`, error)
      return false
    }
  }
  applyExtrusionLayerPaint(map, config.id, config)
  setExtrusionLayerVisibility(map, config.id, config.visible)
  return !!map.getLayer?.(config.id)
}

export function setExtrusionLayerVisibility(map: any, layerId: string, visible: boolean): void {
  if (!map || !layerId || !map.getLayer?.(layerId)) return
  try {
    map.setLayoutProperty?.(layerId, 'visibility', visible ? 'visible' : 'none')
  } catch {
    void 0
  }
}

export function removeExtrusionLayer(map: any, layerId: string, sourceId: string): void {
  if (!map) return
  try {
    if (map.getLayer?.(layerId)) map.removeLayer?.(layerId)
  } catch {
    void 0
  }
  try {
    if (map.getSource?.(sourceId)) map.removeSource?.(sourceId)
  } catch {
    void 0
  }
}
