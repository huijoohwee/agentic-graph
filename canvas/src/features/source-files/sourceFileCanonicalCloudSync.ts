import type { WorkspaceEntry, WorkspacePath } from '@/features/workspace-fs/types'
import type { SourceFile } from '@/hooks/store/types'
import { normalizeWorkspacePath, workspaceExtLower } from '@/features/workspace-fs/path'
import { getWorkspaceFs } from '@/features/workspace-fs/workspaceFs'
import { hashStringToHex } from '@/lib/hash/stringHash'
import {
  KNOWGRPH_STORAGE_API_VERSION,
  buildKnowgrphCollaborationSavePath,
  type KnowgrphCollaborationSaveRequest,
  type KnowgrphCollaborationSaveResponse,
} from '@/lib/storage/knowgrphStorageSyncContract'
import {
  exportKnowgrphStorageWorkspace,
  resolveKnowgrphStorageApiUrl,
  syncKnowgrphStorageNow,
  type KnowgrphStorageSyncNowArgs,
} from '@/lib/storage/knowgrphStorageClientSync'
import {
  publishWorkspaceEntriesToKnowgrphStorage,
  readActiveKnowgrphStorageWorkspaceId,
} from '@/features/source-files/sourceFileShareUrl'
import { readKnowgrphStorageBaseUrl } from '@/features/source-files/sourceFilesKnowgrphStorageSettings'
import { syncSourceFilesToKnowgrphStorage } from '@/features/source-files/sourceFilesStorageSync'
import {
  resolveDocumentRepositoryAuthority,
  type DocumentRepositoryTarget,
} from 'grph-shared/collaboration/documentRepositoryAuthority'
import { KNOWGRPH_STORAGE_SYNC_BOUNDS } from '@/lib/storage/knowgrphStorageBounds'
import {
  requireKnowgrphCollaborationSaveSessionToken,
} from '@/lib/storage/knowgrphStorageChatClient'
import { resolveKnowgrphStorageBrowserSessionUrl } from '@/lib/storage/knowgrphStorageBrowserSession'
import { buildKnowgrphStorageBrowserSessionPath } from '@/lib/storage/knowgrphStorageRoutePaths'

type FetchLike = NonNullable<KnowgrphStorageSyncNowArgs['fetchImpl']>

const SUPPORTED_MARKDOWN_EXTENSIONS = new Set(['md', 'markdown', 'mdx'])

const normalizeString = (value: unknown): string => String(value || '').trim()

export type SourceFileCanonicalCloudTarget = {
  workspacePath: WorkspacePath
  repositoryTarget: DocumentRepositoryTarget
  githubPath: string
  canonicalPath: string
  documentKind: 'markdown'
}

export type SourceFileCanonicalCloudSyncResult = SourceFileCanonicalCloudTarget & {
  workspaceId: string
  syncedText: string
  commitSha: string | null
  contentSha: string | null
  committedAtMs: number
  readBackAttempts: number
  readBackVerified: true
}

/**
 * A shared workspace snapshot is deliberately distinct from a canonical
 * repository save. It is stored in the authenticated storage service only;
 * it neither calls the collaboration save bridge nor publishes to GitHub.
 */
export type SourceFileCloudWorkspaceSnapshotResult = {
  workspaceId: string
  workspacePath: WorkspacePath
  canonicalPath: string
  documentKind: 'markdown'
  syncedText: string
  readBackAttempts: number
  readBackVerified: true
}

export const resolveSourceFileCanonicalCloudTarget = (
  workspacePathRaw: WorkspacePath | string,
): SourceFileCanonicalCloudTarget | null => {
  const sourcePath = String(workspacePathRaw || '').trim().replace(/\\/g, '/').replace(/^\/+/, '')
  if (sourcePath.startsWith('huijoohwee/docs/workspace-seeds/')) return null
  const workspacePath = normalizeWorkspacePath(workspacePathRaw)
  if (workspacePath.split('/').filter(Boolean)[0] === 'chat-log') return null
  const extension = workspaceExtLower(workspacePath)
  if (!SUPPORTED_MARKDOWN_EXTENSIONS.has(extension)) return null
  const authority = resolveDocumentRepositoryAuthority({
    documentKey: workspacePath,
    documentKind: 'markdown',
  })
  if (!authority) return null
  return {
    workspacePath,
    repositoryTarget: authority.repositoryTarget,
    githubPath: authority.githubPath,
    canonicalPath: authority.canonicalPath,
    documentKind: 'markdown',
  }
}

const getFetch = (fetchImpl?: FetchLike): FetchLike => {
  if (fetchImpl) return fetchImpl
  if (typeof fetch !== 'function') throw new Error('Cloud sync is unavailable because fetch is not supported.')
  return fetch.bind(globalThis)
}

export const isLocalKnowgrphStorageWorkerOrigin = (value: unknown): boolean => {
  try {
    const url = new URL(normalizeString(value))
    const hostname = url.hostname.toLowerCase()
    return (url.protocol === 'http:' || url.protocol === 'https:')
      && (hostname === '127.0.0.1' || hostname === 'localhost' || hostname === '0.0.0.0')
  } catch {
    return false
  }
}

export const resolveMutatingKnowgrphStorageBaseUrl = (baseUrl?: string | null): string => {
  const explicitBaseUrl = normalizeString(baseUrl)
  if (explicitBaseUrl) {
    if (isLocalKnowgrphStorageWorkerOrigin(explicitBaseUrl)) return explicitBaseUrl
    throw new Error('A configured local Worker origin is required for mutating Source Files actions.')
  }
  if (typeof window !== 'undefined' && isLocalKnowgrphStorageWorkerOrigin(window.location?.origin)) {
    return ''
  }
  throw new Error('A configured local Worker origin is required for mutating Source Files actions.')
}

const retryCloudUploadStage = async <T>(operation: () => Promise<T>): Promise<T> => {
  let lastError: unknown = null
  for (
    let attempt = 0;
    attempt < KNOWGRPH_STORAGE_SYNC_BOUNDS.maxRetryAttempts;
    attempt += 1
  ) {
    try {
      return await operation()
    } catch (error) {
      lastError = error
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Cloud upload failed after bounded retries.')
}

const readJsonResponse = async <T>(response: Response): Promise<T | null> => {
  const text = await response.text()
  if (!text.trim()) return null
  try {
    return JSON.parse(text) as T
  } catch {
    return null
  }
}

const saveCanonicalSnapshotToGitHub = async (args: {
  target: SourceFileCanonicalCloudTarget
  workspaceId: string
  text: string
  baseUrl: string
  sessionToken: string
  fetchImpl: FetchLike
}): Promise<KnowgrphCollaborationSaveResponse> => {
  const request: KnowgrphCollaborationSaveRequest = {
    apiVersion: KNOWGRPH_STORAGE_API_VERSION,
    operation: 'upsert',
    workspaceId: args.workspaceId,
    documentKey: args.target.workspacePath,
    documentKind: args.target.documentKind,
    repositoryTarget: args.target.repositoryTarget,
    serializedText: args.text,
    yjsStateBase64: '',
    activePeerCount: 1,
    pocketBaseRoomId: null,
    savedByPeerId: null,
    saveBoundary: 'explicit',
  }
  const response = await args.fetchImpl(
    resolveKnowgrphStorageApiUrl(buildKnowgrphCollaborationSavePath(), args.baseUrl),
    {
      method: 'POST',
      headers: {
        accept: 'application/json',
        authorization: `Bearer ${args.sessionToken}`,
        'content-type': 'application/json; charset=utf-8',
      },
      // The explicit local-development publishing bridge uses its supplied
      // bearer credential only; it must not inherit a browser storage cookie.
      credentials: 'omit',
      body: JSON.stringify(request),
    },
  )
  const payload = await readJsonResponse<KnowgrphCollaborationSaveResponse & { error?: string }>(response)
  if (!response.ok || payload?.ok !== true) {
    throw new Error(normalizeString(payload?.error) || `GitHub save bridge failed (${response.status}).`)
  }
  if (normalizeString(payload.githubPath) !== args.target.githubPath) {
    throw new Error('GitHub save bridge returned a different canonical path.')
  }
  if (payload.repositoryTarget !== args.target.repositoryTarget) {
    throw new Error('GitHub save bridge returned a different repository target.')
  }
  return payload
}

const resolveCloudWorkspaceSnapshotBaseUrl = (baseUrl?: string | null): string => {
  const configured = normalizeString(baseUrl) || readKnowgrphStorageBaseUrl()
  // Check the configured origin using the shared browser-session boundary
  // before any D1 push, pull, or export. `same-origin` credentials alone
  // prevent cookie delivery cross-origin, but rejecting the URL prevents
  // unauthenticated data from being sent to an accidental third-party URL.
  resolveKnowgrphStorageBrowserSessionUrl({
    path: buildKnowgrphStorageBrowserSessionPath(),
    baseUrl: configured,
  })
  return configured
}

const buildCloudWorkspaceSnapshotSourceFile = (args: {
  entry: WorkspaceEntry
  workspaceId: string
  canonicalPath: string
  text: string
}): SourceFile => ({
  // Match the shared-publish record identity so a selected-file snapshot
  // continues the same local revision lineage without claiming siblings.
  id: `share:${hashStringToHex(`${args.workspaceId}:${args.canonicalPath}`)}`,
  name: normalizeString(args.entry.name)
    || args.canonicalPath.split('/').filter(Boolean).slice(-1)[0]
    || 'shared.md',
  text: args.text,
  enabled: true,
  status: 'idle',
  source: { kind: 'local', path: args.canonicalPath },
})

export const syncWorkspaceEntryToCanonicalCloud = async (args: {
  entry: WorkspaceEntry
  workspaceId?: string | null
  baseUrl?: string | null
  deviceId?: string | null
  sessionToken?: string | null
  fetchImpl?: FetchLike
}): Promise<SourceFileCanonicalCloudSyncResult> => {
  if (args.entry.kind !== 'file') throw new Error('Only files can be uploaded to cloud storage.')
  const target = resolveSourceFileCanonicalCloudTarget(args.entry.path)
  if (!target) throw new Error('Cloud upload supports Markdown files outside chat-log.')
  const workspaceId = normalizeString(args.workspaceId) || readActiveKnowgrphStorageWorkspaceId()
  if (!workspaceId) throw new Error('Cloud workspace is unavailable.')
  const baseUrl = resolveMutatingKnowgrphStorageBaseUrl(
    normalizeString(args.baseUrl) || readKnowgrphStorageBaseUrl(),
  )
  const sessionToken = requireKnowgrphCollaborationSaveSessionToken(args.sessionToken)
  const fetchImpl = getFetch(args.fetchImpl)
  const fs = await getWorkspaceFs()
  const text = String((await fs.readFileText(target.workspacePath)) ?? args.entry.text ?? '')

  const github = await retryCloudUploadStage(
    () => saveCanonicalSnapshotToGitHub({
      target,
      workspaceId,
      text,
      baseUrl,
      sessionToken,
      fetchImpl,
    }),
  )
  const entry = { ...args.entry, path: target.workspacePath, text }
  const storageResult = await publishWorkspaceEntriesToKnowgrphStorage({
    entries: [entry],
    workspaceId,
    baseUrl,
    deviceId: args.deviceId,
    fetchImpl,
    syncNow: true,
    forceStorageWrite: true,
    allowEmptyText: true,
    resolveCanonicalPath: () => target.canonicalPath,
  })
  if (storageResult.storedCount !== 1) {
    throw new Error('GitHub save succeeded, but Cloudflare could not queue the document.')
  }

  let readBackText: string | null = null
  let readBackAttempts = 0
  for (
    let attempt = 0;
    attempt < KNOWGRPH_STORAGE_SYNC_BOUNDS.cloudReadBackMaxAttempts;
    attempt += 1
  ) {
    readBackAttempts = attempt + 1
    const snapshot = await readCanonicalCloudDocumentSnapshot({
      workspaceId,
      baseUrl,
      fetchImpl,
      sessionToken,
    })
    readBackText = snapshot.get(target.canonicalPath) ?? null
    if (readBackText === text) break
    if (attempt + 1 < KNOWGRPH_STORAGE_SYNC_BOUNDS.cloudReadBackMaxAttempts) {
      await syncKnowgrphStorageNow({ workspaceId, baseUrl, deviceId: args.deviceId, fetchImpl })
    }
  }
  if (readBackText !== text) {
    throw new Error('GitHub save succeeded, but Cloudflare read-back did not match. Retry cloud upload.')
  }

  return {
    ...target,
    workspaceId,
    syncedText: text,
    commitSha: github.commitSha,
    contentSha: github.contentSha,
    committedAtMs: github.committedAtMs,
    readBackAttempts,
    readBackVerified: true,
  }
}

/**
 * Persist one Source File as an authenticated shared-workspace snapshot.
 *
 * This production browser path intentionally bypasses `collab/save`: that
 * endpoint is a local, explicit GitHub publishing bridge and must not turn a
 * routine cross-device sync into a write to a canonical repository branch.
 */
export const syncWorkspaceEntryToCloudWorkspaceSnapshot = async (args: {
  entry: WorkspaceEntry
  workspaceId?: string | null
  baseUrl?: string | null
  deviceId?: string | null
  fetchImpl?: FetchLike
}): Promise<SourceFileCloudWorkspaceSnapshotResult> => {
  if (args.entry.kind !== 'file') throw new Error('Only files can be uploaded to cloud storage.')
  const target = resolveSourceFileCanonicalCloudTarget(args.entry.path)
  if (!target) throw new Error('Cloud upload supports Markdown files outside chat-log.')
  const workspaceId = normalizeString(args.workspaceId) || readActiveKnowgrphStorageWorkspaceId()
  if (!workspaceId) throw new Error('Cloud workspace is unavailable.')
  const baseUrl = resolveCloudWorkspaceSnapshotBaseUrl(args.baseUrl)
  const fetchImpl = getFetch(args.fetchImpl)
  const fs = await getWorkspaceFs()
  const text = String((await fs.readFileText(target.workspacePath)) ?? args.entry.text ?? '')
  const sourceFile = buildCloudWorkspaceSnapshotSourceFile({
    entry: args.entry,
    workspaceId,
    canonicalPath: target.canonicalPath,
    text,
  })
  await syncSourceFilesToKnowgrphStorage({
    workspaceId,
    sourceFiles: [sourceFile],
    // The selection is an upsert-only action, not an authoritative workspace
    // inventory reconciliation. This protects every other Source File.
    reconcileMissingDocuments: false,
    // An explicit click is also a recovery intent: requeue the selected
    // snapshot even when its local text is unchanged, without touching peers.
    forceDocumentUpsert: true,
  })
  const syncResult = await syncKnowgrphStorageNow({
    workspaceId,
    baseUrl,
    deviceId: args.deviceId,
    fetchImpl,
  })
  if (syncResult.transportStatus !== 'synced') {
    const detail = normalizeString(syncResult.transportError)
    throw new Error(
      `Cloud workspace snapshot was not confirmed. Your local copy remains saved.${detail ? ` ${detail}` : ''}`,
    )
  }

  let readBackText: string | null = null
  let readBackAttempts = 0
  for (
    let attempt = 0;
    attempt < KNOWGRPH_STORAGE_SYNC_BOUNDS.cloudReadBackMaxAttempts;
    attempt += 1
  ) {
    readBackAttempts = attempt + 1
    const snapshot = await readCanonicalCloudDocumentSnapshot({
      workspaceId,
      baseUrl,
      fetchImpl,
    })
    readBackText = snapshot.get(target.canonicalPath) ?? null
    if (readBackText === text) break
    if (attempt + 1 < KNOWGRPH_STORAGE_SYNC_BOUNDS.cloudReadBackMaxAttempts) {
      await syncKnowgrphStorageNow({ workspaceId, baseUrl, deviceId: args.deviceId, fetchImpl })
    }
  }
  if (readBackText !== text) {
    throw new Error('Cloud workspace snapshot read-back did not match. Your local copy remains saved.')
  }

  return {
    workspaceId,
    workspacePath: target.workspacePath,
    canonicalPath: target.canonicalPath,
    documentKind: target.documentKind,
    syncedText: text,
    readBackAttempts,
    readBackVerified: true,
  }
}

export const readCanonicalCloudDocumentSnapshot = async (args: {
  workspaceId?: string | null
  baseUrl?: string | null
  sessionToken?: string | null
  fetchImpl?: FetchLike
} = {}): Promise<Map<string, string>> => {
  const workspaceId = normalizeString(args.workspaceId) || readActiveKnowgrphStorageWorkspaceId()
  const baseUrl = resolveCloudWorkspaceSnapshotBaseUrl(args.baseUrl)
  const exported = await exportKnowgrphStorageWorkspace({
    workspaceId,
    baseUrl,
    sessionToken: args.sessionToken,
    fetchImpl: args.fetchImpl,
  })
  const snapshot = new Map<string, string>()
  for (const document of exported.documents) {
    if (document.deleted) continue
    const canonicalPath = normalizeString(document.canonicalPath)
    if (canonicalPath) snapshot.set(canonicalPath, String(document.contentMd || ''))
  }
  return snapshot
}
