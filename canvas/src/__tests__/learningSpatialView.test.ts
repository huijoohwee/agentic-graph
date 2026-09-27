import assert from 'node:assert/strict'
import { WAREHOUSE_ZONES, WAREHOUSE_CONTEXT_RACKS, warehouseAllocation } from '../features/python-learning/warehouseLayout'
import test from 'node:test'
import { LearningSpatialSelection, learningAssets, learningAssetFromObject } from '../features/python-learning/learningSpatialView'
import { learningLesson } from '../features/python-learning/learningLessons'
import { LearningSimulation } from '../features/python-learning/learningSimulation'
import { resolveThreeSceneFrameLoop } from '../lib/three/threeRendererLifecycle'

test('asset inventory projects fixed collision geometry and live drone pose without mutating the lesson', () => {
  const lesson = learningLesson('drone'), before = JSON.stringify(lesson)
  const simulation = new LearningSimulation(lesson)
  const assets = learningAssets(lesson, { ...simulation.snapshot(), x: 3, z: -2, altitude: 1.5 })
  assert.deepEqual(assets.find(a => a.id === 'obstacle:crate')?.size, [.8, 1, 1.2])
  assert.deepEqual(assets.find(a => a.id === 'goal')?.position, [4, 0, 0])
  assert.deepEqual(assets.find(a => a.id === 'drone')?.position, [3, 1.5, -2])
  assert.equal(learningAssets(lesson).find(a => a.id === 'drone')?.position[0], 0)
  assert.equal(JSON.stringify(lesson), before)
})
test('selection survives surface changes, resets across documents, and unsubscribes cleanly', () => {
  const store = new LearningSpatialSelection(); let updates = 0
  const stop = store.subscribe(() => updates++)
  const first = store.read('workspace-a/drone')
  assert.equal(first, store.read('workspace-a/drone'))
  store.update('workspace-a/drone', { selectedId: 'obstacle:crate' })
  store.update('workspace-a/drone', { dimensions: false })
  assert.deepEqual(store.read('workspace-a/drone'), { selectedId: 'obstacle:crate', dimensions: false })
  assert.deepEqual(store.read('workspace-b/drone'), { selectedId: 'room', dimensions: true })
  store.update('workspace-b/drone', { selectedId: 'drone' })
  assert.equal(store.read('workspace-a/drone'), first)
  stop(); store.update('workspace-b/drone', { dimensions: false }); assert.equal(updates, 3)
})
test('3D picking resolves nested decoration to its nearest asset owner', () => {
  const room = { name: 'learning-drone-training-room', parent: null }
  assert.equal(learningAssetFromObject({ name: '', parent: { name: 'learning-obstacle-crate', parent: room } }), 'obstacle:crate')
  assert.equal(learningAssetFromObject({ name: '', parent: { name: 'learning-drone', parent: room } }), 'drone')
  assert.equal(learningAssetFromObject({ name: 'learning-room-floor', parent: room }), 'room')
  assert.equal(learningAssetFromObject({ name: 'unrelated', parent: null }), null)
})

test('warehouse concept partitions its footprint and keeps racks in the bounded flight cell', () => {
  assert.deepEqual(warehouseAllocation(), { core: 1920, ancillary: 480, total: 2400, corePercent: 80, ancillaryPercent: 20 })
  for (const [index, zone] of WAREHOUSE_ZONES.entries()) {
    const [x, z, w, d] = zone.rect
    assert.ok(x >= -30 && z >= -20 && x + w <= 30 && z + d <= 20)
    for (const other of WAREHOUSE_ZONES.slice(index + 1)) {
      const [ox, oz, ow, od] = other.rect
      assert.ok(x + w <= ox || ox + ow <= x || z + d <= oz || oz + od <= z, `${zone.id} overlaps ${other.id}`)
    }
  }
  for (const rack of WAREHOUSE_CONTEXT_RACKS) {
    const [x, z] = rack.position, [width, height, depth] = rack.size
    assert.ok(width > 0 && height > 0 && depth > 0)
    assert.ok(x + width / 2 <= -8 || x - width / 2 >= 8 || z + depth / 2 <= -8 || z - depth / 2 >= 8,
      `${rack.id} crosses into the simulated inspection cell`)
    const zone = WAREHOUSE_ZONES.find(value => value.id === rack.zoneId)!
    assert.ok(zone, `${rack.id} has a known zone owner`)
    assert.ok(x - width / 2 >= zone.rect[0] && x + width / 2 <= zone.rect[0] + zone.rect[2]
      && z - depth / 2 >= zone.rect[1] && z + depth / 2 <= zone.rect[1] + zone.rect[3], `${rack.id} leaves its zone`)
  }
  const assets = learningAssets(learningLesson('drone'))
  assert.equal(assets.filter(asset => asset.kind === 'dock').length, 4)
  assert.deepEqual(assets.find(asset => asset.id === 'obstacle:rack-north')?.size, [12, 4.5, 1.2])
  assert.ok(assets.filter(asset => asset.kind === 'dock').every(asset => Math.abs(asset.position[0]) > 30))
  assert.equal(learningAssetFromObject({ name: 'warehouse-zone-vault', parent: null }), 'zone:vault')
  assert.equal(learningAssetFromObject({ name: 'warehouse-dock-in-1', parent: null }), 'dock:in-1')
})

test('lesson snapshots own rendering without keeping an idle warehouse animation loop alive', () => {
  const scene = { paused: false, immersiveMedia: false, gameplay: false, savedObjectView: false }
  assert.equal(resolveThreeSceneFrameLoop({ ...scene, learningScene: true }), 'demand')
  assert.equal(resolveThreeSceneFrameLoop({ ...scene, learningScene: true, paused: true }), 'demand')
  // The lesson replaces the rendered stage even when another surface retains its settings.
  assert.equal(resolveThreeSceneFrameLoop({ ...scene, learningScene: true, gameplay: true, immersiveMedia: true }), 'demand')
  for (const ordinary of [scene, { ...scene, gameplay: true }, { ...scene, immersiveMedia: true }]) {
    assert.equal(resolveThreeSceneFrameLoop(ordinary), 'always')
    assert.equal(resolveThreeSceneFrameLoop({ ...ordinary, learningScene: false }), 'always')
  }
  assert.equal(resolveThreeSceneFrameLoop({ ...scene, savedObjectView: true }), 'demand')
  assert.equal(resolveThreeSceneFrameLoop({ ...scene, savedObjectView: true, gameplay: true }), 'always')
})
