import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  assertDevStorageRelayRequest,
  assertLoopbackStorageRelayRequest,
  authorizeStorageRelayRequest,
  readStorageRelayBytes,
  StorageRelayByteBudget,
  StorageRelayError,
  StorageRelayOperation,
  storageRelayErrorResponse,
  type StorageRelayAuthHooks,
} from './storageRelaySafety'
import { StorageRelayOpaqueTokenCodec } from './storageRelayOpaqueToken'

const enabledEnv = {
  AGENTIC_OS_STORAGE_DEV_REMOTE_RELAY_ENABLED: 'true',
}

test('Dev relay guard requires the explicit sentinel and loopback request and Origin', () => {
  assert.throws(
    () => assertDevStorageRelayRequest(new Request('http://localhost/relay'), {}),
    (error: unknown) => error instanceof StorageRelayError
      && error.code === 'membership_forbidden',
  )
  assert.throws(
    () => assertDevStorageRelayRequest(
      new Request('https://storage.example.com/relay'),
      enabledEnv,
    ),
    (error: unknown) => error instanceof StorageRelayError
      && error.code === 'membership_forbidden',
  )
  assert.throws(
    () => assertDevStorageRelayRequest(
      new Request('http://127.0.0.1/relay', {
        headers: { origin: 'https://attacker.example' },
      }),
      enabledEnv,
    ),
    (error: unknown) => error instanceof StorageRelayError
      && error.code === 'membership_forbidden',
  )
  assert.doesNotThrow(() => assertDevStorageRelayRequest(
    new Request('http://[::1]/relay', {
      headers: { origin: 'http://localhost:5173' },
    }),
    enabledEnv,
  ))
})

test('local runtime sentinel explicitly admits Wrangler route rewriting', () => {
  const rewrittenRequest = new Request('https://airvio.co/api/storage/relay/capabilities')
  assert.throws(
    () => assertLoopbackStorageRelayRequest(rewrittenRequest),
    (error: unknown) => error instanceof StorageRelayError
      && error.code === 'membership_forbidden',
  )
  assert.doesNotThrow(() => assertLoopbackStorageRelayRequest(rewrittenRequest, {
    AGENTIC_OS_STORAGE_LOCAL_RUNTIME: 'true',
  }))

  assert.throws(
    () => assertLoopbackStorageRelayRequest(new Request(rewrittenRequest, {
      headers: { origin: 'https://attacker.example' },
    }), {
      AGENTIC_OS_STORAGE_LOCAL_RUNTIME: 'true',
    }),
    (error: unknown) => error instanceof StorageRelayError
      && error.code === 'membership_forbidden',
  )
})

test('authorization uses bearer-only active workspace roles', async () => {
  const request = new Request('http://localhost/relay?kg_session_token=forbidden', {
    headers: { authorization: 'Bearer session-token' },
  })
  let observedToken = ''
  const hooks: StorageRelayAuthHooks<{ userId: string }> = {
    async authenticate(args) {
      observedToken = args.bearerToken
      return { userId: 'user-1' }
    },
    async authorizeMembership() {
      return { role: 'viewer', status: 'active' }
    },
  }
  const controller = new AbortController()
  await authorizeStorageRelayRequest({
    request,
    workspaceId: 'workspace-1',
    access: 'read',
    hooks,
    signal: controller.signal,
  })
  assert.equal(observedToken, 'session-token')
  await assert.rejects(
    authorizeStorageRelayRequest({
      request,
      workspaceId: 'workspace-1',
      access: 'write',
      hooks,
      signal: controller.signal,
    }),
    (error: unknown) => error instanceof StorageRelayError
      && error.code === 'membership_forbidden',
  )
})

test('stream counter rejects an overflow even without Content-Length', async () => {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array(6))
      controller.enqueue(new Uint8Array(6))
      controller.close()
    },
  })
  await assert.rejects(
    readStorageRelayBytes(body, new Headers(), new StorageRelayByteBudget(10)),
    (error: unknown) => error instanceof StorageRelayError
      && error.code === 'limit_exceeded',
  )
})

test('one operation deadline aborts every injected fetch without retrying', async () => {
  let fetchCount = 0
  const operation = new StorageRelayOperation({
    timeoutMs: 5,
    fetcher: async (_input, init) => {
      fetchCount += 1
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(new DOMException('aborted', 'AbortError'))
        }, { once: true })
      })
    },
  })
  try {
    await assert.rejects(
      operation.fetch('https://provider.example'),
      (error: unknown) => error instanceof StorageRelayError
        && error.code === 'timeout',
    )
    assert.equal(fetchCount, 1)
  } finally {
    operation.dispose()
  }
})

test('opaque entry tokens hide provider IDs and reject tampering or rebinding', async () => {
  const codec = new StorageRelayOpaqueTokenCodec({
    secret: 'test-secret-with-at-least-sixteen-characters',
    now: () => 1_000,
  })
  const binding = {
    purpose: 'entry' as const,
    workspaceId: 'workspace-1',
    providerId: 'google-workspace',
    rootKey: 'workspace-root',
  }
  const token = await codec.seal({
    binding,
    payload: { resourceId: 'provider-resource-secret' },
  })
  assert.equal(token.includes('provider-resource-secret'), false)
  assert.deepEqual(await codec.open({ token, binding }), {
    resourceId: 'provider-resource-secret',
  })
  const lastCharacter = token.at(-1)
  const tampered = `${token.slice(0, -1)}${lastCharacter === 'A' ? 'B' : 'A'}`
  await assert.rejects(
    codec.open({ token: tampered, binding }),
    (error: unknown) => error instanceof StorageRelayError
      && error.code === 'invalid_request',
  )
  await assert.rejects(
    codec.open({
      token,
      binding: { ...binding, workspaceId: 'workspace-2' },
    }),
    (error: unknown) => error instanceof StorageRelayError
      && error.code === 'invalid_request',
  )
})

test('error responses never serialize thrown messages', async () => {
  const response = storageRelayErrorResponse(
    new Error('Bearer provider-secret must never escape'),
    'relay:test',
  )
  const text = await response.text()
  assert.equal(text.includes('provider-secret'), false)
  assert.deepEqual(JSON.parse(text), {
    ok: false,
    apiVersion: 'agentic-graph-storage-relay/v1',
    code: 'upstream_unavailable',
    retryable: true,
    operationId: 'relay:test',
  })
})
