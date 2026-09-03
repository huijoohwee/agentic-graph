import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

import {
  discoverDependencyBoundaryPaths,
  findForbiddenRapierPackageReferences,
  hasForbiddenRapierImplementationMarker,
} from '../lib/rapier-independence-boundary.mjs'

const repositoryRoot = path.resolve(import.meta.dirname, '..', '..')

test('Rapier independence boundary detects 2D, 3D, compatibility, alias, and lockfile references', () => {
  const source = JSON.stringify({
    dependencies: {
      planar: 'npm:@dimforge/rapier2d@1.0.0',
      planarCompatibility: '@dimforge/rapier2d-compat',
      spatial: '@dimforge/rapier3d',
    },
    packages: {
      'node_modules/@dimforge/rapier3d-compat': {},
    },
  })

  assert.deepEqual(findForbiddenRapierPackageReferences(source), [
    '@dimforge/rapier2d',
    '@dimforge/rapier2d-compat',
    '@dimforge/rapier3d',
    '@dimforge/rapier3d-compat',
  ])
})

test('Rapier independence boundary permits the neutral upstream project reference', () => {
  const source = 'Principles reference only: https://github.com/dimforge/rapier; no source copy or runtime dependency.'
  assert.deepEqual(findForbiddenRapierPackageReferences(source), [])
})

test('native physics source boundary rejects external compatibility naming', () => {
  assert.equal(hasForbiddenRapierImplementationMarker('class SpatialPhysicsEngine {}'), false)
  assert.equal(hasForbiddenRapierImplementationMarker('class Rapier3dCompatibilityAdapter {}'), true)
})

test('game source-authority gate discovers every workspace package manifest and lockfile', async () => {
  const source = fs.readFileSync(path.join(repositoryRoot, 'scripts/check-game-fps-readiness.mjs'), 'utf8')
  assert.match(source, /assertRapierIndependentDependencyBoundary\(root\)/)
  assert.match(source, /assertRapierIndependentPhysicsSourceBoundary\(root\)/)
  const paths = await discoverDependencyBoundaryPaths(repositoryRoot)
  for (const expectedPath of [
    'package.json',
    'package-lock.json',
    'canvas/package.json',
    'canvas/package-lock.json',
    'contracts/package.json',
    'ecs/package.json',
    'grph-shared/package.json',
    'gympgrph/package.json',
    'mcp/package.json',
    'scripts/package.json',
    'web/package.json',
    'web/package-lock.json',
  ]) assert.ok(paths.includes(expectedPath), `missing dependency boundary: ${expectedPath}`)
})

test('native physics check prepares linked packages before canvas runtime tests', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(repositoryRoot, 'package.json'), 'utf8'))
  const canvasManifest = JSON.parse(
    fs.readFileSync(path.join(repositoryRoot, 'canvas/package.json'), 'utf8'),
  )
  const nativePhysicsCommand = manifest.scripts?.['native-physics:check']

  assert.equal(typeof nativePhysicsCommand, 'string')
  assert.match(nativePhysicsCommand, /^npm run smoke:prepare && /)
  assert.equal(manifest.scripts?.['smoke:prepare'], 'npm -C canvas run prepare:linked-packages')
  assert.match(canvasManifest.scripts?.['prepare:linked-packages'] ?? '', /npm run build:grph-shared/)
  assert.match(canvasManifest.scripts?.['prepare:linked-packages'] ?? '', /npm run build:gympgrph/)
})

test('native physics document records the independent scope without compatibility claims', () => {
  const source = fs.readFileSync(
    path.join(repositoryRoot, 'docs/documents/agentic-graph-native-physics-engines-prd-tad.md'),
    'utf8',
  )
  assert.match(source, /source_copy: "forbidden"/)
  assert.match(source, /runtime_dependency: "forbidden"/)
  assert.match(source, /compatibility_claim: "forbidden"/)
  assert.match(source, /Box and circle colliders/)
  assert.match(source, /Cuboid and sphere colliders/)
  assert.match(source, /Joints, articulation constraints, joint limits, motors/)
  assert.match(source, /Automatic migration of Game Mode's bounded AABB\/hitscan geometry owner/)
  assert.match(source, /@dimforge\/rapier2d\*/)
  assert.match(source, /@dimforge\/rapier3d\*/)

  const apiSource = fs.readFileSync(
    path.join(repositoryRoot, 'docs/documents/agentic-graph-api-document.md'),
    'utf8',
  )
  assert.match(apiSource, /## Execution boundary and native physics internal API/)
  assert.match(apiSource, /planarPhysicsEngine\.ts.*spatialPhysicsEngine\.ts/)
  assert.match(apiSource, /not HTTP or MCP routes/)
  assert.match(apiSource, /claims no compatible API, format, or numerical behavior/)
})
