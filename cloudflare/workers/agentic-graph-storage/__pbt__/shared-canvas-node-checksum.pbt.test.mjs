import assert from 'node:assert/strict'
import { test } from 'node:test'
import * as Y from 'yjs'
import fc from 'fast-check'

import {
  encodeYjsUpdateBase64,
  setCollaborationJsonObjectField,
} from '../../../../grph-shared/src/collaboration/yjsSnapshot.ts'
import { computeSharedCanvasNodeChecksum } from '../sharedCanvasNode/nodeChecksum.ts'
import { SharedCanvasNodeStore } from '../sharedCanvasNode/nodeStorage.ts'

const config = {
  maxDeltaBytes: 4096,
  maxPayloadBytes: 4096,
  replayLogMaxEntries: 8,
}

class MemoryStorage {
  constructor() {
    this.values = new Map()
    this.putCount = 0
  }

  async put(key, value) {
    this.putCount += 1
    this.values.set(key, value)
  }

  async get(key) {
    return this.values.get(key)
  }

  async delete(key) {
    this.values.delete(key)
  }
}

const createDelta = ({ nodeId, transactionId, writerSide, fields }) => {
  const doc = new Y.Doc()
  Object.entries(fields).forEach(([key, value]) => {
    setCollaborationJsonObjectField({ doc, key, value, origin: 'pbt' })
  })
  const update = Y.encodeStateAsUpdate(doc)
  return {
    doc,
    envelope: {
      type: 'node.delta',
      schema: 'agentic-graph-travel-node-delta/v1',
      nodeId,
      transactionId,
      writerSide,
      clientSeq: 1,
      updateBase64: encodeYjsUpdateBase64(update),
      updateByteLength: update.byteLength,
      expectedScope: 'shared',
    },
  }
}

const safeText = fc.stringMatching(/^[A-Za-z0-9 _.-]{1,32}$/)
const idText = fc.stringMatching(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,31}$/)

const bookingPayload = fc.record({
  nodeId: idText,
  transactionId: idText,
  title: safeText,
  status: fc.constantFrom('draft', 'quoted', 'held'),
  totalMinor: fc.integer({ min: 1, max: 1_000_000 }),
  currency: fc.constantFrom('SGD', 'USD'),
  viewerSide: fc.constantFrom('shopper', 'merchant'),
  viewerMembershipId: idText,
  subscriptionId: idText,
  servedAtMs: fc.integer({ min: 1, max: 10_000_000 }),
  remainingWindowSeconds: fc.integer({ min: 1, max: 3600 }),
  activePeerCount: fc.integer({ min: 0, max: 8 }),
})

test('Property 1: shopper and merchant subscriptions compute identical payload checksums', async () => {
  await fc.assert(fc.asyncProperty(bookingPayload, async payload => {
    const baseFields = {
      title: payload.title,
      status: payload.status,
      totalMinor: payload.totalMinor,
      currency: payload.currency,
    }
    const shopper = createDelta({
      nodeId: payload.nodeId,
      transactionId: payload.transactionId,
      writerSide: 'shopper',
      fields: {
        ...baseFields,
        viewerSide: 'shopper',
        viewerMembershipId: payload.viewerMembershipId,
        subscriptionId: payload.subscriptionId,
        servedAtMs: payload.servedAtMs,
        remainingWindowSeconds: payload.remainingWindowSeconds,
        activePeerCount: payload.activePeerCount,
      },
    })
    const merchant = createDelta({
      nodeId: payload.nodeId,
      transactionId: payload.transactionId,
      writerSide: 'merchant',
      fields: {
        ...baseFields,
        viewerSide: 'merchant',
        viewerMembershipId: `${payload.viewerMembershipId}-m`,
        subscriptionId: `${payload.subscriptionId}-m`,
        servedAtMs: payload.servedAtMs + 1,
        remainingWindowSeconds: Math.max(0, payload.remainingWindowSeconds - 1),
        activePeerCount: payload.activePeerCount + 1,
      },
    })

    assert.equal(
      await computeSharedCanvasNodeChecksum(shopper.doc),
      await computeSharedCanvasNodeChecksum(merchant.doc),
    )
  }), { numRuns: 100 })
})

test('Shared_Canvas_Node_Store rejects malformed or oversized deltas without mutating state', async () => {
  const storage = new MemoryStorage()
  const store = new SharedCanvasNodeStore({ storage, config })
  const valid = createDelta({
    nodeId: 'node-1',
    transactionId: 'transaction-1',
    writerSide: 'shopper',
    fields: { title: 'hello', totalMinor: 100 },
  }).envelope
  const accepted = await store.applyDelta({ workspaceId: 'workspace', roomId: 'room', value: valid, resolvedWriterSide: 'shopper' })
  assert.equal(accepted.ok, true)
  const before = await store.readNode('workspace', 'room', 'node-1')
  const putCount = storage.putCount

  const malformed = await store.applyDelta({
    workspaceId: 'workspace',
    roomId: 'room',
    value: { ...valid, updateBase64: '%%%not-base64%%%' },
    resolvedWriterSide: 'merchant',
  })
  assert.equal(malformed.ok, false)
  assert.deepEqual(await store.readNode('workspace', 'room', 'node-1'), before)
  assert.equal(storage.putCount, putCount)

  const oversizedStore = new SharedCanvasNodeStore({ storage, config: { ...config, maxDeltaBytes: 1 } })
  const oversized = await oversizedStore.applyDelta({ workspaceId: 'workspace', roomId: 'room', value: valid, resolvedWriterSide: 'shopper' })
  assert.equal(oversized.ok, false)
  assert.deepEqual(await store.readNode('workspace', 'room', 'node-1'), before)
  assert.equal(storage.putCount, putCount)
})
