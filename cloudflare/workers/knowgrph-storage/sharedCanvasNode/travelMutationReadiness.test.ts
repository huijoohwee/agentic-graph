import assert from 'node:assert/strict'
import test from 'node:test'

import type { KnowgrphStorageWorkerEnv } from '../contract'
import { createKnowgrphStorageWorker } from '../index'
import { TRAVEL_BUNDLE_MAP_SCHEMA } from './travelMutationConfig'
import {
  probeTravelMutationTriggerReadiness,
  TRAVEL_MUTATION_READINESS_TIMEOUT_MS,
} from './travelMutationReadiness'

const token = 'r'.repeat(48)
const map = JSON.stringify({
  schema: TRAVEL_BUNDLE_MAP_SCHEMA,
  revision: 'readiness-revision-1',
  entries: [{
    workspace_id: 'workspace-1',
    room_id: 'room-1',
    node_id: 'node-1',
    bundle_id: 'bundle-1',
    initialization_seed: {
      principal_id: 'principal-1',
      total_budget_minor: 50_000,
      legs: [{
        leg_id: 'flight-leg',
        category: 'flight',
        committed_offer_id: 'offer-1',
        committed_amount_minor: 10_000,
      }],
      edges: [],
    },
  }],
})

const DB = { prepare: () => ({ bind: () => ({ run: async () => ({}), all: async () => ({ results: [] }) }) }) }
const KNOWGRPH_CANVAS_ROOM = { idFromName: () => 'room-id', get: () => ({ fetch: async () => new Response() }) }

test('storage readiness fails closed when the travel mutation trigger is not operator-configured', async () => {
  const response = await createKnowgrphStorageWorker().fetch(
    new Request('https://storage.internal/readyz'),
    { DB, KNOWGRPH_CANVAS_ROOM } as unknown as KnowgrphStorageWorkerEnv,
  )
  assert.equal(response.status, 503)
  const body = await response.json() as Record<string, unknown>
  assert.equal(body.ok, false)
  assert.equal(JSON.stringify(body).includes(token), false)
})

test('storage readiness performs a bounded downstream readiness probe and requires body-level ok', async () => {
  const calls: Request[] = []
  const base = {
    DB,
    KNOWGRPH_CANVAS_ROOM,
    KNOWGRPH_TRAVEL_COMMERCE_API_TOKEN: token,
    SHARED_NODE_TRAVEL_BUNDLE_MAP_JSON: map,
    SHARED_NODE_TRAVEL_DISPATCH_TIMEOUT_MS: '4000',
  }
  const ready = await createKnowgrphStorageWorker().fetch(
    new Request('https://storage.internal/readyz'),
    {
      ...base,
      KNOWGRPH_TRAVEL_COMMERCE: {
        fetch: async (request: Request) => {
          calls.push(request)
          return Response.json({ ok: true, lane: 'Production_Lane' })
        },
      },
    } as unknown as KnowgrphStorageWorkerEnv,
  )
  assert.equal(ready.status, 200)
  assert.deepEqual(calls.map(request => [request.method, request.url]), [[
    'GET', 'https://knowgrph-travel-commerce.internal/readyz',
  ], [
    'GET', 'https://knowgrph-travel-commerce.internal/v1/runtime',
  ]])
  assert.equal(calls[0].headers.has('authorization'), false)
  assert.equal(calls[1].headers.get('authorization'), `Bearer ${token}`)
  const dependencies = (await ready.json() as { dependencies: Record<string, unknown> }).dependencies
  assert.equal((dependencies.travelMutationTrigger as { downstream: string }).downstream, 'ready')

  const falsePositive = await createKnowgrphStorageWorker().fetch(
    new Request('https://storage.internal/readyz'),
    {
      ...base,
      KNOWGRPH_TRAVEL_COMMERCE: { fetch: async () => Response.json({ ok: false }, { status: 200 }) },
    } as unknown as KnowgrphStorageWorkerEnv,
  )
  assert.equal(falsePositive.status, 503)
})

test('readiness budget covers the 12s downstream cold-start bound and retains an identity-probe tail', async () => {
  assert.equal(TRAVEL_MUTATION_READINESS_TIMEOUT_MS, 15_000)
  let clock = 1_000
  const calls: string[] = []
  const result = await probeTravelMutationTriggerReadiness({
    KNOWGRPH_TRAVEL_COMMERCE_API_TOKEN: token,
    SHARED_NODE_TRAVEL_BUNDLE_MAP_JSON: map,
    SHARED_NODE_TRAVEL_DISPATCH_TIMEOUT_MS: '12000',
    KNOWGRPH_TRAVEL_COMMERCE: {
      fetch: async (request: Request) => {
        calls.push(new URL(request.url).pathname)
        if (calls.length === 1) clock += 12_000
        return Response.json({ ok: true })
      },
    },
  }, () => clock)
  assert.equal(result.ok, true)
  assert.equal(result.downstream, 'ready')
  assert.deepEqual(calls, ['/readyz', '/v1/runtime'])
})
