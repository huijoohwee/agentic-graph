import { normalizeNullableString, normalizeString } from './db'

export const AGENTIC_OS_STORAGE_SYNC_CURSOR_SCHEMA = 'agentic-graph-storage-sync-cursor/v2' as const

export type AgenticGraphStorageSyncCursor = Readonly<{
  schema: typeof AGENTIC_OS_STORAGE_SYNC_CURSOR_SCHEMA
  workspaceId: string
  mode: 'sync' | 'export'
  since: string | null
  snapshotAt: string
  lastUpdatedAt: string
  lastEntityRank: 1 | 2 | 3
  lastId: string | number
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
  if (!isStorageSyncTimestamp(value)) {
    throw new Error(`invalid storage page cursor ${label}`)
  }
  return value
}

export const isStorageSyncTimestamp = (value: unknown): value is string =>
  typeof value === 'string'
  && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)
  && Number.isFinite(Date.parse(value))
  && new Date(value).toISOString() === value

export const encodeAgenticGraphStorageSyncCursor = (
  cursor: Omit<AgenticGraphStorageSyncCursor, 'schema'>,
): string => encodeBase64Url(new TextEncoder().encode(JSON.stringify({
  schema: AGENTIC_OS_STORAGE_SYNC_CURSOR_SCHEMA,
  ...cursor,
} satisfies AgenticGraphStorageSyncCursor)))

export const decodeAgenticGraphStorageSyncCursor = (args: {
  token: string
  workspaceId: string
  since: string | null
  mode?: 'sync' | 'export'
}): AgenticGraphStorageSyncCursor => {
  let value: unknown
  try {
    value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(decodeBase64Url(args.token)))
  } catch {
    throw new Error('invalid storage page cursor')
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid storage page cursor')
  const record = value as Record<string, unknown>
  const rank = record.lastEntityRank
  const cursor: AgenticGraphStorageSyncCursor = {
    schema: record.schema as typeof AGENTIC_OS_STORAGE_SYNC_CURSOR_SCHEMA,
    workspaceId: normalizeString(record.workspaceId),
    mode: record.mode as 'sync' | 'export',
    since: record.since === null ? null : readIso(record.since, 'since'),
    snapshotAt: readIso(record.snapshotAt, 'snapshot'),
    lastUpdatedAt: readIso(record.lastUpdatedAt, 'position'),
    lastEntityRank: rank as 1 | 2 | 3,
    lastId: rank === 1 ? normalizeString(record.lastId) : record.lastId as number,
  }
  if (
    cursor.schema !== AGENTIC_OS_STORAGE_SYNC_CURSOR_SCHEMA
    || cursor.workspaceId !== normalizeString(args.workspaceId)
    || cursor.mode !== (args.mode || 'sync')
    || cursor.since !== normalizeNullableString(args.since)
    || typeof rank !== 'number' || ![1, 2, 3].includes(rank)
    || (rank === 1
      ? typeof record.lastId !== 'string' || !cursor.lastId || String(cursor.lastId).length > 1_024
      : typeof cursor.lastId !== 'number' || !Number.isSafeInteger(cursor.lastId) || cursor.lastId < 1)
    || cursor.lastUpdatedAt > cursor.snapshotAt
    || (cursor.since !== null && cursor.lastUpdatedAt < cursor.since)
  ) {
    throw new Error('storage page cursor does not match the request')
  }
  return cursor
}
