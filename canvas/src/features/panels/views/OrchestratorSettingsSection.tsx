import React from 'react'
import { isReadOnlyAgentGraphProjection } from '@/features/agent-graph/agentGraphProjectionPolicy'
const NativeGraphStatsSection = React.lazy(() => import('@/features/graph-inspector/ui/NativeGraphStatsSection'))
import { useGraphStore } from '@/hooks/useGraphStore'
import type { GraphSchema } from '@/lib/graph/schema'
import type {
  AgenticGraphRagPathValue,
  AgenticRagNodeView,
  GraphData,
  GraphNode,
  JSONValue,
} from '@/lib/graph/types'
import {
  agenticRagNodeFromGraphNode,
  getAgenticRagContextComparison,
} from '@/lib/graph/jsonld/index'
import {
  findGraphRagTraversalEdgeIds,
  findTraversalEdgeIds,
  isGraphRagPathValue,
  toParsedTraversePath,
} from '@/lib/graph/graphragTraversal'
import {
  ORCHESTRATOR_TRAVERSAL_DELAY_DEFAULT_MS,
  ORCHESTRATOR_TRAVERSAL_DELAY_MAX_MS,
  ORCHESTRATOR_TRAVERSAL_DELAY_MIN_MS,
  TRAVERSAL_MAX_DEPTH_DEFAULT,
  buildEdgeIdsForPath,
  buildGraphRagTraversalSummary,
  findGraphRagOwnerNode,
  persistTraversalSummaryToGraph,
  runEdgeTraversalSequenceGlobal,
  type GraphRagTraversalSummary,
} from '@/features/panels/utils/orchestratorTraversal'
import { lsInt, lsSetInt } from '@/lib/persistence'
import { IMPORT_EXPORT_STATUS_COPY, LS_KEYS } from '@/lib/config'
import { buildGraphRagWorkflowFromGraphData, type GraphRagWorkflowJsonLd } from '@/features/panels/utils/graphragConfig'
import { validateGraphRagWorkflowJsonLdObject } from '@/features/panels/utils/workflowJsonLd'
import type { GraphRagPathHelper } from '@/features/panels/views/OrchestratorTraversalPanelsModel'
import { buildOrchestratorTraversalSectionViewModel } from '@/features/panels/views/OrchestratorTraversalSectionModel'
import AgenticRagContextSection from '@/features/panels/views/AgenticRagContextSection'
import { OrchestratorTraversalSection } from '@/features/panels/views/OrchestratorTraversalStackSection'
import { useOrchestratorTraversalEditState } from '@/features/panels/hooks/useOrchestratorTraversalEditState'
import {
  AGENTIC_RAG_NODE_JSON_STATUS_NONE,
  AGENTIC_RAG_NODE_JSON_STATUS_COPIED,
  UI_COPY,
} from '@/lib/config'
import { getCachedGraphLookup } from '@/lib/graph/lookupCache'
import { buildScopedGraphSemanticKey } from '@/lib/graph/semanticKey'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'

type OrchestratorSettingsSectionProps = {
  graphRagCollapsed: boolean
  presetsCollapsed: boolean
  editorCollapsed: boolean
  contextCollapsed: boolean
  setGraphRagCollapsed: (next: boolean) => void
  setPresetsCollapsed: (next: boolean) => void
  setEditorCollapsed: (next: boolean) => void
  setContextCollapsed: (next: boolean) => void
  indexingCollapsed: boolean
  setIndexingCollapsed: (next: boolean) => void
  tracingCollapsed: boolean
  setTracingCollapsed: (next: boolean) => void
}

export default function OrchestratorSettingsSection(props: OrchestratorSettingsSectionProps) {
  const graph = useGraphStore(s => s.graphData)
  if (isReadOnlyAgentGraphProjection(graph)) return <React.Suspense fallback={<p>Loading source graph inspection…</p>}>
    <NativeGraphStatsSection />
  </React.Suspense>
  return <GraphRagSettingsSection {...props} />
}

function GraphRagSettingsSection({
  graphRagCollapsed,
  presetsCollapsed,
  editorCollapsed,
  contextCollapsed,
  setGraphRagCollapsed,
  setPresetsCollapsed,
  setEditorCollapsed,
  setContextCollapsed,
  indexingCollapsed,
  setIndexingCollapsed,
  tracingCollapsed,
  setTracingCollapsed,
}: OrchestratorSettingsSectionProps) {
  const schema = useGraphStore(s => s.schema) as GraphSchema
  const setSchema = useGraphStore(s => s.setSchema)
  const setThreeConfig = useGraphStore(s => s.setThreeConfig)
  const setCharge = useGraphStore(s => s.setCharge)
  const setCollisionByType = useGraphStore(s => s.setCollisionByType)
  const data = useGraphStore(s => s.graphData)
  const graphDataRevision = useGraphStore(s => s.graphDataRevision || 0)
  const setGraphData = useGraphStore(s => s.setGraphData)
  const graphId = useGraphStore(s => s.graphId)
  const graphRagWorkflowJsonText = useGraphStore(s => s.graphRagWorkflowJsonText)
  const setGraphRagWorkflowJsonText = useGraphStore(s => s.setGraphRagWorkflowJsonText)
  const setLastTraversalSummary = useGraphStore(s => s.setLastTraversalSummary)
  const selectedNodeId = useGraphStore(s => s.selectedNodeId)
  const selectNode = useGraphStore(s => s.selectNode)
  const selectEdge = useGraphStore(s => s.selectEdge)
  const requestAiKgTraversal = useGraphStore(s => s.requestAiKgTraversal)
  const setRequestAiKgTraversal = useGraphStore(s => s.setRequestAiKgTraversal)
  const uiPanelKeyValueTextSizeClass = useGraphStore(
    s => s.uiPanelKeyValueTextSizeClass || 'text-sm',
  )
  const uiPanelTextFontClass = useGraphStore(
    s => s.uiPanelTextFontClass || 'font-sans',
  )
  const [traversalDelayMs, setTraversalDelayMs] = React.useState(() =>
    lsInt(LS_KEYS.orchestratorTraversalDelayMs, ORCHESTRATOR_TRAVERSAL_DELAY_DEFAULT_MS),
  )
  const [traversalStartNodeId, setTraversalStartNodeId] = React.useState('')
  const [traversalMaxDepth, setTraversalMaxDepth] = React.useState(TRAVERSAL_MAX_DEPTH_DEFAULT)
  const [traversalLabelFilter, setTraversalLabelFilter] = React.useState('')
  const [agenticCopyStatus, setAgenticCopyStatus] = React.useState<string | null>(null)
  const { lastTraversal, setLastTraversal, editState, editPaths } = useOrchestratorTraversalEditState()
  const graph = data as GraphData | null
  const graphSemanticKey = React.useMemo(
    () => buildScopedGraphSemanticKey('orchestrator-settings-graph', { graphData: graph, graphRevision: graphDataRevision }),
    [graph, graphDataRevision],
  )
  const graphLookup = React.useMemo(
    () => getCachedGraphLookup({
      cacheScope: 'orchestrator-settings-graph',
      graphData: graph,
      graphRevision: graphDataRevision,
      graphSemanticKey,
      preferCurrentGraphDataRefs: true,
    }),
    [graph, graphDataRevision, graphSemanticKey],
  )

  const handleSetTraversalDelayMs = React.useCallback(
    (value: number) => {
      const clamped = lsSetInt(LS_KEYS.orchestratorTraversalDelayMs, value, {
        min: ORCHESTRATOR_TRAVERSAL_DELAY_MIN_MS,
        max: ORCHESTRATOR_TRAVERSAL_DELAY_MAX_MS,
      })
      setTraversalDelayMs(clamped)
    },
    [],
  )

  const graphRagWorkflowState = React.useMemo(() => {
    const safeGraphId = typeof graphId === 'string' && graphId.trim() ? graphId : 'graph'
    const fallback = buildGraphRagWorkflowFromGraphData(safeGraphId, graph)
    const text = typeof graphRagWorkflowJsonText === 'string' ? graphRagWorkflowJsonText : ''
    const trimmed = text.trim()
    if (!trimmed) {
      return {
        workflow: fallback,
        source: 'generated' as const,
        error: null as string | null,
        validationErrors: [] as string[],
      }
    }
    try {
      const parsed = JSON.parse(trimmed) as unknown
      const result = validateGraphRagWorkflowJsonLdObject(parsed)
      if (!result.ok) {
        return {
          workflow: fallback,
          source: 'invalid' as const,
          error: result.errors[0] || IMPORT_EXPORT_STATUS_COPY.graphRagWorkflowJsonLdInvalid,
          validationErrors: result.errors,
        }
      }
      return {
        workflow: parsed as GraphRagWorkflowJsonLd,
        source: 'loaded' as const,
        error: null as string | null,
        validationErrors: [] as string[],
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err || '')
      return {
        workflow: fallback,
        source: 'parse-error' as const,
        error: IMPORT_EXPORT_STATUS_COPY.graphRagWorkflowJsonInvalid(message),
        validationErrors: [] as string[],
      }
    }
  }, [graph, graphId, graphRagWorkflowJsonText])

  const workflowDoc: GraphRagWorkflowJsonLd = graphRagWorkflowState.workflow
  const workflowSource = graphRagWorkflowState.source
  const workflowError = graphRagWorkflowState.error
  const workflowValidationErrors = graphRagWorkflowState.validationErrors

  const agenticContext = React.useMemo(
    () => getAgenticRagContextComparison(graph),
    [graph],
  )

  const handleUpdateWorkflow = React.useCallback(
    (updater: (current: GraphRagWorkflowJsonLd) => GraphRagWorkflowJsonLd) => {
      const next = updater(workflowDoc)
      try {
        const text = JSON.stringify(next, null, 2)
        setGraphRagWorkflowJsonText(text)
      } catch {
        void 0
      }
    },
    [workflowDoc, setGraphRagWorkflowJsonText],
  )

  const handleSetAgenticContextUrl = React.useCallback(
    (value: string) => {
      if (!graph) return
      const raw = graph.context as JSONValue | undefined
      let ctx: Record<string, JSONValue> = {}
      if (typeof raw === 'string') {
        try {
          const parsed = JSON.parse(raw) as JSONValue
          if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            ctx = parsed as Record<string, JSONValue>
          }
        } catch {
          ctx = {}
        }
      } else if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
        ctx = raw as Record<string, JSONValue>
      }
      const trimmed = value.trim()
      if (trimmed) {
        ctx['@vocab'] = trimmed
      } else {
        delete ctx['@vocab']
      }
      const next: GraphData = {
        ...graph,
        context: ctx as JSONValue,
      }
      setGraphData(next)
    },
    [graph, setGraphData],
  )

  const graphNodesById = React.useMemo(() => {
    if (!graphLookup) return {} as Record<string, { label: string }>
    const map: Record<string, { label: string }> = {}
    graphLookup.nodes.forEach(node => {
      const id = String(node.id)
      const label = typeof node.label === 'string' && node.label.length > 0 ? node.label : id
      map[id] = { label }
    })
    return map
  }, [graphLookup])

  const graphEdgesById = React.useMemo(() => {
    if (!graphLookup) {
      return {} as Record<string, { source: string; target: string; label: string }>
    }
    const map: Record<string, { source: string; target: string; label: string }> = {}
    graphLookup.edges.forEach(edge => {
      const id = String(edge.id)
      const source = String(edge.source)
      const target = String(edge.target)
      const label = String(edge.label ?? '')
      map[id] = { source, target, label }
    })
    return map
  }, [graphLookup])

  const graphRagPathHelper: GraphRagPathHelper | null = React.useMemo(() => {
    const owner = findGraphRagOwnerNode(graph, selectedNodeId)
    if (!owner) return null
    const props = owner.properties ?? {}
    const raw = (props as Record<string, JSONValue>).graphRAGPath as
      | AgenticGraphRagPathValue
      | undefined
    if (!isGraphRagPathValue(raw)) return null
    const traversePath = toParsedTraversePath(raw)
    if (!traversePath || !Array.isArray(traversePath.traverse) || traversePath.traverse.length === 0) {
      return null
    }
    return {
      ownerNodeId: String(owner.id),
      ownerNodeLabel:
        typeof owner.label === 'string' && owner.label.length > 0 ? owner.label : String(owner.id),
      traverse: traversePath.traverse.map(id => String(id)),
    }
  }, [graph, selectedNodeId])

  const previewEdgeIds = React.useMemo(() => {
    const traversal = lastTraversal
    if (!graph || !Array.isArray(graph.edges)) return []
    if (!traversal || traversal.mode !== 'graphRag') return []
    const ownerId = String(traversal.ownerNodeId || '').trim()
    if (!ownerId) return []
    const pathIds = [ownerId, ...(traversal.traverseNodeIds || [])].map(id => String(id))
    return buildEdgeIdsForPath(graph, pathIds, {
      graphRevision: graphDataRevision,
      graphSemanticKey,
    })
  }, [graph, graphDataRevision, graphSemanticKey, lastTraversal])

  React.useEffect(() => {
    setLastTraversal(null)
  }, [graphSemanticKey, setLastTraversal])

  React.useEffect(() => {
    setLastTraversalSummary(lastTraversal)
  }, [lastTraversal, setLastTraversalSummary])

  const runEdgeTraversalSequence = React.useCallback(
    (edgeIds: string[], startNodeId?: string | null) => {
      runEdgeTraversalSequenceGlobal(edgeIds, startNodeId)
    },
    [],
  )

  const [traversalPlane, setTraversalPlane] = React.useState<{ startedAtMs: number; durationMs: number } | null>(null)
  const [traversalPlaneProgress, setTraversalPlaneProgress] = React.useState<number | null>(null)
  const traversalPlaneTimeoutRef = React.useRef<number | null>(null)

  const startTraversalPlane = React.useCallback((edgeCount: number) => {
    const count = Number.isFinite(edgeCount) ? Math.max(0, Math.floor(edgeCount)) : 0
    const stepMs = lsInt(LS_KEYS.orchestratorTraversalDelayMs, ORCHESTRATOR_TRAVERSAL_DELAY_DEFAULT_MS)
    const durationMs = Math.max(600, Math.min(60_000, stepMs * Math.max(1, count)))
    const startedAtMs = Date.now()
    setTraversalPlane({ startedAtMs, durationMs })
    setTraversalPlaneProgress(0)
    if (typeof window !== 'undefined') {
      if (traversalPlaneTimeoutRef.current != null) {
        try {
          window.clearTimeout(traversalPlaneTimeoutRef.current)
        } catch {
          void 0
        }
      }
      traversalPlaneTimeoutRef.current = window.setTimeout(() => {
        setTraversalPlane(null)
        setTraversalPlaneProgress(null)
        traversalPlaneTimeoutRef.current = null
      }, durationMs + stepMs)
    }
  }, [])

  React.useEffect(() => {
    if (!traversalPlane) {
      setTraversalPlaneProgress(null)
      return
    }
    if (typeof window === 'undefined') return
    let raf = 0
    const tick = () => {
      const elapsed = Date.now() - traversalPlane.startedAtMs
      const p = traversalPlane.durationMs > 0 ? elapsed / traversalPlane.durationMs : 0
      const clamped = Math.max(0, Math.min(1, p))
      setTraversalPlaneProgress(clamped)
      if (clamped >= 1) return
      raf = window.requestAnimationFrame(tick)
    }
    raf = window.requestAnimationFrame(tick)
    return () => {
      try {
        window.cancelAnimationFrame(raf)
      } catch {
        void 0
      }
    }
  }, [traversalPlane])

  const runGraphRagTraversal = React.useCallback(() => {
    if (!graph || !Array.isArray(graph.nodes) || !Array.isArray(graph.edges)) return
    let edgeIds: string[] = []
    const summary: GraphRagTraversalSummary | null = buildGraphRagTraversalSummary(graph, selectedNodeId)
    if (summary) {
      edgeIds = summary.edgeIds.map(id => String(id))
      setLastTraversal(summary)
    } else {
      edgeIds = findGraphRagTraversalEdgeIds(graph, {
        graphRevision: graphDataRevision,
        graphSemanticKey,
      })
      if (!edgeIds.length) return
      setLastTraversal({
        mode: 'graphRag',
        ownerNodeId: '',
        ownerNodeLabel: '',
        query: null,
        example: null,
        traverseNodeIds: [],
        multiHop: [],
        hops: [],
        edgeIds,
      })
    }
    const startNodeId =
      summary && summary.ownerNodeId && summary.ownerNodeId.trim().length > 0
        ? summary.ownerNodeId
        : selectedNodeId || null
    startTraversalPlane(edgeIds.length)
    runEdgeTraversalSequence(edgeIds, startNodeId)
  }, [
    graph,
    graphDataRevision,
    graphSemanticKey,
    selectedNodeId,
    runEdgeTraversalSequence,
    setLastTraversal,
    startTraversalPlane,
  ])

  const runGenericTraversalQuery = React.useCallback(() => {
    if (!graph || !Array.isArray(graph.nodes) || !Array.isArray(graph.edges)) return
    const trimmedStart = traversalStartNodeId.trim()
    const startNodeId = trimmedStart.length > 0 ? trimmedStart : (selectedNodeId || '')
    if (!startNodeId) return
    const depth = Number.isFinite(traversalMaxDepth) && traversalMaxDepth > 0 ? traversalMaxDepth : 1
    const labelParts = traversalLabelFilter.split(',').map(s => s.trim()).filter(s => s.length > 0)
    const edgeIds = findTraversalEdgeIds(graph, {
      startNodeId,
      maxDepth: depth,
      allowedEdgeLabels: labelParts.length > 0 ? labelParts : undefined,
    }, {
      graphRevision: graphDataRevision,
      graphSemanticKey,
    })
    if (!edgeIds.length) return
    setLastTraversal({
      mode: 'generic',
      startNodeId,
      maxDepth: depth,
      labelFilter: traversalLabelFilter,
      edgeIds,
    })
    startTraversalPlane(edgeIds.length)
    runEdgeTraversalSequence(edgeIds, startNodeId)
  }, [
    graph,
    graphDataRevision,
    graphSemanticKey,
    traversalStartNodeId,
    traversalMaxDepth,
    traversalLabelFilter,
    selectedNodeId,
    runEdgeTraversalSequence,
    startTraversalPlane,
    setLastTraversal,
  ])

  const selectedAgenticNode: AgenticRagNodeView | null = React.useMemo(() => {
    if (!graphLookup || !selectedNodeId) return null
    const node = graphLookup.nodeById.get(String(selectedNodeId)) as GraphNode | undefined
    if (!node) return null
    return agenticRagNodeFromGraphNode(node)
  }, [graphLookup, selectedNodeId])

  const handleCopyAgenticRagNodeJson = React.useCallback(async () => {
    try {
      if (!selectedAgenticNode) {
        setAgenticCopyStatus(AGENTIC_RAG_NODE_JSON_STATUS_NONE)
        return
      }
      if (typeof navigator === 'undefined' || !navigator.clipboard) {
        setAgenticCopyStatus(UI_COPY.orchestratorClipboardNotAvailable)
        return
      }
      const text = JSON.stringify(selectedAgenticNode, null, 2)
      await navigator.clipboard.writeText(text)
      setAgenticCopyStatus(AGENTIC_RAG_NODE_JSON_STATUS_COPIED)
    } catch {
      setAgenticCopyStatus(UI_COPY.orchestratorCopyFailed)
    }
  }, [selectedAgenticNode])

  React.useEffect(() => {
    if (!requestAiKgTraversal) return
    runGraphRagTraversal()
    setRequestAiKgTraversal(false)
  }, [requestAiKgTraversal, runGraphRagTraversal, setRequestAiKgTraversal])

  React.useEffect(() => {
    const next = persistTraversalSummaryToGraph(graph, lastTraversal)
    if (!graph || !next || next === graph) return
    useGraphStore.getState().setGraphData(next)
  }, [graph, lastTraversal])

  const traversalViewModel = buildOrchestratorTraversalSectionViewModel({
    graphNodesById,
    graphEdgesById,
    previewEdgeIds,
    lastTraversal,
    setLastTraversal,
    selectNode: id => selectNode(id),
    selectEdge: id => selectEdge(id),
    editState,
    editPaths,
    selectedAgenticNode,
    agenticCopyStatus,
    onCopyAgenticRagNodeJson: handleCopyAgenticRagNodeJson,
  })

  return (
    <section
      className={[
        `mt-1 ${UI_THEME_TOKENS.text.primary}`,
        uiPanelKeyValueTextSizeClass,
        uiPanelTextFontClass,
      ].join(' ')}
      aria-label="Orchestrator settings"
    >
      <OrchestratorTraversalSection
        graphRagCollapsed={graphRagCollapsed}
        presetsCollapsed={presetsCollapsed}
        editorCollapsed={editorCollapsed}
        setGraphRagCollapsed={setGraphRagCollapsed}
        setPresetsCollapsed={setPresetsCollapsed}
        setEditorCollapsed={setEditorCollapsed}
        workflowProps={{
          workflowDoc,
          workflowSource,
          workflowError,
          workflowValidationErrors,
          traversalDelayMs,
          onChangeTraversalDelayMs: handleSetTraversalDelayMs,
          lastTraversal,
          onUpdateWorkflow: handleUpdateWorkflow,
          indexingCollapsed,
          onToggleIndexingCollapsed: setIndexingCollapsed,
          tracingCollapsed,
          onToggleTracingCollapsed: setTracingCollapsed,
          agenticContext,
          onChangeAgenticContextUrl: handleSetAgenticContextUrl,
        }}
        presetsProps={{
          runGraphRagTraversal,
          traversalStartNodeId,
          setTraversalStartNodeId,
          traversalMaxDepth,
          setTraversalMaxDepth,
          traversalLabelFilter,
          setTraversalLabelFilter,
          runGenericTraversalQuery,
          traversalPlaneProgress,
          selectedNodeId,
          graphRagPathHelper,
          graphNodesById,
          selectNode,
          duckdbQueriesFromConfig: workflowDoc.duckdbQueries,
        }}
        editorProps={{
          traversalViewModel,
          schema,
          setSchema,
          setThreeConfig,
          setCharge,
          setCollisionByType,
          traversalDelayMs,
          onChangeTraversalDelayMs: handleSetTraversalDelayMs,
        }}
      />
      <AgenticRagContextSection
        collapsed={contextCollapsed}
        onToggle={setContextCollapsed}
        graphData={graph}
      />
    </section>
  )
}
