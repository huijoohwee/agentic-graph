import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { resolve } from 'node:path'
import { FakeAgenticGraphStorageD1Database } from '../../../../canvas/src/__tests__/helpers/fake-agentic-graph-storage-d1'
import { FakeAgenticGraphStorageR2Bucket } from '../../../../canvas/src/__tests__/helpers/fake-agentic-graph-storage-r2'
import { AGENTIC_OS_STORAGE_API_VERSION, AGENTIC_OS_STORAGE_SYNC_LIMITS, buildAgenticGraphStorageMediaWorkspace, hashAgenticGraphStorageContent, type AgenticGraphStorageWorkerEnv } from '../contract'
import { createAgenticGraphStorageWorker } from '../index'
import { readBoundedPullChangeRows } from '../storageSyncReadRows'
import { AGENTIC_OS_CHAT_RELAY_MAX_REQUEST_BYTES, AGENTIC_OS_CHAT_RELAY_MAX_RESPONSE_BYTES } from '../chatRelayBodyBounds'
import { AGENTIC_OS_STORAGE_DOCUMENT_READ_LIMITS } from '../storageDocumentReadBounds'
import { createFixture } from '../../../../canvas/src/__tests__/helpers/native-agentic-graph-storage-fixture'
import { AGENTIC_OS_STORAGE_DEFAULT_WORKSPACE_ID, buildAgenticGraphStorageDocPath,
  buildAgenticGraphStorageDefaultDocPath, buildAgenticGraphStorageLlmsPath,
  buildAgenticGraphStorageSourceFilesIndexPath } from '../contract'
const SESSION_TOKEN = 'production-storage-session-token'
const WORKSPACE_ID = 'workspace:storage-security'

const hashToken = async (value: string): Promise<string> => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
}

const seedSessionAndMembership = async (
  db: FakeAgenticGraphStorageD1Database,
  role: 'viewer' | 'editor' | 'owner' = 'owner',
): Promise<void> => {
  const nowIso = '2026-08-20T00:00:00.000Z'
  db.users.set('user:storage-security', {
    id: 'user:storage-security',
    email: 'storage-security@example.com',
    display_name: 'Storage Security',
    status: 'active',
    created_at: nowIso,
    updated_at: nowIso,
  })
  db.authSessions.set('session:storage-security', {
    id: 'session:storage-security',
    user_id: 'user:storage-security',
    session_hash: await hashToken(SESSION_TOKEN),
    expires_at: '2036-01-01T00:00:00.000Z',
    revoked_at: null,
    created_at: nowIso,
    updated_at: nowIso,
  })
  db.workspaceMemberships.set('membership:storage-security', {
    id: 'membership:storage-security',
    workspace_id: WORKSPACE_ID,
    user_id: 'user:storage-security',
    role,
    status: 'active',
    invited_by_user_id: null,
    created_at: nowIso,
    updated_at: nowIso,
  })
}

const createProductionEnv = (
  db: FakeAgenticGraphStorageD1Database,
  bucket = new FakeAgenticGraphStorageR2Bucket(),
): AgenticGraphStorageWorkerEnv => ({
  DB: db,
  AGENTIC_OS_STORAGE_BLOB_BUCKET: bucket,
  AGENTIC_OS_STORAGE_BLOB_MAX_BYTES: '32',
  AGENTIC_OS_STORAGE_LOCAL_RUNTIME: 'false',
  AGENTIC_OS_STORAGE_SIGNING_SECRET: 'storage-security-signing-secret-32-characters',
})

const sessionHeaders = (extra: HeadersInit = {}): Headers => new Headers({ authorization: `Bearer ${SESSION_TOKEN}`, ...Object.fromEntries(new Headers(extra).entries()) })

test('production structured sync authenticates before parsing request data', async () => {
  const worker = createAgenticGraphStorageWorker()
  const db = new FakeAgenticGraphStorageD1Database()
  const response = await worker.fetch(new Request('https://storage.example/api/storage/push', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{invalid-json',
  }), createProductionEnv(db))
  assert.equal(response.status, 401)
  assert.match(String((await response.json() as { error?: unknown }).error), /session token/i)
})

test('chat relay authenticates before oversized request data and bounds chunked proxy responses', async () => {
  const worker = createAgenticGraphStorageWorker()
  const db = new FakeAgenticGraphStorageD1Database()
  await seedSessionAndMembership(db)
  const env = {
    ...createProductionEnv(db),
    AGENTIC_OS_STORAGE_CHAT_PROXY_BASE_URL: 'https://chat-proxy.example',
  }
  const unauthenticated = await worker.fetch(new Request('https://storage.example/api/storage/chat/relay', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'content-length': String(AGENTIC_OS_CHAT_RELAY_MAX_REQUEST_BYTES + 1),
    },
    body: '{}',
  }), env)
  assert.equal(unauthenticated.status, 401)

  let proxyCancelled = false
  let proxyCalls = 0
  const previousFetch = globalThis.fetch
  globalThis.fetch = (async () => {
    proxyCalls += 1
    let chunkIndex = 0
    const chunkBytes = Math.floor(AGENTIC_OS_CHAT_RELAY_MAX_RESPONSE_BYTES / 2) + 1
    return new Response(new ReadableStream<Uint8Array>({
      pull(controller) {
        chunkIndex += 1
        controller.enqueue(new Uint8Array(chunkBytes))
      },
      cancel() { proxyCancelled = true },
    }), { status: 200, headers: { 'content-type': 'application/json' } })
  }) as typeof fetch
  try {
    const response = await worker.fetch(new Request('https://storage.example/api/storage/chat/relay', {
      method: 'POST',
      headers: sessionHeaders({ 'content-type': 'application/json' }),
      body: JSON.stringify({
        apiVersion: AGENTIC_OS_STORAGE_API_VERSION,
        workspaceId: WORKSPACE_ID,
        providerId: 'openai',
        authMode: 'byok',
        byokApiKey: 'test-byok-key',
        model: 'gpt-test',
        messages: [{ role: 'user', content: 'hello' }],
      }),
    }), env)
    assert.equal(response.status, 502)
    assert.equal(proxyCalls, 1)
    assert.equal(proxyCancelled, true)
    assert.doesNotMatch(await response.text(), /test-byok-key/)
  } finally {
    globalThis.fetch = previousFetch
  }
})

test('production REST storage rejects query-only sessions while canvas-room preserves its WebSocket token boundary', async () => {
  const worker = createAgenticGraphStorageWorker()
  const db = new FakeAgenticGraphStorageD1Database()
  await seedSessionAndMembership(db)
  const env = createProductionEnv(db) as AgenticGraphStorageWorkerEnv & Record<string, unknown>
  env.AGENTIC_OS_CANVAS_ROOM = {
    idFromName: (name: string) => name,
    get: () => ({ fetch: async () => new Response('room-ok', { status: 200 }) }),
  }
  const restQueryOnly = await worker.fetch(new Request(
    `https://storage.example/api/storage/export/${encodeURIComponent(WORKSPACE_ID)}?agentic_os_session_token=${SESSION_TOKEN}`,
  ), env)
  assert.equal(restQueryOnly.status, 401)
  const room = await worker.fetch(new Request(
    `https://storage.example/api/storage/canvas-room/${encodeURIComponent(WORKSPACE_ID)}/${encodeURIComponent('workspace:/docs/demo.md')}?agentic_os_session_token=${SESSION_TOKEN}`,
  ), env)
  assert.equal(room.status, 200)
  assert.equal(await room.text(), 'room-ok')
  db.users.get('user:storage-security')!.status = 'suspended'
  const suspended = await worker.fetch(new Request(
    `https://storage.example/api/storage/export/${encodeURIComponent(WORKSPACE_ID)}`,
    { headers: sessionHeaders() },
  ), env)
  assert.equal(suspended.status, 403)
})

test('production document and crawler reads require membership or an exact publication ACL', async () => {
  const worker = createAgenticGraphStorageWorker()
  const db = new FakeAgenticGraphStorageD1Database()
  await seedSessionAndMembership(db)
  db.documents.set('document:private', {
    id: 'document:private',
    workspace_id: WORKSPACE_ID,
    canonical_path: 'private/demo.md',
    title: 'Private demo',
    doc_type: 'note',
    lang: 'en-US',
    graph_id: null,
    source_kind: 'markdown',
    content_md: '# Private demo',
    content_hash: 'sha256:private',
    parser_version: '1.0.0',
    revision: 1,
    deleted: 0,
    created_at: '2026-08-20T00:00:00.000Z',
    updated_at: '2026-08-20T00:00:00.000Z',
  })
  const env = createProductionEnv(db)
  const docPath = `https://storage.example/api/storage/doc/${encodeURIComponent(WORKSPACE_ID)}/${encodeURIComponent('private/demo.md')}`
  assert.equal((await worker.fetch(new Request(docPath), env)).status, 404)
  const memberRead = await worker.fetch(new Request(docPath, { headers: sessionHeaders() }), env)
  assert.equal(memberRead.status, 200)
  assert.equal(memberRead.headers.get('cache-control'), 'private, no-store')
  assert.equal(memberRead.headers.get('x-robots-tag'), 'noindex, nofollow')
  assert.equal(await memberRead.text(), '# Private demo')
  const crossTenantDoc = await worker.fetch(new Request(
    `https://storage.example/api/storage/doc/workspace%3Aother/${encodeURIComponent('private/demo.md')}`,
    { headers: sessionHeaders() },
  ), env)
  assert.equal(crossTenantDoc.status, 403)
  const anonymousPrivateCrawler = await worker.fetch(new Request(
    `https://storage.example/api/storage/source-files/${encodeURIComponent(WORKSPACE_ID)}`,
  ), env)
  assert.equal(anonymousPrivateCrawler.status, 200)
  assert.doesNotMatch(await anonymousPrivateCrawler.text(), /Private demo/)
  const memberCrawlerRead = await worker.fetch(new Request(
    `https://storage.example/api/storage/source-files/${encodeURIComponent(WORKSPACE_ID)}`,
    { headers: sessionHeaders() },
  ), env)
  assert.equal(memberCrawlerRead.status, 200)
  assert.equal(memberCrawlerRead.headers.get('cache-control'), 'private, no-store')
  assert.equal(memberCrawlerRead.headers.get('x-robots-tag'), 'noindex, nofollow')
  assert.equal((await worker.fetch(new Request(
    'https://storage.example/api/storage/source-files/workspace%3Aother',
    { headers: sessionHeaders() },
  ), env)).status, 403)
  const publish = await worker.fetch(new Request('https://storage.example/api/storage/publications', {
    method: 'POST',
    headers: sessionHeaders({ 'content-type': 'application/json' }),
    body: JSON.stringify({ workspaceId: WORKSPACE_ID, documentId: 'document:private', action: 'publish' }),
  }), env)
  assert.equal(publish.status, 200)
  const publicDoc = await worker.fetch(new Request(docPath), env)
  assert.equal(publicDoc.status, 200)
  assert.equal(await publicDoc.text(), '# Private demo')
  const publicCrawler = await worker.fetch(new Request(
    `https://storage.example/api/storage/source-files/${encodeURIComponent(WORKSPACE_ID)}`,
  ), env)
  assert.equal(publicCrawler.status, 200)
  assert.match(await publicCrawler.text(), /Private demo/)
  db.documents.get('document:private')!.revision = 2
  assert.equal((await worker.fetch(new Request(docPath), env)).status, 404)
  const revoke = await worker.fetch(new Request('https://storage.example/api/storage/publications', {
    method: 'POST',
    headers: sessionHeaders({ 'content-type': 'application/json' }),
    body: JSON.stringify({ workspaceId: WORKSPACE_ID, documentId: 'document:private', action: 'revoke' }),
  }), env)
  assert.equal(revoke.status, 200)
})

test('anonymous indexing requires a current publication while private reads remain uncacheable', async () => {
  const fixture = await createFixture(undefined, { workspaceId: AGENTIC_OS_STORAGE_DEFAULT_WORKSPACE_ID })
  const id = 'published-source', draftId = 'private-draft', canonicalPath = `${id}.md`
  const documentPaths = [buildAgenticGraphStorageDefaultDocPath(canonicalPath),
    buildAgenticGraphStorageDocPath(fixture.workspaceId, canonicalPath)]
  const indexPaths = [buildAgenticGraphStorageSourceFilesIndexPath(),
    buildAgenticGraphStorageSourceFilesIndexPath(fixture.workspaceId),
    buildAgenticGraphStorageLlmsPath(), buildAgenticGraphStorageLlmsPath(fixture.workspaceId)]
  const markdown = '# Published source'
  const assertAnonymousVisibility = async (visible: boolean) => {
    for (const path of documentPaths) {
      const response = await fixture.request(path)
      assert.equal(response.status, visible ? 200 : 404, path)
      if (visible) {
        assert.equal(response.headers.get('x-robots-tag'), 'all', path)
        assert.equal(response.headers.get('cache-control'), 'private, no-store', path)
        assert.equal(await response.text(), markdown, path)
      }
    }
    for (const path of indexPaths) {
      const response = await fixture.request(path)
      assert.equal(response.status, 200, path)
      assert.equal(response.headers.get('x-robots-tag'), 'all', path)
      assert.equal(response.headers.get('cache-control'), 'private, no-store', path)
      const text = await response.text()
      assert.equal(text.includes(canonicalPath), visible, path)
      assert.equal(text.includes(`${draftId}.md`), false, path)
    }
  }
  const publish = async () => {
    const identity = fixture.identity(id)
    const response = await fixture.publication(id, 'publish', {
      expectedRevision: identity.revision, expectedContentHash: identity.contentHash,
    })
    assert.equal(response.status, 200, await response.text())
  }
  try {
    fixture.document(id, markdown); fixture.document(draftId, '# Private draft')
    await assertAnonymousVisibility(false)
    await publish()
    await assertAnonymousVisibility(true)
    for (const path of [...documentPaths, ...indexPaths]) {
      const response = await fixture.request(path, { headers: { authorization: `Bearer ${fixture.auth.sessionToken}` } })
      assert.equal(response.status, 200, path)
      assert.equal(response.headers.get('x-robots-tag'), 'noindex, nofollow', path)
      assert.equal(response.headers.get('cache-control'), 'private, no-store', path)
      await response.text()
    }
    fixture.sql.prepare('UPDATE documents SET content_hash = ? WHERE id = ?').run('hash:changed', id)
    await assertAnonymousVisibility(false)
    await publish()
    await assertAnonymousVisibility(true)
    fixture.sql.prepare('UPDATE documents SET revision = revision + 1 WHERE id = ?').run(id)
    await assertAnonymousVisibility(false)
    await publish()
    const revoke = await fixture.publication(id, 'revoke')
    assert.equal(revoke.status, 200, await revoke.text())
    await assertAnonymousVisibility(false)
  } finally { await fixture.close() }
})

test('authorized document reads stream large content and accumulated chunks in bounded segments', async () => {
  const worker = createAgenticGraphStorageWorker()
  const db = new FakeAgenticGraphStorageD1Database()
  await seedSessionAndMembership(db)
  const documentId = 'document:bounded-read'
  const canonicalPath = 'private/bounded-read.md'
  db.documents.set(documentId, {
    id: documentId,
    workspace_id: WORKSPACE_ID,
    canonical_path: canonicalPath,
    content_md: 'x'.repeat(AGENTIC_OS_STORAGE_DOCUMENT_READ_LIMITS.maxDocumentBytes + 1),
    content_hash: 'sha256:large-document',
    revision: 1,
    deleted: 0,
  })
  const env = createProductionEnv(db)
  const url = `https://storage.example/api/storage/doc/${encodeURIComponent(WORKSPACE_ID)}/${encodeURIComponent(canonicalPath)}`
  const oversized = await worker.fetch(new Request(url, { headers: sessionHeaders() }), env)
  assert.equal(oversized.status, 200)
  assert.equal((await oversized.text()).length, AGENTIC_OS_STORAGE_DOCUMENT_READ_LIMITS.maxDocumentBytes + 1)

  db.documents.get(documentId)!.content_md = ''
  for (let index = 0; index <= AGENTIC_OS_STORAGE_DOCUMENT_READ_LIMITS.maxDocumentChunks; index += 1) {
    db.documentChunks.set(`chunk:${index}`, {
      id: `chunk:${index}`,
      document_id: documentId,
      workspace_id: WORKSPACE_ID,
      chunk_key: `section-${index}`,
      chunk_order: index,
      markdown: `chunk ${index}`,
      content_hash: `sha256:${index}`,
      updated_at: '2026-08-20T00:00:00.000Z',
    })
  }
  const tooManyChunks = await worker.fetch(new Request(url, { headers: sessionHeaders() }), env)
  assert.equal(tooManyChunks.status, 200)
  const chunkedText = await tooManyChunks.text()
  assert.match(chunkedText, /^chunk 0\n\nchunk 1/)
  assert.match(chunkedText, /chunk 100$/)
})

test('storage result byte aggregate fails before any result row is materialized', async () => {
  let materialized = false
  const db = {
    prepare(sql: string) {
      const statement = {
        bind() { return statement },
        async all() {
          const normalized = sql.toLowerCase().replace(/\s+/g, ' ')
          if (normalized.includes('select count(*)') && normalized.includes('from documents')) return {
            results: [{ row_count: 1, stored_bytes: AGENTIC_OS_STORAGE_SYNC_LIMITS.maxResponseBytes }],
          }
          if (normalized.includes('select count(*)')) return { results: [{ row_count: 0, stored_bytes: 0 }] }
          if (normalized.includes('select *')) materialized = true
          return { results: [] }
        },
        async run() { return { success: true } },
      }
      return statement
    },
  }
  const result = await readBoundedPullChangeRows(db as never, WORKSPACE_ID, null, {
    maxRows: AGENTIC_OS_STORAGE_SYNC_LIMITS.maxResultRows,
    maxStoredResultBytes: AGENTIC_OS_STORAGE_SYNC_LIMITS.maxResponseBytes - 65_536,
  })
  assert.equal(result.limitExceeded, 'stored_result_bytes')
  assert.equal(materialized, false)
})

test('production blob reads and writes require a role-bound workspace session and bounded stream', async () => {
  const worker = createAgenticGraphStorageWorker()
  const db = new FakeAgenticGraphStorageD1Database()
  const bucket = new FakeAgenticGraphStorageR2Bucket()
  await seedSessionAndMembership(db, 'viewer')
  const env = createProductionEnv(db, bucket)
  const path = `https://storage.example/api/storage/blob/${encodeURIComponent(WORKSPACE_ID)}/generated/demo.bin`

  const viewerWrite = await worker.fetch(new Request(path, {
    method: 'POST',
    headers: sessionHeaders({ 'content-type': 'application/octet-stream' }),
    body: 'viewer-must-not-write',
  }), env)
  assert.equal(viewerWrite.status, 403)
  assert.equal(bucket.objects.size, 0)

  db.workspaceMemberships.get('membership:storage-security')!.role = 'owner'
  const oversized = await worker.fetch(new Request(path, {
    method: 'POST',
    headers: sessionHeaders({ 'content-type': 'application/octet-stream' }),
    body: 'x'.repeat(33),
  }), env)
  assert.equal(oversized.status, 413)
  assert.equal(bucket.objects.size, 0)
  const write = await worker.fetch(new Request(path, {
    method: 'POST',
    headers: sessionHeaders({ 'content-type': 'application/octet-stream' }),
    body: 'bounded-blob',
  }), env)
  assert.equal(write.status, 200)
  assert.equal(bucket.objects.size, 1)
  assert.equal((await worker.fetch(new Request(path), env)).status, 401)
  const read = await worker.fetch(new Request(path, { headers: sessionHeaders() }), env)
  assert.equal(read.status, 200)
  assert.equal(await read.text(), 'bounded-blob')
  const crossTenant = await worker.fetch(new Request(
    'https://storage.example/api/storage/blob/workspace%3Aother/generated/demo.bin',
    { headers: sessionHeaders() },
  ), env)
  assert.equal(crossTenant.status, 403)
})
test('production media uses signed workspace capabilities and R2 ownership metadata', async () => {
  const worker = createAgenticGraphStorageWorker()
  const db = new FakeAgenticGraphStorageD1Database()
  const bucket = new FakeAgenticGraphStorageR2Bucket()
  await seedSessionAndMembership(db)
  const env = createProductionEnv(db, bucket)
  const { key, prefix } = await buildAgenticGraphStorageMediaWorkspace(WORKSPACE_ID)
  const runId = `${key}-run-1`, objectKey = `${prefix}/runs/${key}-run-1/stage-1/shot-1.mp4`
  const rawMediaPath = `https://storage.example/api/storage/media/${objectKey}`
  const forgedCapability = await worker.fetch(new Request(`${rawMediaPath}?agentic_os_media_capability=forged.token`), env)
  assert.equal(forgedCapability.status, 403)
  const mint = async (operation: 'read' | 'write') => {
    const response = await worker.fetch(new Request('https://storage.example/api/storage/media-capabilities', {
      method: 'POST',
      headers: sessionHeaders({ 'content-type': 'application/json' }),
      body: JSON.stringify({
        workspaceId: WORKSPACE_ID,
        objectKey: objectKey,
        operation,
        ttlSeconds: 300,
      }),
    }), env)
    assert.equal(response.status, 200)
    return await response.json() as { token: string; urlPath: string }
  }
  const writeCapability = await mint('write')
  const authenticatedRawWrite = await worker.fetch(new Request(rawMediaPath, {
    method: 'PUT',
    headers: { 'content-type': 'video/mp4', 'x-agentic-graph-media-capability': writeCapability.token },
    body: 'workspace-owned-media',
  }), env)
  assert.equal(authenticatedRawWrite.status, 200)
  assert.equal(bucket.objects.size, 1)
  const stored = bucket.objects.get(objectKey)
  assert.equal(stored?.customMetadata.agenticGraphWorkspaceId, WORKSPACE_ID)
  const readCapability = await mint('read')
  const read = await worker.fetch(new Request(`https://storage.example${readCapability.urlPath}`), env)
  assert.equal(read.status, 200)
  assert.equal(await read.text(), 'workspace-owned-media')
  const persist = await worker.fetch(new Request(
    'https://storage.example/api/storage/media/assets',
    {
      method: 'POST',
      headers: sessionHeaders({ 'content-type': 'application/json' }),
      body: JSON.stringify({
        apiVersion: '2026-05-04', workspaceId: WORKSPACE_ID,
        objectKey: objectKey,
        runId, stageId: 'stage-1', shotId: 'shot-1', kind: 'video',
        durableR2Url: `/api/storage/media/${objectKey}`,
        contentHash: 'sha256:workspace-owned-media', mediaType: 'video/mp4',
        provenance: { source: 'test' }, version: 1,
        presignedUrl: 'https://attacker.example/forged',
      }),
    },
  ), env)
  assert.equal(persist.status, 200)
  const persisted = await persist.json() as { access: { url: string } }
  assert.match(persisted.access.url, /^https:\/\/storage\.example\/api\/storage\/media\/.+agentic_os_media_capability=/)
  assert.doesNotMatch(persisted.access.url, /attacker\.example/)
  const malformedAssetMutation = await worker.fetch(new Request(
    'https://storage.example/api/storage/media/assets',
    {
      method: 'POST',
      headers: sessionHeaders({ 'content-type': 'application/json' }),
      body: '{invalid-json',
    },
  ), env)
  assert.equal(malformedAssetMutation.status, 400)
  assert.equal(bucket.objects.size, 1)
  const memberList = await worker.fetch(new Request(
    `https://storage.example/api/storage/media/assets?workspaceId=${encodeURIComponent(WORKSPACE_ID)}`,
    { headers: sessionHeaders() },
  ), env)
  assert.equal(memberList.status, 200)
  const crossTenantList = await worker.fetch(new Request(
    'https://storage.example/api/storage/media/assets?workspaceId=workspace%3Aother',
    { headers: sessionHeaders() },
  ), env)
  assert.equal(crossTenantList.status, 403)
})
test('production storage topology disables workers.dev and preview aliases', () => {
  const config = readFileSync(resolve(process.cwd(), 'cloudflare/workers/agentic-graph-storage/wrangler.toml'), 'utf8')
  assert.match(config, /^workers_dev\s*=\s*false$/m)
  assert.match(config, /^preview_urls\s*=\s*false$/m)
  assert.match(config, /^AGENTIC_OS_STORAGE_LOCAL_RUNTIME\s*=\s*"false"$/m)
  assert.doesNotMatch(config, /^workers_dev\s*=\s*true$/m)
})
