import { StorageRelayError, type StorageRelayOperation } from './storageRelaySafety'

export type FileSyncHash = {
  algorithm: 'sha256' | 'quickxor'
  value: string
}

export type FileSyncEntryKind = 'file' | 'directory' | 'unsupported'

export type FileSyncProviderEntry = {
  resourceId: string
  parentResourceId: string | null
  name: string
  kind: FileSyncEntryKind
  size: number | null
  versionTag: string
  hash: FileSyncHash | null
  mimeType: string | null
  unsupportedReason?: 'native-document' | 'shortcut' | 'remote-item' | 'package'
}

export type FileSyncListPageResult = {
  entries: FileSyncProviderEntry[]
  nextCursor: string | null
  incomplete: boolean
}

export type FileSyncReadResult = {
  entry: FileSyncProviderEntry
  bytes: Uint8Array
}

export type FileSyncWriteRequest = {
  resourceId: string | null
  parentResourceId: string
  name: string
  expectedVersion: string | null
  mimeType: string
  bytes: Uint8Array
  expectedHash: FileSyncHash
  idempotencyKey: string
  operation: StorageRelayOperation
}

export interface FileSyncProvider {
  readonly providerType: 'google-drive' | 'one-drive'
  listPage(args: {
    parentResourceId: string
    cursor: string | null
    limit: number
    operation: StorageRelayOperation
  }): Promise<FileSyncListPageResult>
  read(args: {
    resourceId: string
    expectedVersion: string | null
    operation: StorageRelayOperation
  }): Promise<FileSyncReadResult>
  createDirectory(args: {
    parentResourceId: string
    name: string
    idempotencyKey: string
    operation: StorageRelayOperation
  }): Promise<FileSyncProviderEntry>
  writeFile(args: FileSyncWriteRequest): Promise<FileSyncProviderEntry>
  trash(args: {
    resourceId: string
    expectedVersion: string
    operation: StorageRelayOperation
  }): Promise<void>
}

export const assertFileSyncResourceId = (value: unknown): string => {
  if (
    typeof value !== 'string'
    || !value
    || value.length > 1024
    || /[\u0000-\u001f\u007f]/u.test(value)
  ) {
    throw new StorageRelayError({ code: 'invalid_response', status: 502 })
  }
  return value
}

export const assertFileSyncName = (value: unknown): string => {
  if (
    typeof value !== 'string'
    || !value
    || value.length > 240
    || value !== value.normalize('NFC')
    || value === '.'
    || value === '..'
    || value.includes('/')
    || value.includes('\\')
    || /[\u0000-\u001f\u007f]/u.test(value)
  ) {
    throw new StorageRelayError({ code: 'invalid_request', status: 400 })
  }
  return value
}

export const assertFileSyncVersionTag = (
  value: unknown,
  source: 'request' | 'response' = 'response',
): string => {
  if (
    typeof value !== 'string'
    || !value
    || value.length > 512
    || /[\u0000-\u001f\u007f]/u.test(value)
  ) {
    throw new StorageRelayError({
      code: source === 'request' ? 'invalid_request' : 'invalid_response',
      status: source === 'request' ? 400 : 502,
    })
  }
  return value
}

export const assertFileSyncSize = (value: unknown): number => {
  const size = Number(value)
  if (!Number.isSafeInteger(size) || size < 0) {
    throw new StorageRelayError({ code: 'invalid_response', status: 502 })
  }
  return size
}

const encodeBase64 = (bytes: Uint8Array): string => {
  let binary = ''
  const chunkSize = 0x8000
  for (let offset = 0; offset < bytes.byteLength; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize))
  }
  return btoa(binary)
}

export const computeFileSyncSha256 = async (bytes: Uint8Array): Promise<FileSyncHash> => {
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return {
    algorithm: 'sha256',
    value: Array.from(new Uint8Array(digest))
      .map(byte => byte.toString(16).padStart(2, '0'))
      .join(''),
  }
}

export const computeFileSyncQuickXor = (bytes: Uint8Array): FileSyncHash => {
  const hashBytes = new Uint8Array(20)
  for (let byteIndex = 0; byteIndex < bytes.byteLength; byteIndex += 1) {
    const shift = (byteIndex * 11) % 160
    const value = bytes[byteIndex]!
    for (let bitIndex = 0; bitIndex < 8; bitIndex += 1) {
      if ((value & (1 << bitIndex)) === 0) continue
      const outputBit = (shift + bitIndex) % 160
      hashBytes[Math.floor(outputBit / 8)]! ^= 1 << (outputBit % 8)
    }
  }
  let remainingLength = BigInt(bytes.byteLength)
  for (let index = 0; index < 8; index += 1) {
    hashBytes[12 + index]! ^= Number(remainingLength & 0xffn)
    remainingLength >>= 8n
  }
  return { algorithm: 'quickxor', value: encodeBase64(hashBytes) }
}

export const assertMatchingFileSyncHash = (
  expected: FileSyncHash,
  actual: FileSyncHash | null,
): void => {
  if (
    !actual
    || expected.algorithm !== actual.algorithm
    || expected.value !== actual.value
  ) {
    throw new StorageRelayError({ code: 'invalid_response', status: 502 })
  }
}

export const assertFileSyncEntry = (entry: FileSyncProviderEntry): FileSyncProviderEntry => {
  assertFileSyncResourceId(entry.resourceId)
  if (entry.parentResourceId != null) assertFileSyncResourceId(entry.parentResourceId)
  assertFileSyncName(entry.name)
  assertFileSyncVersionTag(entry.versionTag)
  if (entry.size != null) assertFileSyncSize(entry.size)
  if (entry.kind !== 'file' && entry.kind !== 'directory' && entry.kind !== 'unsupported') {
    throw new StorageRelayError({ code: 'invalid_response', status: 502 })
  }
  if (entry.kind === 'directory' && entry.size != null) {
    throw new StorageRelayError({ code: 'invalid_response', status: 502 })
  }
  return entry
}
