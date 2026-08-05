import assert from 'node:assert/strict'
import { test } from 'node:test'

import { allocateEntity, createWorld, query, registerComponent } from '../../../../../ecs/index.js'
import { disposeWorld, snapshotWorld } from '../../../../../ecs/world.js'

import {
  AUTHORING_ECS_PROJECTION_SCHEMA,
  projectAuthoringEcsRows,
} from '../authoringEcsProjection'
import { projectCanonicalAuthoringEcsWorld } from '../authoringEcsWorldAdapter'

test('ECS row projection is deterministic, filtered, and data-only', () => {
  const rows = [
    { entityId: 2, componentName: 'Transform', fields: { z: 3, x: 1 } },
    { entityId: 0, componentName: 'Visibility', fields: { visible: true } },
    { entityId: 0, componentName: 'Transform', fields: { x: 4, nested: { b: 2, a: 1 } } },
  ] as const

  const result = projectAuthoringEcsRows(rows, ['Transform'])
  assert.equal(result.status, 'ready')
  if (result.status !== 'ready') return

  assert.equal(result.projection.schema, AUTHORING_ECS_PROJECTION_SCHEMA)
  assert.deepEqual(result.projection.entities.map(entity => entity.entityId), [0, 2])
  assert.deepEqual(Object.keys(result.projection.entities[0].components), ['Transform'])
  assert.deepEqual(Object.keys(result.projection.entities[0].components.Transform), ['nested', 'x'])
  assert.equal(rows[2].fields.x, 4)
  assert.equal(Object.isFrozen(result.projection.entities), true)
})

test('ECS row projection rejects duplicates and non-finite field values', () => {
  assert.deepEqual(projectAuthoringEcsRows([
    { entityId: 1, componentName: 'Transform', fields: { x: 1 } },
    { entityId: 1, componentName: 'Transform', fields: { x: 2 } },
  ]), { status: 'invalid', reason: 'duplicate-component-row' })

  assert.deepEqual(projectAuthoringEcsRows([
    { entityId: 1, componentName: 'Transform', fields: { x: Number.NaN } },
  ]), { status: 'invalid', reason: 'invalid-field-value' })

  assert.deepEqual(projectAuthoringEcsRows([
    { entityId: -1, componentName: 'Transform', fields: { x: 1 } },
  ]), { status: 'invalid', reason: 'invalid-entity-id' })
})

test('canonical ECS allocation starts at entity zero and projects without mutation', () => {
  const world = createWorld()
  try {
    registerComponent(world, 'Transform', { x: 'f32', y: 'f32' })
    registerComponent(world, 'Visibility', { visible: 'u8' })

    const firstEntityId = allocateEntity(world, {
      entityRef: 'xr.authoring.first',
      components: {
        Transform: { x: 4, y: 8 },
        Visibility: { visible: 1 },
      },
    })
    const secondEntityId = allocateEntity(world, {
      entityRef: 'xr.authoring.second',
      components: { Transform: { x: 16, y: 32 } },
    })

    assert.equal(firstEntityId, 0)
    assert.equal(secondEntityId, 1)
    assert.deepEqual(query(world, []), [0, 1])

    const before = snapshotWorld(world)
    const result = projectCanonicalAuthoringEcsWorld(world, ['Transform'])
    assert.equal(result.status, 'ready')
    if (result.status !== 'ready') return

    assert.deepEqual(result.projection.entities.map(entity => entity.entityId), [0, 1])
    assert.deepEqual({ ...result.projection.entities[0].components.Transform }, { x: 4, y: 8 })
    assert.deepEqual(Object.keys(result.projection.entities[0].components), ['Transform'])
    assert.deepEqual(snapshotWorld(world), before)

    const intersection = projectCanonicalAuthoringEcsWorld(world, ['Transform', 'Visibility'])
    assert.equal(intersection.status, 'ready')
    if (intersection.status === 'ready') {
      assert.deepEqual(intersection.projection.entities.map(entity => entity.entityId), [0])
    }

    const duplicateNameQuery = projectCanonicalAuthoringEcsWorld(world, ['Transform', 'Transform'])
    assert.equal(duplicateNameQuery.status, 'ready')
    if (duplicateNameQuery.status === 'ready') {
      assert.deepEqual(duplicateNameQuery.projection.entities.map(entity => entity.entityId), [0, 1])
    }
  } finally {
    disposeWorld(world)
  }
})

test('canonical ECS adapter rejects unavailable worlds without throwing', () => {
  const world = createWorld()
  disposeWorld(world)
  assert.deepEqual(projectCanonicalAuthoringEcsWorld(world), {
    status: 'invalid',
    reason: 'world-unavailable',
  })
})
