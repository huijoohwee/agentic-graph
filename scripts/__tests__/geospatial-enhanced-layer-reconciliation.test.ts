import assert from 'node:assert/strict'
import test from 'node:test'
import type {
  Asset3DConfig,
  ExtrusionLayerConfig,
  NormalizedEnhancedConfig,
} from '../../grph-shared/src/geospatial/enhancedLayerContract.ts'
import type { Asset3DLayerHandle } from '../../gympgrph/src/asset3dCustomLayer.ts'
import {
  applyEnhancedLayerVisibility,
  reconcileRemovedEnhancedLayerResources,
} from '../../gympgrph/src/enhancedLayerMapReconciliation.ts'
import { ensureExtrusionLayer } from '../../gympgrph/src/maplibreLayers.ts'

const extrusion = (overrides: Partial<ExtrusionLayerConfig> = {}): ExtrusionLayerConfig => ({
  id: 'buildings-layer',
  datasetId: 'buildings',
  url: '/fixtures/buildings.geojson',
  kind: 'building',
  heightProperty: 'height_m',
  defaultHeightMeters: 8,
  baseHeightMeters: 0,
  fillColor: '#9aa5b1',
  fillOpacity: 0.85,
  tags: ['#city'],
  visible: true,
  fetchBound: { timeoutMs: 2_000, maxBytes: 4_096 },
  ...overrides,
})

const asset = (overrides: Partial<Asset3DConfig> = {}): Asset3DConfig => ({
  id: 'landmark-asset',
  url: '/fixtures/landmark.mesh.json',
  lat: 1.3,
  lng: 103.8,
  altitudeMeters: 0,
  scale: 1,
  rotationDegrees: 0,
  tags: ['#landmark'],
  visible: true,
  fetchBound: { timeoutMs: 2_000, maxBytes: 4_096 },
  ...overrides,
})

const config = (
  extrusions: readonly ExtrusionLayerConfig[],
  assets: readonly Asset3DConfig[],
): NormalizedEnhancedConfig => ({ extrusions, assets, diagnostics: [] })

const assetHandle = (calls: {
  visibility: Array<[string, boolean]>
  removed: string[]
}): Asset3DLayerHandle => ({
  id: 'asset-layer',
  contextId: 'asset-context',
  setVisible: (id, visible) => calls.visibility.push([id, visible]),
  remove: id => calls.removed.push(id),
  dispose: () => undefined,
})

test('visibility-only reconciliation updates existing layers and never adds an asset layer', () => {
  const layoutWrites: Array<[string, string, string]> = []
  const calls = { visibility: [] as Array<[string, boolean]>, removed: [] as string[] }
  const map = {
    getLayer: (id: string) => id === 'buildings-layer' ? { id } : null,
    setLayoutProperty: (id: string, key: string, value: string) => {
      layoutWrites.push([id, key, value])
    },
    addLayer: () => {
      throw new Error('visibility reconciliation must not add a custom layer')
    },
  }

  const applied = applyEnhancedLayerVisibility({
    map,
    assetHandle: assetHandle(calls),
    config: config(
      [extrusion({ visible: false })],
      [asset({ visible: false })],
    ),
  })

  assert.deepEqual(applied, ['buildings-layer', 'landmark-asset'])
  assert.deepEqual(layoutWrites, [['buildings-layer', 'visibility', 'none']])
  assert.deepEqual(calls.visibility, [['landmark-asset', false]])
})

test('targeted visibility reconciliation changes only the requested asset', () => {
  const layoutWrites: Array<[string, string, string]> = []
  const calls = { visibility: [] as Array<[string, boolean]>, removed: [] as string[] }
  const map = {
    getLayer: () => ({ id: 'buildings-layer' }),
    setLayoutProperty: (id: string, key: string, value: string) => {
      layoutWrites.push([id, key, value])
    },
  }

  const applied = applyEnhancedLayerVisibility({
    map,
    assetHandle: assetHandle(calls),
    config: config([extrusion({ visible: false })], [asset({ visible: false })]),
    ids: ['landmark-asset'],
  })

  assert.deepEqual(applied, ['landmark-asset'])
  assert.deepEqual(layoutWrites, [])
  assert.deepEqual(calls.visibility, [['landmark-asset', false]])
})

test('catalog reconciliation removes stale extrusion layers, sources, assets, and ready ids', () => {
  const removedLayers: string[] = []
  const removedSources: string[] = []
  const calls = { visibility: [] as Array<[string, boolean]>, removed: [] as string[] }
  const renderedExtrusions = new Map([
    ['old-layer', { sourceId: 'kg-enhanced:old-layer' }],
    ['keep-layer', { sourceId: 'kg-enhanced:keep-layer' }],
  ])
  const loadedAssetIds = new Set(['old-asset', 'keep-asset'])
  const container = {
    dataset: { kgEnhancedLayerIds: 'old-layer,keep-layer' },
  } as unknown as HTMLElement
  const map = {
    getLayer: (id: string) => ({ id }),
    removeLayer: (id: string) => removedLayers.push(id),
    getSource: (id: string) => ({ id }),
    removeSource: (id: string) => removedSources.push(id),
  }

  const removed = reconcileRemovedEnhancedLayerResources({
    map,
    container,
    renderedExtrusions,
    configuredExtrusionIds: new Set(['keep-layer']),
    assetHandle: assetHandle(calls),
    loadedAssetIds,
    configuredAssetIds: new Set(['keep-asset']),
  })

  assert.deepEqual(removed, ['old-layer', 'old-asset'])
  assert.deepEqual(removedLayers, ['old-layer'])
  assert.deepEqual(removedSources, ['kg-enhanced:old-layer'])
  assert.deepEqual(calls.removed, ['old-asset'])
  assert.deepEqual([...renderedExtrusions.keys()], ['keep-layer'])
  assert.deepEqual([...loadedAssetIds], ['keep-asset'])
  assert.equal(container.dataset.kgEnhancedLayerIds, 'keep-layer')
})

test('existing extrusion layers receive every edited paint property before visibility', () => {
  const paintWrites: Array<[string, string, unknown]> = []
  const layoutWrites: Array<[string, string, string]> = []
  const map = {
    style: { _loaded: true },
    getSource: () => ({ type: 'geojson' }),
    addSource: () => undefined,
    getLayer: () => ({ id: 'buildings-layer' }),
    addLayer: () => undefined,
    setPaintProperty: (id: string, property: string, value: unknown) => {
      paintWrites.push([id, property, value])
    },
    setLayoutProperty: (id: string, property: string, value: string) => {
      layoutWrites.push([id, property, value])
    },
  }
  const edited = extrusion({
    baseHeightMeters: 3,
    fillColor: '#123456',
    fillOpacity: 0.4,
    visible: false,
  })

  assert.equal(ensureExtrusionLayer(map, 'kg-enhanced:buildings-layer', edited), true)
  assert.deepEqual(paintWrites, [
    ['buildings-layer', 'fill-extrusion-height', ['get', 'kgExtrusionHeightM']],
    ['buildings-layer', 'fill-extrusion-base', ['min', 3, ['get', 'kgExtrusionHeightM']]],
    ['buildings-layer', 'fill-extrusion-color', '#123456'],
    ['buildings-layer', 'fill-extrusion-opacity', 0.4],
  ])
  assert.deepEqual(layoutWrites, [['buildings-layer', 'visibility', 'none']])
})
