import assert from 'node:assert/strict'
import {
  createKnowgrphStorageFileSyncRelayProvider,
  type KnowgrphStorageFileSyncRelayFetch,
} from '../lib/storage/knowgrphStorageFileSyncRelay'
import {
  FILE_SYNC_RELAY_API_VERSION,
  decodeRelayJsonHeader,
  encodeRelayJsonHeader,
  sha256Hex,
  type RelayEntry,
} from '../lib/storage/knowgrphStorageFileSyncRelaySupport'

type MockNode = {
  kind: 'file' | 'directory'
  bytes: Uint8Array
  revision: number
  mimeType: string | null
}

const WORKSPACE_ID = 'workspace-relay'
const PROVIDER_ID = 'google-workspace'
const SESSION_BEARER = 'session-bearer-secret'
const signal = new AbortController().signal

class StatefulRelay {
  readonly nodes = new Map<string, MockNode>()
  readonly actions: string[] = []
  generation = 0
  lastReadEntryKey = ''
  lastWriteMetadata: Record<string, unknown> | null = null
  lastWriteSha256 = ''
  lastTrashPayload: Record<string, unknown> | null = null

  readonly fetch: KnowgrphStorageFileSyncRelayFetch = async (input, init = {}) => {
    assert.equal(String(input), 'http://localhost/api/storage/file-sync/relay')
    const headers = new Headers(init.headers)
    assert.equal(headers.get('authorization'), `Bearer ${SESSION_BEARER}`)
    if (init.method === 'PUT') return this.write(headers, init.body)
    const payload = JSON.parse(String(init.body)) as Record<string, unknown>
    const action = String(payload.action)
    this.actions.push(action)
    if (action === 'providers') {
      this.generation += 1
      return jsonResponse({
        ok: true,
        apiVersion: FILE_SYNC_RELAY_API_VERSION,
        providers: [{
          providerId: PROVIDER_ID,
          label: 'Google Workspace',
          providerType: 'google-drive',
        }],
      })
    }
    if (action === 'list') return this.list(payload)
    if (action === 'read') return this.read(payload)
    if (action === 'create-directory') return this.createDirectory(payload)
    if (action === 'trash') return this.trash(payload)
    return jsonResponse({
      ok: false,
      apiVersion: FILE_SYNC_RELAY_API_VERSION,
      code: 'invalid_request',
    }, 400)
  }

  seedDirectory(path: string): void {
    this.nodes.set(path, {
      kind: 'directory',
      bytes: new Uint8Array(),
      revision: 1,
      mimeType: null,
    })
  }

  seedFile(path: string, bytes: Uint8Array): void {
    this.nodes.set(path, {
      kind: 'file',
      bytes: new Uint8Array(bytes),
      revision: 1,
      mimeType: path.endsWith('.md') ? 'text/markdown' : 'application/octet-stream',
    })
  }

  private async list(payload: Record<string, unknown>): Promise<Response> {
    const parentPath = payload.parentKey == null
      ? ''
      : this.pathFromEntryKey(String(payload.parentKey))
    const children = [...this.nodes.entries()]
      .filter(([path]) => parentOf(path) === parentPath)
      .sort(([left], [right]) => left.localeCompare(right))
    const offset = payload.cursor == null ? 0 : Number(String(payload.cursor).split(':').pop())
    const page = children.slice(offset, offset + 1)
    const nextOffset = offset + page.length
    const nextCursor = nextOffset < children.length
      ? `cursor:${this.generation}:${nextOffset}`
      : null
    return jsonResponse({
      ok: true,
      apiVersion: FILE_SYNC_RELAY_API_VERSION,
      providerId: PROVIDER_ID,
      entries: await Promise.all(page.map(([path, node]) => this.entry(path, node))),
      nextCursor,
      incomplete: nextCursor !== null,
      listingFence: nextCursor === null
        ? `fence:${this.generation}:${parentPath || 'root'}`
        : null,
    })
  }

  private async read(payload: Record<string, unknown>): Promise<Response> {
    const entryKey = String(payload.entryKey)
    this.lastReadEntryKey = entryKey
    const path = this.pathFromEntryKey(entryKey)
    const node = this.nodes.get(path)
    assert.ok(node)
    assert.equal(payload.expectedVersion, revision(node))
    const entry = await this.entry(path, node)
    return new Response(node.bytes, {
      status: 200,
      headers: {
        'content-type': node.mimeType ?? 'application/octet-stream',
        'content-length': String(node.bytes.byteLength),
        'x-knowgrph-file-sync-meta': encodeRelayJsonHeader({
          operationId: 'read-operation',
          providerId: PROVIDER_ID,
          entry,
        }),
      },
    })
  }

  private async createDirectory(
    payload: Record<string, unknown>,
  ): Promise<Response> {
    const parentPath = payload.parentKey == null
      ? ''
      : this.pathFromEntryKey(String(payload.parentKey))
    const path = parentPath
      ? `${parentPath}/${String(payload.name)}`
      : String(payload.name)
    assert.match(String(payload.idempotencyKey), /^file-sync:[0-9a-f]{64}$/)
    this.seedDirectory(path)
    return this.entryResponse(await this.entry(path, this.nodes.get(path)!))
  }

  private async write(headers: Headers, body: BodyInit | null | undefined) {
    this.actions.push('write')
    const rawMetadata = headers.get('x-knowgrph-file-sync-meta')
    assert.ok(rawMetadata)
    const metadata = decodeRelayJsonHeader<Record<string, unknown>>(rawMetadata)
    this.lastWriteMetadata = metadata
    this.lastWriteSha256 = String(headers.get('x-knowgrph-content-sha256'))
    const bytes = new Uint8Array(await new Response(body).arrayBuffer())
    const parentPath = metadata.parentKey == null
      ? ''
      : this.pathFromEntryKey(String(metadata.parentKey))
    const requestedPath = parentPath
      ? `${parentPath}/${String(metadata.name)}`
      : String(metadata.name)
    const path = metadata.entryKey == null
      ? requestedPath
      : this.pathFromEntryKey(String(metadata.entryKey))
    assert.equal(path, requestedPath)
    const previous = this.nodes.get(path)
    assert.equal(
      metadata.expectedVersion,
      previous ? revision(previous) : null,
    )
    assert.equal(
      (metadata.contentHash as { algorithm: string }).algorithm,
      'sha256',
    )
    assert.match(String(metadata.idempotencyKey), /^file-sync:[0-9a-f]{64}$/)
    assert.equal('url' in metadata, false)
    assert.equal('token' in metadata, false)
    assert.equal('resourceId' in metadata, false)
    this.nodes.set(path, {
      kind: 'file',
      bytes,
      revision: (previous?.revision ?? 0) + 1,
      mimeType: String(metadata.mimeType),
    })
    return this.entryResponse(await this.entry(path, this.nodes.get(path)!))
  }

  private async trash(payload: Record<string, unknown>): Promise<Response> {
    this.lastTrashPayload = payload
    const path = this.pathFromEntryKey(String(payload.entryKey))
    const node = this.nodes.get(path)
    assert.ok(node)
    assert.equal(payload.expectedVersion, revision(node))
    assert.equal(
      payload.listingFence,
      `fence:${this.generation}:${parentOf(path) || 'root'}`,
    )
    this.nodes.delete(path)
    return jsonResponse({
      ok: true,
      apiVersion: FILE_SYNC_RELAY_API_VERSION,
      providerId: PROVIDER_ID,
      fileKey: stableKey(path),
      trashed: true,
    })
  }

  private async entry(path: string, node: MockNode): Promise<RelayEntry> {
    return {
      entryKey: `entry:${this.generation}:${path}`,
      fileKey: stableKey(path),
      name: basename(path),
      kind: node.kind,
      size: node.kind === 'file' ? node.bytes.byteLength : null,
      versionTag: revision(node),
      hash: node.kind === 'file'
        ? { algorithm: 'sha256', value: await sha256Hex(node.bytes) }
        : null,
      mimeType: node.mimeType,
    }
  }

  private entryResponse(entry: RelayEntry): Response {
    return jsonResponse({
      ok: true,
      apiVersion: FILE_SYNC_RELAY_API_VERSION,
      providerId: PROVIDER_ID,
      entry,
    })
  }

  private pathFromEntryKey(entryKey: string): string {
    const prefix = `entry:${this.generation}:`
    assert.ok(entryKey.startsWith(prefix), 'entry mapping was not refreshed')
    return entryKey.slice(prefix.length)
  }
}

// Pull/read: opaque relay keys are rebuilt but never exposed as browser file keys.
export async function testKnowgrphStorageFileSyncRelayPullReadLogicalPaths() {
  const relay = new StatefulRelay()
  const noteBytes = new TextEncoder().encode('# Relay note')
  relay.seedDirectory('docs')
  relay.seedFile('docs/note.md', noteBytes)
  relay.seedFile('root.bin', new Uint8Array([1, 2, 3]))
  const provider = createProvider(relay)

  const first = await provider.list('', null, signal)
  assert.deepEqual(
    first.entries.map(entry => entry.key),
    ['docs', 'docs/note.md', 'root.bin'],
  )
  assert.equal(first.complete, true)
  assert.equal(first.nextCursor, null)
  assert.ok(first.snapshotVersion.length <= 256)
  assert.equal(JSON.stringify(first).includes('entry:'), false)
  assert.equal(JSON.stringify(first).includes('stable:'), false)

  const second = await provider.list('', null, signal)
  assert.equal(second.snapshotVersion, first.snapshotVersion)
  const scansBeforePointReads = relay.actions.filter(action => action === 'providers').length
  const stat = await provider.stat('docs/note.md', signal)
  assert.equal(stat?.key, 'docs/note.md')
  const read = await provider.read('docs/note.md', signal)
  assert.deepEqual(read.bytes, noteBytes)
  assert.equal(read.entry.key, 'docs/note.md')
  assert.match(relay.lastReadEntryKey, new RegExp(`^entry:${relay.generation}:`))
  assert.equal(
    relay.actions.filter(action => action === 'providers').length,
    scansBeforePointReads,
    'stat and read must reuse the complete listing snapshot',
  )
  const publicResult = JSON.stringify({ stat, read: read.entry })
  assert.equal(publicResult.includes(SESSION_BEARER), false)
  assert.equal(publicResult.includes('entry:'), false)
}

// Push/delete: missing parents are created recursively and trash is CAS/fence bound.
export async function testKnowgrphStorageFileSyncRelayPushWriteAndFencedDelete() {
  const relay = new StatefulRelay()
  const provider = createProvider(relay)
  const bytes = new TextEncoder().encode('relay write')
  const written = await provider.write({
    entry: {
      key: 'alpha/beta/note.md',
      kind: 'file',
      entryType: 'standard',
      sizeBytes: bytes.byteLength,
      hashes: [{ algorithm: 'sha256', value: await sha256Hex(bytes) }],
      revision: null,
      modifiedAtMs: null,
    },
    bytes,
    expectedRevision: null,
  }, signal)
  assert.equal(written.key, 'alpha/beta/note.md')
  assert.ok(relay.nodes.has('alpha'))
  assert.ok(relay.nodes.has('alpha/beta'))
  assert.deepEqual(relay.nodes.get('alpha/beta/note.md')?.bytes, bytes)
  assert.equal(
    relay.lastWriteSha256,
    (relay.lastWriteMetadata?.contentHash as { value: string }).value,
  )
  assert.deepEqual(
    relay.actions,
    ['providers', 'list', 'create-directory', 'create-directory', 'write'],
  )

  const updatedBytes = new TextEncoder().encode('relay update')
  const updated = await provider.write({
    entry: {
      ...written,
      sizeBytes: updatedBytes.byteLength,
    },
    bytes: updatedBytes,
    expectedRevision: written.revision,
  }, signal)
  assert.deepEqual(relay.nodes.get('alpha/beta/note.md')?.bytes, updatedBytes)
  assert.equal(relay.lastWriteMetadata?.expectedVersion, written.revision)
  assert.match(String(relay.lastWriteMetadata?.entryKey), /^entry:1:/)

  await provider.delete('alpha/beta/note.md', signal, updated.revision)
  assert.equal(relay.nodes.has('alpha/beta/note.md'), false)
  assert.ok(relay.lastTrashPayload)
  assert.match(
    String(relay.lastTrashPayload?.listingFence),
    /^fence:2:alpha\/beta$/,
  )
  assert.equal(
    relay.actions.filter(action => action === 'providers').length,
    2,
    'sequential writes reuse one snapshot and delete refreshes only to acquire a new-directory fence',
  )
}

const createProvider = (relay: StatefulRelay) =>
  createKnowgrphStorageFileSyncRelayProvider({
    workspaceId: WORKSPACE_ID,
    providerId: PROVIDER_ID,
    buildRequestUrl: () => 'http://localhost/api/storage/file-sync/relay',
    fetcher: relay.fetch,
    readSessionBearer: () => SESSION_BEARER,
  })

const jsonResponse = (
  body: unknown,
  status = 200,
): Response => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json' },
})

const parentOf = (path: string): string => {
  const index = path.lastIndexOf('/')
  return index < 0 ? '' : path.slice(0, index)
}

const basename = (path: string): string => {
  const index = path.lastIndexOf('/')
  return index < 0 ? path : path.slice(index + 1)
}

const stableKey = (path: string): string => `stable:${path}`
const revision = (node: MockNode): string => `version:${node.revision}`
