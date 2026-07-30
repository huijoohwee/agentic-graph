import type { GraphData, GraphNode, JSONValue } from '@/lib/graph/types'
import type { GetGraph, SetGraph } from './graphDataSliceAccess'
import { validateNodeProperties } from '@/features/schema/validation'
import { composeGraphFromSourceLayers } from '@/lib/graph/sourceLayers'
import { syncGraphFieldsWithGraphData, withGraphDataRevision } from '@/hooks/store/graphDataSliceUtils'
import {
  buildLayersFromSourceFiles,
  ensureSourceFileGraphData,
  flushComposedPositionWritesNow,
  isComposedGraphData,
  isPositionOnlyNodeUpdate,
  isPureComposedNodePositionUpdate,
  mergeNodeForUpdate,
  parseComposedId,
  queueComposedPositionWrite,
  resolvePreferredComposedLayerId,
} from './graphDataComposedSource'
import {
  syncActiveMarkdownDocumentTextFromParsedGraph,
  syncSourceFileTextFromParsedGraph,
  writeActiveMarkdownDocumentTextIfPresent,
  writeWorkspaceSourceTextIfPresent,
} from './graphDataFrontmatterFlowSync'
import { buildUpdatedSourceFileParsedGraphState } from '@/features/source-files/sourceFileParsedState'
import { FLOW_RICH_MEDIA_PANEL_NODE_TYPE_ID } from '@/lib/config.storyboard-widget'
import { reportRuntimeTrace } from '@/lib/debug/runtimeTrace'
import { isCanonicalNodeIdEqual, resolveGraphNodeByCanonicalId } from '@/lib/graph/canonicalNodeIds'
import { isWorkspaceGraphMutationBlocked } from '@/features/workspace-table/workspaceTableSsot'

const STORYBOARD_MEDIA_PANEL_LOOP_TRACE_SCOPE = 'storyboard-media-panel-loop'

function reportStoryboardMediaPanelLoopNodeActionDebug(args: {
  hypothesisId: 'A' | 'B' | 'C' | 'D' | 'E'
  location: string
  msg: string
  data?: Record<string, unknown>
}): void {
  reportRuntimeTrace({
    scope: STORYBOARD_MEDIA_PANEL_LOOP_TRACE_SCOPE,
    runId: 'runtime',
    hypothesisId: args.hypothesisId,
    location: args.location,
    msg: args.msg,
    data: args.data || {},
  })
}

function readGraphDataDebugKind(graphData: GraphData | null | undefined): string {
  const metadata = graphData?.metadata && typeof graphData.metadata === 'object' && !Array.isArray(graphData.metadata)
    ? (graphData.metadata as Record<string, unknown>)
    : null
  return String(metadata?.parserId || metadata?.kind || graphData?.context || '').trim()
}

function isStoryboardMarkdownText(text: unknown): boolean {
  const raw = String(text || '')
  return /kgStrybldrStoryboard:\s*(?:"true"|'true'|true|1)/.test(raw) || /```(?:json\s+)?strybldr-storyboard\b/i.test(raw)
}

export function createGraphDataNodeActions(set: SetGraph, get: GetGraph) {
  return ({
  updateNode: (id: string, updates: Partial<GraphNode>) => {
    if (isWorkspaceGraphMutationBlocked(get())) return
    const { graphData, schema } = get();
    if (!graphData) return;
    if (isComposedGraphData(graphData)) {
      const parsed = parseComposedId(id)
      if (parsed && !Object.prototype.hasOwnProperty.call(updates, 'id')) {
        if (isPureComposedNodePositionUpdate(updates)) {
          const nodes = graphData.nodes.map(n => (n.id === id ? mergeNodeForUpdate(n, updates) : n))
          const nextGraphDataBase = { ...graphData, nodes }
          const nextRevision = (get().graphDataRevision || 0) + 1
          const nextGraphData = withGraphDataRevision(nextGraphDataBase, nextRevision)
          set({ graphData: nextGraphData, graphDataRevision: nextRevision, graphValidationStatus: null, graphValidationTimestamp: null })

          queueComposedPositionWrite({ graphData, layerId: parsed.layerId, innerId: parsed.innerId, updates })
          return
        }
        const sourceFiles = get().sourceFiles || []
        const idx = sourceFiles.findIndex(f => String(f.id || '') === parsed.layerId)
        const file = idx >= 0 ? sourceFiles[idx] : null
        const pg = file?.parsedGraphData || null
        if (file && pg && Array.isArray(pg.nodes)) {
          const previousParsedNode = pg.nodes.find(n => String(n.id || '') === parsed.innerId) || null
          const nextParsedNode = previousParsedNode ? mergeNodeForUpdate(previousParsedNode, updates) : null
          const nextNodes = pg.nodes.map(n => (String(n.id || '') === parsed.innerId ? nextParsedNode || { ...n, ...updates } : n))
          const nextParsedGraphData = { ...pg, nodes: nextNodes }
          let nextSourceFiles = sourceFiles.slice()
          nextSourceFiles[idx] = {
            ...file,
            ...buildUpdatedSourceFileParsedGraphState({
              previousParsedState: file,
              graphData: nextParsedGraphData,
            }),
          }
          const textSync = syncSourceFileTextFromParsedGraph({
            state: get(),
            sourceFiles: nextSourceFiles,
            fileIndex: idx,
            parsedGraphData: nextParsedGraphData,
            previousNode: previousParsedNode,
            nextNode: nextParsedNode,
          })
          nextSourceFiles = textSync.sourceFiles
          const { graphData: recomposed } = composeGraphFromSourceLayers({ layers: buildLayersFromSourceFiles(nextSourceFiles) })
          const nextRevision = (get().graphDataRevision || 0) + 1
          const nextGraphData = withGraphDataRevision(recomposed, nextRevision)
          set(s => ({
            sourceFiles: nextSourceFiles,
            graphData: nextGraphData,
            graphDataRevision: nextRevision,
            graphContentRevision: (s.graphContentRevision || 0) + 1,
            ...(Object.prototype.hasOwnProperty.call(updates, 'metadata') ? { docLocationRevision: (s.docLocationRevision || 0) + 1 } : {}),
            ...(Object.prototype.hasOwnProperty.call(textSync, 'markdownDocumentText') ? { markdownDocumentText: textSync.markdownDocumentText ?? null } : {}),
            ...(Object.prototype.hasOwnProperty.call(textSync, 'markdownDocumentText') && file?.source?.path
              ? { markdownDocumentName: String(file.source.path || '') || s.markdownDocumentName }
              : {}),
            graphValidationStatus: null,
            graphValidationTimestamp: null,
          }))
          if (Object.prototype.hasOwnProperty.call(textSync, 'markdownDocumentText')) {
            writeWorkspaceSourceTextIfPresent(nextSourceFiles[idx], textSync.markdownDocumentText ?? '')
          }
          if (Object.prototype.hasOwnProperty.call(updates, 'properties')) {
            try {
              syncGraphFieldsWithGraphData(get, nextGraphData)
            } catch { void 0 }
          }
          const fields = Object.keys(updates || {}).join(',') || 'none';
          get().scheduleHistory(`Update Node: ${id} [${fields}]`);
          return
        }
      }
    }
    const current = resolveGraphNodeByCanonicalId(graphData, id)
    const targetNodeId = String(current?.id || '').trim()
    if (!targetNodeId) return
    const nextNode = current ? mergeNodeForUpdate(current, updates) : null;
    if (!validateNodeProperties(schema, targetNodeId, nextNode, graphData)) return;
    const nodes = graphData.nodes.map(n => (isCanonicalNodeIdEqual(n.id, targetNodeId) ? mergeNodeForUpdate(n, updates) : n))
    const nextGraphDataBase = { ...graphData, nodes }
    const nextRevision = (get().graphDataRevision || 0) + 1
    const nextGraphData = withGraphDataRevision(nextGraphDataBase, nextRevision)
    const positionOnly = isPositionOnlyNodeUpdate(updates)
    const activeTextSync = syncActiveMarkdownDocumentTextFromParsedGraph({
      state: get(),
      sourceFiles: get().sourceFiles || [],
      parsedGraphData: nextGraphData,
      previousNode: current || null,
      nextNode,
    })
    set(s => ({
      ...(activeTextSync.sourceFiles !== (s.sourceFiles || []) ? { sourceFiles: activeTextSync.sourceFiles } : {}),
      graphData: nextGraphData,
      graphDataRevision: nextRevision,
      ...(positionOnly ? {} : { graphContentRevision: (s.graphContentRevision || 0) + 1 }),
      ...(Object.prototype.hasOwnProperty.call(updates, 'metadata') ? { docLocationRevision: (s.docLocationRevision || 0) + 1 } : {}),
      ...(Object.prototype.hasOwnProperty.call(activeTextSync, 'markdownDocumentText') ? { markdownDocumentText: activeTextSync.markdownDocumentText ?? null } : {}),
      ...(Object.prototype.hasOwnProperty.call(activeTextSync, 'markdownDocumentName') ? { markdownDocumentName: activeTextSync.markdownDocumentName ?? s.markdownDocumentName } : {}),
      graphValidationStatus: null,
      graphValidationTimestamp: null,
    }))
    if (Object.prototype.hasOwnProperty.call(activeTextSync, 'markdownDocumentText')) {
      writeActiveMarkdownDocumentTextIfPresent({
        state: get(),
        sourceFiles: activeTextSync.sourceFiles,
        text: activeTextSync.markdownDocumentText ?? '',
      })
    }
    if (Object.prototype.hasOwnProperty.call(updates, 'properties')) {
      try {
        syncGraphFieldsWithGraphData(get, nextGraphData)
      } catch { void 0 }
    }
    const fields = Object.keys(updates || {}).join(',') || 'none';
    get().scheduleHistory(`Update Node: ${id} [${fields}]`);
  },

  updateGraphMetadata: (updates: Record<string, JSONValue | undefined>) => {
    if (isWorkspaceGraphMutationBlocked(get())) return
    const { graphData } = get();
    if (!graphData) return;
    const nextMetadata = { ...(graphData.metadata || {}) } as Record<string, JSONValue>
    let changed = false
    for (const [key, value] of Object.entries(updates || {})) {
      const normalizedKey = String(key || '').trim()
      if (!normalizedKey) continue
      if (typeof value === 'undefined') {
        if (Object.prototype.hasOwnProperty.call(nextMetadata, normalizedKey)) {
          delete nextMetadata[normalizedKey]
          changed = true
        }
        continue
      }
      if (nextMetadata[normalizedKey] === value) continue
      nextMetadata[normalizedKey] = value
      changed = true
    }
    if (!changed) return
    const nextGraphDataBase = { ...graphData, metadata: nextMetadata }
    const nextRevision = (get().graphDataRevision || 0) + 1
    const nextGraphData = withGraphDataRevision(nextGraphDataBase, nextRevision)
    const activeTextSync = syncActiveMarkdownDocumentTextFromParsedGraph({
      state: get(),
      sourceFiles: get().sourceFiles || [],
      parsedGraphData: nextGraphData,
    })
    set(s => ({
      ...(activeTextSync.sourceFiles !== (s.sourceFiles || []) ? { sourceFiles: activeTextSync.sourceFiles } : {}),
      graphData: nextGraphData,
      graphDataRevision: nextRevision,
      graphContentRevision: (s.graphContentRevision || 0) + 1,
      docLocationRevision: (s.docLocationRevision || 0) + 1,
      ...(Object.prototype.hasOwnProperty.call(activeTextSync, 'markdownDocumentText') ? { markdownDocumentText: activeTextSync.markdownDocumentText ?? null } : {}),
      ...(Object.prototype.hasOwnProperty.call(activeTextSync, 'markdownDocumentName') ? { markdownDocumentName: activeTextSync.markdownDocumentName ?? s.markdownDocumentName } : {}),
      graphValidationStatus: null,
      graphValidationTimestamp: null,
    }))
    if (Object.prototype.hasOwnProperty.call(activeTextSync, 'markdownDocumentText')) {
      writeActiveMarkdownDocumentTextIfPresent({
        state: get(),
        sourceFiles: activeTextSync.sourceFiles,
        text: activeTextSync.markdownDocumentText ?? '',
      })
    }
    const fields = Object.keys(updates || {}).join(',') || 'none';
    get().scheduleHistory(`Update Graph Metadata [${fields}]`);
  },

  flushComposedPositionWritesNow: () => {
    try {
      flushComposedPositionWritesNow({ set, get })
    } catch {
      void 0
    }
  },

  addNode: (node: GraphNode) => {
    if (isWorkspaceGraphMutationBlocked(get())) return
    let { graphData, schema } = get();
    if (!graphData) {
      get().setGraphData({ context: '', type: 'Graph', nodes: [], edges: [] })
      ;({ graphData, schema } = get())
    }
    if (!graphData) return
    const tpl = schema.templates?.node?.[node.type] || {};
    const withTpl = { ...node, properties: { ...(node.properties || {}), ...tpl } };
    const parsedId = parseComposedId(withTpl.id)
    const layerId = resolvePreferredComposedLayerId({ get, explicitLayerId: parsedId?.layerId }) || ''
    const innerId = parsedId?.innerId || String(withTpl.id || '').trim()
    if (layerId && innerId) {
      const sourceFiles = get().sourceFiles || []
      const idx = sourceFiles.findIndex(f => String(f.id || '') === layerId)
      const file = idx >= 0 ? sourceFiles[idx] : null
      if (file) {
        const pg = ensureSourceFileGraphData(file)
        const layerNode: GraphNode = { ...withTpl, id: innerId }
        const nextParsedGraphData = { ...pg, nodes: [...pg.nodes, layerNode] }
        let nextSourceFiles = sourceFiles.slice()
        nextSourceFiles[idx] = {
          ...file,
          ...buildUpdatedSourceFileParsedGraphState({
            previousParsedState: file,
            graphData: nextParsedGraphData,
          }),
        }
        const textSync = syncSourceFileTextFromParsedGraph({
          state: get(),
          sourceFiles: nextSourceFiles,
          fileIndex: idx,
          parsedGraphData: nextParsedGraphData,
          nextNode: layerNode,
        })
        nextSourceFiles = textSync.sourceFiles
        const { graphData: recomposed } = composeGraphFromSourceLayers({ layers: buildLayersFromSourceFiles(nextSourceFiles) })
        const nextRevision = (get().graphDataRevision || 0) + 1
        const nextGraphData = withGraphDataRevision(recomposed, nextRevision)
        set(s => ({
          sourceFiles: nextSourceFiles,
          graphData: nextGraphData,
          graphDataRevision: nextRevision,
          graphContentRevision: (s.graphContentRevision || 0) + 1,
          docLocationRevision: (s.docLocationRevision || 0) + 1,
          ...(Object.prototype.hasOwnProperty.call(textSync, 'markdownDocumentText') ? { markdownDocumentText: textSync.markdownDocumentText ?? null } : {}),
          ...(Object.prototype.hasOwnProperty.call(textSync, 'markdownDocumentText') && file?.source?.path
            ? { markdownDocumentName: String(file.source.path || '') || s.markdownDocumentName }
            : {}),
          graphValidationStatus: null,
          graphValidationTimestamp: null,
        }))
        if (Object.prototype.hasOwnProperty.call(textSync, 'markdownDocumentText')) {
          writeWorkspaceSourceTextIfPresent(nextSourceFiles[idx], textSync.markdownDocumentText ?? '')
        }
        try {
          syncGraphFieldsWithGraphData(get, nextGraphData)
        } catch { void 0 }
        const composedId = `${layerId}::${innerId}`
        const extras = `label=${withTpl.label ?? node.label},type=${node.type}`;
        get().scheduleHistory(`Add Node: ${composedId} [${extras}]`);
        return
      }
    }
    const nodes = [...graphData.nodes, withTpl]
    const nextGraphDataBase = { ...graphData, nodes }
    const nextRevision = (get().graphDataRevision || 0) + 1
    const nextGraphData = withGraphDataRevision(nextGraphDataBase, nextRevision)
    const currentState = get()
    const sourceFiles = currentState.sourceFiles || []
    const activeTextSync = syncActiveMarkdownDocumentTextFromParsedGraph({
      state: currentState,
      sourceFiles,
      parsedGraphData: nextGraphData,
      nextNode: withTpl,
    })
    // #region debug-point D:graph-data-node-add-sync
    if (
      String(withTpl.type || '').trim() === FLOW_RICH_MEDIA_PANEL_NODE_TYPE_ID
      || isStoryboardMarkdownText(currentState.markdownDocumentText)
    ) {
      reportStoryboardMediaPanelLoopNodeActionDebug({
        hypothesisId: 'D',
        location: 'graphDataNodeActions.ts:add-node-sync',
        msg: 'shared addNode evaluated active markdown sync after rich media panel insertion',
        data: {
          nodeId: String(withTpl.id || '').trim(),
          nodeType: String(withTpl.type || '').trim(),
          activeMarkdownDocumentName: String(currentState.markdownDocumentName || '').trim(),
          activeMarkdownIsStoryboard: isStoryboardMarkdownText(currentState.markdownDocumentText),
          parsedGraphKind: readGraphDataDebugKind(nextGraphData),
          parsedGraphNodeCount: Array.isArray(nextGraphData.nodes) ? nextGraphData.nodes.length : 0,
          wroteMarkdownDocumentText: Object.prototype.hasOwnProperty.call(activeTextSync, 'markdownDocumentText'),
          sourceFilesChanged: activeTextSync.sourceFiles !== sourceFiles,
        },
      })
    }
    // #endregion
    set(s => ({
      ...(activeTextSync.sourceFiles !== (s.sourceFiles || []) ? { sourceFiles: activeTextSync.sourceFiles } : {}),
      graphData: nextGraphData,
      graphDataRevision: nextRevision,
      graphContentRevision: (s.graphContentRevision || 0) + 1,
      docLocationRevision: (s.docLocationRevision || 0) + 1,
      ...(Object.prototype.hasOwnProperty.call(activeTextSync, 'markdownDocumentText') ? { markdownDocumentText: activeTextSync.markdownDocumentText ?? null } : {}),
      ...(Object.prototype.hasOwnProperty.call(activeTextSync, 'markdownDocumentName') ? { markdownDocumentName: activeTextSync.markdownDocumentName ?? s.markdownDocumentName } : {}),
      graphValidationStatus: null,
      graphValidationTimestamp: null,
    }))
    if (Object.prototype.hasOwnProperty.call(activeTextSync, 'markdownDocumentText')) {
      writeActiveMarkdownDocumentTextIfPresent({
        state: get(),
        sourceFiles: activeTextSync.sourceFiles,
        text: activeTextSync.markdownDocumentText ?? '',
      })
    }
    try {
      syncGraphFieldsWithGraphData(get, nextGraphData)
    } catch { void 0 }
    const extras = `label=${withTpl.label ?? node.label},type=${node.type}`;
    get().scheduleHistory(`Add Node: ${withTpl.id} [${extras}]`);
  },

  removeNode: (id: string) => {
    if (isWorkspaceGraphMutationBlocked(get())) return
    const { graphData } = get();
    if (!graphData) return;
    if (isComposedGraphData(graphData)) {
      const parsed = parseComposedId(id)
      if (parsed) {
        const sourceFiles = get().sourceFiles || []
        const idx = sourceFiles.findIndex(f => String(f.id || '') === parsed.layerId)
        const file = idx >= 0 ? sourceFiles[idx] : null
        const pg = file?.parsedGraphData || null
        if (file && pg && Array.isArray(pg.nodes) && Array.isArray(pg.edges)) {
          const nextNodes = pg.nodes.filter(n => String(n.id || '') !== parsed.innerId)
          const nextEdges = pg.edges.filter(e => String(e.source || '') !== parsed.innerId && String(e.target || '') !== parsed.innerId)
          const nextParsedGraphData =
            nextNodes.length === pg.nodes.length && nextEdges.length === pg.edges.length
              ? pg
              : { ...pg, nodes: nextNodes, edges: nextEdges }
          let nextSourceFiles = sourceFiles.slice()
          nextSourceFiles[idx] = {
            ...file,
            ...buildUpdatedSourceFileParsedGraphState({
              previousParsedState: file,
              graphData: nextParsedGraphData,
            }),
          }
          const textSync = syncSourceFileTextFromParsedGraph({
            state: get(),
            sourceFiles: nextSourceFiles,
            fileIndex: idx,
            parsedGraphData: nextParsedGraphData,
          })
          nextSourceFiles = textSync.sourceFiles
          const { graphData: recomposed } = composeGraphFromSourceLayers({ layers: buildLayersFromSourceFiles(nextSourceFiles) })
          const nextRevision = (get().graphDataRevision || 0) + 1
          const nextGraphData = withGraphDataRevision(recomposed, nextRevision)
          const state = get()
          const selectedEdgeId = state.selectedEdgeId
          const nextSelectedEdgeId =
            selectedEdgeId && (nextGraphData.edges || []).some(e => String(e.id || '') === selectedEdgeId) ? selectedEdgeId : null
          const nextSelectedNodeIds = (state.selectedNodeIds || []).filter(nodeId => nodeId !== id)
          const nextSelectedEdgeIds = (state.selectedEdgeIds || []).filter(edgeId =>
            (nextGraphData.edges || []).some(e => String(e.id || '') === edgeId),
          )
          set(s => ({
            sourceFiles: nextSourceFiles,
            graphData: nextGraphData,
            graphDataRevision: nextRevision,
            graphContentRevision: (s.graphContentRevision || 0) + 1,
            docLocationRevision: (s.docLocationRevision || 0) + 1,
            selectedNodeId: null,
            selectedEdgeId: nextSelectedEdgeId,
            selectedNodeIds: nextSelectedNodeIds,
            selectedEdgeIds: nextSelectedEdgeIds,
            ...(Object.prototype.hasOwnProperty.call(textSync, 'markdownDocumentText') ? { markdownDocumentText: textSync.markdownDocumentText ?? null } : {}),
            ...(Object.prototype.hasOwnProperty.call(textSync, 'markdownDocumentText') && file?.source?.path
              ? { markdownDocumentName: String(file.source.path || '') || s.markdownDocumentName }
              : {}),
            graphValidationStatus: null,
            graphValidationTimestamp: null,
          }))
          if (Object.prototype.hasOwnProperty.call(textSync, 'markdownDocumentText')) {
            writeWorkspaceSourceTextIfPresent(nextSourceFiles[idx], textSync.markdownDocumentText ?? '')
          }
          try {
            get().updateOpenWidgetNodeIds(prev => prev.filter(nodeId => nodeId !== id))
          } catch { void 0 }
          try {
            syncGraphFieldsWithGraphData(get, nextGraphData)
          } catch { void 0 }
          const removedEdges = (pg.edges || []).filter(e => String(e.source || '') === parsed.innerId || String(e.target || '') === parsed.innerId).length;
          get().scheduleHistory(`Remove Node: ${id} [edges=${removedEdges}]`);
          return
        }
      }
    }
    const nodes = graphData.nodes.filter(n => n.id !== id);
    const edges = graphData.edges.filter(e => e.source !== id && e.target !== id);
    const nextGraphDataBase = { ...graphData, nodes, edges }
    const state = get()
    const selectedEdgeId = state.selectedEdgeId
    const nextSelectedEdgeId = selectedEdgeId && edges.some(e => e.id === selectedEdgeId) ? selectedEdgeId : null
    const nextSelectedNodeIds = (state.selectedNodeIds || []).filter(nodeId => nodeId !== id)
    const nextSelectedEdgeIds = (state.selectedEdgeIds || []).filter(edgeId =>
      edges.some(e => e.id === edgeId),
    )
    const nextRevision = (get().graphDataRevision || 0) + 1
    const nextGraphData = withGraphDataRevision(nextGraphDataBase, nextRevision)
    const activeTextSync = syncActiveMarkdownDocumentTextFromParsedGraph({
      state: get(),
      sourceFiles: get().sourceFiles || [],
      parsedGraphData: nextGraphData,
    })
    set(s => ({
      ...(activeTextSync.sourceFiles !== (s.sourceFiles || []) ? { sourceFiles: activeTextSync.sourceFiles } : {}),
      graphData: nextGraphData,
      graphDataRevision: nextRevision,
      graphContentRevision: (s.graphContentRevision || 0) + 1,
      docLocationRevision: (s.docLocationRevision || 0) + 1,
      selectedNodeId: null,
      selectedEdgeId: nextSelectedEdgeId,
      selectedNodeIds: nextSelectedNodeIds,
      selectedEdgeIds: nextSelectedEdgeIds,
      ...(Object.prototype.hasOwnProperty.call(activeTextSync, 'markdownDocumentText') ? { markdownDocumentText: activeTextSync.markdownDocumentText ?? null } : {}),
      ...(Object.prototype.hasOwnProperty.call(activeTextSync, 'markdownDocumentName') ? { markdownDocumentName: activeTextSync.markdownDocumentName ?? s.markdownDocumentName } : {}),
      graphValidationStatus: null,
      graphValidationTimestamp: null,
    }));
    if (Object.prototype.hasOwnProperty.call(activeTextSync, 'markdownDocumentText')) {
      writeActiveMarkdownDocumentTextIfPresent({
        state: get(),
        sourceFiles: activeTextSync.sourceFiles,
        text: activeTextSync.markdownDocumentText ?? '',
      })
    }
    try {
      get().updateOpenWidgetNodeIds(prev => prev.filter(nodeId => nodeId !== id))
    } catch { void 0 }
    try {
      syncGraphFieldsWithGraphData(get, nextGraphData)
    } catch { void 0 }
    const removedEdges = graphData.edges.filter(e => e.source === id || e.target === id).length;
    get().scheduleHistory(`Remove Node: ${id} [edges=${removedEdges}]`);
  },
  })
}
