import { readSourceFilesBootstrapSource } from './helpers/sourceFilesBootstrapSource'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { useGraphStore } from '@/hooks/useGraphStore'

export function testMarkdownApplyUsesDirectParserPathForActiveText() {
  const documentActionsPath = resolve(process.cwd(), 'src', 'hooks', 'store', 'graph-data-slice', 'graphDataDocumentActions.ts')
  const documentActionsText = readFileSync(documentActionsPath, 'utf8')

  if (!documentActionsText.includes("const exactSourceFile = state.sourceFiles.find(file => String(file?.name || '').trim() === nextName) || null")) {
    throw new Error('expected applyMarkdownDocumentToGraph to only sync matching source-file text by exact name without delegating graph apply')
  }
  if (documentActionsText.includes("await mod.parseAndApplySourceFile(exactSourceFile.id)")) {
    throw new Error('expected applyMarkdownDocumentToGraph to avoid source-file parse/apply indirection and parse active markdown text directly')
  }
  if (!documentActionsText.includes('loadGraphDataFromTextViaParser(nextName, nextText, { applyToStore: false, syncMarkdownDocument: false })')) {
    throw new Error('expected applyMarkdownDocumentToGraph to parse active markdown text without delegated store mutation side-effects')
  }
  if (!documentActionsText.includes('get().setGraphData(parsedGraph)')) {
    throw new Error('expected applyMarkdownDocumentToGraph to commit parsed graph data through the current store instance')
  }
  if (!documentActionsText.includes('const canReuseParsedSourceGraph = !!(') || !documentActionsText.includes('if (canReuseParsedSourceGraph) {')) {
    throw new Error('expected applyMarkdownDocumentToGraph to fast-path reuse of already-parsed matching source-file graph snapshots and avoid duplicate reparsing churn')
  }
  if (
    !documentActionsText.includes('String(exactSourceFile.text || \'\') === nextText') ||
    !documentActionsText.includes('canReuseParsedMarkdownSourceGraph({') ||
    !documentActionsText.includes('graphData: exactSourceFile.parsedGraphData as GraphData | null | undefined')
  ) {
    throw new Error('expected applyMarkdownDocumentToGraph parsed-graph reuse guard to require exact source-text match plus parser-aware graph availability')
  }
  if (!documentActionsText.includes('const reusedGraph = withMarkdownDocumentSourceMetadata(exactSourceFile.parsedGraphData as GraphData') || !documentActionsText.includes('get().setGraphData(reusedGraph)')) {
    throw new Error('expected applyMarkdownDocumentToGraph parsed-graph reuse path to commit the reused graph directly before parser fallback')
  }
  if (!documentActionsText.includes('const markdownApplyRequestQueue = new MarkdownApplyRequestQueue<PendingMarkdownApplyRequest>()')) {
    throw new Error('expected applyMarkdownDocumentToGraph to enforce a single in-flight markdown apply through the shared request queue')
  }
  if (
    !documentActionsText.includes('requireActiveMarkdownDocument: boolean') ||
    !documentActionsText.includes('function isMarkdownApplyRequestActiveDocumentCurrent') ||
    !documentActionsText.includes('state.markdownDocumentName === request.name && state.markdownDocumentText === request.text') ||
    !documentActionsText.includes('requireActiveMarkdownDocument: true')
  ) {
    throw new Error('expected Source Files document switches to guard async markdown graph commits by the currently active document content')
  }
  if (!documentActionsText.includes('if (markdownApplyRequestQueue.inFlight) {') || !documentActionsText.includes('markdownApplyRequestQueue.enqueueLatest(request, requestKey)')) {
    throw new Error('expected overlapping markdown apply requests to coalesce into latest queued request instead of running concurrently')
  }
  if (!documentActionsText.includes('while (currentRequest) {') || !documentActionsText.includes('const nextRequest = markdownApplyRequestQueue.takeQueued()')) {
    throw new Error('expected markdown apply execution to process only the latest queued request after the current in-flight apply finishes')
  }
}

export async function testMarkdownApplyActiveDocumentGuardRejectsStaleSourceSwitch() {
  const state = useGraphStore.getState()
  state.resetAll()
  state.setMarkdownDocument('docs/a.md', '# A\n\nAlpha')
  state.setMarkdownDocument('docs/b.md', '# B\n\nBeta')

  const ok = await state.applyMarkdownDocumentToGraph('docs/a.md', '# A\n\nAlpha', {
    force: true,
    requireActiveMarkdownDocument: true,
  })
  const after = useGraphStore.getState()
  if (ok) {
    throw new Error('expected stale guarded markdown graph apply to return false after Source Files selection changed')
  }
  if ((after.graphData?.nodes || []).length > 0 || (after.graphData?.edges || []).length > 0) {
    throw new Error('expected stale guarded markdown graph apply to leave Canvas graph unchanged')
  }
  if (after.markdownDocumentName !== 'docs/b.md' || after.markdownDocumentText !== '# B\n\nBeta') {
    throw new Error('expected stale guarded markdown graph apply to preserve the active Source Files document')
  }
}

export function testPassiveSameTextSourceSyncDoesNotDisableActiveFrontmatterSwitchPreset() {
  const state = useGraphStore.getState()
  state.resetAll()
  const text = [
    '---',
    'kgCanvasSurfaceMode: "2d"',
    'kgCanvasRenderMode: "2d"',
    'kgCanvas2dRenderer: "storyboard"',
    'kgDocumentSemanticMode: "document"',
    'kgFrontmatterModeEnabled: true',
    '---',
    '',
    '# Demo',
  ].join('\n')

  state.setMarkdownDocument('docs/frontmatter-demo.md', text, {
    autoEnableFrontmatter: true,
    applyViewPreset: true,
  })
  state.setMarkdownDocument('docs/frontmatter-demo.md', text, {
    autoEnableFrontmatter: false,
    applyViewPreset: false,
  })

  const after = useGraphStore.getState()
  if (after.markdownDocumentApplyViewPreset !== true) {
    throw new Error('expected passive same-text Source Files sync not to disable the active file-switch YAML/frontmatter view preset')
  }
  if (after.markdownDocumentName !== 'docs/frontmatter-demo.md' || after.markdownDocumentText !== text) {
    throw new Error('expected passive same-text Source Files sync to preserve the selected active markdown document')
  }
}

export function testWorkspaceCanvasAutoApplySkipsWidgetMode() {
  const interactionPath = resolve(process.cwd(), 'src', 'lib', 'markdown-workspace-runtime', 'useMarkdownWorkspaceInteractions.ts')
  const text = readFileSync(interactionPath, 'utf8')
  const anchor = "React.useEffect(() => {\n    if (!workspaceApplyEffectsEnabled || contentMode === 'widget') return"
  const idx = text.indexOf(anchor)
  if (idx < 0) {
    throw new Error('expected workspace canvas auto-apply effect in markdown workspace interaction runtime')
  }
  const body = text.slice(idx, idx + 500)
  if (!body.includes("contentMode === 'widget'")) {
    throw new Error('expected workspace canvas auto-apply effect to skip widget mode so reopen cannot apply widget bundle text as a full document')
  }
  if (!body.includes("const graphText = markdownDocumentName === name ? String(markdownDocumentText || '') : ''")) {
    throw new Error('expected workspace canvas auto-apply effect to compare against the current graph document text before reopening apply')
  }
  if (!body.includes('if (graphText === text) return')) {
    throw new Error('expected workspace canvas auto-apply effect to skip reapplying the same active document text when Editor Workspace opens')
  }
}

export function testWorkspaceRefreshSetSourceFilesImmediatelySchedulesComposeApply() {
  const runtimePath = resolve(process.cwd(), 'src', 'lib', 'markdown-workspace-runtime', 'useMarkdownWorkspaceExplorerState.tsx')
  const bootstrapPath = resolve(process.cwd(), 'src', 'features', 'source-files', 'SourceFilesPersistenceBootstrap.tsx')
  const text = readFileSync(runtimePath, 'utf8')
  const bootstrapText = readSourceFilesBootstrapSource(bootstrapPath)

  if (!text.includes('const scheduleApplyComposedFromSourceFiles = React.useCallback(async () => {')) {
    throw new Error('expected markdown workspace runtime refresh path to expose a dedicated composed-apply scheduler helper')
  }
  if (!text.includes("await import('@/features/source-files/applyComposedGraphFromSourceFiles')")) {
    throw new Error('expected markdown workspace runtime refresh path to lazy-load the canonical composed source-files apply module')
  }
  if (!text.includes('mod.scheduleApplyComposedGraphFromSourceFiles()')) {
    throw new Error('expected markdown workspace runtime refresh path to dispatch canonical scheduleApplyComposedGraphFromSourceFiles')
  }
  if (!bootstrapText.includes('scheduleApplyComposedGraphFromSourceFiles({ precomputedSignature: compositionSignature })')) {
    throw new Error('expected source-files persistence bootstrap to pass its precomputed composition signature into the scheduler instead of hashing the same snapshot twice')
  }

  if (!text.includes('if (merged !== store.sourceFiles) {')) {
    throw new Error('expected markdown workspace runtime refresh to skip no-op source-files writes when the merged workspace snapshot is unchanged')
  }
  if (!text.includes('setEntries(prev => (areWorkspaceEntriesEqual(prev, pruned) ? prev : pruned))')) {
    throw new Error('expected markdown workspace runtime refresh to skip no-op workspace entry state writes')
  }
  if (!text.includes('const pruned = pruneWorkspaceEntriesForInlineSnapshot(hydratedList)')) {
    throw new Error('expected markdown workspace runtime refresh to centralize oversized inline workspace-entry pruning in the shared runtime helper')
  }
  if (!text.includes('setSourcesByPath(prev => (areWorkspaceSourcesEqual(prev, sources) ? prev : sources))')) {
    throw new Error('expected markdown workspace runtime refresh to skip no-op source-index state writes')
  }
  if (!text.includes('return buildWorkspaceRefreshSnapshot({')) {
    throw new Error('expected markdown workspace runtime refresh to centralize fallback refresh snapshot construction in the shared runtime helper')
  }
  if (!text.includes('return buildFailedWorkspaceRefreshSnapshot()')) {
    throw new Error('expected markdown workspace runtime refresh failure path to reuse the shared failed refresh snapshot helper')
  }

  const setIdx = text.indexOf('store.setSourceFiles(merged)')
  const applyIdx = text.indexOf('await scheduleApplyComposedFromSourceFiles()')
  if (setIdx < 0 || applyIdx < 0 || applyIdx <= setIdx) {
    throw new Error('expected markdown workspace runtime refresh to schedule composed apply immediately after setSourceFiles so delete/refresh clears stale overlays without page reload')
  }
}

export function testWorkspaceImportActionsReuseRefreshSnapshotForApply() {
  const importPath = resolve(process.cwd(), 'src', 'features', 'markdown-workspace', 'useWorkspaceFileActions', 'importActions.ts')
  const text = readFileSync(importPath, 'utf8')

  if (!text.includes('const refreshed = await refresh()')) {
    throw new Error('expected workspace import actions to reuse the immediate refresh snapshot before applying imports to canvas')
  }
  if (!text.includes('workspaceEntries: refreshed.entries')) {
    throw new Error('expected workspace import actions to pass refreshed workspace entries into applyWorkspaceImportToCanvas')
  }
  if (!text.includes('sourcesByPath: refreshed.sourcesByPath')) {
    throw new Error('expected workspace import actions to pass refreshed source index into applyWorkspaceImportToCanvas')
  }
  if (!text.includes('runWorkspaceFsChangedBatch(() => {')) {
    throw new Error('expected workspace import actions to batch filesystem changes before manual refresh')
  }
  if (!text.includes('suppressNextWorkspaceFsChangedEvent()')) {
    throw new Error('expected workspace import actions to suppress the follow-up batched fs event when they already do a manual refresh')
  }
}

export function testWorkspaceImportFocusDoesNotDuplicateGraphApply() {
  const importPath = resolve(process.cwd(), 'src', 'features', 'markdown-workspace', 'useWorkspaceFileActions', 'importActions.ts')
  const fallbackPath = resolve(process.cwd(), 'src', 'features', 'toolbar', 'launchDropdownFallbacks.ts')
  const text = readFileSync(importPath, 'utf8')
  const fallbackText = readFileSync(fallbackPath, 'utf8')

  if (!text.includes("await focusAfterImport(createdPath, { applyToGraph, jsonSourceText, jobId })")) {
    throw new Error('expected local workspace import focus to reuse the shared graph-apply decision when activating the imported file')
  }
  if (!text.includes("await focusAfterImport(createdPath, { sourceUrl, jsonSourceText, applyToGraph, jobId })")) {
    throw new Error('expected URL workspace import focus to reuse the shared graph-apply decision when activating imported documents')
  }
  if (!fallbackText.includes('await focusFirstImportedWorkspaceFile({ fs, createdPaths: res.createdPaths, applyToGraph })')) {
    throw new Error('expected launch dropdown local import fallback to forward the shared graph-apply decision into imported-file activation')
  }
  if (!fallbackText.includes('opts: { applyToGraph }')) {
    throw new Error('expected launch dropdown URL import fallback to reuse the shared graph-apply decision before focusing the imported document')
  }
  if (fallbackText.includes('forceApplyToGraph: true')) {
    throw new Error('expected launch dropdown fallback focus to stop forcing duplicate graph apply after import')
  }
}

export function testWorkspaceManualRefreshActionsSuppressFollowUpFsEventRefresh() {
  const corePath = resolve(process.cwd(), 'src', 'features', 'markdown-workspace', 'useWorkspaceFileActions', 'core.ts')
  const mutationPath = resolve(process.cwd(), 'src', 'features', 'markdown-workspace', 'useWorkspaceFileActions', 'mutationActions.ts')
  const coreText = readFileSync(corePath, 'utf8')
  const mutationText = readFileSync(mutationPath, 'utf8')

  if (!coreText.includes('runWorkspaceFsChangedBatch(async () => {') || !coreText.includes('suppressNextWorkspaceFsChangedEvent()')) {
    throw new Error('expected create file/folder actions to batch filesystem changes and suppress duplicate follow-up fs refresh')
  }
  if (!mutationText.includes('await runWorkspaceFsChangedBatch(async () => {') || !mutationText.includes('suppressNextWorkspaceFsChangedEvent()')) {
    throw new Error('expected delete/rename actions to batch filesystem changes and suppress duplicate follow-up fs refresh')
  }
  // Progressive crawl refresh ownership is exercised by websiteImportProgress and websiteImportExplorerLifecycle.
}

export function testWorkspaceInlineTextOwnershipIsCentralized() {
  const helperPath = resolve(process.cwd(), 'src', 'features', 'workspace-fs', 'workspaceInlineText.ts')
  const runtimeIoPath = resolve(process.cwd(), 'src', 'lib', 'markdown-workspace-runtime', 'markdownWorkspaceRuntime.io.ts')
  const runtimeImplPath = resolve(process.cwd(), 'src', 'lib', 'markdown-workspace-runtime', 'useMarkdownWorkspaceBootstrapState.ts')
  const indexingPath = resolve(process.cwd(), 'src', 'lib', 'markdown-workspace-runtime', 'useMarkdownWorkspaceIndexing.tsx')
  const importApplyPath = resolve(process.cwd(), 'src', 'features', 'workspace-fs', 'applyWorkspaceImportToCanvas.ts')
  const helperText = readFileSync(helperPath, 'utf8')
  const runtimeIoText = readFileSync(runtimeIoPath, 'utf8')
  const runtimeImplText = readFileSync(runtimeImplPath, 'utf8')
  const indexingText = readFileSync(indexingPath, 'utf8')
  const importApplyText = readFileSync(importApplyPath, 'utf8')

  if (!helperText.includes('export function upsertWorkspaceEntryInlineText(args:')) {
    throw new Error('expected workspace inline-text ownership to centralize workspace-entry text patching in the shared workspace helper')
  }
  if (!helperText.includes('export function resolveWorkspaceSourceFileInlineText(')) {
    throw new Error('expected workspace inline-text ownership to centralize source-file inline text fallback in the shared workspace helper')
  }
  if (!runtimeImplText.includes('upsertWorkspaceEntryInlineText({')) {
    throw new Error('expected markdown workspace runtime entry patching to reuse the shared workspace inline-text helper')
  }
  if (!indexingText.includes('upsertWorkspaceEntryInlineText({')) {
    throw new Error('expected markdown workspace indexing to reuse the shared workspace inline-text helper for cached entry upserts')
  }
  if (!runtimeIoText.includes('resolveWorkspaceSourceFileInlineText(args.text)')) {
    throw new Error('expected markdown workspace runtime source-file writeback to reuse the shared workspace inline-text helper')
  }
  if (!importApplyText.includes('resolveWorkspaceSourceFileInlineText(text)')) {
    throw new Error('expected workspace import apply to reuse the shared workspace inline-text helper for source-file payload sizing')
  }
}

export function testWorkspaceWriteThroughAndActiveDocSyncOwnershipIsCentralized() {
  const runtimeIoPath = resolve(process.cwd(), 'src', 'lib', 'markdown-workspace-runtime', 'markdownWorkspaceRuntime.io.ts')
  const activeDocPath = resolve(process.cwd(), 'src', 'features', 'markdown', 'activeMarkdownDocument.ts')
  const importActionsPath = resolve(process.cwd(), 'src', 'features', 'markdown-workspace', 'useWorkspaceFileActions', 'importActions.ts')
  const mutationActionsPath = resolve(process.cwd(), 'src', 'features', 'markdown-workspace', 'useWorkspaceFileActions', 'mutationActions.ts')
  const selectionPath = resolve(process.cwd(), 'src', 'lib', 'markdown-workspace-runtime', 'useMarkdownWorkspaceSelection.ts')
  const indexingPath = resolve(process.cwd(), 'src', 'lib', 'markdown-workspace-runtime', 'useMarkdownWorkspaceIndexing.tsx')
  const savePath = resolve(process.cwd(), 'src', 'lib', 'markdown-workspace-runtime', 'useMarkdownWorkspaceSave.ts')
  const corePath = resolve(process.cwd(), 'src', 'features', 'markdown-workspace', 'useWorkspaceFileActions', 'core.ts')
  const importEffectsPath = resolve(process.cwd(), 'src', 'features', 'toolbar', 'importSideEffects.ts')
  const documentActionsPath = resolve(process.cwd(), 'src', 'hooks', 'store', 'graph-data-slice', 'graphDataDocumentActions.ts')

  const runtimeIoText = readFileSync(runtimeIoPath, 'utf8')
  const activeDocText = readFileSync(activeDocPath, 'utf8')
  const importActionsText = readFileSync(importActionsPath, 'utf8')
  const mutationActionsText = readFileSync(mutationActionsPath, 'utf8')
  const selectionText = readFileSync(selectionPath, 'utf8')
  const indexingText = readFileSync(indexingPath, 'utf8')
  const savePathText = readFileSync(savePath, 'utf8')
  const coreText = readFileSync(corePath, 'utf8')
  const importEffectsText = readFileSync(importEffectsPath, 'utf8')
  const documentActionsText = readFileSync(documentActionsPath, 'utf8')

  if (!runtimeIoText.includes('export const writeWorkspaceFileAndSync = async (args:')) {
    throw new Error('expected markdown workspace runtime IO to remain the shared write-through owner')
  }
  if (!runtimeIoText.includes('export const syncWorkspaceTextState = (args:')) {
    throw new Error('expected markdown workspace runtime IO to centralize in-memory workspace text sync ownership')
  }
  if (!importActionsText.includes('await writeWorkspaceFileAndSync({')) {
    throw new Error('expected workspace import actions to reuse the shared write-through owner after external content writes')
  }
  if (!mutationActionsText.includes('await writeWorkspaceFileAndSync({')) {
    throw new Error('expected workspace mutation actions to reuse the shared write-through owner after refresh and clear writes')
  }
  if (mutationActionsText.includes("await fs.writeFileText(p, '')")) {
    throw new Error('expected workspace mutation actions not to keep a raw batch clear write path outside the shared write-through owner')
  }
  if (!indexingText.includes('await writeWorkspaceFileAndSync({')) {
    throw new Error('expected markdown workspace indexing sanitize writes to reuse the shared write-through owner')
  }
  if (!indexingText.includes('const WORKSPACE_SWITCH_HEAVY_PARSE_MAX_CHARS = 240_000')) {
    throw new Error('expected markdown workspace indexing to keep a shared heavy-parse cap for workspace switch flows')
  }
  if (!indexingText.includes('if (shouldSkipHeavyWorkspaceSourceParsing) {')) {
    throw new Error('expected frontmatter-driven workspace landing apply to use the shared heavy-parse skip guard')
  }
  if (!indexingText.includes('const shouldSkipHeavyWorkspaceSourceParsing = nextText.length > WORKSPACE_SWITCH_HEAVY_PARSE_MAX_CHARS')) {
    throw new Error('expected workspace indexing parse path to bypass heavy source parsing for oversized workspace text regardless of entry family')
  }
  if (indexingText.includes('await fs.writeFileText(path, sanitized)')) {
    throw new Error('expected markdown workspace indexing not to keep a duplicate raw sanitize writeback path outside the shared write-through owner')
  }
  if (!activeDocText.includes('export function buildActiveMarkdownDocumentPayload(args:')) {
    throw new Error('expected active markdown document sync ownership to be centralized in a shared markdown helper')
  }
  if (!activeDocText.includes('export function applyActiveMarkdownDocumentPayload(args:')) {
    throw new Error('expected active markdown document apply ownership to be centralized in a shared markdown helper')
  }
  if (
    !documentActionsText.includes('function buildPendingMarkdownDocumentGraph(args:') ||
    !documentActionsText.includes("context === 'frontmatter-flow'") ||
    !documentActionsText.includes('canvasWorkspacePreset: buildCanvasWorkspacePresetMetadata(preset)')
  ) {
    throw new Error('expected markdown document actions to centralize pending markdown/frontmatter graph handoff in a shared helper')
  }
  if (!documentActionsText.includes('if (applyViewPresetForSwitch && didSwitchActiveDocument) {\n        get().setGraphData(buildPendingMarkdownDocumentGraph({')
    || !documentActionsText.includes('currentGraph: get().graphData,')) {
    throw new Error('expected markdown graph applies to publish a selected-document pending graph immediately so the previous scene cannot stay render-authoritative during async handoff')
  }
  if (!selectionText.includes('applyActiveMarkdownDocumentPayload({')) {
    throw new Error('expected markdown workspace selection restore paths to reuse the shared active markdown document helper')
  }
  if (!coreText.includes('syncWorkspaceTextState({')) {
    throw new Error('expected workspace import focus to reuse the shared workspace text-state sync helper')
  }
  if (!coreText.includes('readWidgetRegistryMetadataEntries(graphData?.metadata).length > 0')) {
    throw new Error('expected workspace file actions core to reuse the shared widget-registry metadata reader before switching into Storyboard Widget import mode')
  }
  if (coreText.includes('FLOW_WIDGET_REGISTRY_METADATA_KEY')) {
    throw new Error('expected workspace file actions core to stop parsing the widget registry metadata key inline')
  }
  if (!coreText.includes('const revealWorkspacePath = React.useCallback(')) {
    throw new Error('expected workspace file actions core to centralize path reveal/selection shell behind a shared helper')
  }
  if (!coreText.includes("await focusAfterImport(path, { applyToGraph: false })")) {
    throw new Error('expected createNewFile to reuse the canonical focus/open path instead of locally duplicating file-open state sync')
  }
  if (!coreText.includes('revealWorkspacePath(path, { activate: false })')) {
    throw new Error('expected createNewFolder to reuse the shared reveal shell instead of locally duplicating folder selection expansion state')
  }
  if (!mutationActionsText.includes('syncWorkspaceTextState({')) {
    throw new Error('expected workspace mutation actions to reuse the shared workspace text-state sync helper for rename remap refresh')
  }
  if (mutationActionsText.includes("lastLoadedRef.current = { path: last.path, text: '' }")) {
    throw new Error('expected workspace mutation actions not to keep a local non-active lastLoadedRef clear fallback once shared text-state sync owns tracked-path updates')
  }
  if (!runtimeIoText.includes('pushWorkspaceTextToActiveMarkdownDocument({')) {
    throw new Error('expected workspace text-state sync ownership to centralize active markdown document refresh through the shared push helper')
  }
  if (!runtimeIoText.includes('args.lastLoadedRef.current?.path === args.path')) {
    throw new Error('expected workspace text-state sync helper to keep tracked non-active path text coherent without a local mutation fallback')
  }
  if (!savePathText.includes('syncWorkspaceTextState({')) {
    throw new Error('expected workspace save-as flow to reuse the shared workspace text-state sync helper after file creation')
  }
  if (!importEffectsText.includes('buildActiveMarkdownDocumentPayload({') || !importEffectsText.includes('applyActiveMarkdownDocumentPayload({')) {
    throw new Error('expected toolbar import side effects to reuse the shared active markdown document payload helper')
  }
}

export function testSourceFilesDbPersistsOnlyChangedRows() {
  const dbPath = resolve(process.cwd(), 'src', 'features', 'source-files', 'sourceFilesDb.ts')
  const workspaceStatePath = resolve(process.cwd(), 'src', 'features', 'source-files', 'sourceFilesWorkspaceState.ts')
  const text = readFileSync(dbPath, 'utf8')
  const workspaceStateText = readFileSync(workspaceStatePath, 'utf8')

  if (!text.includes('const existingById = new Map(existing.map(doc => [String(doc.get(\'id\') || \'\'), doc]))')) {
    throw new Error('expected source files db persistence to index existing rows by id before deciding which rows actually changed')
  }
  if (
    !text.includes('existingOrderIndex === row.orderIndex &&') ||
    !text.includes('areSourceFileRecordsEqual(existingPayload, row.payload, { includeGraphData: false, includeGraphRevision: false })') ||
    !text.includes('areSourceFileSourcesEqual(existingPayload.source, row.payload.source)')
  ) {
    throw new Error('expected source files db persistence to skip incrementalUpsert for unchanged source-file rows')
  }
  if (!workspaceStateText.includes('export function areSourceFilesWorkspaceStatesEqual(')) {
    throw new Error('expected source files db persistence to centralize workspace-state equality checks in the shared workspace-state helper')
  }
  if (
    !text.includes('const payload = normalizeSourceFilesWorkspaceState(state)') ||
    !text.includes('if (areSourceFilesWorkspaceStatesEqual(existingPayload, payload)) return')
  ) {
    throw new Error('expected source files workspace persistence to skip writes when the normalized workspace snapshot is unchanged via the shared helper')
  }
}

export function testSourceFilesStorageSyncDocumentHashDoesNotSelfDependOnParsedTextHash() {
  const storageSyncPath = resolve(process.cwd(), 'src', 'features', 'source-files', 'sourceFilesStorageSync.ts')
  const inboundSyncPath = resolve(process.cwd(), 'src', 'features', 'source-files', 'sourceFilesInboundStorageApply.ts')
  const text = readFileSync(storageSyncPath, 'utf8')
  const inboundText = readFileSync(inboundSyncPath, 'utf8')
  const hashFnStart = text.indexOf('const buildSourceFileDocumentHash = (file: SourceFile): string =>')
  if (hashFnStart < 0) {
    throw new Error('expected source-files storage sync to centralize document hash construction in a dedicated helper')
  }
  const hashFnEnd = text.indexOf('const buildSourceFileGraphHash = (file: SourceFile): string =>', hashFnStart)
  const hashFnSection = hashFnEnd > hashFnStart ? text.slice(hashFnStart, hashFnEnd) : text.slice(hashFnStart)
  if (hashFnSection.includes('normalizeString(file.parsedTextHash)')) {
    throw new Error('expected source-files storage document hash to avoid parsedTextHash self-dependency that causes sync hash cascades')
  }
  if (hashFnSection.includes('file.enabled')) {
    throw new Error('expected source-files storage document hash to stay content-anchored and avoid enabled-flag selection churn')
  }
  if (!hashFnSection.includes('hashAgenticGraphStorageContent(file.text)')) {
    throw new Error('expected source-files storage document hash to use the shared canonical content hash')
  }
  const graphHashFnStart = text.indexOf('const buildSourceFileGraphHash = (file: SourceFile): string =>')
  if (graphHashFnStart < 0) {
    throw new Error('expected source-files storage sync to centralize graph snapshot hash construction in a dedicated helper')
  }
  if (!text.includes('const sourceFileGraphDataHashCache = new WeakMap<object, string>()')) {
    throw new Error('expected source-files storage sync to cache graph payload semantic hashes and avoid repeated full JSON serialization churn')
  }
  if (!text.includes('const readSourceFileGraphDataSemanticHash = (value: unknown): string =>')) {
    throw new Error('expected source-files storage sync to centralize cached graph payload semantic hashing in a helper')
  }
  const graphHashFnEnd = text.indexOf('export const buildAgenticGraphWorkspaceIdFromSourceFilesWorkspaceState = (', graphHashFnStart)
  const graphHashSection = graphHashFnEnd > graphHashFnStart ? text.slice(graphHashFnStart, graphHashFnEnd) : text.slice(graphHashFnStart)
  if (graphHashSection.includes('normalizeString(file.parsedTextHash)')) {
    throw new Error('expected source-files storage graph hash to avoid parsedTextHash-dependent feedback churn across sync boundaries')
  }
  if (graphHashSection.includes('JSON.stringify(file.parsedGraphData || {})')) {
    throw new Error('expected source-files storage graph hash to avoid repeated direct JSON stringify of graph payloads in sync hot paths')
  }
  if (!graphHashSection.includes('readSourceFileGraphDataSemanticHash(file.parsedGraphData)')) {
    throw new Error('expected source-files storage graph hash to reuse cached graph payload semantic hash helper')
  }
  const didGraphChangeStart = text.indexOf('const didGraphChange =')
  const didGraphChangeEnd = text.indexOf('if (didGraphChange) {', didGraphChangeStart)
  const didGraphChangeSection = didGraphChangeEnd > didGraphChangeStart ? text.slice(didGraphChangeStart, didGraphChangeEnd) : ''
  if (didGraphChangeSection.includes('existingGraphSnapshot.graphRevision')) {
    throw new Error('expected source-files storage graph sync diffing to avoid graphRevision-only churn and rely on semantic hash and document linkage')
  }
  if (inboundText.includes('parsedTextHash: normalizeString(document.contentHash)')) {
    throw new Error('expected inbound storage apply not to overwrite parsedTextHash from document content hash')
  }
  if (!inboundText.includes('parsedTextHash: existing?.parsedTextHash')) {
    throw new Error('expected inbound storage apply to preserve local parsedTextHash ownership')
  }
  if (inboundText.includes('scheduleApplyComposedGraphFromSourceFiles({ includeWorkspaceBacked: true })')) {
    throw new Error('expected inbound storage apply to avoid explicit workspace-backed composed graph scheduling during passive sync')
  }
  if (!inboundText.includes('scheduleApplyGraphOwnerComposedGraphFromSourceFiles()')) {
    throw new Error('expected inbound storage apply to reuse the canonical graph-owner composed graph scheduler')
  }
}

export function testMarkdownDocumentSettersStayDecoupledFromWorkspaceViewMode() {
  const graphSlicePath = resolve(process.cwd(), 'src', 'hooks', 'store', 'graphDataSlice.ts')
  const ingestPath = resolve(process.cwd(), 'src', 'features', 'source-files', 'sourceFilesParseRuntime.ts')
  const importEffectsPath = resolve(process.cwd(), 'src', 'features', 'toolbar', 'importSideEffects.ts')
  const youtubePath = resolve(process.cwd(), 'src', 'features', 'toolbar', 'youtubeImportAction.ts')
  const fallbackPath = resolve(process.cwd(), 'src', 'features', 'toolbar', 'launchDropdownFallbacks.ts')
  const graphSliceText = readFileSync(graphSlicePath, 'utf8')
  const ingestText = readFileSync(ingestPath, 'utf8')
  const importEffectsText = readFileSync(importEffectsPath, 'utf8')
  const youtubeText = readFileSync(youtubePath, 'utf8')
  const fallbackText = readFileSync(fallbackPath, 'utf8')

  if (graphSliceText.includes('workspaceViewMode?: GraphState[\'workspaceViewMode\'] | null')) {
    throw new Error('expected setActiveMarkdownDocument to stop accepting workspace view mode as an implicit UI side effect')
  }
  if (graphSliceText.includes('get().setWorkspaceViewMode(viewMode)')) {
    throw new Error('expected setActiveMarkdownDocument to stop mutating workspace view mode directly')
  }
  if (!importEffectsText.includes('openMarkdownWorkspaceEditorPane(state)')) {
    throw new Error('expected toolbar markdown imports to own explicit workspace mode changes at the caller')
  }
  if (!ingestText.includes('openMarkdownWorkspaceEditorPane(store)')) {
    throw new Error('expected source-file ingest to open editor mode explicitly instead of routing through the markdown document setter')
  }
  if (!youtubeText.includes("state.setWorkspaceViewMode('editor')")) {
    throw new Error('expected youtube import to open editor mode explicitly before updating markdown document state')
  }
  if (fallbackText.includes('workspaceViewMode,')) {
    throw new Error('expected launch dropdown fallback imports to stop threading workspace view mode through setActiveMarkdownDocument')
  }
}
