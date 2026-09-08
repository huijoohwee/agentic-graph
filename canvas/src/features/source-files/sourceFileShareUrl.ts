import type { WorkspaceEntry, WorkspaceFs, WorkspacePath } from '@/features/workspace-fs/types'
import type { WorkspaceSourceIndex } from '@/features/workspace-fs/sourceIndex'
import type { SourceFile } from '@/hooks/store/types'
import type {
  AgenticGraphStorageSyncNowArgs,
  AgenticGraphStorageSyncRunResult,
} from '@/lib/storage/agentic-graph-storage-client-sync'
import { getAgenticGraphStorageDb, type AgenticGraphStorageDb } from '@/lib/storage/agentic-graph-storage-db'
import { AGENTIC_OS_STORAGE_API_VERSION, buildAgenticGraphStorageDocPath, hashAgenticGraphStorageContent } from '@/lib/storage/agentic-graph-storage-sync-contract'
import { AGENTIC_OS_STORAGE_ROUTE_PATHS } from '@/lib/storage/agentic-graph-storage-route-paths'
import { AGENTIC_OS_STORAGE_SYNC_BOUNDS } from '@/lib/storage/agentic-graph-storage-bounds'
import { getClientFetch, parseStorageResponseJson, resolveAgenticGraphStorageApiUrl } from '@/lib/storage/agentic-graph-storage-client-transport'
import { exportAgenticGraphStorageWorkspacePages } from '@/lib/storage/agentic-graph-storage-client-export'
import { buildPublishedDocShareUrl, buildPublishedDocShareUrlFromSource } from '@/features/canvas/canvasDocDeepLink'
import { readEnvString } from '@/lib/config.env'
import { hashStringToHex } from '@/lib/hash/stringHash'
import { useGraphStore } from '@/hooks/useGraphStore'
import { buildAgenticGraphWorkspaceIdFromSourceFilesWorkspaceState } from '@/features/source-files/sourceFilesStorageSync'
import {
  readPrimaryStorageCanonicalPathForWorkspacePath,
} from '@/features/source-files/sourceFilesStoragePaths'
import {
  readAgenticGraphStorageBaseUrl,
  readAgenticGraphStorageRuntimeSyncEnabled,
} from '@/features/source-files/source-files-agentic-graph-storage-settings'

const normalizeString = (value: unknown): string => String(value || '').trim()

export type ReadWorkspaceEntryTextForStoragePublish = (
  entry: WorkspaceEntry,
) => string | null | undefined | Promise<string | null | undefined>

export type ResolveWorkspaceEntryCanonicalPathForStoragePublish = (
  entry: WorkspaceEntry,
) => string | null | undefined

export const readActiveAgenticGraphStorageWorkspaceId = (): string => {
  const override = normalizeString(readEnvString('VITE_AGENTIC_OS_STORAGE_WORKSPACE_ID', ''))
  if (override) return override
  const state = useGraphStore.getState()
  return buildAgenticGraphWorkspaceIdFromSourceFilesWorkspaceState({
    folderName: state.localMarkdownFolderName,
    accessMode: state.localMarkdownFolderAccessMode,
    folderCacheId: state.localMarkdownFolderCacheId,
    selectedFolderPath: state.localMarkdownSelectedFolderPath,
  })
}

const readWorkspaceEntryResolvedTextForStoragePublish = async (args: {
  entry: WorkspaceEntry
  getWorkspaceFs: () => Promise<WorkspaceFs>
  readEntryText?: ReadWorkspaceEntryTextForStoragePublish
  storageFallbackByPath: Map<string, string>
}): Promise<string> => {
  const inlineText = String(args.entry.text || '')
  if (inlineText.trim()) return inlineText
  if (typeof args.readEntryText === 'function') {
    try {
      const resolved = String((await args.readEntryText(args.entry)) || '')
      if (resolved.trim()) return resolved
    } catch {
      void 0
    }
  }
  try {
    const { readWorkspaceActiveDocumentResolvedText } = await import('@/features/source-files/sourceFilesRuntimeActive')
    let fs: WorkspaceFs | undefined
    try {
      fs = await args.getWorkspaceFs()
    } catch {
      fs = undefined
    }
    const resolved = await readWorkspaceActiveDocumentResolvedText({
      activePath: args.entry.path,
      currentText: inlineText,
      fs,
      storageFallbackByPath: args.storageFallbackByPath,
      preferCanonicalPathText: true,
    })
    if (String(resolved || '').trim()) return String(resolved || '')
  } catch {
    void 0
  }
  return inlineText
}

export const buildPublishedSourceFileShareUrlForWorkspacePath = (args: {
  entryPath: WorkspacePath
  workspaceId?: string | null
  origin?: string | null
}): string | null => {
  const canonicalPath = readPrimaryStorageCanonicalPathForWorkspacePath(args.entryPath, { markdownOnly: false })
  if (!canonicalPath) return null
  return buildPublishedDocShareUrl({
    workspaceId: args.workspaceId,
    canonicalPath,
    origin: args.origin,
  })
}

const buildWorkspaceEntryStorageSourceFileRecord = (args: {
  entry: WorkspaceEntry
  workspaceId: string
  canonicalPath: string
  allowEmptyText?: boolean
}): SourceFile | null => {
  if (args.entry.kind !== 'file') return null
  const text = String(args.entry.text || '')
  if (!args.allowEmptyText && !text.trim()) return null
  const canonicalPath = normalizeString(args.canonicalPath)
  if (!canonicalPath) return null
  const identity = `${args.workspaceId}:${canonicalPath}`
  return {
    id: `share:${hashStringToHex(identity)}`,
    name: normalizeString(args.entry.name) || canonicalPath.split('/').filter(Boolean).slice(-1)[0] || 'shared.md',
    text,
    enabled: true,
    status: 'idle',
    source: {
      kind: 'local',
      path: canonicalPath,
    },
  }
}

export type SelectedStorageDocumentContent = Readonly<{
  workspacePath: WorkspacePath
  canonicalPath: string
  text: string
}>

export type PublishWorkspaceEntriesToAgenticGraphStorageResult = {
  workspaceId: string
  canonicalPaths: string[]
  queuedMutationCount: number
  storedCount: number
  selectedContent: ReadonlyArray<SelectedStorageDocumentContent>
  syncResult: AgenticGraphStorageSyncRunResult | null
}

export const publishWorkspaceEntriesToAgenticGraphStorage = async (args: {
  entries: WorkspaceEntry[]
  workspaceId?: string | null
  syncNow?: boolean
  baseUrl?: string | null
  deviceId?: string | null
  fetchImpl?: AgenticGraphStorageSyncNowArgs['fetchImpl']
  dbState?: AgenticGraphStorageDb | null
  readEntryText?: ReadWorkspaceEntryTextForStoragePublish
  resolveCanonicalPath?: ResolveWorkspaceEntryCanonicalPathForStoragePublish
  forceStorageWrite?: boolean
  allowEmptyText?: boolean
}): Promise<PublishWorkspaceEntriesToAgenticGraphStorageResult> => {
  const workspaceId = normalizeString(args.workspaceId) || readActiveAgenticGraphStorageWorkspaceId()
  const entries = Array.isArray(args.entries) ? args.entries : []
  const records: SourceFile[] = []
  const selectedContent: SelectedStorageDocumentContent[] = []
  const canonicalPaths: string[] = []
  const seen = new Set<string>()
  const storageFallbackByPath = new Map<string, string>()
  let workspaceFsPromise: Promise<WorkspaceFs> | null = null
  const getWorkspaceFsForPublish = () => {
    if (!workspaceFsPromise) {
      workspaceFsPromise = import('@/features/workspace-fs/workspaceFs').then(mod => mod.getWorkspaceFs())
    }
    return workspaceFsPromise
  }
  for (let i = 0; i < entries.length; i += 1) {
    const entry = entries[i]
    if (!entry || entry.kind !== 'file') continue
    const canonicalPath = normalizeString(args.resolveCanonicalPath?.(entry))
      || readPrimaryStorageCanonicalPathForWorkspacePath(entry.path, { markdownOnly: false })
    if (!workspaceId || !canonicalPath || seen.has(canonicalPath)) continue
    seen.add(canonicalPath)
    const text = await readWorkspaceEntryResolvedTextForStoragePublish({
      entry,
      getWorkspaceFs: getWorkspaceFsForPublish,
      readEntryText: args.readEntryText,
      storageFallbackByPath,
    })
    const record = buildWorkspaceEntryStorageSourceFileRecord({
      entry: text === entry.text ? entry : { ...entry, text },
      workspaceId,
      canonicalPath,
      allowEmptyText: args.allowEmptyText,
    })
    if (!record) continue
    records.push(record)
    selectedContent.push(Object.freeze({ workspacePath: entry.path, canonicalPath, text: record.text }))
    canonicalPaths.push(canonicalPath)
  }
  if (!workspaceId || records.length === 0) {
    return { workspaceId, canonicalPaths: [], queuedMutationCount: 0, storedCount: 0, selectedContent: [], syncResult: null }
  }

  Object.freeze(selectedContent)
  const { syncSourceFilesToAgenticGraphStorage } = await import('@/features/source-files/sourceFilesStorageSync')
  const result = await syncSourceFilesToAgenticGraphStorage({
    workspaceId,
    sourceFiles: records,
    previousSourceFiles: [],
    dbState: args.dbState,
    forceDocumentUpsert: args.forceStorageWrite,
    reconcileMissingDocuments: false,
  })
  let syncResult: AgenticGraphStorageSyncRunResult | null = null
  if (args.syncNow !== false) {
    const { syncAgenticGraphStorageNow } = await import('@/lib/storage/agentic-graph-storage-client-sync')
    syncResult = await syncAgenticGraphStorageNow({
      workspaceId,
      baseUrl: normalizeString(args.baseUrl) || normalizeString(readEnvString('VITE_AGENTIC_OS_STORAGE_BASE_URL', '')),
      deviceId: normalizeString(args.deviceId) || undefined,
      fetchImpl: args.fetchImpl,
      dbState: args.dbState,
    })
  }
  return {
    workspaceId,
    canonicalPaths,
    queuedMutationCount: result.queuedMutationCount,
    storedCount: records.length,
    selectedContent,
    syncResult,
  }
}

export const publishWorkspacePathsToAgenticGraphStorage = async (args: {
  paths: ReadonlyArray<string>
  workspaceId?: string | null
  syncNow?: boolean
  baseUrl?: string | null
  deviceId?: string | null
  fetchImpl?: AgenticGraphStorageSyncNowArgs['fetchImpl']
  readEntryText?: ReadWorkspaceEntryTextForStoragePublish
}): Promise<PublishWorkspaceEntriesToAgenticGraphStorageResult> => {
  const normalizedPaths = new Set(
    (Array.isArray(args.paths) ? args.paths : [])
      .map(path => normalizeString(path))
      .filter(Boolean),
  )
  if (normalizedPaths.size === 0) {
    const workspaceId = normalizeString(args.workspaceId) || readActiveAgenticGraphStorageWorkspaceId()
    return { workspaceId, canonicalPaths: [], queuedMutationCount: 0, storedCount: 0, selectedContent: [], syncResult: null }
  }
  const { getWorkspaceFs } = await import('@/features/workspace-fs/workspaceFs')
  const fs = await getWorkspaceFs()
  const entries = await fs.listEntries()
  return publishWorkspaceEntriesToAgenticGraphStorage({
    entries: entries.filter(entry => entry?.kind === 'file' && normalizedPaths.has(normalizeString(entry.path))),
    workspaceId: args.workspaceId,
    syncNow: args.syncNow,
    baseUrl: args.baseUrl,
    deviceId: args.deviceId,
    fetchImpl: args.fetchImpl,
    readEntryText: args.readEntryText || (entry => fs.readFileText(entry.path)),
  })
}

export const publishGeneratedWorkspaceEntriesToAgenticGraphStorage = async (args: {
  entries: WorkspaceEntry[]
  workspaceId?: string | null
  syncNow?: boolean
  baseUrl?: string | null
  deviceId?: string | null
  fetchImpl?: AgenticGraphStorageSyncNowArgs['fetchImpl']
  dbState?: AgenticGraphStorageDb | null
  readEntryText?: ReadWorkspaceEntryTextForStoragePublish
}): Promise<PublishWorkspaceEntriesToAgenticGraphStorageResult> => {
  const shouldSyncNow = typeof args.syncNow === 'boolean'
    ? args.syncNow
    : readAgenticGraphStorageRuntimeSyncEnabled()
  return publishWorkspaceEntriesToAgenticGraphStorage({
    entries: args.entries,
    workspaceId: args.workspaceId,
    syncNow: shouldSyncNow,
    baseUrl: normalizeString(args.baseUrl) || readAgenticGraphStorageBaseUrl(),
    deviceId: args.deviceId,
    fetchImpl: args.fetchImpl,
    dbState: args.dbState,
    readEntryText: args.readEntryText,
  })
}

export const publishGeneratedWorkspacePathsToAgenticGraphStorage = async (args: {
  paths: ReadonlyArray<string>
  workspaceId?: string | null
  syncNow?: boolean
  baseUrl?: string | null
  deviceId?: string | null
  fetchImpl?: AgenticGraphStorageSyncNowArgs['fetchImpl']
  readEntryText?: ReadWorkspaceEntryTextForStoragePublish
}): Promise<PublishWorkspaceEntriesToAgenticGraphStorageResult> => {
  const shouldSyncNow = typeof args.syncNow === 'boolean'
    ? args.syncNow
    : readAgenticGraphStorageRuntimeSyncEnabled()
  return publishWorkspacePathsToAgenticGraphStorage({
    paths: args.paths,
    workspaceId: args.workspaceId,
    syncNow: shouldSyncNow,
    baseUrl: normalizeString(args.baseUrl) || readAgenticGraphStorageBaseUrl(),
    deviceId: args.deviceId,
    fetchImpl: args.fetchImpl,
    readEntryText: args.readEntryText,
  })
}

// Keep the deadline alive through body consumption, including anonymous readback.
const withShareDeadline = async <T,>(run: (signal: AbortSignal) => Promise<T>): Promise<T> => {
  const controller = new AbortController()
  let timer: ReturnType<typeof globalThis.setTimeout> | undefined
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = globalThis.setTimeout(() => {
      const error = new Error('Document storage timed out before verification completed')
      controller.abort(error)
      reject(error)
    }, AGENTIC_OS_STORAGE_SYNC_BOUNDS.pushRequestTimeoutMs)
  })
  try {
    return await Promise.race([
      run(controller.signal),
      timeout,
    ])
  } finally {
    globalThis.clearTimeout(timer)
    controller.abort()
  }
}

const withShareResponse = <T,>(args: {
  fetchImpl: ReturnType<typeof getClientFetch>
  input: string
  init: RequestInit
  consume: (response: Response, signal: AbortSignal) => Promise<T>
  signal?: AbortSignal
}): Promise<T> => {
  const run = async (signal: AbortSignal) => {
    if (signal.aborted) throw signal.reason
    const response = await args.fetchImpl(args.input, { ...args.init, signal })
    if (signal.aborted) {
      await response.body?.cancel(signal.reason)
      throw signal.reason
    }
    return args.consume(response, signal)
  }
  return args.signal ? run(args.signal) : withShareDeadline(run)
}

const readStorageDocumentTextMatches = (args: {
  fetchImpl: ReturnType<typeof getClientFetch>
  url: string
  text: string
  credentials: 'omit' | 'same-origin'
  signal?: AbortSignal
}): Promise<boolean> => withShareResponse({
  fetchImpl: args.fetchImpl, input: args.url, signal: args.signal,
  init: { method: 'GET', credentials: args.credentials, cache: 'no-store', redirect: 'error' },
  consume: async (response, signal) => {
    if (response.status === 404) {
      await response.body?.cancel()
      return false
    }
    if (!response.ok) {
      await response.body?.cancel()
      throw new Error(`Storage document verification failed (${response.status})`)
    }
    if (!response.body) return args.text === ''
    const reader = response.body.getReader()
    let cancellation: Promise<void> | null = null
    let complete = false
    const cancel = (reason?: unknown) => cancellation ||= reader.cancel(reason)
    const abort = () => { void cancel(signal.reason).catch(error => console.error('Share readback cancellation failed', error)) }
    signal.addEventListener('abort', abort, { once: true })
    const expectedBytes = new TextEncoder().encode(args.text)
    let receivedBytes = 0
    let bodyError: unknown
    let failed = false
    try {
      if (signal.aborted) throw signal.reason
      while (true) {
        const next = await reader.read()
        if (signal.aborted) throw signal.reason
        if (next.done) { complete = true; break }
        if (receivedBytes + next.value.byteLength > expectedBytes.byteLength) {
          await cancel('Storage document exceeds the selected content length')
          return false
        }
        for (let index = 0; index < next.value.byteLength; index += 1) {
          if (next.value[index] !== expectedBytes[receivedBytes + index]) {
            await cancel('Storage document differs from selected content')
            return false
          }
        }
        receivedBytes += next.value.byteLength
      }
      return receivedBytes === expectedBytes.byteLength
    } catch (error) {
      failed = true
      bodyError = error
      throw error
    } finally {
      signal.removeEventListener('abort', abort)
      try { if (!complete) await cancel('Storage document verification ended') }
      catch (error) {
        if (failed) throw new AggregateError([bodyError, error], 'Document verification and reader cleanup failed')
        throw error
      } finally { reader.releaseLock() }
    }
  },
})

// One deadline owns the entire selected readback; no physical ID/revision is exposed by this route.
export const verifyStoredWorkspaceDocumentContents = (args: {
  workspaceId: string; selectedContent: ReadonlyArray<SelectedStorageDocumentContent>
  baseUrl?: string | null; fetchImpl?: AgenticGraphStorageSyncNowArgs['fetchImpl']
}): Promise<boolean> => withShareDeadline(async signal => {
  const fetchImpl = getClientFetch(args.fetchImpl)
  for (const selected of args.selectedContent) {
    if (!await readStorageDocumentTextMatches({
      fetchImpl, text: selected.text, credentials: 'same-origin', signal,
      url: resolveAgenticGraphStorageApiUrl(buildAgenticGraphStorageDocPath(args.workspaceId, selected.canonicalPath), args.baseUrl),
    })) return false
  }
  return true
})

type ShareDocumentIdentity = { id: string; revision: number; contentHash: string }

const readSyncedShareDocumentIdentity = async (args: {
  workspaceId: string; canonicalPath: string; text: string; contentHash: string
  baseUrl: string; fetchImpl: ReturnType<typeof getClientFetch>
}): Promise<ShareDocumentIdentity> => {
  const db = await getAgenticGraphStorageDb()
  const pending = await db.collections.syncOutbox.find({ selector: { workspaceId: args.workspaceId, entity: 'document' } }).exec()
  if (pending.some(row => {
    const payload = row.get('payload') as { record?: { canonicalPath?: string } }
    return payload.record?.canonicalPath === args.canonicalPath
  })) {
    throw new Error('The selected document is still queued for cloud sync. Retry sharing after it syncs.')
  }
  const rows = await db.collections.documents.find({ selector: {
    workspaceId: args.workspaceId, canonicalPath: args.canonicalPath,
  } }).exec()
  const live = rows.map(row => row.toJSON()).filter(row => !row.isDeleted)
  if (live.length === 1) {
    const row = live[0]!
    if (row.contentMd !== args.text || row.contentHash !== args.contentHash || !Number.isSafeInteger(row.documentRevision) || row.documentRevision < 1) {
      throw new Error('The synced document no longer matches the selected content')
    }
    return { id: row.id, revision: row.documentRevision, contentHash: row.contentHash }
  }
  // A canonical-path upsert may retain a local alias; use the existing bounded
  // snapshot protocol to obtain the server-owned identity, stopping at its page.
  return withShareDeadline(async signal => {
    const fetchImpl: ReturnType<typeof getClientFetch> = (input, init) => args.fetchImpl(input, { ...init, signal })
    for await (const page of exportAgenticGraphStorageWorkspacePages({ ...args, fetchImpl })) {
      const document = page.documents.find(row => !row.deleted && row.workspaceId === args.workspaceId && row.canonicalPath === args.canonicalPath)
      if (!document) continue
      if (document.contentMd !== args.text || document.contentHash !== args.contentHash || !Number.isSafeInteger(document.revision) || document.revision < 1) {
        throw new Error('The remote document no longer matches the selected content')
      }
      return { id: document.id, revision: document.revision, contentHash: document.contentHash }
    }
    throw new Error('The selected document has no verified synced identity')
  })
}

export const publishWorkspaceEntryShareUrl = async (args: {
  entry: WorkspaceEntry
  sourcesByPath?: WorkspaceSourceIndex | null
  workspaceId?: string | null
  baseUrl?: string | null
  deviceId?: string | null
  fetchImpl?: AgenticGraphStorageSyncNowArgs['fetchImpl']
  readEntryText?: ReadWorkspaceEntryTextForStoragePublish
}): Promise<string | null> => {
  if (args.entry.kind !== 'file') return null
  const workspaceId = normalizeString(args.workspaceId) || readActiveAgenticGraphStorageWorkspaceId()
  const canonicalPath = readPrimaryStorageCanonicalPathForWorkspacePath(args.entry.path, { markdownOnly: false })
  if (!workspaceId || !canonicalPath) return null
  const text = await readWorkspaceEntryResolvedTextForStoragePublish({
    entry: args.entry, readEntryText: args.readEntryText, storageFallbackByPath: new Map(),
    getWorkspaceFs: () => import('@/features/workspace-fs/workspaceFs').then(mod => mod.getWorkspaceFs()),
  })
  if (!text.trim()) return null
  const baseUrl = normalizeString(args.baseUrl) || normalizeString(readEnvString('VITE_AGENTIC_OS_STORAGE_BASE_URL', ''))
  const publicationUrl = resolveAgenticGraphStorageApiUrl(AGENTIC_OS_STORAGE_ROUTE_PATHS.publications, baseUrl)
  const origin = new URL(publicationUrl, typeof window !== 'undefined' ? window.location.href : undefined).origin
  const fetchImpl = getClientFetch(args.fetchImpl)
  const source = args.sourcesByPath?.[args.entry.path]
  if (source?.kind === 'url') {
    let sourceUrl: URL | null = null
    try { sourceUrl = new URL(source.url, origin) } catch { /* Not a native document locator. */ }
    if (sourceUrl?.origin === origin) {
      const shareUrl = buildPublishedDocShareUrlFromSource({ sourceUrl: sourceUrl.href, origin })
      if (shareUrl && await readStorageDocumentTextMatches({ fetchImpl, url: sourceUrl.href, text, credentials: 'omit' })) return shareUrl
    }
  }
  const result = await publishWorkspaceEntriesToAgenticGraphStorage({
    entries: [{ ...args.entry, text }], workspaceId, syncNow: false,
    baseUrl, deviceId: args.deviceId, fetchImpl,
  })
  if (result.storedCount !== 1) throw new Error('The selected document could not be queued for sharing')
  const { syncAgenticGraphStorageNow } = await import('@/lib/storage/agentic-graph-storage-client-sync')
  const sync = await syncAgenticGraphStorageNow({ workspaceId, baseUrl, deviceId: args.deviceId, fetchImpl, runAfterInFlight: true })
  if (sync.transportStatus !== 'synced' || sync.workspaceId !== workspaceId
    || (typeof window !== 'undefined' && sync.durableLocalQueue !== true)
    || sync.conflictCount || sync.rejectedCount || sync.deferredCount || sync.unresolvedConflictCount) {
    throw new Error(sync.transportError || 'Document sharing requires successful sync without pending conflicts or rejected writes')
  }
  const identity = await readSyncedShareDocumentIdentity({
    workspaceId, canonicalPath, text, contentHash: hashAgenticGraphStorageContent(text), baseUrl, fetchImpl,
  })
  await withShareResponse({
    fetchImpl, input: publicationUrl,
    init: { method: 'POST', headers: { 'content-type': 'application/json' }, redirect: 'error', body: JSON.stringify({
      workspaceId, documentId: identity.id, canonicalPath, action: 'publish',
      expectedRevision: identity.revision, expectedContentHash: identity.contentHash,
    }) },
    consume: async response => {
      const publication = await parseStorageResponseJson<Record<string, unknown>>(response, { requestLabel: 'Document publication', apiOrigin: origin })
      if (!response.ok || publication.ok !== true || publication.apiVersion !== AGENTIC_OS_STORAGE_API_VERSION
        || publication.workspaceId !== workspaceId || publication.documentId !== identity.id || publication.canonicalPath !== canonicalPath
        || publication.status !== 'published' || publication.revision !== identity.revision || publication.contentHash !== identity.contentHash) {
        throw new Error('Document publication did not confirm the selected revision and content')
      }
    },
  })
  const docUrl = resolveAgenticGraphStorageApiUrl(buildAgenticGraphStorageDocPath(workspaceId, canonicalPath), baseUrl)
  if (!await readStorageDocumentTextMatches({ fetchImpl, url: docUrl, text, credentials: 'omit' })) {
    throw new Error('The published document is not anonymously readable with the selected content')
  }
  return buildPublishedDocShareUrl({ workspaceId, canonicalPath, origin })
}
