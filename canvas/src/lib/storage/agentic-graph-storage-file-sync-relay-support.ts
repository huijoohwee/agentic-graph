import {
  FILE_SYNC_LIMITS,
  FileSyncOperationError,
  hasFileSyncControlCharacters,
  normalizeFileSyncHashes,
  type FileSyncHash,
} from './file-sync'

export const FILE_SYNC_RELAY_API_VERSION = 'agentic-graph-storage-relay/v1'
export const FILE_SYNC_RELAY_PATH = '/api/storage/file-sync/relay'
export const FILE_SYNC_RELAY_MAX_ENTRIES = 10_000

export type RelayProviderType = 'google-drive' | 'one-drive'
export type RelayUnsupportedReason =
  | 'native-document'
  | 'shortcut'
  | 'remote-item'
  | 'package'

export type RelayEntry = {
  entryKey: string
  fileKey: string
  name: string
  kind: 'file' | 'directory' | 'unsupported'
  size: number | null
  versionTag: string
  hash: FileSyncHash | null
  mimeType: string | null
  unsupportedReason?: RelayUnsupportedReason
}

const RELAY_ERROR_CODES = new Set([
  'auth_required',
  'membership_forbidden',
  'provider_not_configured',
  'provider_auth_failed',
  'not_found',
  'conflict',
  'rate_limited',
  'timeout',
  'limit_exceeded',
  'upstream_unavailable',
  'invalid_request',
  'invalid_response',
])

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)

export class RelayByteBudget {
  private consumed = 0

  consume(byteLength: number): void {
    if (!Number.isSafeInteger(byteLength) || byteLength < 0) {
      throw relayFailure('failed')
    }
    this.consumed += byteLength
    if (this.consumed > FILE_SYNC_LIMITS.maxTransferBytes) {
      throw relayFailure('limit-exceeded')
    }
  }

  get remaining(): number {
    return Math.max(0, FILE_SYNC_LIMITS.maxTransferBytes - this.consumed)
  }
}

export class RelayByteBudgetRegistry {
  private readonly entries = new WeakMap<
    AbortSignal,
    { budget: RelayByteBudget; handleAbort: () => void }
  >()

  acquire(signal: AbortSignal): RelayByteBudget {
    if (signal.aborted) throw relayFailure('timeout')
    const current = this.entries.get(signal)
    if (current) return current.budget
    const handleAbort = () => this.release(signal)
    const entry = { budget: new RelayByteBudget(), handleAbort }
    this.entries.set(signal, entry)
    signal.addEventListener('abort', handleAbort, { once: true })
    if (signal.aborted) {
      this.release(signal)
      throw relayFailure('timeout')
    }
    return entry.budget
  }

  release(signal: AbortSignal): void {
    const entry = this.entries.get(signal)
    if (!entry) return
    this.entries.delete(signal)
    signal.removeEventListener('abort', entry.handleAbort)
  }
}

export const relayFailure = (
  reason: 'failed' | 'timeout' | 'limit-exceeded' | 'conflict',
): FileSyncOperationError => {
  const messages = {
    failed: 'File-sync relay request failed',
    timeout: 'File-sync relay deadline exceeded',
    'limit-exceeded': 'File-sync relay limit exceeded',
    conflict: 'File-sync relay revision conflict',
  } as const
  return new FileSyncOperationError(reason, messages[reason])
}

export const mapRelayError = (
  code: string | null,
  status: number,
): FileSyncOperationError => {
  if (code === 'conflict' || status === 409 || status === 412) {
    return relayFailure('conflict')
  }
  if (code === 'timeout' || status === 504) {
    return relayFailure('timeout')
  }
  if (code === 'limit_exceeded' || status === 413) {
    return relayFailure('limit-exceeded')
  }
  return relayFailure('failed')
}

export const awaitRelaySignal = <Value>(
  operation: Promise<Value>,
  signal: AbortSignal,
): Promise<Value> => {
  if (signal.aborted) return Promise.reject(relayFailure('timeout'))
  return new Promise<Value>((resolve, reject) => {
    const abort = () => {
      cleanup()
      reject(relayFailure('timeout'))
    }
    const cleanup = () => signal.removeEventListener('abort', abort)
    signal.addEventListener('abort', abort, { once: true })
    operation.then(
      value => {
        cleanup()
        resolve(value)
      },
      error => {
        cleanup()
        reject(error)
      },
    )
  })
}

export const readRelayBytes = async (
  response: Response,
  budget: RelayByteBudget,
  signal: AbortSignal,
): Promise<Uint8Array> => {
  const declared = response.headers.get('content-length')
  if (declared != null && declared !== '') {
    const byteLength = Number(declared)
    if (!Number.isSafeInteger(byteLength) || byteLength < 0) {
      throw relayFailure('failed')
    }
    if (byteLength > budget.remaining) throw relayFailure('limit-exceeded')
  }
  if (!response.body) return new Uint8Array()
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    while (true) {
      const result = await awaitRelaySignal(reader.read(), signal)
      if (result.done) break
      budget.consume(result.value.byteLength)
      chunks.push(result.value)
      total += result.value.byteLength
    }
  } catch (error) {
    await reader.cancel().catch(() => undefined)
    throw error
  } finally {
    reader.releaseLock()
  }
  const bytes = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return bytes
}

export const readRelayJson = async <Value>(
  response: Response,
  budget: RelayByteBudget,
  signal: AbortSignal,
): Promise<Value> => {
  const bytes = await readRelayBytes(response, budget, signal)
  try {
    return JSON.parse(
      new TextDecoder('utf-8', { fatal: true }).decode(bytes),
    ) as Value
  } catch {
    throw relayFailure('failed')
  }
}

export const throwRelayResponseError = async (
  response: Response,
  budget: RelayByteBudget,
  signal: AbortSignal,
): Promise<never> => {
  let code: string | null = null
  try {
    const body = await readRelayJson<unknown>(response, budget, signal)
    if (
      isRecord(body)
      && typeof body.code === 'string'
      && RELAY_ERROR_CODES.has(body.code)
    ) {
      code = body.code
    }
  } catch (error) {
    if (
      error instanceof FileSyncOperationError
      && (error.reason === 'timeout' || error.reason === 'limit-exceeded')
    ) {
      throw error
    }
  }
  throw mapRelayError(code, response.status)
}

export const assertRelayEntry = (value: unknown): RelayEntry => {
  if (!isRecord(value)) throw relayFailure('failed')
  const entryKey = assertOpaque(value.entryKey, 16_384)
  const fileKey = assertOpaque(value.fileKey, 512)
  const name = assertRelayName(value.name)
  const kind = value.kind
  if (kind !== 'file' && kind !== 'directory' && kind !== 'unsupported') {
    throw relayFailure('failed')
  }
  const versionTag = assertOpaque(value.versionTag, 512)
  const size = value.size == null ? null : Number(value.size)
  if (
    size != null
    && (!Number.isSafeInteger(size) || size < 0)
  ) {
    throw relayFailure('failed')
  }
  if (kind === 'file' && size == null) throw relayFailure('failed')
  if (kind !== 'file' && size != null) throw relayFailure('failed')
  const hash = value.hash == null ? null : assertRelayHash(value.hash)
  const mimeType = value.mimeType == null
    ? null
    : assertOpaque(value.mimeType, 256)
  let unsupportedReason: RelayUnsupportedReason | undefined
  switch (value.unsupportedReason) {
    case undefined:
    case null:
      break
    case 'native-document':
    case 'shortcut':
    case 'remote-item':
    case 'package':
      unsupportedReason = value.unsupportedReason
      break
    default:
      throw relayFailure('failed')
  }
  if (kind === 'unsupported' && !unsupportedReason) {
    throw relayFailure('failed')
  }
  return {
    entryKey,
    fileKey,
    name,
    kind,
    size,
    versionTag,
    hash,
    mimeType,
    ...(unsupportedReason ? { unsupportedReason } : {}),
  }
}

export const assertRelayHash = (value: unknown): FileSyncHash => {
  if (!isRecord(value)) throw relayFailure('failed')
  const algorithm = value.algorithm
  const hashValue = value.value
  if (
    algorithm === 'sha256'
    && typeof hashValue === 'string'
    && /^[0-9a-f]{64}$/.test(hashValue)
  ) {
    return { algorithm, value: hashValue }
  }
  if (
    algorithm === 'quickxor'
    && typeof hashValue === 'string'
    && /^[A-Za-z0-9+/]+={0,2}$/.test(hashValue)
    && hashValue.length <= 64
  ) {
    return { algorithm, value: hashValue }
  }
  throw relayFailure('failed')
}

export const normalizeRelayHashes = (
  hashes: readonly FileSyncHash[],
): FileSyncHash[] => {
  try {
    return normalizeFileSyncHashes(hashes)
  } catch {
    throw relayFailure('failed')
  }
}

export const inferRelayMimeType = (key: string): string => {
  const extension = key.toLocaleLowerCase('en-US').split('.').pop()
  if (extension === 'md' || extension === 'markdown') return 'text/markdown'
  if (extension === 'json') return 'application/json'
  if (extension === 'txt') return 'text/plain'
  if (extension === 'csv') return 'text/csv'
  return 'application/octet-stream'
}

export const sha256Hex = async (
  bytes: Uint8Array,
  signal?: AbortSignal,
): Promise<string> => {
  if (signal?.aborted) throw relayFailure('timeout')
  const source = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer
  const digestOperation = globalThis.crypto.subtle.digest('SHA-256', source)
  const digest = signal
    ? await awaitRelaySignal(digestOperation, signal)
    : await digestOperation
  if (signal?.aborted) throw relayFailure('timeout')
  return Array.from(
    new Uint8Array(digest),
    value => value.toString(16).padStart(2, '0'),
  ).join('')
}

export const computeQuickXor = (bytes: Uint8Array): FileSyncHash => {
  const output = new Uint8Array(20)
  for (let byteIndex = 0; byteIndex < bytes.byteLength; byteIndex += 1) {
    const shift = (byteIndex * 11) % 160
    const value = bytes[byteIndex]!
    for (let bitIndex = 0; bitIndex < 8; bitIndex += 1) {
      if ((value & (1 << bitIndex)) === 0) continue
      const outputBit = (shift + bitIndex) % 160
      output[Math.floor(outputBit / 8)]! ^= 1 << (outputBit % 8)
    }
  }
  let remaining = BigInt(bytes.byteLength)
  for (let index = 0; index < 8; index += 1) {
    output[12 + index]! ^= Number(remaining & 0xffn)
    remaining >>= 8n
  }
  return { algorithm: 'quickxor', value: encodeBase64(output) }
}

export const encodeRelayJsonHeader = (value: unknown): string =>
  encodeBase64Url(new TextEncoder().encode(JSON.stringify(value)))

export const decodeRelayJsonHeader = <Value>(value: string): Value => {
  try {
    const bytes = decodeBase64Url(value)
    return JSON.parse(
      new TextDecoder('utf-8', { fatal: true }).decode(bytes),
    ) as Value
  } catch {
    throw relayFailure('failed')
  }
}

export const assertOpaque = (value: unknown, maxLength: number): string => {
  if (
    typeof value !== 'string'
    || !value
    || value.length > maxLength
    || hasFileSyncControlCharacters(value)
  ) {
    throw relayFailure('failed')
  }
  return value
}

const assertRelayName = (value: unknown): string => {
  const name = assertOpaque(value, 240)
  if (
    name !== name.normalize('NFC')
    || name === '.'
    || name === '..'
    || name.includes('/')
    || name.includes('\\')
  ) {
    throw relayFailure('failed')
  }
  return name
}

const encodeBase64 = (bytes: Uint8Array): string => {
  let binary = ''
  for (let offset = 0; offset < bytes.byteLength; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000))
  }
  return btoa(binary)
}

const encodeBase64Url = (bytes: Uint8Array): string =>
  encodeBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/u, '')

const decodeBase64Url = (value: string): Uint8Array => {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw relayFailure('failed')
  const standard = value.replace(/-/g, '+').replace(/_/g, '/')
  const binary = atob(standard.padEnd(Math.ceil(standard.length / 4) * 4, '='))
  return Uint8Array.from(binary, character => character.charCodeAt(0))
}
