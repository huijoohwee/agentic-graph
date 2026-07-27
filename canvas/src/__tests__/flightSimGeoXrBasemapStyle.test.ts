import assert from 'node:assert/strict'
import test from 'node:test'

import {
  GRABMAPS_DEFAULT_STYLE_URL,
  FLIGHT_GEO_BOOTSTRAP_STYLE,
  MAPLIBRE_CLASSIC_DEFAULT_STYLE_URL,
  MAPLIBRE_GLOBE_DEFAULT_STYLE_URL,
  MAPLIBRE_MODERN_DEFAULT_STYLE_URL,
  normalizePersistedGeospatialStyleUrl,
  resolveCanonicalPersistedGeospatialStyleUrl,
  resolveEffectiveGeospatialStyleUrl,
} from '../../../gympgrph/src/features/geospatial/basemapStyle.js'
import { createDefaultGympgrphGeospatialState } from '../../../gympgrph/src/hooks/store/geospatialSlice.js'

test('Geo+XR selects the current MapLibre view default unless GrabMaps is explicit', () => {
  assert.equal(normalizePersistedGeospatialStyleUrl(null), '')
  assert.equal(normalizePersistedGeospatialStyleUrl(''), '')
  assert.equal(normalizePersistedGeospatialStyleUrl('kg:style:legacy-default'), '')

  assert.equal(
    resolveEffectiveGeospatialStyleUrl('2d', null),
    MAPLIBRE_CLASSIC_DEFAULT_STYLE_URL,
  )
  assert.equal(
    resolveEffectiveGeospatialStyleUrl('2d-modern', null),
    MAPLIBRE_MODERN_DEFAULT_STYLE_URL,
  )
  assert.equal(
    resolveEffectiveGeospatialStyleUrl('3d-modern', null),
    MAPLIBRE_MODERN_DEFAULT_STYLE_URL,
  )
  assert.equal(
    resolveEffectiveGeospatialStyleUrl(
      '2d-modern',
      GRABMAPS_DEFAULT_STYLE_URL,
    ),
    GRABMAPS_DEFAULT_STYLE_URL,
  )
})

test('Geo state persists one explicit built-in default without replacing explicit providers', () => {
  const values = new Map<string, string>()
  const originalWindow = globalThis.window
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      localStorage: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
      },
    },
  })
  try {
    const defaults = createDefaultGympgrphGeospatialState()
    assert.equal(defaults.geospatialViewMode, '2d-modern')
    assert.equal(
      values.get('kg:ui:geospatial:styleUrl'),
      MAPLIBRE_MODERN_DEFAULT_STYLE_URL,
    )

    values.set('kg:ui:geospatial:viewMode', '3d')
    values.set('kg:ui:geospatial:styleUrl', 'kg:style:legacy-default')
    createDefaultGympgrphGeospatialState()
    assert.equal(
      values.get('kg:ui:geospatial:styleUrl'),
      MAPLIBRE_GLOBE_DEFAULT_STYLE_URL,
    )

    const explicitProvider = 'https://example.test/custom-style.json'
    values.set('kg:ui:geospatial:styleUrl', explicitProvider)
    createDefaultGympgrphGeospatialState()
    assert.equal(
      values.get('kg:ui:geospatial:styleUrl'),
      explicitProvider,
    )
  } finally {
    if (originalWindow === undefined) {
      Reflect.deleteProperty(globalThis, 'window')
    } else {
      Object.defineProperty(globalThis, 'window', {
        configurable: true,
        value: originalWindow,
      })
    }
  }
})

test('canonical Geo style defaults stay view-specific and preserve GrabMaps', () => {
  assert.equal(
    resolveCanonicalPersistedGeospatialStyleUrl('2d-modern', ''),
    MAPLIBRE_MODERN_DEFAULT_STYLE_URL,
  )
  assert.equal(
    resolveCanonicalPersistedGeospatialStyleUrl(
      '2d-modern',
      GRABMAPS_DEFAULT_STYLE_URL,
    ),
    GRABMAPS_DEFAULT_STYLE_URL,
  )
})

test('Flight Geo+XR boots from an authored local style before provider handoff', () => {
  assert.equal(FLIGHT_GEO_BOOTSTRAP_STYLE.version, 8)
  assert.deepEqual(FLIGHT_GEO_BOOTSTRAP_STYLE.sources, {})
  assert.equal(
    JSON.stringify(FLIGHT_GEO_BOOTSTRAP_STYLE).includes('http'),
    false,
  )
})
