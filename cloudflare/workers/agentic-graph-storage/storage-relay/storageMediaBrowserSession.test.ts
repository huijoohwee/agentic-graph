import assert from 'node:assert/strict'
import test from 'node:test'
import { createFakeAgenticGraphStorageBrowserSession } from '../../../../canvas/src/__tests__/helpers/fake-agentic-graph-storage-browser-session'
import { buildAgenticGraphStorageMediaWorkspace } from '../../../../canvas/src/lib/storage/agentic-graph-storage-media-object-key'
import { AGENTIC_OS_STORAGE_API_VERSION, buildAgenticGraphStorageMediaPath } from '../contract'
import { createAgenticGraphStorageWorker } from '../index'
import { authenticateAgenticGraphStorageSyncRequest } from '../storageSyncSecurity'

const WORKSPACE = 'workspace:browser-media-security'
const CAPABILITY = '/api/storage/media-capabilities'
const ASSETS = '/api/storage/media/assets'
const createFixture = async () => {
  const fixture = await createFakeAgenticGraphStorageBrowserSession(WORKSPACE, { role: 'owner' })
  const { key, prefix } = await buildAgenticGraphStorageMediaWorkspace(WORKSPACE)
  return { ...fixture, runId: `${key}-browser-session`, objectKey: `${prefix}/runs/${key}-browser-session/image/artifact.png` }
}
type Fixture = Awaited<ReturnType<typeof createFixture>>
const request = (fixture: Fixture, path: string, init: RequestInit = {}) => fixture.fetch(
  new URL(path, fixture.origin), { ...init, credentials: 'same-origin' },
)
const mint = (fixture: Fixture, operation: 'read' | 'write' = 'write', workspaceId = WORKSPACE) =>
  request(fixture, CAPABILITY, { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ workspaceId, objectKey: fixture.objectKey, operation, ttlSeconds: 300 }) })

test('browser media session persists catalog metadata and replays signed bytes through the real Worker', async () => {
  const fixture = await createFixture()
  const session = await request(fixture, `/api/storage/auth/session?workspace_id=${encodeURIComponent(WORKSPACE)}`)
  assert.equal(session.status, 200, 'Cookie authenticates the real browser session before media is exercised')
  const write = await mint(fixture)
  assert.equal(write.status, 200)
  const writeCapability = await write.json() as { token: string }
  const path = `/api/storage/media/${fixture.objectKey}`
  const bytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])
  const uploaded = await request(fixture, path, { method: 'PUT',
    headers: { 'content-type': 'image/png', 'x-agentic-graph-media-capability': writeCapability.token }, body: bytes })
  assert.equal(uploaded.status, 200)
  const persisted = await request(fixture, ASSETS, { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ apiVersion: AGENTIC_OS_STORAGE_API_VERSION, workspaceId: WORKSPACE,
      objectKey: fixture.objectKey, runId: fixture.runId, stageId: 'image', shotId: 'artifact', kind: 'image',
      durableR2Url: path, contentHash: 'sha256:browser-media-fixture', mediaType: 'image/png',
      provenance: { source: 'native-session-regression' }, version: 1,
      presignedUrl: 'https://untrusted.example/forged' }) })
  assert.equal(persisted.status, 200)
  const artifact = await persisted.json() as { artifactId: string; access: { url: string } }
  assert.equal(new URL(artifact.access.url).origin, fixture.origin)
  const worker = createAgenticGraphStorageWorker()
  const listed = await worker.fetch(new Request(`${fixture.origin}${ASSETS}?workspaceId=${encodeURIComponent(WORKSPACE)}`,
    { headers: { cookie: fixture.cookie } }), fixture.env)
  assert.equal(listed.status, 200)
  const catalog = await listed.json() as { artifacts: Array<{ artifactId: string; objectKey: string }> }
  assert.equal(catalog.artifacts.length, 1, 'A subsequent Worker request reads an actual stored catalog row')
  assert.equal(catalog.artifacts[0].artifactId, artifact.artifactId)
  assert.equal(catalog.artifacts[0].objectKey, fixture.objectKey)
  const read = await mint(fixture, 'read')
  assert.equal(read.status, 200)
  const readCapability = await read.json() as { urlPath: string }
  const replay = await worker.fetch(new Request(new URL(readCapability.urlPath, fixture.origin)), fixture.env)
  assert.equal(replay.status, 200)
  assert.deepEqual(new Uint8Array(await replay.arrayBuffer()), bytes)
  assert.equal((await worker.fetch(new Request(`${fixture.origin}${path}`), fixture.env)).status, 403)
  assert.equal((await worker.fetch(new Request(`${fixture.origin}${path}?agentic_os_media_capability=forged.token`), fixture.env)).status, 403)
})

test('media cookie mutations reject foreign or missing origin before reading bodies', async () => {
  const fixture = await createFixture()
  const worker = createAgenticGraphStorageWorker()
  for (const [path, methods] of [[CAPABILITY, ['POST']], [ASSETS, ['POST', 'PATCH', 'DELETE']],
    [`/api/storage/blob/${encodeURIComponent(WORKSPACE)}/invoice.pdf`, ['POST']]] as const) {
    for (const method of methods) {
      for (const origin of ['', 'https://foreign.example']) {
        let canceled = false
        const body = new ReadableStream<Uint8Array>({ cancel() { canceled = true } })
        const response = await worker.fetch(new Request(`${fixture.origin}${path}`, {
          method, headers: { cookie: fixture.cookie, ...(origin ? { origin } : {}), 'content-type': 'application/json' },
          body, duplex: 'half',
        } as RequestInit), fixture.env)
        assert.equal(response.status, 403)
        assert.equal(body.locked, false, 'Rejected request is never parsed')
        await body.cancel()
        assert.equal(canceled, true)
      }
    }
  }
  assert.equal(fixture.env.AGENTIC_OS_STORAGE_BLOB_BUCKET.objects.size, 0)
})

test('media sessions retain role, tenant, expiry, revocation and configuration checks', async () => {
  const fixture = await createFixture()
  assert.equal((await mint(fixture, 'write', 'workspace:other')).status, 403)
  const membership = fixture.env.DB.workspaceMemberships.get(fixture.membershipId)!
  membership.role = 'viewer'
  assert.equal((await mint(fixture)).status, 403)
  assert.equal((await mint(fixture, 'read')).status, 200)
  membership.status = 'inactive'
  assert.equal((await mint(fixture, 'read')).status, 403)
  membership.status = 'active'; membership.role = 'owner'
  const session = fixture.env.DB.authSessions.get(fixture.sessionId)!
  session.revoked_at = new Date().toISOString()
  assert.equal((await mint(fixture)).status, 401)
  session.revoked_at = null; session.expires_at = '2000-01-01T00:00:00.000Z'
  assert.equal((await mint(fixture)).status, 401)
  session.expires_at = '2099-01-01T00:00:00.000Z'
  fixture.env.DB.users.get(fixture.userId)!.status = 'disabled'
  assert.equal((await mint(fixture)).status, 403)
  fixture.env.DB.users.get(fixture.userId)!.status = 'active'
  fixture.env.AGENTIC_OS_STORAGE_ACCESS_AUDIENCE = ''
  assert.equal((await mint(fixture)).status, 503)
  fixture.env.AGENTIC_OS_STORAGE_LOCAL_RUNTIME = 'true'
  assert.equal((await mint(fixture)).status, 403)
  assert.equal(fixture.env.AGENTIC_OS_STORAGE_BLOB_BUCKET.objects.size, 0)
})

test('artifact cookies preserve default bearer and raw-media boundaries while retaining service access', async () => {
  const fixture = await createFixture()
  const blob = `/api/storage/blob/${encodeURIComponent(WORKSPACE)}/generated/browser.bin`
  const defaultAuth = await authenticateAgenticGraphStorageSyncRequest(new Request(`${fixture.origin}${blob}`,
    { headers: { cookie: fixture.cookie } }), fixture.env, fixture.env.DB)
  assert.equal(defaultAuth.ok, false, 'Unadmitted routes retain the existing bearer-only authenticator')
  assert.equal((await request(fixture, `/api/storage/media/${fixture.objectKey}`)).status, 403)
  const worker = createAgenticGraphStorageWorker()
  const bearer = await worker.fetch(new Request(`${fixture.origin}${CAPABILITY}`, {
    method: 'POST', headers: { authorization: `Bearer ${fixture.sessionToken}`, 'content-type': 'application/json' },
    body: JSON.stringify({ workspaceId: WORKSPACE, objectKey: fixture.objectKey, operation: 'write' }),
  }), fixture.env)
  assert.equal(bearer.status, 200)
  const missing = await worker.fetch(new Request(`${fixture.origin}${CAPABILITY}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: '{invalid',
  }), fixture.env)
  assert.equal(missing.status, 401)
  assert.equal(fixture.env.AGENTIC_OS_STORAGE_BLOB_BUCKET.objects.size, 0)
})

test('browser blob delivery preserves byte limits, workspace ownership and read-only roles', async () => {
  const fixture = await createFixture()
  fixture.env.AGENTIC_OS_STORAGE_BLOB_MAX_BYTES = '8'
  const path = `/api/storage/blob/${encodeURIComponent(WORKSPACE)}/invoice.pdf`
  const write = (body: string) => request(fixture, path, { method: 'POST', headers: { 'content-type': 'application/pdf' }, body })
  assert.equal((await write('123456789')).status, 413)
  assert.equal(fixture.env.AGENTIC_OS_STORAGE_BLOB_BUCKET.objects.size, 0)
  assert.equal((await write('%PDF')).status, 200)
  assert.equal(await (await request(fixture, path)).text(), '%PDF')
  assert.equal((await request(fixture, '/api/storage/blob/workspace%3Aother/invoice.pdf')).status, 403)
  fixture.env.DB.workspaceMemberships.get(fixture.membershipId)!.role = 'viewer'
  assert.equal((await write('replace')).status, 403)
  assert.equal(await (await request(fixture, path)).text(), '%PDF')
  assert.equal(fixture.env.AGENTIC_OS_STORAGE_BLOB_BUCKET.objects.size, 1)
})

test('media replay and deletion preserve reserved characters and literal percent escapes in object keys', async () => {
  const fixture = await createFixture()
  const fileName = 'artifact #?%23.png'
  fixture.objectKey = fixture.objectKey.replace('artifact.png', fileName)
  const path = buildAgenticGraphStorageMediaPath(fixture.objectKey)
  const bytes = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10])
  const issued = await mint(fixture)
  assert.equal(issued.status, 200)
  const capability = await issued.json() as { token: string; objectKey: string; urlPath: string }
  assert.equal(capability.objectKey, fixture.objectKey, 'JSON objectKey is raw, not URL-decoded')
  assert.equal(new URL(capability.urlPath, fixture.origin).pathname, path)
  const upload = await request(fixture, path, { method: 'PUT', headers: {
    'content-type': 'image/png', 'x-agentic-graph-media-capability': capability.token,
  }, body: bytes })
  assert.equal(upload.status, 200)
  assert.equal((await upload.json() as { publicPath: string }).publicPath, path)
  const saved = await request(fixture, ASSETS, { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ apiVersion: AGENTIC_OS_STORAGE_API_VERSION, workspaceId: WORKSPACE,
      objectKey: fixture.objectKey, runId: fixture.runId, stageId: 'image', shotId: fileName.slice(0, -4),
      kind: 'image', durableR2Url: 'https://untrusted.example/wrong', contentHash: 'sha256:reserved-fixture',
      provenance: {}, version: 1 }) })
  assert.equal(saved.status, 200)
  const artifact = await saved.json() as { artifactId: string; publicPath: string; durableR2Url: string; access: { url: string } }
  assert.equal(artifact.publicPath, path)
  assert.equal(artifact.durableR2Url, path)
  const access = new URL(artifact.access.url)
  assert.equal(access.pathname, path)
  assert.equal(access.hash, '')
  assert.ok(access.searchParams.get('agentic_os_media_capability'))
  const worker = createAgenticGraphStorageWorker()
  const replay = await worker.fetch(new Request(access), fixture.env)
  assert.equal(replay.status, 200)
  assert.deepEqual(new Uint8Array(await replay.arrayBuffer()), bytes)
  const listed = await request(fixture, `${ASSETS}?workspaceId=${encodeURIComponent(WORKSPACE)}`)
  const catalog = await listed.json() as { artifacts: Array<{ objectKey: string; publicPath: string }> }
  assert.equal(catalog.artifacts.length, 1)
  assert.equal(catalog.artifacts[0].objectKey, fixture.objectKey)
  assert.equal(catalog.artifacts[0].publicPath, path)
  const bucket = fixture.env.AGENTIC_OS_STORAGE_BLOB_BUCKET
  const similarKey = fixture.objectKey.replace('%23', '#')
  await bucket.put(similarKey, 'other-owned-bytes')
  const deleted = await request(fixture,
    `${ASSETS}?workspaceId=${encodeURIComponent(WORKSPACE)}&artifactId=${encodeURIComponent(artifact.artifactId)}`,
    { method: 'DELETE' })
  assert.equal(deleted.status, 200)
  assert.equal(bucket.objects.has(fixture.objectKey), false)
  assert.equal(new TextDecoder().decode(bucket.objects.get(similarKey)!.bytes), 'other-owned-bytes',
    'Deleting a literal percent key must not delete the decoded-looking neighbor')
})
