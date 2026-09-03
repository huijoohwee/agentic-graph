import { getWorkspaceFs } from '@/features/workspace-fs/workspaceFs'
import { ensureWorkspaceFolderTreeIfMissing } from '@/features/workspace-fs/ensureFolderTreeIfMissing'
import { normalizeWorkspacePath } from '@/features/workspace-fs/path'
import { formatWorkspaceUtcCompactTimestamp, formatWorkspaceUtcSessionTimestamp } from '@/features/workspace-fs/workspaceTimestamp'
import type { WorkspacePath } from '@/features/workspace-fs/types'
import { CHAT_LOCAL_STORAGE_ROOT_PATH_DEFAULT } from './chatStorageConfig'

type ChatHistoryStorageType = 'chatAgenticGraph' | 'chatHistory'
type AgenticOsWorkspacePathKind = 'canonical' | 'trace' | 'output'

const AGENTIC_OS_SESSION_ID_RX = /\d{8}T\d{6}Z/i
const AGENTIC_OS_COMPACT_TIMESTAMP_RX = /\d{14}/
const AGENTIC_OS_CANONICAL_FILE_RX = /^agenticOs_(\d{8}T\d{6}Z|\d{14})(?:-[a-z0-9-]+)?\.md$/i
const AGENTIC_OS_TRACE_FILE_RX = /^agentic-os-trace_(\d{8}T\d{6}Z|\d{14})(?:-[a-z0-9-]+)?\.md$/i
const AGENTIC_OS_OUTPUT_FILE_RX = /^agentic-os-output_(\d{8}T\d{6}Z|\d{14})(?:-[a-z0-9-]+)?\.[a-z0-9]+$/i

export const resolveFilePrefix = (args?: { storageType?: 'chatAgenticGraph' | 'chatHistory' }): 'chh' | 'agenticOs' => {
  if (args?.storageType === 'chatAgenticGraph') return 'agenticOs'
  return 'chh'
}

const sessionAutoPathByScope = new Map<string, WorkspacePath>()
const sessionAutoInFlightByScope = new Map<string, Promise<WorkspacePath>>()

const formatCompactTimestamp = (timestampMs: number): string => {
  return formatWorkspaceUtcCompactTimestamp(timestampMs)
}

export const formatAgenticOsWorkspaceSessionId = (timestampMs: number): string => {
  return formatWorkspaceUtcSessionTimestamp(timestampMs)
}

const normalizeAgenticOsTimestampToken = (value: string): string => {
  const raw = String(value || '').trim()
  if (AGENTIC_OS_SESSION_ID_RX.test(raw)) return raw.toUpperCase()
  if (AGENTIC_OS_COMPACT_TIMESTAMP_RX.test(raw)) {
    return `${raw.slice(0, 8)}T${raw.slice(8, 14)}Z`
  }
  return raw
}

const formatFilename = (prefix: 'chh' | 'agenticOs', timestampMs: number): string => {
  if (prefix === 'agenticOs') return `agenticOs_${formatAgenticOsWorkspaceSessionId(timestampMs)}.md`
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
  return AGENTIC_OS_SESSION_ID_RX.test(folder) ? folder.toUpperCase() : null
}

const parseAgenticOsWorkspacePath = (workspacePath: string): { timestamp: string; kind: AgenticOsWorkspacePathKind } | null => {
  const fileName = extractLastPathSegment(workspacePath)
  const canonicalMatch = AGENTIC_OS_CANONICAL_FILE_RX.exec(fileName)
  if (canonicalMatch?.[1]) {
    return { timestamp: normalizeAgenticOsTimestampToken(String(canonicalMatch[1]).trim()), kind: 'canonical' }
  }
  const traceMatch = AGENTIC_OS_TRACE_FILE_RX.exec(fileName)
  if (traceMatch?.[1]) {
    return { timestamp: normalizeAgenticOsTimestampToken(String(traceMatch[1]).trim()), kind: 'trace' }
  }
  const outputMatch = AGENTIC_OS_OUTPUT_FILE_RX.exec(fileName)
  if (outputMatch?.[1]) {
    return { timestamp: normalizeAgenticOsTimestampToken(String(outputMatch[1]).trim()), kind: 'output' }
  }
  const sessionFolder = extractSessionFolder(workspacePath)
  if (sessionFolder) {
    if (/^agentic-os-output_/i.test(fileName)) return { timestamp: sessionFolder, kind: 'output' }
    if (/^agentic-os-trace_/i.test(fileName)) return { timestamp: sessionFolder, kind: 'trace' }
    if (/^agenticOs_/i.test(fileName)) return { timestamp: sessionFolder, kind: 'canonical' }
  }
  return null
}

export const extractAgenticOsWorkspaceSessionId = (workspacePath: string | null | undefined): string | null => {
  const raw = String(workspacePath || '').trim()
  if (!raw) return null
  const parsed = parseAgenticOsWorkspacePath(raw)
  if (parsed?.timestamp) return parsed.timestamp
  return extractSessionFolder(raw)
}

const replaceAgenticOsPathKind = (
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
  if (AGENTIC_OS_SESSION_ID_RX.test(maybeFolder)) {
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

export const isCanonicalAgenticOsFilename = (name: string): boolean => {
  return /^agenticOs_(?:\d{8}T\d{6}Z|\d{14})\.md$/i.test(String(name || '').trim())
}

export const isAgenticOsWorkspaceCompanionPath = (workspacePath: string): boolean => {
  return parseAgenticOsWorkspacePath(workspacePath) !== null
}

export const toCanonicalAgenticOsWorkspacePath = (workspacePath: string): WorkspacePath => {
  const normalized = normalizeWorkspacePath(workspacePath)
  const parsed = parseAgenticOsWorkspacePath(normalized)
  if (!parsed) return normalized
  const sessionId = normalizeAgenticOsTimestampToken(parsed.timestamp)
  return replaceAgenticOsPathKind(normalized, `agenticOs_${sessionId}.md`, sessionId)
}

export const toAgenticOsTraceWorkspacePath = (workspacePath: string): WorkspacePath | null => {
  const parsed = parseAgenticOsWorkspacePath(workspacePath)
  if (!parsed) return null
  const sessionId = normalizeAgenticOsTimestampToken(parsed.timestamp)
  return replaceAgenticOsPathKind(workspacePath, `agentic-os-trace_${sessionId}.md`, sessionId)
}

export const toAgenticOsStreamingWorkspacePath = (workspacePath: string): WorkspacePath => {
  return toAgenticOsTraceWorkspacePath(workspacePath) || normalizeWorkspacePath(workspacePath)
}

export const toAgenticOsOutputWorkspacePath = (
  workspacePath: string,
  extension = 'md',
  args?: { variant?: string | null },
): WorkspacePath | null => {
  const parsed = parseAgenticOsWorkspacePath(workspacePath)
  if (!parsed) return null
  const safeExtension = String(extension || 'md').replace(/^\./, '').trim().toLowerCase() || 'md'
  const rawVariant = String(args?.variant || '').trim().toLowerCase()
  const safeVariant = rawVariant.replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '')
  const variantSuffix = safeVariant ? `-${safeVariant}` : ''
  const sessionId = normalizeAgenticOsTimestampToken(parsed.timestamp)
  return replaceAgenticOsPathKind(
    workspacePath,
    `agentic-os-output_${sessionId}${variantSuffix}.${safeExtension}`,
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
  if (!isAgenticOsWorkspaceCompanionPath(requestedPath)) return false
  const requestedRoot = normalizeWorkspacePath(requestedPath).split('/').filter(Boolean)[0] || ''
  const rootRaw = String(args?.defaultLocalRootPath || '').trim()
  const activeRoot = normalizeWorkspacePath(rootRaw || CHAT_LOCAL_STORAGE_ROOT_PATH_DEFAULT).split('/').filter(Boolean)[0] || ''
  return Boolean(requestedRoot && activeRoot && requestedRoot === activeRoot)
}

const createTimestampedWorkspaceFile = async (args: {
  fs: Awaited<ReturnType<typeof getWorkspaceFs>>
  parentPath: WorkspacePath
  prefix: 'chh' | 'agenticOs'
  timestampMs: number
}): Promise<WorkspacePath> => {
  for (let i = 0; i < 5; i += 1) {
    const ts = args.timestampMs + i * 1000
    const parentPath = args.prefix === 'agenticOs'
      ? normalizeWorkspacePath(`${args.parentPath === '/' ? '' : args.parentPath}/${formatAgenticOsWorkspaceSessionId(ts)}`)
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
  const fallbackParentPath = args.prefix === 'agenticOs'
    ? normalizeWorkspacePath(`${args.parentPath === '/' ? '' : args.parentPath}/${formatAgenticOsWorkspaceSessionId(fallbackTimestampMs)}`)
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
      ? toCanonicalAgenticOsWorkspacePath(raw)
      : normalizeWorkspacePath(raw)
    return await ensureWorkspaceFilePathExists(resolvedRequestedPath)
  }
  const cached = sessionAutoPathByScope.get(scopeKey)
  if (cached) {
    const resolvedCachedPath = args?.storageType === 'chatAgenticGraph'
      ? toCanonicalAgenticOsWorkspacePath(cached)
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
