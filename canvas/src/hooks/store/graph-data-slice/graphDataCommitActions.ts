import type { GraphData } from '@/lib/graph/types'
import type { GetGraph, SetGraph } from './graphDataSliceAccess'
import { LS_KEYS } from '@/lib/config'
import { lsRemove } from '@/lib/persistence'
import { persistGraphDataToLocalStorage } from '@/hooks/store/graphDataPersistence'
import { normalizeGraphData } from '@/lib/graph/normalize'
import { buildGraphMetaKeyIgnoringPending } from '@/lib/graph/graphMetaKey'
import { isStoryboardCanvas2dRenderer } from '@/lib/config.render'
import {
  shouldCarryForwardFlowWidgetOverlayStateOnGraphCommit,
  shouldPreserveFrontmatterAutoManagedBalancedCollective,
  stripFrontmatterAutoManagedWidgetPinnedStates,
  stripFrontmatterAutoManagedWidgetWorldPositions,
  stripFrontmatterAutoManagedWidgetScreenPositions,
} from '@/lib/storyboardWidget/widgetPlacementAuthority'
import { buildCanonicalNodeLookup, canonicalNodeIdSetHas, parseCanonicalNodeIds } from '@/lib/graph/canonicalNodeIds'
import {
  applyLayoutAutosuggestFromMetadata,
  applyWidgetRegistryFromMetadata,
  shouldSkipGraphDataPreviewSync,
  syncGraphFieldsWithGraphData,
  readGraphRagWorkflowJsonTextFromGraphData,
  withGraphDataRevision,
} from '@/hooks/store/graphDataSliceUtils'
import {
  buildDefaultVisibleColumns,
  isGraphDataTablePropertyColumnKey,
  type GraphDataTableColumnKey,
} from '@/features/graph-data-table/graphDataTable'
import { resetComposedPositionWrites } from './graphDataComposedSource'
import { isWorkspaceGraphMutationBlocked } from '@/features/workspace-table/workspaceTableSsot'
import { buildRetainedNodePlacementContinuityAcrossTopologyChange, hasStableSameSourceNodeLayout, hasStableSameSourceTopology } from './graphDataRetainedPlacementContinuity'

function readGraphSourceIdentity(graph: GraphData | null | undefined): string {
  const meta = ((graph || null)?.metadata || {}) as Record<string, unknown>
  const sourceLayerComposition = String(meta.sourceLayerComposition || '').trim()
  if (sourceLayerComposition === 'compose') {
    const composedGraphKey = buildGraphMetaKeyIgnoringPending(graph)
    if (composedGraphKey) return `compose:${composedGraphKey}`
  }
  const kind = String(meta.kind || '').trim()
  const source = String(meta.source || '').trim()
  if (kind && source) return `${kind}:${source}`
  const semanticGraphKey = buildGraphMetaKeyIgnoringPending(graph)
  if (semanticGraphKey) return semanticGraphKey
  return ''
}

function getCanonicalLookupValue<T>(lookup: ReadonlyMap<string, T>, rawId: unknown): T | undefined {
  const candidateIds = parseCanonicalNodeIds(rawId)
  for (let i = 0; i < candidateIds.length; i += 1) {
    const candidateId = String(candidateIds[i] || '').trim()
    if (!candidateId || !lookup.has(candidateId)) continue
    return lookup.get(candidateId)
  }
  return undefined
}

function remapNodeKeyedRecordByCanonicalNodeId<T>(
  graphData: GraphData | null | undefined,
  valueByNodeId: Record<string, T>,
  allowedCanonicalNodeIds?: ReadonlySet<string> | null,
): Record<string, T> {
  const nodes = Array.isArray(graphData?.nodes) ? graphData.nodes : []
  const entries = Object.entries(valueByNodeId || {}).filter(([rawId]) => String(rawId || '').trim().length > 0)
  if (nodes.length === 0 || entries.length === 0) return valueByNodeId
  const lookup = buildCanonicalNodeLookup(entries.map(([rawId, value]) => [rawId, value] as const))
  const next: Record<string, T> = {}
  for (let i = 0; i < nodes.length; i += 1) {
    const rawId = String(nodes[i]?.id || '').trim()
    if (!rawId) continue
    if (allowedCanonicalNodeIds && !canonicalNodeIdSetHas(allowedCanonicalNodeIds, rawId)) continue
    const value = getCanonicalLookupValue(lookup, rawId)
    if (typeof value === 'undefined') continue
    next[rawId] = value
  }
  const prevKeys = Object.keys(valueByNodeId || {})
  const nextKeys = Object.keys(next)
  if (prevKeys.length === nextKeys.length) {
    let unchanged = true
    for (let i = 0; i < nextKeys.length; i += 1) {
      const key = nextKeys[i]
      if (!(key in (valueByNodeId || {})) || valueByNodeId[key] !== next[key]) {
        unchanged = false
        break
      }
    }
    if (unchanged) return valueByNodeId
  }
  return next
}

function isSameFlowWidgetScreenPosByNodeId(
  a: Record<string, { top: number; left: number }>,
  b: Record<string, { top: number; left: number }>,
): boolean {
  const aKeys = Object.keys(a)
  const bKeys = Object.keys(b)
  if (aKeys.length !== bKeys.length) return false
  for (let i = 0; i < aKeys.length; i += 1) {
    const key = aKeys[i]
    if (!Object.prototype.hasOwnProperty.call(b, key)) return false
    const av = a[key]
    const bv = b[key]
    if (!av || !bv) return false
    if (av.top !== bv.top || av.left !== bv.left) return false
  }
  return true
}

function isSameFlowWidgetWorldPosByNodeId(
  a: Record<string, { x: number; y: number }>,
  b: Record<string, { x: number; y: number }>,
): boolean {
  const aKeys = Object.keys(a)
  const bKeys = Object.keys(b)
  if (aKeys.length !== bKeys.length) return false
  for (let i = 0; i < aKeys.length; i += 1) {
    const key = aKeys[i]
    if (!Object.prototype.hasOwnProperty.call(b, key)) return false
    const av = a[key]
    const bv = b[key]
    if (!av || !bv) return false
    if (av.x !== bv.x || av.y !== bv.y) return false
  }
  return true
}

function resolveCommittedFlowWidgetScreenPositions(args: {
  graphData: GraphData
  posByNodeId: Record<string, { top: number; left: number }>
  pinnedByNodeId?: Record<string, boolean>
  preserveStableSameSourceOverlayState: boolean
}): Record<string, { top: number; left: number }> {
  return stripFrontmatterAutoManagedWidgetScreenPositions({
    graphData: args.graphData,
    posByNodeId: args.posByNodeId,
    pinnedByNodeId: args.pinnedByNodeId,
    preserveBalancedCollective: args.preserveStableSameSourceOverlayState,
    preserveStableSameSourceOverlayState: args.preserveStableSameSourceOverlayState,
  })
}

function cloneDesignLayerState(
  value: import('@/features/design/designLayersState').DesignLayerState | undefined,
): import('@/features/design/designLayersState').DesignLayerState {
  return {
    order: Array.isArray(value?.order) ? value!.order.slice() : [],
    hiddenById: value?.hiddenById ? { ...value.hiddenById } : {},
  }
}

export function createGraphDataCommitActions(set: SetGraph, get: GetGraph) {
  return ({
  setGraphData: (graphData: GraphData) => {
    if (graphData === get().graphData) return
    resetComposedPositionWrites()
    const normalized = normalizeGraphData(graphData)
    const nodeIds = new Set<string>((normalized.nodes || []).map(n => n.id))
    const filteredEdges = (normalized.edges || []).filter(e => {
      const src = String(e.source || '')
      const tgt = String(e.target || '')
      if (!src || !tgt) return false
      if (!nodeIds.has(src) || !nodeIds.has(tgt)) return false
      return true
    })
    const nextGraphDataBase = filteredEdges.length === (normalized.edges || []).length ? normalized : { ...normalized, edges: filteredEdges }

    try {
      const current = get().graphData
      if (shouldSkipGraphDataPreviewSync(nextGraphDataBase, current)) return
    } catch {
      void 0
    }

    const currentGraph = get().graphData
    const currentGraphKey = buildGraphMetaKeyIgnoringPending(currentGraph)
    const collapsedKey = buildGraphMetaKeyIgnoringPending(nextGraphDataBase)
    const currentSourceIdentity = readGraphSourceIdentity(currentGraph)
    const nextSourceIdentity = readGraphSourceIdentity(nextGraphDataBase)
    const stableSameSourceTopology = hasStableSameSourceTopology(currentGraph, nextGraphDataBase)
    const retainedPlacementContinuity = currentSourceIdentity && currentSourceIdentity === nextSourceIdentity
      ? buildRetainedNodePlacementContinuityAcrossTopologyChange(currentGraph, nextGraphDataBase)
      : { nodeSetChanged: false, stableCanonicalNodeIds: new Set<string>() }
    const stableRetainedNodeIdsAcrossTopologyChange = retainedPlacementContinuity.stableCanonicalNodeIds
    const hasSameSourceNodeSetChange = retainedPlacementContinuity.nodeSetChanged
    const hasStableSameSourceRetainedPlacement = stableRetainedNodeIdsAcrossTopologyChange.size > 0
    const carryForwardSameSourceUiState =
      !!collapsedKey &&
      !!currentGraphKey &&
      !!currentSourceIdentity &&
      currentSourceIdentity === nextSourceIdentity &&
      collapsedKey !== currentGraphKey &&
      stableSameSourceTopology
    const currentPinnedByNodeId = get().flowWidgetPinnedByNodeId || {}
    const currentPosByNodeId = get().flowWidgetPosByNodeId || {}
    const workspaceGraphMutationBlocked = isWorkspaceGraphMutationBlocked(get())
    const carryForwardBalancedFloatingCollectiveState =
      stableSameSourceTopology &&
      !!currentSourceIdentity &&
      currentSourceIdentity === nextSourceIdentity &&
      shouldPreserveFrontmatterAutoManagedBalancedCollective({
        graphData: currentGraph,
        posByNodeId: currentPosByNodeId,
        pinnedByNodeId: currentPinnedByNodeId,
      })
    const carryForwardSameSourceWidgetOverlayState =
      shouldCarryForwardFlowWidgetOverlayStateOnGraphCommit({
        graphData: nextGraphDataBase,
        carryForwardSameSourceUiState: carryForwardSameSourceUiState || hasStableSameSourceRetainedPlacement,
        stableSameSourceNodeLayout: hasStableSameSourceNodeLayout(currentGraph, nextGraphDataBase)
          || hasStableSameSourceRetainedPlacement,
        preserveBalancedCollective: carryForwardBalancedFloatingCollectiveState,
      })
    const carryForwardSameSourceDesignFrameState = carryForwardSameSourceUiState
    set(s => {
      const nextRevision = (s.graphDataRevision || 0) + 1
      const nextGraphData = withGraphDataRevision(nextGraphDataBase, nextRevision)
      const nextContentRev = (s.graphContentRevision || 0) + 1
      const nextDocRev = (s.docLocationRevision || 0) + 1
      const byKey = (s.collapsedGroupIdsByGraphMetaKey || {}) as Record<string, string[]>
      const collapsedKeyMissing = collapsedKey ? !Object.prototype.hasOwnProperty.call(byKey, collapsedKey) : false
      const nextCollapsed =
        collapsedKey && carryForwardSameSourceUiState && collapsedKeyMissing
          ? (s.collapsedGroupIds || [])
          : collapsedKey ? (byKey[collapsedKey] || []) : (s.collapsedGroupIds || [])
      const designByKey = (s.designLayerStateByGraphMetaKey || {}) as Record<string, import('@/features/design/designLayersState').DesignLayerState>
      const designKeyMissing = collapsedKey ? !Object.prototype.hasOwnProperty.call(designByKey, collapsedKey) : false
      const nextDesignLayerState =
        collapsedKey && carryForwardSameSourceUiState && designKeyMissing
          ? cloneDesignLayerState(s.designLayerState)
          : collapsedKey ? (designByKey[collapsedKey] || { order: [], hiddenById: {} }) : s.designLayerState
      const designFramePosByKey = (s.designFramePosByIdByGraphMetaKey || {}) as Record<string, Record<string, { x: number; y: number }>>
      const designFrameSizeByKey = (s.designFrameSizeByIdByGraphMetaKey || {}) as Record<string, Record<string, { w: number; h: number }>>
      const designFramePosKeyMissing = collapsedKey ? !Object.prototype.hasOwnProperty.call(designFramePosByKey, collapsedKey) : false
      const designFrameSizeKeyMissing = collapsedKey ? !Object.prototype.hasOwnProperty.call(designFrameSizeByKey, collapsedKey) : false
      const nextDesignFramePos =
        collapsedKey && carryForwardSameSourceDesignFrameState && designFramePosKeyMissing
          ? { ...(s.designFramePosById || {}) }
          : collapsedKey ? (designFramePosByKey[collapsedKey] || {}) : s.designFramePosById
      const nextDesignFrameSize =
        collapsedKey && carryForwardSameSourceDesignFrameState && designFrameSizeKeyMissing
          ? { ...(s.designFrameSizeById || {}) }
          : collapsedKey ? (designFrameSizeByKey[collapsedKey] || {}) : s.designFrameSizeById
      const pinnedByKey = (s.flowWidgetPinnedByNodeIdByGraphMetaKey || {}) as Record<string, Record<string, boolean>>
      const posByKey = (s.flowWidgetPosByNodeIdByGraphMetaKey || {}) as Record<string, Record<string, { top: number; left: number }>>
      const worldByKey = (s.flowWidgetWorldPosByNodeIdByGraphMetaKey || {}) as Record<string, Record<string, { x: number; y: number }>>
      const pinnedKeyMissing = collapsedKey ? !Object.prototype.hasOwnProperty.call(pinnedByKey, collapsedKey) : false
      const posKeyMissing = collapsedKey ? !Object.prototype.hasOwnProperty.call(posByKey, collapsedKey) : false
      const worldKeyMissing = collapsedKey ? !Object.prototype.hasOwnProperty.call(worldByKey, collapsedKey) : false
      const nextPinnedRaw =
        collapsedKey && hasSameSourceNodeSetChange
          ? remapNodeKeyedRecordByCanonicalNodeId(
              nextGraphData,
              { ...(s.flowWidgetPinnedByNodeId || {}) },
              stableRetainedNodeIdsAcrossTopologyChange,
            )
          : collapsedKey && carryForwardSameSourceWidgetOverlayState && pinnedKeyMissing
            ? remapNodeKeyedRecordByCanonicalNodeId(nextGraphData, { ...(s.flowWidgetPinnedByNodeId || {}) })
            : collapsedKey ? (pinnedByKey[collapsedKey] || {}) : s.flowWidgetPinnedByNodeId
      const nextPinned = stripFrontmatterAutoManagedWidgetPinnedStates({ graphData: nextGraphData, pinnedByNodeId: nextPinnedRaw || {} })
      const nextPosRaw =
        collapsedKey && hasSameSourceNodeSetChange
          ? remapNodeKeyedRecordByCanonicalNodeId(
              nextGraphData,
              { ...(s.flowWidgetPosByNodeId || {}) },
              stableRetainedNodeIdsAcrossTopologyChange,
            )
          : collapsedKey && carryForwardSameSourceWidgetOverlayState && posKeyMissing
            ? remapNodeKeyedRecordByCanonicalNodeId(nextGraphData, { ...(s.flowWidgetPosByNodeId || {}) })
            : collapsedKey ? (posByKey[collapsedKey] || {}) : s.flowWidgetPosByNodeId
      const nextPos = hasSameSourceNodeSetChange
        ? nextPosRaw || {}
        : resolveCommittedFlowWidgetScreenPositions({
            graphData: nextGraphData,
            posByNodeId: nextPosRaw || {},
            pinnedByNodeId: nextPinned || {},
            preserveStableSameSourceOverlayState: carryForwardSameSourceWidgetOverlayState,
          })
      const nextWorldRaw =
        collapsedKey && hasSameSourceNodeSetChange
          ? remapNodeKeyedRecordByCanonicalNodeId(
              nextGraphData,
              { ...(s.flowWidgetWorldPosByNodeId || {}) },
              stableRetainedNodeIdsAcrossTopologyChange,
            )
          : collapsedKey && carryForwardSameSourceWidgetOverlayState
            ? remapNodeKeyedRecordByCanonicalNodeId(nextGraphData, { ...(s.flowWidgetWorldPosByNodeId || {}) })
            : collapsedKey ? (worldByKey[collapsedKey] || {}) : s.flowWidgetWorldPosByNodeId
      const nextWorld =
        carryForwardSameSourceWidgetOverlayState
          ? nextWorldRaw
          : stripFrontmatterAutoManagedWidgetWorldPositions({
              graphData: nextGraphData,
              worldPosByNodeId: nextWorldRaw || {},
            })
      const nextCollapsedByKey =
        collapsedKey && carryForwardSameSourceUiState && collapsedKeyMissing
          ? { ...byKey, [collapsedKey]: nextCollapsed }
          : byKey
      const nextDesignByKey =
        collapsedKey && carryForwardSameSourceUiState && designKeyMissing
          ? { ...designByKey, [collapsedKey]: cloneDesignLayerState(nextDesignLayerState) }
          : designByKey
      const nextDesignFramePosByKey =
        collapsedKey && carryForwardSameSourceDesignFrameState && designFramePosKeyMissing
          ? { ...designFramePosByKey, [collapsedKey]: nextDesignFramePos }
          : designFramePosByKey
      const nextDesignFrameSizeByKey =
        collapsedKey && carryForwardSameSourceDesignFrameState && designFrameSizeKeyMissing
          ? { ...designFrameSizeByKey, [collapsedKey]: nextDesignFrameSize }
          : designFrameSizeByKey
      const nextPinnedByKey = collapsedKey
        && (hasSameSourceNodeSetChange || (carryForwardSameSourceWidgetOverlayState && pinnedKeyMissing))
          ? { ...pinnedByKey, [collapsedKey]: nextPinned }
          : pinnedByKey
      const nextPosByKey =
        collapsedKey && (posKeyMissing || !isSameFlowWidgetScreenPosByNodeId(posByKey[collapsedKey] || {}, nextPos))
          ? { ...posByKey, [collapsedKey]: nextPos }
          : posByKey
      const nextWorldByKey =
        collapsedKey && (worldKeyMissing || !isSameFlowWidgetWorldPosByNodeId(worldByKey[collapsedKey] || {}, nextWorld || {}))
          ? { ...worldByKey, [collapsedKey]: nextWorld }
          : worldByKey
      return {
        graphData: nextGraphData,
        graphDataRevision: nextRevision,
        graphContentRevision: nextContentRev,
        docLocationRevision: nextDocRev,
        graphValidationStatus: null,
        graphValidationTimestamp: null,
        ...(collapsedKey ? { collapsedGroupIds: nextCollapsed } : {}),
        ...(collapsedKey ? { collapsedGroupIdsByGraphMetaKey: nextCollapsedByKey } : {}),
        ...(collapsedKey ? { designLayerState: nextDesignLayerState } : {}),
        ...(collapsedKey ? { designLayerStateByGraphMetaKey: nextDesignByKey } : {}),
        ...(collapsedKey ? { designFramePosById: nextDesignFramePos } : {}),
        ...(collapsedKey ? { designFramePosByIdByGraphMetaKey: nextDesignFramePosByKey } : {}),
        ...(collapsedKey ? { designFrameSizeById: nextDesignFrameSize } : {}),
        ...(collapsedKey ? { designFrameSizeByIdByGraphMetaKey: nextDesignFrameSizeByKey } : {}),
        ...(!workspaceGraphMutationBlocked && collapsedKey ? { flowWidgetPinnedByNodeId: nextPinned } : {}),
        ...(!workspaceGraphMutationBlocked && collapsedKey ? { flowWidgetPinnedByNodeIdByGraphMetaKey: nextPinnedByKey } : {}),
        ...(!workspaceGraphMutationBlocked && collapsedKey ? { flowWidgetPosByNodeId: nextPos } : {}),
        ...(!workspaceGraphMutationBlocked && collapsedKey ? { flowWidgetPosByNodeIdByGraphMetaKey: nextPosByKey } : {}),
        ...(!workspaceGraphMutationBlocked && collapsedKey ? { flowWidgetWorldPosByNodeId: nextWorld } : {}),
        ...(!workspaceGraphMutationBlocked && collapsedKey ? { flowWidgetWorldPosByNodeIdByGraphMetaKey: nextWorldByKey } : {}),
      }
    })
    const stateNow = get()
    const nextGraphData = stateNow.graphData as GraphData

    try {
      applyLayoutAutosuggestFromMetadata(get, nextGraphData.metadata)
    } catch {
      void 0
    }
    try {
      applyWidgetRegistryFromMetadata(get, nextGraphData.metadata, nextGraphData)
    } catch {
      void 0
    }

    try {
      const nextWorkflowText = readGraphRagWorkflowJsonTextFromGraphData(nextGraphData)
      const currentWorkflowText = get().graphRagWorkflowJsonText
      if (nextWorkflowText !== currentWorkflowText) {
        set({ graphRagWorkflowJsonText: nextWorkflowText })
      }
    } catch { void 0 }
    try {
      const { selectedNodeId, selectedEdgeId, selectedNodeIds, selectedEdgeIds } = get()
      const edgeIds = new Set<string>((nextGraphData.edges || []).map(e => e.id))
      const nextSelectedNodeId = selectedNodeId && nodeIds.has(selectedNodeId) ? selectedNodeId : null
      const nextSelectedEdgeId = selectedEdgeId && edgeIds.has(selectedEdgeId) ? selectedEdgeId : null
      const nextSelectedNodeIds = (selectedNodeIds || []).filter(id => nodeIds.has(id))
      const nextSelectedEdgeIds = (selectedEdgeIds || []).filter(id => edgeIds.has(id))
      if (
        nextSelectedNodeId !== selectedNodeId ||
        nextSelectedEdgeId !== selectedEdgeId ||
        nextSelectedNodeIds.length !== (selectedNodeIds || []).length ||
        nextSelectedEdgeIds.length !== (selectedEdgeIds || []).length
      ) {
        set({
          selectedNodeId: nextSelectedNodeId,
          selectedEdgeId: nextSelectedEdgeId,
          selectedNodeIds: nextSelectedNodeIds,
          selectedEdgeIds: nextSelectedEdgeIds,
        })
      }
    } catch { void 0 }
    try {
      get().setOpenWidgetNodeIds(get().openWidgetNodeIds || [])
    } catch { void 0 }
    set({ lifecycleStage: 'committed' });
    set({ aiKgTraversalRan: false });
    set({ minimapPreview: { nodesPath: '', edgesPath: '', sx: 1, bounds: { minX: 0, maxX: 0, minY: 0, maxY: 0, width: 1, height: 1 } }, minimapAbortController: null });
    get().cancelMinimapWorker?.();
    get().scheduleHistory('Set Data');

    try {
      syncGraphFieldsWithGraphData(get, nextGraphData, { resetVisibleColumns: true })
    } catch {
      void 0
    }

    const runHeavyGraphDataSideEffects = () => {
      const quick = get().computeMinimapPreviewQuick
      if (typeof quick === 'function') quick()
      const async = get().computeMinimapPreviewAsync
      if (typeof async === 'function') async()

      persistGraphDataToLocalStorage(get().graphData)

      try {
        const mode = get().schema.layout?.mode
        if (mode === 'radial') {
          const curRenderer = get().canvas2dRenderer
          if (curRenderer !== 'd3' && curRenderer !== 'flowchart' && !isStoryboardCanvas2dRenderer(curRenderer)) {
            const setCanvas2dRenderer = get().setCanvas2dRenderer
            if (typeof setCanvas2dRenderer === 'function') setCanvas2dRenderer('d3')
          }
        }
      } catch {
        void 0
      }
    }

    if (typeof setTimeout === 'function') {
      setTimeout(runHeavyGraphDataSideEffects, 0)
    } else {
      runHeavyGraphDataSideEffects()
    }
  },

  setGraphDataPreservingLayout: (graphData: GraphData) => {
    if (graphData === get().graphData) return
    const normalized = normalizeGraphData(graphData)
    const nodeIds = new Set<string>((normalized.nodes || []).map(n => n.id))
    const filteredEdges = (normalized.edges || []).filter(e => {
      const src = String(e.source || '')
      const tgt = String(e.target || '')
      if (!src || !tgt) return false
      if (!nodeIds.has(src) || !nodeIds.has(tgt)) return false
      return true
    })
    const nextGraphData =
      filteredEdges.length === (normalized.edges || []).length ? normalized : { ...normalized, edges: filteredEdges }

    try {
      const current = get().graphData
      if (shouldSkipGraphDataPreviewSync(nextGraphData, current)) return
    } catch {
      void 0
    }

    const currentGraph = get().graphData
    const currentGraphKey = buildGraphMetaKeyIgnoringPending(currentGraph)
    const collapsedKey = buildGraphMetaKeyIgnoringPending(nextGraphData)
    const currentSourceIdentity = readGraphSourceIdentity(currentGraph)
    const nextSourceIdentity = readGraphSourceIdentity(nextGraphData)
    const stableSameSourceTopology = hasStableSameSourceTopology(currentGraph, nextGraphData)
    const retainedPlacementContinuity = currentSourceIdentity && currentSourceIdentity === nextSourceIdentity
      ? buildRetainedNodePlacementContinuityAcrossTopologyChange(currentGraph, nextGraphData)
      : { nodeSetChanged: false, stableCanonicalNodeIds: new Set<string>() }
    const stableRetainedNodeIdsAcrossTopologyChange = retainedPlacementContinuity.stableCanonicalNodeIds
    const hasSameSourceNodeSetChange = retainedPlacementContinuity.nodeSetChanged
    const hasStableSameSourceRetainedPlacement = stableRetainedNodeIdsAcrossTopologyChange.size > 0
    const carryForwardSameSourceUiState =
      !!collapsedKey &&
      !!currentGraphKey &&
      !!currentSourceIdentity &&
      currentSourceIdentity === nextSourceIdentity &&
      collapsedKey !== currentGraphKey &&
      stableSameSourceTopology
    const currentPinnedByNodeId = get().flowWidgetPinnedByNodeId || {}
    const currentPosByNodeId = get().flowWidgetPosByNodeId || {}
    const workspaceGraphMutationBlocked = isWorkspaceGraphMutationBlocked(get())
    const carryForwardBalancedFloatingCollectiveState =
      stableSameSourceTopology &&
      !!currentSourceIdentity &&
      currentSourceIdentity === nextSourceIdentity &&
      shouldPreserveFrontmatterAutoManagedBalancedCollective({
        graphData: currentGraph,
        posByNodeId: currentPosByNodeId,
        pinnedByNodeId: currentPinnedByNodeId,
      })
    const carryForwardSameSourceWidgetOverlayState =
      shouldCarryForwardFlowWidgetOverlayStateOnGraphCommit({
        graphData: nextGraphData,
        carryForwardSameSourceUiState: carryForwardSameSourceUiState || hasStableSameSourceRetainedPlacement,
        stableSameSourceNodeLayout: hasStableSameSourceNodeLayout(currentGraph, nextGraphData)
          || hasStableSameSourceRetainedPlacement,
        preserveBalancedCollective: carryForwardBalancedFloatingCollectiveState,
      })
    const carryForwardSameSourceDesignFrameState = carryForwardSameSourceUiState
    set(s => {
      const nextRevision = (s.graphDataRevision || 0) + 1
      const byKey = (s.collapsedGroupIdsByGraphMetaKey || {}) as Record<string, string[]>
      const collapsedKeyMissing = collapsedKey ? !Object.prototype.hasOwnProperty.call(byKey, collapsedKey) : false
      const nextCollapsed =
        collapsedKey && carryForwardSameSourceUiState && collapsedKeyMissing
          ? (s.collapsedGroupIds || [])
          : collapsedKey ? (byKey[collapsedKey] || []) : (s.collapsedGroupIds || [])
      const designByKey = (s.designLayerStateByGraphMetaKey || {}) as Record<string, import('@/features/design/designLayersState').DesignLayerState>
      const designKeyMissing = collapsedKey ? !Object.prototype.hasOwnProperty.call(designByKey, collapsedKey) : false
      const nextDesignLayerState =
        collapsedKey && carryForwardSameSourceUiState && designKeyMissing
          ? cloneDesignLayerState(s.designLayerState)
          : collapsedKey ? (designByKey[collapsedKey] || { order: [], hiddenById: {} }) : s.designLayerState
      const designFramePosByKey = (s.designFramePosByIdByGraphMetaKey || {}) as Record<string, Record<string, { x: number; y: number }>>
      const designFrameSizeByKey = (s.designFrameSizeByIdByGraphMetaKey || {}) as Record<string, Record<string, { w: number; h: number }>>
      const designFramePosKeyMissing = collapsedKey ? !Object.prototype.hasOwnProperty.call(designFramePosByKey, collapsedKey) : false
      const designFrameSizeKeyMissing = collapsedKey ? !Object.prototype.hasOwnProperty.call(designFrameSizeByKey, collapsedKey) : false
      const nextDesignFramePos =
        collapsedKey && carryForwardSameSourceDesignFrameState && designFramePosKeyMissing
          ? { ...(s.designFramePosById || {}) }
          : collapsedKey ? (designFramePosByKey[collapsedKey] || {}) : s.designFramePosById
      const nextDesignFrameSize =
        collapsedKey && carryForwardSameSourceDesignFrameState && designFrameSizeKeyMissing
          ? { ...(s.designFrameSizeById || {}) }
          : collapsedKey ? (designFrameSizeByKey[collapsedKey] || {}) : s.designFrameSizeById
      const pinnedByKey = (s.flowWidgetPinnedByNodeIdByGraphMetaKey || {}) as Record<string, Record<string, boolean>>
      const posByKey = (s.flowWidgetPosByNodeIdByGraphMetaKey || {}) as Record<string, Record<string, { top: number; left: number }>>
      const worldByKey = (s.flowWidgetWorldPosByNodeIdByGraphMetaKey || {}) as Record<string, Record<string, { x: number; y: number }>>
      const pinnedKeyMissing = collapsedKey ? !Object.prototype.hasOwnProperty.call(pinnedByKey, collapsedKey) : false
      const posKeyMissing = collapsedKey ? !Object.prototype.hasOwnProperty.call(posByKey, collapsedKey) : false
      const worldKeyMissing = collapsedKey ? !Object.prototype.hasOwnProperty.call(worldByKey, collapsedKey) : false
      const nextPinnedRaw =
        collapsedKey && hasSameSourceNodeSetChange
          ? remapNodeKeyedRecordByCanonicalNodeId(
              nextGraphData,
              { ...(s.flowWidgetPinnedByNodeId || {}) },
              stableRetainedNodeIdsAcrossTopologyChange,
            )
          : collapsedKey && carryForwardSameSourceWidgetOverlayState && pinnedKeyMissing
            ? { ...(s.flowWidgetPinnedByNodeId || {}) }
            : collapsedKey ? (pinnedByKey[collapsedKey] || {}) : s.flowWidgetPinnedByNodeId
      const nextPinned = stripFrontmatterAutoManagedWidgetPinnedStates({ graphData: nextGraphData, pinnedByNodeId: nextPinnedRaw || {} })
      const nextPosRaw =
        collapsedKey && hasSameSourceNodeSetChange
          ? remapNodeKeyedRecordByCanonicalNodeId(
              nextGraphData,
              { ...(s.flowWidgetPosByNodeId || {}) },
              stableRetainedNodeIdsAcrossTopologyChange,
            )
          : collapsedKey && carryForwardSameSourceWidgetOverlayState && posKeyMissing
            ? { ...(s.flowWidgetPosByNodeId || {}) }
            : collapsedKey ? (posByKey[collapsedKey] || {}) : s.flowWidgetPosByNodeId
      const nextPos = hasSameSourceNodeSetChange
        ? nextPosRaw || {}
        : resolveCommittedFlowWidgetScreenPositions({
            graphData: nextGraphData,
            posByNodeId: nextPosRaw || {},
            pinnedByNodeId: nextPinned || {},
            preserveStableSameSourceOverlayState: carryForwardSameSourceWidgetOverlayState,
          })
      const nextWorldRaw =
        collapsedKey && hasSameSourceNodeSetChange
          ? remapNodeKeyedRecordByCanonicalNodeId(
              nextGraphData,
              { ...(s.flowWidgetWorldPosByNodeId || {}) },
              stableRetainedNodeIdsAcrossTopologyChange,
            )
          : collapsedKey && carryForwardSameSourceWidgetOverlayState
            ? remapNodeKeyedRecordByCanonicalNodeId(nextGraphData, { ...(s.flowWidgetWorldPosByNodeId || {}) })
            : collapsedKey ? (worldByKey[collapsedKey] || {}) : s.flowWidgetWorldPosByNodeId
      const nextWorld =
        carryForwardSameSourceWidgetOverlayState
          ? nextWorldRaw
          : stripFrontmatterAutoManagedWidgetWorldPositions({
              graphData: nextGraphData,
              worldPosByNodeId: nextWorldRaw || {},
            })
      const nextCollapsedByKey =
        collapsedKey && carryForwardSameSourceUiState && collapsedKeyMissing
          ? { ...byKey, [collapsedKey]: nextCollapsed }
          : byKey
      const nextDesignByKey =
        collapsedKey && carryForwardSameSourceUiState && designKeyMissing
          ? { ...designByKey, [collapsedKey]: cloneDesignLayerState(nextDesignLayerState) }
          : designByKey
      const nextDesignFramePosByKey =
        collapsedKey && carryForwardSameSourceDesignFrameState && designFramePosKeyMissing
          ? { ...designFramePosByKey, [collapsedKey]: nextDesignFramePos }
          : designFramePosByKey
      const nextDesignFrameSizeByKey =
        collapsedKey && carryForwardSameSourceDesignFrameState && designFrameSizeKeyMissing
          ? { ...designFrameSizeByKey, [collapsedKey]: nextDesignFrameSize }
          : designFrameSizeByKey
      const nextPinnedByKey = collapsedKey
        && (hasSameSourceNodeSetChange || (carryForwardSameSourceWidgetOverlayState && pinnedKeyMissing))
          ? { ...pinnedByKey, [collapsedKey]: nextPinned }
          : pinnedByKey
      const nextPosByKey =
        collapsedKey && (posKeyMissing || !isSameFlowWidgetScreenPosByNodeId(posByKey[collapsedKey] || {}, nextPos))
          ? { ...posByKey, [collapsedKey]: nextPos }
          : posByKey
      const nextWorldByKey =
        collapsedKey && (worldKeyMissing || !isSameFlowWidgetWorldPosByNodeId(worldByKey[collapsedKey] || {}, nextWorld || {}))
          ? { ...worldByKey, [collapsedKey]: nextWorld }
          : worldByKey
      return {
        graphData: withGraphDataRevision(nextGraphData, nextRevision),
        graphDataRevision: nextRevision,
        graphValidationStatus: null,
        graphValidationTimestamp: null,
        ...(collapsedKey ? { collapsedGroupIds: nextCollapsed } : {}),
        ...(collapsedKey ? { collapsedGroupIdsByGraphMetaKey: nextCollapsedByKey } : {}),
        ...(collapsedKey ? { designLayerState: nextDesignLayerState } : {}),
        ...(collapsedKey ? { designLayerStateByGraphMetaKey: nextDesignByKey } : {}),
        ...(collapsedKey ? { designFramePosById: nextDesignFramePos } : {}),
        ...(collapsedKey ? { designFramePosByIdByGraphMetaKey: nextDesignFramePosByKey } : {}),
        ...(collapsedKey ? { designFrameSizeById: nextDesignFrameSize } : {}),
        ...(collapsedKey ? { designFrameSizeByIdByGraphMetaKey: nextDesignFrameSizeByKey } : {}),
        ...(!workspaceGraphMutationBlocked && collapsedKey ? { flowWidgetPinnedByNodeId: nextPinned } : {}),
        ...(!workspaceGraphMutationBlocked && collapsedKey ? { flowWidgetPinnedByNodeIdByGraphMetaKey: nextPinnedByKey } : {}),
        ...(!workspaceGraphMutationBlocked && collapsedKey ? { flowWidgetPosByNodeId: nextPos } : {}),
        ...(!workspaceGraphMutationBlocked && collapsedKey ? { flowWidgetPosByNodeIdByGraphMetaKey: nextPosByKey } : {}),
        ...(!workspaceGraphMutationBlocked && collapsedKey ? { flowWidgetWorldPosByNodeId: nextWorld } : {}),
        ...(!workspaceGraphMutationBlocked && collapsedKey ? { flowWidgetWorldPosByNodeIdByGraphMetaKey: nextWorldByKey } : {}),
      }
    })
    const stateNow = get()
    const committed = stateNow.graphData as GraphData

    try {
      const { selectedNodeId, selectedEdgeId, selectedNodeIds, selectedEdgeIds } = get()
      const edgeIds = new Set<string>((nextGraphData.edges || []).map(e => e.id))
      const nextSelectedNodeId = selectedNodeId && nodeIds.has(selectedNodeId) ? selectedNodeId : null
      const nextSelectedEdgeId = selectedEdgeId && edgeIds.has(selectedEdgeId) ? selectedEdgeId : null
      const nextSelectedNodeIds = (selectedNodeIds || []).filter(id => nodeIds.has(id))
      const nextSelectedEdgeIds = (selectedEdgeIds || []).filter(id => edgeIds.has(id))
      if (
        nextSelectedNodeId !== selectedNodeId ||
        nextSelectedEdgeId !== selectedEdgeId ||
        nextSelectedNodeIds.length !== (selectedNodeIds || []).length ||
        nextSelectedEdgeIds.length !== (selectedEdgeIds || []).length
      ) {
        set({
          selectedNodeId: nextSelectedNodeId,
          selectedEdgeId: nextSelectedEdgeId,
          selectedNodeIds: nextSelectedNodeIds,
          selectedEdgeIds: nextSelectedEdgeIds,
        })
      }
    } catch {
      void 0
    }
    try {
      get().setOpenWidgetNodeIds(get().openWidgetNodeIds || [])
    } catch { void 0 }

    try {
      const nextWorkflowText = readGraphRagWorkflowJsonTextFromGraphData(committed)
      const currentWorkflowText = get().graphRagWorkflowJsonText
      if (nextWorkflowText !== currentWorkflowText) {
        set({ graphRagWorkflowJsonText: nextWorkflowText })
      }
    } catch { void 0 }
    try {
      syncGraphFieldsWithGraphData(get, committed)
    } catch { void 0 }
    try {
      applyLayoutAutosuggestFromMetadata(get, committed.metadata)
    } catch { void 0 }
    try {
      applyWidgetRegistryFromMetadata(get, committed.metadata, committed)
    } catch { void 0 }

    set({ lifecycleStage: 'committed' })
    try {
      persistGraphDataToLocalStorage(get().graphData)
    } catch {
      void 0
    }
  },

  clearGraphData: () => {
    resetComposedPositionWrites()
    get().cancelMinimapWorker?.();
    set(s => ({
      graphData: null,
      graphDataRevision: (s.graphDataRevision || 0) + 1,
      graphContentRevision: (s.graphContentRevision || 0) + 1,
      docLocationRevision: (s.docLocationRevision || 0) + 1,
      selectedNodeId: null,
      selectedEdgeId: null,
      selectedNodeIds: [],
      selectedEdgeIds: [],
      openWidgetNodeIds: [],
      aiKgTraversalRan: false,
      layoutPositionCacheByMode: {},
      minimapPreview: { nodesPath: '', edgesPath: '', sx: 1, bounds: { minX: 0, maxX: 0, minY: 0, maxY: 0, width: 1, height: 1 } },
      graphValidationStatus: null,
      graphValidationTimestamp: null,
    }));
    set({ graphRagWorkflowJsonText: null })
    set({ lifecycleStage: 'reset' });
    lsRemove(LS_KEYS.graphData)

    try {
      const currentOrder = get().graphDataTableColumnOrder || []
      const nextOrder = currentOrder.filter(k => !isGraphDataTablePropertyColumnKey(k))
      get().setGraphDataTableColumnOrder(nextOrder as GraphDataTableColumnKey[])

      get().setGraphDataTableVisibleColumns(buildDefaultVisibleColumns())

      get().setGraphFieldSettingsById({})
      set({ selectedGraphFieldId: null })
    } catch { void 0 }
  },
  })
}
