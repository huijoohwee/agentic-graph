import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import test from 'node:test'
import { assertGameFpsThreeOwnership } from '../lib/game-fps-three-ownership.mjs'

const root = new URL('../../', import.meta.url)
const featureDir = new URL('canvas/src/features/game-fps/', root)
const featureSources = await Promise.all((await readdir(featureDir))
  .filter(name => /\.(?:tsx?|mjs)$/.test(name)).map(async name => ({
    name, source: await readFile(new URL(name, featureDir), 'utf8'),
  })))
const renderer = {
  relPath: 'canvas/src/lib/three/ThreeGraph.impl.tsx',
  source: await readFile(new URL('canvas/src/lib/three/ThreeGraph.impl.tsx', root), 'utf8'),
}
const xrHost = {
  relPath: 'canvas/src/features/three/XrNativeControllerDemoStage.tsx',
  source: await readFile(new URL('canvas/src/features/three/XrNativeControllerDemoStage.tsx', root), 'utf8'),
}
const fixture = (edit = source => source) => {
  const features = featureSources.map(file => ({ ...file,
    source: file.name === 'GameFpsSharedNpcHighlights.tsx' ? edit(file.source) : file.source,
  }))
  return { featureSources: features, productionSources: [renderer, { ...xrHost },
    ...features.map(({ name, source }) => ({ relPath: `canvas/src/features/game-fps/${name}`, source })),
  ] }
}

test('shared NPC actor highlights retain one existing renderer without simulation ownership', () => {
  assert.doesNotThrow(() => assertGameFpsThreeOwnership(fixture()))
})

for (const tag of ['Canvas', 'ambientLight', 'boxGeometry', 'AlternateWorld']) {
  test(`actor highlight rejects additional ${tag} presentation even on a single source line`, () => {
    const candidate = fixture(source => `${source}\nconst extra = <${tag} />\n`)
    assert.throws(() => assertGameFpsThreeOwnership(candidate), /only the selected NPC capsule/)
  })
}

test('actor highlight rejects a second simulation clock', () => {
  assert.throws(() => assertGameFpsThreeOwnership(fixture(source => `${source}\nsetInterval(() => {}, 16)\n`)),
    /must not own a simulation clock/)
})

test('an additional game-aware Three owner outside the feature folder is rejected', () => {
  const candidate = fixture()
  candidate.productionSources.push({ relPath: 'canvas/src/AlternateScene.tsx',
    source: "import { useFrame } from '@react-three/fiber'; const active = readGameModeSnapshot().active" })
  assert.throws(() => assertGameFpsThreeOwnership(candidate), /shared renderer and actor presentation/)
})

test('an additional Three owner inside the feature folder is rejected', () => {
  const candidate = fixture()
  candidate.featureSources.push({ name: 'AlternateScene.tsx', source: "import { Mesh } from 'three'" })
  assert.throws(() => assertGameFpsThreeOwnership(candidate), /must remain actor-only/)
})

test('native XR host cannot acquire Game FPS state or simulation bindings', () => {
  const candidate = fixture()
  candidate.productionSources[1].source += "\nimport { advanceGameModeSimulationBy } from '@/features/game-fps/gameModeRuntime'\n"
  assert.throws(() => assertGameFpsThreeOwnership(candidate), /may import only the read-only NPC highlight/)
})

test('native XR host cannot mount a second highlight projection', () => {
  const candidate = fixture()
  candidate.productionSources[1].source += '\nconst duplicate = <GameFpsSharedNpcHighlights />\n'
  assert.throws(() => assertGameFpsThreeOwnership(candidate), /must mount one inactive NPC highlight/)
})
