import { useGraphStore } from '@/hooks/useGraphStore'
import { isMarkdownLikeFileName } from 'grph-shared/markdown/mermaidInput'
import { useMarkdownExplorerStore } from '@/features/markdown-explorer/store'
import { applyActiveMarkdownDocumentPayload } from '@/features/markdown/activeMarkdownDocument'
import { matchesMarkdownDocumentPath } from 'grph-shared/markdown/documentPath'
import { getWorkspaceFs, isInitializationWorkspacePath } from '@/features/workspace-fs/workspaceFs'
import type { WorkspaceEntry, WorkspaceFs, WorkspacePath } from '@/features/workspace-fs/types'
import type { SourceFile } from '@/hooks/store/types'
import { resolveWorkspaceSourceIndexSnapshot, type WorkspaceSourceIndex } from '@/features/workspace-fs/sourceIndex'
import { mergeWorkspaceEntriesIntoSourceFiles, resolveWorkspaceSourcePathKey } from '@/features/workspace-fs/syncToSourceFiles'
import { applyWorkspaceImportToCanvas } from '@/features/workspace-fs/applyWorkspaceImportToCanvas'
import { normalizeWorkspacePath, workspaceDocumentKey } from '@/features/workspace-fs/path'
import { resolveWorkspaceSourceRootPaths } from '@/features/workspace-fs/workspaceSourceRoots'
import { readWorkspaceSourceFilesDocsOnlySetting } from '@/lib/workspace/workspaceStoreSyncSettings'
import { hashStringToHexSharedContentCached } from '@/lib/hash/textHashCache'
import { buildScopedGraphSemanticKey } from '@/lib/graph/semanticKey'
import { isFrontmatterOnlyDoc } from '@/lib/markdown/frontmatter'
import { areSourceFileRecordsEqual, buildSourceFileLifecycleState, canSkipActiveWorkspaceSourceFilesRematerialization, hasExpectedMaterializationSourceText,
  ensureActiveWorkspaceSourceFileEnabled, hasMaterializationDocumentDrifted, readColdStartMaterializationSource, readPassiveMaterializationDocumentText, sameMaterializationSourceIdentities } from '@/features/source-files/sourceFileParsedState'
import { readActiveWorkspaceSourceFileFallbackText, readWorkspaceActiveDocumentResolvedText, resolveActiveWorkspaceEntriesSnapshot } from '@/features/source-files/sourceFilesRuntimeActive'
export { sameMaterializationSourceIdentities } from '@/features/source-files/sourceFileParsedState'

export function shouldProactivelyReapplyActiveWorkspaceMarkdownDocument(args: {
  activePath: WorkspacePath | null
  markdownDocumentName: string | null | undefined
  markdownDocumentText: string | null | undefined
  markdownDocumentApplyViewPreset?: boolean
}): boolean {
  const activePath = normalizeWorkspacePath(args.activePath)
  if (!activePath || !isMarkdownLikeFileName(activePath)) return false
  return true
}

const readActiveWorkspaceEntryInlineText = (args: {
  activePath: WorkspacePath
  activeWorkspaceEntriesSnapshot?: WorkspaceEntry[]
}): string => {
  const activePath = normalizeWorkspacePath(args.activePath)
  if (!activePath) return ''
  const entries = Array.isArray(args.activeWorkspaceEntriesSnapshot) ? args.activeWorkspaceEntriesSnapshot : []
  const activeEntry = entries.find(entry => entry?.kind === 'file' && normalizeWorkspacePath(entry.path) === activePath) || null
  return typeof activeEntry?.text === 'string' ? activeEntry.text : ''
}

export function shouldCommitResolvedActiveMarkdownText(args: {
  activePath: WorkspacePath | null
  resolvedText: string
  activeWorkspaceEntriesSnapshot?: WorkspaceEntry[]
}): boolean {
  if (String(args.resolvedText || '').trim()) return true
  const activePath = normalizeWorkspacePath(args.activePath)
  if (!activePath) return false
  const entries = Array.isArray(args.activeWorkspaceEntriesSnapshot) ? args.activeWorkspaceEntriesSnapshot : []
  return entries.some(entry => entry?.kind === 'file' && normalizeWorkspacePath(entry.path) === activePath)
}

export async function reapplyActiveWorkspaceMarkdownDocument(args?: {
  activePathOverride?: WorkspacePath | null
  fs?: Awaited<ReturnType<typeof getWorkspaceFs>>
  activeWorkspaceEntriesSnapshot?: WorkspaceEntry[]
  expectedSourceText?: string
  applyToGraph?: boolean
}): Promise<boolean> {
  const explorerActivePathAtStart = resolveMaterializedWorkspaceActivePath({ explorerActivePath: useMarkdownExplorerStore.getState().activePath })
  const activePath = resolveMaterializedWorkspaceActivePath({ activePathOverride: args?.activePathOverride ?? null,
    explorerActivePath: explorerActivePathAtStart })
  const store = useGraphStore.getState()
  if (!shouldProactivelyReapplyActiveWorkspaceMarkdownDocument({
    activePath,
    markdownDocumentName: store.markdownDocumentName,
    markdownDocumentText: store.markdownDocumentText,
    markdownDocumentApplyViewPreset: store.markdownDocumentApplyViewPreset,
  })) {
    return false
  }
  if (!activePath) return false
  const activeDocumentKey = workspaceDocumentKey(activePath)
  if (!activeDocumentKey) return false
  const currentText = readActiveWorkspaceEntryInlineText({ activePath,
    activeWorkspaceEntriesSnapshot: args?.activeWorkspaceEntriesSnapshot })
  const nextText = await readWorkspaceActiveDocumentResolvedText({ activePath, currentText, fs: args?.fs })
  if (args?.expectedSourceText !== undefined && nextText !== args.expectedSourceText) throw staleMaterialization()
  const latestStore = useGraphStore.getState()
  if (latestStore.sourceFiles !== store.sourceFiles
    || hasMaterializationDocumentDrifted(activePath, store, latestStore, nextText)) return false
  if (!shouldCommitResolvedActiveMarkdownText({
    activePath,
    resolvedText: nextText,
    activeWorkspaceEntriesSnapshot: args?.activeWorkspaceEntriesSnapshot,
  })) {
    return false
  }
  if (hasMaterializedActivePathDrifted(activePath, explorerActivePathAtStart)) return false
  if (
    args?.applyToGraph !== true &&
    matchesMarkdownDocumentPath(activePath, store.markdownDocumentName) &&
    String(store.markdownDocumentText || '') === nextText &&
    store.markdownDocumentApplyViewPreset !== false
  ) {
    return false
  }
  return !!(await applyActiveMarkdownDocumentPayload({
    setActiveMarkdownDocument: store.setActiveMarkdownDocument,
    name: activeDocumentKey,
    text: nextText,
    autoEnableFrontmatter: true,
    applyViewPreset: true,
    applyToGraph: args?.applyToGraph !== false,
    forceApplyToGraph: args?.applyToGraph !== false,
    normalizeWebpageFrontmatterToMarkdown: false,
  }))
}

export function resolveMaterializedWorkspaceActivePath(args?: {
  activePathOverride?: WorkspacePath | null
  explorerActivePath?: WorkspacePath | null
}): WorkspacePath | null {
  const raw = args?.activePathOverride ?? args?.explorerActivePath ?? null
  const trimmed = String(raw || '').trim()
  if (!trimmed) return null
  const withoutWorkspacePrefix = trimmed.startsWith('workspace:') ? trimmed.slice('workspace:'.length) : trimmed
  const normalized = normalizeWorkspacePath(withoutWorkspacePrefix)
  return normalized === '/' ? null : normalized
}

export function buildMaterializedWorkspaceActivePathKey(args?: {
  activePathOverride?: WorkspacePath | null
  explorerActivePath?: WorkspacePath | null
  workspaceEntriesSnapshot?: WorkspaceEntry[]
  markdownDocumentName?: string | null
  markdownDocumentText?: string | null
  markdownDocumentApplyViewPreset?: boolean | null
}): string {
  const activePath = String(resolveMaterializedWorkspaceActivePath(args) || '')
  if (!activePath) return ''
  const entries = Array.isArray(args?.workspaceEntriesSnapshot) ? args.workspaceEntriesSnapshot : []
  const activeEntry = entries.find(entry => entry?.kind === 'file' && normalizeWorkspacePath(entry.path) === activePath) || null
  const activeEntryText = typeof activeEntry?.text === 'string' ? activeEntry.text : ''
  const markdownText = String(args?.markdownDocumentText || '')
  const graphSemanticKey = [
    activePath,
    typeof activeEntry?.updatedAtMs === 'number' ? activeEntry.updatedAtMs : 0,
    activeEntryText.length,
    activeEntryText ? hashStringToHexSharedContentCached(activeEntryText, 'materialized-workspace-active-entry') : '',
    String(args?.markdownDocumentName || '').trim(),
    markdownText.length,
    markdownText ? hashStringToHexSharedContentCached(markdownText, 'materialized-workspace-markdown-document') : '',
    args?.markdownDocumentApplyViewPreset === false ? 'preset:false' : 'preset:true',
  ].join('|')
  return buildScopedGraphSemanticKey('materialized-workspace-active-path', { graphSemanticKey })
}

export function buildMaterializedWorkspaceForceIncludePaths(args?: {
  activePathOverride?: WorkspacePath | null
  explorerActivePath?: WorkspacePath | null
}): WorkspacePath[] {
  const activePath = resolveMaterializedWorkspaceActivePath(args)
  return activePath ? [activePath] : []
}

export function buildActiveWorkspaceRuntimeSourceFilesSnapshot(args: {
  activePath: WorkspacePath
  existingSourceFiles: ReturnType<typeof useGraphStore.getState>['sourceFiles']
  workspaceEntries: WorkspaceEntry[]
  sourcesByPath?: WorkspaceSourceIndex | null
  workspaceDocsOnly?: boolean
  workspaceSourceRootPaths?: WorkspacePath[]
}): {
  activeSourcePath: string
  mergedSourceFiles: ReturnType<typeof useGraphStore.getState>['sourceFiles']
  runtimeSourceFiles: ReturnType<typeof useGraphStore.getState>['sourceFiles']
  canSkipActiveRematerialization: boolean
} {
  const activePath = normalizeWorkspacePath(args.activePath)
  const activeSourcePath = resolveWorkspaceSourcePathKey(activePath)
  const mergedSourceFiles = mergeWorkspaceEntriesIntoSourceFiles({
    existing: Array.isArray(args.existingSourceFiles) ? args.existingSourceFiles : [],
    workspaceEntries: Array.isArray(args.workspaceEntries) ? args.workspaceEntries : [],
    sourcesByPath: resolveWorkspaceSourceIndexSnapshot(args.sourcesByPath || undefined),
    forceIncludePaths: buildMaterializedWorkspaceForceIncludePaths({
      activePathOverride: activePath,
    }),
    preserveExistingWorkspaceEntries: true,
    workspaceDocsOnly: args.workspaceDocsOnly,
    workspaceSourceRootPaths: args.workspaceSourceRootPaths,
  })
  const runtimeSourceFiles = ensureActiveWorkspaceSourceFileEnabled({
    sourceFiles: mergedSourceFiles,
    activeSourcePath,
  })
  return {
    activeSourcePath,
    mergedSourceFiles,
    runtimeSourceFiles,
    canSkipActiveRematerialization: canSkipActiveWorkspaceSourceFilesRematerialization({
      sourceFiles: runtimeSourceFiles,
      activeSourcePath,
    }),
  }
}

async function resolveNonGraphActiveWorkspaceSourceFiles(args: {
  activePath: WorkspacePath
  activeSourcePath: string
  sourceFiles: ReturnType<typeof useGraphStore.getState>['sourceFiles']
  activeWorkspaceEntriesSnapshot?: WorkspaceEntry[]
  fs?: Awaited<ReturnType<typeof getWorkspaceFs>>
  refreshActiveText?: boolean
}): Promise<ReturnType<typeof useGraphStore.getState>['sourceFiles'] | null> {
  const materializedSourceFiles = Array.isArray(args.sourceFiles) ? args.sourceFiles : []
  if (materializedSourceFiles.length === 0) return null
  const activeIndex = materializedSourceFiles.findIndex(file => String(file?.source?.path || '') === args.activeSourcePath)
  if (activeIndex < 0) return null
  let nextSourceFiles = materializedSourceFiles
  const activeFile = materializedSourceFiles[activeIndex] || null
  const activeText = String(activeFile?.text || '')
  const activeSnapshotEntry = (Array.isArray(args.activeWorkspaceEntriesSnapshot) ? args.activeWorkspaceEntriesSnapshot : [])
    .find(entry => entry?.kind === 'file' && normalizeWorkspacePath(entry.path) === args.activePath) || null
  const activeSnapshotText = typeof activeSnapshotEntry?.text === 'string' ? activeSnapshotEntry.text : null
  if (activeSnapshotText !== null && activeSnapshotText !== activeText) {
    nextSourceFiles = materializedSourceFiles.slice()
    nextSourceFiles[activeIndex] = {
      ...activeFile,
      text: activeSnapshotText,
    }
  } else if (args.refreshActiveText || !activeText.trim()) {
    const fallbackText = await readActiveWorkspaceSourceFileFallbackText({
      activePath: args.activePath,
      activeFile,
      activeWorkspaceEntriesSnapshot: args.activeWorkspaceEntriesSnapshot,
      fs: args.fs,
      ignoreActiveFileText: args.refreshActiveText === true,
    })
    if (fallbackText.trim() && fallbackText !== activeText) {
      nextSourceFiles = materializedSourceFiles.slice()
      nextSourceFiles[activeIndex] = {
        ...activeFile,
        text: fallbackText,
      }
    }
  }
  return ensureActiveWorkspaceSourceFileEnabled({
    sourceFiles: nextSourceFiles,
    activeSourcePath: args.activeSourcePath,
  })
}

function hasMaterializedActivePathDrifted(
  activePath: WorkspacePath,
  explorerActivePathAtStart: WorkspacePath | null,
): boolean {
  const currentExplorerActivePath = resolveMaterializedWorkspaceActivePath({
    explorerActivePath: useMarkdownExplorerStore.getState().activePath,
  })
  // An explicit bootstrap override may legitimately start without an Explorer
  // selection. Once Explorer owns a different path, the older preset is stale.
  const activePathStartedStale = (
    explorerActivePathAtStart !== null
    && explorerActivePathAtStart !== activePath
  )
  return activePathStartedStale || (
    explorerActivePathAtStart === null
      ? currentExplorerActivePath !== null && currentExplorerActivePath !== activePath
      : currentExplorerActivePath !== activePath
  )
}

async function parseActiveWorkspaceSourceBeforeDocumentApply(activePath: WorkspacePath, explorerActivePathAtStart: WorkspacePath | null): Promise<boolean> {
  const before = useGraphStore.getState()
  const sourcePath = resolveWorkspaceSourcePathKey(activePath)
  const matches = before.sourceFiles.filter(value => String(value.source?.path || '') === sourcePath), file = matches[0]
  if (matches.length > 1 || (file && before.sourceFiles.some(value => value !== file && value.id === file.id))) return false
  if (!file || !file.enabled || !String(file.text || '').trim()) return true
  const { parseAndApplySourceFile } = await import('@/features/source-files/sourceFilesParseRuntime')
  const changedDocument = () => {
    const current = useGraphStore.getState()
    return hasMaterializationDocumentDrifted(activePath, before, current, file.text)
      || hasMaterializedActivePathDrifted(activePath, explorerActivePathAtStart)
  }
  if (changedDocument() || !sameMaterializationSourceIdentities(before.sourceFiles, useGraphStore.getState().sourceFiles)) return false
  await parseAndApplySourceFile(file.id, { applyComposedGraph: false })
  const current = useGraphStore.getState()
  const latest = current.sourceFiles.find(value => value.id === file.id)
  if (changedDocument() || current.sourceFiles.length !== before.sourceFiles.length
    || before.sourceFiles.some(value => value.id !== file.id && !current.sourceFiles.includes(value))
    || !latest || !latest.enabled || !sameMaterializationSourceIdentities([file], [latest])
    || String(latest.source?.path || '') !== sourcePath) return false
  // Unsupported documents still own their readable text; the native record retains its loud parse error.
  if (latest.status !== 'parsed' && latest.status !== 'error') throw new Error(`Active SourceFile ${file.name} parsing did not complete.`)
  return true
}

function staleMaterialization(retryable = false, stage = 'source'): Error {
  return Object.assign(new Error(`Active document source changed during materialization (${stage}).`), { code: 'SOURCE_FILES_MATERIALIZATION_STALE', retryable })
}
export type MaterializedWorkspaceSourceProof = Readonly<{
  activePath: WorkspacePath
  explorerActivePath: WorkspacePath | null
  sourceFiles: SourceFile[]
  markdownDocumentName: ReturnType<typeof useGraphStore.getState>['markdownDocumentName']
  markdownDocumentText: string
  markdownDocumentApplyViewPreset: boolean
}>
function captureMaterializedWorkspaceSourceProof(activePath: WorkspacePath): MaterializedWorkspaceSourceProof {
  const state = useGraphStore.getState()
  return Object.freeze({ activePath, explorerActivePath: resolveMaterializedWorkspaceActivePath({ explorerActivePath: useMarkdownExplorerStore.getState().activePath }),
    sourceFiles: state.sourceFiles, markdownDocumentName: state.markdownDocumentName, markdownDocumentText: state.markdownDocumentText,
    markdownDocumentApplyViewPreset: state.markdownDocumentApplyViewPreset })
}
export function isMaterializedWorkspaceSourceProofCurrent(proof: MaterializedWorkspaceSourceProof): boolean {
  const state = useGraphStore.getState()
  return state.sourceFiles === proof.sourceFiles && state.markdownDocumentName === proof.markdownDocumentName
    && state.markdownDocumentText === proof.markdownDocumentText && state.markdownDocumentApplyViewPreset === proof.markdownDocumentApplyViewPreset
    && resolveMaterializedWorkspaceActivePath({ explorerActivePath: useMarkdownExplorerStore.getState().activePath }) === proof.explorerActivePath
    && !hasMaterializedActivePathDrifted(proof.activePath, proof.explorerActivePath)
}
async function settleMaterializedDocument(args: NonNullable<Parameters<typeof reapplyActiveWorkspaceMarkdownDocument>[0]>, explorerAtStart: WorkspacePath | null): Promise<MaterializedWorkspaceSourceProof> {
  const activePath = args.activePathOverride!, before = useGraphStore.getState()
  await reapplyActiveWorkspaceMarkdownDocument(args)
  const current = useGraphStore.getState()
  const documentOwnedRecord = (file: SourceFile) => args.applyToGraph === true && file.status === 'error'
    && file.source?.path === resolveWorkspaceSourcePathKey(activePath) && file.name === workspaceDocumentKey(activePath)
    && current.markdownDocumentName === file.name && current.markdownDocumentText === file.text && isFrontmatterOnlyDoc(file.text)
    && !file.parsedGraphData?.nodes?.length && !file.parsedGraphData?.edges?.length
    ? { ...file, ...buildSourceFileLifecycleState({ status: 'idle', previousState: file, preserveParsedState: true }) } : file
  if (hasMaterializedActivePathDrifted(activePath, explorerAtStart)
    || before.sourceFiles.length !== current.sourceFiles.length
    || before.sourceFiles.some((file, index) => !areSourceFileRecordsEqual(file, current.sourceFiles[index])
      && !areSourceFileRecordsEqual(documentOwnedRecord(file), current.sourceFiles[index]))) throw staleMaterialization()
  if (isMarkdownLikeFileName(activePath) && (!matchesMarkdownDocumentPath(activePath, current.markdownDocumentName)
    || current.markdownDocumentApplyViewPreset === false
    || (args.expectedSourceText !== undefined && current.markdownDocumentText !== args.expectedSourceText))) throw staleMaterialization()
  return captureMaterializedWorkspaceSourceProof(activePath)
}

type GraphOwningActiveWorkspaceSourceFilesArgs = {
  activePath: WorkspacePath
  fs: WorkspaceFs
  existingSourceFiles: ReturnType<typeof useGraphStore.getState>['sourceFiles']
  workspaceEntries: WorkspaceEntry[]
  sourcesByPath?: WorkspaceSourceIndex | null
  premergedSourceFiles?: SourceFile[] | null
  expectedSourceText?: string
}

function mergeGraphOwningActiveWorkspaceSourceFiles(
  args: GraphOwningActiveWorkspaceSourceFilesArgs,
): void {
  const store = useGraphStore.getState()
  // The verified cold-start retry owns the full current inventory, including empty placeholders.
  if (args.expectedSourceText !== undefined) {
    if (!hasExpectedMaterializationSourceText(args.existingSourceFiles, resolveWorkspaceSourcePathKey(args.activePath), args.expectedSourceText)) throw staleMaterialization()
    return
  }
  const mergedSourceFiles = args.premergedSourceFiles || mergeWorkspaceEntriesIntoSourceFiles({
    existing: args.existingSourceFiles,
    workspaceEntries: args.workspaceEntries,
    sourcesByPath: resolveWorkspaceSourceIndexSnapshot(args.sourcesByPath || undefined),
    forceIncludePaths: buildMaterializedWorkspaceForceIncludePaths({
      activePathOverride: args.activePath,
    }),
    preserveExistingWorkspaceEntries: true,
    workspaceDocsOnly: readWorkspaceSourceFilesDocsOnlySetting(),
    workspaceSourceRootPaths: resolveWorkspaceSourceRootPaths({
      chatLocalStorageRootPath: store.chatLocalStorageRootPath,
    }),
  })
  if (mergedSourceFiles !== args.existingSourceFiles) {
    store.setSourceFiles(mergedSourceFiles)
  }
}

async function materializeGraphOwningActiveWorkspaceSourceFiles(args: GraphOwningActiveWorkspaceSourceFilesArgs): Promise<MaterializedWorkspaceSourceProof> {
  const explorerActivePathAtStart = resolveMaterializedWorkspaceActivePath({ explorerActivePath: useMarkdownExplorerStore.getState().activePath })
  mergeGraphOwningActiveWorkspaceSourceFiles(args)
  let expectedSourceText = args.expectedSourceText
  const activeText = useGraphStore.getState().sourceFiles.find(file => file.source?.path === resolveWorkspaceSourcePathKey(args.activePath))?.text || ''
  if (isMarkdownLikeFileName(args.activePath) && activeText.trim() && !isFrontmatterOnlyDoc(activeText)) {
    const before = useGraphStore.getState(), activeSourcePath = resolveWorkspaceSourcePathKey(args.activePath)
    const enabled = ensureActiveWorkspaceSourceFileEnabled({ sourceFiles: before.sourceFiles, activeSourcePath })
    const active = enabled.filter(file => file.source?.path === activeSourcePath)
    if (active.length !== 1 || enabled.filter(file => file.id === active[0]!.id).length !== 1 || (args.expectedSourceText !== undefined && active[0]!.text !== args.expectedSourceText)) throw staleMaterialization(false, 'active source identity')
    if (enabled !== before.sourceFiles) before.setSourceFiles(enabled)
    if (!sameMaterializationSourceIdentities(enabled, useGraphStore.getState().sourceFiles)
      || hasMaterializationDocumentDrifted(args.activePath, before, useGraphStore.getState(), active[0]!.text)
      || hasMaterializedActivePathDrifted(args.activePath, explorerActivePathAtStart)) throw staleMaterialization(false, 'active source enabling')
    if (!await parseActiveWorkspaceSourceBeforeDocumentApply(args.activePath, explorerActivePathAtStart)) throw staleMaterialization(false, 'active source parse')
    const afterParse = useGraphStore.getState(), parsed = afterParse.sourceFiles.find(file => file.id === active[0]!.id)
    if (!parsed || !sameMaterializationSourceIdentities(active, [parsed]) || afterParse.sourceFiles.length !== enabled.length
      || enabled.some(file => file.id !== parsed.id && !afterParse.sourceFiles.includes(file))
      || hasMaterializationDocumentDrifted(args.activePath, before, afterParse, parsed.text)
      || hasMaterializedActivePathDrifted(args.activePath, explorerActivePathAtStart)) throw staleMaterialization(false, 'active source parse')
    if (parsed.status !== 'parsed') throw new Error(parsed.error || `Active SourceFile ${parsed.name} parsing did not complete.`)
    expectedSourceText = parsed.text
  }
  // Identity precedes presets so run-ready Exit retains the neutral surface.
  await settleMaterializedDocument({ applyToGraph: true, activePathOverride: args.activePath,
    fs: args.fs, activeWorkspaceEntriesSnapshot: args.workspaceEntries, expectedSourceText }, explorerActivePathAtStart)
  if (hasMaterializedActivePathDrifted(args.activePath, explorerActivePathAtStart)) throw staleMaterialization()
  const mergedSourceFiles = useGraphStore.getState().sourceFiles, document = useGraphStore.getState()
  await applyWorkspaceImportToCanvas({ fs: args.fs, createdPaths: [args.activePath], opts: {
    workspaceEntries: args.workspaceEntries, sourcesByPath: resolveWorkspaceSourceIndexSnapshot(args.sourcesByPath || undefined),
    premergedSourceFiles: mergedSourceFiles, applyToGraph: true, skipComposedGraphApply: isInitializationWorkspacePath(args.activePath),
    retryOnInventoryDrift: true,
    assertCurrent: () => {
      if (hasMaterializedActivePathDrifted(args.activePath, explorerActivePathAtStart)
        || useGraphStore.getState().markdownDocumentName !== document.markdownDocumentName
        || useGraphStore.getState().markdownDocumentText !== document.markdownDocumentText) throw staleMaterialization(false, 'graph import authority')
    },
  } })
  if (hasMaterializedActivePathDrifted(args.activePath, explorerActivePathAtStart)
    || useGraphStore.getState().markdownDocumentName !== document.markdownDocumentName
    || useGraphStore.getState().markdownDocumentText !== document.markdownDocumentText
    || !sameMaterializationSourceIdentities(mergedSourceFiles, useGraphStore.getState().sourceFiles)) throw staleMaterialization()
  return captureMaterializedWorkspaceSourceProof(args.activePath)
}

type ActiveWorkspaceMaterializationArgs = {
  activePathOverride?: WorkspacePath | null
  fs?: Awaited<ReturnType<typeof getWorkspaceFs>>
  workspaceEntries?: WorkspaceEntry[]
  activeWorkspaceEntriesSnapshot?: WorkspaceEntry[]
  sourceFilesSnapshot?: SourceFile[]
  sourcesByPath?: WorkspaceSourceIndex
  premergedSourceFiles?: SourceFile[]
  applyToGraph?: boolean
  refreshActiveText?: boolean
}
type ActiveWorkspaceMaterializationAttemptArgs = ActiveWorkspaceMaterializationArgs & { expectedSourceText?: string }
export async function materializeActiveWorkspaceEntryIntoSourceFiles(args?: ActiveWorkspaceMaterializationArgs): Promise<MaterializedWorkspaceSourceProof | null> {
  const initial = useGraphStore.getState(), explorer = useMarkdownExplorerStore.getState().activePath
  const activePath = resolveMaterializedWorkspaceActivePath({ activePathOverride: args?.activePathOverride, explorerActivePath: explorer })
  const initialText = initial.sourceFiles.find(file => file.source?.path === resolveWorkspaceSourcePathKey(activePath || ''))?.text
  let request: ActiveWorkspaceMaterializationAttemptArgs | undefined = args
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const before = useGraphStore.getState()
    try {
      const proof = await materializeActiveWorkspaceEntryAttempt(request)
      if (proof && !isMaterializedWorkspaceSourceProofCurrent(proof)) throw staleMaterialization()
      return proof
    } catch (error) {
      let current = useGraphStore.getState()
      if (attempt || (error as { code?: string; retryable?: boolean })?.code !== 'SOURCE_FILES_MATERIALIZATION_STALE'
        || !(error as { retryable?: boolean }).retryable
        || useMarkdownExplorerStore.getState().activePath !== explorer) throw error
      const retrySources = request?.sourceFilesSnapshot || before.sourceFiles
      const active = current.sourceFiles.filter(file => file.source?.path === resolveWorkspaceSourcePathKey(activePath || ''))
      if (activePath && active.length === 1 && active[0]!.status === 'loading'
        && current.markdownDocumentName === before.markdownDocumentName && current.markdownDocumentText === before.markdownDocumentText
        && sameMaterializationSourceIdentities(retrySources, current.sourceFiles)) {
        if (retrySources.some(file => file.id !== active[0]!.id && !current.sourceFiles.includes(file))) throw error
        if (!await parseActiveWorkspaceSourceBeforeDocumentApply(activePath,
          resolveMaterializedWorkspaceActivePath({ explorerActivePath: explorer }))) throw error
        const settled = useGraphStore.getState()
        if (useMarkdownExplorerStore.getState().activePath !== explorer
          || settled.markdownDocumentName !== before.markdownDocumentName || settled.markdownDocumentText !== before.markdownDocumentText
          || current.sourceFiles.some(file => file.id !== active[0]!.id && !settled.sourceFiles.includes(file))
          || !sameMaterializationSourceIdentities(current.sourceFiles, settled.sourceFiles)) throw error
        current = settled
      }
      let expectedSourceText: string | undefined, fs = args?.fs
      if (hasMaterializationDocumentDrifted(activePath, initial, current, initialText)
        || !sameMaterializationSourceIdentities(request?.sourceFilesSnapshot || before.sourceFiles, current.sourceFiles)) {
        const readConvergence = () => {
          const state = { applyToGraph: args?.applyToGraph, activePath, activeSourcePath: resolveWorkspaceSourcePathKey(activePath || ''),
            initial, before, current: useGraphStore.getState(), requestedSourceFiles: request?.sourceFilesSnapshot || before.sourceFiles }
          return readColdStartMaterializationSource({ ...state, preparedSourceFiles: request?.premergedSourceFiles })?.text
            ?? readPassiveMaterializationDocumentText({ ...state, documentKey: workspaceDocumentKey(activePath || '') })
        }
        expectedSourceText = readConvergence()
        if (expectedSourceText === undefined) throw error
        fs ||= await getWorkspaceFs()
        if (await fs.readFileText(activePath!) !== expectedSourceText || useGraphStore.getState().sourceFiles !== current.sourceFiles
          || useGraphStore.getState().markdownDocumentName !== current.markdownDocumentName
          || useGraphStore.getState().markdownDocumentText !== current.markdownDocumentText
          || useGraphStore.getState().markdownDocumentApplyViewPreset !== current.markdownDocumentApplyViewPreset
          || useMarkdownExplorerStore.getState().activePath !== explorer || readConvergence() !== expectedSourceText) throw error
      }
      request = { activePathOverride: args?.activePathOverride, fs, applyToGraph: args?.applyToGraph, refreshActiveText: args?.refreshActiveText,
        sourceFilesSnapshot: current.sourceFiles, expectedSourceText }
    }
  }
  throw staleMaterialization()
}
async function materializeActiveWorkspaceEntryAttempt(args?: ActiveWorkspaceMaterializationAttemptArgs): Promise<MaterializedWorkspaceSourceProof | null> {
  const activePath = resolveMaterializedWorkspaceActivePath({ activePathOverride: args?.activePathOverride ?? null,
    explorerActivePath: useMarkdownExplorerStore.getState().activePath })
  if (!activePath) return null
  const shouldApplyToGraph = args?.applyToGraph === true
  const store = useGraphStore.getState()
  const explorerActivePathAtStart = resolveMaterializedWorkspaceActivePath({
    explorerActivePath: useMarkdownExplorerStore.getState().activePath,
  })
  // Async reads may finish after an import, edit or selection. Only their
  // original source snapshot may be replaced; newer state owns its own refresh.
  const hasDrifted = () => useGraphStore.getState().sourceFiles !== store.sourceFiles
    || hasMaterializationDocumentDrifted(activePath, store, useGraphStore.getState(), store.sourceFiles.find(file => file.source?.path === resolveWorkspaceSourcePathKey(activePath))?.text)
    || (args?.expectedSourceText !== undefined && (useGraphStore.getState().markdownDocumentName !== store.markdownDocumentName
      || useGraphStore.getState().markdownDocumentText !== store.markdownDocumentText
      || useGraphStore.getState().markdownDocumentApplyViewPreset !== store.markdownDocumentApplyViewPreset))
    || hasMaterializedActivePathDrifted(activePath, explorerActivePathAtStart)
  const activeSourcePath = resolveWorkspaceSourcePathKey(activePath)
  const existing = Array.isArray(args?.sourceFilesSnapshot) ? args.sourceFilesSnapshot : (Array.isArray(store.sourceFiles) ? store.sourceFiles : [])
  if (hasDrifted() || (existing !== store.sourceFiles && (
    existing.length !== store.sourceFiles.length
    || existing.some((file, index) => !areSourceFileRecordsEqual(file, store.sourceFiles[index]))
  ))) throw staleMaterialization(true, 'initial snapshot')
  const premergedSourceFiles = Array.isArray(args?.premergedSourceFiles) ? args.premergedSourceFiles : null
  const materializedSourceFiles = premergedSourceFiles || existing
  // Verified retries always use the fresh entry and persisted-byte fences below.
  if (!shouldApplyToGraph && materializedSourceFiles.length > 0 && args?.expectedSourceText === undefined) {
    const next = await resolveNonGraphActiveWorkspaceSourceFiles({
      activePath,
      activeSourcePath,
      sourceFiles: materializedSourceFiles,
      activeWorkspaceEntriesSnapshot: args?.activeWorkspaceEntriesSnapshot,
      fs: args?.fs,
      refreshActiveText: args?.refreshActiveText === true,
    })
    if (hasDrifted()) throw staleMaterialization(true, 'async source read')
    if (next) {
      if (next !== existing) {
        store.setSourceFiles(ensureActiveWorkspaceSourceFileEnabled({
          sourceFiles: next,
          activeSourcePath,
        }))
      }
      if (!await parseActiveWorkspaceSourceBeforeDocumentApply(activePath, explorerActivePathAtStart)) throw staleMaterialization(false, 'active source parse')
      const active = useGraphStore.getState().sourceFiles.find(file => file.source?.path === activeSourcePath)
      return settleMaterializedDocument({
        applyToGraph: false,
        activePathOverride: activePath,
        fs: args?.fs,
        activeWorkspaceEntriesSnapshot: args?.activeWorkspaceEntriesSnapshot,
        expectedSourceText: active?.text,
      }, explorerActivePathAtStart)
    }
  }
  const fs = args?.fs || (await getWorkspaceFs())
  const workspaceEntries = await resolveActiveWorkspaceEntriesSnapshot({
    activePath,
    fs,
    workspaceEntries: args?.workspaceEntries,
    activeWorkspaceEntriesSnapshot: args?.activeWorkspaceEntriesSnapshot,
  })
  if (hasDrifted()) throw staleMaterialization(true, 'async source read')
  const activeWorkspaceEntries = args?.expectedSourceText === undefined ? workspaceEntries
    : workspaceEntries.filter(entry => entry.kind === 'file' && normalizeWorkspacePath(entry.path) === activePath)
  if (args?.expectedSourceText !== undefined) {
    if (activeWorkspaceEntries.length !== 1 || activeWorkspaceEntries[0]!.text !== args.expectedSourceText) throw staleMaterialization(false, 'resolved active bytes')
    if (await fs.readFileText(activePath) !== args.expectedSourceText || hasDrifted()) throw staleMaterialization(false, 'persisted active bytes')
  }
  if (!shouldApplyToGraph) {
    const runtimeSnapshot = buildActiveWorkspaceRuntimeSourceFilesSnapshot({
      activePath,
      existingSourceFiles: existing,
      workspaceEntries: activeWorkspaceEntries,
      sourcesByPath: resolveWorkspaceSourceIndexSnapshot(args?.sourcesByPath),
      workspaceDocsOnly: readWorkspaceSourceFilesDocsOnlySetting(),
      workspaceSourceRootPaths: resolveWorkspaceSourceRootPaths({
        chatLocalStorageRootPath: store.chatLocalStorageRootPath,
      }),
    })
    let next = runtimeSnapshot.runtimeSourceFiles
    if (args?.expectedSourceText !== undefined) {
      const active = next.filter(file => file.source?.path === activeSourcePath)
      if (active.length !== 1 || active[0]!.text !== args.expectedSourceText
        || existing.some(file => file.id === active[0]!.id)) throw staleMaterialization(false, 'verified active identity')
      // This retry owns one new source; inactive records retain their exact objects.
      next = [...existing, active[0]!]
    }
    if (next !== existing) store.setSourceFiles(next)
    if (!await parseActiveWorkspaceSourceBeforeDocumentApply(activePath, explorerActivePathAtStart)) throw staleMaterialization(false, 'active source parse')
    const active = useGraphStore.getState().sourceFiles.find(file => file.source?.path === activeSourcePath)
    return settleMaterializedDocument({
      applyToGraph: false,
      activePathOverride: activePath,
      fs,
      activeWorkspaceEntriesSnapshot: activeWorkspaceEntries,
      expectedSourceText: args?.expectedSourceText ?? active?.text,
    }, explorerActivePathAtStart)
  }
  return materializeGraphOwningActiveWorkspaceSourceFiles({
    activePath,
    fs,
    existingSourceFiles: existing,
    workspaceEntries: activeWorkspaceEntries,
    sourcesByPath: resolveWorkspaceSourceIndexSnapshot(args?.sourcesByPath),
    premergedSourceFiles,
    expectedSourceText: args?.expectedSourceText,
  })
}
