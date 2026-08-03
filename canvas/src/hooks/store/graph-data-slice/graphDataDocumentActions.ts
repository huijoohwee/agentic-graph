import type { GraphData, JSONValue } from '@/lib/graph/types'
import type { GetGraph, SetGraph } from './graphDataSliceAccess'
import { containsFrontmatterMermaid, isMarkdownLikeFileName, normalizeMermaidMmdToMarkdown } from 'grph-shared/markdown/mermaidInput'
import { buildSourceFileLifecycleState } from '@/features/source-files/sourceFileParsedState'
import { isFrontmatterOnlyPolicyActive } from '@/lib/config.render'
import { buildFlowWidgetOverlayEligibleNodeIdSet } from '@/lib/graph/flowWidgetEligibility'
import {
  parseCanvasWorkspaceFrontmatterPreset,
  preferCanonicalYamlFrontmatterFencedText,
  type CanvasWorkspaceFrontmatterPreset,
} from '@/lib/markdown/frontmatter'
import { buildGraphMetaKeyIgnoringPending } from '@/lib/graph/graphMetaKey'
import { buildScopedGraphSemanticKey } from '@/lib/graph/semanticKey'
import { hashStringToHexSharedContentCached } from '@/lib/hash/textHashCache'
import { isWorkspaceGraphMutationBlocked } from '@/features/workspace-table/workspaceTableSsot'
import { applyCanvasFrontmatterPreset } from '@/features/parsers/canvasFrontmatterPreset'
import {
  waitForCanvasFrontmatterSurfaceTransition,
} from '@/features/parsers/canvasFrontmatterSurfaceTransition'
import { isStrybldrStoryboardMarkdown } from '@/features/strybldr/strybldrStoryboard'
import {
  createGraphActivationFitRequest,
  createGraphActivationTransformRequest,
} from '@/lib/zoom/graphActivationFit'
import {
  computeNaturalCanvasInitialTransform,
} from '@/lib/zoom/fixedZoomPreset'
import { isAuthoredMarkdownNoteInitialDocument } from '@/features/workspace-fs/workspaceAuthoredNoteDocument'
import { MarkdownApplyRequestQueue } from './markdownApplyRequestQueue'
import { createGraphDataDocumentProjectionActions } from './graphDataDocumentProjectionActions'
import { createGraphDataMarkdownDocumentStateActions } from './graphDataMarkdownDocumentStateActions'

type PendingMarkdownApplyRequest = {
  name: string
  text: string
  force: boolean
  applyViewPreset: boolean
  preset?: CanvasWorkspaceFrontmatterPreset | null
  requireActiveMarkdownDocument: boolean
}

const markdownApplyRequestQueue = new MarkdownApplyRequestQueue<PendingMarkdownApplyRequest>()
let lastCompletedMarkdownApplyKey = ''
let lastCompletedMarkdownApplyGraph: GraphData | null = null
let lastCompletedMarkdownApplyGraphRevision = -1
let lastCompletedMarkdownApplyGraphContentRevision = -1

function buildCanvasWorkspacePresetApplyKey(preset: CanvasWorkspaceFrontmatterPreset | null | undefined): string {
  if (!preset) return ''
  return [
    preset.canvasSurfaceMode || '',
    preset.canvasRenderMode || '',
    preset.canvas2dRenderer || '',
    preset.videoSequenceTimelineEnabled === true ? 'video-sequence:1' : preset.videoSequenceTimelineEnabled === false ? 'video-sequence:0' : 'video-sequence:',
    preset.canvas3dMode || '',
    preset.documentSemanticMode || '',
    preset.frontmatterModeEnabled === true ? 'fm:1' : preset.frontmatterModeEnabled === false ? 'fm:0' : 'fm:',
    preset.multiDimTableModeEnabled === true ? 'mdtbl:1' : preset.multiDimTableModeEnabled === false ? 'mdtbl:0' : 'mdtbl:',
    preset.documentStructureBaselineLock === true ? 'lock:1' : preset.documentStructureBaselineLock === false ? 'lock:0' : 'lock:',
  ].join('|')
}

function buildMarkdownApplyRequestSemanticKey(request: PendingMarkdownApplyRequest): string {
  const name = String(request.name || '').trim()
  const text = String(request.text || '')
  const textHash = hashStringToHexSharedContentCached(text, 'markdown-document-graph-apply')
  return buildScopedGraphSemanticKey('markdown-document-graph-apply-request', {
    graphSemanticKey: [
      name,
      text.length,
      textHash,
      buildCanvasWorkspacePresetApplyKey(request.preset),
    ].join('|'),
  })
}

function isCompletedMarkdownApplyRequestCurrent(get: GetGraph, request: PendingMarkdownApplyRequest, requestKey: string): boolean {
  if (!requestKey || lastCompletedMarkdownApplyKey !== requestKey) return false
  const state = get()
  return !!(
    state.graphData &&
    state.graphData === lastCompletedMarkdownApplyGraph &&
    state.graphDataRevision === lastCompletedMarkdownApplyGraphRevision &&
    state.graphContentRevision === lastCompletedMarkdownApplyGraphContentRevision &&
    state.markdownDocumentName === request.name &&
    state.markdownDocumentText === request.text
  )
}

function isMarkdownApplyRequestInFlight(requestKey: string): boolean {
  return markdownApplyRequestQueue.isKeyInFlight(requestKey)
}

function isMarkdownApplyRequestActiveDocumentCurrent(get: GetGraph, request: PendingMarkdownApplyRequest): boolean {
  if (!request.requireActiveMarkdownDocument) return true
  const state = get()
  return state.markdownDocumentName === request.name && state.markdownDocumentText === request.text
}

function buildCanvasWorkspacePresetMetadata(
  preset: CanvasWorkspaceFrontmatterPreset | null | undefined,
): Record<string, JSONValue> | null {
  if (!preset) return null
  return {
    canvasSurfaceMode: preset.canvasSurfaceMode || null,
    canvasRenderMode: preset.canvasRenderMode || null,
    canvas2dRenderer: preset.canvas2dRenderer || null,
    videoSequenceTimelineEnabled: preset.videoSequenceTimelineEnabled ?? null,
    canvas3dMode: preset.canvas3dMode || null,
    documentSemanticMode: preset.documentSemanticMode || null,
    frontmatterModeEnabled: preset.frontmatterModeEnabled ?? null,
    multiDimTableModeEnabled: preset.multiDimTableModeEnabled ?? null,
    documentStructureBaselineLock: preset.documentStructureBaselineLock ?? null,
  }
}

function withMarkdownDocumentSourceMetadata(
  graphData: GraphData,
  name: string,
  preset?: CanvasWorkspaceFrontmatterPreset | null,
): GraphData {
  const source = `markdown:${String(name || '').trim()}`
  if (!source || source === 'markdown:') return graphData
  const metadata = graphData.metadata && typeof graphData.metadata === 'object' && !Array.isArray(graphData.metadata)
    ? (graphData.metadata as Record<string, JSONValue>)
    : {}
  const canvasWorkspacePreset = buildCanvasWorkspacePresetMetadata(preset)
  if (metadata.source === source && !canvasWorkspacePreset) return graphData
  return {
    ...graphData,
    metadata: {
      ...metadata,
      source,
      markdownDocumentName: String(name || '').trim(),
      ...(canvasWorkspacePreset ? { canvasWorkspacePreset } : {}),
    } as unknown as GraphData['metadata'],
  }
}

function buildPendingMarkdownDocumentGraph(args: {
  name: string
  currentGraph: GraphData | null
  preset?: CanvasWorkspaceFrontmatterPreset | null
}): GraphData {
  const name = String(args.name || '').trim()
  const currentMeta = ((args.currentGraph?.metadata || null) as Record<string, unknown> | null) || null
  const currentBaselineGraphMetaKey =
    typeof currentMeta?.baselineGraphMetaKey === 'string'
      ? String(currentMeta.baselineGraphMetaKey || '').trim()
      : ''
  const currentSource = typeof currentMeta?.source === 'string' ? String(currentMeta.source || '').trim() : ''
  const source = name ? `markdown:${name}` : (currentSource || 'markdown:pending')
  const baselineGraphMetaKey =
    currentBaselineGraphMetaKey
    || buildGraphMetaKeyIgnoringPending(args.currentGraph)
    || source
  const preset = args.preset || null
  const context =
    preset?.frontmatterModeEnabled === true || preset?.canvas2dRenderer === 'storyboard'
      ? 'frontmatter-flow'
      : 'markdown'
  const kind =
    context === 'frontmatter-flow'
      ? 'frontmatter-flow'
      : 'markdown'
  return {
    type: 'Graph',
    context,
    metadata: {
      kind,
      source,
      baselineGraphMetaKey,
      canvasWorkspacePreset: buildCanvasWorkspacePresetMetadata(preset),
      pending: true,
    },
    nodes: [],
    edges: [],
  } as GraphData
}

function resetFrontmatterFlowWidgetRuntimeState(get: GetGraph, graphData: GraphData): void {
  const state = get()
  const enforceFrontmatterOnly = isFrontmatterOnlyPolicyActive({
    canvasRenderMode: state.canvasRenderMode,
    canvas2dRenderer: state.canvas2dRenderer,
  })
  if (!enforceFrontmatterOnly) return
  if (isWorkspaceGraphMutationBlocked(state)) return

  const parsedNodes = Array.isArray(graphData.nodes) ? graphData.nodes : []
  const eligibleFlowWidgetNodeIds = buildFlowWidgetOverlayEligibleNodeIdSet(parsedNodes as any)
  const isEligibleFlowWidgetNodeId = (id: unknown): boolean => {
    const normalized = String(id || '').trim()
    return !!normalized && eligibleFlowWidgetNodeIds.has(normalized)
  }
  const activeWidgetIds = Array.isArray(state.openWidgetNodeIds) ? state.openWidgetNodeIds : []
  const sanitizedWidgetIds = activeWidgetIds
    .map(id => String(id || '').trim())
    .filter(isEligibleFlowWidgetNodeId)
  state.setOpenWidgetNodeIds(sanitizedWidgetIds)
  const currentPinnedByNodeId = state.flowWidgetPinnedByNodeId || {}
  const nextPinnedByNodeId = Object.fromEntries(
    Object.entries(currentPinnedByNodeId).filter(([id]) => isEligibleFlowWidgetNodeId(id)),
  ) as Record<string, boolean>
  state.setFlowWidgetPinnedByNodeId(nextPinnedByNodeId)
}

function canReuseParsedMarkdownSourceGraph(args: {
  text: string
  graphData: GraphData | null | undefined
}): boolean {
  const graphData = args.graphData || null
  if (!graphData) return false
  if (!isStrybldrStoryboardMarkdown(args.text)) return true
  const metadata = graphData.metadata && typeof graphData.metadata === 'object' && !Array.isArray(graphData.metadata)
    ? (graphData.metadata as Record<string, unknown>)
    : null
  const parserId = String(metadata?.parserId || '').trim()
  const kind = String(metadata?.kind || graphData.context || '').trim()
  if (parserId !== 'strybldr-storyboard' && kind !== 'strybldr-storyboard') return false
  return Array.isArray(graphData.nodes) && graphData.nodes.length > 0
}

export function createGraphDataDocumentActions(set: SetGraph, get: GetGraph) {
  return ({
  ...createGraphDataDocumentProjectionActions(set, get),
  ...createGraphDataMarkdownDocumentStateActions(set, get),

  setActiveMarkdownDocument: async (args: {
    name: string
    text: string
    sourceUrl?: string | null
    jsonSourceText?: string | null
    canonicalMarkdownText?: string | null
    expectedCurrentDocumentName?: string | null
    expectedCurrentDocumentText?: string | null
    autoEnableFrontmatter?: boolean
    applyViewPreset?: boolean
    recent?: Omit<import('@/hooks/store/types').RecentFileEntry, 'id' | 'timestamp'> | null
    applyToGraph?: boolean
    forceApplyToGraph?: boolean
    canvasWorkspacePreset?: CanvasWorkspaceFrontmatterPreset | null
    normalizeMermaidMmd?: boolean
  }): Promise<boolean> => {
    const name = String(args?.name || '').trim()
    if (!name) return false
    const rawText = String(args?.text || '')
    const normalizedText = args?.normalizeMermaidMmd === false ? rawText : normalizeMermaidMmdToMarkdown(name, rawText)
    const previousState = get()
    const hasExpectedCurrentDocumentName = Object.prototype.hasOwnProperty.call(args || {}, 'expectedCurrentDocumentName')
    const hasExpectedCurrentDocumentText = Object.prototype.hasOwnProperty.call(args || {}, 'expectedCurrentDocumentText')
    if (hasExpectedCurrentDocumentName || hasExpectedCurrentDocumentText) {
      const currentDocumentName = String(previousState.markdownDocumentName || '').trim()
      const currentDocumentText = String(previousState.markdownDocumentText || '')
      const expectedDocumentName = String(args.expectedCurrentDocumentName || '').trim()
      const expectedDocumentText = String(args.expectedCurrentDocumentText || '')
      const currentDocumentMatchesExpectation = (
        (!hasExpectedCurrentDocumentName || currentDocumentName === expectedDocumentName)
        && (!hasExpectedCurrentDocumentText || currentDocumentText === expectedDocumentText)
      )
      const incomingDocumentIsCurrent = currentDocumentName === name && currentDocumentText === normalizedText
      if (!currentDocumentMatchesExpectation && !incomingDocumentIsCurrent) return false
    }
    const didSwitchActiveDocument = previousState.markdownDocumentName !== name
    const canonicalText = typeof args?.canonicalMarkdownText === 'string'
      ? args.canonicalMarkdownText
      : previousState.markdownDocumentName === name
        ? String(previousState.markdownDocumentText || '')
        : ''
    const text = canonicalText
      ? preferCanonicalYamlFrontmatterFencedText({
          candidateText: normalizedText,
          canonicalText,
        })
      : normalizedText
    // A same-document publication can reapply the canonical Markdown after it
    // commits generated graph nodes. Keep the view-local Widget/Rich Media
    // identities in that case; the graph commit sanitizes identities whose
    // nodes were actually removed. Only a real document switch owns a full
    // transient presentation reset.
    const shouldResetTransientCanvasState = args?.applyToGraph === true && didSwitchActiveDocument
    if (shouldResetTransientCanvasState) {
      previousState.selectNode(null)
      previousState.setOpenWidgetNodeIds([])
      previousState.setSelectionSource(null)
    }
    const hasProvidedCanvasPreset = Object.prototype.hasOwnProperty.call(args || {}, 'canvasWorkspacePreset')
    const shouldApplyExplicitCanvasPreset = hasProvidedCanvasPreset && !!args.canvasWorkspacePreset
    const shouldResolveCanvasPreset =
      shouldApplyExplicitCanvasPreset ||
      args?.applyViewPreset !== false ||
      args?.applyToGraph === true
    const parsedTextPreset = shouldResolveCanvasPreset
      ? (hasProvidedCanvasPreset ? args.canvasWorkspacePreset ?? null : parseCanvasWorkspaceFrontmatterPreset(text))
      : null
    const applyViewPresetForSwitch = args?.applyViewPreset !== false
    get().setMarkdownDocument(name, text, {
      autoEnableFrontmatter: args?.autoEnableFrontmatter,
      applyViewPreset: args?.applyViewPreset,
      forceRevision: args?.applyToGraph === true && args?.forceApplyToGraph !== false,
    })

    if ((args?.applyViewPreset !== false || shouldApplyExplicitCanvasPreset) && text.trim()) {
      try {
        applyCanvasFrontmatterPreset({
          graphData: get().graphData,
          rawText: text,
          preset: parsedTextPreset || undefined,
        })
        await waitForCanvasFrontmatterSurfaceTransition()
      } catch {
        return false
      }
      const currentDocument = get()
      if (
        currentDocument.markdownDocumentName !== name
        || currentDocument.markdownDocumentText !== text
      ) return false
    }

    if ('sourceUrl' in (args as Record<string, unknown>)) {
      get().setMarkdownDocumentSourceUrl(typeof args.sourceUrl === 'string' ? args.sourceUrl : null)
    }
    if ('jsonSourceText' in (args as Record<string, unknown>)) {
      const nextJson = typeof args.jsonSourceText === 'string' ? args.jsonSourceText : null
      get().setJsonSourceDocument(name, nextJson)
    }
    const recent = args?.recent ?? null
    if (recent) {
      try {
        get().addRecentFile(recent)
      } catch {
        void 0
      }
    }

    if (args?.applyToGraph) {
      const request: PendingMarkdownApplyRequest = {
        name,
        text,
        force: args?.forceApplyToGraph !== false,
        applyViewPreset: applyViewPresetForSwitch,
        preset: parsedTextPreset,
        requireActiveMarkdownDocument: true,
      }
      const requestKey = buildMarkdownApplyRequestSemanticKey(request)
      if (isCompletedMarkdownApplyRequestCurrent(get, request, requestKey)) return true
      if (isMarkdownApplyRequestInFlight(requestKey)) return markdownApplyRequestQueue.waitFor(requestKey)

      if (applyViewPresetForSwitch && didSwitchActiveDocument) {
        get().setGraphData(buildPendingMarkdownDocumentGraph({
          name,
          currentGraph: get().graphData,
          preset: parsedTextPreset,
        }))
      }
      const replayActiveDocumentCanvasPreset = async (): Promise<void> => {
        if (!applyViewPresetForSwitch && !shouldApplyExplicitCanvasPreset) return
        const active = get()
        if (active.markdownDocumentName !== name || active.markdownDocumentText !== text) return
        applyCanvasFrontmatterPreset({
          graphData: active.graphData,
          rawText: text,
          preset: parsedTextPreset || undefined,
        })
        await waitForCanvasFrontmatterSurfaceTransition()
      }
      const requestActiveDocumentFit = (): void => {
        if (!applyViewPresetForSwitch) return
        if (!didSwitchActiveDocument) return
        const active = get()
        if (active.markdownDocumentName !== name || active.markdownDocumentText !== text) return
        if (isAuthoredMarkdownNoteInitialDocument({ documentName: name, rawText: text })) {
          const zoomRequest = createGraphActivationTransformRequest({
            graphData: active.graphData,
            payload: computeNaturalCanvasInitialTransform(active),
            intent: 'naturalInitialization',
          })
          if (zoomRequest) set({ zoomRequest })
          return
        }
        const zoomRequest = createGraphActivationFitRequest({ graphData: active.graphData })
        if (zoomRequest) set({ zoomRequest })
      }
      try {
        const graphApplied = await get().applyMarkdownDocumentToGraph(name, text, {
          force: args?.forceApplyToGraph !== false,
          preset: parsedTextPreset,
          applyViewPreset: applyViewPresetForSwitch,
          requireActiveMarkdownDocument: true,
        })
        await replayActiveDocumentCanvasPreset()
        if (graphApplied) {
          requestActiveDocumentFit()
          return true
        }
        const active = get()
        return !!(
          applyViewPresetForSwitch &&
          !isMarkdownLikeFileName(name) &&
          active.markdownDocumentName === name &&
          active.markdownDocumentText === text
        )
      } catch {
        await replayActiveDocumentCanvasPreset()
        const active = get()
        return !!(
          applyViewPresetForSwitch &&
          !isMarkdownLikeFileName(name) &&
          active.markdownDocumentName === name &&
          active.markdownDocumentText === text
        )
      }
    }
    return true
  },

  applyMarkdownDocumentToGraph: async (name: string, text: string, opts?: { force?: boolean; preset?: CanvasWorkspaceFrontmatterPreset | null; applyViewPreset?: boolean; requireActiveMarkdownDocument?: boolean }) => {
    const runApply = async (request: PendingMarkdownApplyRequest): Promise<boolean> => {
      const nextName = String(request.name || '').trim()
      const nextText = String(request.text || '')
      if (!nextName || !nextText.trim()) return false

      const lower = nextName.toLowerCase()
      const isMarkdown = isMarkdownLikeFileName(lower)
      if (!isMarkdown) return false

      const state = get()
      const shouldApply = (() => {
        if (request.force) return true
        if ((state.documentSemanticMode || 'document') !== 'document') return false

        if (state.frontmatterModeEnabled || false) {
          const hasFrontmatterMermaid = containsFrontmatterMermaid(nextText)
          if (hasFrontmatterMermaid) return true
        }

        return true
      })()

      if (!shouldApply) return false
      if (!isMarkdownApplyRequestActiveDocumentCurrent(get, request)) return false

      const exactSourceFile = state.sourceFiles.find(file => String(file?.name || '').trim() === nextName) || null
      if (exactSourceFile) {
        const nextSourceText = nextText
        if (
          String(exactSourceFile.text || '') !== nextSourceText ||
          exactSourceFile.status === 'error'
        ) {
          get().updateSourceFile(exactSourceFile.id, {
            text: nextSourceText,
            ...buildSourceFileLifecycleState({
              status: 'idle',
              previousState: exactSourceFile,
              preserveParsedState: true,
            }),
          })
        }
      }

      const canReuseParsedSourceGraph = !!(
        exactSourceFile &&
        exactSourceFile.status === 'parsed' &&
        String(exactSourceFile.text || '') === nextText &&
        canReuseParsedMarkdownSourceGraph({
          text: nextText,
          graphData: exactSourceFile.parsedGraphData as GraphData | null | undefined,
        })
      )
      const parsedTextPreset = request.preset === undefined
        ? parseCanvasWorkspaceFrontmatterPreset(nextText)
        : request.preset
      const applyMarkdownDocumentCanvasPreset = async (graphData: GraphData | null): Promise<void> => {
        if (request.applyViewPreset === false) return
        applyCanvasFrontmatterPreset({
          graphData,
          rawText: nextText,
          preset: parsedTextPreset || undefined,
        })
        await waitForCanvasFrontmatterSurfaceTransition()
      }
      if (canReuseParsedSourceGraph) {
        const reusedGraph = withMarkdownDocumentSourceMetadata(exactSourceFile.parsedGraphData as GraphData, nextName, parsedTextPreset)
        if (!isMarkdownApplyRequestActiveDocumentCurrent(get, request)) return false
        await applyMarkdownDocumentCanvasPreset(reusedGraph)
        if (!isMarkdownApplyRequestActiveDocumentCurrent(get, request)) return false
        get().setGraphData(reusedGraph)
        const { applyFrontmatterFlowImportModes } = (await import('../../../features/parsers/frontmatterFlowImportMode')) as typeof import('../../../features/parsers/frontmatterFlowImportMode')
        applyFrontmatterFlowImportModes(reusedGraph, {
          applyViewPreset: request.applyViewPreset,
          resetWidgetLayout: request.applyViewPreset,
          preset: parsedTextPreset,
          rawText: nextText,
        })
        await applyMarkdownDocumentCanvasPreset(reusedGraph)
        resetFrontmatterFlowWidgetRuntimeState(get, reusedGraph)
        return !!(((reusedGraph.nodes || []).length > 0) || ((reusedGraph.edges || []).length > 0))
      }

      const { loadGraphDataFromTextViaParser } = (await import('../../../features/parsers/loader')) as typeof import('../../../features/parsers/loader')
      const res = await loadGraphDataFromTextViaParser(nextName, nextText, { applyToStore: false, syncMarkdownDocument: false })
      const parsedGraph = res?.graphData ? withMarkdownDocumentSourceMetadata(res.graphData, nextName, parsedTextPreset) : null
      if (!isMarkdownApplyRequestActiveDocumentCurrent(get, request)) return false
      await applyMarkdownDocumentCanvasPreset(parsedGraph)
      if (parsedGraph) {
        if (!isMarkdownApplyRequestActiveDocumentCurrent(get, request)) return false
        get().setGraphData(parsedGraph)
        const { applyFrontmatterFlowImportModes } = (await import('../../../features/parsers/frontmatterFlowImportMode')) as typeof import('../../../features/parsers/frontmatterFlowImportMode')
        applyFrontmatterFlowImportModes(parsedGraph, {
          applyViewPreset: request.applyViewPreset,
          resetWidgetLayout: request.applyViewPreset,
          preset: parsedTextPreset,
          rawText: nextText,
        })
        await applyMarkdownDocumentCanvasPreset(parsedGraph)
        resetFrontmatterFlowWidgetRuntimeState(get, parsedGraph)
      }
      return !!(parsedGraph && ((parsedGraph.nodes || []).length > 0 || (parsedGraph.edges || []).length > 0))
    }

    const request: PendingMarkdownApplyRequest = {
      name: String(name || ''),
      text: String(text || ''),
      force: opts?.force === true,
      applyViewPreset: opts?.applyViewPreset !== false,
      preset: opts?.preset === undefined ? parseCanvasWorkspaceFrontmatterPreset(String(text || '')) : opts.preset,
      requireActiveMarkdownDocument: opts?.requireActiveMarkdownDocument === true,
    }
    const requestKey = buildMarkdownApplyRequestSemanticKey(request)
    if (isCompletedMarkdownApplyRequestCurrent(get, request, requestKey)) return true
    if (markdownApplyRequestQueue.inFlight) {
      if (isMarkdownApplyRequestInFlight(requestKey)) return markdownApplyRequestQueue.waitFor(requestKey)
      return markdownApplyRequestQueue.enqueueLatest(request, requestKey)
    }
    markdownApplyRequestQueue.start(requestKey)
    try {
      let currentRequest: PendingMarkdownApplyRequest | null = request
      let currentRequestKey = requestKey
      let initialResult = false
      while (currentRequest) {
        let result = false
        if (isCompletedMarkdownApplyRequestCurrent(get, currentRequest, currentRequestKey)) {
          result = true
        } else {
          result = await runApply(currentRequest)
          if (result) {
            const state = get()
            lastCompletedMarkdownApplyKey = currentRequestKey
            lastCompletedMarkdownApplyGraph = state.graphData as GraphData | null
            lastCompletedMarkdownApplyGraphRevision = state.graphDataRevision
            lastCompletedMarkdownApplyGraphContentRevision = state.graphContentRevision
          }
        }
        if (currentRequestKey === requestKey) initialResult = result
        markdownApplyRequestQueue.settle(currentRequestKey, result)
        const nextRequest = markdownApplyRequestQueue.takeQueued()
        currentRequest = nextRequest?.request || null
        currentRequestKey = nextRequest?.key || ''
      }
      return initialResult
    } finally {
      markdownApplyRequestQueue.finish()
    }
  },

  })
}
