import React from 'react'
import { useGraphStore } from '@/hooks/useGraphStore'
import { useShallow } from 'zustand/react/shallow'
import type { GraphData } from '@/lib/graph/types'
import type { GraphState } from '@/hooks/useGraphStore'
import { keywordGraphCache, KEYWORD_GRAPH_ALGO_VERSION } from '@/lib/semantic-mode/keywordGraphCache'
import { hashText } from '@/features/parsers/hash'
import { buildGraphMetaKey } from '@/lib/graph/graphMetaKey'
import { buildScopedGraphSemanticKey } from '@/lib/graph/semanticKey'
import { hashSignatureParts } from '@/lib/hash/signature'
import { LRUCache } from '@/lib/cache/LRUCache'
import { pipelinePerfEnd, pipelinePerfStart } from '@/lib/pipelinePerf'
import { deriveKeywordGraphInWorker, deriveKeywordGraphPreviewInWorker } from '@/features/semantic-mode/keywordGraphWorker'
import { useDebouncedValue } from '@/features/hooks/useDebouncedValue'
import { useApiGraphFlowchartGraphData } from '@/lib/flowchart'
import type { Canvas2dRendererId } from '@/lib/config'
import { isFrontmatterOnlyPolicyActive } from '@/lib/config.render'
import { isFrontmatterFlowGraph } from '@/lib/graph/frontmatterMode'
import { isWorkspaceDocumentCanvasGraphApplyDisabled } from '@/lib/markdown/workspaceDocumentCanvasApplyPolicy'
import {
  buildKeywordSourceTextFromBaselineGraph,
  collectKeywordSourceMarkdownAnnotationsFromBaselineGraph,
  markdownToPlainText,
  mergeKeywordSourceMarkdownAnnotations,
  stripFrontmatter,
} from './keywordSourceText'
import { mergeKeywordGraphWithSourceNodes } from './keywordGraphMerge'
import { extractMarkdownAnnotationsFromText, type MarkdownAnnotation } from '@/lib/markdown/markdownSigil'
import {
  parseWorkspaceFrontmatterFlowGraphDataCached,
  parseWorkspaceFrontmatterMermaidGraphDataCached,
  parseWorkspaceKgcSemanticGraphDataCached,
  parseWorkspaceStrybldrStoryboardGraphDataCached,
  parseWorkspaceJsonGraphDataCached,
  WORKSPACE_STRUCTURED_PARSE_DEBOUNCE_MS,
} from './workspaceStructuredGraph'
import { INACTIVE_GRAPH_SLICE } from './activeGraphDataDefaults'
import { readKeywordGraphNodeBudget, readKeywordSourceNodeBudget } from './keywordGraphBudget'

const keywordSourceTextCache = new LRUCache<string, {
  text: string
  hash: string
  annotations: MarkdownAnnotation[]
  annotationHash: string
}>(24)
const keywordPreviewGraphCache = new LRUCache<string, GraphData>(8)

const hashKeywordAnnotations = (annotations: MarkdownAnnotation[]): string => {
  if (!Array.isArray(annotations) || annotations.length === 0) return ''
  return hashSignatureParts([
    'keyword-annotations',
    ...annotations.map(annotation => [
      String(annotation.text || '').replace(/\s+/g, ' ').trim().toLowerCase(),
      annotation.color || '',
      annotation.background || '',
      annotation.highlighted === true ? '1' : '0',
    ].join('|')),
  ])
}

function buildPendingActiveMarkdownGraph(args: {
  markdownName: string | null
}): GraphData | null {
  const name = String(args.markdownName || '').trim()
  if (!name) return null
  return {
    type: 'Graph',
    context: 'markdown',
    metadata: {
      kind: 'markdown',
      source: `markdown:${name}`,
      'pending': true,
    },
    nodes: [],
    edges: [],
  } as GraphData
}

export function resolveActiveMarkdownBaseGraph(args: {
  baseGraphDataRaw: GraphData | null
  markdownName: string | null
  markdownText: string | null
}): GraphData | null {
  const base = args.baseGraphDataRaw
  if (!base) return null
  const markdownName = String(args.markdownName || '').trim()
  const markdownText = String(args.markdownText || '')
  if (!markdownName || !markdownText.trim()) return base
  if (isWorkspaceDocumentCanvasGraphApplyDisabled(markdownText)) return base
  const metadata = base.metadata && typeof base.metadata === 'object' && !Array.isArray(base.metadata)
    ? (base.metadata as Record<string, unknown>)
    : null
  const source = typeof metadata?.source === 'string' ? metadata.source.trim() : ''
  if (source === `markdown:${markdownName}`) return base
  return buildPendingActiveMarkdownGraph({ markdownName })
}

export function useActiveGraphData(enabled: boolean = true): GraphData | null {
  const selector = React.useMemo(
    () =>
      enabled
        ? (s: GraphState) => ({
            baseGraphDataRaw: s.graphData as GraphData | null,
            mode: (s.documentSemanticMode || 'document') as 'document' | 'keyword',
            markdownName: s.markdownDocumentName || null,
            markdownText: s.markdownDocumentText || null,
            canvasRenderMode: (s.canvasRenderMode || '2d') as '2d' | '3d',
            canvas2dRenderer: (s.canvas2dRenderer || 'd3') as Canvas2dRendererId,
            keywordSourceMaxLines: s.keywordSourceMaxLines,
            keywordSourceMaxChars: s.keywordSourceMaxChars,
            keywordGraphPreviewDebounceMs: s.keywordGraphPreviewDebounceMs,
            keywordGraphFullDebounceMs: s.keywordGraphFullDebounceMs,
            keywordGraphEdgesPerNode: s.keywordGraphEdgesPerNode,
            keywordGraphMaxEdgesCap: s.keywordGraphMaxEdgesCap,
            keywordGraphMentionEdgesPerSourceNode: s.keywordGraphMentionEdgesPerSourceNode,
            revision: s.graphDataRevision || 0,
          })
        : () => INACTIVE_GRAPH_SLICE,
    [enabled],
  )

  const {
    baseGraphDataRaw,
    mode,
    markdownName,
    markdownText,
    canvasRenderMode,
    canvas2dRenderer,
    keywordSourceMaxLines,
    keywordSourceMaxChars,
    keywordGraphPreviewDebounceMs,
    keywordGraphFullDebounceMs,
    keywordGraphEdgesPerNode,
    keywordGraphMaxEdgesCap,
    keywordGraphMentionEdgesPerSourceNode,
    revision,
  } = useGraphStore(useShallow(selector))
  const frontmatterOnlyPolicyActive = React.useMemo(() => {
    return isFrontmatterOnlyPolicyActive({ canvasRenderMode, canvas2dRenderer })
  }, [canvas2dRenderer, canvasRenderMode])
  const effectiveMode: 'document' | 'keyword' = frontmatterOnlyPolicyActive ? 'document' : mode
  const workspaceDocumentCanvasGraphApplyDisabled = isWorkspaceDocumentCanvasGraphApplyDisabled(markdownText || '')

  const wantsApiGraphFlowchart = false
  const debouncedStructuredMarkdownText = useDebouncedValue(
    markdownText,
    WORKSPACE_STRUCTURED_PARSE_DEBOUNCE_MS,
    markdownName,
  )
  const workspaceJsonGraphData = React.useMemo(
    () =>
      enabled && !wantsApiGraphFlowchart
        ? parseWorkspaceJsonGraphDataCached({ markdownName, markdownText: debouncedStructuredMarkdownText })
        : null,
    [debouncedStructuredMarkdownText, enabled, markdownName, wantsApiGraphFlowchart],
  )
  const workspaceFrontmatterMermaidGraphData = React.useMemo(() => {
    if (!enabled || wantsApiGraphFlowchart) return null
    return parseWorkspaceFrontmatterMermaidGraphDataCached({
      markdownName,
      markdownText: debouncedStructuredMarkdownText,
    })
  }, [debouncedStructuredMarkdownText, enabled, markdownName, wantsApiGraphFlowchart])
  const workspaceFrontmatterFlowGraphData = React.useMemo(() => {
    if (!enabled || wantsApiGraphFlowchart) return null
    return parseWorkspaceFrontmatterFlowGraphDataCached({
      markdownName,
      markdownText: debouncedStructuredMarkdownText,
    })
  }, [debouncedStructuredMarkdownText, enabled, markdownName, wantsApiGraphFlowchart])
  const workspaceKgcSemanticGraphData = React.useMemo(() => {
    if (!enabled || wantsApiGraphFlowchart) return null
    return parseWorkspaceKgcSemanticGraphDataCached({
      markdownName,
      markdownText: debouncedStructuredMarkdownText,
    })
  }, [debouncedStructuredMarkdownText, enabled, markdownName, wantsApiGraphFlowchart])
  const workspaceStrybldrStoryboardGraphData = React.useMemo(() => {
    if (!enabled || wantsApiGraphFlowchart) return null
    return parseWorkspaceStrybldrStoryboardGraphDataCached({
      markdownName,
      markdownText: debouncedStructuredMarkdownText,
    })
  }, [debouncedStructuredMarkdownText, enabled, markdownName, wantsApiGraphFlowchart])
  const activeMarkdownBaseGraph = React.useMemo(
    () =>
      resolveActiveMarkdownBaseGraph({
        baseGraphDataRaw,
        markdownName,
        markdownText,
      }),
    [baseGraphDataRaw, markdownName, markdownText],
  )
  const baseGraphData = React.useMemo(() => {
    if (workspaceDocumentCanvasGraphApplyDisabled) return activeMarkdownBaseGraph
    if (canvas2dRenderer === 'storyboard') {
      return workspaceStrybldrStoryboardGraphData || workspaceFrontmatterFlowGraphData || workspaceJsonGraphData || workspaceKgcSemanticGraphData || workspaceFrontmatterMermaidGraphData || activeMarkdownBaseGraph
    }
    if (!frontmatterOnlyPolicyActive) {
      return workspaceJsonGraphData || workspaceStrybldrStoryboardGraphData || workspaceFrontmatterFlowGraphData || workspaceKgcSemanticGraphData || workspaceFrontmatterMermaidGraphData || activeMarkdownBaseGraph
    }
    if (workspaceStrybldrStoryboardGraphData) return workspaceStrybldrStoryboardGraphData
    if (workspaceFrontmatterFlowGraphData) return workspaceFrontmatterFlowGraphData
    if (isFrontmatterFlowGraph(activeMarkdownBaseGraph)) return activeMarkdownBaseGraph
    return buildPendingActiveMarkdownGraph({ markdownName })
  }, [
    activeMarkdownBaseGraph,
    canvas2dRenderer,
    frontmatterOnlyPolicyActive,
    markdownName,
    workspaceStrybldrStoryboardGraphData,
    workspaceFrontmatterFlowGraphData,
    workspaceFrontmatterMermaidGraphData,
    workspaceJsonGraphData,
    workspaceKgcSemanticGraphData,
    workspaceDocumentCanvasGraphApplyDisabled,
  ])
  const hasStructuredWorkspaceGraph = !workspaceDocumentCanvasGraphApplyDisabled && (frontmatterOnlyPolicyActive
    ? !!workspaceStrybldrStoryboardGraphData || !!workspaceFrontmatterFlowGraphData
    : !!workspaceJsonGraphData || !!workspaceStrybldrStoryboardGraphData || !!workspaceFrontmatterFlowGraphData || !!workspaceKgcSemanticGraphData || !!workspaceFrontmatterMermaidGraphData)
  const { graphData: apiGraphFlowchart } = useApiGraphFlowchartGraphData(wantsApiGraphFlowchart)

  const lastRef = React.useRef<GraphData | null>(null)

  React.useEffect(() => {
    if (!enabled) return
    if (!wantsApiGraphFlowchart) return
    if (!apiGraphFlowchart) return
    lastRef.current = apiGraphFlowchart
  }, [apiGraphFlowchart, enabled, wantsApiGraphFlowchart])

  const lastKeywordRef = React.useRef<{ cacheKey: string; docId: string; graph: GraphData } | null>(null)
  const [asyncBump, setAsyncBump] = React.useState(0)
  const pendingKeyRef = React.useRef<string | null>(null)
  const pendingPreviewKeyRef = React.useRef<string | null>(null)

  const keywordDeriveInputs = React.useMemo(() => {
    if (wantsApiGraphFlowchart) return null
    if (workspaceDocumentCanvasGraphApplyDisabled) return null
    if (hasStructuredWorkspaceGraph) return null
    if (!baseGraphData) return null
    if (effectiveMode !== 'keyword') return null

    const meta = baseGraphData.metadata && typeof baseGraphData.metadata === 'object' && !Array.isArray(baseGraphData.metadata)
      ? (baseGraphData.metadata as Record<string, unknown>)
      : null
    const baseMetaKey = buildGraphMetaKey(baseGraphData)
    const baseLayerHash = typeof meta?.sourceLayerHash === 'string' ? meta.sourceLayerHash.trim() : ''
    const sourceLayerOrderHash = typeof meta?.sourceLayerOrderHash === 'string' ? meta.sourceLayerOrderHash.trim() : ''
    const graphSemanticKey = typeof meta?.graphSemanticKey === 'string' ? meta.graphSemanticKey.trim() : ''
    const sourceLayerComposition = typeof meta?.sourceLayerComposition === 'string' ? String(meta.sourceLayerComposition) : ''
    const isComposed = sourceLayerComposition === 'compose' || Array.isArray(meta?.sourceLayers)
    const preferredMarkdownText = typeof markdownText === 'string' && markdownText.trim() ? markdownText : ''
    const prefersMarkdown = !isComposed && preferredMarkdownText.length > 0
    const maxKeywordNodes = readKeywordGraphNodeBudget({
      edgesPerNode: keywordGraphEdgesPerNode,
      maxEdgesCap: keywordGraphMaxEdgesCap,
    })
    const maxSourceNodes = readKeywordSourceNodeBudget({
      mentionEdgesPerSourceNode: keywordGraphMentionEdgesPerSourceNode,
      maxEdgesCap: keywordGraphMaxEdgesCap,
    })
    const markdownBody = prefersMarkdown ? stripFrontmatter(preferredMarkdownText) : ''
    const markdownHash = prefersMarkdown ? hashText(markdownBody) : ''
    const graphSourceKey = buildScopedGraphSemanticKey('keyword-source-text', {
      graphData: baseGraphData,
      graphRevision: revision,
      graphSemanticKey,
      sourceLayerHash: baseLayerHash,
      sourceLayerOrderHash,
    })
    const cacheKeyForText = hashSignatureParts([
      'keyword-source-text',
      graphSourceKey || baseLayerHash || baseMetaKey || `rev:${String(revision)}`,
      prefersMarkdown ? `md:${markdownHash}` : 'graph',
      `L${keywordSourceMaxLines}`,
      `C${keywordSourceMaxChars}`,
    ])
    const cachedText = keywordSourceTextCache.get(cacheKeyForText)

    const sourceEntry = cachedText || (() => {
      const baseline = buildKeywordSourceTextFromBaselineGraph(baseGraphData, { maxLines: keywordSourceMaxLines, maxChars: keywordSourceMaxChars })
      const baselineAnnotations = collectKeywordSourceMarkdownAnnotationsFromBaselineGraph(baseGraphData)
      const markdownAnnotations = prefersMarkdown ? extractMarkdownAnnotationsFromText(markdownBody, 512, keywordSourceMaxChars) : []
      const annotations = mergeKeywordSourceMarkdownAnnotations([markdownAnnotations, baselineAnnotations])
      const annotationHash = hashKeywordAnnotations(annotations)
      const text = (() => {
        if (!prefersMarkdown) return baseline
        const mdPlain = markdownToPlainText(markdownBody)
        const combined = [mdPlain, baseline].filter(Boolean).join('\n')
        if (combined.length <= keywordSourceMaxChars) return combined
        return combined.slice(0, keywordSourceMaxChars)
      })()
      const plainTextHash = hashText(text)
      const hash = hashSignatureParts(['keyword-source', plainTextHash, annotationHash])
      return { text, hash, annotations, annotationHash }
    })()
    if (!cachedText) keywordSourceTextCache.set(cacheKeyForText, sourceEntry)

    const sourceText = sourceEntry.text
    const sourceTextHash = sourceEntry.hash

    const docId = baseMetaKey
      ? `graph:${hashText(baseMetaKey)}`
      : markdownName && markdownName.trim()
        ? `md:${hashText(markdownName.trim())}`
        : `graph:${hashText(String(revision))}`

    const tuningKey = `e${keywordGraphEdgesPerNode}-m${keywordGraphMaxEdgesCap}-n${maxKeywordNodes}-me${keywordGraphMentionEdgesPerSourceNode}-sn${maxSourceNodes}-L${keywordSourceMaxLines}-C${keywordSourceMaxChars}-a${sourceEntry.annotationHash || '0'}`
    const cacheKey = `keyword:v${KEYWORD_GRAPH_ALGO_VERSION}:${docId}:${sourceTextHash}:${tuningKey}`
    return {
      cacheKey,
      docId,
      sourceText,
      sourceTextHash,
      markdownAnnotations: sourceEntry.annotations,
      tuning: {
        edgesPerNode: keywordGraphEdgesPerNode,
        maxEdgesCap: keywordGraphMaxEdgesCap,
        maxNodes: maxKeywordNodes,
        mentionEdgesPerSourceNode: keywordGraphMentionEdgesPerSourceNode,
        maxSourceNodes,
      },
    }
  }, [
    baseGraphData,
    hasStructuredWorkspaceGraph,
    keywordGraphEdgesPerNode,
    keywordGraphMaxEdgesCap,
    keywordGraphMentionEdgesPerSourceNode,
    keywordSourceMaxChars,
    keywordSourceMaxLines,
    markdownName,
    markdownText,
    effectiveMode,
    revision,
    wantsApiGraphFlowchart,
    workspaceDocumentCanvasGraphApplyDisabled,
  ])

  const debouncedKeywordPreviewInputs = useDebouncedValue(
    keywordDeriveInputs,
    Math.max(0, Number(keywordGraphPreviewDebounceMs) || 0),
  )
  const debouncedKeywordFullInputs = useDebouncedValue(
    keywordDeriveInputs,
    Math.max(0, Number(keywordGraphFullDebounceMs) || 0),
  )

  const computed = React.useMemo(() => {
    void asyncBump
    if (!baseGraphData) return null
    if (hasStructuredWorkspaceGraph) return baseGraphData
    if (effectiveMode !== 'keyword') return baseGraphData

    const inputs = keywordDeriveInputs
    if (!inputs) return null

    const cached = keywordGraphCache.get(inputs.cacheKey)
    if (cached) return cached.graph
    const preview = keywordPreviewGraphCache.get(inputs.cacheKey)
    if (preview) return preview
    if (lastKeywordRef.current) {
      if (lastKeywordRef.current.cacheKey === inputs.cacheKey) return lastKeywordRef.current.graph
      const prefix = `keyword:v${KEYWORD_GRAPH_ALGO_VERSION}:`
      if (lastKeywordRef.current.docId === inputs.docId && lastKeywordRef.current.cacheKey.startsWith(prefix)) {
        return lastKeywordRef.current.graph
      }
    }
    return baseGraphData
  }, [asyncBump, baseGraphData, hasStructuredWorkspaceGraph, keywordDeriveInputs, effectiveMode])

  const baseGraphDataRef = React.useRef<GraphData | null>(null)
  React.useEffect(() => {
    baseGraphDataRef.current = baseGraphData
  }, [baseGraphData])

  const keywordErrorToastKeyRef = React.useRef<Set<string>>(new Set())
  const readKeywordWorkerLastError = (): string => {
    try {
      const raw = (globalThis as unknown as { __kgKeywordWorkerLastError?: unknown }).__kgKeywordWorkerLastError
      return typeof raw === 'string' ? raw.trim() : ''
    } catch {
      return ''
    }
  }

  React.useEffect(() => {
    if (!enabled) return
    if (!baseGraphData) return
    if (effectiveMode !== 'keyword') return
    const inputs = debouncedKeywordPreviewInputs
    if (!inputs) return

    if (keywordGraphCache.get(inputs.cacheKey)) return
    if (keywordPreviewGraphCache.get(inputs.cacheKey)) return
    if (pendingPreviewKeyRef.current === inputs.cacheKey) return
    pendingPreviewKeyRef.current = inputs.cacheKey

    let canceled = false
    const controller = new AbortController()
    const t0 = pipelinePerfStart()

    void (async () => {
      try {
        if (canceled) return
        const snippet = inputs.sourceText.length > 16_000 ? inputs.sourceText.slice(0, 16_000) : inputs.sourceText
        if (!snippet.trim()) return

        const g = await deriveKeywordGraphPreviewInWorker({
          documentId: inputs.docId,
          documentText: snippet,
          sourceLabel: markdownName || undefined,
          sourceTextHash: inputs.sourceTextHash,
          markdownAnnotations: inputs.markdownAnnotations,
          tuning: {
            edgesPerNode: inputs.tuning.edgesPerNode,
            maxEdgesCap: inputs.tuning.maxEdgesCap,
            maxNodes: inputs.tuning.maxNodes,
          },
          timeoutMs: 20_000,
          signal: controller.signal,
        })
        if (!g) return
        const base = baseGraphDataRef.current
        if (!base) return
        const merged = mergeKeywordGraphWithSourceNodes({
          baseGraphData: base,
          keywordGraph: g,
          sourceId: inputs.docId,
          tuning: {
            mentionEdgesPerSourceNode: inputs.tuning.mentionEdgesPerSourceNode,
            maxSourceNodes: inputs.tuning.maxSourceNodes,
          },
        })
        keywordPreviewGraphCache.set(inputs.cacheKey, merged)
        pipelinePerfEnd({ name: 'derive', stage: 'keyword:preview', t0, detail: { cacheKey: inputs.cacheKey } })
        setAsyncBump(v => v + 1)
      } catch {
        void 0
      } finally {
        if (pendingPreviewKeyRef.current === inputs.cacheKey) pendingPreviewKeyRef.current = null
        if (!keywordPreviewGraphCache.get(inputs.cacheKey)) {
          const shouldSkip = controller.signal.aborted || canceled
          if (!shouldSkip) {
            const err = readKeywordWorkerLastError()
            if (err && !keywordErrorToastKeyRef.current.has(`preview:${inputs.cacheKey}`)) {
              keywordErrorToastKeyRef.current.add(`preview:${inputs.cacheKey}`)
              try {
                useGraphStore.getState().upsertUiToast({
                  id: `kw-preview-failed:${hashText(inputs.cacheKey)}`,
                  kind: 'warning',
                  message: `Keyword preview failed: ${err}`,
                  ttlMs: 6000,
                })
              } catch {
                void 0
              }
            }
          }
        }
      }
    })()

    return () => {
      canceled = true
      try {
        controller.abort()
      } catch {
        void 0
      }
      if (pendingPreviewKeyRef.current === inputs.cacheKey) pendingPreviewKeyRef.current = null
    }
  }, [baseGraphData, debouncedKeywordPreviewInputs, enabled, markdownName, effectiveMode])

  React.useEffect(() => {
    if (!enabled) return
    if (!baseGraphData) return
    if (effectiveMode !== 'keyword') return
    const inputs = debouncedKeywordFullInputs
    if (!inputs) return

    if (keywordGraphCache.get(inputs.cacheKey)) return
    if (pendingKeyRef.current === inputs.cacheKey) return
    pendingKeyRef.current = inputs.cacheKey

    const tAll = pipelinePerfStart()
    const tDerive = pipelinePerfStart()
    let canceled = false
    const controller = new AbortController()

    void (async () => {
      try {
        const derivedGraph = await deriveKeywordGraphInWorker({
          documentId: inputs.docId,
          documentText: inputs.sourceText,
          sourceLabel: markdownName || undefined,
          sourceTextHash: inputs.sourceTextHash,
          markdownAnnotations: inputs.markdownAnnotations,
          tuning: {
            edgesPerNode: inputs.tuning.edgesPerNode,
            maxEdgesCap: inputs.tuning.maxEdgesCap,
            maxNodes: inputs.tuning.maxNodes,
          },
          timeoutMs: 90_000,
          signal: controller.signal,
        })
        if (canceled) return
        if (!derivedGraph) return

        const base = baseGraphDataRef.current
        if (!base) return
        const graph = mergeKeywordGraphWithSourceNodes({
          baseGraphData: base,
          keywordGraph: derivedGraph,
          sourceId: inputs.docId,
          tuning: {
            mentionEdgesPerSourceNode: inputs.tuning.mentionEdgesPerSourceNode,
            maxSourceNodes: inputs.tuning.maxSourceNodes,
          },
        })
        keywordGraphCache.set(inputs.cacheKey, { graph, nodeCountsById: new Map() })
        pipelinePerfEnd({
          name: 'derive',
          stage: 'keyword:graph',
          t0: tDerive,
          detail: {
            cacheKey: inputs.cacheKey,
            nodes: Array.isArray(graph.nodes) ? graph.nodes.length : 0,
            edges: Array.isArray(graph.edges) ? graph.edges.length : 0,
          },
        })
        pipelinePerfEnd({ name: 'derive', stage: 'keyword:all', t0: tAll, detail: { cacheKey: inputs.cacheKey } })
        setAsyncBump(v => v + 1)
      } catch {
        void 0
      } finally {
        if (pendingKeyRef.current === inputs.cacheKey) pendingKeyRef.current = null
        if (!keywordGraphCache.get(inputs.cacheKey)) {
          const shouldSkip = controller.signal.aborted || canceled
          if (!shouldSkip) {
            const err = readKeywordWorkerLastError()
            if (err && !keywordErrorToastKeyRef.current.has(`full:${inputs.cacheKey}`)) {
              keywordErrorToastKeyRef.current.add(`full:${inputs.cacheKey}`)
              try {
                useGraphStore.getState().upsertUiToast({
                  id: `kw-derive-failed:${hashText(inputs.cacheKey)}`,
                  kind: 'warning',
                  message: `Keyword graph failed: ${err}`,
                  ttlMs: 8000,
                })
              } catch {
                void 0
              }
            }
          }
        }
      }
    })()

    return () => {
      canceled = true
      try {
        controller.abort()
      } catch {
        void 0
      }
    }
  }, [baseGraphData, debouncedKeywordFullInputs, enabled, markdownName, effectiveMode])

  React.useEffect(() => {
    if (!enabled) return
    const next = wantsApiGraphFlowchart ? apiGraphFlowchart : computed
    lastRef.current = next
    if (wantsApiGraphFlowchart) return
    if (effectiveMode === 'keyword' && keywordDeriveInputs) {
      const cached = keywordGraphCache.get(keywordDeriveInputs.cacheKey)
      if (cached && cached.graph) {
        lastKeywordRef.current = { cacheKey: keywordDeriveInputs.cacheKey, docId: keywordDeriveInputs.docId, graph: cached.graph }
      }
    }
  }, [apiGraphFlowchart, computed, enabled, keywordDeriveInputs, effectiveMode, wantsApiGraphFlowchart])

  const out = wantsApiGraphFlowchart ? apiGraphFlowchart : computed
  return enabled ? out : lastRef.current
}
