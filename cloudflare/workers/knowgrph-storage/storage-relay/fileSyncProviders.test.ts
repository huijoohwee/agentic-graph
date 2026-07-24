import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  computeFileSyncQuickXor,
  computeFileSyncSha256,
  type FileSyncProvider,
} from './fileSyncProvider'
import { FileSyncProviderRegistry } from './fileSyncProviderRegistry'
import { createFileSyncRelayHandler } from './fileSyncRelay'
import { GoogleDriveFileSyncProvider } from './googleDriveFileSyncProvider'
import { OneDriveFileSyncProvider } from './oneDriveFileSyncProvider'
import { StorageRelayOpaqueTokenCodec } from './storageRelayOpaqueToken'
import {
  StorageRelayError,
  StorageRelayOperation,
  type StorageRelayAuthHooks,
  type StorageRelayFetch,
} from './storageRelaySafety'

const jsonResponse = (status: number, value: unknown, headers?: HeadersInit): Response =>
  new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  })

const activeEditorHooks: StorageRelayAuthHooks<{ userId: string }> = {
  async authenticate() {
    return { userId: 'user-1' }
  },
  async authorizeMembership() {
    return { role: 'editor', status: 'active' }
  },
}

test('Google Drive listing preserves pagination and marks native records unsupported', async () => {
  let observedUrl: URL | null = null
  const operation = new StorageRelayOperation({
    fetcher: async input => {
      observedUrl = new URL(String(input))
      return jsonResponse(200, {
        incompleteSearch: false,
        nextPageToken: 'raw-google-next-page',
        files: [
          {
            id: 'binary-id',
            name: 'asset.bin',
            mimeType: 'application/octet-stream',
            size: '4',
            version: '7',
            sha256Checksum: 'a'.repeat(64),
            parents: ['root-id'],
            trashed: false,
          },
          {
            id: 'native-id',
            name: 'Native Document',
            mimeType: 'application/vnd.google-apps.document',
            version: '8',
            parents: ['root-id'],
            trashed: false,
          },
          {
            id: 'shortcut-id',
            name: 'Shortcut',
            mimeType: 'application/vnd.google-apps.shortcut',
            version: '9',
            parents: ['root-id'],
            trashed: false,
          },
        ],
      })
    },
  })
  try {
    const page = await new GoogleDriveFileSyncProvider({
      accessToken: 'google-secret',
      driveId: 'drive-id',
    }).listPage({
      parentResourceId: 'root-id',
      cursor: null,
      limit: 100,
      operation,
    })
    assert.equal(page.nextCursor, 'raw-google-next-page')
    assert.equal(page.incomplete, false)
    assert.equal(page.entries[0]?.hash?.algorithm, 'sha256')
    assert.equal(page.entries[1]?.unsupportedReason, 'native-document')
    assert.equal(page.entries[2]?.unsupportedReason, 'shortcut')
    const capturedUrl = observedUrl as URL | null
    assert.ok(capturedUrl)
    assert.equal(capturedUrl.searchParams.get('driveId'), 'drive-id')
    assert.match(capturedUrl.searchParams.get('q') || '', /'root-id' in parents/)
  } finally {
    operation.dispose()
  }
})

test('Google Drive incompleteSearch fails without issuing a complete page', async () => {
  const operation = new StorageRelayOperation({
    fetcher: async () => jsonResponse(200, {
      incompleteSearch: true,
      files: [],
    }),
  })
  try {
    await assert.rejects(
      new GoogleDriveFileSyncProvider({ accessToken: 'google-secret' }).listPage({
        parentResourceId: 'root-id',
        cursor: null,
        limit: 100,
        operation,
      }),
      (error: unknown) => error instanceof StorageRelayError
        && error.code === 'limit_exceeded',
    )
  } finally {
    operation.dispose()
  }
})

test('Google Drive resumable update uses an ETag and keeps the upload URL token-only', async () => {
  const bytes = new TextEncoder().encode('updated content')
  const expectedHash = await computeFileSyncSha256(bytes)
  let callIndex = 0
  const fetcher: StorageRelayFetch = async (input, init = {}) => {
    callIndex += 1
    const url = String(input)
    if (callIndex === 1) {
      assert.match(url, /\/drive\/v3\/files\/file-id/)
      return jsonResponse(200, {
        id: 'file-id',
        name: 'document.md',
        mimeType: 'text/markdown',
        size: '3',
        version: '4',
        sha256Checksum: 'b'.repeat(64),
        parents: ['root-id'],
        trashed: false,
      }, { etag: '"etag-old"' })
    }
    if (callIndex === 2) {
      assert.equal(init.method, 'PATCH')
      assert.equal(new Headers(init.headers).get('if-match'), '"etag-old"')
      assert.equal(new Headers(init.headers).get('authorization'), 'Bearer google-secret')
      return new Response(null, {
        status: 200,
        headers: {
          location: 'https://www.googleapis.com/upload/drive/v3/files/file-id?upload_id=worker-only-secret',
        },
      })
    }
    assert.equal(callIndex, 3)
    assert.match(url, /upload_id=worker-only-secret/)
    assert.equal(init.method, 'PUT')
    assert.equal(new Headers(init.headers).has('authorization'), false)
    return jsonResponse(200, {
      id: 'file-id',
      name: 'document.md',
      mimeType: 'text/markdown',
      size: String(bytes.byteLength),
      version: '5',
      sha256Checksum: expectedHash.value,
      parents: ['root-id'],
      trashed: false,
    })
  }
  const operation = new StorageRelayOperation({ fetcher })
  try {
    const entry = await new GoogleDriveFileSyncProvider({
      accessToken: 'google-secret',
    }).writeFile({
      resourceId: 'file-id',
      parentResourceId: 'root-id',
      name: 'document.md',
      expectedVersion: 'google-version:4',
      mimeType: 'text/markdown',
      bytes,
      expectedHash,
      idempotencyKey: 'write-1',
      operation,
    })
    assert.equal(entry.versionTag, 'google-version:5')
    assert.equal(callIndex, 3)
  } finally {
    operation.dispose()
  }
})

test('OneDrive nextLink is reduced to a cursor and rejects a foreign host', async () => {
  const driveId = 'drive-id'
  const parentId = 'root-id'
  const expectedPath = `/v1.0/drives/${driveId}/items/${parentId}/children`
  const provider = new OneDriveFileSyncProvider({
    accessToken: 'graph-secret',
    driveId,
  })
  const operation = new StorageRelayOperation({
    fetcher: async () => jsonResponse(200, {
      value: [{
        id: 'remote-id',
        name: 'Shared item',
        size: 0,
        eTag: '"remote-etag"',
        remoteItem: {},
        parentReference: { id: parentId },
      }],
      '@odata.nextLink': `https://graph.microsoft.com${expectedPath}?$skiptoken=raw-graph-cursor`,
    }),
  })
  try {
    const page = await provider.listPage({
      parentResourceId: parentId,
      cursor: null,
      limit: 100,
      operation,
    })
    assert.equal(page.nextCursor, 'raw-graph-cursor')
    assert.equal(page.entries[0]?.unsupportedReason, 'remote-item')
  } finally {
    operation.dispose()
  }
  const maliciousOperation = new StorageRelayOperation({
    fetcher: async () => jsonResponse(200, {
      value: [],
      '@odata.nextLink': 'https://attacker.example/steal?$skiptoken=secret',
    }),
  })
  try {
    await assert.rejects(
      provider.listPage({
        parentResourceId: parentId,
        cursor: null,
        limit: 100,
        operation: maliciousOperation,
      }),
      (error: unknown) => error instanceof StorageRelayError
        && error.code === 'invalid_response',
    )
  } finally {
    maliciousOperation.dispose()
  }
})

test('OneDrive download and upload session URLs never receive Worker authorization', async () => {
  const bytes = new TextEncoder().encode('onedrive content')
  const expectedHash = computeFileSyncQuickXor(bytes)
  const baseItem = {
    id: 'file-id',
    name: 'document.md',
    size: bytes.byteLength,
    eTag: '"etag-old"',
    file: {
      mimeType: 'text/markdown',
      hashes: { quickXorHash: expectedHash.value },
    },
    parentReference: { id: 'root-id' },
  }
  let readCall = 0
  const readOperation = new StorageRelayOperation({
    fetcher: async (input, init = {}) => {
      readCall += 1
      if (readCall === 1) return jsonResponse(200, baseItem)
      if (readCall === 2) {
        assert.equal(new Headers(init.headers).get('authorization'), 'Bearer graph-secret')
        return new Response(null, {
          status: 302,
          headers: { location: 'https://download.example/file?worker-only=1' },
        })
      }
      assert.equal(String(input), 'https://download.example/file?worker-only=1')
      assert.equal(new Headers(init.headers).has('authorization'), false)
      return new Response(bytes)
    },
  })
  const provider = new OneDriveFileSyncProvider({
    accessToken: 'graph-secret',
    driveId: 'drive-id',
  })
  try {
    const result = await provider.read({
      resourceId: 'file-id',
      expectedVersion: 'onedrive-etag:"etag-old"',
      operation: readOperation,
    })
    assert.deepEqual(result.bytes, bytes)
    assert.equal(readCall, 3)
  } finally {
    readOperation.dispose()
  }

  let writeCall = 0
  const writeOperation = new StorageRelayOperation({
    fetcher: async (input, init = {}) => {
      writeCall += 1
      if (writeCall === 1) return jsonResponse(200, baseItem)
      if (writeCall === 2) {
        assert.equal(new Headers(init.headers).get('if-match'), '"etag-old"')
        return jsonResponse(200, {
          uploadUrl: 'https://upload.example/session?worker-only=1',
        })
      }
      assert.equal(String(input), 'https://upload.example/session?worker-only=1')
      assert.equal(new Headers(init.headers).has('authorization'), false)
      assert.equal(new Headers(init.headers).get('content-range'), `bytes 0-${bytes.byteLength - 1}/${bytes.byteLength}`)
      return jsonResponse(201, {
        ...baseItem,
        eTag: '"etag-new"',
      })
    },
  })
  try {
    const entry = await provider.writeFile({
      resourceId: 'file-id',
      parentResourceId: 'root-id',
      name: 'document.md',
      expectedVersion: 'onedrive-etag:"etag-old"',
      mimeType: 'text/markdown',
      bytes,
      expectedHash,
      idempotencyKey: 'write-1',
      operation: writeOperation,
    })
    assert.equal(entry.versionTag, 'onedrive-etag:"etag-new"')
    assert.equal(writeCall, 3)
  } finally {
    writeOperation.dispose()
  }
})

test('relay seals provider IDs and withholds trash authority until listing completes', async () => {
  let trashCount = 0
  const fakeProvider: FileSyncProvider = {
    providerType: 'google-drive',
    async listPage() {
      return {
        entries: [{
          resourceId: 'raw-provider-item-id',
          parentResourceId: 'raw-provider-root-id',
          name: 'document.md',
          kind: 'file',
          size: 4,
          versionTag: 'google-version:1',
          hash: { algorithm: 'sha256', value: 'a'.repeat(64) },
          mimeType: 'text/markdown',
        }],
        nextCursor: 'raw-provider-next-page',
        incomplete: false,
      }
    },
    async read() {
      throw new Error('not used')
    },
    async createDirectory() {
      throw new Error('not used')
    },
    async writeFile() {
      throw new Error('not used')
    },
    async trash() {
      trashCount += 1
    },
  }
  const registry = new FileSyncProviderRegistry([{
    providerId: 'google-workspace',
    workspaceId: 'workspace-1',
    label: 'Google Workspace',
    rootKey: 'workspace-root',
    rootResourceId: 'raw-provider-root-id',
    provider: fakeProvider,
  }])
  const handler = createFileSyncRelayHandler({
    env: { KNOWGRPH_STORAGE_DEV_REMOTE_RELAY_ENABLED: 'true' },
    authHooks: activeEditorHooks,
    registry,
    tokenCodec: new StorageRelayOpaqueTokenCodec({
      secret: 'test-secret-with-at-least-sixteen-characters',
    }),
  })
  const listResponse = await handler(new Request('http://localhost/api/storage/file-sync/relay', {
    method: 'POST',
    headers: {
      authorization: 'Bearer local-session',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      apiVersion: 'knowgrph-storage-relay/v1',
      workspaceId: 'workspace-1',
      providerId: 'google-workspace',
      action: 'list',
    }),
  }))
  assert.equal(listResponse.status, 200)
  const listText = await listResponse.text()
  assert.equal(listText.includes('raw-provider-item-id'), false)
  assert.equal(listText.includes('raw-provider-next-page'), false)
  const page = JSON.parse(listText) as {
    entries: Array<{ entryKey: string; versionTag: string }>
    listingFence: string | null
    incomplete: boolean
  }
  assert.equal(page.incomplete, true)
  assert.equal(page.listingFence, null)

  const trashResponse = await handler(new Request('http://localhost/api/storage/file-sync/relay', {
    method: 'POST',
    headers: {
      authorization: 'Bearer local-session',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      apiVersion: 'knowgrph-storage-relay/v1',
      workspaceId: 'workspace-1',
      providerId: 'google-workspace',
      action: 'trash',
      entryKey: page.entries[0]?.entryKey,
      expectedVersion: page.entries[0]?.versionTag,
      listingFence: null,
    }),
  }))
  assert.equal(trashResponse.status, 400)
  assert.equal(trashCount, 0)
})
