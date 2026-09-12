import React from 'react'
import { useGraphStore } from '@/hooks/useGraphStore'
import { useShallow } from 'zustand/react/shallow'
import type { GraphData } from '@/lib/graph/types'
import type { GraphState } from '@/hooks/useGraphStore'
import { computeEffectiveFrontmatterMode } from '@/lib/graph/frontmatterMode'
import { buildGraphMetaKey } from '@/lib/graph/graphMetaKey'
import type { Canvas2dRendererId } from '@/lib/config'
import { isFrontmatterOnlyPolicyActive } from '@/lib/config.render'
import { applyCanvasRenderBudget, resolveCanvasRenderBudgetSurface } from '@/lib/graph/canvasRenderBudget'
import { withGraphTopologyMetadata } from '@/lib/graph/graphTopology'
import { applyMarkdownSigilHighlightsToGraphData } from '@/lib/graph/markdownSigilGraphHighlights'
import { useActiveGraphData } from './useActiveGraphData.impl'
import { deriveFlowchartFrontmatterActiveViewGraph, deriveGraphDataForActiveView } from './activeViewGraph'

let mermaidFrontmatterGeometryModulePromise: Promise<typeof import('@/lib/mermaid/mermaidFrontmatterGeometry')> | null = null

const loadMermaidFrontmatterGeometryModule = async () => {
  if (!mermaidFrontmatterGeometryModulePromise) {
    mermaidFrontmatterGeometryModulePromise = import('@/lib/mermaid/mermaidFrontmatterGeometry')
  }
  return mermaidFrontmatterGeometryModulePromise
}

const INACTIVE_RENDER_SLICE = {
  frontmatterModeEnabled: false,
  multiDimTableModeEnabled: false,
  documentSemanticMode: 'document',
  documentStructureBaselineLock: false,
  markdownName: null as string | null,
  markdownText: null as string | null,
  jsonSourceText: null as string | null,
  collapsedGroupIds: [] as string[],
  canvasRenderMode: '2d' as '2d' | '3d',
  canvas2dRenderer: 'd3' as Canvas2dRendererId,
  graphDataRevision: 0,
} as const

const EMPTY_STRING_ARRAY: string[] = []

export function useActiveGraphRenderData(enabled: boolean = true): GraphData | null {
  const activeDocumentGraph = useActiveGraphData(enabled)
  const sourceGraph = useGraphStore(s => s.graphData)
  const sourceIsReadOnly = (sourceGraph?.metadata?.agentGraphProjection as Record<string, unknown>)?.readOnly === true
  const graphData = sourceIsReadOnly ? sourceGraph : activeDocumentGraph
  const proposalOverlay = useGraphStore(s => s.launchProposalOverlay)
  const proposalPath = useGraphStore(s => s.sourceFiles.find(file => file.name === 'launch-copilot.json')?.source?.path)
  React.useEffect(() => {
    if (!enabled || proposalOverlay || !proposalPath || !graphData?.metadata?.agentGraphProjection) return
    const cid = proposalPath.split('/').at(-2)
    if (cid) void import('@/features/agent-graph/launchCopilotWorkspace').then(module => module.reopenLaunchWorkspace(cid)).catch(error => {
      useGraphStore.getState().pushUiLog({ kind: 'error', message: String(error), source: 'launch-copilot' })
    })
  }, [enabled, graphData, proposalOverlay, proposalPath])

  const selector = React.useMemo(
    () =>
      enabled
        ? (s: GraphState) => ({
            frontmatterModeEnabled: s.frontmatterModeEnabled === true,
            multiDimTableModeEnabled: s.multiDimTableModeEnabled === true,
            documentSemanticMode: String(s.documentSemanticMode || 'document'),
            documentStructureBaselineLock: s.documentStructureBaselineLock === true,
            markdownName: s.markdownDocumentName || null,
            markdownText: s.markdownDocumentText || null,
            jsonSourceText: s.jsonSourceDocumentText || null,
            collapsedGroupIds: (s.collapsedGroupIds ?? EMPTY_STRING_ARRAY) as string[],
            canvasRenderMode: (s.canvasRenderMode || '2d') as '2d' | '3d',
            canvas2dRenderer: (s.canvas2dRenderer || 'd3') as Canvas2dRendererId,
            graphDataRevision: typeof s.graphDataRevision === 'number' ? s.graphDataRevision : 0,
          })
        : () => INACTIVE_RENDER_SLICE,
    [enabled],
  )

  const {
    frontmatterModeEnabled,
    multiDimTableModeEnabled,
    documentSemanticMode,
    documentStructureBaselineLock,
    markdownName,
    markdownText,
    jsonSourceText,
    collapsedGroupIds,
    canvasRenderMode,
    canvas2dRenderer,
    graphDataRevision,
  } = useGraphStore(useShallow(selector))
  const frontmatterOnlyPolicyActive = React.useMemo(
    () => isFrontmatterOnlyPolicyActive({ canvasRenderMode, canvas2dRenderer }),
    [canvasRenderMode, canvas2dRenderer],
  )
  const effectiveDocumentSemanticMode = frontmatterOnlyPolicyActive ? 'document' : documentSemanticMode
  const effectiveFrontmatterModeEnabled = frontmatterOnlyPolicyActive ? true : frontmatterModeEnabled
  const effectiveMultiDimTableModeEnabled = frontmatterOnlyPolicyActive ? false : multiDimTableModeEnabled

  const applyMermaidGeometryAttemptKeyRef = React.useRef<string>('')
  const applyMermaidGeometryInFlightRef = React.useRef(false)
  React.useEffect(() => {
    if (!enabled || sourceIsReadOnly) return
    if (!effectiveFrontmatterModeEnabled) return
    if (String(effectiveDocumentSemanticMode || 'document') !== 'document') return
    const base = graphData
    if (!base) return
    if (String((base as unknown as { context?: unknown }).context || '') === 'frontmatter-mermaid') return
    const meta =
      base.metadata && typeof base.metadata === 'object' && !Array.isArray(base.metadata)
        ? (base.metadata as Record<string, unknown>)
        : null
    if (meta && String(meta.layoutEngine || '') === 'mermaid') return
    if (!computeEffectiveFrontmatterMode({ frontmatterModeEnabled: true, documentSemanticMode: effectiveDocumentSemanticMode, graphData: base })) return
    if (typeof window === 'undefined' || typeof document === 'undefined') return

    const attemptKey = `mermaidGeom:${buildGraphMetaKey(base)}:${base.nodes?.length || 0}:${base.edges?.length || 0}`
    if (applyMermaidGeometryAttemptKeyRef.current === attemptKey) return
    applyMermaidGeometryAttemptKeyRef.current = attemptKey
    if (applyMermaidGeometryInFlightRef.current) return
    applyMermaidGeometryInFlightRef.current = true

    let cancelled = false
    ;(async () => {
      try {
        const { applyMermaidFrontmatterGeometryToGraphData } = await loadMermaidFrontmatterGeometryModule()
        if (cancelled) return
        const updated = await applyMermaidFrontmatterGeometryToGraphData(base)
        if (cancelled) return
        if (!updated || updated === base) return
        if (String((updated as unknown as { context?: unknown }).context || '') !== 'frontmatter-mermaid') return
        useGraphStore.getState().setGraphDataPreservingLayout(updated)
      } catch {
        void 0
      } finally {
        applyMermaidGeometryInFlightRef.current = false
      }
    })()

    return () => {
      cancelled = true
    }
  }, [effectiveDocumentSemanticMode, effectiveFrontmatterModeEnabled, enabled, graphData, sourceIsReadOnly])

  const lastRef = React.useRef<GraphData | null>(null)

  const computed = React.useMemo(() => {
    if (sourceIsReadOnly) return graphData
    const sourceTableBaseGraph: GraphData | null =
      !graphData && effectiveMultiDimTableModeEnabled && (String(jsonSourceText || '').trim() || String(markdownText || '').trim())
        ? {
          type: 'Graph',
          context: 'workspace-active-source',
          nodes: [],
          edges: [],
          metadata: {
            source: `markdown:${String(markdownName || 'active')}`,
            pending: true,
          },
        }
        : null
    const activeGraphData = graphData || sourceTableBaseGraph
    if (!activeGraphData) return null
    const flowchartMode = canvasRenderMode === '2d' && canvas2dRenderer === 'flowchart'
    if (flowchartMode) {
      return deriveFlowchartFrontmatterActiveViewGraph({
        graphData: activeGraphData,
        markdownText,
      })
    }
    return deriveGraphDataForActiveView({
      graphData: activeGraphData,
      frontmatterModeEnabled: effectiveFrontmatterModeEnabled,
      multiDimTableModeEnabled: effectiveMultiDimTableModeEnabled,
      documentSemanticMode: effectiveDocumentSemanticMode,
      documentStructureBaselineLock,
      collapsedGroupIds,
      markdownName,
      markdownText,
      jsonSourceText,
    })
  }, [
    canvas2dRenderer,
    canvasRenderMode,
    collapsedGroupIds,
    effectiveDocumentSemanticMode,
    effectiveFrontmatterModeEnabled,
    effectiveMultiDimTableModeEnabled,
    graphData,
    jsonSourceText,
    markdownName,
    markdownText,
    documentStructureBaselineLock,
    sourceIsReadOnly,
  ])

  const budgetSurface = React.useMemo(
    () => resolveCanvasRenderBudgetSurface({ canvasRenderMode, canvas2dRenderer }),
    [canvas2dRenderer, canvasRenderMode],
  )
  const topologyComputed = React.useMemo(() => {
    return withGraphTopologyMetadata({
      graphData: computed,
      graphRevision: graphDataRevision,
      stage: 'active-view',
      annotate: true,
    })
  }, [computed, graphDataRevision])

  const budgetedComputed = React.useMemo(() => {
    return applyCanvasRenderBudget({
      graphData: topologyComputed,
      graphRevision: graphDataRevision,
      surface: budgetSurface,
      documentSemanticMode: effectiveDocumentSemanticMode,
    })
  }, [budgetSurface, effectiveDocumentSemanticMode, graphDataRevision, topologyComputed])

  const highlightedComputed = React.useMemo(() => {
    return applyMarkdownSigilHighlightsToGraphData({
      graphData: budgetedComputed,
      graphRevision: graphDataRevision,
    })
  }, [budgetedComputed, graphDataRevision])

  const renderComputed = React.useMemo(() => {
    const identity = graphData?.metadata?.agentGraphProjection as Record<string, unknown> | undefined
    const overlay = proposalOverlay?.metadata
    let combined = highlightedComputed
    if (combined && proposalOverlay && identity?.snapshotDigest && identity.snapshotDigest === overlay?.snapshotDigest && identity.graphId === overlay.graphId) {
      const evidence = overlay.evidenceProjection as unknown as GraphData | undefined
      const existingNodes = new Set(combined.nodes.map(node => node.id))
      const existingEdges = new Set(combined.edges.map(edge => edge.id))
      const evidenceNodes = new Set(evidence?.nodes.map(node => node.id)), evidenceEdges = new Set(evidence?.edges.map(edge => edge.id))
      const sourceEdges = [...combined.edges.filter(edge => evidenceEdges.has(edge.id)), ...(evidence?.edges || []).filter(edge => !existingEdges.has(edge.id))]
      combined = {
        ...combined,
        nodes: [...combined.nodes.filter(node => evidenceNodes.has(node.id)), ...(evidence?.nodes || []).filter(node => !existingNodes.has(node.id)), ...proposalOverlay.nodes],
        edges: [...sourceEdges.map(edge => ({ ...edge, properties: { ...edge.properties, 'visual:dash': 'none' } })), ...proposalOverlay.edges],
      }
    }
    return withGraphTopologyMetadata({
      graphData: combined,
      graphRevision: graphDataRevision,
      stage: 'render',
      annotate: true,
    })
  }, [graphDataRevision, highlightedComputed, graphData, proposalOverlay])

  React.useEffect(() => {
    if (!enabled) return
    lastRef.current = renderComputed
  }, [enabled, renderComputed])

  return enabled ? renderComputed : lastRef.current
}
