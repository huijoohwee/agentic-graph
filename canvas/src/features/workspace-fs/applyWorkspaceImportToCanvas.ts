import { useGraphStore } from '@/hooks/useGraphStore'
import type { SourceFile } from '@/hooks/store/types'
import type { GraphData } from '@/lib/graph/types'
import {
  WORKSPACE_IMPORT_AUTO_APPLY_ENABLED,
  WORKSPACE_IMPORT_AUTO_PARSE_MAX_FILES,
  WORKSPACE_IMPORT_AUTO_PARSE_MAX_FILE_CHARS,
  WORKSPACE_IMPORT_AUTO_PARSE_MAX_TOTAL_CHARS,
} from '@/lib/config'
import { DEFAULT_CANVAS_2D_RENDERER } from '@/lib/config.render'
import { extractYamlFrontmatterHeaderBlock, isFrontmatterOnlyDoc, parseCanvasWorkspaceFrontmatterPreset } from '@/lib/markdown/frontmatter'
import { applyFrontmatterFlowImportModes } from '@/features/parsers/frontmatterFlowImportMode'
import { applyCanvasFrontmatterPreset } from '@/features/parsers/canvasFrontmatterPreset'
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
import { buildSourceFileLifecycleState } from '@/features/source-files/sourceFileParsedState'
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
  const removedSourcePathKeys = new Set(
    (Array.isArray(args.opts?.removedPaths) ? args.opts.removedPaths : [])
      .map(path => resolveWorkspaceSourcePathKey(normalizeWorkspacePath(path)))
      .filter(Boolean),
  )
  const existingAll = Array.isArray(store.sourceFiles) ? store.sourceFiles : []
  const existing = removedSourcePathKeys.size > 0
    ? existingAll.filter(file => !removedSourcePathKeys.has(String(file?.source?.path || '')))
    : existingAll
  const fs = args.fs
  const premergedSourceFiles = Array.isArray(args.opts?.premergedSourceFiles) ? args.opts?.premergedSourceFiles : null
  const workspaceEntries = premergedSourceFiles
    ? []
    : Array.isArray(args.opts?.workspaceEntries) ? args.opts.workspaceEntries : await fs.listEntries()
  const sourcesByPath = premergedSourceFiles ? null : resolveWorkspaceSourceIndexSnapshot(args.opts?.sourcesByPath)
  const merged = premergedSourceFiles || mergeWorkspaceEntriesIntoSourceFiles({
    existing,
    workspaceEntries,
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
      store.setSourceFiles(next)
      return { sourceFilesUpdated: true, enabledCount, parsedCount: 0 }
    }
    if (merged !== existing) {
      store.setSourceFiles(merged)
      return { sourceFilesUpdated: true, enabledCount: 0, parsedCount: 0 }
    }
    return { sourceFilesUpdated: false, enabledCount: 0, parsedCount: 0 }
  }

  const { loadGraphDataFromTextViaParser } = (await import('@/features/parsers/loader')) as typeof import('@/features/parsers/loader')

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

    let res: Awaited<ReturnType<typeof loadGraphDataFromTextViaParser>> | null = null
    try {
      res = await runInIdle(
        () => loadGraphDataFromTextViaParser(nameForParse, text, { applyToStore: false }),
        { timeoutMs: allowLargeLuminaCanvasParse ? 2500 : 650 },
      )
    } catch {
      res = null
    }
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
          textHash,
          graphData,
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

  if (next) {
    store.setSourceFiles(next)
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
    applyInteractiveImportModes({
      graphData: preferredInteractiveImportGraphData,
      frontmatterOnlyDoc: sawFrontmatterOnlyDoc,
      rawText: preferredInteractiveImportRawText,
    })
    await waitForCanvasFrontmatterSurfaceTransition()
    return { sourceFilesUpdated: true, enabledCount, parsedCount }
  }
  if (merged !== existing) {
    store.setSourceFiles(merged)
    if (preferredInteractiveImportRawText || preferredInteractiveImportGraphData || sawFrontmatterOnlyDoc) {
      applyInteractiveImportModes({
        graphData: preferredInteractiveImportGraphData,
        frontmatterOnlyDoc: sawFrontmatterOnlyDoc,
        rawText: preferredInteractiveImportRawText,
      })
      await waitForCanvasFrontmatterSurfaceTransition()
    }
    return { sourceFilesUpdated: true, enabledCount, parsedCount: 0 }
  }
  if (preferredInteractiveImportRawText || preferredInteractiveImportGraphData || sawFrontmatterOnlyDoc) {
    applyInteractiveImportModes({
      graphData: preferredInteractiveImportGraphData,
      frontmatterOnlyDoc: sawFrontmatterOnlyDoc,
      rawText: preferredInteractiveImportRawText,
    })
    await waitForCanvasFrontmatterSurfaceTransition()
  }
  return { sourceFilesUpdated: false, enabledCount: 0, parsedCount: 0 }
}
