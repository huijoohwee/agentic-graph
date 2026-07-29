import assert from 'node:assert/strict'
import test from 'node:test'
import {
  ENHANCED_LAYER_ENV_KEY,
  resolveEnhancedLayerConfigSource,
} from '../../gympgrph/src/enhancedLayerConfigSource.ts'

test('local enhanced-layer configuration overrides the environment catalog', () => {
  const result = resolveEnhancedLayerConfigSource(
    '[{"id":"local"}]',
    '[{"id":"environment"}]',
  )
  assert.equal(result.source, 'local-storage')
  assert.deepEqual(result.raw, [{ id: 'local' }])
})

test('environment catalog initializes a clean browser profile', () => {
  const result = resolveEnhancedLayerConfigSource(
    null,
    '[{"id":"environment"}]',
  )
  assert.equal(result.source, 'environment')
  assert.deepEqual(result.raw, [{ id: 'environment' }])
  assert.equal(result.invalidEnvironmentValue, undefined)
})

test('invalid environment catalog fails closed with a diagnostic source', () => {
  const result = resolveEnhancedLayerConfigSource(null, 'not-json')
  assert.equal(result.source, 'environment')
  assert.deepEqual(result.raw, [])
  assert.equal(result.invalidEnvironmentValue, 'not-json')
  assert.equal(ENHANCED_LAYER_ENV_KEY, 'VITE_GEOSPATIAL_DATASETS_JSON')
})
