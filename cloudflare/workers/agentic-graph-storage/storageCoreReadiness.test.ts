import assert from 'node:assert/strict'
import test from 'node:test'
import { createAgenticGraphStorageWorker } from './index'
import type { AgenticGraphStorageWorkerEnv } from './contract'
import type { D1StatementLike } from '../shared/d1'

const env = (): AgenticGraphStorageWorkerEnv => ({
  DB: { prepare: () => {
    const statement: D1StatementLike = { bind: () => statement, run: async () => ({}), all: async <T>() => ({
      results: ['auth_identities', 'auth_sessions', 'users', 'workspace_memberships'].map(name => ({ name }) as T),
    }) }
    return statement
  } },
  AGENTIC_OS_CANVAS_ROOM: { idFromName: () => 'room', get: () => ({ fetch: async () => new Response() }) },
  AGENTIC_OS_STORAGE_BLOB_BUCKET: { get: async () => null, put: async () => null },
  AGENTIC_OS_STORAGE_SIGNING_SECRET: 's'.repeat(48),
  AGENTIC_OS_STORAGE_ACCESS_ISSUER: 'https://storage.cloudflareaccess.com',
  AGENTIC_OS_STORAGE_ACCESS_AUDIENCE: '3'.repeat(64),
})
const request = (path = '/api/storage/readyz/core', method = 'GET') => new Request(`https://airvio.co${path}`, { method })

test('core readiness proves auth schema and core bindings while full travel readiness remains closed', async () => {
  const worker = createAgenticGraphStorageWorker()
  const response = await worker.fetch(request(), env())
  assert.equal(response.status, 200)
  const body = await response.json()
  assert.equal(body.scope, 'core')
  assert.equal(body.runtime, 'production')
  assert.equal(body.dependencies.authSchema, 'ready')
  assert.equal(JSON.stringify(body).includes('s'.repeat(48)), false)
  assert.equal((await worker.fetch(request('/api/storage/readyz'), env())).status, 503)
})
test('core readiness does not infer authentication or blob readiness from a D1 binding', async () => {
  for (const field of ['AGENTIC_OS_STORAGE_SIGNING_SECRET', 'AGENTIC_OS_STORAGE_ACCESS_AUDIENCE', 'AGENTIC_OS_STORAGE_BLOB_BUCKET'] as const) {
    const value = env()
    delete value[field]
    const response = await createAgenticGraphStorageWorker().fetch(request(), value)
    assert.equal(response.status, 503, field)
  }
  const value = env()
  value.DB = { prepare: () => { throw new Error('provider unavailable') } }
  const response = await createAgenticGraphStorageWorker().fetch(request(), value)
  assert.equal(response.status, 503)
  assert.equal((await response.json()).dependencies.authSchema, 'unavailable')
})
test('core readiness is read-only, supports HEAD, and identifies local runtime explicitly', async () => {
  const worker = createAgenticGraphStorageWorker()
  const head = await worker.fetch(request('/api/storage/readyz/core', 'HEAD'), env())
  assert.equal(head.status, 200)
  assert.equal(await head.text(), '')
  assert.equal((await worker.fetch(request('/api/storage/readyz/core', 'POST'), env())).status, 405)
  const local = await worker.fetch(request(), { ...env(), AGENTIC_OS_STORAGE_LOCAL_RUNTIME: 'true' })
  assert.equal((await local.json()).runtime, 'local')
})
