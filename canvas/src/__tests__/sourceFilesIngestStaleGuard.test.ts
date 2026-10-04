import { readSourceFilesBootstrapSource } from './helpers/sourceFilesBootstrapSource'
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
  if (!text.includes('pendingParseBySourceFileId')) {
    throw new Error('expected source file ingest parse path to track pending text hashes per file')
  }
  if (!text.includes("pending?.textHash === textHash && areSourceFileSourcesEqual(before.source, pending.source)")) {
    throw new Error('expected source file ingest parse path to skip duplicate parses for the same pending text')
  }
  if (!text.includes('pendingParseBySourceFileId.set(fileId, pendingJob)')) {
    throw new Error('expected source file ingest parse path to record the active pending text hash')
  }
  if (!text.includes('const token = await pendingJob.promise') || !text.includes('if (pendingParseBySourceFileId.get(fileId) === pendingJob) pendingParseBySourceFileId.delete(fileId)')) {
    throw new Error('expected source file ingest parse path to await the shared job and clear only its owned pending entry after completion')
  }
}

export function testSourceFilesIngestHydratesPendingUrlSourcesOnBootstrap() {
  const ingestPath = resolve(process.cwd(), 'src', 'features', 'source-files', 'sourceFilesIngestIntegration.ts')
  const bootstrapPath = resolve(process.cwd(), 'src', 'features', 'source-files', 'SourceFilesPersistenceBootstrap.tsx')
  const bootstrapStartupPath = resolve(process.cwd(), 'src', 'features', 'source-files', 'sourceFilesBootstrapStartup.ts')
  const ingestText = readFileSync(ingestPath, 'utf8')
  const bootstrapText = readSourceFilesBootstrapSource(bootstrapPath)
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
  const flightOwnerPath = resolve(process.cwd(), 'src', 'features', 'canvas', 'FlightSimRunReadyDemoRuntime.tsx')
  const text = readFileSync(startupPath, 'utf8')
  const debugText = readFileSync(startupDebugPath, 'utf8')
  const ssotBridgeText = readFileSync(startupSsotBridgePath, 'utf8')
  const flightOwnerText = readFileSync(flightOwnerPath, 'utf8')

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
  if (!flightOwnerText.includes('useSourceFilesBootstrapReady')) {
    throw new Error('expected the mounted Flight owner to gate persisted launch on current Source Files intent readiness')
  }
  if (
    !flightOwnerText.includes('ownsDocumentLaunchRef.current\n      || launchAttempt')
    || !flightOwnerText.includes(
      'launchAttempt >= FLIGHT_SIM_DOCUMENT_LAUNCH_ATTEMPT_LIMIT',
    )
  ) {
    throw new Error('expected Flight launch to wait without replacing its captured pre-active surface')
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
  const text = readSourceFilesBootstrapSource(bootstrapPath)

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
  const text = readSourceFilesBootstrapSource(bootstrapPath)

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
  const text = readSourceFilesBootstrapSource(bootstrapPath)
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
  const bootstrapText = readSourceFilesBootstrapSource(bootstrapPath)
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
  const ingestPath = resolve(process.cwd(), 'src', 'features', 'source-files', 'sourceFilesParseRuntime.ts')
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
  const bootstrapText = readSourceFilesBootstrapSource(bootstrapPath)

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

export {
  testMarkdownWorkspaceRuntimeReusesParsedWorkspaceSourceFileInsteadOfDirectGraphOverride,
  testWorkspaceBootstrapActivePathRematerializeAvoidsImplicitGraphApply,
  testWorkspaceActiveMaterializationSkipsImportWhenGraphApplyDisabled
} from './sourceFilesIngestStaleGuard.materialization.test'
export {
  testMarkdownApplyUsesDirectParserPathForActiveText,
  testMarkdownApplyActiveDocumentGuardRejectsStaleSourceSwitch,
  testPassiveSameTextSourceSyncDoesNotDisableActiveFrontmatterSwitchPreset,
  testWorkspaceCanvasAutoApplySkipsWidgetMode,
  testWorkspaceRefreshSetSourceFilesImmediatelySchedulesComposeApply,
  testWorkspaceImportActionsReuseRefreshSnapshotForApply,
  testWorkspaceImportFocusDoesNotDuplicateGraphApply,
  testWorkspaceManualRefreshActionsSuppressFollowUpFsEventRefresh,
  testWorkspaceInlineTextOwnershipIsCentralized,
  testWorkspaceWriteThroughAndActiveDocSyncOwnershipIsCentralized,
  testSourceFilesDbPersistsOnlyChangedRows,
  testSourceFilesStorageSyncDocumentHashDoesNotSelfDependOnParsedTextHash,
  testMarkdownDocumentSettersStayDecoupledFromWorkspaceViewMode
} from './sourceFilesIngestStaleGuard.workspace.test'
export {
  testSourceFilesBootstrapSkipsQueueEchoDuringInboundStorageApply,
  testSourceFilesBootstrapGuardsSafariStorageSyncHotPath
} from './sourceFilesIngestStaleGuard.storage.test'
