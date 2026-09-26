import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import test from 'node:test'
import {
  canonicalSpatialJson, createSpatialSourceIdentity, enforceSpatialBudget, freezeSpatial,
  requireSpatialCapability, spatialDigest, spatialValuesEqual, SpatialReviewError,
} from 'grph-shared/spatial-review'

test('extracted identity preserves canonical JSON and the SHA-256 contract', async () => {
  const value = { z: [3, { b: 2, a: 1 }], a: 'ship' }
  const canonical = '{"a":"ship","z":[3,{"a":1,"b":2}]}'
  assert.equal(canonicalSpatialJson(value), canonical)
  assert.equal(await spatialDigest(value), createHash('sha256').update(canonical).digest('hex'))
  assert.ok(spatialValuesEqual(value, { a: 'ship', z: [3, { a: 1, b: 2 }] }))
  assert.ok(!spatialValuesEqual([1, 2, 3], [3, 2, 1]))
})

test('byte budget counts UTF-8 and freezing protects detached nested review values', () => {
  enforceSpatialBudget('a'.repeat(128 * 1024 - 2))
  assert.throws(() => enforceSpatialBudget('é'.repeat(65536)), { code: 'budget-exceeded' })
  const source = { position: [0, 0, 0] }
  const preview = freezeSpatial(structuredClone(source))
  assert.throws(() => { preview.position[0] = 2 }, TypeError)
  assert.deepEqual(source.position, [0, 0, 0])
})

const source = { sourceKind: 'gamexr-manifest', schema: 'gamexr-scene/v1', documentId: 'local', session: 'browser-one', revision: 'persisted-one' }
const binding = identity => ({ sourceKind: identity.sourceKind, schema: identity.schema, sourceToken: identity.token })

test('source qualification refuses foreign owner, schema, session and revision with no effects', async () => {
  const identity = await createSpatialSourceIdentity(source)
  assert.equal(identity.token.split(':')[0], source.sourceKind)
  requireSpatialCapability(identity, binding(identity), 'preview', ['inspect', 'preview'])
  for (const [key, value] of [['sourceKind', 'graph-document'], ['schema', 'graph/v1'], ['session', 'browser-two'], ['revision', 'persisted-two'], ['documentId', 'other-scene']]) {
    const other = await createSpatialSourceIdentity({ ...source, [key]: value })
    assert.notEqual(other.token, identity.token)
    assert.throws(() => requireSpatialCapability(identity, binding(other), 'preview', ['preview']), SpatialReviewError)
  }
  assert.deepEqual(source, { sourceKind: 'gamexr-manifest', schema: 'gamexr-scene/v1', documentId: 'local', session: 'browser-one', revision: 'persisted-one' })
})

test('unknown capabilities and untrusted write approval fields fail closed', async () => {
  const identity = await createSpatialSourceIdentity(source)
  for (const operation of ['apply', 'fly', '']) {
    assert.throws(() => requireSpatialCapability(identity, binding(identity), operation, ['inspect', 'preview']), { code: 'unsupported-operation' })
  }
  assert.throws(() => requireSpatialCapability(identity, { ...binding(identity), approved: true }, 'preview', ['preview']), { code: 'invalid-input' })
  await assert.rejects(createSpatialSourceIdentity({ ...source, session: '' }), { code: 'invalid-input' })
  await assert.rejects(createSpatialSourceIdentity({ ...source, extra: true }), { code: 'invalid-input' })
  assert.throws(() => requireSpatialCapability(identity, null, 'inspect', ['inspect']), { code: 'invalid-input' })
})
