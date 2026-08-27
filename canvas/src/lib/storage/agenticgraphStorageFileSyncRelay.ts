import {
  FILE_SYNC_LIMITS,
  FileSyncOperationError,
  normalizeFileSyncKey,
  normalizeFileSyncProviderId,
  type FileSyncEntry,
  type FileSyncHash,
  type FileSyncProvider,
} from './file-sync'
import {
  FILE_SYNC_RELAY_API_VERSION,
  FILE_SYNC_RELAY_PATH,
  RelayByteBudget,
  RelayByteBudgetRegistry,
  awaitRelaySignal,
  computeQuickXor,
  decodeRelayJsonHeader,
  encodeRelayJsonHeader,
  inferRelayMimeType,
  normalizeRelayHashes,
  readRelayBytes,
  readRelayJson,
  relayFailure,
  sha256Hex,
  throwRelayResponseError,
} from './agenticgraphStorageFileSyncRelaySupport'
import {
  RelaySnapshotCache,
  toRelayFileSyncEntry,
  type RelayMapping,
  type RelaySnapshot,
} from './agenticgraphStorageFileSyncRelaySnapshot'
import {
  assertRelayExpectedRevision as assertExpectedRevision,
  assertRelayEnvelope as assertEnvelope,
  assertRelayWorkspaceId as assertWorkspaceId,
  cloneRelayFileSyncEntry as cloneEntry,
  isRelayRecord as isRecord,
  readRelayJsonEntry as readJsonEntry,
  readRelayMetadataEntry as readMetadataEntry,
  relayBasename as basename,
  relayParentPath as parentOf,
  unsupportedRelayEntry as unsupportedEntry,
} from './agenticgraphStorageFileSyncRelayProtocol'

export type AgenticGraphStorageFileSyncRelayFetch = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>

export interface AgenticGraphStorageFileSyncRelayOptions {
  workspaceId: string
  providerId: string
  buildRequestUrl: () => string | URL
  fetcher?: AgenticGraphStorageFileSyncRelayFetch
  readSessionBearer: () => string | null
}

class AgenticGraphStorageFileSyncRelayProvider implements FileSyncProvider {
  readonly target = 'external-file-storage' as const
  readonly providerId: string
  private readonly workspaceId: string
  private readonly buildRequestUrl: () => string | URL
  private readonly fetcher: AgenticGraphStorageFileSyncRelayFetch
  private readonly readSessionBearer: () => string | null
  private readonly transferBudgets = new RelayByteBudgetRegistry()
  private readonly snapshots = new RelaySnapshotCache()

  constructor(options: AgenticGraphStorageFileSyncRelayOptions) {
    this.workspaceId = assertWorkspaceId(options.workspaceId)
    this.providerId = normalizeFileSyncProviderId(options.providerId)
    this.buildRequestUrl = options.buildRequestUrl
    this.fetcher = options.fetcher ?? globalThis.fetch.bind(globalThis)
    this.readSessionBearer = options.readSessionBearer
  }

  releaseOperation(signal: AbortSignal): void {
    this.transferBudgets.release(signal)
  }

  list(prefix: string, cursor: string | null, signal: AbortSignal) {
    return this.run(signal, async (operationSignal, budget) => {
      if (cursor !== null) throw relayFailure('failed')
      const normalizedPrefix = normalizeFileSyncKey(prefix, { allowRoot: true })
      const snapshot = await this.refresh(operationSignal, budget, true)
      return {
        entries: [...snapshot.entries.values()]
          .map(mapping => cloneEntry(mapping.entry))
          .filter(entry =>
            !normalizedPrefix
            || entry.key === normalizedPrefix
            || entry.key.startsWith(`${normalizedPrefix}/`))
          .sort((left, right) => left.key.localeCompare(right.key)),
        nextCursor: null,
        snapshotVersion: snapshot.version,
        complete: true,
      }
    })
  }

  stat(key: string, signal: AbortSignal) {
    return this.run(signal, async (operationSignal, budget) => {
      const normalizedKey = normalizeFileSyncKey(key)
      const mapping = (await this.refresh(operationSignal, budget))
        .entries.get(normalizedKey)
      return mapping ? cloneEntry(mapping.entry) : null
    })
  }

  read(key: string, signal: AbortSignal) {
    return this.run(signal, async (operationSignal, budget) => {
      const normalizedKey = normalizeFileSyncKey(key)
      const mapping = (await this.refresh(operationSignal, budget))
        .entries.get(normalizedKey)
      if (!mapping) throw relayFailure('failed')
      if (mapping.entry.entryType !== 'standard') {
        throw unsupportedEntry()
      }
      if (mapping.entry.kind !== 'file') throw relayFailure('failed')
      const response = await this.request({
        method: 'POST',
        json: {
          apiVersion: FILE_SYNC_RELAY_API_VERSION,
          workspaceId: this.workspaceId,
          providerId: this.providerId,
          action: 'read',
          entryKey: mapping.relay.entryKey,
          expectedVersion: mapping.relay.versionTag,
        },
        signal: operationSignal,
      })
      if (!response.ok) {
        await throwRelayResponseError(response, budget, operationSignal)
      }
      const metadataHeader = response.headers.get('x-agenticgraph-file-sync-meta')
      if (!metadataHeader || metadataHeader.length > 16_384) {
        throw relayFailure('failed')
      }
      const metadata = decodeRelayJsonHeader<unknown>(metadataHeader)
      const responseEntry = readMetadataEntry(metadata, this.providerId)
      if (
        responseEntry.fileKey !== mapping.relay.fileKey
        || responseEntry.name !== mapping.relay.name
        || responseEntry.kind !== 'file'
      ) {
        throw relayFailure('failed')
      }
      const bytes = await readRelayBytes(response, budget, operationSignal)
      if (bytes.byteLength !== responseEntry.size) throw relayFailure('failed')
      const sha256 = await sha256Hex(bytes, operationSignal)
      const hashes = [...mapping.entry.hashes, {
        algorithm: 'sha256',
        value: sha256,
      }]
      if (responseEntry.hash) {
        const computed = responseEntry.hash.algorithm === 'quickxor'
          ? computeQuickXor(bytes)
          : { algorithm: 'sha256', value: sha256 }
        if (
          computed.algorithm !== responseEntry.hash.algorithm
          || computed.value !== responseEntry.hash.value
        ) {
          throw relayFailure('failed')
        }
        hashes.push(responseEntry.hash)
      }
      const entry = {
        entry: {
          ...mapping.entry,
          sizeBytes: bytes.byteLength,
          hashes: normalizeRelayHashes(hashes),
          revision: responseEntry.versionTag,
        },
        bytes,
      }
      mapping.entry = cloneEntry(entry.entry)
      return entry
    })
  }

  write(
    request: {
      entry: FileSyncEntry
      bytes: Uint8Array | null
      expectedRevision?: string | null
      trustedSourceHashes?: readonly FileSyncHash[]
    },
    signal: AbortSignal,
  ) {
    return this.run(signal, async (operationSignal, budget) => {
      const key = normalizeFileSyncKey(request.entry.key)
      if (request.entry.entryType !== 'standard') throw unsupportedEntry()
      const snapshot = await this.refresh(operationSignal, budget)
      const existing = snapshot.entries.get(key) ?? null
      assertExpectedRevision(existing, request.expectedRevision)
      if (request.entry.kind === 'directory') {
        if (request.bytes !== null) throw relayFailure('failed')
        return cloneEntry(
          (existing ?? await this.ensureDirectory(
            snapshot,
            key,
            operationSignal,
            budget,
          )).entry,
        )
      }
      if (!request.bytes) throw relayFailure('failed')
      if (existing?.entry.entryType !== undefined
        && existing.entry.entryType !== 'standard') {
        throw unsupportedEntry()
      }
      if (existing && existing.entry.kind !== 'file') {
        throw relayFailure('conflict')
      }
      const bytes = new Uint8Array(request.bytes)
      if (
        bytes.byteLength !== request.entry.sizeBytes
        || bytes.byteLength > FILE_SYNC_LIMITS.maxTransferBytes
      ) {
        throw relayFailure('limit-exceeded')
      }
      budget.consume(bytes.byteLength)
      const parentPath = parentOf(key)
      const parent = parentPath
        ? await this.ensureDirectory(
            snapshot,
            parentPath,
            operationSignal,
            budget,
          )
        : null
      const sha256 = await sha256Hex(bytes, operationSignal)
      const contentHash = snapshot.providerType === 'one-drive'
        ? computeQuickXor(bytes)
        : { algorithm: 'sha256', value: sha256 } satisfies FileSyncHash
      const idempotencyKey = await this.idempotencyKey(
        `file\0${key}\0${request.expectedRevision ?? 'create'}\0${sha256}`,
        operationSignal,
      )
      const metadata = {
        apiVersion: FILE_SYNC_RELAY_API_VERSION,
        workspaceId: this.workspaceId,
        providerId: this.providerId,
        parentKey: parent?.relay.entryKey ?? null,
        entryKey: existing?.relay.entryKey ?? null,
        name: basename(key),
        expectedVersion: existing?.relay.versionTag ?? null,
        contentHash,
        idempotencyKey,
        mimeType: existing?.relay.mimeType ?? inferRelayMimeType(key),
      }
      const encodedMetadata = encodeRelayJsonHeader(metadata)
      if (encodedMetadata.length > 16_384) throw relayFailure('limit-exceeded')
      const response = await this.request({
        method: 'PUT',
        bytes,
        headers: {
          'content-type': 'application/octet-stream',
          'x-agenticgraph-content-sha256': sha256,
          'x-agenticgraph-file-sync-meta': encodedMetadata,
        },
        signal: operationSignal,
      })
      const body = await this.readJsonSuccess<unknown>(
        response,
        budget,
        operationSignal,
      )
      const written = readJsonEntry(body, this.providerId)
      if (
        written.name !== basename(key)
        || written.kind !== 'file'
        || (existing && written.fileKey !== existing.relay.fileKey)
      ) {
        throw relayFailure('failed')
      }
      const responseHashes = written.hash ? [written.hash] : []
      const entry = {
        key,
        kind: 'file' as const,
        entryType: 'standard' as const,
        sizeBytes: bytes.byteLength,
        hashes: normalizeRelayHashes([
          { algorithm: 'sha256', value: sha256 },
          ...responseHashes,
        ]),
        revision: written.versionTag,
        modifiedAtMs: null,
      }
      snapshot.entries.set(key, {
        logicalKey: key,
        parentPath,
        relay: written,
        entry,
      })
      return cloneEntry(entry)
    })
  }

  delete(
    key: string,
    signal: AbortSignal,
    expectedRevision?: string | null,
  ) {
    return this.run(signal, async (operationSignal, budget) => {
      const normalizedKey = normalizeFileSyncKey(key)
      let snapshot = await this.refresh(operationSignal, budget)
      let mapping = snapshot.entries.get(normalizedKey)
      if (!mapping) {
        if (typeof expectedRevision === 'string') throw relayFailure('conflict')
        return
      }
      if (mapping.entry.entryType !== 'standard') throw unsupportedEntry()
      if (
        typeof expectedRevision !== 'string'
        || expectedRevision !== mapping.relay.versionTag
      ) {
        throw relayFailure('conflict')
      }
      if (!snapshot.fences.has(mapping.parentPath)) {
        snapshot = await this.refresh(operationSignal, budget, true)
        mapping = snapshot.entries.get(normalizedKey)
        if (!mapping) throw relayFailure('conflict')
      }
      const listingFence = snapshot.fences.get(mapping.parentPath)
      if (!listingFence) throw relayFailure('failed')
      const response = await this.postJson({
        apiVersion: FILE_SYNC_RELAY_API_VERSION,
        workspaceId: this.workspaceId,
        providerId: this.providerId,
        action: 'trash',
        entryKey: mapping.relay.entryKey,
        expectedVersion: expectedRevision,
        listingFence,
      }, operationSignal, budget)
      if (
        !isRecord(response)
        || response.trashed !== true
        || response.fileKey !== mapping.relay.fileKey
      ) {
        throw relayFailure('failed')
      }
      for (const candidate of snapshot.entries.keys()) {
        if (candidate === normalizedKey || candidate.startsWith(`${normalizedKey}/`)) {
          snapshot.entries.delete(candidate)
        }
      }
    })
  }

  private async refresh(
    signal: AbortSignal,
    budget: RelayByteBudget,
    force = false,
  ): Promise<RelaySnapshot> {
    return this.snapshots.load({
      workspaceId: this.workspaceId,
      providerId: this.providerId,
      postJson: (payload, operationSignal, operationBudget) =>
        this.postJson(payload, operationSignal, operationBudget),
      signal,
      budget,
    }, force)
  }

  private async ensureDirectory(
    snapshot: RelaySnapshot,
    directoryPath: string,
    signal: AbortSignal,
    budget: RelayByteBudget,
  ): Promise<RelayMapping> {
    let parentPath = ''
    let parent: RelayMapping | null = null
    for (const segment of directoryPath.split('/')) {
      const logicalKey = parentPath ? `${parentPath}/${segment}` : segment
      const existing = snapshot.entries.get(logicalKey)
      if (existing) {
        if (
          existing.entry.kind !== 'directory'
          || existing.entry.entryType !== 'standard'
        ) {
          throw relayFailure('conflict')
        }
        parent = existing
        parentPath = logicalKey
        continue
      }
      const idempotencyKey = await this.idempotencyKey(
        `directory\0${logicalKey}`,
        signal,
      )
      const body = await this.postJson({
        apiVersion: FILE_SYNC_RELAY_API_VERSION,
        workspaceId: this.workspaceId,
        providerId: this.providerId,
        action: 'create-directory',
        parentKey: parent?.relay.entryKey ?? null,
        name: segment,
        idempotencyKey,
      }, signal, budget)
      const relay = readJsonEntry(body, this.providerId)
      if (relay.kind !== 'directory' || relay.name !== segment) {
        throw relayFailure('failed')
      }
      const mapping: RelayMapping = {
        logicalKey,
        parentPath,
        relay,
        entry: await toRelayFileSyncEntry(
          this.providerId,
          logicalKey,
          relay,
          signal,
        ),
      }
      snapshot.entries.set(logicalKey, mapping)
      parent = mapping
      parentPath = logicalKey
    }
    if (!parent) throw relayFailure('failed')
    return parent
  }

  private async postJson(
    payload: unknown,
    signal: AbortSignal,
    budget: RelayByteBudget,
  ): Promise<unknown> {
    const response = await this.request({
      method: 'POST',
      json: payload,
      signal,
    })
    return this.readJsonSuccess(response, budget, signal)
  }

  private async readJsonSuccess<Value>(
    response: Response,
    budget: RelayByteBudget,
    signal: AbortSignal,
  ): Promise<Value> {
    if (!response.ok) await throwRelayResponseError(response, budget, signal)
    const value = await readRelayJson<Value>(response, budget, signal)
    assertEnvelope(value)
    return value
  }

  private async request(args: {
    method: 'POST' | 'PUT'
    signal: AbortSignal
    json?: unknown
    bytes?: Uint8Array
    headers?: HeadersInit
  }): Promise<Response> {
    if (args.signal.aborted) throw relayFailure('timeout')
    const bearer = this.readSessionBearer()
    if (
      typeof bearer !== 'string'
      || !bearer
      || bearer.length > 16_384
      || /\s/.test(bearer)
    ) {
      throw relayFailure('failed')
    }
    const headers = new Headers(args.headers)
    headers.set('authorization', `Bearer ${bearer}`)
    headers.set('cache-control', 'no-store')
    let body: BodyInit | undefined
    if (args.json !== undefined) {
      headers.set('content-type', 'application/json')
      body = JSON.stringify(args.json)
    } else if (args.bytes) {
      body = args.bytes as unknown as BodyInit
    }
    try {
      return await awaitRelaySignal(this.fetcher(
        this.requestUrl(),
        { method: args.method, headers, body, signal: args.signal },
      ), args.signal)
    } catch (error) {
      if (error instanceof FileSyncOperationError) throw error
      throw args.signal.aborted ? relayFailure('timeout') : relayFailure('failed')
    }
  }

  private requestUrl(): string | URL {
    let value: string | URL
    try {
      value = this.buildRequestUrl()
      const parsed = new URL(String(value), 'http://agenticgraph.local')
      const absolute = /^[A-Za-z][A-Za-z0-9+.-]*:/.test(String(value))
      const loopbackHosts = new Set([
        'localhost',
        '127.0.0.1',
        '0.0.0.0',
        '[::1]',
        '::1',
      ])
      if (
        parsed.pathname !== FILE_SYNC_RELAY_PATH
        || parsed.search
        || parsed.hash
        || parsed.username
        || parsed.password
        || (absolute && !loopbackHosts.has(parsed.hostname.toLowerCase()))
      ) {
        throw relayFailure('failed')
      }
    } catch (error) {
      if (error instanceof FileSyncOperationError) throw error
      throw relayFailure('failed')
    }
    return value
  }

  private async idempotencyKey(
    value: string,
    signal: AbortSignal,
  ): Promise<string> {
    const digest = await sha256Hex(new TextEncoder().encode(
      `${this.workspaceId}\0${this.providerId}\0${value}`,
    ), signal)
    return `file-sync:${digest}`
  }

  private async run<Value>(
    outerSignal: AbortSignal,
    operation: (
      signal: AbortSignal,
      budget: RelayByteBudget,
    ) => Promise<Value>,
  ): Promise<Value> {
    const budget = this.transferBudgets.acquire(outerSignal)
    const controller = new AbortController()
    const abort = () => controller.abort()
    outerSignal.addEventListener('abort', abort, { once: true })
    const timeout = globalThis.setTimeout(
      () => controller.abort(),
      FILE_SYNC_LIMITS.timeoutMs,
    )
    try {
      if (outerSignal.aborted) controller.abort()
      return await operation(controller.signal, budget)
    } catch (error) {
      if (error instanceof FileSyncOperationError) throw error
      if (controller.signal.aborted) this.transferBudgets.release(outerSignal)
      throw controller.signal.aborted
        ? relayFailure('timeout')
        : relayFailure('failed')
    } finally {
      globalThis.clearTimeout(timeout)
      outerSignal.removeEventListener('abort', abort)
    }
  }
}

export const createAgenticGraphStorageFileSyncRelayProvider = (
  options: AgenticGraphStorageFileSyncRelayOptions,
): FileSyncProvider => new AgenticGraphStorageFileSyncRelayProvider(options)
