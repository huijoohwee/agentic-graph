import { readSourceFilesBootstrapSource } from './helpers/sourceFilesBootstrapSource'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { useGraphStore } from '@/hooks/useGraphStore'

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
  const bootstrapText = readSourceFilesBootstrapSource(bootstrapPath)
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
  if (!bootstrapText.includes('const proof = await materializeActiveWorkspaceEntryIntoSourceFiles({') || !bootstrapText.includes('return proof.sourceFiles')) {
    throw new Error('expected deferred rematerialization to publish through the guarded owner and return its actual source snapshot')
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
  if (!bootstrapText.includes('createWorkspaceSeedSyncDeferredScheduler<WorkspaceRematerializeRequest>') || !bootstrapText.includes('workspaceRematerializeSeedSyncScheduler.schedule(request)')) {
    throw new Error('expected rematerialization to delegate debouncing and draining to the shared scheduler')
  }
  if (!bootstrapText.includes('const scheduleWorkspaceRematerializeRequest = React.useCallback((request: WorkspaceRematerializeRequest | null) => {') || !bootstrapText.includes('const scheduleWorkspaceRematerialize = React.useCallback((args?: {')) {
    throw new Error('expected source files bootstrap rematerialization scheduling to centralize both prepared-request scheduling and fallback request resolution behind dedicated helpers')
  }
  if (!bootstrapText.includes('return runWorkspaceRematerializeRequest(request)') || !bootstrapText.includes('workspaceRematerializeSeedSyncScheduler.retainPending(request)') || !bootstrapText.includes('workspaceRematerializeSeedSyncScheduler.cleanup()')) {
    throw new Error('expected shared rematerialization scheduling to run requests, retain bursts and release its timer lease on cleanup')
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
  if (!bootstrapText.includes('type ActivePathMaterializationRequest') || !activePathAuthorityText.includes('export type ActivePathMaterializationRequest = ActivePathSourceAuthorityRequest & {')) {
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
  if (!bootstrapText.includes('const readReusableWorkspaceSourceIndexSnapshot = React.useCallback(() => {')) {
    throw new Error('expected workspace-fs mutation handling to use the reusable source-index snapshot owner')
  }
  if (!bootstrapText.includes('sourcesByPath: readReusableWorkspaceSourceIndexSnapshot(),')) {
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
  const applyCallIndex = runtimeMaterializationText.indexOf('return materializeGraphOwningActiveWorkspaceSourceFiles({', markerIndex)
  if (applyCallIndex < 0) {
    throw new Error('expected workspace active materialization runtime helper to delegate graph-apply ownership to the dedicated graph-owning helper')
  }
  const between = runtimeMaterializationText.slice(markerIndex, applyCallIndex)
  if (!between.includes('if (!shouldApplyToGraph) return') && !between.includes('if (!shouldApplyToGraph) {')) {
    throw new Error('expected workspace active materialization to skip import-to-canvas hot path when graph apply is disabled')
  }
  const graphHelperStart = runtimeMaterializationText.indexOf('async function materializeGraphOwningActiveWorkspaceSourceFiles(args:')
  const graphHelperSection = graphHelperStart >= 0 ? runtimeMaterializationText.slice(graphHelperStart, runtimeMaterializationText.indexOf('export async function materializeActiveWorkspaceEntryIntoSourceFiles', graphHelperStart)) : ''
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
