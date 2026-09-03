import assert from 'node:assert/strict'
import test from 'node:test'
import * as Y from 'yjs'

import { encodeYjsUpdateBase64, setCollaborationJsonObjectField } from '../../../../grph-shared/src/collaboration/yjsSnapshot'
import type { SharedCanvasNode } from './nodeDeltaContract'
import { handleSharedNodeRoomMessage } from './nodeRoomDispatch'
import { SharedCanvasNodeStore } from './nodeStorage'
import {
  inspectTravelMutationTriggerReadiness,
  readAcceptedTravelMutation,
  supportsTravelMutationOutbox,
  supportsTravelMutationOutboxTransaction,
  TravelMutationOutbox,
  TRAVEL_BUNDLE_MAP_SCHEMA,
  type TravelMutationOutboxListOptions,
  type TravelMutationOutboxStorage,
  type TravelMutationOutboxTransaction,
} from './travelMutationOutbox'

class MemoryDurableStorage {
  readonly entries = new Map<string, unknown>()
  alarmAt: number | null = null

  async get<T = unknown>(key: string): Promise<T | undefined>
  async get<T = unknown>(keys: string[]): Promise<Map<string, T>>
  async get<T = unknown>(keyOrKeys: string | string[]): Promise<T | undefined | Map<string, T>> {
    if (Array.isArray(keyOrKeys)) {
      return new Map(keyOrKeys.flatMap((key) => this.entries.has(key) ? [[key, this.entries.get(key) as T]] : []))
    }
    return this.entries.get(keyOrKeys) as T | undefined
  }

  async list<T = unknown>(options: TravelMutationOutboxListOptions = {}): Promise<Map<string, T>> {
    const values = [...this.entries.entries()]
      .filter(([key]) => !options.prefix || key.startsWith(options.prefix))
      .filter(([key]) => !options.start || key >= options.start)
      .filter(([key]) => !options.startAfter || key > options.startAfter)
      .filter(([key]) => !options.end || key < options.end)
      .sort(([left], [right]) => left.localeCompare(right))
    if (options.reverse) values.reverse()
    return new Map(values.slice(0, options.limit ?? values.length) as [string, T][])
  }

  async put<T>(key: string, value: T): Promise<void>
  async put<T>(entries: Record<string, T>): Promise<void>
  async put<T>(keyOrEntries: string | Record<string, T>, value?: T): Promise<void> {
    if (typeof keyOrEntries === 'string') {
      this.entries.set(keyOrEntries, value)
      return
    }
    for (const [key, entry] of Object.entries(keyOrEntries)) this.entries.set(key, entry)
  }

  async delete(key: string): Promise<boolean>
  async delete(keys: string[]): Promise<number>
  async delete(keyOrKeys: string | string[]): Promise<boolean | number> {
    if (Array.isArray(keyOrKeys)) {
      let deleted = 0
      for (const key of keyOrKeys) if (this.entries.delete(key)) deleted += 1
      return deleted
    }
    return this.entries.delete(keyOrKeys)
  }

  async transaction<T>(closure: (transaction: TravelMutationOutboxTransaction) => Promise<T>): Promise<T> {
    const entries = new Map(this.entries)
    const alarmAt = this.alarmAt
    try {
      return await closure(this)
    } catch (error) {
      this.entries.clear()
      for (const [key, value] of entries) this.entries.set(key, value)
      this.alarmAt = alarmAt
      throw error
    }
  }

  rollback(): void {
    throw new Error('rollback is not exercised by this test double')
  }

  async getAlarm(): Promise<number | null> {
    return this.alarmAt
  }

  async setAlarm(value: number | Date): Promise<void> {
    this.alarmAt = value instanceof Date ? value.getTime() : value
  }

  async deleteAlarm(): Promise<void> {
    this.alarmAt = null
  }

  records(prefix: string): Record<string, unknown>[] {
    return [...this.entries.entries()]
      .filter(([key]) => key.startsWith(prefix))
      .map(([, value]) => value as Record<string, unknown>)
  }
}

const node = (overrides: Partial<SharedCanvasNode> = {}): SharedCanvasNode => ({
  schema: 'agentic-graph-travel-shared-canvas-node/v1',
  workspaceId: 'workspace-1',
  roomId: 'room-1',
  nodeId: 'node-1',
  transactionId: 'transaction-1',
  scope: 'shared',
  shopperPartyId: 'shopper',
  merchantPartyId: 'merchant',
  acceptedSeq: 1,
  yjsStateBase64: 'AA==',
  nodePayloadChecksum: 'a'.repeat(64),
  updatedAtMs: 1_000,
  ...overrides,
})

const initializationSeed = (legId = 'flight-leg') => ({
  principal_id: 'principal-operator-owned',
  total_budget_minor: 50_000,
  legs: [{
    leg_id: legId,
    category: 'flight',
    committed_offer_id: 'offer-original',
    committed_amount_minor: 12_000,
  }],
  edges: [],
})

const bundleMap = (bundleId = 'bundle-operator-owned', legId = 'flight-leg'): string => JSON.stringify({
  schema: TRAVEL_BUNDLE_MAP_SCHEMA,
  revision: 'revision-1',
  entries: [{
    workspace_id: 'workspace-1',
    room_id: 'room-1',
    node_id: 'node-1',
    bundle_id: bundleId,
    initialization_seed: initializationSeed(legId),
  }],
})

const token = 't'.repeat(48)

const outboxStorage = (): MemoryDurableStorage & TravelMutationOutboxStorage => {
  const storage = new MemoryDurableStorage()
  assert.equal(supportsTravelMutationOutbox(storage), true)
  if (!supportsTravelMutationOutbox(storage)) throw new Error('test storage must support the outbox contract')
  return storage
}

test('accepted travel mutation consumes only leg_id and stable node metadata', () => {
  const event = readAcceptedTravelMutation({
    node: node(),
    payload: {
      leg_id: 'flight-leg',
      bundle_id: 'payload-bundle-must-not-win',
      event_id: 'payload-event-must-not-win',
    },
  })
  assert.deepEqual(event, {
    workspaceId: 'workspace-1',
    roomId: 'room-1',
    nodeId: 'node-1',
    transactionId: 'transaction-1',
    legId: 'flight-leg',
  })
  assert.equal(readAcceptedTravelMutation({ node: node(), payload: { title: 'not a travel mutation' } }), null)
  assert.equal(readAcceptedTravelMutation({ node: node(), payload: { leg_id: '../invalid' } }), null)
})

test('room dispatch durably invokes the injected adapter before preserving the accepted broadcast shape', async () => {
  const storage = new MemoryDurableStorage()
  const store = new SharedCanvasNodeStore({
    storage,
    config: { maxDeltaBytes: 4_096, maxPayloadBytes: 4_096, replayLogMaxEntries: 8 },
    nowMs: () => 1_000,
  })
  const doc = new Y.Doc()
  setCollaborationJsonObjectField({ doc, key: 'leg_id', value: 'flight-leg', origin: 'test' })
  const update = Y.encodeStateAsUpdate(doc)
  const order: string[] = []
  const broadcasts: unknown[] = []
  const socketMessages: unknown[] = []
  await handleSharedNodeRoomMessage({
    store,
    socket: { send: (message: string) => { socketMessages.push(JSON.parse(message)) } },
    attachment: { workspaceId: 'workspace-1', roomId: 'room-1', role: 'editor', transactionSide: 'shopper' },
    payload: {
      type: 'node.delta',
      schema: 'agentic-graph-travel-node-delta/v1',
      nodeId: 'node-1',
      transactionId: 'transaction-1',
      writerSide: 'shopper',
      clientSeq: 1,
      updateBase64: encodeYjsUpdateBase64(update),
      updateByteLength: update.byteLength,
      expectedScope: 'shared',
    },
    onAccepted: async () => { order.push('outbox') },
    broadcastJson: (body) => { order.push('broadcast'); broadcasts.push(body) },
  })
  assert.deepEqual(order, ['outbox', 'broadcast'])
  assert.deepEqual(socketMessages, [])
  const broadcast = broadcasts[0] as Record<string, unknown>
  assert.deepEqual(Object.keys(broadcast).sort(), ['checksum', 'node', 'payload', 'seq', 'type'])
  assert.equal(broadcast.type, 'node.delta.accepted')
  assert.deepEqual(broadcast.payload, { leg_id: 'flight-leg' })
})

test('node commit and outbox enqueue roll back together, then restart drains the retried acceptance exactly once', async () => {
  const storage = outboxStorage()
  const doc = new Y.Doc()
  setCollaborationJsonObjectField({ doc, key: 'leg_id', value: 'flight-leg', origin: 'test' })
  const update = Y.encodeStateAsUpdate(doc)
  const delta = {
    type: 'node.delta',
    schema: 'agentic-graph-travel-node-delta/v1',
    nodeId: 'node-1',
    transactionId: 'transaction-1',
    writerSide: 'shopper',
    clientSeq: 1,
    updateBase64: encodeYjsUpdateBase64(update),
    updateByteLength: update.byteLength,
    expectedScope: 'shared',
  }
  const triggerEnv = {
    AGENTIC_OS_TRAVEL_COMMERCE: { fetch: async () => new Response(null, { status: 200 }) },
    AGENTIC_OS_TRAVEL_COMMERCE_API_TOKEN: token,
    SHARED_NODE_TRAVEL_BUNDLE_MAP_JSON: bundleMap(),
    SHARED_NODE_TRAVEL_DISPATCH_TIMEOUT_MS: '4000',
  }
  const failingStore = new SharedCanvasNodeStore({
    storage,
    config: { maxDeltaBytes: 4_096, maxPayloadBytes: 4_096, replayLogMaxEntries: 8 },
    nowMs: () => 1_000,
  })
  const failingOutbox = new TravelMutationOutbox({ storage, env: triggerEnv, nowMs: () => 1_000 })
  await assert.rejects(handleSharedNodeRoomMessage({
    store: failingStore,
    socket: { send: () => undefined },
    attachment: { workspaceId: 'workspace-1', roomId: 'room-1', role: 'editor', transactionSide: 'shopper' },
    payload: delta,
    broadcastJson: () => assert.fail('failed transaction must not broadcast acceptance'),
    onAccepted: async (accepted, transaction) => {
      assert.equal(supportsTravelMutationOutboxTransaction(transaction), true)
      if (!supportsTravelMutationOutboxTransaction(transaction)) throw new Error('test transaction unavailable')
      await failingOutbox.enqueueAcceptedAtomically(accepted, transaction)
      throw new Error('injected-after-outbox-write')
    },
  }), /injected-after-outbox-write/)
  assert.equal([...storage.entries.keys()].some(key => key.startsWith('txnode:')), false)
  assert.equal(storage.records('travel-mutation-outbox:event:').length, 0)
  assert.equal(storage.alarmAt, null)

  const outbound: Array<{ method: string; path: string }> = []
  triggerEnv.AGENTIC_OS_TRAVEL_COMMERCE = {
    fetch: async (request: Request) => {
      outbound.push({ method: request.method, path: new URL(request.url).pathname })
      return Response.json({ kind: request.method === 'PUT' ? 'initialized' : 'committed' })
    },
  }
  const restartedStore = new SharedCanvasNodeStore({
    storage,
    config: { maxDeltaBytes: 4_096, maxPayloadBytes: 4_096, replayLogMaxEntries: 8 },
    nowMs: () => 1_000,
  })
  const restartedOutbox = new TravelMutationOutbox({ storage, env: triggerEnv, nowMs: () => 1_000 })
  const broadcasts: unknown[] = []
  await handleSharedNodeRoomMessage({
    store: restartedStore,
    socket: { send: () => undefined },
    attachment: { workspaceId: 'workspace-1', roomId: 'room-1', role: 'editor', transactionSide: 'shopper' },
    payload: delta,
    broadcastJson: body => broadcasts.push(body),
    onAccepted: async (accepted, transaction) => {
      if (!supportsTravelMutationOutboxTransaction(transaction)) throw new Error('test transaction unavailable')
      await restartedOutbox.enqueueAcceptedAtomically(accepted, transaction)
    },
  })
  assert.equal(broadcasts.length, 1)
  const drainAfterSecondRestart = new TravelMutationOutbox({ storage, env: triggerEnv, nowMs: () => 1_000 })
  await drainAfterSecondRestart.drain()
  await drainAfterSecondRestart.drain()
  assert.deepEqual(outbound, [
    { method: 'PUT', path: '/v1/bundles/bundle-operator-owned' },
    { method: 'POST', path: '/v1/bundles/bundle-operator-owned/mutations' },
  ])
})

test('readiness fails closed until binding, shared token, exact mapping, and timeout are valid', () => {
  assert.deepEqual(inspectTravelMutationTriggerReadiness({}), {
    ok: false,
    serviceBinding: 'missing',
    apiToken: 'missing-or-weak',
    bundleMap: 'missing',
    dispatchTimeoutMs: 12_000,
    reasons: [
      'travel-service-binding-missing',
      'travel-service-token-missing-or-weak',
      'travel-bundle-map-missing',
    ],
  })
  const ready = inspectTravelMutationTriggerReadiness({
    AGENTIC_OS_TRAVEL_COMMERCE: { fetch: async () => new Response(null, { status: 200 }) },
    AGENTIC_OS_TRAVEL_COMMERCE_API_TOKEN: token,
    SHARED_NODE_TRAVEL_BUNDLE_MAP_JSON: bundleMap(),
    SHARED_NODE_TRAVEL_DISPATCH_TIMEOUT_MS: '4000',
  })
  assert.equal(ready.ok, true)
  assert.deepEqual(ready.reasons, [])
  assert.equal(inspectTravelMutationTriggerReadiness({
    AGENTIC_OS_TRAVEL_COMMERCE: { fetch: async () => new Response(null, { status: 200 }) },
    AGENTIC_OS_TRAVEL_COMMERCE_API_TOKEN: token,
    SHARED_NODE_TRAVEL_BUNDLE_MAP_JSON: '{',
    SHARED_NODE_TRAVEL_DISPATCH_TIMEOUT_MS: '999999',
  }).ok, false)
  const missingSeed = JSON.parse(bundleMap()) as { entries: Array<Record<string, unknown>> }
  delete missingSeed.entries[0].initialization_seed
  assert.equal(inspectTravelMutationTriggerReadiness({
    AGENTIC_OS_TRAVEL_COMMERCE: { fetch: async () => new Response(null, { status: 200 }) },
    AGENTIC_OS_TRAVEL_COMMERCE_API_TOKEN: token,
    SHARED_NODE_TRAVEL_BUNDLE_MAP_JSON: JSON.stringify(missingSeed),
  }).bundleMap, 'invalid')
})

test('cold deployment seeds the exact operator bundle and envelope before dispatching the metadata-derived mutation', async () => {
  const storage = outboxStorage()
  const calls: Array<{ method: string; url: string; authorization: string | null; body: unknown }> = []
  const outbox = new TravelMutationOutbox({
    storage,
    env: {
      AGENTIC_OS_TRAVEL_COMMERCE: {
        fetch: async (request: Request) => {
          calls.push({
            method: request.method,
            url: request.url,
            authorization: request.headers.get('authorization'),
            body: await request.json(),
          })
          return Response.json({ kind: 'committed' }, { status: 200 })
        },
      },
      AGENTIC_OS_TRAVEL_COMMERCE_API_TOKEN: token,
      SHARED_NODE_TRAVEL_BUNDLE_MAP_JSON: bundleMap(),
      SHARED_NODE_TRAVEL_DISPATCH_TIMEOUT_MS: '4000',
    },
    nowMs: () => 1_000,
  })
  const accepted = {
    node: node(),
    payload: {
      leg_id: 'flight-leg',
      bundle_id: 'payload-bundle-must-not-win',
      event_id: 'payload-event-must-not-win',
    },
  }
  assert.equal(await outbox.enqueueAccepted(accepted), 'enqueued')
  assert.equal(storage.alarmAt, 1_000)
  await outbox.drain()
  assert.deepEqual(calls, [
    {
      method: 'PUT',
      url: 'https://agentic-travel-commerce.internal/v1/bundles/bundle-operator-owned',
      authorization: `Bearer ${token}`,
      body: initializationSeed(),
    },
    {
      method: 'POST',
      url: 'https://agentic-travel-commerce.internal/v1/bundles/bundle-operator-owned/mutations',
      authorization: `Bearer ${token}`,
      body: { leg_id: 'flight-leg', event_id: 'transaction-1' },
    },
  ])
  assert.equal(await outbox.enqueueAccepted(accepted), 'duplicate')
  await outbox.drain()
  assert.equal(calls.length, 2)
  assert.equal(storage.records('travel-mutation-outbox:event:')[0]?.status, 'delivered')
})

test('unmapped acceptance remains durable and sends zero guessed request', async () => {
  const storage = outboxStorage()
  let calls = 0
  let now = 1_000
  const outbox = new TravelMutationOutbox({
    storage,
    env: {
      AGENTIC_OS_TRAVEL_COMMERCE: { fetch: async () => { calls += 1; return new Response(null, { status: 200 }) } },
      AGENTIC_OS_TRAVEL_COMMERCE_API_TOKEN: token,
      SHARED_NODE_TRAVEL_BUNDLE_MAP_JSON: bundleMap(),
    },
    nowMs: () => now,
  })
  await outbox.enqueueAccepted({ node: node({ nodeId: 'unmapped-node' }), payload: { leg_id: 'flight-leg' } })
  await outbox.drain()
  assert.equal(calls, 0)
  const record = storage.records('travel-mutation-outbox:event:')[0]
  assert.equal(record?.status, 'pending')
  assert.equal(record?.lastError, 'bundle-mapping-unavailable')
  assert.ok(typeof storage.alarmAt === 'number' && storage.alarmAt > now)
  now = storage.alarmAt ?? now
})

test('retry preserves the exact request identity and a 422 typed cascade rejection is terminal delivery', async () => {
  const storage = outboxStorage()
  let now = 10_000
  const bodies: unknown[] = []
  const urls: string[] = []
  const statuses = [503, 422]
  const env = {
    AGENTIC_OS_TRAVEL_COMMERCE: {
      fetch: async (request: Request) => {
        urls.push(request.url)
        bodies.push(await request.json())
        if (request.method === 'PUT') return Response.json({ kind: 'idempotent' }, { status: 200 })
        return Response.json({ kind: 'rejected' }, { status: statuses.shift() ?? 500 })
      },
    },
    AGENTIC_OS_TRAVEL_COMMERCE_API_TOKEN: token,
    SHARED_NODE_TRAVEL_BUNDLE_MAP_JSON: bundleMap('bundle-original'),
    SHARED_NODE_TRAVEL_DISPATCH_TIMEOUT_MS: '4000',
  }
  const outbox = new TravelMutationOutbox({
    storage,
    env,
    nowMs: () => now,
  })
  await outbox.enqueueAccepted({ node: node(), payload: { leg_id: 'flight-leg' } })
  await outbox.drain()
  const retryAt = storage.alarmAt
  assert.ok(typeof retryAt === 'number' && retryAt > now)
  const remapped = JSON.parse(bundleMap('bundle-must-not-replace-locked-identity')) as {
    entries: Array<{ initialization_seed: { total_budget_minor: number; legs: Array<{ committed_offer_id: string }> } }>
  }
  remapped.entries[0].initialization_seed.total_budget_minor = 60_000
  remapped.entries[0].initialization_seed.legs[0].committed_offer_id = 'offer-must-not-replace-locked-seed'
  env.SHARED_NODE_TRAVEL_BUNDLE_MAP_JSON = JSON.stringify(remapped)
  now = retryAt ?? now
  await outbox.drain()
  assert.deepEqual(bodies, [
    initializationSeed(),
    { leg_id: 'flight-leg', event_id: 'transaction-1' },
    initializationSeed(),
    { leg_id: 'flight-leg', event_id: 'transaction-1' },
  ])
  assert.deepEqual(urls, [
    'https://agentic-travel-commerce.internal/v1/bundles/bundle-original',
    'https://agentic-travel-commerce.internal/v1/bundles/bundle-original/mutations',
    'https://agentic-travel-commerce.internal/v1/bundles/bundle-original',
    'https://agentic-travel-commerce.internal/v1/bundles/bundle-original/mutations',
  ])
  const record = storage.records('travel-mutation-outbox:event:')[0]
  assert.equal(record?.status, 'delivered')
  assert.equal(record?.attempts, 2)
  assert.equal(record?.lastStatus, 422)
})
