import {
  assertFileSyncEntry,
  assertFileSyncName,
  assertFileSyncResourceId,
  assertMatchingFileSyncHash,
  computeFileSyncQuickXor,
  type FileSyncListPageResult,
  type FileSyncProvider,
  type FileSyncProviderEntry,
  type FileSyncWriteRequest,
} from './fileSyncProvider'
import {
  discardStorageRelayResponse,
  mapStorageRelayUpstreamStatus,
  readStorageRelayJsonResponse,
  readStorageRelayResponseBytes,
  StorageRelayError,
  type StorageRelayOperation,
} from './storageRelaySafety'
import {
  normalizeStorageRelayAccessTokenSource,
  type StorageRelayAccessTokenSource,
} from './storageRelayAccessToken'

const GRAPH_ORIGIN = 'https://graph.microsoft.com'
const DRIVE_ITEM_SELECT = 'id,name,size,eTag,file,folder,package,remoteItem,parentReference,deleted'

type GraphDriveItem = {
  id?: unknown
  name?: unknown
  size?: unknown
  eTag?: unknown
  file?: { mimeType?: unknown; hashes?: { quickXorHash?: unknown } }
  folder?: unknown
  package?: unknown
  remoteItem?: unknown
  parentReference?: { id?: unknown }
  deleted?: unknown
}

type GraphChildrenResponse = {
  value?: unknown
  '@odata.nextLink'?: unknown
}

const graphHeaders = (accessToken: string, includeContentType = false): Headers => {
  const headers = new Headers({
    accept: 'application/json',
    authorization: `Bearer ${accessToken}`,
  })
  if (includeContentType) headers.set('content-type', 'application/json')
  return headers
}

const discardAndThrowStatus = async (response: Response): Promise<never> => {
  const status = response.status
  await discardStorageRelayResponse(response)
  throw mapStorageRelayUpstreamStatus(status)
}

const readSuccessfulJson = async <Value>(
  response: Response,
  operation: StorageRelayOperation,
  acceptedStatuses: readonly number[],
): Promise<Value> => {
  if (!acceptedStatuses.includes(response.status)) return discardAndThrowStatus(response)
  return readStorageRelayJsonResponse<Value>(response, operation.budget)
}

const readGraphVersion = (value: unknown): { versionTag: string; etag: string } => {
  if (
    typeof value !== 'string'
    || !value
    || value.length > 256
    || /[\u0000-\u001f\u007f]/u.test(value)
  ) {
    throw new StorageRelayError({ code: 'invalid_response', status: 502 })
  }
  return { versionTag: `onedrive-etag:${value}`, etag: value }
}

const mapGraphEntry = (item: GraphDriveItem): FileSyncProviderEntry => {
  const resourceId = assertFileSyncResourceId(item.id)
  const name = assertFileSyncName(item.name)
  const { versionTag } = readGraphVersion(item.eTag)
  const parentResourceId = item.parentReference?.id == null
    ? null
    : assertFileSyncResourceId(item.parentReference.id)
  if (item.deleted != null) {
    throw new StorageRelayError({ code: 'invalid_response', status: 502 })
  }
  const common = { resourceId, parentResourceId, name, versionTag }
  if (item.remoteItem != null) {
    return assertFileSyncEntry({
      ...common,
      kind: 'unsupported',
      size: null,
      hash: null,
      mimeType: null,
      unsupportedReason: 'remote-item',
    })
  }
  if (item.package != null) {
    return assertFileSyncEntry({
      ...common,
      kind: 'unsupported',
      size: null,
      hash: null,
      mimeType: null,
      unsupportedReason: 'package',
    })
  }
  if (item.folder != null) {
    return assertFileSyncEntry({
      ...common,
      kind: 'directory',
      size: null,
      hash: null,
      mimeType: null,
    })
  }
  if (!item.file || typeof item.file !== 'object') {
    throw new StorageRelayError({ code: 'invalid_response', status: 502 })
  }
  const size = Number(item.size)
  if (!Number.isSafeInteger(size) || size < 0) {
    throw new StorageRelayError({ code: 'invalid_response', status: 502 })
  }
  const quickXorHash = item.file.hashes?.quickXorHash
  const hash = typeof quickXorHash === 'string' && /^[A-Za-z0-9+/]+={0,2}$/u.test(quickXorHash)
    ? { algorithm: 'quickxor' as const, value: quickXorHash }
    : null
  return assertFileSyncEntry({
    ...common,
    kind: 'file',
    size,
    hash,
    mimeType: typeof item.file.mimeType === 'string' ? item.file.mimeType : null,
  })
}

const assertNoPortableNameCollisions = (entries: readonly FileSyncProviderEntry[]): void => {
  const seen = new Set<string>()
  for (const entry of entries) {
    const portableName = entry.name.normalize('NFC').toLocaleLowerCase('en-US')
    if (seen.has(portableName)) {
      throw new StorageRelayError({ code: 'conflict', status: 409 })
    }
    seen.add(portableName)
  }
}

const assertGraphNextCursor = (value: unknown, expectedPath: string): string | null => {
  if (value == null) return null
  if (typeof value !== 'string' || value.length > 8192) {
    throw new StorageRelayError({ code: 'invalid_response', status: 502 })
  }
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new StorageRelayError({ code: 'invalid_response', status: 502 })
  }
  const skipToken = url.searchParams.get('$skiptoken')
  if (
    url.origin !== GRAPH_ORIGIN
    || url.pathname !== expectedPath
    || !skipToken
    || skipToken.length > 4096
  ) {
    throw new StorageRelayError({ code: 'invalid_response', status: 502 })
  }
  return skipToken
}

const assertPreauthenticatedUrl = (value: unknown): string => {
  if (typeof value !== 'string' || value.length > 8192) {
    throw new StorageRelayError({ code: 'invalid_response', status: 502 })
  }
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new StorageRelayError({ code: 'invalid_response', status: 502 })
  }
  const hostname = url.hostname.toLowerCase()
  const privateIpv4 = /^(?:127\.|10\.|192\.168\.|169\.254\.|172\.(?:1[6-9]|2[0-9]|3[01])\.)/u.test(hostname)
  if (
    url.protocol !== 'https:'
    || url.username
    || url.password
    || url.port
    || hostname === 'localhost'
    || hostname === '::1'
    || hostname.endsWith('.local')
    || privateIpv4
  ) {
    throw new StorageRelayError({ code: 'invalid_response', status: 502 })
  }
  return url.toString()
}

const encodeGraphPathName = (name: string): string =>
  encodeURIComponent(name).replace(/%2F/giu, '%252F')

export class OneDriveFileSyncProvider implements FileSyncProvider {
  readonly providerType = 'one-drive' as const
  private readonly accessToken: StorageRelayAccessTokenSource
  private readonly driveId: string

  constructor(args: { accessToken: string | StorageRelayAccessTokenSource; driveId: string }) {
    this.accessToken = normalizeStorageRelayAccessTokenSource(args.accessToken)
    this.driveId = assertFileSyncResourceId(args.driveId)
  }

  private async headers(operation: StorageRelayOperation, includeContentType = false): Promise<Headers> {
    return graphHeaders(await this.accessToken.read(operation), includeContentType)
  }

  async listPage(args: {
    parentResourceId: string
    cursor: string | null
    limit: number
    operation: StorageRelayOperation
  }): Promise<FileSyncListPageResult> {
    const parentResourceId = assertFileSyncResourceId(args.parentResourceId)
    const path = `/v1.0/drives/${encodeURIComponent(this.driveId)}/items/${encodeURIComponent(parentResourceId)}/children`
    const url = new URL(`${GRAPH_ORIGIN}${path}`)
    url.searchParams.set('$select', DRIVE_ITEM_SELECT)
    url.searchParams.set('$top', String(Math.max(1, Math.min(200, Math.floor(args.limit)))))
    if (args.cursor) url.searchParams.set('$skiptoken', args.cursor)
    const response = await args.operation.fetch(url, { headers: await this.headers(args.operation) })
    const body = await readSuccessfulJson<GraphChildrenResponse>(response, args.operation, [200])
    if (!Array.isArray(body.value)) {
      throw new StorageRelayError({ code: 'invalid_response', status: 502 })
    }
    const entries = body.value.map(item => mapGraphEntry(item as GraphDriveItem))
    if (entries.some(entry => entry.parentResourceId !== parentResourceId)) {
      throw new StorageRelayError({ code: 'invalid_response', status: 502 })
    }
    assertNoPortableNameCollisions(entries)
    return {
      entries,
      nextCursor: assertGraphNextCursor(body['@odata.nextLink'], path),
      incomplete: false,
    }
  }

  async read(args: {
    resourceId: string
    expectedVersion: string | null
    operation: StorageRelayOperation
  }) {
    const metadata = await this.readMetadata(args.resourceId, args.operation)
    if (metadata.entry.kind !== 'file') {
      throw new StorageRelayError({ code: 'invalid_request', status: 400 })
    }
    if (args.expectedVersion && metadata.entry.versionTag !== args.expectedVersion) {
      throw new StorageRelayError({ code: 'conflict', status: 409 })
    }
    const response = await args.operation.fetch(
      `${this.itemUrl(metadata.entry.resourceId)}/content`,
      { headers: await this.headers(args.operation), redirect: 'manual' },
    )
    if (response.status !== 302) return discardAndThrowStatus(response)
    const downloadUrl = assertPreauthenticatedUrl(response.headers.get('location'))
    await discardStorageRelayResponse(response)
    const contentResponse = await args.operation.fetch(downloadUrl, { redirect: 'follow' })
    if (contentResponse.status !== 200) return discardAndThrowStatus(contentResponse)
    const bytes = await readStorageRelayResponseBytes(contentResponse, args.operation.budget)
    if (bytes.byteLength !== metadata.entry.size) {
      throw new StorageRelayError({ code: 'invalid_response', status: 502 })
    }
    if (metadata.entry.hash) {
      assertMatchingFileSyncHash(metadata.entry.hash, computeFileSyncQuickXor(bytes))
    }
    return { entry: metadata.entry, bytes }
  }

  async createDirectory(args: {
    parentResourceId: string
    name: string
    idempotencyKey: string
    operation: StorageRelayOperation
  }): Promise<FileSyncProviderEntry> {
    assertFileSyncResourceId(args.parentResourceId)
    assertFileSyncName(args.name)
    const existing = await this.readChildByName(args.parentResourceId, args.name, args.operation)
    if (existing) {
      if (existing.kind !== 'directory') {
        throw new StorageRelayError({ code: 'conflict', status: 409 })
      }
      return existing
    }
    const response = await args.operation.fetch(`${this.itemUrl(args.parentResourceId)}/children`, {
      method: 'POST',
      headers: await this.headers(args.operation, true),
      body: JSON.stringify({
        name: args.name,
        folder: {},
        '@microsoft.graph.conflictBehavior': 'fail',
      }),
    })
    return mapGraphEntry(await readSuccessfulJson<GraphDriveItem>(response, args.operation, [201]))
  }

  async writeFile(args: FileSyncWriteRequest): Promise<FileSyncProviderEntry> {
    if (args.expectedHash.algorithm !== 'quickxor') {
      throw new StorageRelayError({ code: 'invalid_request', status: 400 })
    }
    assertMatchingFileSyncHash(args.expectedHash, computeFileSyncQuickXor(args.bytes))
    assertFileSyncResourceId(args.parentResourceId)
    assertFileSyncName(args.name)
    let currentEtag: string | null = null
    if (args.resourceId) {
      const current = await this.readMetadata(args.resourceId, args.operation)
      if (
        current.entry.kind !== 'file'
        || !args.expectedVersion
        || current.entry.versionTag !== args.expectedVersion
      ) {
        throw new StorageRelayError({ code: 'conflict', status: 409 })
      }
      currentEtag = current.etag
    } else {
      if (args.expectedVersion) throw new StorageRelayError({ code: 'invalid_request', status: 400 })
      const existing = await this.readChildByName(args.parentResourceId, args.name, args.operation)
      if (existing) {
        if (
          existing.kind !== 'file'
          || existing.size !== args.bytes.byteLength
          || !existing.hash
        ) {
          throw new StorageRelayError({ code: 'conflict', status: 409 })
        }
        assertMatchingFileSyncHash(args.expectedHash, existing.hash)
        return existing
      }
    }
    if (args.bytes.byteLength === 0) {
      return this.writeEmptyFile({
        ...args,
        currentEtag,
      })
    }
    const sessionUrl = args.resourceId
      ? `${this.itemUrl(args.resourceId)}/createUploadSession`
      : `${this.itemUrl(args.parentResourceId)}:/${encodeGraphPathName(args.name)}:/createUploadSession`
    const sessionHeaders = await this.headers(args.operation, true)
    if (currentEtag) sessionHeaders.set('if-match', currentEtag)
    const sessionResponse = await args.operation.fetch(sessionUrl, {
      method: 'POST',
      headers: sessionHeaders,
      body: JSON.stringify({
        item: {
          name: args.name,
          '@microsoft.graph.conflictBehavior': 'fail',
        },
      }),
    })
    const session = await readSuccessfulJson<{ uploadUrl?: unknown }>(
      sessionResponse,
      args.operation,
      [200],
    )
    const uploadUrl = assertPreauthenticatedUrl(session.uploadUrl)
    let uploadResponse: Response
    try {
      uploadResponse = await args.operation.fetch(uploadUrl, {
        method: 'PUT',
        headers: {
          'content-length': String(args.bytes.byteLength),
          'content-range': `bytes 0-${args.bytes.byteLength - 1}/${args.bytes.byteLength}`,
          'content-type': 'application/octet-stream',
        },
        body: args.bytes,
      })
    } catch (error) {
      if (!args.operation.signal.aborted) {
        await args.operation.fetch(uploadUrl, { method: 'DELETE' }).catch(() => undefined)
      }
      throw error
    }
    if (uploadResponse.status !== 200 && uploadResponse.status !== 201) {
      const status = uploadResponse.status
      await discardStorageRelayResponse(uploadResponse)
      if (!args.operation.signal.aborted) {
        await args.operation.fetch(uploadUrl, { method: 'DELETE' }).catch(() => undefined)
      }
      throw mapStorageRelayUpstreamStatus(status)
    }
    const uploaded = mapGraphEntry(
      await readStorageRelayJsonResponse<GraphDriveItem>(uploadResponse, args.operation.budget),
    )
    if (uploaded.kind !== 'file' || uploaded.size !== args.bytes.byteLength) {
      throw new StorageRelayError({ code: 'invalid_response', status: 502 })
    }
    assertMatchingFileSyncHash(args.expectedHash, uploaded.hash)
    return uploaded
  }

  private async writeEmptyFile(
    args: FileSyncWriteRequest & { currentEtag: string | null },
  ): Promise<FileSyncProviderEntry> {
    const url = args.resourceId
      ? new URL(`${this.itemUrl(args.resourceId)}/content`)
      : new URL(`${this.itemUrl(args.parentResourceId)}:/${encodeGraphPathName(args.name)}:/content`)
    url.searchParams.set('$select', DRIVE_ITEM_SELECT)
    const headers = await this.headers(args.operation)
    headers.set('content-type', args.mimeType)
    headers.set('content-length', '0')
    headers.set(args.currentEtag ? 'if-match' : 'if-none-match', args.currentEtag || '*')
    const response = await args.operation.fetch(url, {
      method: 'PUT',
      headers,
      body: args.bytes,
    })
    const uploaded = mapGraphEntry(
      await readSuccessfulJson<GraphDriveItem>(response, args.operation, [200, 201]),
    )
    if (uploaded.kind !== 'file' || uploaded.size !== 0) {
      throw new StorageRelayError({ code: 'invalid_response', status: 502 })
    }
    assertMatchingFileSyncHash(args.expectedHash, uploaded.hash)
    return uploaded
  }

  async trash(args: {
    resourceId: string
    expectedVersion: string
    operation: StorageRelayOperation
  }): Promise<void> {
    const metadata = await this.readMetadata(args.resourceId, args.operation)
    if (metadata.entry.versionTag !== args.expectedVersion) {
      throw new StorageRelayError({ code: 'conflict', status: 409 })
    }
    const headers = await this.headers(args.operation)
    headers.set('if-match', metadata.etag)
    const response = await args.operation.fetch(this.itemUrl(args.resourceId), {
      method: 'DELETE',
      headers,
    })
    if (response.status !== 204) return discardAndThrowStatus(response)
    await discardStorageRelayResponse(response)
  }

  private itemUrl(resourceId: string): string {
    return `${GRAPH_ORIGIN}/v1.0/drives/${encodeURIComponent(this.driveId)}/items/${encodeURIComponent(assertFileSyncResourceId(resourceId))}`
  }

  private async readMetadata(
    resourceId: string,
    operation: StorageRelayOperation,
  ): Promise<{ entry: FileSyncProviderEntry; etag: string }> {
    const url = new URL(this.itemUrl(resourceId))
    url.searchParams.set('$select', DRIVE_ITEM_SELECT)
    const response = await operation.fetch(url, { headers: await this.headers(operation) })
    const body = await readSuccessfulJson<GraphDriveItem>(response, operation, [200])
    const { etag } = readGraphVersion(body.eTag)
    return { entry: mapGraphEntry(body), etag }
  }

  private async readChildByName(
    parentResourceId: string,
    name: string,
    operation: StorageRelayOperation,
  ): Promise<FileSyncProviderEntry | null> {
    const url = new URL(`${this.itemUrl(parentResourceId)}:/${encodeGraphPathName(name)}`)
    url.searchParams.set('$select', DRIVE_ITEM_SELECT)
    const response = await operation.fetch(url, { headers: await this.headers(operation) })
    if (response.status === 404) {
      await discardStorageRelayResponse(response)
      return null
    }
    return mapGraphEntry(await readSuccessfulJson<GraphDriveItem>(response, operation, [200]))
  }
}
