import { buildCodebaseFilePath, buildLocalFsFetchPath } from '@/lib/url'
import { readWorkspaceImportDefaultSourceUrlSetting } from '@/lib/workspace/workspaceStoreSyncSettings'
import { buildAgenticGraphWorkspaceIdFromSourceFilesWorkspaceState } from '@/features/source-files/sourceFilesStorageSync'
import { fetchWorkspaceDocsMirrorResponse, readCachedConfiguredDocsMirrorEntries, readWorkspaceDocsMirrorTextViaFetch as readTextViaFetch } from './workspaceSeedProviderStorageCache'
import { cancelStorageStream, readResponseTextWithDeadline } from '@/lib/storage/agentic-graph-storage-client-transport'
import { importNodeFsPromises, importNodePath } from './workspaceSeedNodeModules'
import { isWorkspaceDocsMirrorGitHubSourceUrl, readCanonicalAgenticGraphWorkspaceSeedsMirrorEntries, readCanonicalPublishedNonAgenticDocsMirrorEntries } from './workspaceGithubDocsMirror'
import { readWorkspaceMirrorRootEntries } from './workspaceMirrorRootEntries'
import { resolveWorkspaceDocsMirrorLocalRootRequests } from './workspaceDocsMirrorLocalRoots'
import { isWorkspaceRepoLocalRunReadyBootstrap } from './workspaceRunReadyDemos'
import { isAgenticGraphWorkspaceSeedsPath } from 'grph-shared/collaboration/documentRepositoryAuthority'
import { readAgenticGraphWorkspaceSeedsReadAbsRoot } from './workspaceSeedLocalMirrorAuthority'
import { resolveCompleteCanonicalWorkspaceSeedInventory } from './workspaceCanonicalSeedBundle'
import { overlayCanonicalWorkspaceSeedEntries } from './workspaceSeedInventoryAuthority'
import { readWorkspaceDocsMirrorEntriesViaNodeFs, WORKSPACE_DOCS_MIRROR_MAX_FILE_BYTES, WORKSPACE_DOCS_MIRROR_MAX_FILES } from './workspaceDocsMirrorNodeReader'
import { normalizeRelPath, normalizeBasename, normalizeAbsRoot, normalizeMirrorRelPath, readWorkspaceInitializationDocsAbsRoot, readWorkspaceInitializationAgenticOsDocsAbsRoot, readWorkspaceInitializationOutputDocsAbsRoot, readWorkspaceDocsMirrorStorageFallbackEnabled, readWorkspaceInitializationAgenticGraphStorageBaseUrl, buildWorkspaceSeedAbsolutePathCandidates, resolveWorkspaceDocsMirrorAbsolutePath, type WorkspaceDocsMirrorEntry } from './workspaceSeedProviderPaths'
import { nextWorkspaceMirrorTraceId, reportWorkspaceMirrorTrace, readTextViaNodeFs, shouldBlockBlankMirrorOverwrite, shouldSkipEquivalentMirrorWrite, writeTextViaLocalFsProxy } from './workspaceSeedProviderLocalIo'
import { resolveWorkspaceDocsRootFromSourceFilesSelection, hasIncompleteSourceFilesMirrorText, readWorkspaceDocsMirrorEntriesFromSourceFilesRecordsHydrated, readWorkspaceDocsMirrorEntriesFromSourceFilesRecords, readWorkspaceDocsMirrorEntriesFromLocalFolderHandle, readWorkspaceDocsMirrorEntriesFromLocalFolderCache } from './workspaceSeedProviderSourceReaders'
import { readWorkspaceDocsMirrorEntriesFromAgenticGraphStorageDocsBySourceFiles, readWorkspaceDocsMirrorEntriesFromAgenticGraphStorageDbCache, readWorkspaceDocsMirrorEntriesFromAgenticGraphStorageExport } from './workspaceSeedProviderStorage'
export type { WorkspaceDocsMirrorEntry } from './workspaceSeedProviderPaths'
export { upsertWorkspaceInitializationSeedText, ensureWorkspaceDocsMirrorFolder, ensureWorkspaceChatMirrorFolder, upsertWorkspaceChatMirrorText, upsertWorkspaceChatMirrorBytes, deleteWorkspaceInitializationSeedText } from './workspaceSeedProviderLocalIo'
const AG_FS_LIST_PATH = '/__agentic_os_fs_list'
const isLikelyHtmlDocumentText = (text: string): boolean => {
  const head = String(text || '').trim().slice(0, 512).toLowerCase()
  return head.startsWith('<!doctype html') || head.startsWith('<html') || head.includes('<html ')
}

const readSeedTextViaFetch = async (url: string): Promise<string | null> => {
  const text = await readTextViaFetch(url)
  if (!text?.trim() || isLikelyHtmlDocumentText(text)) return null
  return text
}

const buildPublishedSeedRelPath = (relPath: string): string => {
  const normalized = normalizeRelPath(relPath)
  if (!normalized || !normalized.startsWith('docs/')) return ''
  return `/${normalized}`
}

const shouldBlockDuplicateMirrorDocumentOverwrite = async (args: {
  workspacePath: string
  text: string
  allowCrossDocumentOverwrite?: boolean
}): Promise<boolean> => {
  if (args.allowCrossDocumentOverwrite === true) return false
  const nextText = String(args.text || '').trim()
  if (!nextText) return false
  const targetRelPath = normalizeMirrorRelPath(String(args.workspacePath || '').replace(/^\/?docs\/?/, ''))
  if (!targetRelPath) return false
  try {
    const entries = await readWorkspaceInitializationDocsMirrorEntries({ preferCompleteDataset: true })
    for (let i = 0; i < entries.length; i += 1) {
      const entry = entries[i]
      if (!entry) continue
      const relPath = normalizeMirrorRelPath(String(entry.relPath || ''))
      if (!relPath || relPath === targetRelPath) continue
      if (String(entry.text || '').trim() === nextText) return true
    }
  } catch {
    return false
  }
  return false
}

export async function readWorkspaceInitializationSeedText(args: {
  basename: string
  relPathCandidates: ReadonlyArray<string>
}): Promise<string | null> {
  const basename = normalizeBasename(args.basename)
  if (!basename) return null
  const normalizedRelCandidates = Array.from(
    new Set((args.relPathCandidates || []).map(path => normalizeRelPath(path)).filter(Boolean)),
  )
  const canonicalSeedRelCandidates = normalizedRelCandidates.filter(path =>
    isAgenticGraphWorkspaceSeedsPath(path),
  )
  const canonicalSeedOwned = canonicalSeedRelCandidates.length > 0

  const absolutePathCandidates = buildWorkspaceSeedAbsolutePathCandidates({
    basename,
    relPathCandidates: canonicalSeedOwned
      ? canonicalSeedRelCandidates
      : normalizedRelCandidates,
  })
  for (let i = 0; i < absolutePathCandidates.length; i += 1) {
    const absolutePath = absolutePathCandidates[i]!
    const absoluteViaFetch = buildLocalFsFetchPath(absolutePath)
    if (absoluteViaFetch) {
      const text = await readSeedTextViaFetch(absoluteViaFetch)
      if (text) return text
    }
    const text = await readTextViaNodeFs(absolutePath)
    if (text) return text
  }
  if (canonicalSeedOwned) return null

  const relCandidates = normalizedRelCandidates
  for (let i = 0; i < relCandidates.length; i += 1) {
    const publishedPath = buildPublishedSeedRelPath(relCandidates[i]!)
    if (publishedPath) {
      const text = await readSeedTextViaFetch(publishedPath)
      if (text) return text
    }
    const text = await readSeedTextViaFetch(buildCodebaseFilePath(relCandidates[i]!))
    if (text) return text
  }
  return null
}

const readWorkspaceDocsMirrorDatasetScore = (entries: ReadonlyArray<WorkspaceDocsMirrorEntry>): number => {
  const list = Array.isArray(entries) ? entries : []
  if (list.length === 0) return 0
  let totalChars = 0
  for (let i = 0; i < list.length; i += 1) {
    totalChars += String(list[i]?.text || '').trim().length
  }
  return (list.length * 1_000_000) + totalChars
}

const chooseBestWorkspaceDocsMirrorDataset = (
  datasets: ReadonlyArray<ReadonlyArray<WorkspaceDocsMirrorEntry>>,
): WorkspaceDocsMirrorEntry[] => {
  let best: WorkspaceDocsMirrorEntry[] = []
  let bestScore = 0
  for (let i = 0; i < datasets.length; i += 1) {
    const candidate = Array.isArray(datasets[i]) ? datasets[i] as WorkspaceDocsMirrorEntry[] : []
    const score = readWorkspaceDocsMirrorDatasetScore(candidate)
    if (score > bestScore) {
      best = candidate
      bestScore = score
    }
  }
  return best
}

export const readCanonicalWorkspaceSeedMirrorEntries = async (): Promise<WorkspaceDocsMirrorEntry[]> => {
  const bundledEntries = await readCanonicalAgenticGraphWorkspaceSeedsMirrorEntries()
  const absRoot = readAgenticGraphWorkspaceSeedsReadAbsRoot()
  if (!absRoot) return bundledEntries
  const liveEntries = await readWorkspaceMirrorRootEntries({
    absRoot, workspaceRootName: 'workspace-seeds',
    readViaProxy: root => readWorkspaceDocsMirrorEntriesViaProxy(root, { allowRepoLocal: true }),
    readViaNodeFs: readWorkspaceDocsMirrorEntriesViaNodeFs,
  })
  return resolveCompleteCanonicalWorkspaceSeedInventory(bundledEntries, liveEntries.map(entry => ({
    ...entry, authority: 'agentic-graph-workspace-seeds-local',
  })))
}

const readWorkspaceDocsMirrorEntriesViaProxy = async (
  docsAbsRoot: string,
  options?: { allowRepoLocal?: boolean },
): Promise<WorkspaceDocsMirrorEntry[]> => {
  if (isWorkspaceRepoLocalRunReadyBootstrap() && !options?.allowRepoLocal) return []
  if (typeof window === 'undefined' || typeof fetch !== 'function') return []
  const fetchImpl = fetch
  return readCachedConfiguredDocsMirrorEntries({
    cacheKey: normalizeAbsRoot(docsAbsRoot),
    load: async () => {
      const traceId = nextWorkspaceMirrorTraceId('proxy')
      const startedAtMs = Date.now()
      // #region debug-point B:workspace-mirror-proxy-start
      reportWorkspaceMirrorTrace({
        hypothesisId: 'B',
        traceId,
        location: 'workspaceSeedProvider.ts:readWorkspaceDocsMirrorEntriesViaProxy:start',
        msg: 'workspace docs mirror proxy request started',
        data: {
          docsAbsRoot,
          maxFiles: WORKSPACE_DOCS_MIRROR_MAX_FILES,
        },
      })
      // #endregion
      try {
        const response = await fetchWorkspaceDocsMirrorResponse(AG_FS_LIST_PATH, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            path: docsAbsRoot,
            maxFiles: WORKSPACE_DOCS_MIRROR_MAX_FILES,
          }),
        }, fetchImpl)
        if (!response.ok) {
          cancelStorageStream(response.body, 'workspace docs mirror response status rejected')
          // #region debug-point C:workspace-mirror-proxy-non-ok
          reportWorkspaceMirrorTrace({
            hypothesisId: 'C',
            traceId,
            location: 'workspaceSeedProvider.ts:readWorkspaceDocsMirrorEntriesViaProxy:non-ok',
            msg: 'workspace docs mirror proxy request returned non-ok status',
            data: {
              docsAbsRoot,
              status: response.status,
              durationMs: Date.now() - startedAtMs,
            },
          })
          // #endregion
          return []
        }
        const json = JSON.parse(await readResponseTextWithDeadline(response, { maxBytes: null })) as {
          ok?: boolean
          files?: Array<{ relPath?: unknown; text?: unknown; updatedAtMs?: unknown }>
        }
        if (json.ok !== true || !Array.isArray(json.files)) {
          // #region debug-point C:workspace-mirror-proxy-invalid-json
          reportWorkspaceMirrorTrace({
            hypothesisId: 'C',
            traceId,
            location: 'workspaceSeedProvider.ts:readWorkspaceDocsMirrorEntriesViaProxy:invalid-json',
            msg: 'workspace docs mirror proxy request returned an invalid payload',
            data: {
              docsAbsRoot,
              ok: json.ok === true,
              hasFilesArray: Array.isArray(json.files),
              durationMs: Date.now() - startedAtMs,
            },
          })
          // #endregion
          return []
        }
        const out: WorkspaceDocsMirrorEntry[] = []
        for (let i = 0; i < json.files.length; i += 1) {
          const item = json.files[i]
          const relPath = normalizeMirrorRelPath(String(item?.relPath || ''))
          if (!relPath) continue
          const text = typeof item?.text === 'string' ? item.text : ''
          out.push({
            relPath,
            text,
            updatedAtMs: Number.isFinite(Number(item?.updatedAtMs)) ? Math.floor(Number(item?.updatedAtMs)) : Date.now(),
          })
        }
        // #region debug-point D:workspace-mirror-proxy-success
        reportWorkspaceMirrorTrace({
          hypothesisId: 'D',
          traceId,
          location: 'workspaceSeedProvider.ts:readWorkspaceDocsMirrorEntriesViaProxy:success',
          msg: 'workspace docs mirror proxy request completed',
          data: {
            docsAbsRoot,
            fileCount: out.length,
            durationMs: Date.now() - startedAtMs,
          },
        })
        // #endregion
        return out
      } catch (error: unknown) {
        // #region debug-point E:workspace-mirror-proxy-error
        reportWorkspaceMirrorTrace({
          hypothesisId: 'E',
          traceId,
          location: 'workspaceSeedProvider.ts:readWorkspaceDocsMirrorEntriesViaProxy:error',
          msg: 'workspace docs mirror proxy request threw',
          data: {
            docsAbsRoot,
            durationMs: Date.now() - startedAtMs,
            errorName: error instanceof Error ? error.name : typeof error,
            errorMessage: error instanceof Error ? error.message : String(error || ''),
          },
        })
        // #endregion
        return []
      }
    },
  })
}

export const readCanonicalAgenticDocsMirrorEntries = async (): Promise<WorkspaceDocsMirrorEntry[]> => {
  const absRoot = readWorkspaceInitializationAgenticOsDocsAbsRoot()
  if (!absRoot) return []
  return readWorkspaceMirrorRootEntries({
    absRoot,
    workspaceRootName: 'agentic-canvas-os/docs',
    readViaProxy: root => readWorkspaceDocsMirrorEntriesViaProxy(root, { allowRepoLocal: true }),
    readViaNodeFs: readWorkspaceDocsMirrorEntriesViaNodeFs,
  })
}

const readWorkspaceDocsMirrorEntriesFromDefaultSourceUrl = async (
  url: string,
): Promise<WorkspaceDocsMirrorEntry[]> => {
  try {
    const { fetchWorkspaceUrlContent } = await import(
      '@/features/markdown-workspace/workspaceImport/urlContent'
    ) as typeof import('@/features/markdown-workspace/workspaceImport/urlContent')
    const content = await fetchWorkspaceUrlContent(url, { mode: 'import', viewHint: 'markdown' })
    const text = String(content.text || '').trim()
    if (!text) return []
    const name = String(content.name || '').trim()
    const relPath = name.endsWith('.md') ? name : `${name || 'imported'}.md`
    return [{ relPath, text, updatedAtMs: Date.now() }]
  } catch {
    return []
  }
}

export async function readWorkspaceInitializationDocsMirrorEntries(args?: { preferCompleteDataset?: boolean }): Promise<WorkspaceDocsMirrorEntry[]> {
  const preferCompleteDataset = args?.preferCompleteDataset === true, traceId = nextWorkspaceMirrorTraceId('bootstrap')
  const completeDatasetCandidates: WorkspaceDocsMirrorEntry[][] = [], defaultSourceUrl = readWorkspaceImportDefaultSourceUrlSetting()
  const defaultSourceUrlIsGitHub = isWorkspaceDocsMirrorGitHubSourceUrl(defaultSourceUrl), repoLocalRunReady = isWorkspaceRepoLocalRunReadyBootstrap()
  if (repoLocalRunReady && typeof window !== 'undefined') return readCanonicalWorkspaceSeedMirrorEntries()
  const shouldOverlayCanonicalWorkspaceSeedInventory = (): boolean => (
    preferCompleteDataset
    && (sourceFilesSelection?.selectedFolderPath || '') === ''
    && Array.isArray(sourceFilesSelection?.sourceFiles)
    && sourceFilesSelection.sourceFiles.length > 0
  )
  const overlayCanonicalWorkspaceSeedsIfNeeded = async (
    entries: WorkspaceDocsMirrorEntry[],
  ): Promise<WorkspaceDocsMirrorEntry[]> => {
    if (!shouldOverlayCanonicalWorkspaceSeedInventory() || entries.length === 0) return entries
    return overlayCanonicalWorkspaceSeedEntries(
      entries,
      await readCanonicalWorkspaceSeedMirrorEntries(),
    )
  }
  const readPublishedCanonicalDocsMirrorEntries = async (): Promise<WorkspaceDocsMirrorEntry[]> => {
    if (repoLocalRunReady) return []
    const [publishedEntries, publishedAgenticEntries, workspaceSeedEntries] = await Promise.all([
      readCanonicalPublishedNonAgenticDocsMirrorEntries({
        maxFiles: WORKSPACE_DOCS_MIRROR_MAX_FILES,
        maxFileBytes: WORKSPACE_DOCS_MIRROR_MAX_FILE_BYTES,
      }),
      import('@/features/workspace-fs/workspacePublishedAgenticDocsSource').then(module => module.readPublishedAgenticDocsMirrorEntries()),
      readCanonicalWorkspaceSeedMirrorEntries(),
    ])
    const canonicalEntries = [...publishedEntries, ...publishedAgenticEntries]
    if (canonicalEntries.length === 0) return []
    return overlayCanonicalWorkspaceSeedEntries(canonicalEntries, workspaceSeedEntries)
  }
  // #region debug-point A:workspace-mirror-bootstrap-entry
  reportWorkspaceMirrorTrace({
    hypothesisId: 'A',
    traceId,
    location: 'workspaceSeedProvider.ts:readWorkspaceInitializationDocsMirrorEntries:entry',
    msg: 'workspace docs mirror bootstrap entered',
    data: {
      preferCompleteDataset,
      defaultSourceUrlIsGitHub,
      hasDefaultSourceUrl: !!defaultSourceUrl,
      docsAbsRoot: readWorkspaceInitializationDocsAbsRoot(),
    },
  })
  // #endregion
  const sourceFilesSelection = await resolveWorkspaceDocsRootFromSourceFilesSelection()
  const agenticGraphStorageBaseUrl = readWorkspaceDocsMirrorStorageFallbackEnabled() ? readWorkspaceInitializationAgenticGraphStorageBaseUrl() : ''
  const agenticGraphStorageWorkspaceId = agenticGraphStorageBaseUrl && sourceFilesSelection ? buildAgenticGraphWorkspaceIdFromSourceFilesWorkspaceState({ folderName: sourceFilesSelection.folderName, accessMode: sourceFilesSelection.accessMode as 'fs-access' | 'opfs' | 'file-input' | null, folderCacheId: sourceFilesSelection.localMarkdownFolderCacheId, selectedFolderPath: sourceFilesSelection.selectedFolderPath || null }) : ''
  const storageDatasets: WorkspaceDocsMirrorEntry[][] = []
  const localRootRequests = resolveWorkspaceDocsMirrorLocalRootRequests({ docsAbsRoot: readWorkspaceInitializationDocsAbsRoot(), outputDocsAbsRoot: readWorkspaceInitializationOutputDocsAbsRoot(), agenticDocsAbsRoot: readWorkspaceInitializationAgenticOsDocsAbsRoot(), workspaceSeedsReadAbsRoot: readAgenticGraphWorkspaceSeedsReadAbsRoot() })
  const rootMirrorEntries = (await Promise.all(localRootRequests.map(async request => {
    const entries = await readWorkspaceMirrorRootEntries({
      ...request,
      readViaProxy: readWorkspaceDocsMirrorEntriesViaProxy,
      readViaNodeFs: readWorkspaceDocsMirrorEntriesViaNodeFs,
    })
    if (request.workspaceRootName !== 'workspace-seeds') return entries
    return entries.map(entry => ({
      ...entry,
      authority: 'agentic-graph-workspace-seeds-local' as const,
    }))
  }))).flat()
  if (rootMirrorEntries.length > 0) {
    return rootMirrorEntries
  }
  if (agenticGraphStorageBaseUrl && sourceFilesSelection && agenticGraphStorageWorkspaceId && sourceFilesSelection.sourceFiles.length > 0) {
    const viaAgenticGraphDocView = await readWorkspaceDocsMirrorEntriesFromAgenticGraphStorageDocsBySourceFiles({
      baseUrl: agenticGraphStorageBaseUrl,
      workspaceId: agenticGraphStorageWorkspaceId,
      selectedFolderPath: sourceFilesSelection.selectedFolderPath,
      sourceFiles: sourceFilesSelection.sourceFiles,
    })
    if (viaAgenticGraphDocView.length > 0) {
      if (!preferCompleteDataset) {
        const resolvedPaths = new Set(viaAgenticGraphDocView.map(entry => entry.relPath))
        // Resolve only selected files absent from the successful remote view.
        // An unavailable remote must not erase the rest of the authored selection.
        const missingFiles = sourceFilesSelection.sourceFiles.filter(file =>
          readWorkspaceDocsMirrorEntriesFromSourceFilesRecords({
            sourceFiles: [file], selectedFolderPath: sourceFilesSelection.selectedFolderPath,
          }).some(entry => !resolvedPaths.has(entry.relPath)))
        if (missingFiles.length === 0) return viaAgenticGraphDocView
        const missingArgs = { sourceFiles: missingFiles, selectedFolderPath: sourceFilesSelection.selectedFolderPath }
        const fallback = hasIncompleteSourceFilesMirrorText(missingArgs)
          ? await readWorkspaceDocsMirrorEntriesFromSourceFilesRecordsHydrated({
              ...missingArgs, storageDocFallback: { workspaceId: agenticGraphStorageWorkspaceId, baseUrl: agenticGraphStorageBaseUrl },
            })
          : readWorkspaceDocsMirrorEntriesFromSourceFilesRecords(missingArgs)
        return [...viaAgenticGraphDocView, ...fallback]
          .slice(0, WORKSPACE_DOCS_MIRROR_MAX_FILES)
          .sort((left, right) => left.relPath.localeCompare(right.relPath))
      }
      storageDatasets.push(viaAgenticGraphDocView)
    }
  }
  if (sourceFilesSelection?.sourceFiles?.length) {
    const sourceFilesIncomplete = hasIncompleteSourceFilesMirrorText({
      sourceFiles: sourceFilesSelection.sourceFiles,
      selectedFolderPath: sourceFilesSelection.selectedFolderPath,
    })
    if (sourceFilesIncomplete) {
      const viaSourceFilesHydrated = await readWorkspaceDocsMirrorEntriesFromSourceFilesRecordsHydrated({
        sourceFiles: sourceFilesSelection.sourceFiles,
        selectedFolderPath: sourceFilesSelection.selectedFolderPath,
        storageDocFallback: agenticGraphStorageWorkspaceId && agenticGraphStorageBaseUrl ? { workspaceId: agenticGraphStorageWorkspaceId, baseUrl: agenticGraphStorageBaseUrl } : null,
      })
      if (viaSourceFilesHydrated.length > 0) {
        if (!preferCompleteDataset) return viaSourceFilesHydrated
        completeDatasetCandidates.push(viaSourceFilesHydrated)
      }
    } else {
      const viaSourceFiles = readWorkspaceDocsMirrorEntriesFromSourceFilesRecords({
        sourceFiles: sourceFilesSelection.sourceFiles,
        selectedFolderPath: sourceFilesSelection.selectedFolderPath,
      })
      if (viaSourceFiles.length > 0) {
        if (!preferCompleteDataset) return viaSourceFiles
        completeDatasetCandidates.push(viaSourceFiles)
      }
    }
  }
  if (sourceFilesSelection?.localMarkdownFolderHandle) {
    const viaHandle = await readWorkspaceDocsMirrorEntriesFromLocalFolderHandle({
      rootHandle: sourceFilesSelection.localMarkdownFolderHandle,
      selectedFolderPath: sourceFilesSelection.selectedFolderPath,
    })
    if (viaHandle.length > 0) {
      return viaHandle
    }
  }
  if (sourceFilesSelection?.localMarkdownFolderCacheId) {
    const viaCache = await readWorkspaceDocsMirrorEntriesFromLocalFolderCache({
      folderCacheId: sourceFilesSelection.localMarkdownFolderCacheId,
      selectedFolderPath: sourceFilesSelection.selectedFolderPath,
    })
    if (viaCache.length > 0) {
      return viaCache
    }
  }
  if (agenticGraphStorageBaseUrl && sourceFilesSelection) {
    if (agenticGraphStorageWorkspaceId) {
      const viaAgenticGraphStorageDb = await readWorkspaceDocsMirrorEntriesFromAgenticGraphStorageDbCache({
        workspaceId: agenticGraphStorageWorkspaceId,
        selectedFolderPath: sourceFilesSelection.selectedFolderPath,
      })
      if (viaAgenticGraphStorageDb.length > 0) storageDatasets.push(viaAgenticGraphStorageDb)
      const viaAgenticGraphStorage = await readWorkspaceDocsMirrorEntriesFromAgenticGraphStorageExport({
        baseUrl: agenticGraphStorageBaseUrl,
        workspaceId: agenticGraphStorageWorkspaceId,
        selectedFolderPath: sourceFilesSelection.selectedFolderPath,
      })
      if (viaAgenticGraphStorage.length > 0) storageDatasets.push(viaAgenticGraphStorage)
      const bestStorageDataset = chooseBestWorkspaceDocsMirrorDataset(storageDatasets)
      if (bestStorageDataset.length > 0) {
        if (!preferCompleteDataset) return bestStorageDataset
        completeDatasetCandidates.push(bestStorageDataset)
      }
    }
  }
  if (!agenticGraphStorageBaseUrl) {
    if (defaultSourceUrl && !defaultSourceUrlIsGitHub) {
      const viaUrl = await readWorkspaceDocsMirrorEntriesFromDefaultSourceUrl(defaultSourceUrl)
      if (viaUrl.length > 0) {
        if (!preferCompleteDataset) return viaUrl
        completeDatasetCandidates.push(viaUrl)
      }
    }
  }
  const publishedCanonicalEntries = await readPublishedCanonicalDocsMirrorEntries()
  if (publishedCanonicalEntries.length > 0) {
    if (!preferCompleteDataset) return publishedCanonicalEntries
    if (completeDatasetCandidates.length === 0) {
      return overlayCanonicalWorkspaceSeedsIfNeeded(publishedCanonicalEntries)
    }
  }
  const bestDataset = preferCompleteDataset
    ? chooseBestWorkspaceDocsMirrorDataset(completeDatasetCandidates)
    : []
  return overlayCanonicalWorkspaceSeedsIfNeeded(bestDataset)
}

export async function upsertWorkspaceDocsMirrorText(args: {
  workspacePath: string
  text: string
  allowBlankText?: boolean
  allowCrossDocumentOverwrite?: boolean
}): Promise<boolean> {
  if (isAgenticGraphWorkspaceSeedsPath(args.workspacePath)) {
    if (typeof window === 'undefined') return false
    if (await shouldBlockDuplicateMirrorDocumentOverwrite({
      workspacePath: args.workspacePath,
      text: args.text,
      allowCrossDocumentOverwrite: args.allowCrossDocumentOverwrite,
    })) {
      return false
    }
    return writeTextViaLocalFsProxy(
      '',
      String(args.text ?? ''),
      args.workspacePath,
      args.allowBlankText,
    )
  }
  const absolutePath = resolveWorkspaceDocsMirrorAbsolutePath(args.workspacePath)
  if (!absolutePath) return false
  const nextText = String(args.text ?? '')
  if (await shouldBlockBlankMirrorOverwrite({
    absolutePath,
    text: nextText,
    allowBlankText: args.allowBlankText,
  })) {
    return false
  }
  if (await shouldSkipEquivalentMirrorWrite({
    absolutePath,
    text: nextText,
  })) {
    return false
  }
  if (await shouldBlockDuplicateMirrorDocumentOverwrite({
    workspacePath: args.workspacePath,
    text: nextText,
    allowCrossDocumentOverwrite: args.allowCrossDocumentOverwrite,
  })) {
    return false
  }
  if (typeof window !== 'undefined') {
    return writeTextViaLocalFsProxy(absolutePath, nextText, args.workspacePath)
  }
  try {
    const fs = await importNodeFsPromises()
    const path = await importNodePath()
    await fs.mkdir(path.dirname(absolutePath), { recursive: true })
    await fs.writeFile(absolutePath, nextText, 'utf8')
    return true
  } catch {
    return false
  }
}
