import assert from 'node:assert/strict'
import test from 'node:test'
import fc from 'fast-check'
import type { FeatureCollection } from 'geojson'
import { normalizeEnhancedConfig, resolveFetchBound } from '../../gympgrph/src/enhancedLayerConfig.ts'
import { normalizeExtrusionFeatures, resolveExtrusionHeight } from '../../gympgrph/src/extrusionHeight.ts'
import { buildExtrusionPaint, ensureExtrusionLayer, isMapLibreStyleReady } from '../../gympgrph/src/maplibreLayers.ts'
import {
  clearEnhancedResourceCache,
  loadBoundedResource,
  resolveEnhancedFetchUrl,
} from '../../gympgrph/src/enhancedLayerLoad.ts'
import {
  applyGeoCommand,
  parseGeoCommandEnvelope,
  parseGeoInvocation,
} from '../../canvas/src/features/geospatial/geoInvocationDispatcher.ts'
import { normalizeGeoAuthoringInput, runGeoAuthoring } from '../../canvas/src/features/geospatial/geoAuthoringHarness.ts'
import {
  createAsset3DCustomLayer,
  parseAssetMesh,
} from '../../gympgrph/src/asset3dCustomLayer.ts'
import { computeAssetFrameMatrix } from '../../gympgrph/src/asset3dProjection.ts'
import { applyGeospatialFitRequest } from '../../gympgrph/src/geospatialFitRuntime.ts'
import type {
  ExtrusionLayerConfig,
  NormalizedEnhancedConfig,
} from '../../grph-shared/src/geospatial/enhancedLayerContract.ts'

const extrusionConfig: ExtrusionLayerConfig = {
  id: 'buildings:building',
  datasetId: 'buildings',
  url: '/fixtures/buildings.json',
  kind: 'building',
  heightProperty: 'height_m',
  defaultHeightMeters: 8,
  baseHeightMeters: 0,
  fillColor: '#9aa5b1',
  fillOpacity: 0.85,
  tags: ['#city'],
  visible: true,
  fetchBound: { timeoutMs: 2_000, maxBytes: 4_096 },
}

const normalizedConfig: NormalizedEnhancedConfig = {
  extrusions: [extrusionConfig],
  assets: [],
  diagnostics: [],
}

test('zero enhanced configuration is additive and empty', () => {
  assert.deepEqual(normalizeEnhancedConfig(undefined), {
    extrusions: [],
    assets: [],
    diagnostics: [],
  })
})

test('strict enhanced fetch bounds never invent a missing value', () => {
  assert.deepEqual(resolveFetchBound({ layer: { timeoutMs: 1_000 } }), { ok: false, missing: 'maxBytes' })
  assert.deepEqual(resolveFetchBound({ config: { maxBytes: 1_024 } }), { ok: false, missing: 'timeoutMs' })
})

test('configuration normalizes building, road, and asset entries without URLs in code', () => {
  const result = normalizeEnhancedConfig([
    {
      id: 'buildings',
      url: '/fixtures/buildings.json',
      render: { kind: 'extrusion', extrusionKind: 'building', heightProperty: 'height_m' },
      fetchBounds: { timeoutMs: 1_000, maxBytes: 2_048 },
    },
    {
      id: 'landmark',
      url: '/fixtures/landmark.mesh.json',
      render: { kind: 'asset3d', lat: 1.3, lng: 103.8 },
      fetchBounds: { timeoutMs: 1_000, maxBytes: 2_048 },
    },
  ])
  assert.equal(result.extrusions.length, 1)
  assert.equal(result.assets.length, 1)
  assert.equal(result.diagnostics.length, 0)
})

test('height normalization is total and preserves every generated feature', () => {
  fc.assert(fc.property(
    fc.array(fc.oneof(fc.double({ noNaN: true }), fc.string(), fc.constant(null)), { maxLength: 100 }),
    values => {
      const collection: FeatureCollection = {
        type: 'FeatureCollection',
        features: values.map((value, index) => ({
          type: 'Feature',
          id: index,
          geometry: {
            type: 'Polygon',
            coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]],
          },
          properties: { height_m: value, retained: index },
        })),
      }
      const result = normalizeExtrusionFeatures(collection, extrusionConfig)
      assert.equal(result.featureCollection.features.length, collection.features.length)
      result.featureCollection.features.forEach((feature, index) => {
        assert.equal(feature.properties?.retained, index)
        const height = Number(feature.properties?.kgExtrusionHeightM)
        assert.ok(Number.isFinite(height) && height >= 0 && height <= 10_000)
      })
    },
  ), { numRuns: 120 })
})

test('road and building extrusions share height normalization semantics', () => {
  fc.assert(fc.property(
    fc.oneof(fc.double({ noNaN: true }), fc.string(), fc.constant(null)),
    value => {
      const collection: FeatureCollection = {
        type: 'FeatureCollection',
        features: [{
          type: 'Feature',
          geometry: {
            type: 'Polygon',
            coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]],
          },
          properties: { height_m: value },
        }],
      }
      const building = normalizeExtrusionFeatures(collection, extrusionConfig)
      const road = normalizeExtrusionFeatures(collection, { ...extrusionConfig, kind: 'road' })
      assert.deepEqual(road.featureCollection, building.featureCollection)
      assert.deepEqual(road.diagnostics, building.diagnostics)
    },
  ), { numRuns: 120 })
})

test('valid heights resolve directly and invalid heights use the configured fallback', () => {
  fc.assert(fc.property(fc.double({ min: 0, max: 10_000, noNaN: true }), height => {
    assert.equal(resolveExtrusionHeight({ height_m: height }, extrusionConfig).heightMeters, height)
  }), { numRuns: 120 })
  for (const value of [null, 'not-a-number', -1, 10_001]) {
    assert.equal(resolveExtrusionHeight({ height_m: value }, extrusionConfig).heightMeters, 8)
  }
})

test('extrusion paint is native MapLibre fill-extrusion paint', () => {
  assert.deepEqual(buildExtrusionPaint(extrusionConfig), {
    'fill-extrusion-height': ['get', 'kgExtrusionHeightM'],
    'fill-extrusion-base': ['min', 0, ['get', 'kgExtrusionHeightM']],
    'fill-extrusion-color': '#9aa5b1',
    'fill-extrusion-opacity': 0.85,
  })
})

test('extrusion layer waits for a loaded style and uses the native layer type', () => {
  const sources = new Map<string, unknown>()
  const layers = new Map<string, Record<string, unknown>>()
  const map = {
    style: { _loaded: false },
    getStyle: () => ({}),
    isStyleLoaded: () => false,
    getSource: (id: string) => sources.get(id),
    addSource: (id: string, value: unknown) => sources.set(id, value),
    getLayer: (id: string) => layers.get(id),
    addLayer: (value: Record<string, unknown>) => layers.set(String(value.id), value),
    setLayoutProperty: () => undefined,
  }
  assert.equal(isMapLibreStyleReady(map), false)
  assert.equal(ensureExtrusionLayer(map, 'source', extrusionConfig), false)
  map.style._loaded = true
  assert.equal(ensureExtrusionLayer(map, 'source', extrusionConfig), true)
  assert.equal(layers.get(extrusionConfig.id)?.type, 'fill-extrusion')
})

test('source-authored asset meshes validate and empty asset sets allocate no context', () => {
  const valid = new TextEncoder().encode(JSON.stringify({
    schemaId: 'agentic-graph-geo-asset-mesh/v1',
    positions: [0, 0, 0, 1, 0, 0, 0, 1, 0],
    indices: [0, 1, 2],
    color: [0.6, 0.65, 0.7, 1],
  }))
  assert.ok(parseAssetMesh(valid))
  assert.equal(parseAssetMesh(new TextEncoder().encode('{}')), null)
  assert.equal(createAsset3DCustomLayer({ contextId: 'empty', assets: [], meshes: new Map() }), null)
})

test('asset frame matrices remain finite across valid geographic coordinates', () => {
  const identityMatrix = new Float64Array([
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    0, 0, 0, 1,
  ])
  const frame = {
    defaultProjectionData: { mainMatrix: identityMatrix },
  } as unknown as Parameters<typeof computeAssetFrameMatrix>[1]
  fc.assert(fc.property(
    fc.double({ min: -180, max: 180, noNaN: true }),
    fc.double({ min: -85.051129, max: 85.051129, noNaN: true }),
    fc.double({ min: -1_000, max: 100_000, noNaN: true }),
    (lng, lat, altitudeMeters) => {
      const matrix = computeAssetFrameMatrix({}, frame, {
        lng,
        lat,
        altitudeMeters,
        scale: 1,
        rotationDegrees: 0,
      })
      assert.ok(matrix)
      assert.ok([...matrix].every(Number.isFinite))
    },
  ), { numRuns: 120 })
  for (const lat of [-85.051129, 85.051129]) {
    assert.ok(computeAssetFrameMatrix({}, frame, {
      lng: 0,
      lat,
      altitudeMeters: 0,
      scale: 1,
      rotationDegrees: 0,
    }))
  }
  for (const lat of [-90, 90]) {
    assert.equal(computeAssetFrameMatrix({}, frame, {
      lng: 0,
      lat,
      altitudeMeters: 0,
      scale: 1,
      rotationDegrees: 0,
    }), null)
  }
})

test('same-origin enhanced paths remain same-origin and localhost remote URLs use the dev proxy', () => {
  const previousWindow = globalThis.window
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: { location: { origin: 'http://localhost:5173' } },
  })
  try {
    assert.equal(resolveEnhancedFetchUrl('/fixtures/a.json'), 'http://localhost:5173/fixtures/a.json')
    assert.match(String(resolveEnhancedFetchUrl('https://example.test/a.json')), /^\/__fetch_remote\?url=/)
  } finally {
    Object.defineProperty(globalThis, 'window', { configurable: true, value: previousWindow })
  }
})

test('bounded streaming aborts and discards an oversized payload', async () => {
  clearEnhancedResourceCache()
  const previousFetch = globalThis.fetch
  globalThis.fetch = async () => new Response(
    new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array(8))
        controller.enqueue(new Uint8Array(8))
        controller.close()
      },
    }),
  )
  try {
    const result = await loadBoundedResource({
      target: 'oversized',
      url: 'memory:oversized',
      bound: { timeoutMs: 1_000, maxBytes: 10 },
    })
    assert.equal(result.ok, false)
    if (!result.ok) assert.equal(result.failure.code, 'max-bytes-exceeded')
  } finally {
    globalThis.fetch = previousFetch
  }
})

test('invocation parser accepts all four surfaces and rejects unknown actions', () => {
  assert.deepEqual(parseGeoInvocation('/geo on'), { ok: true, command: { kind: 'mode.set', enabled: true } })
  assert.deepEqual(parseGeoInvocation('@node-1'), { ok: true, command: { kind: 'fit.node', nodeId: 'node-1' } })
  assert.deepEqual(parseGeoInvocation('#city hide'), { ok: true, command: { kind: 'tag.visibility', tag: '#city', visible: false } })
  assert.equal(parseGeoInvocation('/geo explode').ok, false)
  assert.equal(parseGeoCommandEnvelope({
    schemaId: 'agentic-graph-geospatial-command/v1',
    command: { kind: 'mode.set', enabled: true },
  })?.command.kind, 'mode.set')
})

test('rejected invocation performs zero bridge writes across generated target ids', async () => {
  await fc.assert(fc.asyncProperty(fc.string({ minLength: 1, maxLength: 40 }), async layerId => {
    let writes = 0
    const result = await applyGeoCommand(
      { kind: 'extrusion.visibility', layerId, visible: true },
      {
        config: normalizedConfig,
        resolveNodeBounds: () => null,
        bridge: {
          setMode: async () => { writes += 1; return true },
          setLayer: async () => { writes += 1; return true },
          setTag: async () => { writes += 1; return [] },
          fitBounds: async () => { writes += 1 },
        },
      },
    )
    if (layerId !== extrusionConfig.id) {
      assert.equal(result.ok, false)
      assert.equal(writes, 0)
    }
  }), { numRuns: 120 })
})

test('fit requests follow selection then graph then enhanced bounds', () => {
  const fitted: unknown[] = []
  const map = {
    fitBounds: (bounds: unknown) => fitted.push(bounds),
  }
  const selection = [1, 2, 3, 4] as const
  const graph = [5, 6, 7, 8] as const
  const enhanced = [9, 10, 11, 12] as const
  applyGeospatialFitRequest({
    map,
    request: { mode: 'selection' },
    selectedBounds: selection,
    graphBounds: graph,
    enhancedBounds: enhanced,
    padding: 12,
  })
  applyGeospatialFitRequest({
    map,
    request: { mode: 'selection' },
    selectedBounds: null,
    graphBounds: graph,
    enhancedBounds: enhanced,
    padding: 12,
  })
  applyGeospatialFitRequest({
    map,
    request: { mode: 'data' },
    selectedBounds: selection,
    graphBounds: null,
    enhancedBounds: enhanced,
    padding: 12,
  })
  assert.deepEqual(fitted, [selection, graph, enhanced])
})

test('geo harness validates before model calls and emits schema-valid bounded output', async () => {
  let calls = 0
  const invalid = await runGeoAuthoring({}, { callModel: async () => { calls += 1; return {} } })
  assert.equal(invalid.ok, false)
  assert.equal(calls, 0)
  const input = normalizeGeoAuthoringInput({
    intent: 'Extrude the selected buildings',
    datasetId: 'buildings',
    kind: 'building',
    maxIterations: 500,
    modelTimeoutMs: 1,
  })
  assert.equal(input.ok, true)
  if (input.ok) {
    assert.equal(input.input.maxIterations, 50)
    assert.equal(input.input.modelTimeoutMs, 1_000)
  }
})
