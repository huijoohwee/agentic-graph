import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'

const canvasRoot = path.basename(process.cwd()) === 'canvas'
  ? process.cwd()
  : path.resolve(process.cwd(), 'canvas')

function read(relativePath: string): string {
  return readFileSync(path.resolve(canvasRoot, relativePath), 'utf8')
}

test('mounted XR authoring reuses the canonical Three canvas and root ECS owner', () => {
  const mountedScene = read('src/features/xr-v2/XrV2MountedAuthoringScene.tsx')
  const canonicalStage = read('src/features/three/XrCanonicalPhysicsStage.tsx')
  const rootRuntime = read('src/features/agentic-ecs/xrAuthoringEcsRuntime.ts')
  const threeGraph = read('src/lib/three/ThreeGraph.impl.tsx')
  const smokePage = read('src/features/testing/XrV2RuntimeSmokePage.tsx')
  const smokeSurface = read('src/features/xr-v2/XrV2MountedAuthoringSmokeSurface.tsx')

  assert.doesNotMatch(mountedScene, /<Canvas(?:\s|>)/u)
  assert.doesNotMatch(mountedScene, /hydrateAgenticOsDocument/u)
  assert.match(rootRuntime, /hydrateAgenticOsDocument/u)
  assert.match(rootRuntime, /projectXrAuthoringRenderPlan/u)
  assert.match(canonicalStage, /<XrV2MountedAuthoringScene\s+paused=\{paused\}\s*\/>/u)
  assert.match(threeGraph, /graphHasXrAuthoringSource/u)
  assert.match(threeGraph, /native-controller/u)
  assert.match(smokePage, /<XrV2MountedAuthoringSmokeSurface\s*\/>/u)
  assert.equal((smokeSurface.match(/<Canvas(?:\s|>)/gu) || []).length, 1)
})

test('mounted XR authoring surfaces actual renderer resources and canonical timeline state', () => {
  const mountedScene = read('src/features/xr-v2/XrV2MountedAuthoringScene.tsx')

  for (const contract of [
    'bindMaterialGraphToTargetMesh',
    'BufferGeometry',
    'BufferAttribute',
    'DynamicDrawUsage',
    'PointsMaterial',
    '<bone',
    'readXrMotionReferenceRuntime',
    'createExactOnceBehaviorDispatcher',
    'disposeResourceOnce',
    'shouldRunXrV2RendererCompile',
    'particleUserData',
  ]) {
    assert.ok(mountedScene.includes(contract), `missing mounted renderer contract: ${contract}`)
  }
  assert.match(
    mountedScene,
    /if \(shouldRunXrV2RendererCompile\(rendererRef\.current\)\)[\s\S]*gl\.compile\(scene, camera\)/u,
  )
  assert.match(mountedScene, /userData=\{particleUserData\}/u)
  assert.match(mountedScene, /Object\.assign\(pointsRef\.current\.userData, particleUserData\)/u)
  assert.doesNotMatch(mountedScene, /<points\b(?:(?!\/>)[\s\S])*userData=\{\{/u)
})
