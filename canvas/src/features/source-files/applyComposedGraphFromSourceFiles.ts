import { useGraphStore } from '@/hooks/useGraphStore'
import { isWorkspaceEditorOverlayOpen, isWorkspaceGraphMutationBlocked } from '@/features/workspace-table/workspaceTableSsot'
import {
  buildSourceLayerKeys,
  composeGraphFromSourceLayers,
  resolveSourceLayerKeyChange,
} from '@/lib/graph/sourceLayers'
import { applyFrontmatterFlowImportModes } from '@/features/parsers/frontmatterFlowImportMode'
import { applyCanvasFrontmatterPreset } from '@/features/parsers/canvasFrontmatterPreset'
import { isFrontmatterOnlyPolicyActive } from '@/lib/config.render'
import { isFrontmatterFlowGraph } from '@/lib/graph/frontmatterMode'
import { useMarkdownExplorerStore } from '@/features/markdown-explorer/store'
import {
  resolveComposedApplyDeferralReason,
  shouldClearComposedGraphForEmptyState,
} from '@/features/source-files/composedApplyGuards'
import { resolvePreferredComposedSourceRawTextFromState, resolvePreferredEnabledComposedSourceFileFromState } from '@/features/source-files/composedSourceSelection'
import { buildScopedGraphSemanticKey } from '@/lib/graph/semanticKey'
import { hashSignatureParts } from '@/lib/hash/signature'
import {
  buildSourceFilesCompositionSignature,
  getSourceFileTextHash,
  isWorkspaceBackedSourceFile,
} from '@/features/source-files/sourceFilesSignatures'
import { resolveFlowWidgetStateGraphKey } from '@/lib/storyboardWidget/widgetStateScope'
import { resolveGraphActivationFitDecision } from '@/lib/zoom/graphActivationFit'

let pendingComposeRaf: number | null = null
let pendingComposeAfterWorkspaceOverlayClose = false
let pendingComposeAfterWorkspaceOverlayCloseIncludesWorkspaceBacked = false
let pendingComposeIncludesWorkspaceBackedSources = false
let workspaceOverlayComposeRetryUnsubscribe: (() => void) | null = null
let lastAppliedComposedImportModesSignature = ''
let pendingComposedGraphSignature = ''
let lastAppliedComposedGraphSignature = ''
let lastWorkspaceOpenStoryboardWidgetFitGraphKey = ''

type ComposeSourceFilesOptions = {
  includeWorkspaceBacked?: boolean
  intent?: 'explicit-graph-owner'
  precomputedSignature?: string
}

function shouldIncludeWorkspaceBackedSources(options: ComposeSourceFilesOptions = {}): boolean {
  return options.includeWorkspaceBacked === true && options.intent === 'explicit-graph-owner'
}

function buildExplicitGraphOwnerComposeOptions(): ComposeSourceFilesOptions {
  return { includeWorkspaceBacked: true, intent: 'explicit-graph-owner' }
}

function hasEnabledNonWorkspaceComposedSources(
  sourceFiles: ReturnType<typeof useGraphStore.getState>['sourceFiles'],
): boolean {
  const list = Array.isArray(sourceFiles) ? sourceFiles : []
  return list.some(file => {
    if (!file?.enabled) return false
    return !isWorkspaceBackedSourceFile(file)
  })
}

function hasEnabledComposedSources(
  sourceFiles: ReturnType<typeof useGraphStore.getState>['sourceFiles'],
): boolean {
  const list = Array.isArray(sourceFiles) ? sourceFiles : []
  return list.some(file => Boolean(file?.enabled))
}

function readSourceFilesForComposedApply(
  sourceFiles: ReturnType<typeof useGraphStore.getState>['sourceFiles'],
  options: ComposeSourceFilesOptions = {},
): ReturnType<typeof useGraphStore.getState>['sourceFiles'] {
  const list = Array.isArray(sourceFiles) ? sourceFiles : []
  if (shouldIncludeWorkspaceBackedSources(options)) return list
  return list.filter(file => !isWorkspaceBackedSourceFile(file))
}

function resetPendingComposedGraphApplyState() {
  pendingComposedGraphSignature = ''
  pendingComposeAfterWorkspaceOverlayClose = false
  pendingComposeAfterWorkspaceOverlayCloseIncludesWorkspaceBacked = false
  pendingComposeIncludesWorkspaceBackedSources = false
}

function clearComposedGraphIfEmpty(store: ReturnType<typeof useGraphStore.getState>, hasEnabledSourceFiles: boolean) {
  resetPendingComposedGraphApplyState()
  lastAppliedComposedImportModesSignature = ''
  if (
    shouldClearComposedGraphForEmptyState({
      previousGraphData: store.graphData,
      hasEnabledSourceFiles,
      hasEnabledContent: false,
    })
  ) {
    store.setGraphData({ type: 'Graph', nodes: [], edges: [], metadata: {} })
    store.setOpenWidgetNodeIds([])
  }
}

function readCurrentComposedGraphSignature(options: ComposeSourceFilesOptions = {}): string {
  const precomputedSignature = String(options.precomputedSignature || '').trim()
  if (precomputedSignature) return precomputedSignature
  try {
    return buildSourceFilesCompositionSignature(useGraphStore.getState().sourceFiles, options)
  } catch {
    return ''
  }
}

function ensureWorkspaceOverlayComposeRetrySubscription() {
  if (workspaceOverlayComposeRetryUnsubscribe) return
  workspaceOverlayComposeRetryUnsubscribe = useGraphStore.subscribe(
    s => [s.workspaceViewMode, s.workspaceCanvasPaneOpen] as const,
    ([workspaceViewMode, workspaceCanvasPaneOpen], previous) => {
      const workspaceOverlayOpen = isWorkspaceEditorOverlayOpen({ workspaceViewMode, workspaceCanvasPaneOpen })
      const previousOverlayOpen = Array.isArray(previous)
        ? isWorkspaceEditorOverlayOpen({ workspaceViewMode: previous[0], workspaceCanvasPaneOpen: previous[1] })
        : workspaceOverlayOpen
      if (!pendingComposeAfterWorkspaceOverlayClose || workspaceOverlayOpen || !previousOverlayOpen) return
      const includeWorkspaceBacked = pendingComposeAfterWorkspaceOverlayCloseIncludesWorkspaceBacked
      pendingComposeAfterWorkspaceOverlayClose = false
      pendingComposeAfterWorkspaceOverlayCloseIncludesWorkspaceBacked = false
      if (includeWorkspaceBacked) {
        scheduleApplyGraphOwnerComposedGraphFromSourceFiles()
        return
      }
      scheduleApplyComposedGraphFromSourceFiles()
    },
  )
}

function buildComposedImportModesSignature(args: {
  state: ReturnType<typeof useGraphStore.getState>
  sourceFiles: ReturnType<typeof useGraphStore.getState>['sourceFiles']
  graphData: ReturnType<typeof composeGraphFromSourceLayers>['graphData']
  explorerActivePath: string | null
}): {
  signature: string
  rawText: string
} {
  const selectionState = {
    sourceFiles: args.sourceFiles,
    markdownDocumentName: args.state.markdownDocumentName,
  }
  const preferredSourceFile = resolvePreferredEnabledComposedSourceFileFromState({
    state: selectionState,
    explorerActivePath: args.explorerActivePath,
  })
  const preferredSourcePath = String(preferredSourceFile?.source?.path || preferredSourceFile?.name || '').trim()
  const preferredSourceText = resolvePreferredComposedSourceRawTextFromState({
    state: selectionState,
    explorerActivePath: args.explorerActivePath,
  })
  const preferredSourceTextHash = String(preferredSourceFile?.parsedTextHash || '').trim()
    || (preferredSourceFile ? getSourceFileTextHash(preferredSourceFile) : '')
  const graphSemanticKey = buildScopedGraphSemanticKey('composed-import-modes', {
    graphData: args.graphData,
  })
  return {
    signature: hashSignatureParts([
      'composed-import-modes',
      graphSemanticKey,
      preferredSourcePath,
      preferredSourceTextHash,
      String(args.state.canvasRenderMode || ''),
      String(args.state.canvas2dRenderer || ''),
    ]),
    rawText: preferredSourceText,
  }
}

function applyComposedSourceImportModes(
  graphData: ReturnType<typeof composeGraphFromSourceLayers>['graphData'],
  sourceFiles: ReturnType<typeof useGraphStore.getState>['sourceFiles'],
) {
  try {
    const store = useGraphStore.getState()
    if (isWorkspaceGraphMutationBlocked(store)) return
    const explorerActivePath = useMarkdownExplorerStore.getState().activePath
    const { signature, rawText } = buildComposedImportModesSignature({
      state: store,
      sourceFiles,
      graphData,
      explorerActivePath,
    })
    if (signature && lastAppliedComposedImportModesSignature === signature) return
    applyFrontmatterFlowImportModes(graphData)
    if (rawText) {
      applyCanvasFrontmatterPreset({ graphData, rawText })
    }
    lastAppliedComposedImportModesSignature = signature
  } catch {
    void 0
  }
}

function requestWorkspaceOpenStoryboardWidgetFit(graphData: ReturnType<typeof composeGraphFromSourceLayers>['graphData']) {
  const st = useGraphStore.getState()
  const decision = resolveGraphActivationFitDecision({
    previousGraphKey: lastWorkspaceOpenStoryboardWidgetFitGraphKey,
    graphData,
    fitEligible: isFrontmatterFlowGraph(graphData)
      && isWorkspaceEditorOverlayOpen(st)
      && st.canvasRenderMode === '2d'
      && st.canvas2dRenderer === 'storyboard',
  })
  const graphKey = decision.graphKey
  if (!isFrontmatterFlowGraph(graphData)) {
    lastWorkspaceOpenStoryboardWidgetFitGraphKey = graphKey
    return
  }
  if (!graphKey || graphKey === lastWorkspaceOpenStoryboardWidgetFitGraphKey) return
  lastWorkspaceOpenStoryboardWidgetFitGraphKey = graphKey
  if (!decision.request) return
  useGraphStore.setState({ zoomRequest: decision.request })
}

export function scheduleApplyGraphOwnerComposedGraphFromSourceFiles() {
  scheduleApplyComposedGraphFromSourceFiles(buildExplicitGraphOwnerComposeOptions())
}

export function scheduleApplyGraphOwnerComposedGraphFromSourceFilesWithSignature(precomputedSignature: string) {
  scheduleApplyComposedGraphFromSourceFiles({
    ...buildExplicitGraphOwnerComposeOptions(),
    precomputedSignature,
  })
}

export function applyGraphOwnerComposedGraphFromSourceFiles() {
  applyComposedGraphFromSourceFiles(buildExplicitGraphOwnerComposeOptions())
}

export function scheduleApplyComposedGraphFromSourceFiles(options: ComposeSourceFilesOptions = {}) {
  ensureWorkspaceOverlayComposeRetrySubscription()
  const currentSourceFiles = useGraphStore.getState().sourceFiles
  const includeWorkspaceBacked = shouldIncludeWorkspaceBackedSources(options)
  if (!includeWorkspaceBacked) {
    if (!hasEnabledNonWorkspaceComposedSources(currentSourceFiles)) {
      resetPendingComposedGraphApplyState()
      const w = typeof window !== 'undefined' ? window : null
      if (pendingComposeRaf != null && w && typeof w.cancelAnimationFrame === 'function') {
        w.cancelAnimationFrame(pendingComposeRaf)
        pendingComposeRaf = null
      }
      applyComposedGraphFromSourceFiles(options)
      return
    }
  } else if (!hasEnabledComposedSources(currentSourceFiles)) {
    resetPendingComposedGraphApplyState()
    const w = typeof window !== 'undefined' ? window : null
    if (pendingComposeRaf != null && w && typeof w.cancelAnimationFrame === 'function') {
      w.cancelAnimationFrame(pendingComposeRaf)
      pendingComposeRaf = null
    }
    applyComposedGraphFromSourceFiles(options)
    return
  }
  const requestedIncludesWorkspaceBacked = includeWorkspaceBacked || pendingComposeIncludesWorkspaceBackedSources
  const requestedSignature = readCurrentComposedGraphSignature(
    requestedIncludesWorkspaceBacked
      ? { ...buildExplicitGraphOwnerComposeOptions(), ...(options.precomputedSignature ? { precomputedSignature: options.precomputedSignature } : {}) }
      : options.precomputedSignature ? { precomputedSignature: options.precomputedSignature } : undefined,
  )
  if (requestedSignature && requestedSignature === lastAppliedComposedGraphSignature) return
  if (includeWorkspaceBacked) pendingComposeIncludesWorkspaceBackedSources = true
  if (pendingComposeRaf != null && requestedSignature && requestedSignature === pendingComposedGraphSignature) return
  if (requestedSignature) pendingComposedGraphSignature = requestedSignature
  if (pendingComposeRaf != null) return
  const w = typeof window !== 'undefined' ? window : null
  if (!w || typeof w.requestAnimationFrame !== 'function') {
    const applyOptions = pendingComposeIncludesWorkspaceBackedSources
      ? buildExplicitGraphOwnerComposeOptions()
      : undefined
    pendingComposeIncludesWorkspaceBackedSources = false
    applyComposedGraphFromSourceFiles(applyOptions)
    return
  }
  pendingComposeRaf = w.requestAnimationFrame(() => {
    pendingComposeRaf = null
    const applyOptions = pendingComposeIncludesWorkspaceBackedSources
      ? buildExplicitGraphOwnerComposeOptions()
      : undefined
    pendingComposeIncludesWorkspaceBackedSources = false
    applyComposedGraphFromSourceFiles(applyOptions)
  })
}

export function applyComposedGraphFromSourceFiles(options: ComposeSourceFilesOptions = {}) {
  const includeWorkspaceBacked = shouldIncludeWorkspaceBackedSources(options)
  const composeScopeOptions = includeWorkspaceBacked ? buildExplicitGraphOwnerComposeOptions() : undefined
  const composeSignature = pendingComposedGraphSignature || readCurrentComposedGraphSignature(composeScopeOptions)
  const store = useGraphStore.getState()
  if (isFrontmatterOnlyPolicyActive({ canvasRenderMode: store.canvasRenderMode, canvas2dRenderer: store.canvas2dRenderer })) {
    resetPendingComposedGraphApplyState()
    return
  }
  if (!includeWorkspaceBacked && !hasEnabledNonWorkspaceComposedSources(store.sourceFiles)) {
    clearComposedGraphIfEmpty(store, false)
    return
  }
  if (includeWorkspaceBacked && !hasEnabledComposedSources(store.sourceFiles)) {
    clearComposedGraphIfEmpty(store, false)
    return
  }
  const workspaceEditorOverlayOpen = isWorkspaceEditorOverlayOpen(store)
  const sourceFilesForComposition = readSourceFilesForComposedApply(store.sourceFiles, composeScopeOptions)
  const hasEnabledSourceFiles = sourceFilesForComposition.some(f => Boolean(f?.enabled))
  if (!hasEnabledSourceFiles) {
    if (composeSignature) lastAppliedComposedGraphSignature = composeSignature
    clearComposedGraphIfEmpty(store, hasEnabledSourceFiles)
    return
  }
  const layers = sourceFilesForComposition.map(f => ({
    id: f.id,
    name: f.name,
    enabled: Boolean(f.enabled),
    status: f.status,
    source: f.source,
    text: f.text,
    parsedTextHash: f.parsedTextHash,
    parsedGraphRevision: f.parsedGraphRevision,
    parsedGraphData: f.parsedGraphData,
  }))

  const hasEnabledContent = layers.some(layer => {
    if (!layer.enabled) return false
    if (layer.parsedGraphData) return true
    return Boolean(String(layer.text || '').trim())
  })
  if (!hasEnabledContent) {
    if (composeSignature) lastAppliedComposedGraphSignature = composeSignature
    clearComposedGraphIfEmpty(store, hasEnabledSourceFiles)
    return
  }

  const { contentKey, orderKey } = buildSourceLayerKeys(layers)
  const change = resolveSourceLayerKeyChange({
    previousGraphData: store.graphData,
    contentKey,
    orderKey,
  })
  if (change === 'unchanged') {
    if (composeSignature) lastAppliedComposedGraphSignature = composeSignature
    resetPendingComposedGraphApplyState()
    const graphData = store.graphData
    const metadata =
      graphData?.metadata && typeof graphData.metadata === 'object'
        ? (graphData.metadata as Record<string, unknown>)
        : null
    if (graphData && String(metadata?.sourceLayerComposition || '') === 'compose') {
      applyComposedSourceImportModes(graphData, sourceFilesForComposition)
    }
    return
  }
  if (String((store.graphData?.metadata as Record<string, unknown> | null)?.sourceLayerComposition || '') !== 'compose') {
    lastAppliedComposedImportModesSignature = ''
  }

  const { graphData } = composeGraphFromSourceLayers({ layers, precomputedKeys: { contentKey, orderKey } })
  if (
    resolveComposedApplyDeferralReason({
      layers,
      composedGraphData: graphData,
      previousGraphData: store.graphData,
      workspaceEditorOverlayOpen,
    })
  ) {
    if (workspaceEditorOverlayOpen) {
      pendingComposeAfterWorkspaceOverlayClose = true
      pendingComposeAfterWorkspaceOverlayCloseIncludesWorkspaceBacked ||= includeWorkspaceBacked
    }
    return
  }

  pendingComposeAfterWorkspaceOverlayClose = false
  pendingComposeAfterWorkspaceOverlayCloseIncludesWorkspaceBacked = false
  if (composeSignature) lastAppliedComposedGraphSignature = composeSignature
  pendingComposedGraphSignature = ''

  if (!lastWorkspaceOpenStoryboardWidgetFitGraphKey) {
    lastWorkspaceOpenStoryboardWidgetFitGraphKey =
      resolveFlowWidgetStateGraphKey({ graphData: store.graphData }) || ''
  }

  if (change === 'order-only') {
    store.setGraphDataPreservingLayout(graphData)
    requestWorkspaceOpenStoryboardWidgetFit(graphData)
    return
  }
  store.setGraphData(graphData)
  applyComposedSourceImportModes(graphData, sourceFilesForComposition)
  requestWorkspaceOpenStoryboardWidgetFit(graphData)
}
