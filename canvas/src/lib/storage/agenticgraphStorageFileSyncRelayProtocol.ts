import {
  FileSyncOperationError,
  type FileSyncEntry,
} from './file-sync'
import {
  FILE_SYNC_RELAY_API_VERSION,
  assertRelayEntry,
  relayFailure,
  type RelayEntry,
} from './knowgrphStorageFileSyncRelaySupport'
import type { RelayMapping } from './knowgrphStorageFileSyncRelaySnapshot'

export const assertRelayWorkspaceId = (value: string): string => {
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/.test(value)) {
    throw relayFailure('failed')
  }
  return value
}

export const assertRelayEnvelope = (value: unknown): void => {
  if (
    !isRelayRecord(value)
    || value.ok !== true
    || value.apiVersion !== FILE_SYNC_RELAY_API_VERSION
  ) {
    throw relayFailure('failed')
  }
}

export const readRelayJsonEntry = (value: unknown, providerId: string): RelayEntry => {
  assertRelayEnvelope(value)
  if (!isRelayRecord(value) || value.providerId !== providerId) {
    throw relayFailure('failed')
  }
  return assertRelayEntry(value.entry)
}

export const readRelayMetadataEntry = (value: unknown, providerId: string): RelayEntry => {
  if (!isRelayRecord(value) || value.providerId !== providerId) {
    throw relayFailure('failed')
  }
  return assertRelayEntry(value.entry)
}

export const assertRelayExpectedRevision = (
  existing: RelayMapping | null,
  expectedRevision: string | null | undefined,
): void => {
  if (
    (existing && (
      typeof expectedRevision !== 'string'
      || expectedRevision !== existing.relay.versionTag
    ))
    || (!existing && expectedRevision !== null)
  ) {
    throw relayFailure('conflict')
  }
}

export const unsupportedRelayEntry = (): FileSyncOperationError =>
  new FileSyncOperationError(
    'unsupported-entry',
    'Unsupported file-sync entry',
  )

export const relayParentPath = (key: string): string => {
  const separator = key.lastIndexOf('/')
  return separator < 0 ? '' : key.slice(0, separator)
}

export const relayBasename = (key: string): string => {
  const separator = key.lastIndexOf('/')
  return separator < 0 ? key : key.slice(separator + 1)
}

export const cloneRelayFileSyncEntry = (entry: FileSyncEntry): FileSyncEntry => ({
  ...entry,
  hashes: entry.hashes.map(hash => ({ ...hash })),
})

export const isRelayRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)
