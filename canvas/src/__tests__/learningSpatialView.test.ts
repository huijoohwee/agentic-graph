import assert from 'node:assert/strict'
import test from 'node:test'
import { LearningSpatialSelection, learningAssets, learningAssetFromObject } from '../features/python-learning/learningSpatialView'
import { learningLesson } from '../features/python-learning/learningLessons'
import { LearningSimulation } from '../features/python-learning/learningSimulation'

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
