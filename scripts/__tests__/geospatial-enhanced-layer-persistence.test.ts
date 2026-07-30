import assert from 'node:assert/strict'
import test from 'node:test'
import { LS_KEYS } from '../../gympgrph/src/lib/config.ts'
import {
  clearEnhancedLayerConfigOverride,
  onEnhancedLayerPersistenceChanged,
  readEnhancedLayerEditorState,
  setEnhancedLayerVisibility,
  writeEnhancedLayerConfig,
  type EnhancedLayerPersistenceChange,
} from '../../gympgrph/src/enhancedLayerPersistence.ts'

class MemoryStorage {
  readonly values = new Map<string, string>()
  failNextSetForKey: string | null = null

  getItem(key: string): string | null {
    return this.values.get(key) ?? null
  }

  setItem(key: string, value: string): void {
    if (this.failNextSetForKey === key) {
      this.failNextSetForKey = null
      throw new Error(`injected storage failure for ${key}`)
    }
    this.values.set(key, String(value))
  }

  removeItem(key: string): void {
    this.values.delete(key)
  }
}

const extrusionEntry = (datasetId: string, layerId: string) => ({
  id: datasetId,
  url: `/fixtures/${datasetId}.geojson`,
  enabled: true,
  render: {
    kind: 'extrusion',
    id: layerId,
    extrusionKind: 'building',
    heightProperty: 'height_m',
    defaultHeightMeters: 8,
    baseHeightMeters: 0,
    fillColor: '#9aa5b1',
    fillOpacity: 0.85,
    tags: ['#city'],
  },
  fetchBounds: { timeoutMs: 2_000, maxBytes: 4_096 },
})

const assetEntry = (datasetId: string, assetId: string) => ({
  id: datasetId,
  url: `/fixtures/${datasetId}.mesh.json`,
  enabled: true,
  render: {
    kind: 'asset3d',
    id: assetId,
    lat: 1.3,
    lng: 103.8,
    altitudeMeters: 0,
    scale: 1,
    rotationDegrees: 0,
    tags: ['#landmark'],
  },
  fetchBounds: { timeoutMs: 2_000, maxBytes: 4_096 },
})

const withBrowserStorage = (run: (storage: MemoryStorage) => void): void => {
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window')
  const storage = new MemoryStorage()
  const browser = new EventTarget() as EventTarget & { localStorage: MemoryStorage }
  browser.localStorage = storage
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: browser,
  })
  try {
    run(storage)
  } finally {
    if (previousWindow) Object.defineProperty(globalThis, 'window', previousWindow)
    else Reflect.deleteProperty(globalThis, 'window')
  }
}

test('editor state exposes local source, raw catalog, and visibility-normalized runtime config', () => {
  withBrowserStorage(storage => {
    const raw = [extrusionEntry('buildings', 'buildings-layer')]
    storage.setItem(LS_KEYS.geospatialEnhancedLayers, JSON.stringify(raw))
    storage.setItem(
      LS_KEYS.geospatialEnhancedLayerVisibility,
      JSON.stringify({ 'buildings-layer': false }),
    )

    const state = readEnhancedLayerEditorState()
    assert.equal(state.source, 'local-storage')
    assert.deepEqual(state.raw, raw)
    assert.equal(state.invalidEnvironmentValue, undefined)
    assert.equal(state.normalized.extrusions.length, 1)
    assert.equal(state.normalized.extrusions[0]?.visible, false)
  })
})

test('catalog writes are atomic on validation, prune stale visibility, and publish old/new ids', () => {
  withBrowserStorage(storage => {
    const previousRaw = [extrusionEntry('old', 'old-layer')]
    storage.setItem(LS_KEYS.geospatialEnhancedLayers, JSON.stringify(previousRaw))
    storage.setItem(
      LS_KEYS.geospatialEnhancedLayerVisibility,
      JSON.stringify({ 'old-layer': false, orphan: false }),
    )
    const changes: EnhancedLayerPersistenceChange[] = []
    const unsubscribe = onEnhancedLayerPersistenceChanged(change => changes.push(change))
    try {
      const nextRaw = [assetEntry('new', 'new-asset')]
      assert.equal(writeEnhancedLayerConfig(nextRaw), true)
      assert.deepEqual(
        JSON.parse(storage.getItem(LS_KEYS.geospatialEnhancedLayers) || 'null'),
        nextRaw,
      )
      assert.equal(storage.getItem(LS_KEYS.geospatialEnhancedLayerVisibility), null)
      assert.deepEqual(changes, [{
        kind: 'catalog',
        ids: ['old-layer', 'new-asset'],
      }])
    } finally {
      unsubscribe()
    }
  })
})

test('every normalization diagnostic and every malformed entry rejects without mutation', () => {
  withBrowserStorage(storage => {
    const previousRaw = [extrusionEntry('stable', 'stable-layer')]
    const previousText = JSON.stringify(previousRaw)
    storage.setItem(LS_KEYS.geospatialEnhancedLayers, previousText)
    const changes: EnhancedLayerPersistenceChange[] = []
    const unsubscribe = onEnhancedLayerPersistenceChanged(change => changes.push(change))
    try {
      const invalidPaint = [{
        ...extrusionEntry('invalid', 'invalid-layer'),
        render: {
          ...extrusionEntry('invalid', 'invalid-layer').render,
          fillColor: 'not-a-color',
        },
      }]
      assert.equal(writeEnhancedLayerConfig(invalidPaint), false)
      assert.equal(writeEnhancedLayerConfig([{ id: 'missing-render' }]), false)
      assert.equal(writeEnhancedLayerConfig({ id: 'not-an-array' }), false)
      assert.equal(writeEnhancedLayerConfig([
        extrusionEntry('duplicate-a', 'duplicate-target'),
        assetEntry('duplicate-b', 'duplicate-target'),
      ]), false)
      assert.equal(storage.getItem(LS_KEYS.geospatialEnhancedLayers), previousText)
      assert.deepEqual(changes, [])
    } finally {
      unsubscribe()
    }
  })
})

test('a secondary storage failure rolls back both catalog and visibility keys', () => {
  withBrowserStorage(storage => {
    const previousRaw = [extrusionEntry('stable', 'stable-layer')]
    const previousVisibility = { 'stable-layer': false }
    storage.setItem(LS_KEYS.geospatialEnhancedLayers, JSON.stringify(previousRaw))
    storage.setItem(
      LS_KEYS.geospatialEnhancedLayerVisibility,
      JSON.stringify(previousVisibility),
    )
    storage.failNextSetForKey = LS_KEYS.geospatialEnhancedLayerVisibility

    const editedRaw = [{
      ...extrusionEntry('stable', 'stable-layer'),
      render: {
        ...extrusionEntry('stable', 'stable-layer').render,
        fillColor: '#123456',
      },
    }]
    assert.equal(writeEnhancedLayerConfig(editedRaw), false)
    assert.deepEqual(
      JSON.parse(storage.getItem(LS_KEYS.geospatialEnhancedLayers) || 'null'),
      previousRaw,
    )
    assert.deepEqual(
      JSON.parse(storage.getItem(LS_KEYS.geospatialEnhancedLayerVisibility) || 'null'),
      previousVisibility,
    )
  })
})

test('clear override removes catalog and visibility keys, then publishes the re-resolved catalog', () => {
  withBrowserStorage(storage => {
    storage.setItem(
      LS_KEYS.geospatialEnhancedLayers,
      JSON.stringify([assetEntry('local', 'local-asset')]),
    )
    storage.setItem(
      LS_KEYS.geospatialEnhancedLayerVisibility,
      JSON.stringify({ 'local-asset': false }),
    )
    const changes: EnhancedLayerPersistenceChange[] = []
    const unsubscribe = onEnhancedLayerPersistenceChanged(change => changes.push(change))
    try {
      assert.equal(clearEnhancedLayerConfigOverride(), true)
      assert.equal(storage.getItem(LS_KEYS.geospatialEnhancedLayers), null)
      assert.equal(storage.getItem(LS_KEYS.geospatialEnhancedLayerVisibility), null)
      const state = readEnhancedLayerEditorState()
      assert.equal(state.source, 'default')
      assert.deepEqual(state.raw, [])
      assert.deepEqual(changes, [{
        kind: 'catalog',
        ids: ['local-asset'],
      }])
    } finally {
      unsubscribe()
    }
  })
})

test('visibility writes publish a visibility-only change for the exact configured target', () => {
  withBrowserStorage(storage => {
    storage.setItem(
      LS_KEYS.geospatialEnhancedLayers,
      JSON.stringify([
        extrusionEntry('buildings', 'buildings-layer'),
        assetEntry('landmark', 'landmark-asset'),
      ]),
    )
    const changes: EnhancedLayerPersistenceChange[] = []
    const unsubscribe = onEnhancedLayerPersistenceChanged(change => changes.push(change))
    try {
      assert.equal(setEnhancedLayerVisibility('asset', 'landmark-asset', false), true)
      assert.equal(setEnhancedLayerVisibility('asset', 'unknown', false), false)
      assert.deepEqual(
        JSON.parse(storage.getItem(LS_KEYS.geospatialEnhancedLayerVisibility) || 'null'),
        { 'landmark-asset': false },
      )
      assert.deepEqual(changes, [{
        kind: 'visibility',
        ids: ['landmark-asset'],
      }])
    } finally {
      unsubscribe()
    }
  })
})
