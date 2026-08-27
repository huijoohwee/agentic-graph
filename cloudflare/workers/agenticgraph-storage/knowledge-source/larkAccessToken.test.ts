import assert from 'node:assert/strict'
import test from 'node:test'
import type { AgenticGraphStorageWorkerEnv } from '../contract'
import { StorageRelayOperation } from '../storage-relay/storageRelaySafety'
import { KnowledgeSourceError } from './knowledgeSourceContract'
import { createLarkAccessTokenSource } from './larkAccessToken'

const tenantEnv = (secret = 'tenant-secret'): AgenticGraphStorageWorkerEnv => ({
  DB: null,
  AGENTICGRAPH_STORAGE_LARK_IDENTITY_MODE: 'tenant-app',
  AGENTICGRAPH_STORAGE_LARK_APP_ID: 'tenant-app-id',
  AGENTICGRAPH_STORAGE_LARK_APP_SECRET: secret,
})

test('tenant access tokens are single-flight and refresh inside the 30-minute window', async () => {
  let nowMs = 0
  let fetchCalls = 0
  const operation = new StorageRelayOperation({
    fetcher: async (_input, init) => {
      fetchCalls += 1
      assert.equal(init?.method, 'POST')
      const body = JSON.parse(String(init?.body)) as { app_id: string; app_secret: string }
      assert.deepEqual(body, { app_id: 'tenant-app-id', app_secret: 'tenant-secret' })
      return Response.json({
        code: 0,
        tenant_access_token: `tenant-token-${fetchCalls}`,
        expire: 7_200,
      })
    },
  })
  try {
    const source = await createLarkAccessTokenSource(tenantEnv(), {
      now: () => nowMs,
      cache: false,
    })
    assert.deepEqual(await Promise.all([
      source.read(operation),
      source.read(operation),
      source.read(operation),
    ]), ['tenant-token-1', 'tenant-token-1', 'tenant-token-1'])
    assert.equal(fetchCalls, 1)
    nowMs = 89 * 60_000
    assert.equal(await source.read(operation), 'tenant-token-1')
    nowMs = 91 * 60_000
    assert.equal(await source.read(operation), 'tenant-token-2')
    assert.equal(fetchCalls, 2)
  } finally {
    operation.dispose()
  }
})

test('isolate cache reuses only pure token state and rotates with config', async () => {
  let fetchCalls = 0
  const fetcher = async (): Promise<Response> => {
    fetchCalls += 1
    return Response.json({ code: 0, tenant_access_token: `cached-token-${fetchCalls}`, expire: 7_200 })
  }
  const firstOperation = new StorageRelayOperation({ fetcher })
  const secondOperation = new StorageRelayOperation({ fetcher })
  const rotatedOperation = new StorageRelayOperation({ fetcher })
  try {
    const first = await createLarkAccessTokenSource(tenantEnv('cache-secret-one'))
    assert.equal(await first.read(firstOperation), 'cached-token-1')
    const sameConfigNewRequest = await createLarkAccessTokenSource(tenantEnv('cache-secret-one'))
    assert.notEqual(first, sameConfigNewRequest, 'request-scoped sources must not share in-flight promises')
    assert.equal(await sameConfigNewRequest.read(secondOperation), 'cached-token-1')
    const rotated = await createLarkAccessTokenSource(tenantEnv('cache-secret-two'))
    assert.equal(await rotated.read(rotatedOperation), 'cached-token-2')
    assert.equal(fetchCalls, 2)
  } finally {
    firstOperation.dispose()
    secondOperation.dispose()
    rotatedOperation.dispose()
  }
})

test('externally managed user OAuth token requires safe expiry metadata before any fetch', async () => {
  let fetchCalls = 0
  const operation = new StorageRelayOperation({
    fetcher: async () => {
      fetchCalls += 1
      throw new Error('must not fetch')
    },
  })
  try {
    await assert.rejects(createLarkAccessTokenSource({
      DB: null,
      AGENTICGRAPH_STORAGE_LARK_IDENTITY_MODE: 'user-oauth',
      AGENTICGRAPH_STORAGE_LARK_USER_ACCESS_TOKEN: 'externally-managed-token',
      AGENTICGRAPH_STORAGE_LARK_USER_ACCESS_TOKEN_EXPIRES_AT_MS: String(5 * 60_000),
    }, { now: () => 0 }), (error: unknown) => error instanceof KnowledgeSourceError
      && error.code === 'identity_not_available')
    assert.equal(fetchCalls, 0)
  } finally {
    operation.dispose()
  }
})

test('tenant token rate limits retry once and remain typed', async () => {
  let fetchCalls = 0
  const operation = new StorageRelayOperation({
    fetcher: async () => {
      fetchCalls += 1
      return new Response(null, { status: 429 })
    },
  })
  try {
    const source = await createLarkAccessTokenSource(tenantEnv(), { cache: false })
    await assert.rejects(source.read(operation), (error: unknown) => (
      error instanceof KnowledgeSourceError
      && error.code === 'rate_limited'
      && error.retryable
    ))
    assert.equal(fetchCalls, 2)
  } finally {
    operation.dispose()
  }
})
