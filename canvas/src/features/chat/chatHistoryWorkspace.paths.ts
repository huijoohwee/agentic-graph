import { getWorkspaceFs } from '@/features/workspace-fs/workspaceFs'
import { ensureWorkspaceFolderTreeIfMissing } from '@/features/workspace-fs/ensureFolderTreeIfMissing'
import { normalizeWorkspacePath } from '@/features/workspace-fs/path'
import { formatWorkspaceUtcCompactTimestamp, formatWorkspaceUtcSessionTimestamp } from '@/features/workspace-fs/workspaceTimestamp'
import type { WorkspacePath } from '@/features/workspace-fs/types'
import { CHAT_LOCAL_STORAGE_ROOT_PATH_DEFAULT } from './chatStorageConfig'

type ChatHistoryStorageType = 'chatAgenticGraph' | 'chatHistory'
type KgcWorkspacePathKind = 'canonical' | 'trace' | 'output'

const KGC_SESSION_ID_RX = /\d{8}T\d{6}Z/i
const KGC_COMPACT_TIMESTAMP_RX = /\d{14}/
const KGC_CANONICAL_FILE_RX = /^kgc_(\d{8}T\d{6}Z|\d{14})(?:-[a-z0-9-]+)?\.md$/i
const KGC_TRACE_FILE_RX = /^kgc-trace_(\d{8}T\d{6}Z|\d{14})(?:-[a-z0-9-]+)?\.md$/i
const KGC_OUTPUT_FILE_RX = /^kgc-output_(\d{8}T\d{6}Z|\d{14})(?:-[a-z0-9-]+)?\.[a-z0-9]+$/i

export const resolveFilePrefix = (args?: { storageType?: 'chatAgenticGraph' | 'chatHistory' }): 'chh' | 'kgc' => {
  if (args?.storageType === 'chatAgenticGraph') return 'kgc'
  return 'chh'
}

const sessionAutoPathByScope = new Map<string, WorkspacePath>()
const sessionAutoInFlightByScope = new Map<string, Promise<WorkspacePath>>()

const formatCompactTimestamp = (timestampMs: number): string => {
  return formatWorkspaceUtcCompactTimestamp(timestampMs)
}

export const formatKgcWorkspaceSessionId = (timestampMs: number): string => {
  return formatWorkspaceUtcSessionTimestamp(timestampMs)
}

const normalizeKgcTimestampToken = (value: string): string => {
  const raw = String(value || '').trim()
  if (KGC_SESSION_ID_RX.test(raw)) return raw.toUpperCase()
  if (KGC_COMPACT_TIMESTAMP_RX.test(raw)) {
    return `${raw.slice(0, 8)}T${raw.slice(8, 14)}Z`
  }
  return raw
}

const formatFilename = (prefix: 'chh' | 'kgc', timestampMs: number): string => {
  if (prefix === 'kgc') return `kgc_${formatKgcWorkspaceSessionId(timestampMs)}.md`
  return `${prefix}_${formatCompactTimestamp(timestampMs)}.md`
}

const extractLastPathSegment = (workspacePath: string): string => {
  const normalized = normalizeWorkspacePath(workspacePath)
  const parts = normalized.split('/').filter(Boolean)
  return String(parts[parts.length - 1] || '').trim()
}

const extractSessionFolder = (workspacePath: string): string | null => {
  const normalized = normalizeWorkspacePath(workspacePath)
  const parts = normalized.split('/').filter(Boolean)
  if (parts.length < 2) return null
  const folder = String(parts[parts.length - 2] || '').trim()
  return KGC_SESSION_ID_RX.test(folder) ? folder.toUpperCase() : null
}

const parseKgcWorkspacePath = (workspacePath: string): { timestamp: string; kind: KgcWorkspacePathKind } | null => {
  const fileName = extractLastPathSegment(workspacePath)
  const canonicalMatch = KGC_CANONICAL_FILE_RX.exec(fileName)
  if (canonicalMatch?.[1]) {
    return { timestamp: normalizeKgcTimestampToken(String(canonicalMatch[1]).trim()), kind: 'canonical' }
  }
  const traceMatch = KGC_TRACE_FILE_RX.exec(fileName)
  if (traceMatch?.[1]) {
    return { timestamp: normalizeKgcTimestampToken(String(traceMatch[1]).trim()), kind: 'trace' }
  }
  const outputMatch = KGC_OUTPUT_FILE_RX.exec(fileName)
  if (outputMatch?.[1]) {
    return { timestamp: normalizeKgcTimestampToken(String(outputMatch[1]).trim()), kind: 'output' }
  }
  const sessionFolder = extractSessionFolder(workspacePath)
  if (sessionFolder) {
    if (/^kgc-output_/i.test(fileName)) return { timestamp: sessionFolder, kind: 'output' }
    if (/^kgc-trace_/i.test(fileName)) return { timestamp: sessionFolder, kind: 'trace' }
    if (/^kgc_/i.test(fileName)) return { timestamp: sessionFolder, kind: 'canonical' }
  }
  return null
}

export const extractKgcWorkspaceSessionId = (workspacePath: string | null | undefined): string | null => {
  const raw = String(workspacePath || '').trim()
  if (!raw) return null
  const parsed = parseKgcWorkspacePath(raw)
  if (parsed?.timestamp) return parsed.timestamp
  return extractSessionFolder(raw)
}

const replaceKgcPathKind = (
  workspacePath: string,
  nextFileName: string,
  sessionId: string,
): WorkspacePath => {
  const normalized = normalizeWorkspacePath(workspacePath)
  const parts = normalized.split('/').filter(Boolean)
  if (parts.length === 0) {
    return normalizeWorkspacePath(`/${sessionId}/${nextFileName}`)
  }
  const maybeFolder = String(parts[parts.length - 2] || '').trim()
  if (KGC_SESSION_ID_RX.test(maybeFolder)) {
    parts[parts.length - 2] = sessionId
  } else {
    parts.splice(parts.length - 1, 0, sessionId)
  }
  parts[parts.length - 1] = String(nextFileName || '').trim()
  return normalizeWorkspacePath(`/${parts.join('/')}`)
}

const replaceLastPathSegment = (workspacePath: string, nextFileName: string): WorkspacePath => {
  const normalized = normalizeWorkspacePath(workspacePath)
  const parts = normalized.split('/').filter(Boolean)
  if (parts.length === 0) return normalizeWorkspacePath(`/${nextFileName}`)
  parts[parts.length - 1] = String(nextFileName || '').trim()
  return normalizeWorkspacePath(`/${parts.join('/')}`)
}

export const isCanonicalKgcFilename = (name: string): boolean => {
  return /^kgc_(?:\d{8}T\d{6}Z|\d{14})\.md$/i.test(String(name || '').trim())
}

export const isKgcWorkspaceCompanionPath = (workspacePath: string): boolean => {
  return parseKgcWorkspacePath(workspacePath) !== null
}

export const toCanonicalKgcWorkspacePath = (workspacePath: string): WorkspacePath => {
  const normalized = normalizeWorkspacePath(workspacePath)
  const parsed = parseKgcWorkspacePath(normalized)
  if (!parsed) return normalized
  const sessionId = normalizeKgcTimestampToken(parsed.timestamp)
  return replaceKgcPathKind(normalized, `kgc_${sessionId}.md`, sessionId)
}

export const toKgcTraceWorkspacePath = (workspacePath: string): WorkspacePath | null => {
  const parsed = parseKgcWorkspacePath(workspacePath)
  if (!parsed) return null
  const sessionId = normalizeKgcTimestampToken(parsed.timestamp)
  return replaceKgcPathKind(workspacePath, `kgc-trace_${sessionId}.md`, sessionId)
}

export const toKgcStreamingWorkspacePath = (workspacePath: string): WorkspacePath => {
  return toKgcTraceWorkspacePath(workspacePath) || normalizeWorkspacePath(workspacePath)
}

export const toKgcOutputWorkspacePath = (
  workspacePath: string,
  extension = 'md',
  args?: { variant?: string | null },
): WorkspacePath | null => {
  const parsed = parseKgcWorkspacePath(workspacePath)
  if (!parsed) return null
  const safeExtension = String(extension || 'md').replace(/^\./, '').trim().toLowerCase() || 'md'
  const rawVariant = String(args?.variant || '').trim().toLowerCase()
  const safeVariant = rawVariant.replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '')
  const variantSuffix = safeVariant ? `-${safeVariant}` : ''
  const sessionId = normalizeKgcTimestampToken(parsed.timestamp)
  return replaceKgcPathKind(
    workspacePath,
    `kgc-output_${sessionId}${variantSuffix}.${safeExtension}`,
    sessionId,
  )
}

const shouldUseRequestedPath = (
  requestedPath: string,
  args?: {
    storageType?: ChatHistoryStorageType
    defaultLocalRootPath?: string | null
  },
): boolean => {
  if (args?.storageType !== 'chatAgenticGraph') return true
  if (!isKgcWorkspaceCompanionPath(requestedPath)) return false
  const requestedRoot = normalizeWorkspacePath(requestedPath).split('/').filter(Boolean)[0] || ''
  const rootRaw = String(args?.defaultLocalRootPath || '').trim()
  const activeRoot = normalizeWorkspacePath(rootRaw || CHAT_LOCAL_STORAGE_ROOT_PATH_DEFAULT).split('/').filter(Boolean)[0] || ''
  return Boolean(requestedRoot && activeRoot && requestedRoot === activeRoot)
}

const createTimestampedWorkspaceFile = async (args: {
  fs: Awaited<ReturnType<typeof getWorkspaceFs>>
  parentPath: WorkspacePath
  prefix: 'chh' | 'kgc'
  timestampMs: number
}): Promise<WorkspacePath> => {
  for (let i = 0; i < 5; i += 1) {
    const ts = args.timestampMs + i * 1000
    const parentPath = args.prefix === 'kgc'
      ? normalizeWorkspacePath(`${args.parentPath === '/' ? '' : args.parentPath}/${formatKgcWorkspaceSessionId(ts)}`)
      : args.parentPath
    await ensureWorkspaceFolderTreeIfMissing({ fs: args.fs, folderPath: parentPath })
    const name = formatFilename(args.prefix, ts)
    const existingPath = normalizeWorkspacePath(`${parentPath === '/' ? '' : parentPath}/${name}`)
    const existing = await args.fs.readFileText(existingPath)
    if (existing !== null) continue
    const created = await args.fs.createFile({ parentPath, name, text: '' })
    return normalizeWorkspacePath(created)
  }
  const fallbackTimestampMs = Date.now()
  const fallbackParentPath = args.prefix === 'kgc'
    ? normalizeWorkspacePath(`${args.parentPath === '/' ? '' : args.parentPath}/${formatKgcWorkspaceSessionId(fallbackTimestampMs)}`)
    : args.parentPath
  await ensureWorkspaceFolderTreeIfMissing({ fs: args.fs, folderPath: fallbackParentPath })
  const fallbackCreated = await args.fs.createFile({
    parentPath: fallbackParentPath,
    name: formatFilename(args.prefix, fallbackTimestampMs),
    text: '',
  })
  return normalizeWorkspacePath(fallbackCreated)
}

const resolveSessionScopeKey = (args?: {
  storageType?: ChatHistoryStorageType
  defaultLocalRootPath?: string | null
}): string => {
  const prefix = resolveFilePrefix(args)
  const rootRaw = String(args?.defaultLocalRootPath || '').trim()
  const root = normalizeWorkspacePath(rootRaw || CHAT_LOCAL_STORAGE_ROOT_PATH_DEFAULT)
  return `${prefix}:${root}`
}

const ensureWorkspaceFilePathExists = async (requestedPath: string): Promise<WorkspacePath> => {
  const normalized = normalizeWorkspacePath(requestedPath)
  const fs = await getWorkspaceFs()
  await fs.ensureSeed()
  const existing = await fs.readFileText(normalized)
  if (existing !== null) return normalized
  const lastSlash = normalized.lastIndexOf('/')
  const parent = normalizeWorkspacePath(lastSlash > 0 ? normalized.slice(0, lastSlash) : '/')
  const name = normalized.split('/').filter(Boolean).slice(-1)[0] || ''
  if (!name) return normalized
  await ensureWorkspaceFolderTreeIfMissing({ fs, folderPath: parent })
  const created = await fs.createFile({ parentPath: parent, name, text: '' })
  return normalizeWorkspacePath(created)
}

export const createNewChatHistoryWorkspaceFilePath = async (
  timestampMs: number,
  args?: { storageType?: ChatHistoryStorageType; defaultLocalRootPath?: string | null },
): Promise<WorkspacePath> => {
  const prefix = resolveFilePrefix(args)
  const scopeKey = resolveSessionScopeKey(args)
  const rootPathRaw = String(args?.defaultLocalRootPath || '').trim()
  const folder: WorkspacePath = normalizeWorkspacePath(rootPathRaw || CHAT_LOCAL_STORAGE_ROOT_PATH_DEFAULT)
  await ensureWorkspaceFolderTreeIfMissing({ folderPath: folder })
  const fs = await getWorkspaceFs()
  await fs.ensureSeed()
  const normalized = await createTimestampedWorkspaceFile({
    fs,
    parentPath: folder,
    prefix,
    timestampMs,
  })
  sessionAutoPathByScope.set(scopeKey, normalized)
  sessionAutoInFlightByScope.delete(scopeKey)
  return normalized
}

export const ensureHistoryFilePath = async (
  requestedPath: string | null,
  timestampMs: number,
  args?: { storageType?: ChatHistoryStorageType; defaultLocalRootPath?: string | null },
): Promise<WorkspacePath> => {
  const scopeKey = resolveSessionScopeKey(args)
  const raw = typeof requestedPath === 'string' ? requestedPath.trim() : ''
  if (raw && shouldUseRequestedPath(raw, args)) {
    const resolvedRequestedPath = args?.storageType === 'chatAgenticGraph'
      ? toCanonicalKgcWorkspacePath(raw)
      : normalizeWorkspacePath(raw)
    return await ensureWorkspaceFilePathExists(resolvedRequestedPath)
  }
  const cached = sessionAutoPathByScope.get(scopeKey)
  if (cached) {
    const resolvedCachedPath = args?.storageType === 'chatAgenticGraph'
      ? toCanonicalKgcWorkspacePath(cached)
      : normalizeWorkspacePath(cached)
    return await ensureWorkspaceFilePathExists(resolvedCachedPath)
  }
  const inflight = sessionAutoInFlightByScope.get(scopeKey)
  if (inflight) return await inflight
  const nextInFlight = (async () => {
    return await createNewChatHistoryWorkspaceFilePath(timestampMs, args)
  })()
  sessionAutoInFlightByScope.set(scopeKey, nextInFlight)
  try {
    return await nextInFlight
  } finally {
    if (sessionAutoInFlightByScope.get(scopeKey) === nextInFlight) {
      sessionAutoInFlightByScope.delete(scopeKey)
    }
  }
}

export const ensureChatHistoryWorkspaceFilePath = async (args: {
  requestedPath: string | null
  timestampMs: number
  storageType?: ChatHistoryStorageType
  defaultLocalRootPath?: string | null
  onResolvedPath?: (path: string) => void
}): Promise<string> => {
  const path = await ensureHistoryFilePath(args.requestedPath, args.timestampMs, {
    storageType: args.storageType,
    defaultLocalRootPath: args.defaultLocalRootPath,
  })
  if (typeof args.onResolvedPath === 'function') {
    try {
      args.onResolvedPath(path)
    } catch {
      void 0
    }
  }
  return path
}
