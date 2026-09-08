import assert from 'node:assert/strict'
import test from 'node:test'
import { createFakeAgenticGraphStorageBrowserSession } from '../../../../canvas/src/__tests__/helpers/fake-agentic-graph-storage-browser-session'
import { buildAgenticGraphStorageMediaWorkspace } from '../../../../canvas/src/lib/storage/agentic-graph-storage-media-object-key'
import { createAgenticGraphStorageWorker } from '../index'
import { AGENTIC_OS_STORAGE_MEDIA_CAPABILITY_SCHEMA, mintAgenticGraphStorageMediaCapability } from '../storageMediaCapability'

const ORIGIN = 'http://localhost'
const fixtureFor = (workspaceId: string) => createFakeAgenticGraphStorageBrowserSession(workspaceId, { role: 'owner' })
type Fixture = Awaited<ReturnType<typeof fixtureFor>>
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

test('a workspace cannot borrow another workspace run identity within its own R2 prefix', async () => {
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
  await fixture.env.AGENTIC_OS_STORAGE_BLOB_BUCKET.put(objectKey, 'legacy', {
    customMetadata: { agenticGraphWorkspaceId: workspaceId, agenticGraphCapabilitySchema: AGENTIC_OS_STORAGE_MEDIA_CAPABILITY_SCHEMA },
  })
  const response = await fixture.fetch(`${ORIGIN}/api/storage/media/assets`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({
      apiVersion: '2026-05-04', workspaceId, objectKey, runId: 'unscoped', stageId: 'image', shotId: 'artifact',
      kind: 'image', durableR2Url: `/api/storage/media/${objectKey}`, contentHash: 'sha256:legacy-catalog', provenance: {}, version: 1,
    }),
  })
  assert.equal(response.status, 403)
  assert.equal(fixture.env.DB.mediaArtifacts.size, 0)
  assert.equal(fixture.env.AGENTIC_OS_STORAGE_BLOB_BUCKET.objects.size, 1, 'Existing bytes are preserved')
})

test('workspace namespace prevents concurrent same-name uploads from sharing an R2 key', async () => {
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
  const bucket = fixture.env.AGENTIC_OS_STORAGE_BLOB_BUCKET
  assert.equal(bucket.objects.size, 2)
  assert.equal(new TextDecoder().decode(bucket.objects.get(keyA)!.bytes), 'a-bytes')
  assert.equal(new TextDecoder().decode(bucket.objects.get(keyB)!.bytes), 'b-bytes')
  assert.equal(bucket.objects.get(keyA)!.customMetadata.agenticGraphWorkspaceId, 'workspace:a')
  assert.equal(bucket.objects.get(keyB)!.customMetadata.agenticGraphWorkspaceId, 'workspace:b')
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
  const stored = fixture.env.AGENTIC_OS_STORAGE_BLOB_BUCKET.objects.get(objectKey)!
  assert.equal(new TextDecoder().decode(stored.bytes), 'owner-bytes')
  assert.equal(stored.customMetadata.agenticGraphWorkspaceId, 'workspace:a')
})

test('legacy owned objects remain readable while legacy write tokens cannot overwrite them', async () => {
  const workspaceId = 'workspace:legacy'
  const fixture = await fixtureFor(workspaceId)
  const objectKey = 'airvio/runs/legacy/image/asset.png'
  await fixture.env.AGENTIC_OS_STORAGE_BLOB_BUCKET.put(objectKey, 'retained-bytes', {
    httpMetadata: { contentType: 'image/png' }, customMetadata: {
      agenticGraphWorkspaceId: workspaceId, agenticGraphOwnerUserId: fixture.userId,
      agenticGraphCapabilitySchema: AGENTIC_OS_STORAGE_MEDIA_CAPABILITY_SCHEMA,
    },
  })
  const read = await mint(fixture, workspaceId, objectKey, 'read')
  const response = await createAgenticGraphStorageWorker().fetch(new Request(new URL(read.urlPath, ORIGIN)), fixture.env)
  assert.equal(response.status, 200)
  assert.equal(await response.text(), 'retained-bytes')
  await assert.rejects(() => mint(fixture, workspaceId, objectKey, 'write'), /workspace/i)
  const oldToken = await legacyWriteToken(fixture, workspaceId, objectKey)
  assert.equal((await put(fixture, objectKey, oldToken, 'must-not-overwrite')).status, 403)
  assert.equal(new TextDecoder().decode(fixture.env.AGENTIC_OS_STORAGE_BLOB_BUCKET.objects.get(objectKey)!.bytes), 'retained-bytes')
})
