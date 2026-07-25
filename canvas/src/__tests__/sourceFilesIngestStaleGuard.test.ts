import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { useGraphStore } from '@/hooks/useGraphStore'

export function testSourceFilesIngestUsesParseJobGuardForStaleAsyncResults() {
  const p = resolve(process.cwd(), 'src', 'features', 'source-files', 'sourceFilesParseRuntime.ts')
  const text = readFileSync(p, 'utf8')
  const hashPath = resolve(process.cwd(), 'src', 'features', 'source-files', 'sourceFileParseIdentity.ts')
  const hashText = readFileSync(hashPath, 'utf8')
  if (!text.includes('parseJobBySourceFileId')) {
    throw new Error('expected source file ingest parse path to keep per-file parse job tokens')
  }
  if (!text.includes("parseJobBySourceFileId.get(fileId) !== parseJobToken")) {
    throw new Error('expected stale parse jobs to be dropped before state writeback')
  }
  if (!text.includes('buildSourceFileParseIdentityHash({')) {
    throw new Error('expected source file ingest parse path to centralize parse identity hashing')
  }
  if (!text.includes("cacheNamespace: `source-file:${fileId}`")) {
    throw new Error('expected source file ingest parse identity to stay scoped per source file')
  }
  if (!text.includes("name: String(latest.name || '')")) {
    throw new Error('expected parse writeback identity to include latest source file name')
  }
  if (!/SOURCE_FILE_PARSE_SEMANTICS_VERSION\s*=\s*[1-9]\d*\s+as const/.test(hashText)) {
    throw new Error('expected source file parse identity to carry an explicit semantics version for startup invalidation')
  }
  if (!hashText.includes('buildScopedGraphSemanticKey')) {
    throw new Error('expected source file parse identity to use the shared scoped semantic-key helper')
  }
  if (!hashText.includes("hashStringToHexSharedContentCached(text, `source-file-parse-text:v${SOURCE_FILE_PARSE_SEMANTICS_VERSION}`)")) {
    throw new Error('expected source file parse identity to hash large source text separately instead of embedding it in semantic-key parts')
  }
}

export function testSourceFilesIngestDedupesPendingParsesForSameTextHash() {
  const p = resolve(process.cwd(), 'src', 'features', 'source-files', 'sourceFilesParseRuntime.ts')
  const text = readFileSync(p, 'utf8')
  if (!text.includes('pendingParseTextHashBySourceFileId')) {
    throw new Error('expected source file ingest parse path to track pending text hashes per file')
  }
  if (!text.includes("before.status === 'loading' && pendingParseTextHashBySourceFileId.get(fileId) === textHash")) {
    throw new Error('expected source file ingest parse path to skip duplicate parses for the same pending text')
  }
  if (!text.includes('pendingParseTextHashBySourceFileId.set(fileId, textHash)')) {
    throw new Error('expected source file ingest parse path to record the active pending text hash')
  }
  if (!text.includes('pendingParseTextHashBySourceFileId.delete(fileId)')) {
    throw new Error('expected source file ingest parse path to clear pending text hashes after completion')
  }
}

export function testSourceFilesIngestHydratesPendingUrlSourcesOnBootstrap() {
  const ingestPath = resolve(process.cwd(), 'src', 'features', 'source-files', 'sourceFilesIngestIntegration.ts')
  const bootstrapPath = resolve(process.cwd(), 'src', 'features', 'source-files', 'SourceFilesPersistenceBootstrap.tsx')
  const bootstrapStartupPath = resolve(process.cwd(), 'src', 'features', 'source-files', 'sourceFilesBootstrapStartup.ts')
  const ingestText = readFileSync(ingestPath, 'utf8')
  const bootstrapText = readFileSync(bootstrapPath, 'utf8')
  const bootstrapStartupText = readFileSync(bootstrapStartupPath, 'utf8')

  if (!ingestText.includes('export async function hydratePendingUrlSourceFiles(): Promise<void>')) {
    throw new Error('expected source file ingest integration to expose bootstrap hydration for pending url sources')
  }
  if (!ingestText.includes("if (!source || source.kind !== 'url') return false")) {
    throw new Error('expected pending url hydration to gate on canonical url sources only')
  }
  if (!ingestText.includes("if (String(file.text || '').trim()) return false")) {
    throw new Error('expected pending url hydration to skip already-hydrated source file text')
  }
  if (!ingestText.includes("await importUrlIntoActive({ fileId: file.id, url, format: 'markdown' })")) {
    throw new Error('expected pending url hydration to reuse upstream url import flow')
  }
  if (!bootstrapText.includes('runBootstrapSourceFileHydration')) {
    throw new Error('expected source files bootstrap to delegate startup ingest hydration through the shared bootstrap startup helper')
  }
  if (!bootstrapStartupText.includes('await hydratePendingUrlSourceFiles()')) {
    throw new Error('expected shared bootstrap startup helper to hydrate pending url sources before composing graph data')
  }
}

export function testSourceFilesIngestTreatsMarkdownLikeUrlsAsDirectTextImports() {
  const ingestPath = resolve(process.cwd(), 'src', 'features', 'source-files', 'sourceFilesIngestIntegration.ts')
  const ingestText = readFileSync(ingestPath, 'utf8')

  if (!ingestText.includes('|md|markdown|mdx|svg')) {
    throw new Error('expected source file url ingest classification to keep markdown-like urls on the direct text import path')
  }
  if (!ingestText.includes('if (isSameOriginCodebaseFileUrl(normalizedUrl)) {')) {
    throw new Error('expected source file url ingest to branch same-origin __codebase_file markdown imports onto the direct local fetch path')
  }
  if (!ingestText.includes('const direct = await fetchSameOriginCodebaseFileText(normalizedUrl)')) {
    throw new Error('expected source file url ingest to fetch same-origin __codebase_file markdown urls without remote fetch proxy fallback')
  }
  if (!ingestText.includes('preferProxy: !isGrabMapsProxyRequest')) {
    throw new Error('expected non-local url ingest to continue using proxy-preferred remote fetch fallback')
  }
}

export function testCanvasStartupRuntimesMountsSourceFilesBootstrapEagerly() {
  const startupPath = resolve(process.cwd(), 'src', 'features', 'canvas', 'CanvasStartupRuntimes.tsx')
  const startupDebugPath = resolve(process.cwd(), 'src', 'features', 'canvas', 'CanvasStartupDebugRuntime.tsx')
  const startupSsotBridgePath = resolve(process.cwd(), 'src', 'features', 'canvas', 'CanvasStartupSsotBridgeRuntime.tsx')
  const text = readFileSync(startupPath, 'utf8')
  const debugText = readFileSync(startupDebugPath, 'utf8')
  const ssotBridgeText = readFileSync(startupSsotBridgePath, 'utf8')

  if (!text.includes("import { SourceFilesPersistenceBootstrap } from '@/features/source-files/SourceFilesPersistenceBootstrap'")) {
    throw new Error('expected canvas startup runtimes to import SourceFilesPersistenceBootstrap eagerly at module scope')
  }
  if (!text.includes('<SourceFilesPersistenceBootstrap />')) {
    throw new Error('expected canvas startup runtimes to mount SourceFilesPersistenceBootstrap outside the deferred idle loader path')
  }
  if (!text.includes('useSourceFilesBootstrapHasReachedReady')) {
    throw new Error('expected run-ready lifecycle owners to remain mounted across later Source Files document intents')
  }
  if (text.includes('useSourceFilesBootstrapReady')) {
    throw new Error('expected transient Source Files document intent readiness to stop unmounting run-ready lifecycle owners')
  }
  if (!text.includes('<CanvasStartupDebugRuntime />')) {
    throw new Error('expected canvas startup runtimes to delegate startup debug flag ownership through the dedicated debug runtime')
  }
  if (!text.includes('<CanvasStartupSsotBridgeRuntime />')) {
    throw new Error('expected canvas startup runtimes to delegate SSOT bridge idle wiring through the dedicated startup bridge runtime')
  }
  if (text.includes("import('@/features/source-files/SourceFilesPersistenceBootstrap')")) {
    throw new Error('expected canvas startup runtimes to stop deferring SourceFilesPersistenceBootstrap behind idle startup scheduling')
  }
  if (!ssotBridgeText.includes("import('@/features/ssot/SsotEventBridge')")) {
    throw new Error('expected non-critical startup runtime lazy loading to continue for the SSOT bridge')
  }
  if (!debugText.includes('__canvasStartupDebug.runtimeMounted = true')) {
    throw new Error('expected CanvasStartupDebugRuntime to own startup runtime debug flag writes after the split')
  }
}

export function testSourceFilesBootstrapIgnoresPersistedWorkspaceBackedSourceFiles() {
  const bootstrapPath = resolve(process.cwd(), 'src', 'features', 'source-files', 'SourceFilesPersistenceBootstrap.tsx')
  const text = readFileSync(bootstrapPath, 'utf8')

  if (!text.includes('function stripPersistedWorkspaceBackedSourceFiles')) {
    throw new Error('expected source files bootstrap to centralize persisted workspace-backed source-file filtering')
  }
  if (!text.includes("return !sourcePath.startsWith('workspace:')")) {
    throw new Error('expected source files bootstrap to reject persisted workspace-backed source files at startup')
  }
  if (!text.includes('const persisted = stripPersistedWorkspaceBackedSourceFiles(persistedRaw)')) {
    throw new Error('expected source files bootstrap hydration to filter persisted source files before restoring startup state')
  }
}

export function testSourceFilesSliceStartsEmptyAndDefersWorkspaceSeedsToBootstrap() {
  const slicePath = resolve(process.cwd(), 'src', 'hooks', 'store', 'sourceFilesSlice.ts')
  const text = readFileSync(slicePath, 'utf8')

  if (!text.includes('sourceFiles: [],')) {
    throw new Error('expected sourceFiles store slice to start empty so workspace-backed source files are owned by bootstrap/workspace FS SSOT')
  }
  if (text.includes('WORKSPACE_README_SOURCE_FILE') || text.includes('TEST_VALIDATION_SOURCE_FILE')) {
    throw new Error('expected sourceFiles store slice to stop hard-seeding canonical workspace source files locally')
  }
}

export function testSourceFilesBootstrapResyncsOnlyOnActivePathChanges() {
  const bootstrapPath = resolve(process.cwd(), 'src', 'features', 'source-files', 'SourceFilesPersistenceBootstrap.tsx')
  const text = readFileSync(bootstrapPath, 'utf8')

  if (!(text.includes('useMarkdownExplorerStore.subscribe(') && text.includes('lastObservedActivePath'))) {
    throw new Error('expected source files bootstrap to continue resyncing on active path changes')
  }
  if (text.includes('s => s.activePath && syncNow()')) {
    throw new Error('expected source files bootstrap active-path subscription to avoid selector-side effects that cause churn and stale rematerialization')
  }
  if (text.includes('useGraphStore.subscribe(s => s.workspaceViewMode')) {
    throw new Error('expected source files bootstrap to stop rematerializing active workspace files just because workspace view mode flipped')
  }
  if (!text.includes('const lastMaterializedActivePathRef = React.useRef')) {
    throw new Error('expected source files bootstrap to dedupe redundant materialization by active workspace path')
  }
  if (!text.includes('if (!workspaceHydratedRef.current) return')) {
    throw new Error('expected source files bootstrap to gate active-path rematerialization until workspace bootstrap hydration completes')
  }
  if (
    !text.includes('const activePathKey = buildMaterializedWorkspaceActivePathKey({') ||
    !text.includes('workspaceEntriesSnapshot,') ||
    !text.includes('markdownDocumentName: store.markdownDocumentName') ||
    !text.includes('if (lastMaterializedActivePathRef.current === activePathKey) return')
  ) {
    throw new Error('expected source files bootstrap to skip repeated workspace-view materialization when selected content and active document ownership are unchanged')
  }
  if (text.includes('graphDataSource: typeof store.graphData?.metadata?.source ===')) {
    throw new Error('expected source files bootstrap active-path materialization key to avoid graph-source churn after selected document apply')
  }
  if (text.includes('}\n    syncNow()\n    const unsubscribeActivePath')) {
    throw new Error('expected source files bootstrap to avoid an eager duplicate mount resync before startup bootstrap completes')
  }
}

export function testSourceFilesBootstrapResyncsOnWorkspaceFsSeedChanges() {
  const bootstrapPath = resolve(process.cwd(), 'src', 'features', 'source-files', 'SourceFilesPersistenceBootstrap.tsx')
  const text = readFileSync(bootstrapPath, 'utf8')
  if (!text.includes("import { subscribeWorkspaceFsChanged } from '@/features/workspace-fs/workspaceFsEvents'")) {
    throw new Error('expected source files bootstrap to subscribe to workspace-fs change events for seed-driven source-file rematerialization')
  }
  if (!text.includes("import { getWorkspaceFs } from '@/features/workspace-fs/workspaceFs'")) {
    throw new Error('expected source files bootstrap to resolve workspace fs directly for periodic ensureSeed sync')
  }
  if (!text.includes('const readReusableWorkspaceFs = React.useCallback(async () => {')) {
    throw new Error('expected source files bootstrap to centralize cached workspace-fs reuse behind a dedicated helper for seed sync and rematerialization hot paths')
  }
  if (!text.includes("const op = String(detail?.op || '')") || !text.includes("if (op !== 'ensureSeed' && op !== 'batch' && op !== 'writeFileText' && op !== 'createFile' && op !== 'deleteEntry') {")) {
    throw new Error('expected source files bootstrap to rematerialize workspace-backed source files only for canonical workspace-fs mutation operations through the dedicated mutation request resolver')
  }
  if (!text.includes("const activePath = request.activePathRequest?.activePath || ''") || !text.includes("if ((request.op === 'writeFileText' || request.op === 'batch') && !!request.changedPath && !!activePath && request.changedPath === activePath) {")) {
    throw new Error('expected source files bootstrap workspace-fs handler to skip active-file write/batch self-echo rematerialization loops through the dedicated mutation handler')
  }
  if (
    !text.includes('activePathRequest: args?.activePathRequest === undefined') ||
    !text.includes('resolveActivePathMaterializationRequest({')
  ) {
    throw new Error('expected source files bootstrap workspace-fs request resolution to reuse the dedicated active-path request resolver and retain request-owned active-path context before active write echo suppression')
  }
  if (!text.includes('await materializeActiveWorkspaceEntryIntoSourceFiles()')) {
    if (!text.includes('await materializeActiveWorkspaceEntryIntoSourceFiles({')) {
      throw new Error('expected source files bootstrap workspace-fs event handler to rematerialize source files through the shared upstream materialization path')
    }
  }
  if (!text.includes('await fs.ensureSeed()')) {
    throw new Error('expected source files bootstrap to periodically call ensureSeed for dynamic external docs seed reflection')
  }
  if (text.includes('const workspaceEntries = await fs.listEntries()')) throw new Error('expected source files bootstrap workspace-fs event handler to avoid direct listEntries calls during Source Files sync')
  if (!text.includes('const workspaceEntries = await readWorkspaceActiveEntrySnapshot({')) throw new Error('expected source files bootstrap workspace-fs event handler to refresh only the active workspace entry snapshot for Source Files sync')
  if (!text.includes('buildActiveWorkspaceRuntimeSourceFilesSnapshot({')) {
    throw new Error('expected source files bootstrap workspace-fs event handler to centralize active runtime source-files shaping through the shared helper before rematerialization')
  }
}

export function testSourceFilesBootstrapSchedulesComposeOnlyForCompositionSignatureChanges() {
  const bootstrapPath = resolve(process.cwd(), 'src', 'features', 'source-files', 'SourceFilesPersistenceBootstrap.tsx')
  const helperPath = resolve(process.cwd(), 'src', 'features', 'source-files', 'sourceFilesSignatures.ts')
  const bootstrapText = readFileSync(bootstrapPath, 'utf8')
  const helperText = readFileSync(helperPath, 'utf8')

  if (!helperText.includes('export const buildSourceFilesCompositionSignature =')) {
    throw new Error('expected source files signature helper to export buildSourceFilesCompositionSignature')
  }
  if (!helperText.includes("return hashSignatureParts([\n    'source-files-compose',")) {
    throw new Error('expected source files composition signature helper to use shared semantic signature hashing')
  }
  if (!bootstrapText.includes('const lastComposeSignatureRef = React.useRef')) {
    throw new Error('expected source files bootstrap to track the last composed-graph semantic signature')
  }
  if (!bootstrapText.includes('const compositionSignature = buildSourceFilesCompositionSignature(next)')) {
    throw new Error('expected source files bootstrap to derive a semantic composition signature from sourceFiles updates')
  }
  if (!bootstrapText.includes('if (compositionSignature !== lastComposeSignatureRef.current) {')) {
    throw new Error('expected source files bootstrap to suppress composed-graph scheduling when the composition signature is unchanged')
  }
  if (!bootstrapText.includes('areSourceFilesEqualByIdAndHash') || !bootstrapText.includes('buildSourceFilesPersistenceSignature(next)')) {
    throw new Error('expected source files bootstrap persistence path to reuse shared equality and persistence-signature helpers')
  }
  if (!helperText.includes('hashStringToHexCached(cacheKey, text)')) {
    throw new Error('expected source files persistence hashing to reuse the shared bounded text-hash cache in the source-files signature helper')
  }
}

export function testWorkspaceImportParseIdentityUsesSemanticsVersionAndName() {
  const importPath = resolve(process.cwd(), 'src', 'features', 'workspace-fs', 'applyWorkspaceImportToCanvas.ts')
  const text = readFileSync(importPath, 'utf8')

  if (!text.includes('buildSourceFileParseIdentityHash({')) {
    throw new Error('expected workspace import parse path to reuse shared source-file parse identity hashing')
  }
  if (!text.includes('cacheNamespace: `workspace-import:${path}`')) {
    throw new Error('expected workspace import parse identity to stay scoped by workspace path')
  }
  if (!text.includes('name: workspaceDocumentKey(path)')) {
    throw new Error('expected workspace import parse identity to include workspace document name')
  }
}

export function testParsedGraphStateOwnershipIsCentralized() {
  const helperPath = resolve(process.cwd(), 'src', 'features', 'source-files', 'sourceFileParsedState.ts')
  const revisionHelperPath = resolve(process.cwd(), 'src', 'features', 'source-files', 'sourceFileParsedGraphRevision.ts')
  const ingestPath = resolve(process.cwd(), 'src', 'features', 'source-files', 'sourceFilesIngestIntegration.ts')
  const importPath = resolve(process.cwd(), 'src', 'features', 'workspace-fs', 'applyWorkspaceImportToCanvas.ts')
  const indexingPath = resolve(process.cwd(), 'src', 'lib', 'markdown-workspace-runtime', 'useMarkdownWorkspaceIndexing.tsx')
  const markdownApplyPath = resolve(process.cwd(), 'src', 'features', 'markdown-workspace', 'hooks', 'useMarkdownApply.ts')
  const runtimeIoPath = resolve(process.cwd(), 'src', 'lib', 'markdown-workspace-runtime', 'markdownWorkspaceRuntime.io.ts')
  const documentActionsPath = resolve(process.cwd(), 'src', 'hooks', 'store', 'graph-data-slice', 'graphDataDocumentActions.ts')
  const markdownImportPath = resolve(process.cwd(), 'src', 'features', 'toolbar', 'markdownImportAction.ts')
  const workspaceSeedsPath = resolve(process.cwd(), 'src', 'features', 'source-files', 'workspaceSeedSourceFiles.ts')
  const sourceFilesSlicePath = resolve(process.cwd(), 'src', 'hooks', 'store', 'sourceFilesSlice.ts')
  const workspaceSyncPath = resolve(process.cwd(), 'src', 'features', 'workspace-fs', 'syncToSourceFiles.ts')
  const localMarkdownFolderPath = resolve(process.cwd(), 'src', 'features', 'source-files', 'localMarkdownFolder.ts')
  const composedSourcePath = resolve(process.cwd(), 'src', 'hooks', 'store', 'graph-data-slice', 'graphDataComposedSource.ts')
  const nodeActionsPath = resolve(process.cwd(), 'src', 'hooks', 'store', 'graph-data-slice', 'graphDataNodeActions.ts')
  const edgeActionsPath = resolve(process.cwd(), 'src', 'hooks', 'store', 'graph-data-slice', 'graphDataEdgeActions.ts')
  const signaturesPath = resolve(process.cwd(), 'src', 'features', 'source-files', 'sourceFilesSignatures.ts')
  const syncToSourceFilesPath = resolve(process.cwd(), 'src', 'features', 'workspace-fs', 'syncToSourceFiles.ts')
  const sourceFilesDbPath = resolve(process.cwd(), 'src', 'features', 'source-files', 'sourceFilesDb.ts')
  const workspaceStatePath = resolve(process.cwd(), 'src', 'features', 'source-files', 'sourceFilesWorkspaceState.ts')
  const bootstrapPath = resolve(process.cwd(), 'src', 'features', 'source-files', 'SourceFilesPersistenceBootstrap.tsx')

  const helperText = readFileSync(helperPath, 'utf8')
  const revisionHelperText = readFileSync(revisionHelperPath, 'utf8')
  const ingestText = readFileSync(ingestPath, 'utf8')
  const importText = readFileSync(importPath, 'utf8')
  const indexingText = readFileSync(indexingPath, 'utf8')
  const markdownApplyText = readFileSync(markdownApplyPath, 'utf8')
  const runtimeIoText = readFileSync(runtimeIoPath, 'utf8')
  const documentActionsText = readFileSync(documentActionsPath, 'utf8')
  const markdownImportText = readFileSync(markdownImportPath, 'utf8')
  const workspaceSeedsText = readFileSync(workspaceSeedsPath, 'utf8')
  const sourceFilesSliceText = readFileSync(sourceFilesSlicePath, 'utf8')
  const workspaceSyncText = readFileSync(workspaceSyncPath, 'utf8')
  const localMarkdownFolderText = readFileSync(localMarkdownFolderPath, 'utf8')
  const composedSourceText = readFileSync(composedSourcePath, 'utf8')
  const nodeActionsText = readFileSync(nodeActionsPath, 'utf8')
  const edgeActionsText = readFileSync(edgeActionsPath, 'utf8')
  const signaturesText = readFileSync(signaturesPath, 'utf8')
  const syncToSourceFilesText = readFileSync(syncToSourceFilesPath, 'utf8')
  const sourceFilesDbText = readFileSync(sourceFilesDbPath, 'utf8')
  const workspaceStateText = readFileSync(workspaceStatePath, 'utf8')
  const bootstrapText = readFileSync(bootstrapPath, 'utf8')

  if (!helperText.includes('export function buildSourceFileParsedState(args:')) {
    throw new Error('expected parsed source-file state ownership to be centralized in a shared source-files helper')
  }
  if (!helperText.includes('export function buildSourceFileLifecycleState(args:')) {
    throw new Error('expected source-file lifecycle state ownership to be centralized in a shared source-files helper')
  }
  if (!helperText.includes('export function buildSourceFileRecord(args:')) {
    throw new Error('expected source-file record creation defaults to be centralized in a shared source-files helper')
  }
  if (!helperText.includes('export function normalizeSourceFileRecord(value:')) {
    throw new Error('expected source-file record normalization to be centralized in a shared source-files helper')
  }
  if (!helperText.includes('export function normalizeSourceFiles(value:')) {
    throw new Error('expected source-file array normalization to be centralized in a shared source-files helper')
  }
  if (!helperText.includes('export function areSourceFileRecordsEqual(')) {
    throw new Error('expected source-file record equality to be centralized in a shared source-files helper')
  }
  if (!helperText.includes('export function readPersistedSourceFileRecord(')) {
    throw new Error('expected source-file persistence projection to be centralized in a shared source-files helper')
  }
  if (!helperText.includes('export function buildUpdatedSourceFileParsedGraphState(args:')) {
    throw new Error('expected parsed source-file state helper to expose a shared graph-update snapshot path')
  }
  if (!revisionHelperText.includes('export function incrementParsedGraphRevision(value: unknown): number')) {
    throw new Error('expected parsed graph revision helper to remain the SSOT for revision bump semantics under the parsed-state helper')
  }
  if (!ingestText.includes('buildSourceFileLifecycleState(')) {
    throw new Error('expected source file ingest to reuse the shared lifecycle state helper so parsed-state snapshots stay owned upstream')
  }
  if (!importText.includes('buildSourceFileLifecycleState(')) {
    throw new Error('expected workspace import parsing to reuse the shared lifecycle state helper so parsed-state snapshots stay owned upstream')
  }
  if (!indexingText.includes('buildSourceFileLifecycleState(')) {
    throw new Error('expected workspace indexing to reuse the shared lifecycle state helper so parsed-state snapshots stay owned upstream')
  }
  if (!markdownApplyText.includes('buildSourceFileLifecycleState(')) {
    throw new Error('expected markdown apply parse path to reuse the shared lifecycle state helper so parsed-state snapshots stay owned upstream')
  }
  if (!runtimeIoText.includes('buildSourceFileLifecycleState(')) {
    throw new Error('expected workspace runtime source-file reset paths to reuse the shared lifecycle state helper so parsed-state snapshots stay owned upstream')
  }
  if (!documentActionsText.includes('buildSourceFileLifecycleState(')) {
    throw new Error('expected graph document markdown apply handoff to reuse the shared lifecycle state helper for transient idle resets')
  }
  if (!ingestText.includes('buildSourceFileRecord(')) {
    throw new Error('expected source file ingest new-file creation to reuse the shared source-file record builder')
  }
  if (!indexingText.includes('buildSourceFileRecord(')) {
    throw new Error('expected workspace indexing source-file creation to reuse the shared source-file record builder')
  }
  if (!markdownImportText.includes('buildSourceFileRecord(')) {
    throw new Error('expected markdown import source-file creation to reuse the shared source-file record builder')
  }
  if (!workspaceSeedsText.includes('buildSourceFileRecord(')) {
    throw new Error('expected workspace seed source-file creation to reuse the shared source-file record builder')
  }
  if (!workspaceSyncText.includes('buildSourceFileRecord(')) {
    throw new Error('expected workspace source-file merge path to reuse the shared source-file record builder')
  }
  if (!workspaceSyncText.includes('areSourceFileRecordsEqual(prev, candidate)')) {
    throw new Error('expected workspace source-file merge path to reuse the shared source-file record equality helper')
  }
  if (!localMarkdownFolderText.includes('buildSourceFileRecord(')) {
    throw new Error('expected local markdown folder source-file materialization to reuse the shared source-file record builder')
  }
  if (!sourceFilesSliceText.includes('normalizeSourceFiles(files)')) {
    throw new Error('expected source-files store slice setSourceFiles path to normalize source-file arrays through the shared helper')
  }
  if (!sourceFilesSliceText.includes('normalizeSourceFileRecord(file)')) {
    throw new Error('expected source-files store slice addSourceFile path to normalize source-file records through the shared helper')
  }
  if (!sourceFilesSliceText.includes('normalizeSourceFileRecord({ ...f, ...updates })')) {
    throw new Error('expected source-files store slice updateSourceFile path to normalize merged source-file records through the shared helper')
  }
  if (!sourceFilesSliceText.includes('normalizeSourceFileRecord({ ...f, status, error })')) {
    throw new Error('expected source-files store slice status updates to normalize lifecycle metadata through the shared helper')
  }
  if (!composedSourceText.includes('buildUpdatedSourceFileParsedGraphState(')) {
    throw new Error('expected composed source position writebacks to reuse the shared parsed graph update helper')
  }
  if (!nodeActionsText.includes('buildUpdatedSourceFileParsedGraphState(')) {
    throw new Error('expected composed node actions to reuse the shared parsed graph update helper')
  }
  if (!edgeActionsText.includes('buildUpdatedSourceFileParsedGraphState(')) {
    throw new Error('expected composed edge actions to reuse the shared parsed graph update helper')
  }
  if (!helperText.includes('export function readSourceFileParsedState(')) {
    throw new Error('expected parsed source-file state helper to expose a normalized read path for signatures and sync equality')
  }
  if (!helperText.includes('export function readPersistedSourceFileParsedState(')) {
    throw new Error('expected parsed source-file state helper to expose a persisted parsed-state projection')
  }
  if (!helperText.includes('export function areSourceFileParsedStatesEqual(')) {
    throw new Error('expected parsed source-file state helper to expose canonical parsed-state equality')
  }
  if (!signaturesText.includes('readSourceFileParsedState(')) {
    throw new Error('expected source file signatures to normalize parsed state via the shared parsed-state reader')
  }
  if (
    !syncToSourceFilesText.includes('readSourceFileParsedState(prev)') ||
    !syncToSourceFilesText.includes('const seedSourcePath = resolveWorkspaceSeedSourcePath(path)') ||
    !syncToSourceFilesText.includes('const srcPath = resolveWorkspaceSourcePathKey(path)') ||
    (
      !syncToSourceFilesText.includes('areSourceFileParsedStatesEqual(') &&
      !syncToSourceFilesText.includes('areSourceFileRecordsEqual(prev, candidate)')
    )
  ) {
    throw new Error('expected workspace source-file sync to reuse shared source-file equality, parsed-state normalization, and canonical seed source-path helpers')
  }
  if (
    !sourceFilesDbText.includes('readPersistedSourceFileRecord(payload)') ||
    !sourceFilesDbText.includes('areSourceFileRecordsEqual(existingPayload, row.payload, { includeGraphData: false, includeGraphRevision: false })')
  ) {
    throw new Error('expected source files DB normalization and persistence equality to reuse shared source-file persistence helpers')
  }
  if (!sourceFilesDbText.includes('const next = readPersistedSourceFileRecord(r.get(\'payload\') as SourceFile)')) {
    throw new Error('expected source files DB load path to consume the shared persisted source-file record helper directly')
  }
  if (!sourceFilesDbText.includes('const normalized = readPersistedSourceFileRecord(payload)')) {
    throw new Error('expected source files DB save path to consume the shared persisted source-file record helper directly')
  }
  if (!workspaceStateText.includes('export function normalizeSourceFilesWorkspaceState(value: unknown): SourceFilesWorkspaceState')) {
    throw new Error('expected workspace-state persistence normalization to be centralized in a shared source-files helper')
  }
  if (!workspaceStateText.includes('export function areSourceFilesWorkspaceStatesEqual(')) {
    throw new Error('expected workspace-state persistence equality to be centralized in a shared source-files helper')
  }
  if (!workspaceStateText.includes('export function buildSourceFilesWorkspaceStateSignature(value: unknown): string')) {
    throw new Error('expected workspace-state persistence signatures to be centralized in a shared source-files helper')
  }
  if (!sourceFilesDbText.includes('return normalizeSourceFilesWorkspaceState(row.get(\'payload\'))')) {
    throw new Error('expected source files DB workspace load path to reuse the shared workspace-state normalizer directly')
  }
  if (
    !sourceFilesDbText.includes('const payload = normalizeSourceFilesWorkspaceState(state)') ||
    !sourceFilesDbText.includes('if (areSourceFilesWorkspaceStatesEqual(existingPayload, payload)) return')
  ) {
    throw new Error('expected source files DB workspace persistence to reuse the shared workspace-state normalizer and equality helper')
  }
  if (
    !sourceFilesDbText.includes('EMPTY_SOURCE_FILES_WORKSPACE_STATE') ||
    !sourceFilesDbText.includes('type SourceFilesWorkspaceState')
  ) {
    throw new Error('expected source files DB workspace persistence boundary to reuse the shared workspace-state types and defaults')
  }
  if (
    !sourceFilesDbText.includes('normalizeSourceFilesWorkspaceState(existing.get(\'payload\'))') ||
    !sourceFilesDbText.includes('await collections.workspace.incrementalUpsert({ id: \'workspace\', payload, updatedAtMs: now })')
  ) {
    throw new Error('expected source files DB workspace persistence to normalize stored snapshots before comparing and writing')
  }
  if (
    !sourceFilesDbText.includes('areSourceFileSourcesEqual(existingPayload.source, row.payload.source)')
  ) {
    throw new Error('expected source files DB source ownership persistence comparisons to reuse the shared source ownership equality helper')
  }
  if (
    !bootstrapText.includes('buildSourceFilesWorkspaceStateSignature(snapshot)') ||
    !bootstrapText.includes('normalizeSourceFilesWorkspaceState({') ||
    !bootstrapText.includes('equalityFn: areSourceFilesWorkspaceStatesEqual')
  ) {
    throw new Error('expected runtime workspace persistence bootstrap to reuse the shared workspace-state normalization, equality, and signature helpers')
  }
  if (
    !readFileSync(resolve(process.cwd(), 'src', 'features', 'source-files', 'applyComposedGraphFromSourceFiles.ts'), 'utf8').includes('resolveSourceLayerKeyChange({') ||
    !readFileSync(resolve(process.cwd(), 'src', 'features', 'markdown-workspace', 'hooks', 'useMarkdownApply.ts'), 'utf8').includes('resolveSourceLayerKeyChange({') ||
    !readFileSync(resolve(process.cwd(), 'src', 'lib', 'graph', 'sourceLayers.ts'), 'utf8').includes('export function resolveSourceLayerKeyChange(args:')
  ) {
    throw new Error('expected composed apply callers to reuse the shared source-layer key change helper for unchanged vs order-only vs content branching')
  }
  if (
    !readFileSync(resolve(process.cwd(), 'src', 'features', 'source-files', 'applyComposedGraphFromSourceFiles.ts'), 'utf8').includes('hasEnabledNonWorkspaceComposedSources(') ||
    !readFileSync(resolve(process.cwd(), 'src', 'features', 'source-files', 'applyComposedGraphFromSourceFiles.ts'), 'utf8').includes("if (!hasEnabledNonWorkspaceComposedSources(currentSourceFiles)) {")
  ) {
    throw new Error('expected composed apply scheduling to hard-skip workspace-only source snapshots and avoid switch-time composed apply churn')
  }
  if (
    !readFileSync(resolve(process.cwd(), 'src', 'features', 'source-files', 'applyComposedGraphFromSourceFiles.ts'), 'utf8').includes('resolveComposedApplyDeferralReason({') ||
    !readFileSync(resolve(process.cwd(), 'src', 'features', 'source-files', 'composedApplyGuards.ts'), 'utf8').includes('export function resolveComposedApplyDeferralReason(args:')
  ) {
    throw new Error('expected composed apply race suppression to reuse the shared source-files deferral helper')
  }
  if (
    !readFileSync(resolve(process.cwd(), 'src', 'features', 'source-files', 'applyComposedGraphFromSourceFiles.ts'), 'utf8').includes('shouldClearComposedGraphForEmptyState({') ||
    !readFileSync(resolve(process.cwd(), 'src', 'features', 'source-files', 'composedApplyGuards.ts'), 'utf8').includes('export function shouldClearComposedGraphForEmptyState(args:')
  ) {
    throw new Error('expected composed apply empty-state clearing to reuse the shared source-files empty-state helper')
  }
  if (
    !readFileSync(resolve(process.cwd(), 'src', 'features', 'source-files', 'composedSourceSelection.ts'), 'utf8').includes('export function resolvePreferredComposedDocumentPathFromState(args:') ||
    !readFileSync(resolve(process.cwd(), 'src', 'features', 'source-files', 'composedSourceSelection.ts'), 'utf8').includes('export function resolvePreferredComposedSourceFileFromState(args:') ||
    !readFileSync(resolve(process.cwd(), 'src', 'features', 'source-files', 'composedSourceSelection.ts'), 'utf8').includes('export function readComposedSourceFilePath(') ||
    !readFileSync(resolve(process.cwd(), 'src', 'features', 'source-files', 'composedSourceSelection.ts'), 'utf8').includes('export function resolvePreferredComposedSourceRawTextFromState(args:') ||
    !readFileSync(resolve(process.cwd(), 'src', 'features', 'source-files', 'applyComposedGraphFromSourceFiles.ts'), 'utf8').includes('resolvePreferredComposedSourceRawTextFromState({') ||
    !readFileSync(resolve(process.cwd(), 'src', 'hooks', 'store', 'graph-data-slice', 'graphDataComposedSource.ts'), 'utf8').includes('resolvePreferredEnabledComposedSourceFileFromState({') ||
    !readFileSync(resolve(process.cwd(), 'src', 'hooks', 'store', 'graph-data-slice', 'graphDataFrontmatterFlowSync.ts'), 'utf8').includes('resolvePreferredComposedSourceFileFromState({')
  ) {
    throw new Error('expected composed active-document selection and raw-text fallback ownership to stay centralized in the shared source-files helper')
  }
}

export function testMarkdownWorkspaceRuntimeReusesParsedWorkspaceSourceFileInsteadOfDirectGraphOverride() {
  const runtimePath = resolve(process.cwd(), 'src', 'lib', 'markdown-workspace-runtime', 'useMarkdownWorkspaceIndexing.tsx')
  const text = readFileSync(runtimePath, 'utf8')
  if (!text.includes('const shouldReuseExistingWorkspaceSourceFile =')) {
    throw new Error('expected markdown workspace runtime to centralize reuse of an already-parsed workspace source file')
  }
  if (!text.includes('cachedHash === hash')) {
    throw new Error('expected markdown workspace runtime to guard workspace-source reuse on matching parsed text hash')
  }
  if (!text.includes('findWorkspaceSourceFileByPath(path)')) {
    throw new Error('expected markdown workspace runtime to resolve the canonical workspace-backed source file before reparsing')
  }
  if (!text.includes('buildSourceFileParseIdentityHash({')) {
    throw new Error('expected markdown workspace runtime to reuse shared parse identity hashing for workspace-opened markdown files')
  }
  if (!text.includes('cacheNamespace: `workspace-import:${path}`')) {
    throw new Error('expected markdown workspace runtime parse identity to stay aligned with workspace import hashing')
  }
  if (!text.includes('name: workspaceDocumentKey(path)')) {
    throw new Error('expected markdown workspace runtime parse identity to include the canonical workspace document key')
  }
  if (!text.includes('const workspaceSourceAlreadyMaterialized =')) {
    throw new Error('expected markdown workspace runtime to fast-return when the canonical workspace source file is already fully materialized')
  }
  if (!text.includes('if (workspaceSourceAlreadyMaterialized) {')) {
    throw new Error('expected markdown workspace runtime to branch before reloading an already materialized workspace source file')
  }
  if (text.includes('const shouldUseDirectGraphDataFor =')) {
    throw new Error('expected markdown workspace runtime indexing path to stop using a direct graph override helper for workspace-backed source files')
  }
  if (text.includes('store.setGraphData(cachedGraph as GraphData)') || text.includes('store.setGraphData(geoGraph)') || text.includes('store.setGraphData(gd)')) {
    throw new Error('expected markdown workspace runtime indexing path to route parsed workspace files back through canonical composed source-file apply instead of direct graph override')
  }
  const fastPathIndex = text.indexOf('if (workspaceSourceAlreadyMaterialized) {')
  const geoCandidateIndex = text.indexOf('const isGeoCandidate = (() => {')
  if (fastPathIndex < 0 || geoCandidateIndex < 0 || fastPathIndex > geoCandidateIndex) {
    throw new Error('expected markdown workspace runtime to skip geo/index parse candidate work before the already-materialized fast path')
  }
  const materializedFastPathBlock = fastPathIndex >= 0 && geoCandidateIndex > fastPathIndex ? text.slice(fastPathIndex, geoCandidateIndex) : ''
  if (materializedFastPathBlock.includes('applyComposedFromSourceFiles()')) {
    throw new Error('expected already-materialized/reuse workspace source-file fast paths to avoid redundant composed-graph reschedule churn')
  }
  if (text.includes('applyComposedFromSourceFiles') || text.includes('scheduleApplyComposedGraphFromSourceFiles') || text.includes('maybeAutoEnableGeospatialModeForGraphData')) throw new Error('expected Source Files selection indexing not to schedule composed graph/geospatial surface mutation while switching files')
  if (!text.includes('const alreadyIndexedForTextHash = typeof previouslyIndexedHash === \'string\' && previouslyIndexedHash === textHash')) {
    throw new Error('expected markdown workspace runtime to centralize passive active-document sync dedupe on indexed semantic text hash reuse')
  }
  if (!text.includes('if (!alreadyIndexedForTextHash) {')) {
    throw new Error('expected markdown workspace runtime to skip redundant active document push after indexed semantic text hash reuse')
  }
  if (text.includes('frontmatterLanding') || text.includes('resolveMarkdownWorkspaceFrontmatterLanding') || text.includes('forceApplyToGraph: true')) throw new Error('expected markdown workspace file switching not to keep stale frontmatter Canvas relanding paths')
  if (!text.includes('const workspaceSourceAlreadyIndexedForSameHash = !!(')) {
    throw new Error('expected markdown workspace runtime indexing to centralize semantic no-op guard for already-indexed workspace source path/hash')
  }
  if (!text.includes('if (workspaceSourceAlreadyIndexedForSameHash) {')) {
    throw new Error('expected markdown workspace runtime indexing to short-circuit before parse/update cycles when workspace source hash is unchanged')
  }
  if (!text.includes('String(existingWorkspaceSourceForPath?.parsedTextHash || \'\') === hash')) {
    throw new Error('expected markdown workspace runtime semantic no-op guard to compare parsed workspace source hash against active text hash')
  }
  if (!text.includes('const shouldRunWorkspaceSourceParsing = ext ===')) {
    throw new Error('expected markdown workspace runtime indexing to centralize parse eligibility before expensive workspace source parse paths')
  }
  if (text.includes('|| isInitializationWorkspacePath(path)')) {
    throw new Error('expected markdown workspace runtime parse eligibility to avoid markdown initialization-path graph parse ownership during source-file switching')
  }
  if (text.includes('|| !!parseCanvasWorkspaceFrontmatterPreset(nextText)')) {
    throw new Error('expected markdown workspace runtime parse eligibility to avoid frontmatter-driven parse churn during regular source-file switching')
  }
  if (!text.includes('if (!shouldRunWorkspaceSourceParsing) {')) {
    throw new Error('expected markdown workspace runtime indexing to skip expensive parse/index job path for plain markdown semantic no-op switches')
  }
}

export function testWorkspaceBootstrapActivePathRematerializeAvoidsImplicitGraphApply() {
  const bootstrapPath = resolve(process.cwd(), 'src', 'features', 'source-files', 'SourceFilesPersistenceBootstrap.tsx')
  const bootstrapStartupPath = resolve(process.cwd(), 'src', 'features', 'source-files', 'sourceFilesBootstrapStartup.ts')
  const runtimeSharedPath = resolve(process.cwd(), 'src', 'features', 'source-files', 'sourceFilesRuntimeShared.ts')
  const runtimeActivePath = resolve(process.cwd(), 'src', 'features', 'source-files', 'sourceFilesRuntimeActive.ts')
  const runtimeMaterializationPath = resolve(process.cwd(), 'src', 'features', 'source-files', 'sourceFilesRuntimeMaterialization.ts')
  const runtimeStartupPath = resolve(process.cwd(), 'src', 'features', 'source-files', 'sourceFilesRuntimeStartup.ts')
  const importToCanvasPath = resolve(process.cwd(), 'src', 'features', 'workspace-fs', 'applyWorkspaceImportToCanvas.ts')
  const bootstrapText = readFileSync(bootstrapPath, 'utf8')
  const bootstrapStartupText = readFileSync(bootstrapStartupPath, 'utf8')
  const runtimeSharedText = readFileSync(runtimeSharedPath, 'utf8')
  const runtimeActiveText = readFileSync(runtimeActivePath, 'utf8')
  const runtimeMaterializationText = readFileSync(runtimeMaterializationPath, 'utf8')
  const runtimeStartupText = readFileSync(runtimeStartupPath, 'utf8')
  const importToCanvasText = readFileSync(importToCanvasPath, 'utf8')
  const activePathAuthorityText = readFileSync(resolve(process.cwd(), 'src', 'features', 'source-files', 'sourceFilesActivePathAuthority.ts'), 'utf8')

  if (
    !runtimeSharedText.includes("from '@/features/source-files/sourceFilesRuntimeActive'") ||
    !runtimeSharedText.includes("from '@/features/source-files/sourceFilesRuntimeMaterialization'") ||
    !runtimeSharedText.includes("from '@/features/source-files/sourceFilesRuntimeStartup'")
  ) {
    throw new Error('expected workspace runtime shared module to become a pure facade over dedicated active-resolution, materialization, and startup helper modules')
  }
  if (
    !runtimeSharedText.includes("hydrateWorkspaceEntriesInlineText,\n  readReusableWorkspaceEntriesSnapshot,\n  readWorkspaceActiveEntrySnapshot,\n  readWorkspaceSourceRootEntriesSnapshot,\n} from '@/features/source-files/sourceFilesRuntimeActive'") ||
    !runtimeSharedText.includes("buildActiveWorkspaceRuntimeSourceFilesSnapshot,\n  buildMaterializedWorkspaceActivePathKey,\n  buildMaterializedWorkspaceForceIncludePaths,\n  materializeActiveWorkspaceEntryIntoSourceFiles,\n  resolveMaterializedWorkspaceActivePath,\n} from '@/features/source-files/sourceFilesRuntimeMaterialization'")
  ) {
    throw new Error('expected workspace runtime shared facade to re-export active-resolution helpers from the active module and path/materialization helpers from the materialization module')
  }
  if (runtimeSharedText.includes('export function buildInitialWorkspaceStartupSnapshot(args:') || runtimeSharedText.includes('export async function resolveInitialWorkspaceStartupState')) {
    throw new Error('expected workspace runtime shared module to stop owning startup implementation once the dedicated startup runtime module exists')
  }
  if (!runtimeMaterializationText.includes('applyToGraph?: boolean')) {
    throw new Error('expected workspace bootstrap materialize helper to make graph apply explicit instead of implicit in the dedicated materialization helper')
  }
  if (!bootstrapStartupText.includes('applyToGraph: true,')) {
    throw new Error('expected initial bootstrap materialization to opt into graph apply explicitly')
  }
  if (!runtimeMaterializationText.includes('export function resolveMaterializedWorkspaceActivePath(args?:')) {
    throw new Error('expected workspace bootstrap materialization to centralize active workspace path resolution in the dedicated materialization helper')
  }
  if (!runtimeMaterializationText.includes('export function buildMaterializedWorkspaceActivePathKey(args?:')) {
    throw new Error('expected workspace bootstrap materialization to centralize active workspace path dedupe keys in the dedicated materialization helper')
  }
  if (!runtimeMaterializationText.includes('export function buildMaterializedWorkspaceForceIncludePaths(args?:')) {
    throw new Error('expected workspace bootstrap materialization to centralize active workspace force-include path derivation in the dedicated materialization helper')
  }
  if (!runtimeActiveText.includes('export const readWorkspaceActiveEntrySnapshot = async (args:')) {
    throw new Error('expected workspace bootstrap materialization to centralize active-entry snapshot reuse in the dedicated active-resolution helper')
  }
  if (!runtimeActiveText.includes('export function readReusableWorkspaceEntriesSnapshot(')) {
    throw new Error('expected workspace bootstrap materialization to centralize reusable workspace snapshot gating in the dedicated active-resolution helper')
  }
  if (!runtimeStartupText.includes('export function buildInitialWorkspaceStartupSnapshot(args:')) {
    throw new Error('expected workspace bootstrap startup snapshot branching to move into the dedicated startup runtime helper')
  }
  if (
    !runtimeMaterializationText.includes("const withoutWorkspacePrefix = trimmed.startsWith('workspace:') ? trimmed.slice('workspace:'.length) : trimmed") ||
    !runtimeMaterializationText.includes('const normalized = normalizeWorkspacePath(withoutWorkspacePrefix)')
  ) {
    throw new Error('expected workspace bootstrap materialization active-path helper to normalize workspace-prefixed paths in the dedicated materialization helper')
  }
  if (!bootstrapText.includes('resolveMaterializedWorkspaceActivePath({')) {
    throw new Error('expected source files bootstrap to reuse the shared active workspace path helper before rematerializing source files')
  }
  if (!bootstrapStartupText.includes('resolveMaterializedWorkspaceActivePath({')) {
    throw new Error('expected bootstrap startup materialization to reuse the shared active workspace path helper before initial graph apply')
  }
  if (!bootstrapStartupText.includes("from '@/features/source-files/sourceFilesRuntimeStartup'")) {
    throw new Error('expected bootstrap startup orchestration to consume startup resolution from the dedicated startup runtime module')
  }
  if (!bootstrapStartupText.includes('export async function prepareBootstrapWorkspaceMaterialization(')) {
    throw new Error('expected bootstrap startup orchestration to centralize hydrated startup materialization preparation in a dedicated helper')
  }
  if (!bootstrapStartupText.includes('function readBootstrapExistingSourceFiles(') || !bootstrapStartupText.includes('function readBootstrapSourceIndexSnapshot(')) {
    throw new Error('expected bootstrap startup orchestration to centralize bootstrap source-files and source-index snapshot reuse behind dedicated helpers')
  }
  if (!bootstrapStartupText.includes('const context = await prepareBootstrapWorkspaceMaterialization({') || !bootstrapStartupText.includes('startupState: attempt === 0 ? args.startupState : undefined,')) {
    throw new Error('expected bootstrap startup materialization retries to delegate shared preparation while refreshing a drifted startup selection')
  }
  if (!bootstrapText.includes('buildMaterializedWorkspaceActivePathKey({')) {
    throw new Error('expected source files bootstrap to reuse the shared active workspace path key helper before rematerialization dedupe')
  }
  if (
    !bootstrapStartupText.includes('const workspaceEntries = readReusableWorkspaceEntriesSnapshot(context.hydratedEntries)') ||
    !bootstrapStartupText.includes('activeWorkspaceEntriesSnapshot: workspaceEntries')
  ) {
    throw new Error('expected source files bootstrap to reuse the shared workspace snapshot helper through the dedicated startup materialization context before passing entries into materialization')
  }
  if (!runtimeMaterializationText.includes('export function buildActiveWorkspaceRuntimeSourceFilesSnapshot(args:')) {
    throw new Error('expected workspace bootstrap materialization to centralize active runtime source-files shaping in the dedicated materialization helper')
  }
  if (!bootstrapStartupText.includes('buildActiveWorkspaceRuntimeSourceFilesSnapshot({')) {
    throw new Error('expected source files bootstrap startup to reuse the shared active runtime source-files shaping helper')
  }
  if (!bootstrapText.includes('buildActiveWorkspaceRuntimeSourceFilesSnapshot({')) {
    throw new Error('expected source files bootstrap rematerialization to reuse the shared active runtime source-files shaping helper')
  }
  if (!bootstrapStartupText.includes('premergedSourceFiles: context.mergedSourceFiles')) {
    throw new Error('expected source files bootstrap startup to pass the already-merged active source-files snapshot from the dedicated startup context directly into shared materialization')
  }
  if (!bootstrapText.includes('const readReusableWorkspaceSourceIndexSnapshot = React.useCallback(() => {') || !bootstrapText.includes('const cached = reusableWorkspaceSourcesByPathRef.current')) {
    throw new Error('expected source files bootstrap rematerialization path to centralize reusable source-index snapshot reuse behind a dedicated cached helper')
  }
  if (!bootstrapText.includes('const readReusableWorkspaceFs = React.useCallback(async () => {') || !bootstrapText.includes('const cached = reusableWorkspaceFsRef.current')) {
    throw new Error('expected source files bootstrap rematerialization and seed-sync paths to centralize cached workspace-fs reuse behind a dedicated helper')
  }
  if (!bootstrapText.includes('const readCurrentSourceFilesSnapshot = React.useCallback((') || !bootstrapText.includes('const hasWorkspaceRematerializeCandidates = React.useCallback((')) {
    throw new Error('expected source files bootstrap rematerialization path to centralize sourceFiles snapshot reads and candidate gating behind dedicated helpers')
  }
  if (!bootstrapText.includes('const rematerializeWorkspaceBackedSourceFilesOnce = React.useCallback(async (args?: {')) {
    throw new Error('expected source files bootstrap rematerialization path to centralize one rematerialize cycle in a dedicated helper')
  }
  if (!bootstrapText.includes('type WorkspaceRematerializeRequest = {')) {
    throw new Error('expected source files bootstrap rematerialization scheduling to centralize debounced run payloads behind a dedicated request type')
  }
  if (!bootstrapText.includes('const resolveWorkspaceRematerializeRequest = React.useCallback((args?: {')) {
    throw new Error('expected source files bootstrap rematerialization scheduling to centralize request resolution in a dedicated helper')
  }
  if (!bootstrapText.includes('const runWorkspaceRematerializeRequest = React.useCallback(async (request: WorkspaceRematerializeRequest) => {')) {
    throw new Error('expected source files bootstrap rematerialization scheduling to centralize one rematerialize run in a dedicated helper')
  }
  if (!bootstrapText.includes('const drainWorkspaceRematerializeRequests = React.useCallback(async (initialRequest?: WorkspaceRematerializeRequest | null) => {')) {
    throw new Error('expected source files bootstrap rematerialization scheduling to centralize in-flight draining and queued reruns in a dedicated helper')
  }
  if (!bootstrapText.includes('const scheduleWorkspaceRematerializeRequest = React.useCallback((request: WorkspaceRematerializeRequest | null) => {') || !bootstrapText.includes('const scheduleWorkspaceRematerialize = React.useCallback((args?: {')) {
    throw new Error('expected source files bootstrap rematerialization scheduling to centralize both prepared-request scheduling and fallback request resolution behind dedicated helpers')
  }
  if (!bootstrapText.includes('const pendingWorkspaceRematerializeRequestRef = React.useRef<WorkspaceRematerializeRequest | null>(null)')) {
    throw new Error('expected source files bootstrap rematerialization scheduling to retain the latest debounced rematerialize request across mutation bursts')
  }
  if (!bootstrapText.includes('await runWorkspaceRematerializeRequest(request)') || !bootstrapText.includes('pendingWorkspaceRematerializeRequestRef.current = request')) {
    throw new Error('expected rematerialize scheduling to drain dedicated rematerialize requests and retain the latest burst request while work is in flight')
  }
  if (
    !bootstrapText.includes('scheduleWorkspaceRematerializeRequest(resolveWorkspaceRematerializeRequest(args))') ||
    !bootstrapText.includes('scheduleWorkspaceRematerializeRef.current = request => {') ||
    !bootstrapText.includes('scheduleWorkspaceRematerializeRequest(request)') ||
    !bootstrapText.includes('scheduleWorkspaceRematerialize()')
  ) {
    throw new Error('expected the rematerialize effect shell to bind the dedicated prepared-request scheduler and fallback resolver instead of owning inline scheduling logic')
  }
  if (!bootstrapText.includes('type BootstrapMountRequest = {') || !bootstrapText.includes('type BootstrapMountSideEffectsRequest = {')) {
    throw new Error('expected source files bootstrap startup mount flow to centralize first-load orchestration and startup side effects behind dedicated request types')
  }
  if (!bootstrapText.includes('const resolveBootstrapMountRequest = React.useCallback((args: {')) {
    throw new Error('expected source files bootstrap startup mount flow to centralize first-load request resolution in a dedicated helper')
  }
  if (!bootstrapText.includes('const applyBootstrapMountRequest = React.useCallback(async (request: BootstrapMountRequest): Promise<void> => {')) {
    throw new Error('expected source files bootstrap startup mount flow to centralize ref wiring, persisted restore, and first scheduling in a dedicated helper')
  }
  const bootstrapMountUsesPreparedActivePathRequest =
    bootstrapText.includes('initialActivePathRequest: resolveActivePathMaterializationRequest({') ||
    (
      bootstrapText.includes('const initialActivePathRequest = resolveActivePathMaterializationRequest({') &&
      bootstrapText.includes('initialActivePathRequest,')
    )
  if (!bootstrapText.includes('rematerializeRequest: resolveWorkspaceRematerializeRequest({') || !bootstrapMountUsesPreparedActivePathRequest) {
    throw new Error('expected source files bootstrap startup mount flow to reuse dedicated rematerialize and active-path request resolvers before the first scheduled rematerialize')
  }
  if (!bootstrapText.includes('const applyBootstrapInitialRematerializeRequest = React.useCallback((request: WorkspaceRematerializeRequest | null): boolean => {') || !bootstrapText.includes('scheduleWorkspaceRematerializeRef.current?.(request)') || !bootstrapText.includes('const applyBootstrapFallbackRematerializeRequest = React.useCallback(() => {') || !bootstrapText.includes('const applyBootstrapSideEffectsRequest = React.useCallback((request: BootstrapMountSideEffectsRequest) => {') || !bootstrapText.includes('applyBootstrapInitialActivePathRequest(request.initialActivePathRequest)') || !bootstrapText.includes('applyBootstrapSideEffectsRequest(request.bootstrapSideEffectsRequest)')) {
    throw new Error('expected source files bootstrap startup mount flow to hand off startup side effects through dedicated bootstrap helpers and reuse the prepared rematerialize request instead of recomputing adjacent request context')
  }
  if (!bootstrapText.includes('const applyBootstrapMaterializationResult = React.useCallback((bootstrapMaterialization: BootstrapMountRequest[\'bootstrapMaterialization\']) => {') || !bootstrapText.includes('applyBootstrapMaterializationResult(request.bootstrapMaterialization)')) {
    throw new Error('expected source files bootstrap startup mount flow to centralize bootstrap materialization cache and ref wiring behind a dedicated helper instead of keeping it inline in the apply path')
  }
  if (!bootstrapText.includes('const applyBootstrapWorkspaceState = React.useCallback((persistedWorkspace: SourceFilesWorkspaceState) => {') || !bootstrapText.includes('applyBootstrapWorkspaceState(request.persistedWorkspace)')) {
    throw new Error('expected source files bootstrap startup mount flow to centralize persisted workspace restore and hydration state writes behind a dedicated helper instead of keeping them inline in the apply path')
  }
  if (!bootstrapText.includes('const bootstrapMountRequest = resolveBootstrapMountRequest({') || !bootstrapText.includes('applyBootstrapMountRequest(bootstrapMountRequest)')) {
    throw new Error('expected the startup mount effect shell to delegate first-load orchestration to the dedicated bootstrap mount helpers')
  }
  if (!bootstrapText.includes('sourcesByPath: readReusableWorkspaceSourceIndexSnapshot(),')) {
    throw new Error('expected bootstrap startup materialization to reuse the cached source-index snapshot helper instead of forcing a fresh snapshot read')
  }
  if (!bootstrapText.includes('bootstrapSideEffectsRequest: {') || !bootstrapText.includes('composeRequest: args.bootstrapMaterialization && !initialActivePathRequest') || !bootstrapText.includes('const applyBootstrapComposeRequest = React.useCallback((args: {') || !bootstrapText.includes('const applyBootstrapSideEffectsRequest = React.useCallback((request: BootstrapMountSideEffectsRequest) => {') || !bootstrapText.includes('sourceFilesSnapshot: request.sourceFilesSnapshot,') || !bootstrapStartupText.includes('precomputedSignature?: string')) {
    throw new Error('expected bootstrap composed-graph and rematerialize scheduling to reuse one shared startup side-effects request while standing down stale bootstrap composition when active-path materialization owns the first graph apply')
  }
  if (!runtimeMaterializationText.includes('resolveWorkspaceSourceIndexSnapshot(args?.sourcesByPath)')) {
    throw new Error('expected workspace bootstrap materialization to centralize source-index snapshot reuse vs reload decisions in the dedicated materialization helper')
  }
  if (!bootstrapStartupText.includes('resolveWorkspaceSourceIndexSnapshot(undefined)')) {
    throw new Error('expected source files bootstrap startup hydration to reuse the shared source-index snapshot helper')
  }
  if (!bootstrapStartupText.includes('applyGraphOwnerComposedGraphFromSourceFiles()')) throw new Error('expected source files bootstrap startup to apply graph-owner composition synchronously before publishing source readiness')
  if (!bootstrapStartupText.includes("intent: 'explicit-graph-owner'")) {
    throw new Error('expected bootstrap composed-graph signature tracking to use explicit graph-owner scope')
  }
  if (!importToCanvasText.includes('scheduleApplyGraphOwnerComposedGraphFromSourceFiles()')) {
    throw new Error('expected workspace import graph-owning flow to use the canonical graph-owner composed scheduler')
  }
  if (!importToCanvasText.includes('if (applyToGraph) {')) {
    throw new Error('expected workspace import scheduling to branch on explicit applyToGraph ownership')
  }
  if (!bootstrapText.includes('materializeActiveWorkspaceEntryIntoSourceFiles({')) {
    throw new Error('expected active-path rematerialization to delegate apply-to-graph policy to shared materialization logic')
  }
  if (!bootstrapText.includes('type ActivePathMaterializationRequest,') || !activePathAuthorityText.includes('export type ActivePathMaterializationRequest = ActivePathSourceAuthorityRequest & {')) {
    throw new Error('expected source files bootstrap active-path sync to centralize queued retry payloads behind a dedicated request type')
  }
  if (!bootstrapText.includes('const resolveActivePathMaterializationRequest = React.useCallback((args?: {')) {
    throw new Error('expected source files bootstrap active-path sync to centralize active-path request resolution in a dedicated helper')
  }
  if (!bootstrapText.includes('const runActivePathMaterialization = React.useCallback(async (request: ActivePathMaterializationRequest): Promise<void> => {')) {
    throw new Error('expected source files bootstrap active-path sync to centralize in-flight materialization execution in a dedicated helper')
  }
  if (!bootstrapText.includes('const syncActivePathMaterialization = React.useCallback((args?: {')) {
    throw new Error('expected source files bootstrap active-path sync effect to delegate orchestration to a dedicated helper')
  }
  if (!bootstrapText.includes('queuedActivePathMaterializeRef = React.useRef<ActivePathMaterializationRequest | null>(null)')) {
    throw new Error('expected queued active-path retries to retain the full materialization request instead of only the raw path string')
  }
  if (!bootstrapText.includes('type WorkspaceFsMutationRequest = {')) {
    throw new Error('expected source files bootstrap workspace-fs mutation handling to centralize event payloads behind a dedicated request type')
  }
  if (!bootstrapText.includes('const resolveWorkspaceFsMutationRequest = React.useCallback((detail?: {')) {
    throw new Error('expected source files bootstrap workspace-fs mutation handling to centralize request resolution in a dedicated helper')
  }
  if (!bootstrapText.includes('const handleWorkspaceFsMutation = React.useCallback((request: WorkspaceFsMutationRequest) => {')) {
    throw new Error('expected source files bootstrap workspace-fs mutation handling to centralize cache invalidation, ensure-seed apply, and scheduling in a dedicated helper')
  }
  if (
    !bootstrapText.includes('activePathRequest: args?.activePathRequest === undefined') ||
    !bootstrapText.includes('resolveActivePathMaterializationRequest({')
  ) {
    throw new Error('expected workspace-fs mutation request resolution to thread one reusable active-path request through the event burst and retain request-owned active-path context when already prepared')
  }
  if (!bootstrapText.includes('sourceFilesSnapshot: request.sourceFilesSnapshot,')) {
    throw new Error('expected workspace-fs ensure-seed and active-path sync materialization to pass through the request-owned sourceFiles snapshot instead of rereading store state downstream')
  }
  if (
    !bootstrapText.includes('workspaceEntriesSnapshot: reusableWorkspaceEntriesRef.current') ||
    !bootstrapText.includes('sourceFilesSnapshot: latestSourceFilesSnapshotRef.current,') ||
    !bootstrapText.includes('const syncForActivePathSelection = (selection: ActivePathMaterializationSelection) => {')
  ) {
    throw new Error('expected active-path sync subscriptions to thread reusable workspace-entry and caller-owned sourceFiles snapshots through dedicated active-path selection requests')
  }
  if (!bootstrapText.includes('const sourcesByPathSnapshot = readReusableWorkspaceSourceIndexSnapshot()')) {
    throw new Error('expected workspace-fs mutation handling to prime one reusable source-index snapshot for ensure-seed apply and queued rematerialization')
  }
  if (!bootstrapText.includes('sourcesByPath: sourcesByPathSnapshot,')) {
    throw new Error('expected workspace-fs ensure-seed apply to reuse the helper-primed source-index snapshot instead of recomputing it downstream')
  }
  if (!bootstrapText.includes('const fs = await readReusableWorkspaceFs()')) {
    throw new Error('expected source files bootstrap seed-sync and rematerialization hot paths to reuse the cached workspace-fs helper instead of refetching workspace fs per run')
  }
  if (!bootstrapText.includes('const request = resolveWorkspaceFsMutationRequest(detail)') || !bootstrapText.includes('handleWorkspaceFsMutation(request)')) {
    throw new Error('expected workspace-fs subscription effect to become a thin shell over the dedicated mutation request and handler helpers')
  }
  if (!bootstrapText.includes('type WorkspaceSeedSyncRequest = {')) {
    throw new Error('expected source files bootstrap workspace seed sync to centralize poll/wake payloads behind a dedicated request type')
  }
  if (!bootstrapText.includes('type PreparedWorkspaceSeedSyncRequest = WorkspaceSeedSyncRequest & {') || !bootstrapText.includes('const resolvePreparedWorkspaceSeedSyncRequest = React.useCallback((')) {
    throw new Error('expected source files bootstrap workspace seed sync to capture one prepared execution payload with caller-owned sourceFiles snapshot before handling changed seed results')
  }
  if (!bootstrapText.includes('const pendingEnsureSeedMutationRequestRef = React.useRef<WorkspaceFsMutationRequest | null>(null)')) {
    throw new Error('expected source files bootstrap workspace seed sync to retain one prepared ensure-seed mutation request for the matching workspace-fs event')
  }
  if (!bootstrapText.includes("if (op === 'ensureSeed' && !changedPath) {") || !bootstrapText.includes('const preparedRequest = pendingEnsureSeedMutationRequestRef.current')) {
    throw new Error('expected workspace-fs mutation request resolution to reuse a prepared ensure-seed mutation request before recomputing event context')
  }
  if (!bootstrapText.includes('const prepareEnsureSeedMutationRequest = React.useCallback((args?: {')) {
    throw new Error('expected source files bootstrap workspace seed sync to centralize ensure-seed mutation request preparation in a dedicated helper')
  }
  if (!bootstrapText.includes("const request = resolveWorkspaceFsMutationRequest(\n      { op: 'ensureSeed' },\n      { sourceFilesSnapshot, activePathRequest },\n    )")) {
    throw new Error('expected ensure-seed request preparation to reuse the canonical workspace-fs mutation request resolver with one prepared active-path context')
  }
  if (!bootstrapText.includes('pendingEnsureSeedMutationRequestRef.current = request')) {
    throw new Error('expected ensure-seed request preparation to retain the prepared mutation request for the follow-up workspace-fs event')
  }
  if (
    !bootstrapText.includes('type WorkspaceSeedSyncLifecycleState = {') ||
    !bootstrapText.includes('const clearWorkspaceSeedSyncTimer = React.useCallback((lifecycleState: WorkspaceSeedSyncLifecycleState) => {') ||
    !bootstrapText.includes('const resetWorkspaceSeedSyncWakeLifecycle = React.useCallback((lifecycleState: WorkspaceSeedSyncLifecycleState) => {') ||
    !bootstrapText.includes('const scheduleNextWorkspaceSeedSync = React.useCallback((args: {') ||
    !bootstrapText.includes('const scheduleNextWorkspaceSeedSyncPoll = React.useCallback((args: {') ||
    !bootstrapText.includes('nextRequest: WorkspaceSeedSyncRequest') ||
    !bootstrapText.includes('const cleanupWorkspaceSeedSyncLifecycle = React.useCallback((lifecycleState: WorkspaceSeedSyncLifecycleState) => {')
  ) {
    throw new Error('expected workspace seed sync polling lifecycle to centralize timer clearing, wake reset, backoff scheduling, and cleanup behind dedicated helpers')
  }
  if (!bootstrapText.includes('const runWorkspaceSeedSync = async (request: WorkspaceSeedSyncRequest) => {')) {
    throw new Error('expected workspace seed sync polling and wake flows to delegate ensureSeed execution through a dedicated request runner')
  }
  if (
    !bootstrapText.includes('const preparedRequest = resolvePreparedWorkspaceSeedSyncRequest(request)') ||
    !bootstrapText.includes('const applyPreparedWorkspaceSeedSyncRequest = React.useCallback((request: PreparedWorkspaceSeedSyncRequest) => {') ||
    !bootstrapText.includes('sourceFilesSnapshot: request.sourceFilesSnapshot,') ||
    !bootstrapText.includes('const handleWorkspaceSeedSyncRequestSuccess = React.useCallback((args: {') ||
    !bootstrapText.includes('const handleWorkspaceSeedSyncRequestFailure = React.useCallback((args: {') ||
    !bootstrapText.includes('applyPreparedWorkspaceSeedSyncRequest(args.preparedRequest)') ||
    !bootstrapText.includes('handleWorkspaceSeedSyncRequestSuccess({') ||
    !bootstrapText.includes('handleWorkspaceSeedSyncRequestFailure({')
  ) {
    throw new Error('expected workspace seed sync runner to capture one prepared request payload and delegate success/failure fanout through dedicated helpers that reuse its caller-owned sourceFiles snapshot')
  }
  if (
    !bootstrapText.includes("const WORKSPACE_SEED_SYNC_POLL_REQUEST: WorkspaceSeedSyncRequest = { source: 'bootstrap:poll' }") ||
    !bootstrapText.includes("const WORKSPACE_SEED_SYNC_WAKE_REQUEST: WorkspaceSeedSyncRequest = { source: 'bootstrap:wake' }") ||
    !bootstrapText.includes("const WORKSPACE_SEED_SYNC_MOUNT_REQUEST: WorkspaceSeedSyncRequest = { source: 'bootstrap:mount' }") ||
    !bootstrapText.includes('nextRequest: WORKSPACE_SEED_SYNC_POLL_REQUEST,') ||
    !bootstrapText.includes('scheduleNextWorkspaceSeedSyncPoll({') ||
    !bootstrapText.includes('void runWorkspaceSeedSync(WORKSPACE_SEED_SYNC_WAKE_REQUEST)') ||
    !bootstrapText.includes('void runWorkspaceSeedSync(WORKSPACE_SEED_SYNC_MOUNT_REQUEST)')
  ) {
    throw new Error('expected workspace seed sync mount, poll, and wake flows to reuse canonical seed-sync request constants instead of reshaping equivalent request payloads inline')
  }
  if (!bootstrapText.includes('const clearPreparedEnsureSeedMutationRequest = React.useCallback(() => {') || !bootstrapText.includes('clearPreparedEnsureSeedMutationRequest()') || !bootstrapText.includes('cleanupWorkspaceSeedSyncLifecycle(lifecycleState)')) {
    throw new Error('expected workspace seed sync cleanup and failure paths to clear any prepared ensure-seed mutation request through dedicated lifecycle helpers')
  }
  if (!runtimeMaterializationText.includes('const shouldApplyToGraph = args?.applyToGraph === true')) {
    throw new Error('expected shared materialization runtime to require explicit graph ownership inside the dedicated materialization helper instead of implicit initialization-path apply')
  }
  if (runtimeMaterializationText.includes('parseCanvasWorkspaceFrontmatterPreset(activeWorkspaceText)')) {
    throw new Error('expected shared materialization runtime to avoid duplicate frontmatter preset parsing in source-files rematerialization path')
  }
  if (
    !runtimeStartupText.includes('const snapshot = buildInitialWorkspaceStartupSnapshot({') ||
    !runtimeStartupText.includes('const activePathToApply = resolveWorkspaceStartupActivePathToApply({') ||
    !runtimeStartupText.includes('useMarkdownExplorerStore.getState().setActivePath(activePathToApply)')
  ) {
    throw new Error('expected dedicated startup runtime helper to own startup snapshot branching and guarded explorer active-path initialization')
  }
  if (!bootstrapText.includes('reusableWorkspaceSourcesByPathRef.current = null')) {
    throw new Error('expected source files bootstrap rematerialization path to invalidate the cached source-index snapshot when workspace inputs change')
  }
}

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
  const bootstrapText = readFileSync(bootstrapPath, 'utf8')

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

  if (!text.includes("await focusAfterImport(createdPath, { applyToGraph, jobId })")) {
    throw new Error('expected local workspace import focus to reuse the shared graph-apply decision when activating the imported file')
  }
  if (!text.includes("await focusAfterImport(createdPath, { sourceUrl, applyToGraph, jobId })")) {
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
  const websitePath = resolve(process.cwd(), 'src', 'features', 'markdown-workspace', 'useWorkspaceFileActions', 'websiteImportAction.ts')
  const coreText = readFileSync(corePath, 'utf8')
  const mutationText = readFileSync(mutationPath, 'utf8')
  const websiteText = readFileSync(websitePath, 'utf8')

  if (!coreText.includes('runWorkspaceFsChangedBatch(async () => {') || !coreText.includes('suppressNextWorkspaceFsChangedEvent()')) {
    throw new Error('expected create file/folder actions to batch filesystem changes and suppress duplicate follow-up fs refresh')
  }
  if (!mutationText.includes('await runWorkspaceFsChangedBatch(async () => {') || !mutationText.includes('suppressNextWorkspaceFsChangedEvent()')) {
    throw new Error('expected delete/rename actions to batch filesystem changes and suppress duplicate follow-up fs refresh')
  }
  if (!websiteText.includes('runWorkspaceFsChangedBatch(async () => {') || !websiteText.includes('suppressNextWorkspaceFsChangedEvent()')) {
    throw new Error('expected website import action to suppress duplicate follow-up fs refresh when it manually refreshes workspace state')
  }
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
  if (!documentActionsText.includes('if (applyViewPresetForSwitch) {\n        get().setGraphData(buildPendingMarkdownDocumentGraph({')
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
  if (!hashFnSection.includes('hashKnowgrphStorageContent(file.text)')) {
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
  const graphHashFnEnd = text.indexOf('export const buildKnowgrphWorkspaceIdFromSourceFilesWorkspaceState = (', graphHashFnStart)
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

export function testSourceFilesBootstrapSkipsQueueEchoDuringInboundStorageApply() {
  const bootstrapPath = resolve(process.cwd(), 'src', 'features', 'source-files', 'SourceFilesPersistenceBootstrap.tsx')
  const text = readFileSync(bootstrapPath, 'utf8')
  if (!text.includes('const knowgrphInboundApplyOperations = React.useMemo(createKnowgrphStorageOperationTracker, [])')) {
    throw new Error('expected source files bootstrap to track overlapping inbound storage-apply windows for queue echo suppression')
  }
  if (!text.includes('const operation = knowgrphInboundApplyOperations.begin()')) {
    throw new Error('expected source files bootstrap storage pull apply path to claim an exact operation token before mutating sourceFiles')
  }
  if (!text.includes('knowgrphInboundApplyOperations.finish(operation)')) {
    throw new Error('expected source files bootstrap storage pull apply path to release only its exact operation token')
  }
  if (!text.includes('const applySourceFilesPersistenceStorageRequest = React.useCallback((request: SourceFilesPersistenceEffectRequest) => {') || !text.includes('if (knowgrphInboundApplyOperations.isActive()) return')) {
    throw new Error('expected source files persistence side effects to skip queuing outbound storage sync during inbound pull apply windows through the dedicated storage helper')
  }
  if (!text.includes('type KnowgrphStorageQueueRequest = {') || !text.includes('const pendingKnowgrphStorageQueueRequestRef = React.useRef<KnowgrphStorageQueueRequest | null>(null)')) {
    throw new Error('expected source files storage queue scheduling to centralize latest debounced sync payloads behind a dedicated knowgrph storage queue request')
  }
  if (!text.includes('const resolveKnowgrphStorageQueueRequest = React.useCallback((args?: {')) {
    throw new Error('expected source files storage queue scheduling to centralize request resolution behind a dedicated helper')
  }
  if (!text.includes('type KnowgrphStorageWorkspaceRequest = {') || !text.includes('const resolveKnowgrphStorageWorkspaceRequest = React.useCallback((args: {')) {
    throw new Error('expected source files knowgrph storage workspace lifecycle to centralize workspace start payloads behind a dedicated request shape and resolver')
  }
  if (!text.includes('type KnowgrphStorageWorkspaceSelection = {') || !text.includes('const readKnowgrphStorageWorkspaceSelection = React.useCallback((')) {
    throw new Error('expected source files knowgrph storage workspace lifecycle to centralize caller-owned workspace-state plus sourceFiles snapshot selection behind a dedicated helper')
  }
  if (!text.includes('type SourceFilesPersistenceEffectRequest = {') || !text.includes('const resolveSourceFilesPersistenceEffectRequest = React.useCallback((')) {
    throw new Error('expected source files persistence subscription to centralize same-snapshot storage queue and compose effect derivation behind a dedicated request helper')
  }
  if (!text.includes('type ActivePathMaterializationSelection = {') || !text.includes('const readActivePathMaterializationSelection = React.useCallback((')) {
    throw new Error('expected source files active-path sync to centralize caller-owned active path, sourceFiles snapshot, and workspace entries selection behind a dedicated helper')
  }
  if (!text.includes('initialQueueRequest: KnowgrphStorageQueueRequest | null')) {
    throw new Error('expected source files knowgrph storage workspace lifecycle request to carry a prebuilt initial storage queue request for queue scheduling reuse')
  }
  if (!text.includes('const applyKnowgrphStorageWorkspaceRequest = React.useCallback((request: KnowgrphStorageWorkspaceRequest) => {')) {
    throw new Error('expected source files knowgrph storage workspace lifecycle to centralize cleanup, runtime restart, and initial queue scheduling in a dedicated helper')
  }
  if (!text.includes('const stopKnowgrphStorageWorkspaceRuntime = React.useCallback((args?: {')) {
    throw new Error('expected source files knowgrph storage workspace lifecycle teardown to centralize task cancel, runtime cleanup, and queue reset in a dedicated helper')
  }
  if (!text.includes('const startKnowgrphStorageWorkspaceRuntime = React.useCallback((request: KnowgrphStorageWorkspaceRequest) => {')) {
    throw new Error('expected source files knowgrph storage workspace lifecycle start path to centralize storage sync loop startup and callback wiring in a dedicated helper')
  }
  if (!text.includes('const handleKnowgrphStorageSyncCompleted = React.useCallback((result: {') || !text.includes('const createKnowgrphStoragePulledChangesHandler = React.useCallback((')) {
    throw new Error('expected source files knowgrph storage callbacks to centralize completion and captured-ownership pulled-change handling')
  }
  if ((text.match(/onPulledChangesApplied: createKnowgrphStoragePulledChangesHandler\(ownership\)/g) || []).length !== 2) {
    throw new Error('expected both loop startup and queue-sync follow-up to bind a pulled-change handler to captured workspace ownership')
  }
  if (!text.includes('const applyKnowgrphStorageQueueTransition = React.useCallback((args?: {')) {
    throw new Error('expected inbound storage apply queue-state transitions to centralize sourceFiles-to-queue normalization plus queue snapshot remembering in a dedicated helper')
  }
  if (!text.includes('const handleKnowgrphStorageQueueRequestSuccess = React.useCallback((args: {') || !text.includes('const handleKnowgrphStorageQueueRequestFailure = React.useCallback((request: KnowgrphStorageQueueRequest) => {')) {
    throw new Error('expected source files storage queue execution to centralize success and failure state transitions behind dedicated helpers')
  }
  if (!text.includes('type KnowgrphStorageQueueSyncFollowUpRequest = {') || !text.includes('const resolveKnowgrphStorageQueueSyncFollowUpRequest = React.useCallback((args: {')) {
    throw new Error('expected source files storage queue follow-up scheduling to centralize request-owned conflict-sync payload resolution behind a dedicated helper')
  }
  if (!text.includes('const runKnowgrphStorageQueueSyncFollowUpRequest = React.useCallback((request: KnowgrphStorageQueueSyncFollowUpRequest) => {')) {
    throw new Error('expected source files storage queue follow-up scheduling to centralize sync execution behind a dedicated follow-up request runner')
  }
  if (!text.includes('onSyncCompleted: handleKnowgrphStorageSyncCompleted')) {
    throw new Error('expected source files loop and follow-up sync completion to reuse the centralized conflict notification helper')
  }
  if (!text.includes('const scheduleKnowgrphStorageQueueSyncFollowUp = React.useCallback((args: {')) {
    throw new Error('expected source files storage queue success path to centralize post-sync conflict follow-up scheduling behind a dedicated helper')
  }
  if (!text.includes('const runKnowgrphStorageQueueRequest = React.useCallback((request: KnowgrphStorageQueueRequest) => {')) {
    throw new Error('expected source files storage queue scheduling to centralize sync execution behind a dedicated request runner')
  }
  if (!text.includes('const scheduleKnowgrphStorageQueueRequest = React.useCallback((request: KnowgrphStorageQueueRequest | null) => {')) {
    throw new Error('expected source files storage queue scheduling to centralize request-owned debounce execution in a dedicated helper')
  }
  if (!text.includes('const drainKnowgrphStorageQueueRequest = React.useCallback(() => {')) {
    throw new Error('expected source files storage queue scheduling to centralize debounced request draining behind a dedicated helper')
  }
  if (!text.includes('const applySourceFilesPersistenceEffectRequest = React.useCallback((request: SourceFilesPersistenceEffectRequest) => {')) {
    throw new Error('expected source files persistence subscription to centralize storage queue scheduling and compose apply decisions behind a dedicated request runner')
  }
  if (!text.includes('if (lastQueuedKnowgrphStorageSignatureRef.current === request.signature) return') || !text.includes('if (pendingKnowgrphStorageQueueRequestRef.current?.signature === request.signature) return')) {
    throw new Error('expected source files storage queue scheduling to skip redundant debounce churn when the same storage signature is already applied or already pending')
  }
  if (!text.includes('const nextRequest = pendingKnowgrphStorageQueueRequestRef.current') || !text.includes('runKnowgrphStorageQueueRequest(nextRequest)') || !text.includes('scheduleWorkspaceSyncTask(') || !text.includes('drainKnowgrphStorageQueueRequest,')) {
    throw new Error('expected source files storage queue scheduling to centralize debounced draining behind a helper that runs the latest pending knowgrph storage request instead of rereading sourceFiles from store state inside the delayed task')
  }
  if (!text.includes('handleKnowgrphStorageQueueRequestSuccess({') || !text.includes('handleKnowgrphStorageQueueRequestFailure(request)')) {
    throw new Error('expected source files storage queue runner to delegate result-state mutations to the dedicated success and failure helpers')
  }
  if (!text.includes('scheduleKnowgrphStorageQueueSyncFollowUp({')) {
    throw new Error('expected source files storage queue success handler to delegate post-sync conflict follow-up scheduling to the dedicated helper')
  }
  if (!text.includes('const request = resolveKnowgrphStorageQueueSyncFollowUpRequest(args)') || !text.includes('if (!request) return')) {
    throw new Error('expected source files storage queue follow-up scheduler to consume a dedicated follow-up request instead of assembling conflict-sync payloads inline')
  }
  if (!text.includes('runKnowgrphStorageQueueSyncFollowUpRequest(request)')) {
    throw new Error('expected source files storage queue follow-up scheduler to delegate execution to the dedicated follow-up request runner')
  }
  if (!text.includes('onSyncCompleted: handleKnowgrphStorageSyncCompleted')) {
    throw new Error('expected source files storage queue follow-up scheduling to reuse the centralized sync-completed helper instead of inlining conflict-notify logic')
  }
  if (!text.includes('applyKnowgrphStorageQueueTransition({')) {
    throw new Error('expected inbound storage apply to reuse the dedicated queue-state transition helper after applying pulled changes')
  }
  if (!text.includes('const request = resolveKnowgrphStorageWorkspaceRequest({') || !text.includes('applyKnowgrphStorageWorkspaceRequest(request)')) {
    throw new Error('expected source files workspace-state subscription effect to become a thin shell over dedicated knowgrph storage workspace lifecycle helpers')
  }
  if (!text.includes('const sourceFilesSnapshot = readCallerOwnedSourceFilesSnapshot(args.sourceFilesSnapshot)')) {
    throw new Error('expected knowgrph storage workspace lifecycle request resolution to reuse a caller-owned or shared live sourceFiles snapshot instead of falling back to raw store reads')
  }
  if (!text.includes('const sourceFilesSnapshot = readCallerOwnedSourceFilesSnapshot(args?.sourceFilesSnapshot)')) {
    throw new Error('expected knowgrph storage queue request resolution to reuse a caller-owned or shared live sourceFiles snapshot instead of falling back to raw store reads')
  }
  if (!text.includes('const readKnowgrphStorageWorkspaceId = React.useCallback((args?: {') || !text.includes('const workspaceId = readKnowgrphStorageWorkspaceId({')) {
    throw new Error('expected knowgrph storage queue and workspace lifecycle request resolution to reuse one dedicated workspace ID selector instead of recomputing adjacent workspace ID branches inline')
  }
  if (!text.includes('const readKnowgrphStorageSyncSignature = React.useCallback((args: {') || !text.includes('storageSyncSignature: args?.storageSyncSignature,')) {
    throw new Error('expected knowgrph storage queue, lifecycle, and persistence paths to reuse one dedicated storage signature selector instead of rebuilding adjacent storage-signature branches inline')
  }
  if (!text.includes('const readBootstrapMountSourceFilesSnapshot = React.useCallback((args: {')) {
    throw new Error('expected source files bootstrap mount to centralize startup sourceFiles snapshot selection behind a dedicated helper')
  }
  if (!text.includes('const applyBootstrapInitialActivePathRequest = React.useCallback((request: ActivePathMaterializationRequest | null): void => {')) {
    throw new Error('expected source files bootstrap mount to centralize initial active-path request handoff behind a dedicated helper')
  }
  const bootstrapActivePathGuard = text.slice(text.indexOf('const applyBootstrapInitialActivePathRequest'), text.indexOf('const applyBootstrapInitialRematerializeRequest'))
  if (!bootstrapActivePathGuard.includes('shouldSkipActivePathMaterializationRequest(request)') || !bootstrapActivePathGuard.includes("throw new Error('Canvas source selection changed after graph-owning startup materialization')") || bootstrapActivePathGuard.includes('runActivePathMaterialization(request)') || !text.includes('composeRequest: args.bootstrapMaterialization && !initialActivePathRequest')) {
    throw new Error('expected source files bootstrap mount to fail closed instead of publishing a passive active-path fallback')
  }
  if (!text.includes('scheduleKnowgrphStorageQueueRequest(request.initialQueueRequest)')) {
    throw new Error('expected knowgrph storage workspace lifecycle apply path to reuse the prebuilt initial queue request instead of rebuilding queue request context downstream')
  }
  if (!text.includes('stopKnowgrphStorageWorkspaceRuntime({') || !text.includes('stopKnowgrphStorageWorkspaceRuntime()')) {
    throw new Error('expected knowgrph storage workspace lifecycle start and cleanup paths to reuse the dedicated teardown helper instead of duplicating runtime reset branches inline')
  }
  if (!text.includes('startKnowgrphStorageWorkspaceRuntime(request)')) {
    throw new Error('expected knowgrph storage workspace lifecycle apply path to delegate storage loop startup to the dedicated start helper')
  }
  if (!text.includes('onSyncCompleted: handleKnowgrphStorageSyncCompleted') || !text.includes('onPulledChangesApplied: createKnowgrphStoragePulledChangesHandler(ownership)')) {
    throw new Error('expected knowgrph storage workspace runtime startup to reuse centralized completion and captured-ownership callback helpers')
  }
  if (!text.includes('type SourceFilesComposeRequest = {') || !text.includes('const storageSyncSignature = readKnowgrphStorageSyncSignature({') || !text.includes('const readSourceFilesCompositionSignature = React.useCallback((args: {') || !text.includes('const resolveSourceFilesComposeRequest = React.useCallback((args: {') || !text.includes('knowgrphStorageQueueRequest: resolveKnowgrphStorageQueueRequest({') || !text.includes('storageSyncSignature,') || !text.includes('composeRequest: resolveSourceFilesComposeRequest({')) {
    throw new Error('expected source files persistence and bootstrap compose handling to reuse one shared compose request shape plus dedicated signature helpers instead of shaping compose payloads independently')
  }
  if (!text.includes('const snapshot = readCallerOwnedSourceFilesSnapshot(sourceFilesSnapshot)')) {
    throw new Error('expected source files persistence effect request resolution to reuse a caller-owned or shared live sourceFiles snapshot instead of falling back to raw store reads')
  }
  if (!text.includes('const applySourceFilesPersistenceStorageRequest = React.useCallback((request: SourceFilesPersistenceEffectRequest) => {') || !text.includes('const applySuppressedSourceFilesPersistenceComposeRequest = React.useCallback((compositionSignature: string): boolean => {') || !text.includes('const scheduleSourceFilesPersistenceComposeRequest = React.useCallback((compositionSignature: string) => {') || !text.includes('const applySourceFilesPersistenceComposeRequest = React.useCallback((request: SourceFilesPersistenceEffectRequest) => {') || !text.includes('applySourceFilesPersistenceStorageRequest(request)') || !text.includes('applySourceFilesPersistenceComposeRequest(request)')) {
    throw new Error('expected source files persistence side effects to delegate storage scheduling, compose suppression, and compose scheduling through dedicated helpers instead of keeping inline apply branches')
  }
  if (!text.includes('const startForWorkspaceSelection = (selection: KnowgrphStorageWorkspaceSelection) => {') || !text.includes('s => readKnowgrphStorageWorkspaceSelection(s)')) {
    throw new Error('expected source files workspace-state subscription to thread one caller-owned workspace selection through the knowgrph storage workspace resolver instead of rereading store state inline')
  }
  if (!text.includes('const latestSourceFilesSnapshotRef = React.useRef<ReturnType<typeof useGraphStore.getState>[\'sourceFiles\']>([])') || !text.includes('state => state.sourceFiles,')) {
    throw new Error('expected source files runtime hot paths to keep one shared live caller-owned sourceFiles snapshot ref instead of rereading graph store state in adjacent subscriptions')
  }
  if (!text.includes('const readCallerOwnedSourceFilesSnapshot = React.useCallback((') || !text.includes('if (Array.isArray(latestSourceFilesSnapshotRef.current)) return latestSourceFilesSnapshotRef.current')) {
    throw new Error('expected source files runtime mutation paths to prefer a caller-owned snapshot first and otherwise reuse the shared live sourceFiles snapshot ref before falling back to store reads')
  }
  if (!text.includes('const sourceFilesSnapshot = readCallerOwnedSourceFilesSnapshot(args?.sourceFilesSnapshot)') || !text.includes('const snapshot = readCallerOwnedSourceFilesSnapshot(sourceFiles)')) {
    throw new Error('expected source files rematerialization and workspace-candidate gating paths to reuse the caller-owned/shared-live sourceFiles snapshot helper instead of raw store fallback reads')
  }
  if (!text.includes('sourceFilesSnapshot: readCallerOwnedSourceFilesSnapshot(args?.sourceFilesSnapshot),')) {
    throw new Error('expected active-path materialization request resolution to reuse the caller-owned/shared-live sourceFiles snapshot helper instead of raw store fallback reads')
  }
  if (!text.includes('const clearActivePathMaterializationRequest = React.useCallback(() => {') || !text.includes('const queueActivePathMaterializationRequest = React.useCallback((request: ActivePathMaterializationRequest) => {') || !text.includes('const shouldSkipActivePathMaterializationRequest = React.useCallback((request: ActivePathMaterializationRequest): boolean => {')) {
    throw new Error('expected active-path materialization to centralize missing-request reset, queued retry retention, and skip gating behind dedicated request helpers')
  }
  if (!text.includes('if (!request.composeRequest.shouldScheduleCompose) return') || !text.includes('if (applySuppressedSourceFilesPersistenceComposeRequest(compositionSignature)) return') || !text.includes('scheduleSourceFilesPersistenceComposeRequest(compositionSignature)')) {
    throw new Error('expected source files persistence compose handling to skip workspace-only source switching and delegate suppression plus scheduling through dedicated helpers')
  }
  if (!text.includes('const request = resolveSourceFilesPersistenceEffectRequest(next as never)') || !text.includes('applySourceFilesPersistenceEffectRequest(request)')) {
    throw new Error('expected source files persistence subscription to become a thin shell over the dedicated persistence effect request and runner helpers')
  }
  if (!text.includes('const syncForActivePathSelection = (selection: ActivePathMaterializationSelection) => {') || !text.includes('syncForActivePathSelection(readActivePathMaterializationSelection(state))')) {
    throw new Error('expected source files active-path effect to become a thin shell over the dedicated active-path selection helper instead of rereading sourceFiles inline on every explorer path change')
  }
  if (!text.includes('clearActivePathMaterializationRequest()') || !text.includes('queueActivePathMaterializationRequest(request)') || !text.includes('if (shouldSkipActivePathMaterializationRequest(request)) return')) {
    throw new Error('expected active-path sync execution path to reuse the dedicated request helpers instead of mutating retry/skip state inline')
  }
  if (!text.includes('const sourceFilesSnapshot = readBootstrapMountSourceFilesSnapshot({') || !text.includes('applyBootstrapInitialActivePathRequest(request.initialActivePathRequest)')) {
    throw new Error('expected source files bootstrap mount resolution and apply paths to reuse dedicated startup helpers for sourceFiles snapshot selection and initial active-path request handoff')
  }
  if (!text.includes('sourceFilesSnapshot: latestSourceFilesSnapshotRef.current,')) {
    throw new Error('expected source files active-path and workspace lifecycle selection helpers to reuse the shared live sourceFiles snapshot ref instead of building fresh snapshots per subscription path')
  }
  if (!text.includes('const sourceFilesSnapshot = readCallerOwnedSourceFilesSnapshot(args?.sourceFilesSnapshot)')) {
    throw new Error('expected workspace-fs mutation request resolution to reuse a caller-owned or shared live sourceFiles snapshot before falling back to store reads')
  }
  if (!readFileSync(resolve(process.cwd(), 'src', 'features', 'source-files', 'sourceFilesInboundStorageApply.ts'), 'utf8').includes('sourceFilesSnapshot: SourceFile[]')) {
    throw new Error('expected inbound storage apply to return the exact sourceFiles snapshot it materialized so callers can reuse it without rereading store state')
  }
  if (!text.includes('sourceFilesSnapshot: result.sourceFilesSnapshot,')) {
    throw new Error('expected knowgrph storage inbound apply handling to reuse the sourceFiles snapshot returned by inbound storage apply instead of rereading store state after mutation')
  }
}

export function testSourceFilesBootstrapGuardsSafariStorageSyncHotPath() {
  const bootstrapPath = resolve(process.cwd(), 'src', 'features', 'source-files', 'SourceFilesPersistenceBootstrap.tsx')
  const bootstrapStartupPath = resolve(process.cwd(), 'src', 'features', 'source-files', 'sourceFilesBootstrapStartup.ts')
  const text = readFileSync(bootstrapPath, 'utf8')
  const startupText = readFileSync(bootstrapStartupPath, 'utf8')
  if (text.includes('isWebKitSafariBrowser')) {
    throw new Error('expected source files bootstrap runtime path to stay browser-neutral and avoid Safari-specific forks')
  }
  if (text.includes('_SAFARI_GUARDED')) {
    throw new Error('expected source files bootstrap runtime path to remove Safari-specific guard branches in favor of shared semantic no-op scheduling')
  }
  if (!text.includes('const reusableWorkspaceEntriesRef = React.useRef<ReturnType<typeof readReusableWorkspaceEntriesSnapshot>>(undefined)')) {
    throw new Error('expected source files bootstrap to cache reusable workspace entry snapshots for active-path materialization hot paths')
  }
  if (!text.includes('invalidateCachedWorkspaceActiveEntrySnapshot')) {
    throw new Error('expected source files bootstrap to invalidate bounded active-entry cache on workspace-fs mutations')
  }
  if (!text.includes('reusableWorkspaceEntriesRef.current = readReusableWorkspaceEntriesSnapshot(hydratedWorkspaceEntries)')) {
    throw new Error('expected source files rematerialization path to refresh reusable workspace entry snapshot cache')
  }
  if (!text.includes('activeWorkspaceEntriesSnapshot: readReusableWorkspaceEntriesSnapshot(hydratedWorkspaceEntries)')) {
    throw new Error('expected source files rematerialization path to pass the hydrated active-entry snapshot directly into materialization instead of forcing a second snapshot read')
  }
  if (!text.includes('premergedSourceFiles: runtimeMerged')) {
    throw new Error('expected source files rematerialization path to pass the already-merged active source-files snapshot directly into shared materialization')
  }
  if (!text.includes('fs: reusableWorkspaceFsRef.current || undefined')) {
    throw new Error('expected active-path materialization to reuse cached workspace fs instance instead of refetching per switch')
  }
  if (!text.includes('workspaceEntries: reusableWorkspaceEntriesRef.current')) {
    throw new Error('expected active-path materialization to reuse cached workspace entries instead of full listEntries hot-path reload')
  }
  if (!text.includes('activeWorkspaceEntriesSnapshot: request.workspaceEntriesSnapshot')) {
    throw new Error('expected active-path switch materialization to pass the cached active-entry snapshot from the queued request directly into the shared materialization helper')
  }
  if (!text.includes('sourcesByPath: reusableWorkspaceSourcesByPathRef.current || undefined')) {
    throw new Error('expected active-path materialization to reuse cached workspace source index snapshot')
  }
  if (startupText.includes('isWebKitSafariBrowser') || startupText.includes('_SAFARI_GUARDED')) {
    throw new Error('expected source files bootstrap startup path to avoid browser-specific guard branches and reuse shared runtime behavior')
  }
  if (!startupText.includes('const hydratedEntries = await hydrateWorkspaceEntriesInlineText({')) {
    throw new Error('expected source files bootstrap startup to use a shared inline hydration path across browsers')
  }
  if (!startupText.includes('activeWorkspaceEntriesSnapshot: workspaceEntries') &&
    !startupText.includes('activeWorkspaceEntriesSnapshot: readReusableWorkspaceEntriesSnapshot(context.hydratedEntries)') &&
    !startupText.includes('activeWorkspaceEntriesSnapshot: readReusableWorkspaceEntriesSnapshot(hydratedEntries)')
  ) {
    throw new Error('expected source files bootstrap startup to pass the hydrated active-entry snapshot directly into shared materialization')
  }
  if (!startupText.includes('buildActiveWorkspaceRuntimeSourceFilesSnapshot({')) {
    throw new Error('expected source files bootstrap startup to reuse the shared active runtime source-files shaping helper')
  }
  if (!startupText.includes("import { useMarkdownExplorerStore } from '@/features/markdown-explorer/store'")
    || !startupText.includes('function hasBootstrapActivePathDrifted(')
    || !startupText.includes('explorerActivePath: useMarkdownExplorerStore.getState().activePath')
    || !startupText.includes('if (hasBootstrapActivePathDrifted(context.startupActivePath)) continue')) {
    throw new Error('expected source files bootstrap startup to retry graph-owning materialization when the active Source Files path changes before bootstrap apply')
  }
  if (!startupText.includes('premergedSourceFiles: context.mergedSourceFiles')) {
    throw new Error('expected source files bootstrap startup to pass the already-merged active source-files snapshot from the dedicated startup context directly into shared materialization')
  }
  const cacheText = readFileSync(resolve(process.cwd(), 'src', 'features', 'source-files', 'workspaceActiveEntryCache.ts'), 'utf8')
  if (!cacheText.includes('ACTIVE_ENTRY_CACHE_MAX_PATHS') || !cacheText.includes('ACTIVE_ENTRY_CACHE_MAX_TOTAL_CHARS')) {
    throw new Error('expected active workspace entry cache to stay bounded by entry count and total text size')
  }
}

export function testWorkspaceActiveMaterializationSkipsImportWhenGraphApplyDisabled() {
  const runtimeSharedPath = resolve(process.cwd(), 'src', 'features', 'source-files', 'sourceFilesRuntimeShared.ts')
  const runtimeActivePath = resolve(process.cwd(), 'src', 'features', 'source-files', 'sourceFilesRuntimeActive.ts')
  const runtimeMaterializationPath = resolve(process.cwd(), 'src', 'features', 'source-files', 'sourceFilesRuntimeMaterialization.ts')
  const runtimeStartupPath = resolve(process.cwd(), 'src', 'features', 'source-files', 'sourceFilesRuntimeStartup.ts')
  const runtimeSharedText = readFileSync(runtimeSharedPath, 'utf8')
  const runtimeActiveText = readFileSync(runtimeActivePath, 'utf8')
  const runtimeMaterializationText = readFileSync(runtimeMaterializationPath, 'utf8')
  const runtimeStartupText = readFileSync(runtimeStartupPath, 'utf8')
  if (runtimeMaterializationText.includes('isWebKitSafariBrowser') || runtimeMaterializationText.includes('RUNTIME_ACTIVE_MATERIALIZE_SAFARI_GUARDED')) {
    throw new Error('expected runtime active materialization helper to stay browser-neutral and avoid Safari-specific short-circuit forks')
  }
  if (!runtimeSharedText.includes("from '@/features/source-files/sourceFilesRuntimeStartup'")) {
    throw new Error('expected runtime shared module to re-export startup APIs from the dedicated startup runtime module')
  }
  if (
    !runtimeSharedText.includes("hydrateWorkspaceEntriesInlineText,\n  readReusableWorkspaceEntriesSnapshot,\n  readWorkspaceActiveEntrySnapshot,\n  readWorkspaceSourceRootEntriesSnapshot,\n} from '@/features/source-files/sourceFilesRuntimeActive'") ||
    !runtimeSharedText.includes("buildActiveWorkspaceRuntimeSourceFilesSnapshot,\n  buildMaterializedWorkspaceActivePathKey,\n  buildMaterializedWorkspaceForceIncludePaths,\n  materializeActiveWorkspaceEntryIntoSourceFiles,\n  resolveMaterializedWorkspaceActivePath,\n} from '@/features/source-files/sourceFilesRuntimeMaterialization'")
  ) {
    throw new Error('expected runtime shared facade to keep active-resolution exports separate from path/materialization exports')
  }
  if (runtimeSharedText.includes('export function buildInitialWorkspaceStartupSnapshot(args:') || runtimeSharedText.includes('export async function resolveInitialWorkspaceStartupState')) {
    throw new Error('expected runtime shared module to stay implementation-free once startup logic moves into the dedicated startup runtime module')
  }
  if (!runtimeStartupText.includes('export async function resolveInitialWorkspaceStartupState(args?: { fs?: WorkspaceFs }):') || !runtimeStartupText.includes('const snapshot = buildInitialWorkspaceStartupSnapshot({')) {
    throw new Error('expected dedicated startup runtime module to own startup snapshot resolution and initialization flow')
  }
  if (!runtimeMaterializationText.includes('const activeSourcePath = resolveWorkspaceSourcePathKey(activePath)')) {
    throw new Error('expected workspace active materialization to resolve active source path key for non-graph fast path reuse')
  }
  if (!runtimeMaterializationText.includes('async function resolveNonGraphActiveWorkspaceSourceFiles(args:')) {
    throw new Error('expected workspace active materialization to centralize the non-graph active-source fast path in a shared helper')
  }
  if (!runtimeMaterializationText.includes('async function materializeGraphOwningActiveWorkspaceSourceFiles(args:')) {
    throw new Error('expected workspace active materialization to centralize the graph-owning branch in a shared helper')
  }
  if (!runtimeMaterializationText.includes('const materializedSourceFiles = premergedSourceFiles || existing')) {
    throw new Error('expected workspace active materialization to resolve one prepared source-files snapshot before reusing or rebuilding active workspace state')
  }
  if (!runtimeMaterializationText.includes('const next = await resolveNonGraphActiveWorkspaceSourceFiles({')) {
    throw new Error('expected workspace active materialization to delegate non-graph active-source handling to the shared helper')
  }
  if (
    !runtimeActiveText.includes('export function readProvidedActiveWorkspaceEntriesSnapshot(args:') ||
    (
      !runtimeActiveText.includes('export async function resolveActiveWorkspaceEntriesSnapshot(args:') &&
      !runtimeMaterializationText.includes('const workspaceEntries = await resolveActiveWorkspaceEntriesSnapshot({')
    )
  ) {
    throw new Error('expected workspace active materialization to centralize caller-provided vs fallback active-entry snapshot selection in a shared resolver')
  }
  if (!runtimeActiveText.includes('export function readProvidedActiveWorkspaceEntriesSnapshot(args:')) {
    throw new Error('expected workspace active materialization to centralize reuse of provided active-entry snapshots before falling back to active-entry reads')
  }
  if (!runtimeActiveText.includes('export async function resolveActiveWorkspaceEntriesSnapshot(args:')) {
    throw new Error('expected workspace active materialization to centralize active-entry snapshot source selection in a shared resolver')
  }
  if (!runtimeActiveText.includes('export async function readWorkspaceActiveDocumentResolvedText(args:')) {
    throw new Error('expected workspace active materialization runtime to centralize active-document text resolution behind one shared helper')
  }
  if (!runtimeActiveText.includes('const fallbackText = await readWorkspaceActiveDocumentResolvedText({')) {
    throw new Error('expected workspace entry hydration to reuse the shared active-document text resolver instead of owning a separate fallback ladder')
  }
  if (!runtimeActiveText.includes('export async function readActiveWorkspaceSourceFileFallbackText(args:')) {
    throw new Error('expected workspace active materialization to centralize non-graph active-source text backfill in a shared helper')
  }
  if (!runtimeMaterializationText.includes('premergedSourceFiles?: SourceFile[]')) {
    throw new Error('expected workspace active materialization to accept premerged source-files snapshots from adjacent callers')
  }
  if (!runtimeMaterializationText.includes('sourceFilesSnapshot?: SourceFile[]')) {
    throw new Error('expected workspace active materialization to accept caller-provided sourceFiles snapshots so hot paths can avoid rereading store state')
  }
  if (!runtimeMaterializationText.includes('const premergedSourceFiles = Array.isArray(args?.premergedSourceFiles) ? args.premergedSourceFiles : null')) {
    throw new Error('expected workspace active materialization to normalize caller-provided premerged source-files snapshots before reusing them')
  }
  if (!runtimeMaterializationText.includes('const existing = Array.isArray(args?.sourceFilesSnapshot) ? args.sourceFilesSnapshot : (Array.isArray(store.sourceFiles) ? store.sourceFiles : [])')) {
    throw new Error('expected workspace active materialization to reuse caller-provided sourceFiles snapshots before falling back to store reads')
  }
  if (!runtimeActiveText.includes('readCachedWorkspaceActiveEntrySnapshot({') || !runtimeActiveText.includes('rememberWorkspaceActiveEntrySnapshot({')) {
    throw new Error('expected workspace active entry snapshots to reuse a bounded cache when switching back to recently opened Source Files')
  }
  if (!runtimeActiveText.includes('text = await readWorkspaceActiveDocumentResolvedText({')) {
    throw new Error('expected workspace active entry snapshot construction to reuse the shared active-document text resolver before caching')
  }
  if (!runtimeMaterializationText.includes('const workspaceEntries = await resolveActiveWorkspaceEntriesSnapshot({')) {
    throw new Error('expected workspace active materialization graph-owning path to resolve active-entry snapshots through the shared snapshot resolver')
  }
  if (!runtimeMaterializationText.includes('const fallbackText = await readActiveWorkspaceSourceFileFallbackText({')) {
    throw new Error('expected workspace active materialization non-graph path to delegate active-source text fallback hydration to the shared helper')
  }
  if (!runtimeActiveText.includes('return readWorkspaceActiveDocumentResolvedText({')) {
    throw new Error('expected active source-file fallback helper to delegate fs and storage fallback semantics to the shared active-document text resolver')
  }
  if (runtimeActiveText.includes('const text = await args.fs.readFileText(entry.path)')) {
    throw new Error('expected workspace entry hydration not to keep a separate direct file-read fallback branch once the shared active-document text resolver owns that path')
  }
  if (runtimeActiveText.includes('await readWorkspaceStorageDocFallbackText(entry.path, storageFallbackByPath)')) {
    throw new Error('expected workspace entry hydration not to keep a separate storage fallback branch once the shared active-document text resolver owns that path')
  }
  if (runtimeMaterializationText.includes('workspaceEntries.filter(entry => entry?.kind === \'file\' && entry.path === activePath)')) throw new Error('expected workspace active materialization non-graph path to avoid downstream filtering aliases and read the active entry at the source')
  if (!runtimeMaterializationText.includes('preserveExistingWorkspaceEntries: true')) throw new Error('expected workspace active materialization paths to preserve existing canonical workspace source files across active-entry refreshes')
  if (!runtimeMaterializationText.includes('const mergedSourceFiles = args.premergedSourceFiles || mergeWorkspaceEntriesIntoSourceFiles({')) {
    throw new Error('expected graph-owning workspace active materialization to reuse premerged source-files snapshots inside the dedicated graph-owning helper')
  }
  const marker = 'const shouldApplyToGraph = args?.applyToGraph === true'
  const markerIndex = runtimeMaterializationText.indexOf(marker)
  if (markerIndex < 0) {
    throw new Error('expected workspace active materialization to centralize shouldApplyToGraph guard in runtime shared helper')
  }
  const applyCallIndex = runtimeMaterializationText.indexOf('await materializeGraphOwningActiveWorkspaceSourceFiles({', markerIndex)
  if (applyCallIndex < 0) {
    throw new Error('expected workspace active materialization runtime helper to delegate graph-apply ownership to the dedicated graph-owning helper')
  }
  const between = runtimeMaterializationText.slice(markerIndex, applyCallIndex)
  if (!between.includes('if (!shouldApplyToGraph) return') && !between.includes('if (!shouldApplyToGraph) {')) {
    throw new Error('expected workspace active materialization to skip import-to-canvas hot path when graph apply is disabled')
  }
  const graphHelperStart = runtimeMaterializationText.indexOf('async function materializeGraphOwningActiveWorkspaceSourceFiles(args:')
  const graphHelperSection = graphHelperStart >= 0 ? runtimeMaterializationText.slice(graphHelperStart, graphHelperStart + 1800) : ''
  if (!graphHelperSection.includes('await applyWorkspaceImportToCanvas({')) {
    throw new Error('expected the dedicated graph-owning helper to retain import-to-canvas ownership')
  }
  if (graphHelperSection.includes('scheduleApplyGraphOwnerComposedGraphFromSourceFiles()')) {
    throw new Error('expected graph-owning workspace active materialization to let applyWorkspaceImportToCanvas own graph-owner compose scheduling')
  }
  if (!graphHelperSection.includes('premergedSourceFiles: mergedSourceFiles')) {
    throw new Error('expected the dedicated graph-owning helper to reuse the already-merged active source-files snapshot instead of rebuilding workspace-backed state in applyWorkspaceImportToCanvas')
  }
  if (!runtimeMaterializationText.includes('activeWorkspaceEntriesSnapshot: args?.activeWorkspaceEntriesSnapshot')) {
    throw new Error('expected workspace active materialization to reuse caller-provided active-entry snapshots in both fast-path and graph-owning paths')
  }
  if (!runtimeMaterializationText.includes('args?.sourceFilesSnapshot')) {
    throw new Error('expected workspace active materialization to consult caller-owned sourceFiles snapshots where available')
  }
  if (!runtimeSharedText.includes('export {') || !runtimeSharedText.includes('materializeActiveWorkspaceEntryIntoSourceFiles')) {
    throw new Error('expected source files runtime shared module to re-export the split materialization entrypoints')
  }
}

export function testMarkdownDocumentSettersStayDecoupledFromWorkspaceViewMode() {
  const graphSlicePath = resolve(process.cwd(), 'src', 'hooks', 'store', 'graphDataSlice.ts')
  const ingestPath = resolve(process.cwd(), 'src', 'features', 'source-files', 'sourceFilesIngestIntegration.ts')
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
