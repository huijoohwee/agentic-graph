import assert from 'node:assert/strict'
import test from 'node:test'
import { createFakeAgenticGraphStorageBrowserSession } from '../../../../canvas/src/__tests__/helpers/fake-agentic-graph-storage-browser-session'
import { buildAgenticGraphStorageMediaWorkspace } from '../../../../canvas/src/lib/storage/agentic-graph-storage-media-object-key'
import { createAgenticGraphStorageWorker } from '../index'
import { readD1Blob, writeD1Blob } from '../d1BlobStore'
import type { D1DatabaseLike } from '../db'
import { AGENTIC_OS_STORAGE_MEDIA_CAPABILITY_SCHEMA, mintAgenticGraphStorageMediaCapability } from '../storageMediaCapability'

const ORIGIN = 'http://localhost'
const fixtureFor = (workspaceId: string) => createFakeAgenticGraphStorageBrowserSession(workspaceId, { role: 'owner' })
type Fixture = Awaited<ReturnType<typeof fixtureFor>>
const store = (fixture: Fixture, objectKey: string, body: string, customMetadata: Record<string, string>) =>
  writeD1Blob({ db: fixture.env.DB as unknown as D1DatabaseLike, objectKey, body: new TextEncoder().encode(body),
    contentType: 'image/png', contentHash: null, customMetadata })
const readStored = (fixture: Fixture, objectKey: string) =>
  readD1Blob(fixture.env.DB as unknown as D1DatabaseLike, objectKey)
const mint = (fixture: Fixture, workspaceId: string, objectKey: string, operation: 'read' | 'write') =>
  mintAgenticGraphStorageMediaCapability({ env: fixture.env, workspaceId, objectKey, operation,
    subjectUserId: fixture.userId, ttlSeconds: 300 })
const put = (fixture: Fixture, objectKey: string, token: string, body: string) =>
  createAgenticGraphStorageWorker().fetch(new Request(`${ORIGIN}/api/storage/media/${objectKey}`, {
    method: 'PUT', headers: { 'content-type': 'image/png', 'x-agentic-graph-media-capability': token }, body,
  }), fixture.env)

// Model a still-valid write token from the earlier issuer, which admitted any key.
// The current issuer must reject it, and the use-time boundary must also reject it.
const legacyWriteToken = async (fixture: Fixture, workspaceId: string, objectKey: string): Promise<string> => {
  const read = await mint(fixture, workspaceId, objectKey, 'read')
  const [part] = read.token.split('.')
  const payload = JSON.parse(Buffer.from(part, 'base64url').toString('utf8'))
  payload.operation = 'write'
  const bytes = new TextEncoder().encode(JSON.stringify(payload))
  const key = await crypto.subtle.importKey('raw',
    new TextEncoder().encode(fixture.env.AGENTIC_OS_STORAGE_SIGNING_SECRET),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const signature = await crypto.subtle.sign('HMAC', key, bytes)
  return `${Buffer.from(bytes).toString('base64url')}.${Buffer.from(signature).toString('base64url')}`
}

test('a workspace cannot borrow another workspace run identity within its own D1 media prefix', async () => {
  const fixture = await fixtureFor('workspace:b')
  const a = await buildAgenticGraphStorageMediaWorkspace('workspace:a')
  const b = await buildAgenticGraphStorageMediaWorkspace('workspace:b')
  const borrowed = `${b.prefix}/runs/${a.key}-upload-content/image/output.png`
  await assert.rejects(() => mint(fixture, 'workspace:b', borrowed, 'write'), /workspace/i)
})

test('asset POST cannot create globally colliding D1 identities from legacy owned objects', async () => {
  const workspaceId = 'workspace:legacy-catalog'
  const fixture = await fixtureFor(workspaceId)
  const objectKey = 'airvio/runs/unscoped/image/artifact.png'
  await store(fixture, objectKey, 'legacy', { agenticGraphWorkspaceId: workspaceId, agenticGraphCapabilitySchema: AGENTIC_OS_STORAGE_MEDIA_CAPABILITY_SCHEMA })
  const response = await fixture.fetch(`${ORIGIN}/api/storage/media/assets`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({
      apiVersion: '2026-05-04', workspaceId, objectKey, runId: 'unscoped', stageId: 'image', shotId: 'artifact',
      kind: 'image', durableR2Url: `/api/storage/media/${objectKey}`, contentHash: 'sha256:legacy-catalog', provenance: {}, version: 1,
    }),
  })
  assert.equal(response.status, 403)
  assert.equal(fixture.env.DB.mediaArtifacts.size, 0)
  assert.equal((await readStored(fixture, objectKey))?.body?.byteLength, 'legacy'.length, 'Existing D1 bytes are preserved')
  assert.equal(fixture.env.AGENTIC_OS_STORAGE_BLOB_BUCKET.objects.size, 0, 'The production media path leaves R2 untouched')
})

test('workspace namespace prevents concurrent same-name uploads from sharing a D1 key', async () => {
  const fixture = await fixtureFor('workspace:a')
  const a = await buildAgenticGraphStorageMediaWorkspace('workspace:a')
  const b = await buildAgenticGraphStorageMediaWorkspace('workspace:b')
  assert.notEqual(a.key, b.key)
  assert.deepEqual(await buildAgenticGraphStorageMediaWorkspace(' workspace:a '), a)
  const keyA = `${a.prefix}/runs/${a.key}-same/image/same.png`
  const keyB = `${b.prefix}/runs/${b.key}-same/image/same.png`
  const [capA, capB] = await Promise.all([mint(fixture, 'workspace:a', keyA, 'write'), mint(fixture, 'workspace:b', keyB, 'write')])
  const results = await Promise.all([put(fixture, keyA, capA.token, 'a-bytes'), put(fixture, keyB, capB.token, 'b-bytes')])
  assert.deepEqual(results.map(result => result.status), [200, 200])
  const storedA = await readStored(fixture, keyA), storedB = await readStored(fixture, keyB)
  assert.equal(new TextDecoder().decode(storedA?.body), 'a-bytes')
  assert.equal(new TextDecoder().decode(storedB?.body), 'b-bytes')
  assert.equal(storedA?.object.custom_metadata.agenticGraphWorkspaceId, 'workspace:a')
  assert.equal(storedB?.object.custom_metadata.agenticGraphWorkspaceId, 'workspace:b')
  assert.equal(fixture.env.AGENTIC_OS_STORAGE_BLOB_BUCKET.objects.size, 0)
})

test('both capability issue and use reject a write into another workspace namespace', async () => {
  const fixture = await fixtureFor('workspace:a')
  const { key, prefix } = await buildAgenticGraphStorageMediaWorkspace('workspace:a')
  const objectKey = `${prefix}/runs/${key}-run/image/output.png`
  const own = await mint(fixture, 'workspace:a', objectKey, 'write')
  assert.equal((await put(fixture, objectKey, own.token, 'owner-bytes')).status, 200)
  await assert.rejects(() => mint(fixture, 'workspace:b', objectKey, 'write'), /workspace/i)
  const oldToken = await legacyWriteToken(fixture, 'workspace:b', objectKey)
  const rejected = await put(fixture, objectKey, oldToken, 'must-not-overwrite')
  assert.equal(rejected.status, 403)
  const stored = await readStored(fixture, objectKey)
  assert.equal(new TextDecoder().decode(stored?.body), 'owner-bytes')
  assert.equal(stored?.object.custom_metadata.agenticGraphWorkspaceId, 'workspace:a')
})

test('D1-owned objects remain readable while legacy write tokens cannot overwrite them', async () => {
  const workspaceId = 'workspace:legacy'
  const fixture = await fixtureFor(workspaceId)
  const objectKey = 'airvio/runs/legacy/image/asset.png'
  await store(fixture, objectKey, 'retained-bytes', {
      agenticGraphWorkspaceId: workspaceId, agenticGraphOwnerUserId: fixture.userId,
      agenticGraphCapabilitySchema: AGENTIC_OS_STORAGE_MEDIA_CAPABILITY_SCHEMA,
  })
  const read = await mint(fixture, workspaceId, objectKey, 'read')
  const response = await createAgenticGraphStorageWorker().fetch(new Request(new URL(read.urlPath, ORIGIN)), fixture.env)
  assert.equal(response.status, 200)
  assert.equal(await response.text(), 'retained-bytes')
  await assert.rejects(() => mint(fixture, workspaceId, objectKey, 'write'), /workspace/i)
  const oldToken = await legacyWriteToken(fixture, workspaceId, objectKey)
  assert.equal((await put(fixture, objectKey, oldToken, 'must-not-overwrite')).status, 403)
  assert.equal(new TextDecoder().decode((await readStored(fixture, objectKey))?.body), 'retained-bytes')
  assert.equal(fixture.env.AGENTIC_OS_STORAGE_BLOB_BUCKET.objects.size, 0)
})
