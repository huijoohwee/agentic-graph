import type { WorkspaceEntry, WorkspaceFs, WorkspacePath } from '@/features/workspace-fs/types'
import type { WorkspaceSourceIndex } from '@/features/workspace-fs/sourceIndex'
import type { SourceFile } from '@/hooks/store/types'
import type {
  KnowgrphStorageSyncNowArgs,
  KnowgrphStorageSyncRunResult,
} from '@/lib/storage/knowgrphStorageClientSync'
import type { KnowgrphStorageDb } from '@/lib/storage/knowgrphStorageDb'
import { buildPublishedDocShareUrl, buildPublishedDocShareUrlFromSource } from '@/features/canvas/canvasDocDeepLink'
import { readEnvString } from '@/lib/config.env'
import { hashStringToHex } from '@/lib/hash/stringHash'
import { useGraphStore } from '@/hooks/useGraphStore'
import { buildKnowgrphWorkspaceIdFromSourceFilesWorkspaceState } from '@/features/source-files/sourceFilesStorageSync'
import {
  readPrimaryStorageCanonicalPathForWorkspacePath,
} from '@/features/source-files/sourceFilesStoragePaths'
import {
  readKnowgrphStorageBaseUrl,
  readKnowgrphStorageRuntimeSyncEnabled,
} from '@/features/source-files/sourceFilesKnowgrphStorageSettings'

const normalizeString = (value: unknown): string => String(value || '').trim()

export type ReadWorkspaceEntryTextForStoragePublish = (
  entry: WorkspaceEntry,
) => string | null | undefined | Promise<string | null | undefined>

export type ResolveWorkspaceEntryCanonicalPathForStoragePublish = (
  entry: WorkspaceEntry,
) => string | null | undefined

export const readActiveKnowgrphStorageWorkspaceId = (): string => {
  const override = normalizeString(readEnvString('VITE_KNOWGRPH_STORAGE_WORKSPACE_ID', ''))
  if (override) return override
  const state = useGraphStore.getState()
  return buildKnowgrphWorkspaceIdFromSourceFilesWorkspaceState({
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

export type PublishWorkspaceEntriesToKnowgrphStorageResult = {
  workspaceId: string
  canonicalPaths: string[]
  queuedMutationCount: number
  storedCount: number
  syncResult: KnowgrphStorageSyncRunResult | null
}

export const publishWorkspaceEntriesToKnowgrphStorage = async (args: {
  entries: WorkspaceEntry[]
  workspaceId?: string | null
  syncNow?: boolean
  baseUrl?: string | null
  deviceId?: string | null
  fetchImpl?: KnowgrphStorageSyncNowArgs['fetchImpl']
  dbState?: KnowgrphStorageDb | null
  readEntryText?: ReadWorkspaceEntryTextForStoragePublish
  resolveCanonicalPath?: ResolveWorkspaceEntryCanonicalPathForStoragePublish
  forceStorageWrite?: boolean
  allowEmptyText?: boolean
}): Promise<PublishWorkspaceEntriesToKnowgrphStorageResult> => {
  const workspaceId = normalizeString(args.workspaceId) || readActiveKnowgrphStorageWorkspaceId()
  const entries = Array.isArray(args.entries) ? args.entries : []
  const records: SourceFile[] = []
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
    canonicalPaths.push(canonicalPath)
  }
  if (!workspaceId || records.length === 0) {
    return { workspaceId, canonicalPaths: [], queuedMutationCount: 0, storedCount: 0, syncResult: null }
  }

  const { syncSourceFilesToKnowgrphStorage } = await import('@/features/source-files/sourceFilesStorageSync')
  const result = await syncSourceFilesToKnowgrphStorage({
    workspaceId,
    sourceFiles: records,
    previousSourceFiles: [],
    dbState: args.dbState,
    forceDocumentUpsert: args.forceStorageWrite,
  })
  let syncResult: KnowgrphStorageSyncRunResult | null = null
  if (args.syncNow !== false) {
    const { syncKnowgrphStorageNow } = await import('@/lib/storage/knowgrphStorageClientSync')
    syncResult = await syncKnowgrphStorageNow({
      workspaceId,
      baseUrl: normalizeString(args.baseUrl) || normalizeString(readEnvString('VITE_KNOWGRPH_STORAGE_BASE_URL', '')),
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
    syncResult,
  }
}

export const publishWorkspacePathsToKnowgrphStorage = async (args: {
  paths: ReadonlyArray<string>
  workspaceId?: string | null
  syncNow?: boolean
  baseUrl?: string | null
  deviceId?: string | null
  fetchImpl?: KnowgrphStorageSyncNowArgs['fetchImpl']
  readEntryText?: ReadWorkspaceEntryTextForStoragePublish
}): Promise<PublishWorkspaceEntriesToKnowgrphStorageResult> => {
  const normalizedPaths = new Set(
    (Array.isArray(args.paths) ? args.paths : [])
      .map(path => normalizeString(path))
      .filter(Boolean),
  )
  if (normalizedPaths.size === 0) {
    const workspaceId = normalizeString(args.workspaceId) || readActiveKnowgrphStorageWorkspaceId()
    return { workspaceId, canonicalPaths: [], queuedMutationCount: 0, storedCount: 0, syncResult: null }
  }
  const { getWorkspaceFs } = await import('@/features/workspace-fs/workspaceFs')
  const fs = await getWorkspaceFs()
  const entries = await fs.listEntries()
  return publishWorkspaceEntriesToKnowgrphStorage({
    entries: entries.filter(entry => entry?.kind === 'file' && normalizedPaths.has(normalizeString(entry.path))),
    workspaceId: args.workspaceId,
    syncNow: args.syncNow,
    baseUrl: args.baseUrl,
    deviceId: args.deviceId,
    fetchImpl: args.fetchImpl,
    readEntryText: args.readEntryText || (entry => fs.readFileText(entry.path)),
  })
}

export const publishGeneratedWorkspaceEntriesToKnowgrphStorage = async (args: {
  entries: WorkspaceEntry[]
  workspaceId?: string | null
  syncNow?: boolean
  baseUrl?: string | null
  deviceId?: string | null
  fetchImpl?: KnowgrphStorageSyncNowArgs['fetchImpl']
  dbState?: KnowgrphStorageDb | null
  readEntryText?: ReadWorkspaceEntryTextForStoragePublish
}): Promise<PublishWorkspaceEntriesToKnowgrphStorageResult> => {
  const shouldSyncNow = typeof args.syncNow === 'boolean'
    ? args.syncNow
    : readKnowgrphStorageRuntimeSyncEnabled()
  return publishWorkspaceEntriesToKnowgrphStorage({
    entries: args.entries,
    workspaceId: args.workspaceId,
    syncNow: shouldSyncNow,
    baseUrl: normalizeString(args.baseUrl) || readKnowgrphStorageBaseUrl(),
    deviceId: args.deviceId,
    fetchImpl: args.fetchImpl,
    dbState: args.dbState,
    readEntryText: args.readEntryText,
  })
}

export const publishGeneratedWorkspacePathsToKnowgrphStorage = async (args: {
  paths: ReadonlyArray<string>
  workspaceId?: string | null
  syncNow?: boolean
  baseUrl?: string | null
  deviceId?: string | null
  fetchImpl?: KnowgrphStorageSyncNowArgs['fetchImpl']
  readEntryText?: ReadWorkspaceEntryTextForStoragePublish
}): Promise<PublishWorkspaceEntriesToKnowgrphStorageResult> => {
  const shouldSyncNow = typeof args.syncNow === 'boolean'
    ? args.syncNow
    : readKnowgrphStorageRuntimeSyncEnabled()
  return publishWorkspacePathsToKnowgrphStorage({
    paths: args.paths,
    workspaceId: args.workspaceId,
    syncNow: shouldSyncNow,
    baseUrl: normalizeString(args.baseUrl) || readKnowgrphStorageBaseUrl(),
    deviceId: args.deviceId,
    fetchImpl: args.fetchImpl,
    readEntryText: args.readEntryText,
  })
}

export const publishWorkspaceEntryShareUrl = async (args: {
  entry: WorkspaceEntry
  sourcesByPath?: WorkspaceSourceIndex | null
  workspaceId?: string | null
  baseUrl?: string | null
  deviceId?: string | null
  fetchImpl?: KnowgrphStorageSyncNowArgs['fetchImpl']
  readEntryText?: ReadWorkspaceEntryTextForStoragePublish
}): Promise<string | null> => {
  const source = args.sourcesByPath?.[args.entry.path]
  if (source?.kind === 'url') {
    const sourceShareUrl = buildPublishedDocShareUrlFromSource({ sourceUrl: source.url })
    if (sourceShareUrl) return sourceShareUrl
  }
  const workspaceId = normalizeString(args.workspaceId) || readActiveKnowgrphStorageWorkspaceId()
  const canonicalPath = readPrimaryStorageCanonicalPathForWorkspacePath(args.entry.path, { markdownOnly: false })
  if (!workspaceId || !canonicalPath) return null
  const shareUrl = buildPublishedDocShareUrl({ workspaceId, canonicalPath })
  if (!shareUrl) return null
  const result = await publishWorkspaceEntriesToKnowgrphStorage({
    entries: [args.entry],
    workspaceId,
    syncNow: true,
    baseUrl: args.baseUrl,
    deviceId: args.deviceId,
    fetchImpl: args.fetchImpl,
    readEntryText: args.readEntryText,
  })
  if (result.storedCount < 1) return null
  return shareUrl
}
