import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { tsImport } from 'tsx/esm/api'

const storageApiVersion = '2026-05-04'
const { AGENTIC_OS_STORAGE_SYNC_API_VERSION: syncApiVersion } = await tsImport(
  '../../src/lib/storage/agentic-graph-storage-sync-records.ts', import.meta.url)

/** In-process browser fixture; does not contact or certify a storage provider. */
export function createXrV2ExistingStorageFixture() {
  const storageFixture = {
    blobs: new Map(),
    documents: new Map(),
    events: [],
  }
  const storageKey = (workspaceId, canonicalPath) => `${workspaceId}:${canonicalPath}`
  const jsonBody = value => ({
    status: 200,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(value),
  })

  async function installExistingStorageFixture(scope) {
    await scope.route('**/__agentic_os_fs_write', async route => {
      storageFixture.events.push('workspace-file-write')
      await route.fulfill(jsonBody({ ok: true }))
    })
    await scope.route('**/api/storage/**', async route => {
      const request = route.request()
      const url = new URL(request.url())
      const method = request.method()
      const blobPrefix = '/api/storage/blob/'
      const documentPrefix = '/api/storage/doc/'
      const exportPrefix = '/api/storage/export/'
      if (url.pathname.startsWith(blobPrefix)) {
        const [workspaceIdPart = '', canonicalPathPart = ''] = url.pathname.slice(blobPrefix.length).split('/')
        const workspaceId = decodeURIComponent(workspaceIdPart)
        const canonicalPath = decodeURIComponent(canonicalPathPart)
        const key = storageKey(workspaceId, canonicalPath)
        if (method === 'POST') {
          const bytes = request.postDataBuffer() || Buffer.alloc(0)
          const contentType = request.headers()['content-type'] || 'application/octet-stream'
          const contentHash = request.headers()['x-agentic-graph-content-hash']
            || `sha256:${createHash('sha256').update(bytes).digest('hex')}`
          const publicPath = `${blobPrefix}${encodeURIComponent(workspaceId)}/${encodeURIComponent(canonicalPath)}`
          storageFixture.blobs.set(key, { bytes, contentType, contentHash, publicPath })
          storageFixture.events.push(`blob-upload:${canonicalPath}`)
          await route.fulfill(jsonBody({
            ok: true,
            apiVersion: storageApiVersion,
            workspaceId,
            canonicalPath,
            objectKey: `workspaces/${encodeURIComponent(workspaceId)}/${canonicalPath}`,
            publicPath,
            contentType,
            contentHash,
            sizeBytes: bytes.byteLength,
            etag: `fixture-${bytes.byteLength}`,
            uploadedAtMs: Date.now(),
          }))
          return
        }
        const stored = storageFixture.blobs.get(key)
        if (!stored) {
          await route.fulfill({ status: 404, body: 'not found' })
          return
        }
        storageFixture.events.push(`blob-read:${canonicalPath}`)
        await route.fulfill({
          status: 200,
          headers: {
            'content-type': stored.contentType,
            'content-length': String(stored.bytes.byteLength),
          },
          body: method === 'HEAD' ? '' : stored.bytes,
        })
        return
      }
      if (url.pathname.startsWith(documentPrefix) && method === 'GET') {
        const [workspaceIdPart = '', canonicalPathPart = ''] = url.pathname.slice(documentPrefix.length).split('/')
        const workspaceId = decodeURIComponent(workspaceIdPart)
        const canonicalPath = decodeURIComponent(canonicalPathPart)
        const document = storageFixture.documents.get(storageKey(workspaceId, canonicalPath))
        storageFixture.events.push(`manifest-read:${canonicalPath}`)
        await route.fulfill(document
          ? { status: 200, headers: { 'content-type': 'text/markdown' }, body: document.contentMd }
          : { status: 404, body: 'not found' })
        return
      }
      if (url.pathname === '/api/storage/push' && method === 'POST') {
        const payload = request.postDataJSON()
        assert.equal(payload.apiVersion, syncApiVersion)
        const acknowledgements = []
        for (const mutation of payload.mutations || []) {
          assert.equal(mutation.entity, 'document', 'XR manifest fixture supports document mutations only')
          if (mutation.entity === 'document' && mutation.record?.canonicalPath) {
            const record = { ...mutation.record, deleted: mutation.op === 'delete' || Boolean(mutation.record.deleted) }
            storageFixture.documents.set(storageKey(payload.workspaceId, record.canonicalPath), record)
          }
          acknowledgements.push({
            mutationId: mutation.mutationId,
            recordId: mutation.recordId,
            entity: mutation.entity,
            status: 'applied',
            serverRevision: Number(mutation.record?.revision || 1),
            message: null,
          })
        }
        storageFixture.events.push('manifest-push')
        await route.fulfill(jsonBody({
          ok: true,
          apiVersion: syncApiVersion,
          workspaceId: payload.workspaceId,
          ackCursor: new Date().toISOString(),
          serverTimeMs: Date.now(),
          acknowledgements,
        }))
        return
      }
      if (url.pathname === '/api/storage/pull' && method === 'POST') {
        const payload = request.postDataJSON()
        assert.equal(payload.apiVersion, syncApiVersion)
        await route.fulfill(jsonBody({
          ok: true,
          apiVersion: syncApiVersion,
          workspaceId: payload.workspaceId,
          nextCursor: new Date().toISOString(),
          nextPageCursor: null,
          pageComplete: true,
          serverTimeMs: Date.now(),
          changes: { documents: [], documentChunks: [], graphSnapshots: [], deletions: [] },
        }))
        return
      }
      if (url.pathname.startsWith(exportPrefix) && method === 'GET') {
        const workspaceId = decodeURIComponent(url.pathname.slice(exportPrefix.length))
        storageFixture.events.push('manifest-list')
        await route.fulfill(jsonBody({
          ok: true,
          apiVersion: storageApiVersion,
          workspaceId,
          exportedAtMs: Date.now(),
          nextPageCursor: null,
          pageComplete: true,
          documents: [...storageFixture.documents.values()],
          documentChunks: [],
          graphSnapshots: [],
        }))
        return
      }
      await route.fulfill({ status: 404, body: 'not found' })
    })
  }
  return { storageFixture, installExistingStorageFixture }
}
