import { readSourceFilesBootstrapSource } from './helpers/sourceFilesBootstrapSource'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { useGraphStore } from '@/hooks/useGraphStore'

export function testSourceFilesBootstrapSkipsQueueEchoDuringInboundStorageApply() {
  const bootstrapPath = resolve(process.cwd(), 'src', 'features', 'source-files', 'SourceFilesPersistenceBootstrap.tsx')
  const text = readSourceFilesBootstrapSource(bootstrapPath)
  if (!text.includes('const agenticGraphInboundApplyOperations = React.useMemo(createAgenticGraphStorageOperationTracker, [])')) {
    throw new Error('expected source files bootstrap to track overlapping inbound storage-apply windows for queue echo suppression')
  }
  if (!text.includes('const operation = agenticGraphInboundApplyOperations.begin()')) {
    throw new Error('expected source files bootstrap storage pull apply path to claim an exact operation token before mutating sourceFiles')
  }
  if (!text.includes('agenticGraphInboundApplyOperations.finish(operation)')) {
    throw new Error('expected source files bootstrap storage pull apply path to release only its exact operation token')
  }
  if (!text.includes('const applySourceFilesPersistenceStorageRequest = React.useCallback((request: SourceFilesPersistenceEffectRequest) => {') || !text.includes('if (agenticGraphInboundApplyOperations.isActive()) return')) {
    throw new Error('expected source files persistence side effects to skip queuing outbound storage sync during inbound pull apply windows through the dedicated storage helper')
  }
  if (!text.includes('type AgenticGraphStorageQueueRequest = {') || !text.includes('const pendingAgenticGraphStorageQueueRequestRef = React.useRef<AgenticGraphStorageQueueRequest | null>(null)')) {
    throw new Error('expected source files storage queue scheduling to centralize latest debounced sync payloads behind a dedicated agentic-graph storage queue request')
  }
  if (!text.includes('const resolveAgenticGraphStorageQueueRequest = React.useCallback((args?: {')) {
    throw new Error('expected source files storage queue scheduling to centralize request resolution behind a dedicated helper')
  }
  if (!text.includes('type AgenticGraphStorageWorkspaceRequest = {') || !text.includes('const resolveAgenticGraphStorageWorkspaceRequest = React.useCallback((args: {')) {
    throw new Error('expected source files agentic-graph storage workspace lifecycle to centralize workspace start payloads behind a dedicated request shape and resolver')
  }
  if (!text.includes('type AgenticGraphStorageWorkspaceSelection = {') || !text.includes('const readAgenticGraphStorageWorkspaceSelection = React.useCallback((')) {
    throw new Error('expected source files agentic-graph storage workspace lifecycle to centralize caller-owned workspace-state plus sourceFiles snapshot selection behind a dedicated helper')
  }
  if (!text.includes('type SourceFilesPersistenceEffectRequest = {') || !text.includes('const resolveSourceFilesPersistenceEffectRequest = React.useCallback((')) {
    throw new Error('expected source files persistence subscription to centralize same-snapshot storage queue and compose effect derivation behind a dedicated request helper')
  }
  if (!text.includes('type ActivePathMaterializationSelection = {') || !text.includes('const readActivePathMaterializationSelection = React.useCallback((')) {
    throw new Error('expected source files active-path sync to centralize caller-owned active path, sourceFiles snapshot, and workspace entries selection behind a dedicated helper')
  }
  if (!text.includes('initialQueueRequest: AgenticGraphStorageQueueRequest | null')) {
    throw new Error('expected source files agentic-graph storage workspace lifecycle request to carry a prebuilt initial storage queue request for queue scheduling reuse')
  }
  if (!text.includes('const applyAgenticGraphStorageWorkspaceRequest = React.useCallback((request: AgenticGraphStorageWorkspaceRequest) => {')) {
    throw new Error('expected source files agentic-graph storage workspace lifecycle to centralize cleanup, runtime restart, and initial queue scheduling in a dedicated helper')
  }
  if (!text.includes('const stopAgenticGraphStorageWorkspaceRuntime = React.useCallback((args?: {')) {
    throw new Error('expected source files agentic-graph storage workspace lifecycle teardown to centralize task cancel, runtime cleanup, and queue reset in a dedicated helper')
  }
  if (!text.includes('const startAgenticGraphStorageWorkspaceRuntime = React.useCallback((request: AgenticGraphStorageWorkspaceRequest) => {')) {
    throw new Error('expected source files agentic-graph storage workspace lifecycle start path to centralize storage sync loop startup and callback wiring in a dedicated helper')
  }
  if (!text.includes('const handleAgenticGraphStorageSyncCompleted = React.useCallback((result: {') || !text.includes('const createAgenticGraphStoragePulledChangesHandler = React.useCallback((')) {
    throw new Error('expected source files agentic-graph storage callbacks to centralize completion and captured-ownership pulled-change handling')
  }
  if ((text.match(/onPulledChangesApplied: createAgenticGraphStoragePulledChangesHandler\(ownership\)/g) || []).length !== 2) {
    throw new Error('expected both loop startup and queue-sync follow-up to bind a pulled-change handler to captured workspace ownership')
  }
  if (!text.includes('const applyAgenticGraphStorageQueueTransition = React.useCallback((args?: {')) {
    throw new Error('expected inbound storage apply queue-state transitions to centralize sourceFiles-to-queue normalization plus queue snapshot remembering in a dedicated helper')
  }
  if (!text.includes('const handleAgenticGraphStorageQueueRequestSuccess = React.useCallback((args: {') || !text.includes('const handleAgenticGraphStorageQueueRequestFailure = React.useCallback((request: AgenticGraphStorageQueueRequest) => {')) {
    throw new Error('expected source files storage queue execution to centralize success and failure state transitions behind dedicated helpers')
  }
  if (!text.includes('type AgenticGraphStorageQueueSyncFollowUpRequest = {') || !text.includes('const resolveAgenticGraphStorageQueueSyncFollowUpRequest = React.useCallback((args: {')) {
    throw new Error('expected source files storage queue follow-up scheduling to centralize request-owned conflict-sync payload resolution behind a dedicated helper')
  }
  if (!text.includes('const runAgenticGraphStorageQueueSyncFollowUpRequest = React.useCallback((request: AgenticGraphStorageQueueSyncFollowUpRequest) => {')) {
    throw new Error('expected source files storage queue follow-up scheduling to centralize sync execution behind a dedicated follow-up request runner')
  }
  if (!text.includes('onSyncCompleted: handleAgenticGraphStorageSyncCompleted')) {
    throw new Error('expected source files loop and follow-up sync completion to reuse the centralized conflict notification helper')
  }
  if (!text.includes('const scheduleAgenticGraphStorageQueueSyncFollowUp = React.useCallback((args: {')) {
    throw new Error('expected source files storage queue success path to centralize post-sync conflict follow-up scheduling behind a dedicated helper')
  }
  if (!text.includes('const runAgenticGraphStorageQueueRequest = React.useCallback<SourceFilesCloudQueueRunner>((request, handleAgenticGraphStorageQueueRequestSuccess, handleAgenticGraphStorageQueueRequestFailure) => {')) {
    throw new Error('expected source files storage queue scheduling to centralize sync execution behind a dedicated request runner')
  }
  if (!text.includes('const scheduleAgenticGraphStorageQueueRequest = React.useCallback((request: AgenticGraphStorageQueueRequest | null) => {')) {
    throw new Error('expected source files storage queue scheduling to centralize request-owned debounce execution in a dedicated helper')
  }
  if (!text.includes('const drainAgenticGraphStorageQueueRequest = React.useCallback(() => {')) {
    throw new Error('expected source files storage queue scheduling to centralize debounced request draining behind a dedicated helper')
  }
  if (!text.includes('const applySourceFilesPersistenceEffectRequest = React.useCallback((request: SourceFilesPersistenceEffectRequest) => {')) {
    throw new Error('expected source files persistence subscription to centralize storage queue scheduling and compose apply decisions behind a dedicated request runner')
  }
  if (!text.includes('if (lastQueuedAgenticGraphStorageSignatureRef.current === request.signature) return') || !text.includes('if (pendingAgenticGraphStorageQueueRequestRef.current?.signature === request.signature) return')) {
    throw new Error('expected source files storage queue scheduling to skip redundant debounce churn when the same storage signature is already applied or already pending')
  }
  if (!text.includes('const nextRequest = pendingAgenticGraphStorageQueueRequestRef.current') || !text.includes('runAgenticGraphStorageQueueRequest(nextRequest, handleAgenticGraphStorageQueueRequestSuccess, handleAgenticGraphStorageQueueRequestFailure)') || !text.includes('scheduleWorkspaceSyncTask(') || !text.includes('drainAgenticGraphStorageQueueRequest,')) {
    throw new Error('expected source files storage queue scheduling to centralize debounced draining behind a helper that runs the latest pending agentic-graph storage request instead of rereading sourceFiles from store state inside the delayed task')
  }
  if (!text.includes('handleAgenticGraphStorageQueueRequestSuccess({') || !text.includes('handleAgenticGraphStorageQueueRequestFailure(queuedRequest)') || !text.includes('request: queuedRequest,')) {
    throw new Error('expected source files storage queue runner to delegate result-state mutations to the dedicated success and failure helpers')
  }
  if (!text.includes('scheduleAgenticGraphStorageQueueSyncFollowUp({')) {
    throw new Error('expected source files storage queue success handler to delegate post-sync conflict follow-up scheduling to the dedicated helper')
  }
  if (!text.includes('const request = resolveAgenticGraphStorageQueueSyncFollowUpRequest(args)') || !text.includes('if (!request) return')) {
    throw new Error('expected source files storage queue follow-up scheduler to consume a dedicated follow-up request instead of assembling conflict-sync payloads inline')
  }
  if (!text.includes('runAgenticGraphStorageQueueSyncFollowUpRequest(request)')) {
    throw new Error('expected source files storage queue follow-up scheduler to delegate execution to the dedicated follow-up request runner')
  }
  if (!text.includes('onSyncCompleted: handleAgenticGraphStorageSyncCompleted')) {
    throw new Error('expected source files storage queue follow-up scheduling to reuse the centralized sync-completed helper instead of inlining conflict-notify logic')
  }
  if (!text.includes('applyAgenticGraphStorageQueueTransition({')) {
    throw new Error('expected inbound storage apply to reuse the dedicated queue-state transition helper after applying pulled changes')
  }
  if (!text.includes('const request = resolveAgenticGraphStorageWorkspaceRequest({') || !text.includes('applyAgenticGraphStorageWorkspaceRequest(request)')) {
    throw new Error('expected source files workspace-state subscription effect to become a thin shell over dedicated agentic-graph storage workspace lifecycle helpers')
  }
  if (!text.includes('const sourceFilesSnapshot = readCallerOwnedSourceFilesSnapshot(args.sourceFilesSnapshot)')) {
    throw new Error('expected agentic-graph storage workspace lifecycle request resolution to reuse a caller-owned or shared live sourceFiles snapshot instead of falling back to raw store reads')
  }
  if (!text.includes('const sourceFilesSnapshot = readCallerOwnedSourceFilesSnapshot(args?.sourceFilesSnapshot)')) {
    throw new Error('expected agentic-graph storage queue request resolution to reuse a caller-owned or shared live sourceFiles snapshot instead of falling back to raw store reads')
  }
  if (!text.includes('const readAgenticGraphStorageWorkspaceId = React.useCallback((args?: {') || !text.includes('const workspaceId = readAgenticGraphStorageWorkspaceId({')) {
    throw new Error('expected agentic-graph storage queue and workspace lifecycle request resolution to reuse one dedicated workspace ID selector instead of recomputing adjacent workspace ID branches inline')
  }
  if (!text.includes('const readAgenticGraphStorageSyncSignature = React.useCallback((args: {') || !text.includes('storageSyncSignature: args?.storageSyncSignature,')) {
    throw new Error('expected agentic-graph storage queue, lifecycle, and persistence paths to reuse one dedicated storage signature selector instead of rebuilding adjacent storage-signature branches inline')
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
  if (!text.includes('scheduleAgenticGraphStorageQueueRequest(request.initialQueueRequest)')) {
    throw new Error('expected agentic-graph storage workspace lifecycle apply path to reuse the prebuilt initial queue request instead of rebuilding queue request context downstream')
  }
  if (!text.includes('stopAgenticGraphStorageWorkspaceRuntime({') || !text.includes('stopAgenticGraphStorageWorkspaceRuntime()')) {
    throw new Error('expected agentic-graph storage workspace lifecycle start and cleanup paths to reuse the dedicated teardown helper instead of duplicating runtime reset branches inline')
  }
  if (!text.includes('startAgenticGraphStorageWorkspaceRuntime(request)')) {
    throw new Error('expected agentic-graph storage workspace lifecycle apply path to delegate storage loop startup to the dedicated start helper')
  }
  if (!text.includes('onSyncCompleted: handleAgenticGraphStorageSyncCompleted') || !text.includes('onPulledChangesApplied: createAgenticGraphStoragePulledChangesHandler(ownership)')) {
    throw new Error('expected agentic-graph storage workspace runtime startup to reuse centralized completion and captured-ownership callback helpers')
  }
  if (!text.includes('type SourceFilesComposeRequest = {') || !text.includes('const storageSyncSignature = readAgenticGraphStorageSyncSignature({') || !text.includes('const readSourceFilesCompositionSignature = React.useCallback((args: {') || !text.includes('const resolveSourceFilesComposeRequest = React.useCallback((args: {') || !text.includes('agenticGraphStorageQueueRequest: resolveAgenticGraphStorageQueueRequest({') || !text.includes('storageSyncSignature,') || !text.includes('composeRequest: resolveSourceFilesComposeRequest({')) {
    throw new Error('expected source files persistence and bootstrap compose handling to reuse one shared compose request shape plus dedicated signature helpers instead of shaping compose payloads independently')
  }
  if (!text.includes('const snapshot = readCallerOwnedSourceFilesSnapshot(sourceFilesSnapshot)')) {
    throw new Error('expected source files persistence effect request resolution to reuse a caller-owned or shared live sourceFiles snapshot instead of falling back to raw store reads')
  }
  if (!text.includes('const applySourceFilesPersistenceStorageRequest = React.useCallback((request: SourceFilesPersistenceEffectRequest) => {') || !text.includes('const applySuppressedSourceFilesPersistenceComposeRequest = React.useCallback((compositionSignature: string): boolean => {') || !text.includes('const scheduleSourceFilesPersistenceComposeRequest = React.useCallback((compositionSignature: string) => {') || !text.includes('const applySourceFilesPersistenceComposeRequest = React.useCallback((request: SourceFilesPersistenceEffectRequest) => {') || !text.includes('applySourceFilesPersistenceStorageRequest(request)') || !text.includes('applySourceFilesPersistenceComposeRequest(request)')) {
    throw new Error('expected source files persistence side effects to delegate storage scheduling, compose suppression, and compose scheduling through dedicated helpers instead of keeping inline apply branches')
  }
  if (!text.includes('const startForWorkspaceSelection = (selection: AgenticGraphStorageWorkspaceSelection) => {') || !text.includes('s => readAgenticGraphStorageWorkspaceSelection(s)')) {
    throw new Error('expected source files workspace-state subscription to thread one caller-owned workspace selection through the agentic-graph storage workspace resolver instead of rereading store state inline')
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
    throw new Error('expected agentic-graph storage inbound apply handling to reuse the sourceFiles snapshot returned by inbound storage apply instead of rereading store state after mutation')
  }
}

export function testSourceFilesBootstrapGuardsSafariStorageSyncHotPath() {
  const bootstrapPath = resolve(process.cwd(), 'src', 'features', 'source-files', 'SourceFilesPersistenceBootstrap.tsx')
  const bootstrapStartupPath = resolve(process.cwd(), 'src', 'features', 'source-files', 'sourceFilesBootstrapStartup.ts')
  const text = readSourceFilesBootstrapSource(bootstrapPath)
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
  if (!text.includes('sourceFilesSnapshot: baseline.sourceFiles, sourcesByPath')) {
    throw new Error('expected deferred rematerialization to pass its guarded baseline and source provenance to the sole publication owner')
  }
  if (!text.includes('fs: reusableWorkspaceFsRef.current || undefined')) {
    throw new Error('expected active-path materialization to reuse cached workspace fs instance instead of refetching per switch')
  }
  if (!text.includes('const entriesCache = reusableWorkspaceEntriesRef.current') || !text.includes('workspaceEntries: entriesCache') || !text.includes('if (reusableWorkspaceEntriesRef.current === entriesCache)')) {
    throw new Error('expected deferred materialization to reuse a captured entry cache and preserve later replacement or invalidation')
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
