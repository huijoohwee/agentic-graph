import {
  assertFileSyncEntry,
  assertFileSyncName,
  assertFileSyncVersionTag,
  type FileSyncHash,
  type FileSyncProviderEntry,
} from './fileSyncProvider'
import {
  FileSyncProviderRegistry,
  type FileSyncProviderRegistration,
} from './fileSyncProviderRegistry'
import {
  decodeStorageRelayJsonHeader,
  encodeStorageRelayJsonHeader,
  StorageRelayOpaqueTokenCodec,
  type StorageRelayTokenBinding,
  type StorageRelayTokenPurpose,
} from './storageRelayOpaqueToken'
import {
  assertDevStorageRelayRequest,
  authorizeStorageRelayRequest,
  createStorageRelayOperationId,
  readStorageRelayJsonRequest,
  readStorageRelayRequestBytes,
  STORAGE_RELAY_API_VERSION,
  StorageRelayError,
  StorageRelayOperation,
  storageRelayErrorResponse,
  storageRelayJsonResponse,
  type StorageRelayAuthHooks,
  type StorageRelayFetch,
} from './storageRelaySafety'

type FileSyncPostRequest = {
  apiVersion: string
  workspaceId: string
  action: 'providers' | 'list' | 'read' | 'create-directory' | 'trash'
  providerId?: string
  parentKey?: string | null
  cursor?: string | null
  entryKey?: string
  listingFence?: string
  expectedVersion?: string | null
  name?: string
  idempotencyKey?: string
  limit?: number
}

type FileSyncWriteMetadata = {
  apiVersion: string
  workspaceId: string
  providerId: string
  parentKey?: string | null
  entryKey?: string | null
  name: string
  expectedVersion?: string | null
  contentHash: FileSyncHash
  idempotencyKey: string
  mimeType: string
}

type EntryTokenPayload = {
  resourceId: string
  parentResourceId: string | null
  name: string
  kind: FileSyncProviderEntry['kind']
  versionTag: string
}

type CursorTokenPayload = {
  parentResourceId: string
  cursor: string
  pageIndex: number
}

type ListingFencePayload = {
  parentResourceId: string
  finalPageIndex: number
}

const IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/
const FORBIDDEN_CLIENT_AUTHORITY_FIELDS = [
  'url',
  'baseUrl',
  'driveId',
  'rootId',
  'rootResourceId',
  'token',
  'accessToken',
  'uploadUrl',
  'downloadUrl',
] as const

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)

const assertIdentifier = (value: unknown): string => {
  if (typeof value !== 'string' || !IDENTIFIER_PATTERN.test(value)) {
    throw new StorageRelayError({ code: 'invalid_request', status: 400 })
  }
  return value
}

const assertOptionalToken = (value: unknown): string | null => {
  if (value == null || value === '') return null
  if (typeof value !== 'string' || value.length > 16_384) {
    throw new StorageRelayError({ code: 'invalid_request', status: 400 })
  }
  return value
}

const assertIdempotencyKey = (value: unknown): string => {
  if (
    typeof value !== 'string'
    || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value)
  ) {
    throw new StorageRelayError({ code: 'invalid_request', status: 400 })
  }
  return value
}

const assertMimeType = (value: unknown): string => {
  if (
    typeof value !== 'string'
    || !/^[A-Za-z0-9!#$&^_.+-]+\/[A-Za-z0-9!#$&^_.+-]+(?:;[ -~]{1,128})?$/u.test(value)
    || value.length > 256
  ) {
    throw new StorageRelayError({ code: 'invalid_request', status: 400 })
  }
  return value
}

const parseHash = (value: unknown): FileSyncHash => {
  if (!isRecord(value)) throw new StorageRelayError({ code: 'invalid_request', status: 400 })
  if (
    value.algorithm === 'sha256'
    && typeof value.value === 'string'
    && /^[0-9a-f]{64}$/u.test(value.value)
  ) {
    return { algorithm: 'sha256', value: value.value }
  }
  if (
    value.algorithm === 'quickxor'
    && typeof value.value === 'string'
    && /^[A-Za-z0-9+/]+={0,2}$/u.test(value.value)
    && value.value.length <= 64
  ) {
    return { algorithm: 'quickxor', value: value.value }
  }
  throw new StorageRelayError({ code: 'invalid_request', status: 400 })
}

const parsePostRequest = (value: unknown): FileSyncPostRequest => {
  if (
    !isRecord(value)
    || value.apiVersion !== STORAGE_RELAY_API_VERSION
    || (
      value.action !== 'providers'
      && value.action !== 'list'
      && value.action !== 'read'
      && value.action !== 'create-directory'
      && value.action !== 'trash'
    )
  ) {
    throw new StorageRelayError({ code: 'invalid_request', status: 400 })
  }
  if (FORBIDDEN_CLIENT_AUTHORITY_FIELDS.some(field => field in value)) {
    throw new StorageRelayError({ code: 'invalid_request', status: 400 })
  }
  return {
    ...value,
    apiVersion: STORAGE_RELAY_API_VERSION,
    workspaceId: assertIdentifier(value.workspaceId),
    action: value.action,
  } as FileSyncPostRequest
}

const parseWriteMetadata = (value: unknown): FileSyncWriteMetadata => {
  if (!isRecord(value) || value.apiVersion !== STORAGE_RELAY_API_VERSION) {
    throw new StorageRelayError({ code: 'invalid_request', status: 400 })
  }
  if (FORBIDDEN_CLIENT_AUTHORITY_FIELDS.some(field => field in value)) {
    throw new StorageRelayError({ code: 'invalid_request', status: 400 })
  }
  return {
    apiVersion: STORAGE_RELAY_API_VERSION,
    workspaceId: assertIdentifier(value.workspaceId),
    providerId: assertIdentifier(value.providerId),
    parentKey: assertOptionalToken(value.parentKey),
    entryKey: assertOptionalToken(value.entryKey),
    name: assertFileSyncName(value.name),
    expectedVersion: value.expectedVersion == null
      ? null
      : assertFileSyncVersionTag(value.expectedVersion, 'request'),
    contentHash: parseHash(value.contentHash),
    idempotencyKey: assertIdempotencyKey(value.idempotencyKey),
    mimeType: assertMimeType(value.mimeType),
  }
}

const tokenBinding = (
  registration: FileSyncProviderRegistration,
  purpose: StorageRelayTokenPurpose,
): StorageRelayTokenBinding => ({
  purpose,
  workspaceId: registration.workspaceId,
  providerId: registration.providerId,
  rootKey: registration.rootKey,
})

const assertEntryTokenPayload = (value: EntryTokenPayload): EntryTokenPayload => {
  if (
    !isRecord(value)
    || typeof value.resourceId !== 'string'
    || (value.parentResourceId != null && typeof value.parentResourceId !== 'string')
    || typeof value.name !== 'string'
    || (value.kind !== 'file' && value.kind !== 'directory' && value.kind !== 'unsupported')
    || typeof value.versionTag !== 'string'
  ) {
    throw new StorageRelayError({ code: 'invalid_request', status: 400 })
  }
  return value
}

const openEntryToken = async (
  codec: StorageRelayOpaqueTokenCodec,
  registration: FileSyncProviderRegistration,
  token: string,
): Promise<EntryTokenPayload> => assertEntryTokenPayload(await codec.open<EntryTokenPayload>({
  token,
  binding: tokenBinding(registration, 'entry'),
}))

const resolveParentResourceId = async (args: {
  codec: StorageRelayOpaqueTokenCodec
  registration: FileSyncProviderRegistration
  parentKey: unknown
}): Promise<string> => {
  const parentKey = assertOptionalToken(args.parentKey)
  if (!parentKey) return args.registration.rootResourceId
  const entry = await openEntryToken(args.codec, args.registration, parentKey)
  if (entry.kind !== 'directory') {
    throw new StorageRelayError({ code: 'invalid_request', status: 400 })
  }
  return entry.resourceId
}

const sealEntry = async (args: {
  codec: StorageRelayOpaqueTokenCodec
  registration: FileSyncProviderRegistration
  entry: FileSyncProviderEntry
}) => {
  const entry = assertFileSyncEntry(args.entry)
  const entryKey = await args.codec.seal({
    binding: tokenBinding(args.registration, 'entry'),
    payload: {
      resourceId: entry.resourceId,
      parentResourceId: entry.parentResourceId,
      name: entry.name,
      kind: entry.kind,
      versionTag: entry.versionTag,
    } satisfies EntryTokenPayload,
  })
  const fileKey = await args.codec.deriveStableKey({
    workspaceId: args.registration.workspaceId,
    providerId: args.registration.providerId,
    rootKey: args.registration.rootKey,
    resourceId: entry.resourceId,
  })
  return {
    entryKey,
    fileKey,
    name: entry.name,
    kind: entry.kind,
    size: entry.size,
    versionTag: entry.versionTag,
    hash: entry.hash,
    mimeType: entry.mimeType,
    ...(entry.unsupportedReason ? { unsupportedReason: entry.unsupportedReason } : {}),
  }
}

const requireProvider = (
  registry: FileSyncProviderRegistry,
  payload: { providerId?: unknown; workspaceId: string },
): FileSyncProviderRegistration =>
  registry.resolve({
    workspaceId: payload.workspaceId,
    providerId: assertIdentifier(payload.providerId),
  })

export const createFileSyncRelayHandler = <AuthContext>(dependencies: {
  env: { AGENTICGRAPH_STORAGE_DEV_REMOTE_RELAY_ENABLED?: string }
  authHooks: StorageRelayAuthHooks<AuthContext>
  registry: FileSyncProviderRegistry
  tokenCodec: StorageRelayOpaqueTokenCodec
  fetcher?: StorageRelayFetch
  timeoutMs?: number
  maxBytes?: number
}) => async (request: Request): Promise<Response> => {
  const operationId = createStorageRelayOperationId(request)
  const operation = new StorageRelayOperation({
    fetcher: dependencies.fetcher,
    timeoutMs: dependencies.timeoutMs,
    maxBytes: dependencies.maxBytes,
  })
  let responseFileKey: string | undefined
  try {
    assertDevStorageRelayRequest(request, dependencies.env)
    if (request.method === 'PUT') {
      const rawMetadata = request.headers.get('x-agenticgraph-file-sync-meta')
      if (!rawMetadata || rawMetadata.length > 16_384) {
        throw new StorageRelayError({ code: 'invalid_request', status: 400 })
      }
      const metadata = parseWriteMetadata(decodeStorageRelayJsonHeader<unknown>(rawMetadata))
      await authorizeStorageRelayRequest({
        request,
        workspaceId: metadata.workspaceId,
        access: 'write',
        hooks: dependencies.authHooks,
        signal: operation.signal,
      })
      const registration = requireProvider(dependencies.registry, metadata)
      const existingEntry = metadata.entryKey
        ? await openEntryToken(dependencies.tokenCodec, registration, metadata.entryKey)
        : null
      if (existingEntry && (
        existingEntry.kind !== 'file'
        || existingEntry.name !== metadata.name
        || !metadata.expectedVersion
        || existingEntry.versionTag !== metadata.expectedVersion
      )) {
        throw new StorageRelayError({ code: 'conflict', status: 409 })
      }
      const parentResourceId = existingEntry?.parentResourceId
        ?? await resolveParentResourceId({
          codec: dependencies.tokenCodec,
          registration,
          parentKey: metadata.parentKey,
        })
      if (!parentResourceId) {
        throw new StorageRelayError({ code: 'invalid_request', status: 400 })
      }
      const bytes = await readStorageRelayRequestBytes(request, operation.budget)
      const entry = await registration.provider.writeFile({
        resourceId: existingEntry?.resourceId ?? null,
        parentResourceId,
        name: metadata.name,
        expectedVersion: metadata.expectedVersion ?? null,
        mimeType: metadata.mimeType,
        bytes,
        expectedHash: metadata.contentHash,
        idempotencyKey: metadata.idempotencyKey,
        operation,
      })
      if (entry.parentResourceId !== parentResourceId) {
        throw new StorageRelayError({ code: 'invalid_response', status: 502 })
      }
      const sealed = await sealEntry({ codec: dependencies.tokenCodec, registration, entry })
      responseFileKey = sealed.fileKey
      return storageRelayJsonResponse(200, {
        ok: true,
        apiVersion: STORAGE_RELAY_API_VERSION,
        operationId,
        providerId: registration.providerId,
        entry: sealed,
      })
    }
    if (request.method !== 'POST') {
      throw new StorageRelayError({ code: 'invalid_request', status: 405 })
    }
    const payload = parsePostRequest(
      await readStorageRelayJsonRequest<unknown>(request, operation.budget),
    )
    const isWrite = payload.action === 'create-directory' || payload.action === 'trash'
    await authorizeStorageRelayRequest({
      request,
      workspaceId: payload.workspaceId,
      access: isWrite ? 'write' : 'read',
      hooks: dependencies.authHooks,
      signal: operation.signal,
    })
    if (payload.action === 'providers') {
      return storageRelayJsonResponse(200, {
        ok: true,
        apiVersion: STORAGE_RELAY_API_VERSION,
        operationId,
        providers: dependencies.registry.listForWorkspace(payload.workspaceId),
      })
    }
    const registration = requireProvider(dependencies.registry, payload)
    if (payload.action === 'list') {
      const parentResourceId = await resolveParentResourceId({
        codec: dependencies.tokenCodec,
        registration,
        parentKey: payload.parentKey,
      })
      let rawCursor: string | null = null
      let pageIndex = 0
      const cursorToken = assertOptionalToken(payload.cursor)
      if (cursorToken) {
        const cursor = await dependencies.tokenCodec.open<CursorTokenPayload>({
          token: cursorToken,
          binding: tokenBinding(registration, 'page-cursor'),
        })
        if (
          cursor.parentResourceId !== parentResourceId
          || typeof cursor.cursor !== 'string'
          || !cursor.cursor
          || cursor.cursor.length > 4096
          || !Number.isSafeInteger(cursor.pageIndex)
          || cursor.pageIndex < 1
          || cursor.pageIndex > 10_000
        ) {
          throw new StorageRelayError({ code: 'invalid_request', status: 400 })
        }
        rawCursor = cursor.cursor
        pageIndex = cursor.pageIndex
      }
      const limit = Number.isFinite(payload.limit)
        ? Math.max(1, Math.min(200, Math.floor(payload.limit!)))
        : 100
      const page = await registration.provider.listPage({
        parentResourceId,
        cursor: rawCursor,
        limit,
        operation,
      })
      if (page.entries.length > limit || (page.incomplete && !page.nextCursor)) {
        throw new StorageRelayError({ code: 'invalid_response', status: 502 })
      }
      const entries = await Promise.all(page.entries.map(entry =>
        sealEntry({ codec: dependencies.tokenCodec, registration, entry })))
      const nextCursor = page.nextCursor
        ? await dependencies.tokenCodec.seal({
            binding: tokenBinding(registration, 'page-cursor'),
            payload: {
              parentResourceId,
              cursor: page.nextCursor,
              pageIndex: pageIndex + 1,
            } satisfies CursorTokenPayload,
          })
        : null
      const listingFence = !page.incomplete && !page.nextCursor
        ? await dependencies.tokenCodec.seal({
            binding: tokenBinding(registration, 'complete-listing'),
            payload: {
              parentResourceId,
              finalPageIndex: pageIndex,
            } satisfies ListingFencePayload,
            ttlMs: 5 * 60_000,
          })
        : null
      return storageRelayJsonResponse(200, {
        ok: true,
        apiVersion: STORAGE_RELAY_API_VERSION,
        operationId,
        providerId: registration.providerId,
        entries,
        nextCursor,
        incomplete: page.incomplete || Boolean(page.nextCursor),
        listingFence,
      })
    }
    if (payload.action === 'read') {
      const entryToken = assertOptionalToken(payload.entryKey)
      if (!entryToken) throw new StorageRelayError({ code: 'invalid_request', status: 400 })
      const tokenEntry = await openEntryToken(dependencies.tokenCodec, registration, entryToken)
      if (tokenEntry.kind !== 'file') {
        throw new StorageRelayError({ code: 'invalid_request', status: 400 })
      }
      const expectedVersion = payload.expectedVersion == null
        ? tokenEntry.versionTag
        : assertFileSyncVersionTag(payload.expectedVersion, 'request')
      if (expectedVersion !== tokenEntry.versionTag) {
        throw new StorageRelayError({ code: 'conflict', status: 409 })
      }
      const result = await registration.provider.read({
        resourceId: tokenEntry.resourceId,
        expectedVersion,
        operation,
      })
      const sealed = await sealEntry({
        codec: dependencies.tokenCodec,
        registration,
        entry: result.entry,
      })
      responseFileKey = sealed.fileKey
      return new Response(result.bytes, {
        status: 200,
        headers: {
          'content-type': result.entry.mimeType || 'application/octet-stream',
          'content-length': String(result.bytes.byteLength),
          'cache-control': 'no-store',
          'x-agenticgraph-file-sync-meta': encodeStorageRelayJsonHeader({
            operationId,
            providerId: registration.providerId,
            entry: sealed,
          }),
        },
      })
    }
    if (payload.action === 'create-directory') {
      const parentResourceId = await resolveParentResourceId({
        codec: dependencies.tokenCodec,
        registration,
        parentKey: payload.parentKey,
      })
      const entry = await registration.provider.createDirectory({
        parentResourceId,
        name: assertFileSyncName(payload.name),
        idempotencyKey: assertIdempotencyKey(payload.idempotencyKey),
        operation,
      })
      if (entry.kind !== 'directory' || entry.parentResourceId !== parentResourceId) {
        throw new StorageRelayError({ code: 'invalid_response', status: 502 })
      }
      return storageRelayJsonResponse(200, {
        ok: true,
        apiVersion: STORAGE_RELAY_API_VERSION,
        operationId,
        providerId: registration.providerId,
        entry: await sealEntry({ codec: dependencies.tokenCodec, registration, entry }),
      })
    }
    const entryToken = assertOptionalToken(payload.entryKey)
    const fenceToken = assertOptionalToken(payload.listingFence)
    if (!entryToken || !fenceToken) {
      throw new StorageRelayError({ code: 'invalid_request', status: 400 })
    }
    const tokenEntry = await openEntryToken(dependencies.tokenCodec, registration, entryToken)
    if (tokenEntry.kind === 'unsupported' || !tokenEntry.parentResourceId) {
      throw new StorageRelayError({ code: 'invalid_request', status: 400 })
    }
    const expectedVersion = assertFileSyncVersionTag(payload.expectedVersion, 'request')
    if (expectedVersion !== tokenEntry.versionTag) {
      throw new StorageRelayError({ code: 'conflict', status: 409 })
    }
    const fence = await dependencies.tokenCodec.open<ListingFencePayload>({
      token: fenceToken,
      binding: tokenBinding(registration, 'complete-listing'),
    })
    if (
      fence.parentResourceId !== tokenEntry.parentResourceId
      || !Number.isSafeInteger(fence.finalPageIndex)
      || fence.finalPageIndex < 0
    ) {
      throw new StorageRelayError({ code: 'invalid_request', status: 400 })
    }
    responseFileKey = await dependencies.tokenCodec.deriveStableKey({
      workspaceId: registration.workspaceId,
      providerId: registration.providerId,
      rootKey: registration.rootKey,
      resourceId: tokenEntry.resourceId,
    })
    await registration.provider.trash({
      resourceId: tokenEntry.resourceId,
      expectedVersion,
      operation,
    })
    return storageRelayJsonResponse(200, {
      ok: true,
      apiVersion: STORAGE_RELAY_API_VERSION,
      operationId,
      providerId: registration.providerId,
      fileKey: responseFileKey,
      trashed: true,
    })
  } catch (error) {
    return storageRelayErrorResponse(error, operationId, responseFileKey)
  } finally {
    operation.dispose()
  }
}
