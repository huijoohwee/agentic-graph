import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { assertFlightSimBoundary } from '../lib/game-flight-sim-boundary.mjs'
import { assertFlightSimFeatureNetworkBoundary } from '../lib/game-flight-sim-network-readiness.mjs'
import { assertFlightSimSeedReadiness } from '../lib/game-flight-sim-seed-readiness.mjs'
import { parseYamlFrontmatter } from '../lib/source-readiness-assertions.mjs'

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
)

test('gameplay guard exposes no browser transport ownership', async () => {
  const relativePath =
    'canvas/src/features/game-flight-sim/flightSimExternalCallGuard.ts'
  const source = await readFile(path.join(repositoryRoot, relativePath), 'utf8')
  assert.doesNotThrow(() => assertFlightSimFeatureNetworkBoundary({
    relativePath,
    source,
  }))
  assert.throws(
    () => assertFlightSimFeatureNetworkBoundary({
      relativePath,
      source: `${source}\nglobalThis.fetch = async () => new Response()\n`,
    }),
    /must not own or replace browser transports/,
  )
  assert.throws(
    () => assertFlightSimFeatureNetworkBoundary({
      relativePath: 'canvas/src/features/game-flight-sim/escape.ts',
      source: 'new XMLHttpRequest()',
    }),
    /forbidden Flight Sim capability: XMLHttpRequest/,
  )
})

test('clean-room scanner reports a crafted external-project boundary violation', () => {
  assert.throws(
    () => assertFlightSimBoundary([{
      relativePath: 'canvas/src/features/game-flight-sim/copied-flight-model.ts',
      source: "export const remote = 'https://external.example/flight-runtime'",
    }]),
    error => {
      assert.match(error.message, /clean-room provenance boundary failed/)
      assert.match(error.message, /copied-flight-model\.ts/)
      assert.match(error.message, /https:\/\//)
      return true
    },
  )
})

test('clean-room scanner covers the canonical native MapLibre Flight camera owner', () => {
  assert.throws(
    () => assertFlightSimBoundary([{
      relativePath: 'gympgrph/src/flightGeoOverlayMapLibreCamera.ts',
      source: "export const remote = 'https://external.example/map-runtime'",
    }]),
    /flightGeoOverlayMapLibreCamera\.ts/,
  )
})

test('seed readiness rejects a missing course-director authority field', async () => {
  const flightSeedPath =
    'docs/workspace-seeds/agenticgraph-game-flight-sim-demo.md'
  const source = await readFile(
    path.join(repositoryRoot, flightSeedPath),
    'utf8',
  )
  const seed = structuredClone(parseYamlFrontmatter(source, flightSeedPath))
  delete seed.native_flight_demo.navigation_inset.route_guidance_owner

  await assert.rejects(
    assertFlightSimSeedReadiness({
      seed,
      flightSeedPath,
      physicsSeedPath:
        'docs/workspace-seeds/agenticgraph-physics-playground-demo.md',
      readText: relativePath => readFile(
        path.join(repositoryRoot, relativePath),
        'utf8',
      ),
    }),
    /exact source-authored course-director projection/,
  )
})
