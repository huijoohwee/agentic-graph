import assert from 'node:assert/strict'
import test from 'node:test'
import {
  assertFlightSimBoundary,
  findFlightSimBoundaryViolations,
} from '../lib/game-flight-sim-boundary.mjs'

const completePolicy = [
  'External references inform conceptual principles only.',
  'Maintainers attest that every implementation and asset is source-authored.',
  'External project identity and URL are forbidden in product source and runtime metadata.',
  'There is no external project dependency.',
  'The deterministic scanner cannot prove the absence of arbitrary derived code.',
].join(' ')

test('accepts tracked content outside the Flight-owned boundary', () => {
  assert.deepEqual(findFlightSimBoundaryViolations([
    { relativePath: 'canvas/src/local.ts', source: 'export const local = true' },
  ]), [])
})

test('accepts canonical policy only while the generic clean-room markers remain', () => {
  assert.doesNotThrow(() => assertFlightSimBoundary([{
    relativePath: 'docs/documents/knowgrph-game-flight-sim-prd-tad.md',
    source: completePolicy,
  }]))
  assert.equal(findFlightSimBoundaryViolations([{
    relativePath: 'docs/documents/knowgrph-game-flight-sim-prd-tad.md',
    source: 'conceptual principles only',
  }]).length, 1)
})

test('rejects external repository locators from Flight-owned source', () => {
  const violations = findFlightSimBoundaryViolations([{
    relativePath: 'canvas/src/features/game-flight-sim/copied-flight-model.ts',
    source: "export const remote = 'https://external.example/flight-runtime'",
  }])
  assert.equal(violations.length, 1)
  assert.match(violations[0].reason, /external repository locator/)
})

test('rejects external repository locators from the native MapLibre Flight owner', () => {
  const violations = findFlightSimBoundaryViolations([{
    relativePath: 'gympgrph/src/flightGeoOverlayMapLibre.ts',
    source: "export const remote = 'https://external.example/map-runtime'",
  }])
  assert.equal(violations.length, 1)
  assert.match(violations[0].reason, /external repository locator/)
})

test('rejects external repository locators from split Flight camera and environment owners', () => {
  const violations = findFlightSimBoundaryViolations([
    {
      relativePath: 'gympgrph/src/flightGeoOverlayMapLibreCamera.ts',
      source: "export const remote = 'https://external.example/camera-runtime'",
    },
    {
      relativePath: 'gympgrph/src/flightGeoEnvironmentMapLibre.ts',
      source: "export const remote = 'https://external.example/environment-runtime'",
    },
  ])
  assert.equal(violations.length, 2)
  assert.ok(violations.every(violation => (
    violation.reason.includes('external repository locator')
  )))
})

test('rejects external repository locators from canonical policy', () => {
  assert.throws(() => assertFlightSimBoundary([{
    relativePath: '.kiro/specs/knowgrph-game-flight-sim/requirements.md',
    source: `${completePolicy} https://external.example/flight-runtime`,
  }]), /external repository locator/)
})

test('rejects vendored paths under the Flight-owned feature', () => {
  const violations = findFlightSimBoundaryViolations([{
    relativePath: 'canvas/src/features/game-flight-sim/vendor/reference/model.ts',
    source: 'export const model = true',
  }])
  assert.equal(violations.length, 1)
  assert.match(violations[0].reason, /vendored/)
})

test('rejects opaque binary content under Flight-owned source paths', () => {
  assert.throws(() => assertFlightSimBoundary([{
    relativePath: 'canvas/src/features/game-flight-sim/model.bin',
    bytes: Buffer.from([0, 1, 2, 3]),
  }]), /opaque binary/)
})

test('permits only the separately hash-and-license-gated optional opaque asset path', () => {
  assert.doesNotThrow(() => assertFlightSimBoundary([{
    relativePath: 'canvas/src/features/game-flight-sim/assetSpec/fallbacks/optional-beacon.glb',
    bytes: Buffer.from([0, 1, 2, 3]),
  }]))
})
