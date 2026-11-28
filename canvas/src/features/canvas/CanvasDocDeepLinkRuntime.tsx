import React from 'react'
import { useGraphStore } from '@/hooks/useGraphStore'
import { useMarkdownExplorerStore } from '@/features/markdown-explorer/store'
import type { UiToastInput } from '@/hooks/store/store-types/core'
import { findComposedSourceFileByPath } from '@/features/source-files/composedSourceSelection'
import { normalizeWorkspacePath } from '@/features/workspace-fs/path'
import { normalizeMarkdownWorkspaceSelectionPath } from '@/lib/markdown-workspace-runtime/markdownWorkspaceSelectionPath'
import {
  beginSourceFilesDocumentIntent,
  clearSourceFilesDocumentIntent,
  completeSourceFilesDocumentIntent,
  failSourceFilesDocumentIntent,
  useSourceFilesBootstrapHydrated,
} from '@/features/source-files/sourceFilesBootstrapReadiness'
import {
  buildDocDeepLinkIntentKey,
  buildDefaultDocViewUrl,
  buildDocViewUrl,
  clearRetainedLocalDocDeepLinkPath,
  consumeDeepLinkParams,
  isCanvasDocPreviewRequested,
  parseDocDeepLink,
} from './canvasDocDeepLink'
import type { DefaultRemoteDocDeepLink } from './canvasDocDeepLink'
import type { RemoteDocDeepLink } from './canvasDocDeepLink'
import type { WorkspaceUrlContent } from '@/features/markdown-workspace/workspaceImport'
import {
  consumeWebsiteCrawlMarkdownDeepLinkRequest,
  openWebsiteCrawlMarkdownArtifactInExplorer,
  readWebsiteCrawlMarkdownDeepLinkRequest,
} from '@/lib/websites/openWebsiteCrawlMarkdownArtifactInExplorer'

type PushUiToast = (toast: UiToastInput) => void

type GraphStoreSnapshot = ReturnType<typeof useGraphStore.getState>

const documentDeepLinkImports = new Map<string, Promise<void>>()
const remoteDeepLinkImportTails = new WeakMap<Map<string, Promise<void>>, Promise<void>>()

export function resolveSharedDocumentWorkspaceImportName(name: string): string {
  const normalized = normalizeWorkspacePath(String(name || '').trim())
  return normalizeMarkdownWorkspaceSelectionPath(normalized) || normalized
}

export function restoreSupersededCanvasImportGraphState(
  stateBeforeCommit: GraphStoreSnapshot,
  stateAfterCommit: GraphStoreSnapshot,
): void {
  useGraphStore.setState(currentState => {
    const patch: Partial<GraphStoreSnapshot> = {}
    for (const key of Object.keys(stateBeforeCommit) as Array<keyof GraphStoreSnapshot>) {
      if (stateBeforeCommit[key] === stateAfterCommit[key]) continue
      if (currentState[key] !== stateAfterCommit[key]) continue
      ;(patch as Record<keyof GraphStoreSnapshot, unknown>)[key] = stateBeforeCommit[key]
    }
    return patch
  })
}

export function restoreSupersededCanvasImportActivePath(path: string | null): void {
  useMarkdownExplorerStore.getState().setActivePath(path, { syncUrl: false })
}

export async function compensateSupersededCanvasImport(args: {
  rollbackWorkspace: () => Promise<void>
  rollbackSources: () => void
  graphStateBeforeCommit: GraphStoreSnapshot
  graphStateAfterCommit: GraphStoreSnapshot
  explorerActivePathBeforeCommit: string | null
}): Promise<void> {
  const rollbackErrors: unknown[] = []
  try {
    await args.rollbackWorkspace()
  } catch (error) {
    rollbackErrors.push(error)
  }
  try {
    args.rollbackSources()
  } catch (error) {
    rollbackErrors.push(error)
  }
  try {
    restoreSupersededCanvasImportGraphState(args.graphStateBeforeCommit, args.graphStateAfterCommit)
  } catch (error) {
    rollbackErrors.push(error)
  }
  try {
    restoreSupersededCanvasImportActivePath(args.explorerActivePathBeforeCommit)
  } catch (error) {
    rollbackErrors.push(error)
  }
  if (rollbackErrors.length === 0) return
  const rollbackDetail = rollbackErrors
    .map(item => item instanceof Error ? item.message : String(item || 'unknown rollback failure'))
    .join('; ')
  throw new Error(`Shared document rollback failed: ${rollbackDetail}`)
}

type RemoteDeepLinkImportLifecycle<PreparedDocument> = {
  prepareDocument: () => Promise<PreparedDocument>
  commitDocument: (
    prepared: PreparedDocument,
    context: Readonly<{ isCurrentIntent: () => boolean }>,
  ) => Promise<void>
  readCurrentIntentKey: () => string
  completeIntent: () => void
  reportError: (error: unknown) => void
  cancelIntent?: () => void
}

export function runRemoteDeepLinkImportLifecycle<PreparedDocument>(
  inFlightImports: Map<string, Promise<void>>,
  intentKey: string,
  lifecycle: RemoteDeepLinkImportLifecycle<PreparedDocument>,
): Promise<void> {
  const activeImport = inFlightImports.get(intentKey)
  if (activeImport) return activeImport

  const precedingImport = remoteDeepLinkImportTails.get(inFlightImports)
  const mutationQueue = precedingImport ? precedingImport.catch(() => undefined) : Promise.resolve()
  const isCurrentIntent = (): boolean => lifecycle.readCurrentIntentKey() === intentKey
  const cancelSupersededIntent = (): boolean => {
    if (isCurrentIntent()) return false
    lifecycle.cancelIntent?.()
    return true
  }
  const pendingImport = mutationQueue
    .then(async () => {
      if (cancelSupersededIntent()) return
      const prepared = await lifecycle.prepareDocument()
      if (cancelSupersededIntent()) return
      await lifecycle.commitDocument(prepared, { isCurrentIntent })
      if (cancelSupersededIntent()) return
      lifecycle.completeIntent()
    })
    .catch(error => {
      if (cancelSupersededIntent()) return
      lifecycle.reportError(error)
    })
    .finally(() => {
      if (inFlightImports.get(intentKey) === pendingImport) {
        inFlightImports.delete(intentKey)
      }
      if (remoteDeepLinkImportTails.get(inFlightImports) === pendingImport) {
        remoteDeepLinkImportTails.delete(inFlightImports)
      }
    })
  inFlightImports.set(intentKey, pendingImport)
  remoteDeepLinkImportTails.set(inFlightImports, pendingImport)
  return pendingImport
}

async function openCrawlMarkdownRequest(
  crawlRequest: NonNullable<ReturnType<typeof readWebsiteCrawlMarkdownDeepLinkRequest>>,
  pushUiToast: PushUiToast,
): Promise<void> {
  const toastId = 'deep-link:crawl-artifact'
  pushUiToast({ id: toastId, kind: 'neutral', message: 'Opening crawl artifact…', ttlMs: null, dismissible: false })
  try {
    const result = await openWebsiteCrawlMarkdownArtifactInExplorer(crawlRequest)
    if (!result) throw new Error('Crawl artifact is unavailable')
    pushUiToast({ id: toastId, kind: 'success', message: 'Opened crawl Markdown in Source Files', ttlMs: 3000, dismissible: false })
  } catch (error) {
    pushUiToast({ id: toastId, kind: 'error', message: error instanceof Error ? error.message : 'Failed to open crawl artifact', ttlMs: 5000, dismissible: true })
    throw error
  }
}

async function handleLocalDeepLink(
  relativePath: string,
  pushUiToast: PushUiToast,
  options: { applyToGraph: boolean },
): Promise<void> {
  const toastId = 'deep-link:doc-local'
  pushUiToast({ id: toastId, kind: 'neutral', message: 'Opening document…', ttlMs: null, dismissible: false })

  try {
    const [
      { getWorkspaceFs },
      { normalizeWorkspacePath, workspaceBasename, workspaceDocumentKey },
      { applyActiveMarkdownDocumentPayload },
      { isMaterializedWorkspaceSourceProofCurrent, materializeActiveWorkspaceEntryIntoSourceFiles },
      { isFrontmatterOnlyDoc },
    ] = await Promise.all([
      import('@/features/workspace-fs/workspaceFs') as Promise<typeof import('@/features/workspace-fs/workspaceFs')>,
      import('@/features/workspace-fs/path') as Promise<typeof import('@/features/workspace-fs/path')>,
      import('@/features/markdown/activeMarkdownDocument') as Promise<typeof import('@/features/markdown/activeMarkdownDocument')>,
      import('@/features/source-files/sourceFilesRuntimeMaterialization') as Promise<typeof import('@/features/source-files/sourceFilesRuntimeMaterialization')>,
      import('@/lib/markdown/frontmatter') as Promise<typeof import('@/lib/markdown/frontmatter')>,
    ])

    const fs = await getWorkspaceFs()
    await fs.ensureSeed()
    const targetPath = normalizeWorkspacePath(relativePath)
    const entries = await fs.listEntries()
    const entry = entries.find(e => e.path === targetPath)

    if (!entry || entry.kind !== 'file') {
      clearRetainedLocalDocDeepLinkPath()
      throw new Error(`File not found: ${workspaceBasename(targetPath) || relativePath}`)
    }

    const graphStore = useGraphStore.getState()
    if (graphStore.workspaceViewMode === 'editor') {
      graphStore.setSelectionSource('editor')
      graphStore.selectNode(null)
      graphStore.selectEdge(null)
    }
    useMarkdownExplorerStore.getState().setActivePath(targetPath)

    const entryText = await fs.readFileText(targetPath)
    if (entryText == null) throw new Error(`File is unreadable: ${workspaceBasename(targetPath) || relativePath}`)
    const activated = await applyActiveMarkdownDocumentPayload({
      setActiveMarkdownDocument: graphStore.setActiveMarkdownDocument,
      name: workspaceDocumentKey(targetPath),
      text: entryText,
      sourceUrl: null,
      canonicalMarkdownText: entryText,
      autoEnableFrontmatter: false,
      applyViewPreset: options.applyToGraph,
      applyToGraph: options.applyToGraph,
      forceApplyToGraph: options.applyToGraph,
      normalizeWebpageFrontmatterToMarkdown: false,
    })
    if (activated !== true) throw new Error(`Failed to activate ${workspaceBasename(targetPath) || relativePath}`)
    const activatedDocument = useGraphStore.getState()
    if (useMarkdownExplorerStore.getState().activePath !== targetPath
      || activatedDocument.markdownDocumentName !== workspaceDocumentKey(targetPath)) {
      throw new Error(`Source ownership changed while activating ${workspaceBasename(targetPath) || relativePath}`)
    }

    const sourceFilesProof = await materializeActiveWorkspaceEntryIntoSourceFiles({
      activePathOverride: targetPath,
      fs,
      applyToGraph: options.applyToGraph,
      sourceFilesSnapshot: useGraphStore.getState().sourceFiles,
      workspaceEntries: entries,
    })
    const activeDocument = useGraphStore.getState()
    const activeSourceFile = findComposedSourceFileByPath({
      sourceFiles: activeDocument.sourceFiles,
      targetPath,
      enabledOnly: true,
    })
    const documentOwned = activeDocument.markdownDocumentName === workspaceDocumentKey(targetPath)
    const proofCurrent = !!sourceFilesProof && isMaterializedWorkspaceSourceProofCurrent(sourceFilesProof)
    const sourceOwned = !!activeSourceFile
      && activeSourceFile.text === activeDocument.markdownDocumentText
      && (activeSourceFile.status === 'parsed' || isFrontmatterOnlyDoc(activeSourceFile.text))
    if (useMarkdownExplorerStore.getState().activePath !== targetPath || !documentOwned || !proofCurrent || !sourceOwned) {
      throw new Error(
        `Local document source ownership did not survive activation `
        + `(document=${documentOwned ? 'ok' : 'missing'}, `
        + `proof=${proofCurrent ? 'ok' : 'stale'}, `
        + `sourceFile=${sourceOwned ? 'ok' : 'missing'}, `
        + `activePath=${targetPath})`,
      )
    }

    pushUiToast({
      id: toastId,
      kind: 'success',
      message: `Opened ${workspaceBasename(targetPath) || 'document'}`,
      ttlMs: 3000,
      dismissible: false,
    })
  } catch (err) {
    clearRetainedLocalDocDeepLinkPath()
    const message = err instanceof Error ? err.message : 'Failed to open document'
    pushUiToast({ id: toastId, kind: 'error', message, ttlMs: 5000, dismissible: true })
    throw err
  }
}

type PreparedRemoteDeepLink = Readonly<{
  docUrl: string
  content: WorkspaceUrlContent
}>

async function prepareRemoteDeepLink(
  link: RemoteDocDeepLink | DefaultRemoteDocDeepLink,
  pushUiToast: PushUiToast,
): Promise<PreparedRemoteDeepLink> {
  const docUrl = link.kind === 'default-remote'
    ? buildDefaultDocViewUrl(link.canonicalPath)
    : buildDocViewUrl(link.workspaceId, link.canonicalPath)
  pushUiToast({ id: 'deep-link:doc-import', kind: 'neutral', message: 'Loading shared document…', ttlMs: null, dismissible: false })
  const { fetchWorkspaceUrlContent } = await import('@/features/markdown-workspace/workspaceImport') as typeof import('@/features/markdown-workspace/workspaceImport')
  const content = await fetchWorkspaceUrlContent(docUrl, {
    mode: 'import',
    viewHint: 'markdown',
    preferDirectFetch: true,
  })
  const importedName = String(content.name || '').trim()
  return Object.freeze({
    docUrl,
    content: Object.freeze({
      ...content,
      name: importedName ? resolveSharedDocumentWorkspaceImportName(importedName) : importedName,
    }),
  })
}

async function commitRemoteDeepLink(
  link: RemoteDocDeepLink | DefaultRemoteDocDeepLink,
  pushUiToast: PushUiToast,
  prepared: PreparedRemoteDeepLink,
  isCurrentIntent: () => boolean,
): Promise<void> {
  const toastId = 'deep-link:doc-import'
  const preparedName = String(prepared.content.name || '').trim()
  const preparedMediaKind = prepared.content.sourceMediaKind
  if (!/\.(?:md|markdown|mdx|mmd)$/i.test(preparedName)
    || (preparedMediaKind && preparedMediaKind !== 'doc')
    || !String(prepared.content.text || '').trim()) {
    throw new Error('Shared document did not resolve to canonical Markdown')
  }
  const [
    { getWorkspaceFs },
    { normalizeWorkspacePath, workspaceDocumentKey, WORKSPACE_ROOT_PATH },
    { runWorkspaceFsChangedBatch, suppressNextWorkspaceFsChangedEvent },
    { bulkSetWorkspaceEntrySources, loadWorkspaceSourceIndex, setWorkspaceEntrySource },
    { importWorkspaceUrl },
    { normalizeWorkspaceImportResult, activateFirstImportedWorkspaceFile },
    { applyWorkspaceImportToCanvas },
    { createWorkspaceFsMutationTransaction },
    { isMaterializedWorkspaceSourceProofCurrent, materializeActiveWorkspaceEntryIntoSourceFiles },
  ] = await Promise.all([
    import('@/features/workspace-fs/workspaceFs') as Promise<typeof import('@/features/workspace-fs/workspaceFs')>,
    import('@/features/workspace-fs/path') as Promise<typeof import('@/features/workspace-fs/path')>,
    import('@/features/workspace-fs/workspaceFsEvents') as Promise<typeof import('@/features/workspace-fs/workspaceFsEvents')>,
    import('@/features/workspace-fs/sourceIndex') as Promise<typeof import('@/features/workspace-fs/sourceIndex')>,
    import('@/features/markdown-workspace/workspaceImport') as Promise<typeof import('@/features/markdown-workspace/workspaceImport')>,
    import('@/features/markdown-workspace/useWorkspaceFileActions/importRuntimeActions') as Promise<typeof import('@/features/markdown-workspace/useWorkspaceFileActions/importRuntimeActions')>,
    import('@/features/workspace-fs/applyWorkspaceImportToCanvas') as Promise<typeof import('@/features/workspace-fs/applyWorkspaceImportToCanvas')>,
    import('@/features/workspace-fs/workspaceFsMutationTransaction') as Promise<typeof import('@/features/workspace-fs/workspaceFsMutationTransaction')>,
    import('@/features/source-files/sourceFilesRuntimeMaterialization') as Promise<typeof import('@/features/source-files/sourceFilesRuntimeMaterialization')>,
  ])

  const fs = await getWorkspaceFs()
  await fs.ensureSeed()
  if (!isCurrentIntent()) throw new Error('Shared document intent was superseded before commit')
  const transaction = createWorkspaceFsMutationTransaction(fs)
  const graphStateBeforeCommit = useGraphStore.getState()
  const explorerActivePathBeforeCommit = useMarkdownExplorerStore.getState().activePath
  let sourceEntriesBeforeCommit: Map<string, ReturnType<typeof loadWorkspaceSourceIndex>[string] | null> | null = null
  let createdPathSet = new Set<string>()
  await runWorkspaceFsChangedBatch(async () => {
    try {
      const res = normalizeWorkspaceImportResult(await importWorkspaceUrl({
        fs: transaction.fs,
        urlRaw: prepared.docUrl,
        parentPath: WORKSPACE_ROOT_PATH,
        preferDirectFetch: true,
        fetchUrlContent: async () => prepared.content,
        mirrorToHost: false,
      }))
      if (!isCurrentIntent()) throw new Error('Shared document intent was superseded during workspace import')
      if (res.createdPaths.length === 0) throw new Error('Shared document import created no workspace file')
      if (res.failed.length > 0 || res.skipped.length > 0) {
        throw new Error('Shared document import did not resolve to one supported workspace file')
      }
      createdPathSet = new Set(res.createdPaths.map(path => normalizeWorkspacePath(path)))
      if (!res.sources.some(item => createdPathSet.has(normalizeWorkspacePath(item.path)) && item.source.kind === 'url')) {
        throw new Error('Shared document import is missing URL source provenance')
      }
      const removedSourcePaths = new Set(
        (res.removedPaths || []).map(path => normalizeWorkspacePath(path)).filter(Boolean),
      )
      const touchedSourcePaths = new Set([
        ...res.sources.map(item => normalizeWorkspacePath(item.path)),
        ...removedSourcePaths,
      ])
      const sourceIndexBeforeCommit = loadWorkspaceSourceIndex()
      sourceEntriesBeforeCommit = new Map([...touchedSourcePaths].map(path => (
        [path, sourceIndexBeforeCommit[path] || null] as const
      )))
      bulkSetWorkspaceEntrySources(res.sources)
      for (const path of removedSourcePaths) {
        if (!createdPathSet.has(path)) setWorkspaceEntrySource(path, null)
      }
      if (!isCurrentIntent()) throw new Error('Shared document intent was superseded before Canvas apply')
      await applyWorkspaceImportToCanvas({
        fs: transaction.fs,
        createdPaths: res.createdPaths,
        opts: {
          applyToGraph: true,
          skipComposedGraphApply: true,
          removedPaths: res.removedPaths,
        },
      })
      if (!isCurrentIntent()) throw new Error('Shared document intent was superseded before activation')
      const activated = await activateFirstImportedWorkspaceFile({
        fs: transaction.fs,
        createdPaths: res.createdPaths,
        applyToGraph: true,
        jsonSourceDocuments: res.jsonSourceDocuments,
        syncUrl: false,
      })
      if (!isCurrentIntent()) throw new Error('Shared document intent was superseded during activation')
      const activePath = normalizeWorkspacePath(useMarkdownExplorerStore.getState().activePath || '/')
      const sourceFilesProof = await materializeActiveWorkspaceEntryIntoSourceFiles({
        activePathOverride: activePath,
        fs: transaction.fs,
        applyToGraph: true,
        sourceFilesSnapshot: useGraphStore.getState().sourceFiles,
        workspaceEntries: await transaction.fs.listEntries(),
        sourcesByPath: loadWorkspaceSourceIndex(),
        premergedSourceFiles: useGraphStore.getState().sourceFiles,
      })
      const activeDocument = useGraphStore.getState()
      const activeSourceFile = findComposedSourceFileByPath({
        sourceFiles: activeDocument.sourceFiles,
        targetPath: activePath,
        enabledOnly: true,
      })
      const normalizedImportedSourceUrl = (() => {
        try {
          return new URL(String(prepared.content.normalizedUrl || prepared.docUrl || '').trim(), 'https://airvio.co').toString()
        } catch {
          return String(prepared.content.normalizedUrl || prepared.docUrl || '').trim()
        }
      })()
      const activeSourceUrl = activeSourceFile?.source?.kind === 'url'
        ? (() => {
            try {
              return new URL(String(activeSourceFile.source.url || '').trim(), 'https://airvio.co').toString()
            } catch {
              return String(activeSourceFile.source.url || '').trim()
            }
          })()
        : ''
      const createdPathOwned = createdPathSet.has(activePath) || (!!activeSourceUrl && activeSourceUrl === normalizedImportedSourceUrl)
      const documentOwned = activeDocument.markdownDocumentName === workspaceDocumentKey(activePath)
      const proofCurrent = !!sourceFilesProof && isMaterializedWorkspaceSourceProofCurrent(sourceFilesProof)
      const sourceOwned = !!activeSourceFile
      if (!activated || !documentOwned || !proofCurrent || !sourceOwned) {
        throw new Error(
          `Shared document source ownership did not survive activation `
          + `(activated=${activated ? 'ok' : 'false'}, `
          + `createdPath=${createdPathOwned ? 'ok' : 'missing'}, `
          + `document=${documentOwned ? 'ok' : String(activeDocument.markdownDocumentName || 'missing')}, `
          + `proof=${proofCurrent ? 'ok' : 'stale'}, `
          + `sourceFile=${sourceOwned ? 'ok' : 'missing'}, `
          + `activePath=${activePath})`,
        )
      }
    } catch (error) {
      const graphStateAfterFailedCommit = useGraphStore.getState()
      try {
        await compensateSupersededCanvasImport({
          rollbackWorkspace: () => transaction.rollback(),
          rollbackSources: () => {
            if (!sourceEntriesBeforeCommit) return
            for (const [path, source] of sourceEntriesBeforeCommit) {
              setWorkspaceEntrySource(path, source, { persist: 'sync' })
            }
          },
          graphStateBeforeCommit,
          graphStateAfterCommit: graphStateAfterFailedCommit,
          explorerActivePathBeforeCommit,
        })
      } catch (compensationError) {
        if (compensationError instanceof Error) {
          ;(compensationError as Error & { cause?: unknown }).cause = error
        }
        pushUiToast({
          id: 'deep-link:doc-import-rollback',
          kind: 'error',
          message: compensationError instanceof Error ? compensationError.message : 'Shared document rollback failed',
          ttlMs: null,
          dismissible: true,
        })
        throw compensationError
      } finally {
        suppressNextWorkspaceFsChangedEvent()
      }
      throw error
    }
  })
  pushUiToast({
    id: toastId,
    kind: 'success',
    message: `Loaded ${link.canonicalPath.split('/').pop() || 'document'}`,
    ttlMs: 3000,
    dismissible: false,
  })
}

function importRemoteDeepLinkOnce(
  intentKey: string,
  currentSearch: string,
  link: RemoteDocDeepLink | DefaultRemoteDocDeepLink,
  pushUiToast: PushUiToast,
): Promise<void> {
  return runRemoteDeepLinkImportLifecycle(documentDeepLinkImports, intentKey, {
    prepareDocument: () => prepareRemoteDeepLink(link, pushUiToast),
    commitDocument: (prepared, context) => commitRemoteDeepLink(link, pushUiToast, prepared, context.isCurrentIntent),
    readCurrentIntentKey: () => buildDocDeepLinkIntentKey(
      typeof window !== 'undefined' ? String(window.location.search || '') : currentSearch,
    ),
    completeIntent: () => {
      const liveSearch = typeof window !== 'undefined' ? String(window.location.search || '') : currentSearch
      completeSourceFilesDocumentIntent(intentKey)
      consumeDeepLinkParams(liveSearch)
    },
    reportError: err => {
      const message = err instanceof Error ? err.message : 'Failed to load shared document'
      pushUiToast({ id: 'deep-link:doc-import', kind: 'error', message, ttlMs: 5000, dismissible: true })
      failSourceFilesDocumentIntent(intentKey, err)
    },
    cancelIntent: () => {
      useGraphStore.getState().dismissUiToast('deep-link:doc-import')
      clearSourceFilesDocumentIntent(intentKey)
    },
  })
}

export function CanvasDocDeepLinkRuntime(props: { search: string }) {
  const { search } = props
  const pushUiToast = useGraphStore(s => s.pushUiToast)
  const sourceFilesBootstrapHydrated = useSourceFilesBootstrapHydrated()
  const intentKey = React.useMemo(() => buildDocDeepLinkIntentKey(String(search || '')), [search])

  React.useLayoutEffect(() => {
    if (!intentKey) return
    beginSourceFilesDocumentIntent(intentKey)
  }, [intentKey])

  React.useEffect(() => {
    if (!sourceFilesBootstrapHydrated || !intentKey) return
    const currentSearch = String(search || '')
    const link = parseDocDeepLink(currentSearch)
    if (!link) {
      clearSourceFilesDocumentIntent(intentKey)
      return
    }
    const readCurrentIntentKey = (): string => buildDocDeepLinkIntentKey(
      typeof window !== 'undefined' ? String(window.location.search || '') : currentSearch,
    )
    const completeCurrentDocumentIntent = (): void => {
      const liveSearch = typeof window !== 'undefined' ? String(window.location.search || '') : currentSearch
      completeSourceFilesDocumentIntent(intentKey)
      consumeDeepLinkParams(liveSearch)
    }
    const failCurrentDocumentIntent = (error: unknown): void => {
      failSourceFilesDocumentIntent(intentKey, error)
    }
    const crawlRequest = readWebsiteCrawlMarkdownDeepLinkRequest()
    if (link.kind === 'local' && crawlRequest) {
      void runRemoteDeepLinkImportLifecycle(documentDeepLinkImports, intentKey, {
        prepareDocument: async () => crawlRequest,
        commitDocument: prepared => openCrawlMarkdownRequest(prepared, pushUiToast),
        readCurrentIntentKey,
        completeIntent: () => {
          completeSourceFilesDocumentIntent(intentKey)
          consumeWebsiteCrawlMarkdownDeepLinkRequest()
        },
        reportError: failCurrentDocumentIntent,
      })
      return
    }
    const previewRequested = isCanvasDocPreviewRequested(currentSearch)

    if (link.kind === 'local') {
      void runRemoteDeepLinkImportLifecycle(documentDeepLinkImports, intentKey, {
        prepareDocument: async () => link.relativePath,
        commitDocument: relativePath => handleLocalDeepLink(relativePath, pushUiToast, { applyToGraph: previewRequested }),
        readCurrentIntentKey,
        completeIntent: completeCurrentDocumentIntent,
        reportError: failCurrentDocumentIntent,
      })
    } else {
      void importRemoteDeepLinkOnce(intentKey, currentSearch, link, pushUiToast)
    }
  }, [intentKey, search, pushUiToast, sourceFilesBootstrapHydrated])

  return null
}
