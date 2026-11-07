import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import { buildTwinPresentation } from '../semanticTwinPresentation'
import { buildTwinScene, disposeTwinScene } from '../semanticTwinScene'
import { createProceduralAssetFromText } from '@/features/image-to-glb/proceduralAssetTextRecipe'
import { updateProceduralAssetControl } from '@/features/image-to-glb/proceduralAssetContract'
import type { TwinBinding } from '../semanticTwinRuntime'
import { createThreeFrameResolutionBudget, resolveThreeSceneFrameLoop } from '@/lib/three/threeRendererLifecycle'

const binding = (id: string, position: TwinBinding['position'], size: TwinBinding['size'], visible = true): TwinBinding => {
  const recipe = updateProceduralAssetControl(createProceduralAssetFromText('building', 1), 'visible', visible)
  return { entityId: id, observationId: 'observation:1', evidenceSha256: 'a'.repeat(64),
    template: 'building', recipe, position, size, provenance: 'authored-approximation' }
}
const objects = [binding('entity:left', [-6, 1, -3], [1, 4, 2]), binding('entity:right', [4, 0, 2], [3, 2, 1], false)]

test('slow selection work cannot degrade demand-rendered saved objects; continuous scenes retain adaptation', () => {
  const view = { paused: false, immersiveMedia: false, gameplay: false, savedObjectView: true }
  assert.equal(resolveThreeSceneFrameLoop(view), 'demand')
  const budget = createThreeFrameResolutionBudget()
  for (let frame = 0; frame < 100; frame++) {
    assert.equal(budget.sample(0.1, 2, 2, resolveThreeSceneFrameLoop(view) === 'always'), null)
  }
  for (const dynamic of [{ ...view, gameplay: true }, { ...view, immersiveMedia: true }, { ...view, savedObjectView: false }]) {
    assert.equal(resolveThreeSceneFrameLoop(dynamic), 'always')
    const adaptive = createThreeFrameResolutionBudget(); let adjusted = false
    for (let frame = 0; frame < 100; frame++) adjusted ||= adaptive.sample(0.1, 2, 2, true) !== null
    assert.equal(adjusted, true)
  }
  assert.equal(resolveThreeSceneFrameLoop({ ...view, paused: true, gameplay: true }), 'demand')
  assert.equal(resolveThreeSceneFrameLoop({ ...view, paused: true, immersiveMedia: true }), 'always')
})

test('shadow fit covers translated objects and the receiving floor after display and AR transforms', () => {
  for (const scale of [0.02, 1, 20]) {
    const presentation = buildTwinPresentation(objects, false)!
    const scene = new THREE.Scene(), parent = new THREE.Group()
    scene.add(parent); parent.add(presentation.root)
    parent.scale.setScalar(scale); parent.rotation.set(0.2, -0.7, 0.1); parent.position.set(30, -4, 17)
    presentation.update(); presentation.key.shadow.updateMatrices(presentation.key)
    const camera = presentation.key.shadow.camera
    for (const item of objects) for (const x of [-0.5, 0.5]) for (const y of [0, 1]) for (const z of [-0.5, 0.5]) {
      const corner = new THREE.Vector3(item.position[0] + item.size[0] * x, item.position[1] + item.size[1] * y,
        item.position[2] + item.size[2] * z).applyMatrix4(parent.matrixWorld).project(camera)
      assert.ok(corner.toArray().every(value => Number.isFinite(value) && Math.abs(value) <= 1), `${scale}: ${corner.toArray()}`)
    }
    assert.ok(camera.near > 0 && camera.far > camera.near)
    assert.equal(presentation.key.shadow.mapSize.x * presentation.key.shadow.mapSize.y, 1024 ** 2)
    assert.equal(presentation.root.children.filter(item => item instanceof THREE.Light && item.castShadow).length, 1)
    presentation.dispose()
  }
})

test('floor and grid do not intercept selection; cleanup releases presentation resources once', () => {
  assert.equal(buildTwinPresentation([], false), null)
  const before = JSON.stringify(objects), presentation = buildTwinPresentation(objects, true)!
  const ray = new THREE.Raycaster(new THREE.Vector3(0, 10, 0), new THREE.Vector3(0, -1, 0))
  assert.deepEqual(ray.intersectObject(presentation.root, true), [])
  assert.equal(presentation.floor.receiveShadow, true)
  const elevated = buildTwinPresentation([binding('entity:elevated', [3, 2, -4], [1, 1, 1])], false)!
  assert.ok(Math.abs(new THREE.Box3().setFromObject(elevated.floor).max.y) < 1e-6)
  elevated.dispose()
  let released = 0
  const resources = [presentation.floor.geometry, presentation.floor.material, presentation.grid.geometry,
    ...(Array.isArray(presentation.grid.material) ? presentation.grid.material : [presentation.grid.material])]
  resources.forEach(resource => resource.addEventListener('dispose', () => released++))
  presentation.dispose(); presentation.dispose()
  assert.equal(released, resources.length); assert.equal(presentation.root.children.length, 0)
  assert.equal(JSON.stringify(objects), before)
})

test('batched solid models cast and receive shadows while retaining independent selection and hidden state', () => {
  const before = JSON.stringify(objects), built = buildTwinScene(objects)
  try {
    assert.equal(built.error, null); assert.equal(built.objects.length, 2)
    for (const item of built.objects) {
      assert.equal(item.wrapper.name, `SemanticTwin-${item.binding.entityId}`)
      assert.equal(item.source.visible, item.binding.recipe.values.visible)
      const meshes: THREE.Mesh[] = []
      item.source.traverse(object => { if (object instanceof THREE.Mesh) meshes.push(object) })
      assert.equal(meshes.length, 1)
      assert.ok(meshes.every(mesh => mesh.castShadow && mesh.receiveShadow))
    }
    assert.equal(JSON.stringify(objects), before)
  } finally { disposeTwinScene(built) }
})
