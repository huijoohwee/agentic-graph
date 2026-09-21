import assert from 'node:assert/strict'
import { createContext, Script } from 'node:vm'
import * as ts from 'typescript'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { parseProceduralAssetRecipe, updateProceduralAssetControl } from '@/features/image-to-glb/proceduralAssetContract'
import { createProceduralAssetFromText } from '@/features/image-to-glb/proceduralAssetTextRecipe'
import { buildProceduralAsset, disposeProceduralAsset } from '@/features/image-to-glb/proceduralAssetBuilder'
import { ProceduralAssetSession } from '@/features/image-to-glb/proceduralAssetSession'
import { exportProceduralAsset } from '@/features/image-to-glb/proceduralAssetRuntimeExport'
import { withGlbExporterFileReader } from '@/tests/lib/glbExporterFileReaderHarness'
import { inspectImageToGlbScene } from '@/features/image-to-glb/imageToGlbSceneEvidence'

export function testProceduralAssetRejectsUnsafeAndMalformedRecipes() {
  const recipe = createProceduralAssetFromText('a blue robot', 23)
  assert.deepEqual(recipe, createProceduralAssetFromText('a blue robot', 23))
  assert.throws(() => createProceduralAssetFromText('an intricate cathedral'), /Local creation supports/)
  assert.throws(() => createProceduralAssetFromText('robot on table'), /one subject/)
  for (const alter of [
    (r: typeof recipe) => { r.parts[0].parentId = 'head' },
    (r: typeof recipe) => { r.parts[0].parentId = 'missing' },
    (r: typeof recipe) => { r.parts[0].size[0] = Infinity },
    (r: typeof recipe) => { r.parts[0].id = r.parts[1].id },
    (r: typeof recipe) => { r.clips[0].tracks[0].keys[1].time = 0 },
    (r: typeof recipe) => { r.clips[0].tracks[0].keys[2].time = 0.5000000001 },
    (r: typeof recipe) => { r.controls[0].target = 'color' },
    (r: typeof recipe) => { r.values.color = 'url(https://example.invalid)' },
    (r: typeof recipe) => { Object.assign(r, { source: 'globalThis.pwned=true' }) },
    (r: typeof recipe) => { Object.assign(r.parts[0], { mesh: [1, 2, 3] }) },
    (r: typeof recipe) => { Object.assign(r.parts[0], { primitive: ['box'] }) },
  ]) {
    const changed = structuredClone(recipe); alter(changed)
    assert.throws(() => parseProceduralAssetRecipe(changed))
  }
  assert.throws(() => parseProceduralAssetRecipe(' '.repeat(65_537)), /64 kB/)
  assert.throws(() => updateProceduralAssetControl(recipe, 'width', 500), /outside/)
  assert.equal(updateProceduralAssetControl(updateProceduralAssetControl(recipe, 'width', 2), 'width').values.width, 0.85)
}

export function testProceduralAssetControlsAndRecovery() {
  const session = new ProceduralAssetSession('workspace:one', createProceduralAssetFromText('green sphere'))
  const stale = session.begin()
  const reopened = ProceduralAssetSession.restore(session.serialize())
  const fresh = reopened.begin()
  assert.equal(fresh.generation, stale.generation)
  assert.equal(reopened.isCurrent(stale), false, 'a ticket cannot cross document sessions even at identical revisions')
  reopened.dispose()
  assert.equal(session.setControl('width', 2), true)
  assert.equal(session.apply(JSON.stringify(createProceduralAssetFromText('table')), stale), false)
  const first = session.current.scene.getObjectByName('Part-body') as THREE.Mesh
  first.geometry.computeBoundingBox()
  assert.equal(first.geometry.boundingBox!.getSize(new THREE.Vector3()).x, 2)
  assert.equal(session.setControl('detail', 'high'), true)
  assert.equal(session.setControl('color', '#112233'), true)
  assert.equal(session.setControl('visible', false), true)
  assert.equal((session.current.scene.getObjectByName('Part-body') as THREE.Mesh).visible, false)
  const invalid = '{broken recipe'
  assert.equal(session.apply(invalid), false)
  const restored = ProceduralAssetSession.restore(session.serialize())
  assert.equal(restored.snapshot.draft, invalid)
  assert.equal(restored.snapshot.lastValid.values.width, 2)
  assert.equal(restored.snapshot.lastValid.values.color, '#112233')
  assert.equal(restored.apply(' '.repeat(65_537)), false)
  assert.equal(restored.snapshot.draft, invalid)
  const cancelled = restored.begin(); restored.cancel()
  assert.equal(restored.apply(JSON.stringify(createProceduralAssetFromText('table')), cancelled), false)
  restored.dispose(); session.dispose()
  assert.throws(() => restored.begin(), /closed/)
}

export function testProceduralAssetGeneratedSourceReconstructsEditedScene() {
  const recipe = updateProceduralAssetControl(createProceduralAssetFromText('purple robot', 7), 'width', 1.25)
  const built = buildProceduralAsset(recipe)
  const repeated = buildProceduralAsset(recipe)
  const module = { exports: {} as { createScene?: () => THREE.Group } }
  const output = ts.transpileModule(built.source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } })
  const context = createContext({ module, exports: module.exports, require: (specifier: string) => {
    assert.equal(specifier, 'three'); return THREE
  } })
  // Only this freshly generated native source is evaluated, solely in this bounded test.
  new Script(`${output.outputText}\nmodule.exports.result = module.exports.createScene();`).runInContext(context, { timeout: 2000 })
  const scene = (module.exports as unknown as { result: THREE.Group }).result
  try {
    assert.equal(inspectImageToGlbScene(scene).projectionDigest, inspectImageToGlbScene(built.scene).projectionDigest)
    assert.equal(scene.animations[0].tracks.length, built.scene.animations[0].tracks.length)
    assert.equal(built.source, repeated.source)
  } finally { disposeProceduralAsset(scene); disposeProceduralAsset(built.scene); disposeProceduralAsset(repeated.scene) }
}

export async function testProceduralAssetGlbPreservesEditedHierarchyAndMotion() {
  await withGlbExporterFileReader(async () => {
    const recipe = updateProceduralAssetControl(createProceduralAssetFromText('blue robot'), 'width', 1.75)
    const pending = exportProceduralAsset({ recipe })
    recipe.values.width = 4 // Export must retain the snapshot taken before its first await.
    const artifacts = await pending
    assert.equal(JSON.parse(artifacts.recipe.text).values.width, 1.75)
    assert.equal(artifacts.evidence.kind, 'text-construction')
    assert.equal('referenceDigest' in artifacts.evidence, false)
    const imported = await new GLTFLoader().parseAsync(artifacts.glb.bytes, '')
    const original = buildProceduralAsset(artifacts.recipe.text)
    try {
      const expected = original.scene.getObjectByName('Part-body') as THREE.Mesh
      const actual = imported.scene.getObjectByName('Part-body') as THREE.Mesh
      assert.ok(actual)
      assert.ok(Math.abs(new THREE.Box3().setFromObject(actual).getSize(new THREE.Vector3()).x - 1.75) < 1e-6)
      assert.equal((actual.material as THREE.MeshStandardMaterial).color.getHexString(), (expected.material as THREE.MeshStandardMaterial).color.getHexString())
      assert.equal(imported.scene.getObjectByName('Pivot-head')!.parent!.name, 'Socket-body')
      assert.equal(imported.animations[0].duration, 2)
      const expectedMixer = new THREE.AnimationMixer(original.scene), actualMixer = new THREE.AnimationMixer(imported.scene)
      const expectedAction = expectedMixer.clipAction(original.scene.animations[0]), actualAction = actualMixer.clipAction(imported.animations[0])
      expectedAction.setLoop(THREE.LoopOnce, 1).play(); actualAction.setLoop(THREE.LoopOnce, 1).play()
      expectedAction.clampWhenFinished = true; actualAction.clampWhenFinished = true
      for (const time of [0, 0.5, 1, 1.5, 2]) {
        expectedMixer.setTime(time); actualMixer.setTime(time)
        const a = original.scene.getObjectByName('Pivot-arm-left')!.quaternion, b = imported.scene.getObjectByName('Pivot-arm-left')!.quaternion
        assert.ok(a.clone().normalize().angleTo(b.clone().normalize()) < 1e-4)
        if (time === 0.5) assert.ok(Math.abs(b.x) > 0.1, 'clip must actually move the part')
      }
      expectedMixer.stopAllAction(); actualMixer.stopAllAction()
      expectedMixer.uncacheRoot(original.scene); actualMixer.uncacheRoot(imported.scene)
    } finally { disposeProceduralAsset(original.scene); disposeProceduralAsset(imported.scene) }
    const abort = new AbortController()
    const cancelled = exportProceduralAsset({ recipe, signal: abort.signal }); abort.abort()
    await assert.rejects(cancelled, /cancelled/)
    let current = true
    const stale = exportProceduralAsset({ recipe, isCurrent: () => current }); current = false
    await assert.rejects(stale, /document changed/)
  })
}
