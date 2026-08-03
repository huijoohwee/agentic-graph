import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  AUTHORING_ECS_PROJECTION_SCHEMA,
  projectAuthoringEcsRows,
} from '../authoringEcsProjection'

test('ECS row projection is deterministic, filtered, and data-only', () => {
  const rows = [
    { entityId: 2, componentName: 'Transform', fields: { z: 3, x: 1 } },
    { entityId: 1, componentName: 'Visibility', fields: { visible: true } },
    { entityId: 1, componentName: 'Transform', fields: { x: 4, nested: { b: 2, a: 1 } } },
  ] as const

  const result = projectAuthoringEcsRows(rows, ['Transform'])
  assert.equal(result.status, 'ready')
  if (result.status !== 'ready') return

  assert.equal(result.projection.schema, AUTHORING_ECS_PROJECTION_SCHEMA)
  assert.deepEqual(result.projection.entities.map(entity => entity.entityId), [1, 2])
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
})
