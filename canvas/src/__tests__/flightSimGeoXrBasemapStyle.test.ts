import assert from 'node:assert/strict'
import test from 'node:test'

import {
  GRABMAPS_DEFAULT_STYLE_URL,
  MAPLIBRE_CLASSIC_DEFAULT_STYLE_URL,
  MAPLIBRE_MODERN_DEFAULT_STYLE_URL,
  normalizePersistedGeospatialStyleUrl,
  resolveEffectiveGeospatialStyleUrl,
} from '../../../gympgrph/src/features/geospatial/basemapStyle.js'

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
