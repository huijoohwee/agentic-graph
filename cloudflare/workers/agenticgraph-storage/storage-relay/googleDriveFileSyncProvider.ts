import {
  assertFileSyncEntry,
  assertFileSyncName,
  assertFileSyncResourceId,
  assertMatchingFileSyncHash,
  computeFileSyncSha256,
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

const DRIVE_API_BASE = 'https://www.googleapis.com/drive/v3'
const DRIVE_UPLOAD_BASE = 'https://www.googleapis.com/upload/drive/v3'
const GOOGLE_FOLDER_MIME = 'application/vnd.google-apps.folder'
const GOOGLE_SHORTCUT_MIME = 'application/vnd.google-apps.shortcut'
const GOOGLE_NATIVE_MIME_PREFIX = 'application/vnd.google-apps.'
const FILE_FIELDS = 'id,name,mimeType,size,version,sha256Checksum,parents,trashed'

type GoogleDriveFile = {
  id?: unknown
  name?: unknown
  mimeType?: unknown
  size?: unknown
  version?: unknown
  sha256Checksum?: unknown
  parents?: unknown
  trashed?: unknown
}

type GoogleDriveListResponse = {
  files?: unknown
  nextPageToken?: unknown
  incompleteSearch?: unknown
}

const driveHeaders = (accessToken: string, includeContentType = false): Headers => {
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

const escapeDriveQueryValue = (value: string): string =>
  value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")

const readVersion = (value: unknown): string => {
  const version = typeof value === 'string' || typeof value === 'number' ? String(value) : ''
  if (!/^[1-9][0-9]{0,30}$/u.test(version)) {
    throw new StorageRelayError({ code: 'invalid_response', status: 502 })
  }
  return `google-version:${version}`
}

const mapGoogleEntry = (file: GoogleDriveFile): FileSyncProviderEntry => {
  const resourceId = assertFileSyncResourceId(file.id)
  const name = assertFileSyncName(file.name)
  const mimeType = typeof file.mimeType === 'string' ? file.mimeType : ''
  if (!mimeType || file.trashed === true) {
    throw new StorageRelayError({ code: 'invalid_response', status: 502 })
  }
  const parents = Array.isArray(file.parents)
    ? file.parents.map(assertFileSyncResourceId)
    : []
  const common = {
    resourceId,
    parentResourceId: parents[0] ?? null,
    name,
    versionTag: readVersion(file.version),
    mimeType,
  }
  if (mimeType === GOOGLE_FOLDER_MIME) {
    return assertFileSyncEntry({ ...common, kind: 'directory', size: null, hash: null })
  }
  if (mimeType === GOOGLE_SHORTCUT_MIME) {
    return assertFileSyncEntry({
      ...common,
      kind: 'unsupported',
      size: null,
      hash: null,
      unsupportedReason: 'shortcut',
    })
  }
  if (mimeType.startsWith(GOOGLE_NATIVE_MIME_PREFIX)) {
    return assertFileSyncEntry({
      ...common,
      kind: 'unsupported',
      size: null,
      hash: null,
      unsupportedReason: 'native-document',
    })
  }
  const size = Number(file.size)
  if (!Number.isSafeInteger(size) || size < 0) {
    throw new StorageRelayError({ code: 'invalid_response', status: 502 })
  }
  const checksum = typeof file.sha256Checksum === 'string'
    && /^[0-9a-f]{64}$/u.test(file.sha256Checksum)
    ? file.sha256Checksum
    : null
  return assertFileSyncEntry({
    ...common,
    kind: 'file',
    size,
    hash: checksum ? { algorithm: 'sha256', value: checksum } : null,
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

const assertGoogleUploadUrl = (value: string | null): string => {
  if (!value || value.length > 4096) {
    throw new StorageRelayError({ code: 'invalid_response', status: 502 })
  }
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new StorageRelayError({ code: 'invalid_response', status: 502 })
  }
  if (
    url.protocol !== 'https:'
    || !(url.hostname === 'googleapis.com' || url.hostname.endsWith('.googleapis.com'))
    || url.username
    || url.password
  ) {
    throw new StorageRelayError({ code: 'invalid_response', status: 502 })
  }
  return url.toString()
}

export class GoogleDriveFileSyncProvider implements FileSyncProvider {
  readonly providerType = 'google-drive' as const
  private readonly accessToken: StorageRelayAccessTokenSource
  private readonly driveId: string | null

  constructor(args: { accessToken: string | StorageRelayAccessTokenSource; driveId?: string | null }) {
    this.accessToken = normalizeStorageRelayAccessTokenSource(args.accessToken)
    this.driveId = args.driveId ? assertFileSyncResourceId(args.driveId) : null
  }

  private async headers(operation: StorageRelayOperation, includeContentType = false): Promise<Headers> {
    return driveHeaders(await this.accessToken.read(operation), includeContentType)
  }

  async listPage(args: {
    parentResourceId: string
    cursor: string | null
    limit: number
    operation: StorageRelayOperation
  }): Promise<FileSyncListPageResult> {
    const parentResourceId = assertFileSyncResourceId(args.parentResourceId)
    const limit = Math.max(1, Math.min(1000, Math.floor(args.limit)))
    const url = new URL(`${DRIVE_API_BASE}/files`)
    url.searchParams.set('q', `'${escapeDriveQueryValue(parentResourceId)}' in parents and trashed = false`)
    url.searchParams.set('pageSize', String(limit))
    url.searchParams.set('fields', `nextPageToken,incompleteSearch,files(${FILE_FIELDS})`)
    url.searchParams.set('supportsAllDrives', 'true')
    url.searchParams.set('includeItemsFromAllDrives', 'true')
    if (args.cursor) url.searchParams.set('pageToken', args.cursor)
    if (this.driveId) {
      url.searchParams.set('corpora', 'drive')
      url.searchParams.set('driveId', this.driveId)
    }
    const response = await args.operation.fetch(url, { headers: await this.headers(args.operation) })
    const body = await readSuccessfulJson<GoogleDriveListResponse>(response, args.operation, [200])
    if (body.incompleteSearch === true || !Array.isArray(body.files)) {
      throw new StorageRelayError({
        code: body.incompleteSearch === true ? 'limit_exceeded' : 'invalid_response',
        status: body.incompleteSearch === true ? 413 : 502,
      })
    }
    const entries = body.files.map(file => mapGoogleEntry(file as GoogleDriveFile))
    if (entries.some(entry => entry.parentResourceId !== parentResourceId)) {
      throw new StorageRelayError({ code: 'invalid_response', status: 502 })
    }
    assertNoPortableNameCollisions(entries)
    const nextCursor = body.nextPageToken == null ? null : String(body.nextPageToken)
    if (nextCursor != null && (!nextCursor || nextCursor.length > 2048)) {
      throw new StorageRelayError({ code: 'invalid_response', status: 502 })
    }
    return { entries, nextCursor, incomplete: false }
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
    const url = new URL(`${DRIVE_API_BASE}/files/${encodeURIComponent(metadata.entry.resourceId)}`)
    url.searchParams.set('alt', 'media')
    url.searchParams.set('supportsAllDrives', 'true')
    const response = await args.operation.fetch(url, { headers: await this.headers(args.operation) })
    if (response.status !== 200) return discardAndThrowStatus(response)
    const bytes = await readStorageRelayResponseBytes(response, args.operation.budget)
    if (bytes.byteLength !== metadata.entry.size) {
      throw new StorageRelayError({ code: 'invalid_response', status: 502 })
    }
    if (metadata.entry.hash) {
      assertMatchingFileSyncHash(metadata.entry.hash, await computeFileSyncSha256(bytes))
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
    const existing = await this.findIdempotentEntry(args)
    if (existing) {
      if (existing.kind !== 'directory' || existing.name !== args.name) {
        throw new StorageRelayError({ code: 'conflict', status: 409 })
      }
      return existing
    }
    const url = new URL(`${DRIVE_API_BASE}/files`)
    url.searchParams.set('supportsAllDrives', 'true')
    url.searchParams.set('fields', FILE_FIELDS)
    const response = await args.operation.fetch(url, {
      method: 'POST',
      headers: await this.headers(args.operation, true),
      body: JSON.stringify({
        name: args.name,
        mimeType: GOOGLE_FOLDER_MIME,
        parents: [args.parentResourceId],
        appProperties: { knowgrphIdempotencyKey: args.idempotencyKey },
      }),
    })
    return mapGoogleEntry(await readSuccessfulJson<GoogleDriveFile>(response, args.operation, [200, 201]))
  }

  async writeFile(args: FileSyncWriteRequest): Promise<FileSyncProviderEntry> {
    if (args.expectedHash.algorithm !== 'sha256') {
      throw new StorageRelayError({ code: 'invalid_request', status: 400 })
    }
    assertMatchingFileSyncHash(args.expectedHash, await computeFileSyncSha256(args.bytes))
    assertFileSyncResourceId(args.parentResourceId)
    assertFileSyncName(args.name)
    let existingEntry: FileSyncProviderEntry | null = null
    let existingEtag: string | null = null
    if (args.resourceId) {
      const metadata = await this.readMetadata(args.resourceId, args.operation)
      existingEntry = metadata.entry
      existingEtag = metadata.etag
      if (
        existingEntry.kind !== 'file'
        || !args.expectedVersion
        || existingEntry.versionTag !== args.expectedVersion
        || !existingEtag
      ) {
        throw new StorageRelayError({ code: 'conflict', status: 409 })
      }
    } else {
      if (args.expectedVersion) throw new StorageRelayError({ code: 'invalid_request', status: 400 })
      const idempotent = await this.findIdempotentEntry(args)
      if (idempotent) {
        if (
          idempotent.kind !== 'file'
          || idempotent.name !== args.name
          || idempotent.size !== args.bytes.byteLength
          || !idempotent.hash
        ) {
          throw new StorageRelayError({ code: 'conflict', status: 409 })
        }
        assertMatchingFileSyncHash(args.expectedHash, idempotent.hash)
        return idempotent
      }
    }
    const target = args.resourceId ? `/files/${encodeURIComponent(args.resourceId)}` : '/files'
    const initiationUrl = new URL(`${DRIVE_UPLOAD_BASE}${target}`)
    initiationUrl.searchParams.set('uploadType', 'resumable')
    initiationUrl.searchParams.set('supportsAllDrives', 'true')
    initiationUrl.searchParams.set('fields', FILE_FIELDS)
    const headers = await this.headers(args.operation, true)
    headers.set('x-upload-content-length', String(args.bytes.byteLength))
    headers.set('x-upload-content-type', args.mimeType)
    if (existingEtag) headers.set('if-match', existingEtag)
    const metadata = args.resourceId
      ? { name: args.name }
      : {
          name: args.name,
          parents: [args.parentResourceId],
          appProperties: { knowgrphIdempotencyKey: args.idempotencyKey },
        }
    const initiation = await args.operation.fetch(initiationUrl, {
      method: args.resourceId ? 'PATCH' : 'POST',
      headers,
      body: JSON.stringify(metadata),
    })
    if (initiation.status === 409 || initiation.status === 412) return discardAndThrowStatus(initiation)
    if (initiation.status !== 200 && initiation.status !== 201) return discardAndThrowStatus(initiation)
    const uploadUrl = assertGoogleUploadUrl(initiation.headers.get('location'))
    await discardStorageRelayResponse(initiation)
    const uploadResponse = await args.operation.fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'content-type': args.mimeType,
        'content-length': String(args.bytes.byteLength),
      },
      body: args.bytes,
    })
    const uploaded = mapGoogleEntry(
      await readSuccessfulJson<GoogleDriveFile>(uploadResponse, args.operation, [200, 201]),
    )
    if (uploaded.kind !== 'file' || uploaded.size !== args.bytes.byteLength) {
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
    if (metadata.entry.versionTag !== args.expectedVersion || !metadata.etag) {
      throw new StorageRelayError({ code: 'conflict', status: 409 })
    }
    const url = new URL(`${DRIVE_API_BASE}/files/${encodeURIComponent(args.resourceId)}`)
    url.searchParams.set('supportsAllDrives', 'true')
    url.searchParams.set('fields', FILE_FIELDS)
    const headers = await this.headers(args.operation, true)
    headers.set('if-match', metadata.etag)
    const response = await args.operation.fetch(url, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ trashed: true }),
    })
    await readSuccessfulJson<GoogleDriveFile>(response, args.operation, [200])
  }

  private async readMetadata(
    resourceIdValue: string,
    operation: StorageRelayOperation,
  ): Promise<{ entry: FileSyncProviderEntry; etag: string | null }> {
    const resourceId = assertFileSyncResourceId(resourceIdValue)
    const url = new URL(`${DRIVE_API_BASE}/files/${encodeURIComponent(resourceId)}`)
    url.searchParams.set('supportsAllDrives', 'true')
    url.searchParams.set('fields', FILE_FIELDS)
    const response = await operation.fetch(url, { headers: await this.headers(operation) })
    if (response.status !== 200) return discardAndThrowStatus(response)
    const etag = response.headers.get('etag')
    const entry = mapGoogleEntry(await readStorageRelayJsonResponse<GoogleDriveFile>(response, operation.budget))
    return { entry, etag }
  }

  private async findIdempotentEntry(args: {
    parentResourceId: string
    idempotencyKey: string
    operation: StorageRelayOperation
  }): Promise<FileSyncProviderEntry | null> {
    if (
      !args.idempotencyKey
      || args.idempotencyKey.length > 128
      || /[\u0000-\u001f\u007f'\\]/u.test(args.idempotencyKey)
    ) {
      throw new StorageRelayError({ code: 'invalid_request', status: 400 })
    }
    const url = new URL(`${DRIVE_API_BASE}/files`)
    url.searchParams.set(
      'q',
      `'${escapeDriveQueryValue(args.parentResourceId)}' in parents and trashed = false`
      + ` and appProperties has { key='knowgrphIdempotencyKey' and value='${escapeDriveQueryValue(args.idempotencyKey)}' }`,
    )
    url.searchParams.set('pageSize', '2')
    url.searchParams.set('fields', `incompleteSearch,files(${FILE_FIELDS})`)
    url.searchParams.set('supportsAllDrives', 'true')
    url.searchParams.set('includeItemsFromAllDrives', 'true')
    if (this.driveId) {
      url.searchParams.set('corpora', 'drive')
      url.searchParams.set('driveId', this.driveId)
    }
    const response = await args.operation.fetch(url, { headers: await this.headers(args.operation) })
    const body = await readSuccessfulJson<GoogleDriveListResponse>(response, args.operation, [200])
    if (body.incompleteSearch === true || !Array.isArray(body.files) || body.files.length > 1) {
      throw new StorageRelayError({
        code: body.incompleteSearch === true ? 'limit_exceeded' : 'conflict',
        status: body.incompleteSearch === true ? 413 : 409,
      })
    }
    return body.files.length === 1 ? mapGoogleEntry(body.files[0] as GoogleDriveFile) : null
  }
}
