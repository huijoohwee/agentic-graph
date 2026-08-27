import { normalizeNullableString, normalizeString } from './db'

export const AGENTICGRAPH_STORAGE_SYNC_CURSOR_SCHEMA = 'agenticgraph-storage-sync-cursor/v1' as const

export type AgenticGraphStorageSyncCursor = Readonly<{
  schema: typeof AGENTICGRAPH_STORAGE_SYNC_CURSOR_SCHEMA
  workspaceId: string
  since: string | null
  snapshotAt: string
  lastUpdatedAt: string
  lastEntityRank: 1 | 2 | 3
  lastId: string
}>

const encodeBase64Url = (bytes: Uint8Array): string => {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

const decodeBase64Url = (value: string): Uint8Array => {
  if (!/^[A-Za-z0-9_-]+$/.test(value) || value.length > 4_096) throw new Error('invalid storage page cursor')
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=')
  const binary = atob(base64)
  return Uint8Array.from(binary, character => character.charCodeAt(0))
}

const readIso = (value: unknown, label: string): string => {
  const normalized = normalizeString(value)
  if (!normalized || normalized.length > 64 || !Number.isFinite(Date.parse(normalized))) {
    throw new Error(`invalid storage page cursor ${label}`)
  }
  return normalized
}

export const encodeAgenticGraphStorageSyncCursor = (
  cursor: Omit<AgenticGraphStorageSyncCursor, 'schema'>,
): string => encodeBase64Url(new TextEncoder().encode(JSON.stringify({
  schema: AGENTICGRAPH_STORAGE_SYNC_CURSOR_SCHEMA,
  ...cursor,
} satisfies AgenticGraphStorageSyncCursor)))

export const decodeAgenticGraphStorageSyncCursor = (args: {
  token: string
  workspaceId: string
  since: string | null
}): AgenticGraphStorageSyncCursor => {
  let value: unknown
  try {
    value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(decodeBase64Url(args.token)))
  } catch {
    throw new Error('invalid storage page cursor')
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid storage page cursor')
  const record = value as Record<string, unknown>
  const rank = Number(record.lastEntityRank)
  const cursor: AgenticGraphStorageSyncCursor = {
    schema: record.schema as typeof AGENTICGRAPH_STORAGE_SYNC_CURSOR_SCHEMA,
    workspaceId: normalizeString(record.workspaceId),
    since: normalizeNullableString(record.since),
    snapshotAt: readIso(record.snapshotAt, 'snapshot'),
    lastUpdatedAt: readIso(record.lastUpdatedAt, 'position'),
    lastEntityRank: rank as 1 | 2 | 3,
    lastId: normalizeString(record.lastId),
  }
  if (
    cursor.schema !== AGENTICGRAPH_STORAGE_SYNC_CURSOR_SCHEMA
    || cursor.workspaceId !== normalizeString(args.workspaceId)
    || cursor.since !== normalizeNullableString(args.since)
    || ![1, 2, 3].includes(rank)
    || !cursor.lastId
    || cursor.lastId.length > 1_024
    || cursor.lastUpdatedAt > cursor.snapshotAt
  ) {
    throw new Error('storage page cursor does not match the request')
  }
  return cursor
}
