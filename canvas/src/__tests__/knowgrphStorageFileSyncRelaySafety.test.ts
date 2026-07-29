import assert from 'node:assert/strict'
import {
  FILE_SYNC_LIMITS,
  FileSyncOperationError,
  type FileSyncEntry,
} from '../lib/storage/file-sync'
import {
  createKnowgrphStorageFileSyncRelayProvider,
  type KnowgrphStorageFileSyncRelayFetch,
} from '../lib/storage/knowgrphStorageFileSyncRelay'
import {
  FILE_SYNC_RELAY_API_VERSION,
  computeQuickXor,
  decodeRelayJsonHeader,
  encodeRelayJsonHeader,
  sha256Hex,
  type RelayEntry,
  type RelayProviderType,
} from '../lib/storage/knowgrphStorageFileSyncRelaySupport'

const signal = new AbortController().signal
const secret = 'relay-response-secret'

// Pagination must terminate with a fence; unsupported provider objects stay tagged.
export async function testKnowgrphStorageFileSyncRelayPaginationAndUnsupportedEntries() {
  const entries = [
    unsupported('native-doc', 'native-document'),
    unsupported('shortcut', 'shortcut'),
    unsupported('remote', 'remote-item'),
    unsupported('package', 'package'),
  ] as const
  const provider = createProvider(async (_input, init = {}) => {
    const payload = JSON.parse(String(init.body)) as Record<string, unknown>
    if (payload.action === 'providers') return providersResponse('one-drive')
    assert.equal(payload.action, 'list')
    const secondPage = payload.cursor === 'opaque-cursor'
    return listResponse({
      entries: secondPage ? entries.slice(2) : entries.slice(0, 2),
      nextCursor: secondPage ? null : 'opaque-cursor',
      incomplete: !secondPage,
      listingFence: secondPage ? 'opaque-fence' : null,
    })
  })
  const listed = await provider.list('', null, signal)
  assert.deepEqual(
    listed.entries.map(entry => [entry.key, entry.entryType]),
    [
      ['native-doc', 'google-native'],
      ['package', 'graph-remote'],
      ['remote', 'graph-remote'],
      ['shortcut', 'shortcut'],
    ],
  )
  assert.equal(JSON.stringify(listed).includes('opaque-'), false)

  let repeatedCalls = 0
  const repeated = createProvider(async (_input, init = {}) => {
    const payload = JSON.parse(String(init.body)) as Record<string, unknown>
    if (payload.action === 'providers') return providersResponse('google-drive')
    repeatedCalls += 1
    return listResponse({
      entries: [],
      nextCursor: 'repeated-cursor',
      incomplete: true,
      listingFence: null,
    })
  })
  await assertRelayError(
    repeated.list('', null, signal),
    'failed',
  )
  assert.equal(repeatedCalls, 2)

  const incomplete = createProvider(async (_input, init = {}) => {
    const payload = JSON.parse(String(init.body)) as Record<string, unknown>
    if (payload.action === 'providers') return providersResponse('google-drive')
    return listResponse({
      entries: [],
      nextCursor: null,
      incomplete: true,
      listingFence: null,
    })
  })
  await assertRelayError(incomplete.list('', null, signal), 'failed')
}

// CAS, byte bounds, and relay failures expose only typed, fixed messages.
export async function testKnowgrphStorageFileSyncRelayConflictLimitAndSecretSafety() {
  const file = await binaryEntry(
    'bounded.bin',
    new Uint8Array([1]),
    'version:1',
  )
  let putCalls = 0
  const conflictProvider = createProvider(async (_input, init = {}) => {
    if (init.method === 'PUT') {
      putCalls += 1
      throw new Error('unexpected write')
    }
    const payload = JSON.parse(String(init.body)) as Record<string, unknown>
    if (payload.action === 'providers') return providersResponse('google-drive')
    if (payload.action === 'list') {
      return listResponse({
        entries: [file],
        nextCursor: null,
        incomplete: false,
        listingFence: 'root-fence',
      })
    }
    return jsonResponse({
      ok: false,
      apiVersion: FILE_SYNC_RELAY_API_VERSION,
      code: 'conflict',
      detail: `Bearer ${secret}`,
    }, 409)
  })
  const bytes = new Uint8Array([2])
  await assertRelayError(conflictProvider.write({
    entry: standardFile('bounded.bin', bytes, 'wrong-version'),
    bytes,
    expectedRevision: 'wrong-version',
  }, signal), 'conflict')
  assert.equal(putCalls, 0)
  const conflict = await captureError(
    conflictProvider.read('bounded.bin', signal),
  )
  assert.equal(conflict.reason, 'conflict')
  assert.equal(String(conflict).includes(secret), false)
  assert.equal(JSON.stringify(conflictProvider).includes(secret), false)
  assert.equal(JSON.stringify(conflictProvider).includes('entry-key'), false)

  const oversizedSize = FILE_SYNC_LIMITS.maxTransferBytes + 1
  const oversized = {
    ...file,
    size: oversizedSize,
    versionTag: 'version:oversized',
  }
  const limitProvider = createProvider(async (_input, init = {}) => {
    const payload = JSON.parse(String(init.body)) as Record<string, unknown>
    if (payload.action === 'providers') return providersResponse('google-drive')
    if (payload.action === 'list') {
      return listResponse({
        entries: [oversized],
        nextCursor: null,
        incomplete: false,
        listingFence: 'root-fence',
      })
    }
    return new Response(new Uint8Array(), {
      status: 200,
      headers: {
        'content-length': String(oversizedSize),
        'x-knowgrph-file-sync-meta': encodeRelayJsonHeader({
          providerId: 'google-workspace',
          entry: oversized,
        }),
      },
    })
  })
  await assertRelayError(
    limitProvider.read('bounded.bin', signal),
    'limit-exceeded',
  )
}

// Relay responses share one cumulative budget for the complete outer transfer.
export async function testKnowgrphStorageFileSyncRelayCumulativeBudgetAndCleanup() {
  const fileBytes = new Uint8Array(
    Math.floor(FILE_SYNC_LIMITS.maxTransferBytes * 0.5),
  )
  const file = await binaryEntry(
    'bounded.bin',
    fileBytes,
    'version:1',
  )
  const padding = 'x'.repeat(
    Math.floor(FILE_SYNC_LIMITS.maxTransferBytes * 0.55),
  )
  let readCalls = 0
  const provider = createProvider(async (_input, init = {}) => {
    const payload = JSON.parse(String(init.body)) as Record<string, unknown>
    if (payload.action === 'providers') {
      return jsonResponse({
        ok: true,
        apiVersion: FILE_SYNC_RELAY_API_VERSION,
        providers: [{
          providerId: 'google-workspace',
          label: 'Provider',
          providerType: 'google-drive',
        }],
        padding,
      })
    }
    if (payload.action === 'list') {
      return listResponse({
        entries: [file],
        nextCursor: null,
        incomplete: false,
        listingFence: 'root-fence',
      })
    }
    readCalls += 1
    return new Response(fileBytes, {
      status: 200,
      headers: {
        'content-length': String(fileBytes.byteLength),
        'x-knowgrph-file-sync-meta': encodeRelayJsonHeader({
          providerId: 'google-workspace',
          entry: file,
        }),
      },
    })
  })

  const completed = new AbortController()
  const completedListeners = instrumentAbortListeners(completed.signal)
  assert.ok(await provider.stat('bounded.bin', completed.signal))
  assert.equal(completedListeners(), 1)
  await assertRelayError(
    provider.read('bounded.bin', completed.signal),
    'limit-exceeded',
  )
  assert.equal(readCalls, 1)
  provider.releaseOperation?.(completed.signal)
  assert.equal(completedListeners(), 0)

  assert.ok(await provider.stat('bounded.bin', completed.signal))
  assert.equal(completedListeners(), 1)
  provider.releaseOperation?.(completed.signal)
  assert.equal(completedListeners(), 0)

  const aborted = new AbortController()
  const abortedListeners = instrumentAbortListeners(aborted.signal)
  assert.ok(await provider.stat('bounded.bin', aborted.signal))
  assert.equal(abortedListeners(), 1)
  aborted.abort()
  assert.equal(abortedListeners(), 0)
}

// OneDrive receives QuickXor for protocol compatibility and SHA-256 audit metadata.
export async function testKnowgrphStorageFileSyncRelayOneDriveWriteMetadata() {
  const bytes = new TextEncoder().encode('one-drive-write')
  let observedMetadata: Record<string, unknown> | null = null
  let observedSha256 = ''
  const provider = createProvider(async (_input, init = {}) => {
    if (init.method === 'PUT') {
      observedMetadata = decodeRelayJsonHeader<Record<string, unknown>>(
        new Headers(init.headers).get('x-knowgrph-file-sync-meta')!,
      )
      observedSha256 = String(
        new Headers(init.headers).get('x-knowgrph-content-sha256'),
      )
      const quickxor = computeQuickXor(bytes)
      return jsonResponse({
        ok: true,
        apiVersion: FILE_SYNC_RELAY_API_VERSION,
        providerId: 'google-workspace',
        entry: {
          entryKey: 'write-entry-key',
          fileKey: 'write-file-key',
          name: 'write.bin',
          kind: 'file',
          size: bytes.byteLength,
          versionTag: 'version:2',
          hash: quickxor,
          mimeType: 'application/octet-stream',
        },
      })
    }
    const payload = JSON.parse(String(init.body)) as Record<string, unknown>
    if (payload.action === 'providers') return providersResponse('one-drive')
    return listResponse({
      entries: [],
      nextCursor: null,
      incomplete: false,
      listingFence: 'root-fence',
    })
  })
  const written = await provider.write({
    entry: standardFile('write.bin', bytes, null),
    bytes,
    expectedRevision: null,
  }, signal)
  const metadata = observedMetadata as Record<string, unknown> | null
  assert.ok(metadata)
  assert.equal(
    (metadata.contentHash as { algorithm: string }).algorithm,
    'quickxor',
  )
  assert.equal(observedSha256, await sha256Hex(bytes))
  assert.ok(written.hashes.some(hash => hash.algorithm === 'sha256'))
  assert.ok(written.hashes.some(hash => hash.algorithm === 'quickxor'))
}

// Aborts and transport failures issue no adapter-owned retries.
export async function testKnowgrphStorageFileSyncRelayAbortAndNoRetries() {
  let fetchCalls = 0
  const provider = createProvider(async () => {
    fetchCalls += 1
    throw new Error(`network ${secret}`)
  })
  await assertRelayError(provider.list('', null, signal), 'failed')
  assert.equal(fetchCalls, 1)

  const controller = new AbortController()
  controller.abort()
  await assertRelayError(provider.list('', null, controller.signal), 'timeout')
  assert.equal(fetchCalls, 1)
}

const createProvider = (
  fetcher: KnowgrphStorageFileSyncRelayFetch,
) => createKnowgrphStorageFileSyncRelayProvider({
  workspaceId: 'workspace-relay',
  providerId: 'google-workspace',
  buildRequestUrl: () => 'http://localhost/api/storage/file-sync/relay',
  fetcher,
  readSessionBearer: () => 'in-memory-session-secret',
})

const providersResponse = (providerType: RelayProviderType): Response =>
  jsonResponse({
    ok: true,
    apiVersion: FILE_SYNC_RELAY_API_VERSION,
    providers: [{
      providerId: 'google-workspace',
      label: 'Provider',
      providerType,
    }],
  })

const listResponse = (args: {
  entries: readonly RelayEntry[]
  nextCursor: string | null
  incomplete: boolean
  listingFence: string | null
}): Response => jsonResponse({
  ok: true,
  apiVersion: FILE_SYNC_RELAY_API_VERSION,
  providerId: 'google-workspace',
  ...args,
})

const unsupported = (
  name: string,
  unsupportedReason: 'native-document' | 'shortcut' | 'remote-item' | 'package',
): RelayEntry => ({
  entryKey: `entry-${name}`,
  fileKey: `file-${name}`,
  name,
  kind: 'unsupported',
  size: null,
  versionTag: `version-${name}`,
  hash: null,
  mimeType: null,
  unsupportedReason,
})

const binaryEntry = async (
  name: string,
  bytes: Uint8Array,
  versionTag: string,
): Promise<RelayEntry> => ({
  entryKey: 'entry-key',
  fileKey: 'file-key',
  name,
  kind: 'file',
  size: bytes.byteLength,
  versionTag,
  hash: { algorithm: 'sha256', value: await sha256Hex(bytes) },
  mimeType: 'application/octet-stream',
})

const standardFile = (
  key: string,
  bytes: Uint8Array,
  revision: string | null,
): FileSyncEntry => ({
  key,
  kind: 'file',
  entryType: 'standard',
  sizeBytes: bytes.byteLength,
  hashes: [{ algorithm: 'sha256', value: '0'.repeat(64) }],
  revision,
  modifiedAtMs: null,
})

const jsonResponse = (
  body: unknown,
  status = 200,
): Response => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json' },
})

const instrumentAbortListeners = (
  signal: AbortSignal,
): (() => number) => {
  type AddListener = (
    type: string,
    listener: EventListenerOrEventListenerObject | null,
    options?: boolean | AddEventListenerOptions,
  ) => void
  type RemoveListener = (
    type: string,
    listener: EventListenerOrEventListenerObject | null,
    options?: boolean | EventListenerOptions,
  ) => void
  const addListener = signal.addEventListener.bind(signal) as AddListener
  const removeListener = signal.removeEventListener.bind(signal) as RemoveListener
  let activeAbortListeners = 0
  Object.defineProperties(signal, {
    addEventListener: {
      configurable: true,
      value: (
        type: string,
        listener: EventListenerOrEventListenerObject | null,
        options?: boolean | AddEventListenerOptions,
      ) => {
        if (type === 'abort') activeAbortListeners += 1
        addListener(type, listener, options)
      },
    },
    removeEventListener: {
      configurable: true,
      value: (
        type: string,
        listener: EventListenerOrEventListenerObject | null,
        options?: boolean | EventListenerOptions,
      ) => {
        if (type === 'abort') activeAbortListeners -= 1
        removeListener(type, listener, options)
      },
    },
  })
  return () => activeAbortListeners
}

const captureError = async (
  promise: Promise<unknown>,
): Promise<FileSyncOperationError> => {
  try {
    await promise
  } catch (error) {
    assert.ok(error instanceof FileSyncOperationError)
    return error
  }
  throw new Error('Expected relay operation to fail')
}

const assertRelayError = async (
  promise: Promise<unknown>,
  reason: FileSyncOperationError['reason'],
): Promise<void> => {
  const error = await captureError(promise)
  assert.equal(error.reason, reason)
}
