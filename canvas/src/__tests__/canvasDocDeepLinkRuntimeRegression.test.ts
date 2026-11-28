import fs from 'node:fs'
import path from 'node:path'
import { findComposedSourceFileByPath } from '@/features/source-files/composedSourceSelection'

const readUtf8 = (absPath: string): string => fs.readFileSync(absPath, { encoding: 'utf8' })

export const testCanvasDocDeepLinkSelectsDocumentBeforePassiveGraphApply = async () => {
  const { resolveSharedDocumentWorkspaceImportName } = await import('@/features/canvas/CanvasDocDeepLinkRuntime')
  if (resolveSharedDocumentWorkspaceImportName('/agentic-canvas-os/docs/shared/source.md') !== '/docs/shared/source.md') {
    throw new Error('Expected published storage paths to use the canonical explorer docs path before import')
  }
  if (resolveSharedDocumentWorkspaceImportName('/notes/source.md') !== '/notes/source.md') {
    throw new Error('Expected non-docs shared document paths to remain unchanged')
  }
  const text = readUtf8(path.resolve(process.cwd(), 'src', 'features', 'canvas', 'CanvasDocDeepLinkRuntime.tsx'))
  const canvasViewportText = readUtf8(path.resolve(process.cwd(), 'src', 'components', 'CanvasViewport.tsx'))
  const helperText = readUtf8(path.resolve(process.cwd(), 'src', 'features', 'canvas', 'canvasDocDeepLink.ts'))
  const shareTokenText = readUtf8(path.resolve(process.cwd(), 'src', 'features', 'canvas', 'canvasDocShareToken.mjs'))
  const explorerStoreText = readUtf8(path.resolve(process.cwd(), 'src', 'features', 'markdown-explorer', 'store.ts'))
  const crawlOpenText = readUtf8(path.resolve(process.cwd(), 'src', 'lib', 'websites', 'openWebsiteCrawlMarkdownArtifactInExplorer.ts'))
  const persistedWorkspaceFsText = readUtf8(path.resolve(process.cwd(), 'src', 'features', 'workspace-fs', 'workspaceFsPersisted.ts'))
  if (!text.includes("from './canvasDocDeepLink'")) {
    throw new Error('Expected document deep links to use the shared parser/URL helper')
  }
  for (const lifecycleMarker of [
    'beginSourceFilesDocumentIntent',
    'completeSourceFilesDocumentIntent',
    'failSourceFilesDocumentIntent',
    'useSourceFilesBootstrapHydrated',
  ]) {
    if (!text.includes(lifecycleMarker)) {
      throw new Error(`Expected document deep links to use shared keyed source authority: ${lifecycleMarker}`)
    }
  }
  const bootstrapReadyHookIndex = text.indexOf('const sourceFilesBootstrapHydrated = useSourceFilesBootstrapHydrated()')
  const bootstrapReadyGuardIndex = text.indexOf('if (!sourceFilesBootstrapHydrated || !intentKey) return')
  const routedSearchIndex = text.indexOf("const currentSearch = String(search || '')")
  const parseDeepLinkIndex = text.indexOf('const link = parseDocDeepLink(currentSearch)')
  const consumeDeepLinkIndex = text.lastIndexOf('consumeDeepLinkParams(liveSearch)')
  if (
    bootstrapReadyHookIndex < 0
    || bootstrapReadyGuardIndex < 0
    || routedSearchIndex < 0
    || parseDeepLinkIndex < 0
    || consumeDeepLinkIndex < 0
    || bootstrapReadyHookIndex > bootstrapReadyGuardIndex
    || bootstrapReadyGuardIndex > routedSearchIndex
    || bootstrapReadyGuardIndex > parseDeepLinkIndex
    || bootstrapReadyGuardIndex > consumeDeepLinkIndex
  ) {
    throw new Error('Expected document deep links to remain unconsumed until persisted Source Files startup finishes')
  }
  if (!text.includes('[intentKey, search, pushUiToast, sourceFilesBootstrapHydrated]')) {
    throw new Error('Expected Source Files bootstrap readiness to re-run deferred document deep links')
  }
  if (!explorerStoreText.includes('readLocalDocDeepLinkPathFromCurrentLocation()')) {
    throw new Error('Expected markdown explorer startup to prefer a live local document deep link before persisted active path')
  }
  if (text.includes("import('@/lib/markdown-workspace-runtime/workspaceSwitchPreset')") || text.includes('applyCanvasWorkspacePresetForSwitch')) {
    throw new Error('Expected local document deep links not to pre-apply YAML canvas presets before active document graph ownership changes')
  }
  const selectIndex = text.indexOf('setActivePath(targetPath)')
  const rollbackSelectIndex = text.indexOf('setActivePath(path, { syncUrl: false })')
  const graphApplyIndex = text.indexOf('applyActiveMarkdownDocumentPayload({')
  if (selectIndex < 0 || rollbackSelectIndex < 0 || graphApplyIndex < 0 || selectIndex > graphApplyIndex) {
    throw new Error('Expected local document deep links to select the target path before non-blocking graph work')
  }
  const selectionSourceIndex = text.indexOf("setSelectionSource('editor')")
  const clearNodeIndex = text.indexOf('selectNode(null)')
  const clearEdgeIndex = text.indexOf('selectEdge(null)')
  if (
    selectionSourceIndex < 0 ||
    clearNodeIndex < 0 ||
    clearEdgeIndex < 0 ||
    selectionSourceIndex > selectIndex ||
    clearNodeIndex > selectIndex ||
    clearEdgeIndex > selectIndex
  ) {
    throw new Error('Expected local document deep links to neutralize stale canvas selection before selecting the target path')
  }
  if (!text.includes("import('@/features/markdown/activeMarkdownDocument')")) {
    throw new Error('Expected local document deep links to reuse the shared active markdown document apply helper')
  }
  if (!text.includes('name: workspaceDocumentKey(targetPath)')) {
    throw new Error('Expected local document deep links to use canonical workspace document keys')
  }
  if (!text.includes('const entryText = await fs.readFileText(targetPath)')
    || !text.includes('if (entryText == null)')
    || !text.includes('if (activated !== true)')) {
    throw new Error('Expected local document links to resolve full file text and fail closed unless activation succeeds')
  }
  if (!text.includes('applyToGraph: options.applyToGraph') || !text.includes('normalizeWebpageFrontmatterToMarkdown: false')) {
    throw new Error('Expected local document deep links to keep graph application under the explicit preview option')
  }
  if (!text.includes('isCanvasDocPreviewRequested(currentSearch)') || !text.includes('applyToGraph: previewRequested')) {
    throw new Error('Expected source-addressed canvas preview links to hydrate their graph while normal local document links stay passive')
  }
  if (!text.includes('forceApplyToGraph: options.applyToGraph')) {
    throw new Error('Expected repeated preview links to force the selected source graph into the embedded canvas')
  }
  const localHandlerText = text.slice(
    text.indexOf('async function handleLocalDeepLink('),
    text.indexOf('type PreparedRemoteDeepLink'),
  )
  if (localHandlerText.includes('setWorkspaceViewState(')) {
    throw new Error('A local source load must preserve a user closing the editor while restoration is pending')
  }
  const localMaterializationIndex = localHandlerText.indexOf('const sourceFilesProof = await materializeActiveWorkspaceEntryIntoSourceFiles({')
  const localProofIndex = localHandlerText.indexOf('isMaterializedWorkspaceSourceProofCurrent(sourceFilesProof)')
  const localSourceIndex = localHandlerText.indexOf('findComposedSourceFileByPath({')
  const localSuccessIndex = localHandlerText.indexOf("kind: 'success'")
  if (
    localMaterializationIndex < 0
    || localProofIndex < localMaterializationIndex
    || localSourceIndex < localMaterializationIndex
    || localSuccessIndex < localProofIndex
    || localSuccessIndex < localSourceIndex
    || !localHandlerText.includes("import('@/features/source-files/sourceFilesRuntimeMaterialization')")
    || !localHandlerText.includes('activePathOverride: targetPath')
    || !localHandlerText.includes('workspaceEntries: entries')
    || !localHandlerText.includes('sourceFilesSnapshot: useGraphStore.getState().sourceFiles')
    || !localHandlerText.includes('applyToGraph: options.applyToGraph')
    || !localHandlerText.includes('enabledOnly: true')
    || !localHandlerText.includes('activeSourceFile.text === activeDocument.markdownDocumentText')
    || !localHandlerText.includes("activeSourceFile.status === 'parsed'")
    || localHandlerText.includes('premergedSourceFiles:')
  ) {
    throw new Error('Expected local document links to materialize and prove their exact active SourceFile before completion')
  }
  const missingFileGuardIndex = text.indexOf("if (!entry || entry.kind !== 'file')")
  const missingFileIntentClearIndex = text.indexOf('clearRetainedLocalDocDeepLinkPath()', missingFileGuardIndex)
  const localOpenCatchIndex = text.indexOf("const message = err instanceof Error ? err.message : 'Failed to open document'")
  const localOpenCatchIntentClearIndex = text.lastIndexOf('clearRetainedLocalDocDeepLinkPath()', localOpenCatchIndex)
  if (
    missingFileGuardIndex < 0
    || missingFileIntentClearIndex < missingFileGuardIndex
    || missingFileIntentClearIndex > localOpenCatchIndex
    || localOpenCatchIntentClearIndex < missingFileIntentClearIndex
  ) {
    throw new Error('Expected terminal local document open failures to clear retained reload intent')
  }
  if (!canvasViewportText.includes("get('kgLiveHero') === '1'") || !canvasViewportText.includes('deriveLiveCanvasHeroCommandRouteGraph(safeGraphData)')) {
    throw new Error('Expected Live Canvas Hero embeds to reuse the exact source-derived command-route projection at the viewport boundary')
  }
  if (!canvasViewportText.includes('data-kg-live-canvas-hero-embed-preview="true"') || !canvasViewportText.includes('canvas2dRendererOverride="flow"')) {
    throw new Error('Expected Live Canvas Hero embeds to own a dedicated interactive Flow renderer')
  }
  if (!canvasViewportText.includes('graphDataOverride={liveCanvasHeroEmbedGraph}') || !canvasViewportText.includes('mutationSourceGraphDataOverride={safeGraphData}')) {
    throw new Error('Expected the embedded Flow renderer to retain source-derived display and interaction ownership across hydration')
  }
  if (text.includes('consumedRef') || text.includes('consumedSearchRef')) {
    throw new Error('Expected document deep-link consumption to avoid stale one-shot latches')
  }
  if (!text.includes('buildDocDeepLinkIntentKey') || !text.includes('readCurrentIntentKey')) {
    throw new Error('Expected document imports to compare canonical intent identity instead of mutable unrelated query params')
  }
  if (!helperText.includes("window.dispatchEvent(new PopStateEvent('popstate'") || !helperText.includes("window.dispatchEvent(new Event('popstate'))")) {
    throw new Error('Expected document deep-link consumption to notify the router after URL cleanup')
  }
  if (!helperText.includes('resolvePublishedDocIdentity({')) {
    throw new Error('Expected document deep-link helpers to reuse the shared published-document identity resolver')
  }
  if (!helperText.includes('buildPublishedDocShareUrlFromSource')) {
    throw new Error('Expected published Share URL generation to reuse the shared document deep-link helper')
  }
  if (!helperText.includes('buildPublishedDocCanvasEmbedUrlFromSource') || !helperText.includes('appendCanvasPreviewParam')) {
    throw new Error('Expected canvas embed URL generation to reuse the shared document deep-link helper and preview-param appender')
  }
  if (!helperText.includes('buildPublishedDocShareDeepLink')) {
    throw new Error('Expected published Share URL generation to prefer the canonical opaque share-route builder')
  }
  if (!shareTokenText.includes('PUBLISHED_DOC_SHARE_TOKEN_PARAM = "kgShare"') || !helperText.includes('encodePublishedDocShareToken')) {
    throw new Error('Expected published Share URL generation to use the shared opaque share-token contract')
  }
  if (!helperText.includes("const SHARE_DEEP_LINK_PREFIX = '/share/'")) {
    throw new Error('Expected published Share URL generation to expose the canonical opaque share path')
  }
  if (!helperText.includes("const CANVAS_PREVIEW_PARAM = 'kgPreview'")) {
    throw new Error('Expected canvas embed URL generation to expose the canonical embedded-preview query param')
  }
  if (!text.includes("link.kind === 'default-remote'")) {
    throw new Error('Expected the deep-link runtime to route default-workspace shared documents through the shared storage markdown reader')
  }
  if (!text.includes('resolveSharedDocumentWorkspaceImportName(importedName)')) {
    throw new Error('Expected shared document imports to canonicalize storage paths before workspace materialization')
  }
  if (!text.includes('preferDirectFetch: true')) {
    throw new Error('Expected the storage deep-link runtime to fetch its configured CORS endpoint directly without a failing proxy preflight')
  }
  const localBranchIndex = text.lastIndexOf("if (link.kind === 'local')")
  const localApplyIndex = text.indexOf('commitDocument: relativePath => handleLocalDeepLink(', localBranchIndex)
  const localCompletionIndex = text.indexOf('completeIntent: completeCurrentDocumentIntent', localApplyIndex)
  const remoteImportIndex = text.indexOf('void importRemoteDeepLinkOnce(intentKey, currentSearch, link, pushUiToast)')
  if (
    localBranchIndex < 0
    || localApplyIndex < localBranchIndex
    || localCompletionIndex < localApplyIndex
    || remoteImportIndex < localCompletionIndex
    || !text.includes('prepareDocument: () => prepareRemoteDeepLink(link, pushUiToast)')
    || !text.includes('commitDocument: (prepared, context) => commitRemoteDeepLink(link, pushUiToast, prepared, context.isCurrentIntent)')
  ) {
    throw new Error('Expected every document link to complete source activation before consuming its URL')
  }
  if (!text.includes('const documentDeepLinkImports = new Map<string, Promise<void>>()')
    || !text.includes('const activeImport = inFlightImports.get(intentKey)')
    || !text.includes('if (activeImport) return activeImport')) {
    throw new Error('Expected StrictMode remounts to share one keyed in-flight document import across local and remote sources')
  }
  if (!text.includes('const isCurrentIntent = (): boolean => lifecycle.readCurrentIntentKey() === intentKey')
    || !text.includes('const prepared = await lifecycle.prepareDocument()')
    || !text.includes('await lifecycle.commitDocument(prepared, { isCurrentIntent })')
    || !text.includes("dismissUiToast('deep-link:doc-import')")
    || !text.includes('completeSourceFilesDocumentIntent(intentKey)')
    || !text.includes('consumeDeepLinkParams(liveSearch)')) {
    throw new Error('Expected a completed remote import not to consume a newer deep-link navigation')
  }
  if (text.includes('applyWorkspaceImportToCanvasBestEffort')
    || !text.includes("import('@/features/workspace-fs/applyWorkspaceImportToCanvas')")
    || !text.includes("import('@/features/source-files/sourceFilesRuntimeMaterialization')")
    || !text.includes('fetchUrlContent: async () => prepared.content')
    || !text.includes('createWorkspaceFsMutationTransaction(fs)')
    || !text.includes('rollbackWorkspace: () => transaction.rollback()')
    || !text.includes('mirrorToHost: false')
    || !text.includes('...removedSourcePaths')
    || !text.includes('setWorkspaceEntrySource(path, null)')
    || !text.includes("if (res.createdPaths.length === 0) throw new Error('Shared document import created no workspace file')")
    || !text.includes('syncUrl: false')
    || !text.includes('const sourceFilesProof = await materializeActiveWorkspaceEntryIntoSourceFiles({')
    || !text.includes('isMaterializedWorkspaceSourceProofCurrent(sourceFilesProof)')
    || text.includes("if (!activated) throw new Error('Shared document did not become the active Canvas source')")
    || !text.includes("`Shared document source ownership did not survive activation `")
    || !text.includes("`(activated=${activated ? 'ok' : 'false'}, `")) {
    throw new Error('Expected shared document imports to fail closed on source projection or activation failure')
  }
  if (!persistedWorkspaceFsText.includes('options?.mirrorToHost !== false && isWorkspaceDocsBackedMirrorPath(p)')
    || !persistedWorkspaceFsText.includes('args.mirrorToHost !== false && isWorkspaceDocsBackedMirrorPath(path)')) {
    throw new Error('Expected transactional workspace mutations to prevent host mirror writes below the URL importer')
  }
  if (!text.includes('findComposedSourceFileByPath({')
    || !text.includes('enabledOnly: true')
    || !text.includes('activeSourceUrl === normalizedImportedSourceUrl')
    || text.includes("normalizeWorkspacePath(String(file?.source?.path || ''))")) {
    throw new Error('Expected remote source ownership to reuse the shared workspace-aware enabled SourceFile selector')
  }
  const importedWorkspaceSource = {
    id: 'sf-imported-xr',
    name: 'xr-source.md',
    text: '# Authored XR source',
    enabled: true,
    source: {
      kind: 'url',
      url: 'https://example.invalid/docs/xr-source.md',
      path: 'workspace:/docs/xr-source.md',
    },
  } as unknown as import('@/hooks/store/types').GraphState['sourceFiles'][number]
  const importedWorkspaceMatch = findComposedSourceFileByPath({
    sourceFiles: [importedWorkspaceSource],
    targetPath: '/docs/xr-source.md',
    enabledOnly: true,
  })
  if (importedWorkspaceMatch?.id !== importedWorkspaceSource.id) {
    throw new Error('Expected imported workspace SourceFile keys to match their canonical explorer path')
  }
  const disabledImportedWorkspaceMatch = findComposedSourceFileByPath({
    sourceFiles: [{ ...importedWorkspaceSource, enabled: false }],
    targetPath: '/docs/xr-source.md',
    enabledOnly: true,
  })
  if (disabledImportedWorkspaceMatch !== null) {
    throw new Error('Expected remote source ownership checks to reject disabled imported SourceFiles')
  }
  const crawlBranchIndex = text.indexOf("if (link.kind === 'local' && crawlRequest)")
  const crawlLifecycleIndex = text.indexOf('runRemoteDeepLinkImportLifecycle', crawlBranchIndex)
  const crawlConsumeIndex = text.indexOf('consumeWebsiteCrawlMarkdownDeepLinkRequest()', crawlBranchIndex)
  if (crawlBranchIndex < 0
    || crawlLifecycleIndex < crawlBranchIndex
    || crawlConsumeIndex < crawlLifecycleIndex
    || crawlOpenText.includes('applyWorkspaceImportToCanvasBestEffort')
    || !crawlOpenText.includes('skipComposedGraphApply: true')
    || !crawlOpenText.includes('if (!activated) return null')
    || !crawlOpenText.includes("window.dispatchEvent(new PopStateEvent('popstate'")) {
    throw new Error('Expected crawl document intent to consume only after strict activation and router notification')
  }
}

export const testCanvasDocDeepLinkRemoteImportLifecycle = async () => {
  const { runRemoteDeepLinkImportLifecycle } = await import('@/features/canvas/CanvasDocDeepLinkRuntime')
  const inFlightImports = new Map<string, Promise<void>>()
  const intentKey = 'canonical-source-preview'
  let importCalls = 0
  let commitCalls = 0
  let consumedSearch = ''
  let finishImport: (() => void) | null = null
  const lifecycle = {
    prepareDocument: () => {
      importCalls += 1
      return new Promise<string>(resolve => {
        finishImport = () => resolve('prepared-source')
      })
    },
    commitDocument: async prepared => {
      if (prepared !== 'prepared-source') throw new Error('expected prepared source bytes to reach commit')
      commitCalls += 1
    },
    readCurrentIntentKey: () => intentKey,
    completeIntent: () => {
      consumedSearch = intentKey
    },
    reportError: () => {
      throw new Error('successful import must not report an error')
    },
  }

  const firstImport = runRemoteDeepLinkImportLifecycle(inFlightImports, intentKey, lifecycle)
  const strictModeRemountImport = runRemoteDeepLinkImportLifecycle(inFlightImports, intentKey, lifecycle)
  if (firstImport !== strictModeRemountImport) {
    throw new Error('expected StrictMode remounts to share the exact in-flight import promise')
  }
  await Promise.resolve()
  if (importCalls !== 1 || !finishImport) {
    throw new Error(`expected one remote import, got ${importCalls}`)
  }
  finishImport()
  await firstImport
  if (commitCalls !== 1 || consumedSearch !== intentKey || inFlightImports.size !== 0) {
    throw new Error('expected successful remote import to consume its URL and release the in-flight lease')
  }

  let failedConsumeCalls = 0
  let reportedErrors = 0
  const failedImport = runRemoteDeepLinkImportLifecycle(inFlightImports, intentKey, {
    prepareDocument: async () => {
      throw new Error('unavailable')
    },
    commitDocument: async () => {
      throw new Error('failed preparation must not commit')
    },
    readCurrentIntentKey: () => intentKey,
    completeIntent: () => {
      failedConsumeCalls += 1
    },
    reportError: () => {
      reportedErrors += 1
    },
  })
  const failedStrictModeRemount = runRemoteDeepLinkImportLifecycle(inFlightImports, intentKey, {
    prepareDocument: async () => {
      throw new Error('duplicate import must not run')
    },
    commitDocument: async () => {
      throw new Error('duplicate import must not commit')
    },
    readCurrentIntentKey: () => intentKey,
    completeIntent: () => {
      failedConsumeCalls += 1
    },
    reportError: () => {
      reportedErrors += 1
    },
  })
  if (failedImport !== failedStrictModeRemount) {
    throw new Error('expected failed StrictMode remounts to share the active import')
  }
  await failedImport
  if (failedConsumeCalls !== 0 || reportedErrors !== 1 || inFlightImports.size !== 0) {
    throw new Error('expected a rejected remote import to retain its URL, report once, and release its in-flight lease')
  }
}
