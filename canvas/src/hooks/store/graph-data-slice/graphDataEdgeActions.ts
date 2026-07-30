import type { GraphEdge } from '@/lib/graph/types'
import type { GetGraph, SetGraph } from './graphDataSliceAccess'
import { canAddEdge, validateEdgeProperties } from '@/features/schema/validation'
import { composeGraphFromSourceLayers } from '@/lib/graph/sourceLayers'
import { resolveGraphNodeByCanonicalId } from '@/lib/graph/canonicalNodeIds'
import { syncGraphFieldsWithGraphData, withGraphDataRevision } from '@/hooks/store/graphDataSliceUtils'
import {
  buildLayersFromSourceFiles,
  isComposedGraphData,
  parseComposedId,
  resolvePreferredComposedLayerId,
} from './graphDataComposedSource'
import {
  syncActiveMarkdownDocumentTextFromParsedGraph,
  syncSourceFileTextFromParsedGraph,
  writeActiveMarkdownDocumentTextIfPresent,
  writeWorkspaceSourceTextIfPresent,
} from './graphDataFrontmatterFlowSync'
import { buildUpdatedSourceFileParsedGraphState } from '@/features/source-files/sourceFileParsedState'
import { isWorkspaceGraphMutationBlocked } from '@/features/workspace-table/workspaceTableSsot'

export function createGraphDataEdgeActions(set: SetGraph, get: GetGraph) {
  return ({
  addEdge: (edge: GraphEdge) => {
    if (isWorkspaceGraphMutationBlocked(get())) return
    let { graphData, schema } = get();
    if (!graphData) {
      get().setGraphData({ context: '', type: 'Graph', nodes: [], edges: [] })
      ;({ graphData, schema } = get())
    }
    if (!graphData) return
    if (isComposedGraphData(graphData)) {
      const resolvedSourceId = String(resolveGraphNodeByCanonicalId(graphData, edge.source)?.id || edge.source || '').trim()
      const resolvedTargetId = String(resolveGraphNodeByCanonicalId(graphData, edge.target)?.id || edge.target || '').trim()
      const normalizedEdge: GraphEdge = {
        ...edge,
        source: resolvedSourceId,
        target: resolvedTargetId,
      }
      const srcParsed = parseComposedId(resolvedSourceId)
      const tgtParsed = parseComposedId(resolvedTargetId)
      if ((srcParsed && tgtParsed && srcParsed.layerId !== tgtParsed.layerId) || (!srcParsed && !tgtParsed)) {
        const preferredLayerId = resolvePreferredComposedLayerId({ get })
        if (!preferredLayerId) return
      }
      const layerId =
        srcParsed?.layerId || tgtParsed?.layerId || resolvePreferredComposedLayerId({ get }) || ''
      const innerSource = srcParsed?.innerId || resolvedSourceId
      const innerTarget = tgtParsed?.innerId || resolvedTargetId
      if (!layerId || !innerSource || !innerTarget) return
      const parsedId = parseComposedId(normalizedEdge.id)
      const innerId = parsedId?.innerId || String(normalizedEdge.id || '').trim()
      const viewEdge: GraphEdge = {
        ...normalizedEdge,
        id: `${layerId}::${innerId}`,
        source: `${layerId}::${innerSource}`,
        target: `${layerId}::${innerTarget}`,
      }
      if (!canAddEdge(schema, graphData, viewEdge)) return
      const tpl = schema.templates?.edge?.[edge.label] || {};
      const withTpl = { ...viewEdge, properties: { ...(edge.properties || {}), ...tpl } };
      const sourceFiles = get().sourceFiles || []
      const idx = sourceFiles.findIndex(f => String(f.id || '') === layerId)
      const file = idx >= 0 ? sourceFiles[idx] : null
      const pg = file?.parsedGraphData || null
      if (!file || !pg || !Array.isArray(pg.edges)) return
      const layerEdge: GraphEdge = {
        ...withTpl,
        id: innerId,
        source: innerSource,
        target: innerTarget,
      }
      const nextParsedGraphData = { ...pg, edges: [...pg.edges, layerEdge] }
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
      set(s => ({
        sourceFiles: nextSourceFiles,
        ...(Object.prototype.hasOwnProperty.call(textSync, 'markdownDocumentText') ? { markdownDocumentText: textSync.markdownDocumentText ?? null } : {}),
        ...(Object.prototype.hasOwnProperty.call(textSync, 'markdownDocumentText') && file?.source?.path
          ? { markdownDocumentName: String(file.source.path || '') || s.markdownDocumentName }
          : {}),
        graphValidationStatus: null,
        graphValidationTimestamp: null,
      }))
      get().setGraphDataPreservingLayout(nextGraphData)
      if (Object.prototype.hasOwnProperty.call(textSync, 'markdownDocumentText')) {
        writeWorkspaceSourceTextIfPresent(nextSourceFiles[idx], textSync.markdownDocumentText ?? '')
      }
      try {
        syncGraphFieldsWithGraphData(get, nextGraphData)
      } catch { void 0 }
      set({ lifecycleStage: 'edgeMutate' });
      const extras = `source=${viewEdge.source},target=${viewEdge.target},label=${viewEdge.label}`;
      get().scheduleHistory(`Add Edge: ${viewEdge.id} [${extras}]`);
      return
    }
    if (!canAddEdge(schema, graphData, edge)) return;
    const tpl = schema.templates?.edge?.[edge.label] || {};
    const withTpl = { ...edge, properties: { ...(edge.properties || {}), ...tpl } };
    const edges = [...graphData.edges, withTpl]
    const nextGraphDataBase = { ...graphData, edges }
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
    try {
      syncGraphFieldsWithGraphData(get, nextGraphData)
    } catch { void 0 }
    set({ lifecycleStage: 'edgeMutate' });
    const extras = `source=${withTpl.source},target=${withTpl.target},label=${withTpl.label}`;
    get().scheduleHistory(`Add Edge: ${withTpl.id} [${extras}]`);
  },

  updateEdge: (id: string, updates: Partial<GraphEdge>) => {
    if (isWorkspaceGraphMutationBlocked(get())) return
    const { graphData, schema } = get();
    if (!graphData) return;
    if (isComposedGraphData(graphData)) {
      const parsed = parseComposedId(id)
      if (parsed && !Object.prototype.hasOwnProperty.call(updates, 'id')) {
        const srcParsed = Object.prototype.hasOwnProperty.call(updates, 'source') ? parseComposedId(String((updates as any).source || '')) : null
        const tgtParsed = Object.prototype.hasOwnProperty.call(updates, 'target') ? parseComposedId(String((updates as any).target || '')) : null
        if ((srcParsed && srcParsed.layerId !== parsed.layerId) || (tgtParsed && tgtParsed.layerId !== parsed.layerId)) return
        const sourceFiles = get().sourceFiles || []
        const idx = sourceFiles.findIndex(f => String(f.id || '') === parsed.layerId)
        const file = idx >= 0 ? sourceFiles[idx] : null
        const pg = file?.parsedGraphData || null
        if (file && pg && Array.isArray(pg.edges)) {
          const normalizedUpdates: Partial<GraphEdge> = { ...updates }
          if (typeof (normalizedUpdates as any).source === 'string') {
            const v = String((normalizedUpdates as any).source || '').trim()
            ;(normalizedUpdates as any).source = (parseComposedId(v)?.innerId || v)
          }
          if (typeof (normalizedUpdates as any).target === 'string') {
            const v = String((normalizedUpdates as any).target || '').trim()
            ;(normalizedUpdates as any).target = (parseComposedId(v)?.innerId || v)
          }
          const nextEdges = pg.edges.map(e => (String(e.id || '') === parsed.innerId ? { ...e, ...normalizedUpdates } : e))
          const nextParsedGraphData = { ...pg, edges: nextEdges }
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
          set({ lifecycleStage: 'edgeMutate' });
          const fields = Object.keys(updates || {}).join(',') || 'none';
          get().scheduleHistory(`Update Edge: ${id} [${fields}]`);
          return
        }
      }
    }
    const current = graphData.edges.find(e => e.id === id);
    const normalizedUpdates: Partial<GraphEdge> = { ...updates }
    if (typeof normalizedUpdates.source === 'string') normalizedUpdates.source = normalizedUpdates.source.trim()
    if (typeof normalizedUpdates.target === 'string') normalizedUpdates.target = normalizedUpdates.target.trim()
    const nextEdge = current ? { ...current, ...normalizedUpdates } : null;
    if (!validateEdgeProperties(schema, id, nextEdge)) return;
    if (nextEdge && (
      Object.prototype.hasOwnProperty.call(normalizedUpdates, 'source') ||
      Object.prototype.hasOwnProperty.call(normalizedUpdates, 'target') ||
      Object.prototype.hasOwnProperty.call(normalizedUpdates, 'label')
    )) {
      const dataWithoutEdge = { ...graphData, edges: graphData.edges.filter(e => e.id !== id) }
      if (!canAddEdge(schema, dataWithoutEdge, nextEdge)) return
    }
    const edges = graphData.edges.map(e => (e.id === id ? { ...e, ...normalizedUpdates } : e))
    const nextGraphDataBase = { ...graphData, edges }
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
    set({ lifecycleStage: 'edgeMutate' });
    const fields = Object.keys(updates || {}).join(',') || 'none';
    get().scheduleHistory(`Update Edge: ${id} [${fields}]`);
  },

  removeEdge: (id: string) => {
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
        if (file && pg && Array.isArray(pg.edges)) {
          const nextEdges = pg.edges.filter(e => String(e.id || '') !== parsed.innerId)
          const nextParsedGraphData = nextEdges.length === pg.edges.length ? pg : { ...pg, edges: nextEdges }
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
          const nextSelectedEdgeId = selectedEdgeId === id ? null : selectedEdgeId
          const nextSelectedEdgeIds = (state.selectedEdgeIds || []).filter(edgeId => edgeId !== id)
          set(s => ({
            sourceFiles: nextSourceFiles,
            graphData: nextGraphData,
            graphDataRevision: nextRevision,
            graphContentRevision: (s.graphContentRevision || 0) + 1,
            docLocationRevision: (s.docLocationRevision || 0) + 1,
            selectedEdgeId: nextSelectedEdgeId,
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
            syncGraphFieldsWithGraphData(get, nextGraphData)
          } catch { void 0 }
          set({ lifecycleStage: 'edgeMutate' });
          get().scheduleHistory(`Remove Edge: ${id}`);
          return
        }
      }
    }
    const edges = graphData.edges.filter(e => e.id !== id);
    const nextGraphDataBase = { ...graphData, edges }
    const state = get()
    const selectedEdgeId = state.selectedEdgeId
    const nextSelectedEdgeId = selectedEdgeId === id ? null : selectedEdgeId
    const nextSelectedEdgeIds = (state.selectedEdgeIds || []).filter(edgeId => edgeId !== id)
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
      selectedEdgeId: nextSelectedEdgeId,
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
      syncGraphFieldsWithGraphData(get, nextGraphData)
    } catch { void 0 }
    set({ lifecycleStage: 'edgeMutate' });
    get().scheduleHistory(`Remove Edge: ${id}`);
  },
  })
}
