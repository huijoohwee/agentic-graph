import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import { mapTwinContourFace, mapTwinImageFace, planTwinImageCrop, TWIN_TEXTURE_PIXELS, applyTwinImageAppearance } from '../semanticTwinImageAppearance'
import { buildTwinScene, disposeTwinScene } from '../semanticTwinScene'
import { buildSemanticTwinBinding, emptySemanticTwin } from '../semanticTwinRuntime'
import { newSpaceDocument, type SpaceEntity, type SpaceObservation } from '../semanticSpaceRuntime'

test('photo crop preserves source aspect, fits edited faces and bounds aggregate texture pixels', () => {
  const region = { x: 0.2, y: 0.1, width: 0.6, height: 0.3 }
  for (const count of [1, 2, 12, 20]) for (const size of [[5, 1], [1, 5], [2, 2]]) {
    const plan = planTwinImageCrop(region, { width: 1000, height: 500 }, size, count)
    assert.deepEqual(plan.source, { x: 200, y: 50, width: 600, height: 150 })
    assert.equal(plan.destination.width / plan.destination.height, 4)
    assert.ok(plan.destination.x >= 0 && plan.destination.y >= 0)
    assert.ok(plan.destination.x + plan.destination.width <= plan.width + 1e-6)
    assert.ok(plan.destination.y + plan.destination.height <= plan.height + 1e-6)
    assert.ok(plan.width * plan.atlasHeight * count <= TWIN_TEXTURE_PIXELS)
  }
  assert.throws(() => planTwinImageCrop({ ...region, x: 0.9 }, { width: 100, height: 100 }, [1, 1], 1))
  assert.throws(() => planTwinImageCrop(region, { width: 100, height: 100 }, [NaN, 1], 1))
  assert.throws(() => planTwinImageCrop(region, { width: 100, height: 100 }, [1, 1], 21))
})

test('only the front face maps the photograph, upright; unseen faces use colour samples', () => {
  const geometry = new THREE.BoxGeometry(1, 1, 1), before = geometry.getAttribute('uv').clone()
  mapTwinImageFace(geometry, 100, 108)
  const uv = geometry.getAttribute('uv')
  for (let i = 0; i < uv.count; i++) {
    if (i >= 16 && i < 20) {
      assert.equal(uv.getX(i), before.getX(i))
      assert.ok(Math.abs(uv.getY(i) - (8 + before.getY(i) * 100) / 108) < 1e-6)
    } else assert.ok(Math.abs(uv.getY(i) - 4 / 108) < 1e-6)
  }
  assert.equal(geometry.index!.count / 3, 12)
  geometry.dispose()
})

test('shared scene uses authored dimensions, retains manual materials, and releases owned textures', async () => {
  const observation: SpaceObservation = { id: 'observation:test', capturedAtMs: 1, width: 1, height: 1,
    imageDataUrl: 'data:image/png;base64,AA==', sha256: 'a'.repeat(64), orientation: 'source-pixels', scale: 'unknown' }
  const entity: SpaceEntity = { id: 'entity:test', observationId: observation.id, category: 'object', label: 'Test',
    region: { x: 0, y: 0, width: 1, height: 1 }, confirmedAtMs: 1, provenance: 'user-confirmed' }
  const binding = buildSemanticTwinBinding({ entity, observation, template: 'box',
    room: emptySemanticTwin().room, size: [2, 3, 0.4], position: [1, 0, 1] })
  const doc = { ...newSpaceDocument('space:test'), observations: [observation], entities: [entity] }
  const built = buildTwinScene([binding])
  assert.equal(built.error, null)
  const bounds = new THREE.Box3().setFromObject(built.objects[0].source).getSize(new THREE.Vector3())
  assert.deepEqual(bounds.toArray(), [2, 3, 0.4])
  await applyTwinImageAppearance(built.objects, doc, new AbortController().signal, built.textures)
  assert.equal(built.textures.size, 0) // Manual shapes never acquire automatic photo appearance.
  let released = 0
  const texture = new THREE.Texture(); texture.addEventListener('dispose', () => released++)
  built.textures.add(texture); disposeTwinScene(built); disposeTwinScene(built)
  assert.equal(released, 1)
})


test('contour projection uses one full source frame across separate components and preserves side swatches', () => {
  const shape = new THREE.Shape().moveTo(-1, -1).lineTo(-0.3, -1).lineTo(-0.3, 1).lineTo(-1, 1).closePath()
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: 0.4, bevelEnabled: false })
  const positions = geometry.getAttribute('position').clone(), triangles = positions.count / 3
  mapTwinContourFace(geometry, 2, 2, { width: 100, height: 100 }, 100, 108)
  const uv = geometry.getAttribute('uv'), normal = geometry.getAttribute('normal')
  let fronts = 0, sides = 0
  for (let i = 0; i < uv.count; i++) {
    if (normal.getZ(i) > 0.999) {
      fronts++
      assert.ok(uv.getX(i) < 0.36, 'left component samples only the left of the crop, not the whole photograph')
      assert.ok(Math.abs(uv.getX(i) - Math.max(0, positions.getX(i) / 2 + 0.505)) < 1e-6)
      assert.ok(uv.getY(i) >= 8 / 108 - 1e-6)
    } else { sides++; assert.ok(Math.abs(uv.getY(i) - 4 / 108) < 1e-6) }
  }
  assert.ok(fronts > 0 && sides > 0)
  assert.equal(geometry.getAttribute('position').count / 3, triangles)
  assert.deepEqual(Array.from(geometry.getAttribute('position').array), Array.from(positions.array))
  geometry.dispose()
})

import { photoOverlayBindings, projectTwinOnPhoto } from '../semanticTwinPhotoProjection'
import { PHOTO_DISTANCE, photoDimensions, photoFieldOfView } from '@/features/immersive-media/immersivePhotoProjection'
import { parseSemanticSpaceInvocation } from '@/features/agent-ready/semanticSpaceWebMcpTools'
import { normalizeMediaUrl } from '@/features/immersive-media/immersiveMediaModel'

test('photo overlays preserve image-ray alignment across aspect ratios, shapes and authored placements', () => {
  for (const aspect of [0.5, 1, 16 / 9, 3]) for (const template of ['box', 'building', 'tree', 'cloud'] as const) {
    const observation: SpaceObservation = { id: 'observation:overlay', capturedAtMs: 1, width: 600 * aspect, height: 600,
      imageDataUrl: 'data:image/png;base64,AA==', sha256: 'a'.repeat(64), orientation: 'source-pixels', scale: 'unknown' }
    const entity: SpaceEntity = { id: 'entity:overlay', observationId: observation.id, category: template, label: 'Evidence',
      region: { x: .13, y: .27, width: .32, height: .42 }, confirmedAtMs: 1, provenance: 'user-confirmed' }
    const binding = buildSemanticTwinBinding({ entity, observation, template, room: emptySemanticTwin().room,
      size: [1.2, 2.3, .6], position: [-1, 2, 1] })
    const doc = { ...newSpaceDocument('space:overlay'), observations: [observation], entities: [entity],
      twin: { ...emptySemanticTwin(), objects: [binding] } }
    const photo = { ...observation, evidenceSha256: observation.sha256 }, size = photoDimensions(photo)
    const built = buildTwinScene([binding]), before = JSON.stringify(binding)
    let vertices = 0
    built.objects[0].source.traverse(item => { if ((item as THREE.Mesh).isMesh) vertices += (item as THREE.Mesh).geometry.getAttribute('position').count })
    projectTwinOnPhoto(built.objects[0], doc, photo)
    let afterVertices = 0
    const min = [Infinity, Infinity], max = [-Infinity, -Infinity]
    built.objects[0].source.traverse(item => {
      if (!(item as THREE.Mesh).isMesh) return
      const positions = (item as THREE.Mesh).geometry.getAttribute('position')
      afterVertices += positions.count
      for (let i = 0; i < positions.count; i++) {
        const x = positions.getX(i) * PHOTO_DISTANCE / -positions.getZ(i) / size.width + .5
        const y = .5 - positions.getY(i) * PHOTO_DISTANCE / -positions.getZ(i) / size.height
        min[0] = Math.min(min[0], x); min[1] = Math.min(min[1], y)
        max[0] = Math.max(max[0], x); max[1] = Math.max(max[1], y)
        assert.ok(Number.isFinite(x + y) && positions.getZ(i) < -77)
      }
    })
    assert.ok(Math.abs(min[0] - .13) < 1e-6 && Math.abs(max[0] - .45) < 1e-6)
    assert.ok(Math.abs(min[1] - .27) < 1e-6 && Math.abs(max[1] - .69) < 1e-6)
    assert.equal(afterVertices, vertices); assert.equal(JSON.stringify(binding), before)
    assert.deepEqual(photoOverlayBindings(doc, { ...photo, evidenceSha256: 'b'.repeat(64) }), [])
    assert.equal(photoOverlayBindings(doc, photo).length, 1)
    const duplicate = { ...binding, entityId: 'entity:later' }
    assert.equal(photoOverlayBindings({ ...doc, entities: [...doc.entities, { ...entity, id: duplicate.entityId }],
      twin: { ...doc.twin, objects: [binding, duplicate] } }, photo)[0].entityId, duplicate.entityId)
    for (const viewportAspect of [.45, 1, 2]) {
      const fov = photoFieldOfView(photo, viewportAspect)
      const visibleHeight = 2 * PHOTO_DISTANCE * Math.tan(fov * Math.PI / 360)
      assert.ok(visibleHeight >= size.height && visibleHeight * viewportAspect >= size.width)
    }
    disposeTwinScene(built)
  }
})

test('overlay invocation is explicit and bounded saved-image URLs do not relax normal URL limits', () => {
  assert.deepEqual(parseSemanticSpaceInvocation('/space.overlay @observation:sample #image'),
    { operation: 'overlay', observationId: 'observation:sample' })
  assert.throws(() => parseSemanticSpaceInvocation('/space.overlay @observation:sample #other'))
  const image = 'data:image/jpeg;base64,' + 'A'.repeat(3000)
  assert.equal(normalizeMediaUrl(image), null)
  assert.equal(normalizeMediaUrl(image, 2 * 1024 * 1024), image)
  assert.equal(normalizeMediaUrl('https://example.test/' + 'A'.repeat(3000), 2 * 1024 * 1024), null)
})

test('contour overlays retain their visible shape and keep bevels within the source rectangle', () => {
  const observation: SpaceObservation = { id: 'observation:contour', capturedAtMs: 1, width: 1200, height: 600,
    imageDataUrl: 'data:image/png;base64,AA==', sha256: 'c'.repeat(64), orientation: 'source-pixels', scale: 'unknown' }
  const entity: SpaceEntity = { id: 'entity:contour', observationId: observation.id, category: 'visual-region', label: 'Shape',
    region: { x: 0, y: .12, width: 1, height: .36 }, confirmedAtMs: 1, provenance: 'user-confirmed' }
  const silhouette = { width: 80, height: 20, runs: Array.from({length:20}, (_, y) => [y < 10 ? 0 : 10, y, y < 10 ? 80 : 60] as const) }
  const binding = buildSemanticTwinBinding({ entity, observation, template: 'contour', silhouette,
    room: emptySemanticTwin().room, size: [5, 1, .4], position: [0, 0, 2] })
  const doc = { ...newSpaceDocument('space:contour'), observations: [observation], entities: [entity] }
  const photo = { ...observation, evidenceSha256: observation.sha256 }, size = photoDimensions(photo)
  const built = buildTwinScene([binding]); assert.equal(built.error, null)
  projectTwinOnPhoto(built.objects[0], doc, photo)
  let vertices = 0
  built.objects[0].source.traverse(object => {
    if (!(object as THREE.Mesh).isMesh) return
    const positions = (object as THREE.Mesh).geometry.getAttribute('position'); vertices += positions.count
    for (let i = 0; i < positions.count; i++) {
      const u = positions.getX(i) * PHOTO_DISTANCE / -positions.getZ(i) / size.width + .5
      const v = .5 - positions.getY(i) * PHOTO_DISTANCE / -positions.getZ(i) / size.height
      assert.ok(u >= -1e-6 && u <= 1 + 1e-6 && v >= .12 - 1e-6 && v <= .48 + 1e-6)
    }
  })
  assert.ok(vertices > 30); disposeTwinScene(built)
})
