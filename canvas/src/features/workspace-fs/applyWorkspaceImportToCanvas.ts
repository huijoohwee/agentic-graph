import { useGraphStore } from '@/hooks/useGraphStore'
import type { SourceFile } from '@/hooks/store/types'
import type { GraphData } from '@/lib/graph/types'
import {
  WORKSPACE_IMPORT_AUTO_APPLY_ENABLED,
  WORKSPACE_IMPORT_AUTO_PARSE_MAX_FILES,
  WORKSPACE_IMPORT_AUTO_PARSE_MAX_FILE_CHARS,
  WORKSPACE_IMPORT_AUTO_PARSE_MAX_TOTAL_CHARS,
} from '@/lib/config'
import { DEFAULT_CANVAS_2D_RENDERER, isDataViewCanvas2dRenderer } from '@/lib/config.render'
import { extractYamlFrontmatterHeaderBlock, isFrontmatterOnlyDoc, parseCanvasWorkspaceFrontmatterPreset } from '@/lib/markdown/frontmatter'
import { applyFrontmatterFlowImportModes } from '@/features/parsers/frontmatterFlowImportMode'
import { applyCanvasFrontmatterPreset, resolveCanvasFrontmatterPreset } from '@/features/parsers/canvasFrontmatterPreset'
import {
  waitForCanvasFrontmatterSurfaceTransition,
} from '@/features/parsers/canvasFrontmatterSurfaceTransition'
import { isFrontmatterFlowGraph } from '@/lib/graph/frontmatterMode'
import type { WorkspaceEntry, WorkspaceFs, WorkspacePath } from './types'
import { normalizeWorkspacePath, workspaceDocumentKey } from './path'
import {
  resolveWorkspaceSourceIndexSnapshot,
  type WorkspaceSourceIndex,
} from './sourceIndex'
import { mergeWorkspaceEntriesIntoSourceFiles, resolveWorkspaceSourcePathKey } from './syncToSourceFiles'
import { runInIdle } from '@/features/panels/utils/idle'
import {
  scheduleApplyComposedGraphFromSourceFiles,
  scheduleApplyGraphOwnerComposedGraphFromSourceFiles,
} from '@/features/source-files/applyComposedGraphFromSourceFiles'
import { resolveWorkspaceSourceRootPaths } from '@/features/workspace-fs/workspaceSourceRoots'
import { readWorkspaceSourceFilesDocsOnlySetting } from '@/lib/workspace/workspaceStoreSyncSettings'
import { buildSourceFileParseIdentityHash } from '@/features/source-files/sourceFileParseIdentity'
import {
  areSourceFileRecordsEqual,
  areSourceFileSourcesEqual,
  buildSourceFileLifecycleState,
  normalizeSourceFiles,
} from '@/features/source-files/sourceFileParsedState'
import { resolveWorkspaceSourceFileInlineText } from './workspaceInlineText'
import {
  activateStrybldrImportSurface,
  shouldActivateStrybldrImportSurface,
} from '@/features/strybldr/strybldrImportSurface'
import { looksLikeBytePlusLuminaCanvasText } from '@/lib/graph/io/byteplusLuminaCanvas'

type ApplyWorkspaceImportToCanvasOpts = {
  applyToGraph?: boolean
  skipComposedGraphApply?: boolean
  workspaceEntries?: WorkspaceEntry[]
  sourcesByPath?: WorkspaceSourceIndex
  removedPaths?: WorkspacePath[]
  premergedSourceFiles?: SourceFile[]
  assertCurrent?: () => void
}

type ApplyWorkspaceImportToCanvasResult = {
  sourceFilesUpdated: boolean
  enabledCount: number
  parsedCount: number
}

export function applyInteractiveImportModes(args?: { graphData?: GraphData | null; frontmatterOnlyDoc?: boolean; rawText?: string | null }): void {
  const store = useGraphStore.getState()
  const graphData = args?.graphData || null
  const frontmatterOnlyDoc = args?.frontmatterOnlyDoc === true
  const rawText = String(args?.rawText || '')
  // Restoring a plain source must not replace the operator's saved record view.
  if (store.canvasRenderMode === '2d' && isDataViewCanvas2dRenderer(store.canvas2dRenderer)
    && !resolveCanvasFrontmatterPreset({ graphData, rawText })
    && !shouldActivateStrybldrImportSurface({ graphData, rawText })) return

  try {
    const schema = store.schema
    const layout = schema?.layout
    if (layout?.mode !== 'block') {
      store.setSchema({ ...schema, layout: { ...(layout || {}), mode: 'block' } })
    }
  } catch {
    void 0
  }

  if (graphData) {
    try {
      const presetApplied = applyFrontmatterFlowImportModes(graphData)
      if (!presetApplied) {
        applyCanvasFrontmatterPreset({
          graphData,
          rawText,
        })
      }
    } catch {
      void 0
    }
  } else if (frontmatterOnlyDoc) {
    try {
      store.setCanvas2dRenderer(DEFAULT_CANVAS_2D_RENDERER)
      store.setFrontmatterModeEnabled(true)
      applyCanvasFrontmatterPreset({
        rawText,
        defaultCanvasRenderMode: '2d',
        defaultCanvas2dRenderer: DEFAULT_CANVAS_2D_RENDERER,
        defaultDocumentSemanticMode: 'document',
        defaultFrontmatterModeEnabled: true,
        defaultMultiDimTableModeEnabled: false,
        disableMultiDimTableMode: true,
      })
    } catch {
      void 0
    }
  } else {
    try {
      store.setCanvas2dRenderer(DEFAULT_CANVAS_2D_RENDERER)
      store.setFrontmatterModeEnabled(true)
      applyCanvasFrontmatterPreset({
        rawText,
        defaultCanvasRenderMode: '2d',
        defaultCanvas2dRenderer: DEFAULT_CANVAS_2D_RENDERER,
        defaultFrontmatterModeEnabled: true,
      })
    } catch {
      void 0
    }
  }

  try {
    activateStrybldrImportSurface({
      graphData,
      rawText,
    })
  } catch {
    void 0
  }

}

export async function applyWorkspaceImportToCanvas(args: {
  fs: WorkspaceFs
  createdPaths: WorkspacePath[]
  opts?: ApplyWorkspaceImportToCanvasOpts
}): Promise<ApplyWorkspaceImportToCanvasResult> {
  const rawCreated = Array.isArray(args.createdPaths) ? args.createdPaths : []
  const applyToGraph = args.opts?.applyToGraph !== false && WORKSPACE_IMPORT_AUTO_APPLY_ENABLED
  const skipComposedGraphApply = args.opts?.skipComposedGraphApply === true

  const createdPaths = Array.from(
    new Set(
      rawCreated
        .map(p => normalizeWorkspacePath(p))
        .map(p => (p === '/' ? '' : p))
        .filter(Boolean),
    ),
  )
  if (createdPaths.length === 0) return { sourceFilesUpdated: false, enabledCount: 0, parsedCount: 0 }

  const store = useGraphStore.getState()
  let expectedSourceFiles = store.sourceFiles
  const removedSourcePathKeys = new Set(
    (Array.isArray(args.opts?.removedPaths) ? args.opts.removedPaths : [])
      .map(path => resolveWorkspaceSourcePathKey(normalizeWorkspacePath(path)))
      .filter(Boolean),
  )
  const importedSourcePathKeys = new Set([
    ...createdPaths.map(resolveWorkspaceSourcePathKey),
    ...removedSourcePathKeys,
  ])
  const staleImport = () => Object.assign(new Error('Active document source changed during materialization (workspace import publication).'),
    { code: 'SOURCE_FILES_MATERIALIZATION_STALE', retryable: false })
  const sourceFilesMatch = (left: SourceFile[], right: SourceFile[]) => left.length === right.length
    && left.every((file, index) => areSourceFileRecordsEqual(file, right[index]))
  const sourceFileMaterializationMatches = (current: SourceFile, desired: SourceFile) => current.id === desired.id
    && current.name === desired.name
    && current.text === desired.text
    && current.enabled === desired.enabled
    && current.geoLayerEnabled === desired.geoLayerEnabled
    && areSourceFileSourcesEqual(current.source, desired.source)
  const sourceFilesMatchExceptImportedLifecycle = (current: SourceFile[], expected: SourceFile[]) => current.length === expected.length
    && current.every((file, index) => {
      const prior = expected[index]
      if (!prior || !importedSourcePathKeys.has(String(file.source?.path || ''))
        || !importedSourcePathKeys.has(String(prior.source?.path || ''))) return areSourceFileRecordsEqual(file, prior)
      return areSourceFileRecordsEqual(file, prior) || sourceFileMaterializationMatches(file, prior)
    })
  const rebaseImportedSourceFiles = (current: SourceFile[], desired: SourceFile[]): SourceFile[] => {
    const desiredBySourcePath = new Map<string, SourceFile>()
    for (const file of desired) {
      const sourcePath = String(file.source?.path || '')
      if (importedSourcePathKeys.has(sourcePath)) desiredBySourcePath.set(sourcePath, file)
    }
    const appliedPaths = new Set<string>()
    const rebased = current.flatMap(file => {
      const sourcePath = String(file.source?.path || '')
      if (!importedSourcePathKeys.has(sourcePath)) return [file]
      const replacement = desiredBySourcePath.get(sourcePath)
      if (!replacement || appliedPaths.has(sourcePath)) return []
      appliedPaths.add(sourcePath)
      return [replacement]
    })
    for (const [sourcePath, replacement] of desiredBySourcePath) {
      if (!appliedPaths.has(sourcePath)) rebased.push(replacement)
    }
    return rebased
  }
  const ownsPublishedImport = (current: SourceFile[], desired: SourceFile[]) => {
    for (const sourcePath of removedSourcePathKeys) {
      if (current.some(file => String(file.source?.path || '') === sourcePath)) return false
    }
    return desired
      .filter(file => importedSourcePathKeys.has(String(file.source?.path || '')))
      .every(file => current.some(candidate => sourceFileMaterializationMatches(candidate, file)))
  }
  const assertCurrent = () => {
    args.opts?.assertCurrent?.()
    const current = useGraphStore.getState().sourceFiles
    if (current === expectedSourceFiles) return
    // Parsing and hydration may change only lifecycle state on the imported
    // records. Every other inventory or source change remains authoritative.
    if (!sourceFilesMatchExceptImportedLifecycle(current, expectedSourceFiles)) throw staleImport()
    expectedSourceFiles = current
  }
  const publishSourceFiles = (files: SourceFile[]) => {
    assertCurrent()
    const normalized = normalizeSourceFiles(files)
    let candidate = rebaseImportedSourceFiles(useGraphStore.getState().sourceFiles, normalized)
    store.setSourceFiles(candidate)
    let published = useGraphStore.getState().sourceFiles
    // A synchronous lifecycle owner may publish parsed state during our setter.
    // A concurrent source or inventory edit must remain visible and reject this import.
    if (!sourceFilesMatchExceptImportedLifecycle(published, candidate)
      || !ownsPublishedImport(published, candidate)) throw staleImport()
    expectedSourceFiles = published
  }
  assertCurrent()
  const existingAll = Array.isArray(store.sourceFiles) ? store.sourceFiles : []
  const existing = removedSourcePathKeys.size > 0
    ? existingAll.filter(file => !removedSourcePathKeys.has(String(file?.source?.path || '')))
    : existingAll
  const fs = args.fs
  const premergedSourceFiles = Array.isArray(args.opts?.premergedSourceFiles) ? args.opts?.premergedSourceFiles : null
  const workspaceEntries = premergedSourceFiles
    ? []
    : Array.isArray(args.opts?.workspaceEntries) ? args.opts.workspaceEntries : await fs.listEntries()
  assertCurrent()
  const sourcesByPath = premergedSourceFiles ? null : resolveWorkspaceSourceIndexSnapshot(args.opts?.sourcesByPath)
  const importSourcePaths = new Set([
    ...createdPaths.map(resolveWorkspaceSourcePathKey),
    ...existing.map(file => String(file.source?.path || '')),
  ])
  const importedUrls = new Set(createdPaths.flatMap(path => {
    const source = sourcesByPath?.[path]
    return source?.kind === 'url' ? [source.url] : []
  }))
  // URL imports register companion artifacts separately from their primary landing path.
  if (importedUrls.size > 0) {
    for (const [path, source] of Object.entries(sourcesByPath || {})) {
      if (source.kind === 'url' && importedUrls.has(source.url)) {
        const sourcePath = resolveWorkspaceSourcePathKey(path)
        importSourcePaths.add(sourcePath)
        importedSourcePathKeys.add(sourcePath)
      }
    }
  }
  const merged = premergedSourceFiles || mergeWorkspaceEntriesIntoSourceFiles({
    existing,
    workspaceEntries: workspaceEntries.filter(entry =>
      importSourcePaths.has(resolveWorkspaceSourcePathKey(entry.path)),
    ),
    sourcesByPath: sourcesByPath || undefined,
    forceIncludePaths: createdPaths,
    preserveExistingWorkspaceEntries: true,
    workspaceDocsOnly: readWorkspaceSourceFilesDocsOnlySetting(),
    workspaceSourceRootPaths: resolveWorkspaceSourceRootPaths({
      chatLocalStorageRootPath: store.chatLocalStorageRootPath,
    }),
  })

  const indexByWorkspaceSourcePath = new Map<string, number>()
  for (let i = 0; i < merged.length; i += 1) {
    const srcPath = String(merged[i]?.source?.path || '')
    if (srcPath.startsWith('workspace:')) indexByWorkspaceSourcePath.set(srcPath, i)
  }

  let next: SourceFile[] | null = null
  const ensureNext = (): SourceFile[] => {
    if (next) return next
    next = merged.slice()
    return next
  }

  let enabledCount = 0
  for (const path of createdPaths) {
    const idx = indexByWorkspaceSourcePath.get(resolveWorkspaceSourcePathKey(path))
    if (idx == null) continue
    const file = merged[idx]
    if (!file) continue
    if (applyToGraph && !file.enabled) {
      ensureNext()[idx] = { ...file, enabled: true }
      enabledCount += 1
    }
  }

  if (!applyToGraph) {
    if (next) {
      publishSourceFiles(next)
      return { sourceFilesUpdated: true, enabledCount, parsedCount: 0 }
    }
    if (merged !== existing || existing.length !== existingAll.length) {
      publishSourceFiles(merged)
      return { sourceFilesUpdated: true, enabledCount: 0, parsedCount: 0 }
    }
    return { sourceFilesUpdated: false, enabledCount: 0, parsedCount: 0 }
  }

  const { loadGraphDataFromTextViaParser } = (await import('@/features/parsers/loader')) as typeof import('@/features/parsers/loader')
  assertCurrent()

  let remainingFiles = WORKSPACE_IMPORT_AUTO_PARSE_MAX_FILES
  let remainingChars = WORKSPACE_IMPORT_AUTO_PARSE_MAX_TOTAL_CHARS
  let parsedCount = 0
  let preferredInteractiveImportGraphData: GraphData | null = null
  let sawFrontmatterOnlyDoc = false
  let preferredInteractiveImportRawText: string | null = null

  for (const path of createdPaths) {
    if (remainingFiles <= 0 || remainingChars <= 0) break
    const idx = indexByWorkspaceSourcePath.get(resolveWorkspaceSourcePathKey(path))
    if (idx == null) continue
    const current = (next || merged)[idx]
    if (!current) continue
    if (!current.enabled) continue

    let text = typeof current.text === 'string' ? current.text : ''
    if (!text.trim()) {
      try {
        text = String((await fs.readFileText(path)) || '')
      } catch {
        text = ''
      }
      assertCurrent()
    }
    if (!text.trim()) continue
    const nameForParse = workspaceDocumentKey(path)
    const allowLargeLuminaCanvasParse =
      path.toLowerCase().endsWith('.json') &&
      text.length > WORKSPACE_IMPORT_AUTO_PARSE_MAX_FILE_CHARS &&
      looksLikeBytePlusLuminaCanvasText(text)
    const frontmatterHeaderBlock = extractYamlFrontmatterHeaderBlock(text)
    const frontmatterHeaderText = frontmatterHeaderBlock ? `${frontmatterHeaderBlock.rawBlock}\n` : ''
    const hasCanvasFrontmatterPresetInHeader = !!frontmatterHeaderText && !!parseCanvasWorkspaceFrontmatterPreset(frontmatterHeaderText)
    if (!preferredInteractiveImportRawText && hasCanvasFrontmatterPresetInHeader) {
      preferredInteractiveImportRawText = frontmatterHeaderText
    }
    if (text.length > WORKSPACE_IMPORT_AUTO_PARSE_MAX_FILE_CHARS && !allowLargeLuminaCanvasParse) continue
    if (text.length > remainingChars && !allowLargeLuminaCanvasParse) continue

    const textHash = buildSourceFileParseIdentityHash({
      cacheNamespace: `workspace-import:${path}`,
      name: workspaceDocumentKey(path),
      text,
    })
    if (current.parsedGraphData && String(current.parsedTextHash || '') === textHash) {
      // Keep Source File text in sync even when parsed graph/hash are already up to date.
      if (String(current.text || '') !== text) {
        ensureNext()[idx] = {
          ...current,
          text: resolveWorkspaceSourceFileInlineText(text),
        }
      }
      continue
    }

    remainingFiles -= 1
    remainingChars -= text.length

    const nativeTextHash = buildSourceFileParseIdentityHash({
      cacheNamespace: `source-file:${current.id}`, name: current.name, text,
    })
    const nativeParserId = typeof current.parsedParserId === 'string' ? current.parsedParserId.trim() : ''
    const reuseNativeParse = current.name === nameForParse && current.text === text
      && current.status === 'parsed' && !!nativeParserId && current.parsedTextHash === nativeTextHash
      && !!current.parsedGraphData
      && ((current.parsedGraphData.nodes?.length || 0) > 0 || (current.parsedGraphData.edges?.length || 0) > 0)
    let res: Awaited<ReturnType<typeof loadGraphDataFromTextViaParser>> | null = null
    // Native parsing owns this exact identity; reuse its result through the same import policy below.
    if (reuseNativeParse) {
      res = { graphData: current.parsedGraphData, parserId: nativeParserId }
    } else {
      try {
        res = await runInIdle(
          () => loadGraphDataFromTextViaParser(nameForParse, text, { applyToStore: false }),
          { timeoutMs: allowLargeLuminaCanvasParse ? 2500 : 650 },
        )
      } catch {
        res = null
      }
    }
    // Keep authority errors outside the parser fallback so the original rejection survives.
    assertCurrent()
    const graphData = res?.graphData || null
    const parserId = typeof res?.parserId === 'string' ? res.parserId : undefined
    const inlineText = resolveWorkspaceSourceFileInlineText(text)
    const hasCanvasFrontmatterPreset = hasCanvasFrontmatterPresetInHeader || !!parseCanvasWorkspaceFrontmatterPreset(text)
    if (!preferredInteractiveImportRawText && hasCanvasFrontmatterPreset) {
      preferredInteractiveImportRawText = text
    }
    if (!preferredInteractiveImportGraphData && graphData && isFrontmatterFlowGraph(graphData)) {
      preferredInteractiveImportGraphData = graphData
      preferredInteractiveImportRawText = text
    } else if (!preferredInteractiveImportGraphData && graphData && hasCanvasFrontmatterPreset) {
      preferredInteractiveImportGraphData = graphData
      preferredInteractiveImportRawText = text
    } else if (!preferredInteractiveImportGraphData && graphData && shouldActivateStrybldrImportSurface({ graphData })) {
      preferredInteractiveImportGraphData = graphData
    }
    if (!sawFrontmatterOnlyDoc && isFrontmatterOnlyDoc(text)) {
      sawFrontmatterOnlyDoc = true
      if (!preferredInteractiveImportRawText) preferredInteractiveImportRawText = text
    }

    const base = ensureNext()[idx]
    const hasGraphContent = !!(
      graphData &&
      (((graphData.nodes && graphData.nodes.length) || 0) > 0 || ((graphData.edges && graphData.edges.length) || 0) > 0)
    )
    if (hasGraphContent) {
      ensureNext()[idx] = {
        ...base,
        text: inlineText,
        ...buildSourceFileLifecycleState({
          status: 'parsed',
          parserId,
          textHash: reuseNativeParse ? nativeTextHash : textHash,
          graphData,
          ...(reuseNativeParse ? { previousState: current, preserveExistingRevision: true } : {}),
        }),
      }
      parsedCount += 1
    } else if (res) {
      ensureNext()[idx] = {
        ...base,
        text: inlineText,
        ...buildSourceFileLifecycleState({
          status: 'idle',
          parserId,
          textHash,
          graphData: undefined,
        }),
      }
    } else {
      ensureNext()[idx] = {
        ...base,
        text: inlineText,
        ...buildSourceFileLifecycleState({
          status: 'error',
          error: 'Parse failed',
          parserId,
          textHash,
          graphData: undefined,
        }),
      }
    }
  }

  assertCurrent()
  if (next) {
    publishSourceFiles(next)
    const preserveInteractiveImportLanding =
      !!preferredInteractiveImportRawText
      || !!preferredInteractiveImportGraphData
      || sawFrontmatterOnlyDoc
    if (!skipComposedGraphApply && !preserveInteractiveImportLanding) {
      if (applyToGraph) {
        scheduleApplyGraphOwnerComposedGraphFromSourceFiles()
      } else {
        scheduleApplyComposedGraphFromSourceFiles()
      }
    }
    assertCurrent()
    applyInteractiveImportModes({
      graphData: preferredInteractiveImportGraphData,
      frontmatterOnlyDoc: sawFrontmatterOnlyDoc,
      rawText: preferredInteractiveImportRawText,
    })
    await waitForCanvasFrontmatterSurfaceTransition()
    assertCurrent()
    return { sourceFilesUpdated: true, enabledCount, parsedCount }
  }
  if (merged !== existing || existing.length !== existingAll.length) {
    publishSourceFiles(merged)
    if (preferredInteractiveImportRawText || preferredInteractiveImportGraphData || sawFrontmatterOnlyDoc) {
      assertCurrent()
      applyInteractiveImportModes({
        graphData: preferredInteractiveImportGraphData,
        frontmatterOnlyDoc: sawFrontmatterOnlyDoc,
        rawText: preferredInteractiveImportRawText,
      })
      await waitForCanvasFrontmatterSurfaceTransition()
      assertCurrent()
    }
    return { sourceFilesUpdated: true, enabledCount, parsedCount: 0 }
  }
  if (preferredInteractiveImportRawText || preferredInteractiveImportGraphData || sawFrontmatterOnlyDoc) {
    assertCurrent()
    applyInteractiveImportModes({
      graphData: preferredInteractiveImportGraphData,
      frontmatterOnlyDoc: sawFrontmatterOnlyDoc,
      rawText: preferredInteractiveImportRawText,
    })
    await waitForCanvasFrontmatterSurfaceTransition()
    assertCurrent()
  }
  return { sourceFilesUpdated: false, enabledCount: 0, parsedCount: 0 }
}
