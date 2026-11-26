import assert from 'node:assert/strict'
import test from 'node:test'
import { createAgenticGraphStorageWorker } from './index'
import type { AgenticGraphStorageWorkerEnv } from './contract'
import type { D1StatementLike } from '../shared/d1'
import { D1_BLOB_CHUNK_BYTES, deleteD1Blob, readD1Blob, readD1BlobRequest, writeD1Blob } from './d1BlobStore'
import type { D1DatabaseLike, D1StatementLike as BlobStatementLike } from './db'

const authTables = ['auth_identities', 'auth_sessions', 'users', 'workspace_memberships']
const blobColumns: Record<string, string[]> = {
  agentic_graph_d1_blob_quota: ['id', 'used_bytes', 'limit_bytes'],
  agentic_graph_d1_blob_objects: ['object_key', 'content_type', 'content_hash', 'custom_metadata_json', 'size_bytes', 'etag', 'updated_at'],
  agentic_graph_d1_blob_chunks: ['object_key', 'chunk_index', 'body'],
}

const createDb = (withBlobSchema = true, broken = false) => {
  const statement = (sql: string, values: unknown[] = []): D1StatementLike => ({
    bind: (...next) => statement(sql, next),
    run: async () => ({}),
    all: async <T>() => {
      if (broken) throw new Error('provider unavailable')
      let results: unknown[] = []
      const pragma = sql.match(/^PRAGMA table_info\(([^)]+)\)/)
      if (pragma && withBlobSchema) results = (blobColumns[pragma[1]] || []).map(name => ({ name }))
      else if (sql.includes('sqlite_master')) results = [...authTables, 'storage_oauth_budget', 'storage_oauth_challenges']
        .filter(name => values.includes(name)).map(name => ({ name }))
      else if (sql.includes('SELECT used_bytes, limit_bytes')) results = withBlobSchema ? [{ used_bytes: 0, limit_bytes: 67108864 }] : []
      else if (sql.includes('SUM(size_bytes)')) results = withBlobSchema ? [{ used_bytes: 0 }] : []
      return { results: results as T[] }
    },
  })
  return { prepare: (sql: string) => statement(sql) }
}

type TestEnv = AgenticGraphStorageWorkerEnv
const env = (): TestEnv => ({
  DB: createDb(),
  AGENTIC_OS_CANVAS_ROOM: { idFromName: () => 'room', get: () => ({ fetch: async () => new Response() }) },
  AGENTIC_OS_STORAGE_SIGNING_SECRET: 's'.repeat(48),
  AGENTIC_OS_STORAGE_ACCESS_ISSUER: 'https://storage.cloudflareaccess.com',
  AGENTIC_OS_STORAGE_ACCESS_AUDIENCE: '3'.repeat(64),
})
const request = (path = '/api/storage/readyz/core', method = 'GET') => new Request(`https://airvio.co${path}`, { method })

test('core readiness proves auth schema and D1 blob schema without R2', async () => {
  const worker = createAgenticGraphStorageWorker()
  const response = await worker.fetch(request(), env())
  assert.equal(response.status, 200)
  const body = await response.json()
  assert.equal(body.scope, 'core')
  assert.equal(body.runtime, 'production')
  assert.equal(body.dependencies.authSchema, 'ready')
  assert.equal(body.dependencies.blobStorage, 'ready')
  assert.equal(JSON.stringify(body).includes('s'.repeat(48)), false)
  assert.equal((await worker.fetch(request('/api/storage/readyz'), env())).status, 503)
})

test('core readiness fails closed when auth or D1 blob schema is missing', async () => {
  const worker = createAgenticGraphStorageWorker()
  const noSecret = env()
  delete noSecret.AGENTIC_OS_STORAGE_SIGNING_SECRET
  assert.equal((await worker.fetch(request(), noSecret)).status, 503)

  const noD1 = env()
  noD1.DB = undefined
  assert.equal((await worker.fetch(request(), noD1)).status, 503)

  const noBlobSchema = { ...env(), DB: createDb(false) }
  const unavailable = await worker.fetch(request(), noBlobSchema)
  assert.equal(unavailable.status, 503)
  assert.ok((await unavailable.json()).reasons.includes('storage-blob-d1-quota-or-schema-unavailable'))

  const providerFailure = { ...env(), DB: createDb(false, true) }
  assert.equal((await worker.fetch(request(), providerFailure)).status, 503)
  assert.equal((await (await worker.fetch(request(), providerFailure)).json()).dependencies.authSchema, 'unavailable')
})

test('D1 blob quota readiness requires the exact schema and a matching usage counter', async () => {
  const mismatch = env()
  mismatch.DB = { prepare: sql => {
    const base = createDb()
    const statement = base.prepare(sql)
    return sql.includes('SUM(size_bytes)') ? { ...statement, all: async () => ({ results: [{ used_bytes: 1 }] }) } : statement
  } }
  const response = await createAgenticGraphStorageWorker().fetch(request(), mismatch)
  assert.equal(response.status, 503)
  assert.equal((await response.json()).dependencies.blobStorage, 'blocked')
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

test('OAuth readiness requires both budget and one-use challenge tables', async () => {
  const value = { ...env(), AGENTIC_OS_STORAGE_BROWSER_AUTH_MODE: 'oauth',
    AGENTIC_OS_STORAGE_OAUTH_ORIGINS: '["https://airvio.co"]',
    AGENTIC_OS_STORAGE_GITHUB_APP_CLIENT_ID: 'Iv1.testclient',
    AGENTIC_OS_STORAGE_GITHUB_APP_CLIENT_SECRET: 'test-client-secret' }
  const worker = createAgenticGraphStorageWorker()
  assert.equal((await worker.fetch(request(), value)).status, 200)
})

type BlobObjectRow = { object_key: string; content_type: string; content_hash: string | null; custom_metadata_json: string; size_bytes: number; etag: string; updated_at: string }

const memoryBlobDb = () => {
  let objects = new Map<string, BlobObjectRow>()
  let chunks = new Map<string, Uint8Array[]>()
  let usedBytes = 0
  const prepare = (sql: string) => {
    let values: unknown[] = []
    const statement: BlobStatementLike & { sql: string; values: unknown[] } = {
      sql,
      get values() { return values },
      bind: (...next) => { values = next; return statement },
      run: async () => ({}),
      all: async <T>() => {
        const key = String(values[0] || '')
        const object = objects.get(key)
        if (!object) return { results: [] }
        const bodyChunks = chunks.get(key) || []
        const rows = sql.includes('LEFT JOIN agentic_graph_d1_blob_chunks')
          ? (bodyChunks.length ? bodyChunks.map((body, chunk_index) => ({ ...object, chunk_index, body }))
            : [{ ...object, chunk_index: null, body: null }])
          : [{ ...object, chunk_index: null, body: null }]
        return { results: rows as T[] }
      },
    }
    return statement
  }
  const db = {
    prepare,
    batch: async (statements: BlobStatementLike[]) => {
      const nextObjects = new Map(objects), nextChunks = new Map(chunks)
      let nextUsed = usedBytes
      for (const statement of statements) {
        const { sql, values } = statement as BlobStatementLike & { sql: string; values: unknown[] }
        const key = String(values[0] || '')
        if (sql.startsWith('DELETE FROM agentic_graph_d1_blob_chunks')) nextChunks.delete(key)
        else if (sql.startsWith('DELETE FROM agentic_graph_d1_blob_objects')) {
          const old = nextObjects.get(key)
          if (old) nextUsed -= old.size_bytes
          nextObjects.delete(key)
        } else if (sql.includes('INSERT INTO agentic_graph_d1_blob_objects')) {
          const row = { object_key: key, content_type: String(values[1]), content_hash: values[2] as string | null,
            custom_metadata_json: String(values[3]), size_bytes: Number(values[4]), etag: String(values[5]), updated_at: String(values[6]) }
          if (nextUsed + row.size_bytes > 67108864) throw new Error('graph_d1_blob_quota_exceeded')
          nextUsed += row.size_bytes
          nextObjects.set(key, row)
        } else if (sql.includes('INSERT INTO agentic_graph_d1_blob_chunks')) {
          const index = Number(values[1]), bytes = values[2] as Uint8Array
          const list = nextChunks.get(key) || []
          list[index] = bytes
          nextChunks.set(key, list)
        }
      }
      objects = nextObjects
      chunks = nextChunks
      usedBytes = nextUsed
      return statements.map(() => ({}))
    },
  }
  return { db: db as unknown as D1DatabaseLike, used: () => usedBytes, chunks: (key: string) => chunks.get(key) || [] }
}

test('D1 blob writes split at 1 MiB and read back exact bytes and digest', async () => {
  const store = memoryBlobDb(), body = new Uint8Array(D1_BLOB_CHUNK_BYTES + 3)
  body.forEach((_, index) => { body[index] = index % 251 })
  const saved = await writeD1Blob({ db: store.db, objectKey: 'workspace/file.bin', body,
    contentType: 'application/octet-stream', contentHash: null,
    customMetadata: { agenticGraphWorkspaceId: 'workspace' }, nowMs: 1_800_000_000_000 })
  assert.equal(store.chunks('workspace/file.bin').length, 2)
  assert.equal(store.chunks('workspace/file.bin')[0].byteLength, D1_BLOB_CHUNK_BYTES)
  assert.equal(store.used(), body.byteLength)
  const read = await readD1Blob(store.db, 'workspace/file.bin')
  assert.equal(read?.object.etag, saved.etag)
  assert.equal(read?.object.custom_metadata.agenticGraphWorkspaceId, 'workspace')
  assert.deepEqual(read?.body, body)
})

test('same-key replacement is atomic and adjusts quota by the new size', async () => {
  const store = memoryBlobDb()
  await writeD1Blob({ db: store.db, objectKey: 'workspace/file.bin', body: new Uint8Array([1, 2, 3]), contentType: 'x/test', contentHash: null })
  await writeD1Blob({ db: store.db, objectKey: 'workspace/file.bin', body: new Uint8Array([4]), contentType: 'x/test', contentHash: null })
  assert.equal(store.used(), 1)
  assert.deepEqual((await readD1Blob(store.db, 'workspace/file.bin'))?.body, new Uint8Array([4]))
  await deleteD1Blob(store.db, 'workspace/file.bin')
  assert.equal(store.used(), 0)
  assert.equal(await readD1Blob(store.db, 'workspace/file.bin'), null)
})

test('D1 blob requests measure unknown lengths within the bound and reject mismatches or overflow', async () => {
  const measured = await readD1BlobRequest(new Request('https://airvio.co/upload', { method: 'PUT', body: 'abc' }))
  assert.equal(measured.ok, true)
  if (measured.ok) assert.deepEqual(measured.body, new Uint8Array([97, 98, 99]))
  const mismatch = await readD1BlobRequest(new Request('https://airvio.co/upload', { method: 'PUT',
    headers: { 'content-length': '4' }, body: 'abc' }))
  assert.equal(mismatch.ok, false)
  const valid = await readD1BlobRequest(new Request('https://airvio.co/upload', { method: 'PUT',
    headers: { 'content-length': '3' }, body: 'abc' }))
  assert.equal(valid.ok, true)
  if (valid.ok) assert.deepEqual(valid.body, new Uint8Array([97, 98, 99]))
  const oversized = await readD1BlobRequest(new Request('https://airvio.co/upload', { method: 'PUT', body: 'abc' }), 2)
  assert.equal(oversized.ok, false)
  if (!oversized.ok) assert.equal(oversized.reason, 'too-large')
})
