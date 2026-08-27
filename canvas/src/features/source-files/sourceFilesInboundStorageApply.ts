import { scheduleApplyGraphOwnerComposedGraphFromSourceFiles } from '@/features/source-files/applyComposedGraphFromSourceFiles'
import {
  areSourceFileRecordsEqual,
  normalizeSourceFileRecord,
} from '@/features/source-files/sourceFileParsedState'
import {
  buildSourceFileGraphSnapshotId,
  readAgenticGraphSourceFileIdFromDocumentId,
} from '@/features/source-files/sourceFilesStorageSync'
import { workspaceBasename } from '@/features/workspace-fs/path'
import { resolveWorkspaceSourcePathKey } from '@/features/workspace-fs/syncToSourceFiles'
import { hashStringToHex } from '@/lib/hash/stringHash'
import { readEnvString } from '@/lib/config.env'
import { useGraphStore } from '@/hooks/useGraphStore'
import type { SourceFile } from '@/hooks/store/types'
import type { GraphData } from '@/lib/graph/types'
import { resolveDocumentRepositoryAuthority } from 'grph-shared/collaboration/documentRepositoryAuthority'
import type {
  KgDocumentRecord,
  KgDocumentChunkRecord,
  KgGraphSnapshotRecord,
  AgenticGraphStoragePullResponse,
} from '@/lib/storage/agenticgraphStorageSyncContract'
import { AGENTICGRAPH_STORAGE_ROUTE_PATHS } from '@/lib/storage/agenticgraphStorageSyncContract'
import {
  looksLikeHttpUrl,
  normalizeMarkdownWorkspaceDocsSourcePathFromCanonicalPath,
  normalizeStorageCanonicalPathCandidate,
  readStorageCanonicalPathCandidatesForDocument,
} from '@/features/source-files/sourceFilesStoragePaths'
import {
  runWorkspaceSeedSyncTask,
  runWorkspaceSeedSyncTaskWithContext,
  type WorkspaceSeedSyncTaskContext,
} from '@/lib/workspace/workspaceSeedSyncRuntime'

const normalizeString = (value: unknown): string => String(value || '').trim()

const canonicalizeInboundWorkspaceSourcePath = (value: string): string => {
  const raw = normalizeString(value).replace(/\\/g, '/')
  if (!raw) return ''
  const workspaceMirrorPrefix = 'huijoohwee/docs/'
  if (raw.toLowerCase().startsWith(workspaceMirrorPrefix)) {
    return `workspace:/docs/${raw.slice(workspaceMirrorPrefix.length)}`
  }
  const normalized = resolveWorkspaceSourcePathKey(raw)
  const nestedMirrorPrefix = 'workspace:/docs/huijoohwee/docs/'
  if (normalized.toLowerCase().startsWith(nestedMirrorPrefix)) {
    return `workspace:/docs/${normalized.slice(nestedMirrorPrefix.length)}`
  }
  return normalized
}

const isAuthoredRepositorySource = (
  file: SourceFile | null,
  sourcePath: string,
  canonicalPath: string,
): boolean => {
  const documentKey = normalizeString(file?.source?.path) || sourcePath || canonicalPath
  if (!documentKey || looksLikeHttpUrl(documentKey)) return false
  return resolveDocumentRepositoryAuthority({ documentKey, documentKind: 'markdown' }) !== null
}

function throwIfInboundStorageApplyAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) return
  throw signal.reason instanceof Error
    ? signal.reason
    : new Error('Inbound AgenticGraph storage apply was cancelled')
}

export async function runSourceFilesInboundStorageApplyDescendant(
  operation: () => Promise<void>,
  signal?: AbortSignal,
  taskContext?: WorkspaceSeedSyncTaskContext,
): Promise<void> {
  if (taskContext) {
    await runWorkspaceSeedSyncTaskWithContext(taskContext, operation)
    return
  }
  await runWorkspaceSeedSyncTask(signal, operation)
}

function scheduleSourceFilesInboundStorageApplyDescendant(
  operation: () => Promise<void>,
  signal?: AbortSignal,
  taskContext?: WorkspaceSeedSyncTaskContext,
): Promise<void> {
  const completion = runSourceFilesInboundStorageApplyDescendant(
    operation,
    signal,
    taskContext,
  )
  void completion.catch(() => {
    void 0
  })
  return completion
}

async function awaitInboundStorageApplyDescendants(
  completions: Promise<void>[],
): Promise<void> {
  const results = await Promise.allSettled(completions)
  const failure = results.find(result => result.status === 'rejected')
  if (failure?.status === 'rejected') throw failure.reason
}

const readSourceFileNameFromCanonicalPath = (canonicalPath: string, fallbackTitle: string | null): string => {
  const safeTitle = normalizeString(fallbackTitle)
  if (safeTitle) return safeTitle
  if (looksLikeHttpUrl(canonicalPath)) {
    try {
      const url = new URL(canonicalPath)
      const parts = url.pathname.split('/').filter(Boolean)
      return parts[parts.length - 1] || url.hostname || 'remote.md'
    } catch {
      return canonicalPath || 'remote.md'
    }
  }
  const path = canonicalPath.startsWith('/') ? canonicalPath : `/${canonicalPath}`
  return workspaceBasename(path) || canonicalPath || 'remote.md'
}


const buildAgenticGraphStorageRequestUrl = (args: { path: string; baseUrl: string }): string => {
  const safePath = normalizeString(args.path)
  if (!safePath) return ''
  if (typeof window !== 'undefined') {
    const host = normalizeString(window.location?.hostname).toLowerCase()
    const isLocalhost = host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0'
    if (isLocalhost && safePath.startsWith('/api/storage/')) return safePath
  }
  const baseUrl = normalizeString(args.baseUrl)
  if (!baseUrl) return safePath
  return new URL(safePath, baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`).toString()
}

const readStorageDocFallbackText = async (args: {
  workspaceId: string
  canonicalPathCandidates: string[]
  signal?: AbortSignal
}): Promise<string> => {
  if (typeof fetch !== 'function') return ''
  const baseUrl = normalizeString(readEnvString('VITE_AGENTICGRAPH_STORAGE_BASE_URL', ''))
  const workspaceId = normalizeString(args.workspaceId)
  if (!baseUrl || !workspaceId) return ''
  for (let i = 0; i < args.canonicalPathCandidates.length; i += 1) {
    throwIfInboundStorageApplyAborted(args.signal)
    const canonicalPath = normalizeStorageCanonicalPathCandidate(args.canonicalPathCandidates[i] || '')
    if (!canonicalPath) continue
    const docPath = `${AGENTICGRAPH_STORAGE_ROUTE_PATHS.docPrefix}${encodeURIComponent(workspaceId)}/${encodeURIComponent(canonicalPath)}`
    const requestUrl = buildAgenticGraphStorageRequestUrl({ path: docPath, baseUrl })
    if (!requestUrl) continue
    try {
      const response = await fetch(requestUrl, { signal: args.signal })
      throwIfInboundStorageApplyAborted(args.signal)
      if (!response.ok) continue
      const text = String(await response.text())
      throwIfInboundStorageApplyAborted(args.signal)
      if (text.trim()) return text
    } catch (error) {
      if (args.signal?.aborted) throwIfInboundStorageApplyAborted(args.signal)
      void 0
    }
  }
  return ''
}

const scheduleBlankPulledDocsHydration = (args: {
  workspaceId: string
  tasks: Array<{ sourceFileId: string; sourcePath: string; canonicalPathCandidates: string[] }>
  signal?: AbortSignal
  taskContext?: WorkspaceSeedSyncTaskContext
}): Promise<void> | null => {
  if (!Array.isArray(args.tasks) || args.tasks.length === 0) return null
  return scheduleSourceFilesInboundStorageApplyDescendant(async () => {
    const bySourceFileId = new Map<string, string>()
    for (let i = 0; i < args.tasks.length; i += 1) {
      throwIfInboundStorageApplyAborted(args.signal)
      const task = args.tasks[i]
      if (!task) continue
      const sourceFileId = normalizeString(task.sourceFileId)
      if (!sourceFileId || bySourceFileId.has(sourceFileId)) continue
      const fallbackText = await readStorageDocFallbackText({
        workspaceId: args.workspaceId,
        canonicalPathCandidates: task.canonicalPathCandidates,
        signal: args.signal,
      })
      if (!fallbackText.trim()) continue
      bySourceFileId.set(sourceFileId, fallbackText)
    }
    if (bySourceFileId.size === 0) return
    throwIfInboundStorageApplyAborted(args.signal)
    const state = useGraphStore.getState()
    const currentSourceFiles = Array.isArray(state.sourceFiles) ? state.sourceFiles : []
    let changed = false
    const next = currentSourceFiles.map(file => {
      if (!file) return file
      const sourceFileId = normalizeString(file.id)
      const sourcePath = resolveWorkspaceSourcePathKey(normalizeString(file.source?.path))
      let replacementText = bySourceFileId.get(sourceFileId) || ''
      if (!replacementText) {
        for (let i = 0; i < args.tasks.length; i += 1) {
          const task = args.tasks[i]
          if (!task) continue
          if (resolveWorkspaceSourcePathKey(normalizeString(task.sourcePath)) !== sourcePath) continue
          replacementText = bySourceFileId.get(normalizeString(task.sourceFileId)) || ''
          if (replacementText) break
        }
      }
      if (!replacementText.trim()) return file
      if (String(file.text || '').trim()) return file
      changed = true
      return normalizeSourceFileRecord({
        ...file,
        text: replacementText,
      })
    })
    if (!changed) return
    throwIfInboundStorageApplyAborted(args.signal)
    state.setSourceFiles(next)
    scheduleApplyGraphOwnerComposedGraphFromSourceFiles()
  }, args.signal, args.taskContext)
}

const resolvePulledDocumentSourceFileIdentity = (document: KgDocumentRecord): {
  id: string
  sourcePath: string
} | null => {
  const canonicalizeWorkspaceSourcePath = (value: string): string =>
    looksLikeHttpUrl(value) ? value : canonicalizeInboundWorkspaceSourcePath(value)
  const sourceFileId = readAgenticGraphSourceFileIdFromDocumentId(document.id)
  if (sourceFileId) {
    const sourcePath = canonicalizeWorkspaceSourcePath(normalizeString(document.canonicalPath))
    if (!sourcePath) return null
    return { id: sourceFileId, sourcePath }
  }
  const docsSourcePath = normalizeMarkdownWorkspaceDocsSourcePathFromCanonicalPath(document.canonicalPath)
  const sourcePath = canonicalizeWorkspaceSourcePath(docsSourcePath || document.canonicalPath)
  if (!sourcePath) return null
  return {
    id: `ws:${hashStringToHex(sourcePath)}`,
    sourcePath,
  }
}

const readGraphSnapshotByDocumentId = (
  graphSnapshots: KgGraphSnapshotRecord[],
  documentId: string,
): KgGraphSnapshotRecord | null => {
  for (let i = 0; i < graphSnapshots.length; i += 1) {
    const snapshot = graphSnapshots[i]
    if (!snapshot) continue
    if (normalizeString(snapshot.documentId) === documentId) return snapshot
  }
  return null
}

const readGraphSnapshotById = (
  graphSnapshots: KgGraphSnapshotRecord[],
  id: string,
): KgGraphSnapshotRecord | null => {
  for (let i = 0; i < graphSnapshots.length; i += 1) {
    const snapshot = graphSnapshots[i]
    if (!snapshot) continue
    if (normalizeString(snapshot.id) === id) return snapshot
  }
  return null
}

const readPulledDocumentMarkdownByDocumentId = (
  documentChunks: KgDocumentChunkRecord[],
  workspaceId: string,
): Map<string, string> => {
  const safeWorkspaceId = normalizeString(workspaceId)
  const chunksByDocumentId = new Map<string, Array<{ order: number; markdown: string; id: string }>>()
  for (let i = 0; i < documentChunks.length; i += 1) {
    const chunk = documentChunks[i]
    if (!chunk) continue
    if (normalizeString(chunk.workspaceId) !== safeWorkspaceId) continue
    const documentId = normalizeString(chunk.documentId)
    if (!documentId) continue
    const markdown = String(chunk.markdown || '')
    if (!markdown.trim()) continue
    const chunkOrderRaw = Number(chunk.chunkOrder)
    const chunkOrder = Number.isFinite(chunkOrderRaw) ? Math.floor(chunkOrderRaw) : i
    const list = chunksByDocumentId.get(documentId) || []
    list.push({ order: chunkOrder, markdown, id: normalizeString(chunk.id) })
    chunksByDocumentId.set(documentId, list)
  }
  const markdownByDocumentId = new Map<string, string>()
  chunksByDocumentId.forEach((chunks, documentId) => {
    const text = chunks
      .slice()
      .sort((a, b) => (a.order - b.order) || a.id.localeCompare(b.id))
      .map(chunk => chunk.markdown)
      .join('\n\n')
    if (text.trim()) markdownByDocumentId.set(documentId, text)
  })
  return markdownByDocumentId
}

const buildSourceFileFromStorageDocument = (
  sourceFileId: string,
  sourcePath: string,
  document: KgDocumentRecord,
  markdownText: string,
  graphSnapshot: KgGraphSnapshotRecord | null,
  existing: SourceFile | null,
): SourceFile => {
  const nextText = String(markdownText || '').trim()
    ? String(markdownText || '')
    : String(existing?.text || '')
  const graphData = graphSnapshot?.graphJson as unknown as GraphData | undefined
  const isHttpSource = looksLikeHttpUrl(sourcePath)
  const source = isHttpSource
    ? { kind: 'url' as const, url: sourcePath }
    : { kind: 'local' as const, path: sourcePath }
  const fallbackTitle = isHttpSource ? document.title : null
  const name = isHttpSource
    ? readSourceFileNameFromCanonicalPath(sourcePath, fallbackTitle)
    : workspaceBasename(sourcePath.startsWith('/') ? sourcePath : `/${sourcePath}`) || readSourceFileNameFromCanonicalPath(sourcePath, document.title)
  return normalizeSourceFileRecord({
    id: sourceFileId,
    name,
    text: nextText,
    enabled: existing ? !!existing.enabled : true,
    ...(typeof existing?.geoLayerEnabled === 'boolean' ? { geoLayerEnabled: existing.geoLayerEnabled } : {}),
    status: graphData ? 'parsed' : existing?.status || 'idle',
    error: undefined,
    parsedParserId: graphSnapshot ? normalizeString(document.parserVersion) || 'remote-sync' : existing?.parsedParserId,
    parsedTextHash: existing?.parsedTextHash,
    parsedGraphRevision: graphSnapshot?.graphRevision ?? existing?.parsedGraphRevision,
    parsedGraphData: graphData ?? existing?.parsedGraphData,
    source,
  })
}

type InboundStorageApplyArgs = {
  workspaceId: string
  changes: AgenticGraphStoragePullResponse['changes']
  signal?: AbortSignal
  taskContext?: WorkspaceSeedSyncTaskContext
}

type InboundStorageApplyResult = {
  applied: boolean
  completion: Promise<void>
  nextCount: number
  sourceFilesSnapshot: SourceFile[]
}

const applyInboundStorageChanges = (
  args: InboundStorageApplyArgs,
  allowRepositoryOverwrite: boolean,
): InboundStorageApplyResult => {
  throwIfInboundStorageApplyAborted(args.signal)
  const current = useGraphStore.getState()
  const currentSourceFiles = Array.isArray(current.sourceFiles) ? current.sourceFiles : []
  const next = currentSourceFiles.slice()
  let changed = false
  const graphSnapshots = Array.isArray(args.changes.graphSnapshots) ? args.changes.graphSnapshots : []
  const documents = Array.isArray(args.changes.documents) ? args.changes.documents : []
  const documentChunks = Array.isArray(args.changes.documentChunks) ? args.changes.documentChunks : []
  const pulledMarkdownByDocumentId = readPulledDocumentMarkdownByDocumentId(documentChunks, args.workspaceId)
  const pulledDocumentIds = new Set<string>()
  const blankPulledDocHydrationTasks: Array<{ sourceFileId: string; sourcePath: string; canonicalPathCandidates: string[] }> = []
  const descendantCompletions: Promise<void>[] = []

  for (let i = 0; i < documents.length; i += 1) {
    const document = documents[i]
    if (!document) continue
    if (normalizeString(document.workspaceId) !== normalizeString(args.workspaceId)) continue
    pulledDocumentIds.add(normalizeString(document.id))
    const identity = resolvePulledDocumentSourceFileIdentity(document)
    if (!identity) continue
    const sourceFileId = identity.id
    const currentIndex = next.findIndex(file =>
      normalizeString(file?.id) === sourceFileId
      || (
        normalizeString(file?.source?.path) === identity.sourcePath
        || canonicalizeInboundWorkspaceSourcePath(normalizeString(file?.source?.path)) === identity.sourcePath
      ),
    )
    const existing = currentIndex >= 0 ? next[currentIndex] || null : null
    if (
      !allowRepositoryOverwrite
      && isAuthoredRepositorySource(existing, identity.sourcePath, document.canonicalPath)
    ) continue
    if (document.deleted) {
      if (currentIndex >= 0) {
        next.splice(currentIndex, 1)
        changed = true
      }
      continue
    }
    const graphSnapshot =
      readGraphSnapshotByDocumentId(graphSnapshots, document.id)
      || readGraphSnapshotById(graphSnapshots, buildSourceFileGraphSnapshotId(sourceFileId))
    const markdownText = (() => {
      const inline = String(document.contentMd || '')
      if (inline.trim()) return inline
      return String(pulledMarkdownByDocumentId.get(normalizeString(document.id)) || '')
    })()
    if (!markdownText.trim()) {
      blankPulledDocHydrationTasks.push({
        sourceFileId,
        sourcePath: identity.sourcePath,
        canonicalPathCandidates: readStorageCanonicalPathCandidatesForDocument({
          documentCanonicalPath: String(document.canonicalPath || ''),
          sourcePath: identity.sourcePath,
        }),
      })
    }
    const materialized = buildSourceFileFromStorageDocument(
      sourceFileId,
      identity.sourcePath,
      document,
      markdownText,
      graphSnapshot,
      existing,
    )
    if (existing) {
      if (areSourceFileRecordsEqual(existing, materialized, { includeGraphData: false, includeGraphRevision: true })) continue
      next[currentIndex] = materialized
      changed = true
      continue
    }
    next.push(materialized)
    changed = true
  }

  for (const graphSnapshot of graphSnapshots) {
    const documentId = normalizeString(graphSnapshot?.documentId)
    if (!documentId || pulledDocumentIds.has(documentId)
      || normalizeString(graphSnapshot?.workspaceId) !== normalizeString(args.workspaceId)) continue
    const sourceFileId = readAgenticGraphSourceFileIdFromDocumentId(documentId)
    if (!sourceFileId) continue
    const currentIndex = next.findIndex(file => normalizeString(file?.id) === sourceFileId)
    const existing = currentIndex >= 0 ? next[currentIndex] || null : null
    if (!existing || (!allowRepositoryOverwrite
      && isAuthoredRepositorySource(existing, normalizeString(existing.source?.path), ''))) continue
    const materialized = normalizeSourceFileRecord({
      ...existing,
      status: 'parsed',
      error: undefined,
      parsedGraphRevision: graphSnapshot.graphRevision,
      parsedGraphData: graphSnapshot.graphJson as unknown as GraphData,
    })
    if (areSourceFileRecordsEqual(existing, materialized, { includeGraphData: true, includeGraphRevision: true })) continue
    next[currentIndex] = materialized
    changed = true
  }

  for (const [documentId, markdownText] of pulledMarkdownByDocumentId) {
    if (pulledDocumentIds.has(documentId)) continue
    const sourceFileId = readAgenticGraphSourceFileIdFromDocumentId(documentId)
    if (!sourceFileId || !markdownText.trim()) continue
    const currentIndex = next.findIndex(file => normalizeString(file?.id) === sourceFileId)
    const existing = currentIndex >= 0 ? next[currentIndex] || null : null
    if (!existing || (!allowRepositoryOverwrite
      && isAuthoredRepositorySource(existing, normalizeString(existing.source?.path), ''))) continue
    const materialized = normalizeSourceFileRecord({ ...existing, text: markdownText })
    if (areSourceFileRecordsEqual(existing, materialized, { includeGraphData: false, includeGraphRevision: true })) continue
    next[currentIndex] = materialized
    changed = true
  }

  if (blankPulledDocHydrationTasks.length > 0) {
    const hydration = scheduleBlankPulledDocsHydration({
      workspaceId: args.workspaceId,
      tasks: blankPulledDocHydrationTasks,
      signal: args.signal,
      taskContext: args.taskContext,
    })
    if (hydration) descendantCompletions.push(hydration)
  }
  if (!changed) {
    return {
      applied: false,
      completion: awaitInboundStorageApplyDescendants(descendantCompletions),
      nextCount: currentSourceFiles.length,
      sourceFilesSnapshot: currentSourceFiles,
    }
  }
  throwIfInboundStorageApplyAborted(args.signal)
  current.setSourceFiles(next)
  scheduleApplyGraphOwnerComposedGraphFromSourceFiles()
  descendantCompletions.push(scheduleSourceFilesInboundStorageApplyDescendant(async () => {
    const mod = (await import('@/features/workspace-fs/workspaceFs')) as typeof import('@/features/workspace-fs/workspaceFs')
    throwIfInboundStorageApplyAborted(args.signal)
    const fs = await mod.getWorkspaceFs()
    throwIfInboundStorageApplyAborted(args.signal)
    await fs.ensureSeed()
    throwIfInboundStorageApplyAborted(args.signal)
  }, args.signal, args.taskContext))
  return {
    applied: true,
    completion: awaitInboundStorageApplyDescendants(descendantCompletions),
    nextCount: next.length,
    sourceFilesSnapshot: next,
  }
}

export const applyPulledAgenticGraphStorageChangesToSourceFiles = (
  args: InboundStorageApplyArgs,
): InboundStorageApplyResult => applyInboundStorageChanges(args, false)

export const applyReviewedAgenticGraphStorageChangesToSourceFiles = (
  args: InboundStorageApplyArgs,
): InboundStorageApplyResult => applyInboundStorageChanges(args, true)

export const applyReviewedAgenticGraphStorageGraphRemovalToSourceFiles = (args: {
  workspaceId: string
  documentId: string
}): InboundStorageApplyResult => {
  const current = useGraphStore.getState()
  const currentSourceFiles = Array.isArray(current.sourceFiles) ? current.sourceFiles : []
  const sourceFileId = readAgenticGraphSourceFileIdFromDocumentId(args.documentId)
  const currentIndex = currentSourceFiles.findIndex(file => normalizeString(file?.id) === sourceFileId)
  const existing = currentIndex >= 0 ? currentSourceFiles[currentIndex] || null : null
  if (!existing) {
    return { applied: false, completion: Promise.resolve(), nextCount: currentSourceFiles.length,
      sourceFilesSnapshot: currentSourceFiles }
  }
  const materialized = normalizeSourceFileRecord({
    ...existing,
    status: 'idle',
    parsedParserId: undefined,
    parsedTextHash: undefined,
    parsedGraphRevision: undefined,
    parsedGraphData: undefined,
  })
  if (areSourceFileRecordsEqual(existing, materialized, { includeGraphData: true, includeGraphRevision: true })) {
    return { applied: false, completion: Promise.resolve(), nextCount: currentSourceFiles.length,
      sourceFilesSnapshot: currentSourceFiles }
  }
  const next = currentSourceFiles.slice()
  next[currentIndex] = materialized
  current.setSourceFiles(next)
  scheduleApplyGraphOwnerComposedGraphFromSourceFiles()
  return { applied: true, completion: Promise.resolve(), nextCount: next.length, sourceFilesSnapshot: next }
}
