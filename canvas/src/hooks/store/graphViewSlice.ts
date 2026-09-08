import type { GraphState } from '@/hooks/store/types'
import type { StoreApi } from 'zustand'
import type { Canvas2dRendererId } from '@/lib/config.render'
import { buildGraphDocumentMetaKey, buildGraphMetaKeyIgnoringPending } from '@/lib/graph/graphMetaKey'
import { hashStringToHex } from '@/lib/hash/stringHash'
import { createFlowWidgetPersistence } from './graphViewWidgetPersistence'
import { reconcileWidgetDocumentPlacement } from './graph-data-slice/graphDataWidgetStateCommit'
import { compareWidgetLayoutEvidence } from './graph-data-slice/graphDataRetainedPlacementContinuity'
import {
  isWorkspaceGraphMutationBlocked,
} from '@/features/workspace-table/workspaceTableSsot'
import { normalizeIds, normalizeOpenWidgetNodeIds } from '@/hooks/store/graphViewIds'
import {
  normalizePinnedByNodeId,
  normalizePosByNodeId,
  normalizeWorldByNodeId,
} from '@/hooks/store/graphViewPinnedSemanticsMigration'

type SetGraph = StoreApi<GraphState>['setState']
type GetGraph = StoreApi<GraphState>['getState']

export { applyGraphViewPinnedSemanticsMigration, planGraphViewPinnedSemanticsMigration } from '@/hooks/store/graphViewPinnedSemanticsMigration'

const isSamePinnedByNodeId = (a: Record<string, boolean>, b: Record<string, boolean>): boolean => {
  const aKeys = Object.keys(a)
  const bKeys = Object.keys(b)
  if (aKeys.length !== bKeys.length) return false
  for (let i = 0; i < aKeys.length; i += 1) {
    const key = aKeys[i]
    if (!Object.prototype.hasOwnProperty.call(b, key)) return false
    if (!!a[key] !== !!b[key]) return false
  }
  return true
}

const isSamePosByNodeId = (
  a: Record<string, { top: number; left: number }>,
  b: Record<string, { top: number; left: number }>,
): boolean => {
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

const isSameWorldByNodeId = (
  a: Record<string, { x: number; y: number }>,
  b: Record<string, { x: number; y: number }>,
): boolean => {
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

export const createGraphViewSlice = (set: SetGraph, get: GetGraph) => {
  const report = (graphKey: string, message: string) => get().upsertUiToast?.({
    id: `widget-placement:${hashStringToHex(graphKey)}`, kind: 'warning', message,
  })
  const persistence = createFlowWidgetPersistence({ report })
  let activeStorage: Storage | null | undefined
  const withheldDocuments = new Set<string>()
  const observeStorageOwner = () => {
    const storage = persistence.storage()
    if (storage === activeStorage) return
    activeStorage = storage
    withheldDocuments.clear()
    set({ flowWidgetPinnedByNodeId: {}, flowWidgetPosByNodeId: {}, flowWidgetWorldPosByNodeId: {},
      flowWidgetPinnedByNodeIdByGraphMetaKey: {}, flowWidgetPosByNodeIdByGraphMetaKey: {},
      flowWidgetWorldPosByNodeIdByGraphMetaKey: {}, flowWidgetLayoutEvidenceByGraphMetaKey: {} })
  }
  return {
  flowWidgetLayoutEvidenceByGraphMetaKey: {},
  loadFlowWidgetDocument: (graphKey: string) => {
    if (!graphKey) return
    observeStorageOwner()
    if (Object.prototype.hasOwnProperty.call(get().flowWidgetLayoutEvidenceByGraphMetaKey || {}, graphKey)) return
    const read = persistence.readResult(graphKey)
    if (read.status === 'withheld') withheldDocuments.add(graphKey)
    const saved = read.snapshot
    const state = get()
    set({
      flowWidgetLayoutEvidenceByGraphMetaKey: { ...state.flowWidgetLayoutEvidenceByGraphMetaKey, [graphKey]: saved?.layout || null },
      flowWidgetPinnedByNodeIdByGraphMetaKey: { ...state.flowWidgetPinnedByNodeIdByGraphMetaKey, [graphKey]: saved?.pinned || {} },
      flowWidgetPosByNodeIdByGraphMetaKey: { ...state.flowWidgetPosByNodeIdByGraphMetaKey, [graphKey]: saved?.pos || {} },
      flowWidgetWorldPosByNodeIdByGraphMetaKey: { ...state.flowWidgetWorldPosByNodeIdByGraphMetaKey, [graphKey]: saved?.world || {} },
    })
  },
  persistFlowWidgetDocument: (graphKey: string, channel: 'commit' | 'pinned' | 'pos' | 'world' = 'commit') => {
    if (!graphKey) return
    const state = get()
    const graph = state.graphData
    const sameDocument = graph && buildGraphDocumentMetaKey(graph) === graphKey
    if (channel === 'commit' && (!sameDocument || graph.metadata?.pending === true || withheldDocuments.has(graphKey))) return
    const read = persistence.readResult(graphKey)
    if (read.status === 'withheld') {
      report(graphKey, 'Widget placement could not be saved because its previous saved state could not be verified. The original saved data is retained.')
      return
    }
    const durable = read.snapshot
    const evidence = state.flowWidgetLayoutEvidenceByGraphMetaKey[graphKey]
    const unchangedLayout = evidence && durable && compareWidgetLayoutEvidence(evidence, durable.layout).stableLayout
    const baseline = channel !== 'commit' && unchangedLayout ? durable
      : sameDocument && graph.metadata?.pending !== true ? reconcileWidgetDocumentPlacement(graph, durable) : durable
    if (!baseline) {
      report(graphKey, 'Widget placement could not be saved because its source layout could not be verified. The original saved data is retained.')
      return
    }
    // A persisted channel never captures another channel's temporary render state.
    const snapshot = { ...baseline, version: 1 as const, documentKey: graphKey,
      ...(channel === 'pinned' ? { pinned: state.flowWidgetPinnedByNodeIdByGraphMetaKey[graphKey] || {} } : {}),
      ...(channel === 'pos' ? { pos: state.flowWidgetPosByNodeIdByGraphMetaKey[graphKey] || {} } : {}),
      ...(channel === 'world' ? { world: state.flowWidgetWorldPosByNodeIdByGraphMetaKey[graphKey] || {} } : {}),
    }
    if (!evidence && sameDocument && graph.metadata?.pending !== true) {
      set({ flowWidgetLayoutEvidenceByGraphMetaKey: { ...get().flowWidgetLayoutEvidenceByGraphMetaKey, [graphKey]: baseline.layout } })
    }
    if (persistence.enqueue(snapshot)) withheldDocuments.delete(graphKey)
  },
  resetFlowWidgetPersistence: () => { persistence.reset(); activeStorage = undefined; withheldDocuments.clear() },
  collapsedGroupIds: [] as string[],
  collapsedGroupIdsByGraphMetaKey: {} as Record<string, string[]>,
  setCollapsedGroupIds: (ids: string[]) => {
    const next = normalizeIds(Array.isArray(ids) ? ids : [])
    const prev = get().collapsedGroupIds || []
    const graphKey = buildGraphMetaKeyIgnoringPending(get().graphData)
    const by = get().collapsedGroupIdsByGraphMetaKey || {}
    const prevForGraph = graphKey ? (by[graphKey] || []) : prev
    const sameGlobal = prev.length === next.length && prev.every((v, i) => v === next[i])
    const sameForGraph = prevForGraph.length === next.length && prevForGraph.every((v, i) => v === next[i])
    if (sameGlobal && sameForGraph) return
    const nextBy = graphKey ? { ...by, [graphKey]: next } : by
    set({ collapsedGroupIds: next, collapsedGroupIdsByGraphMetaKey: nextBy })
  },
  clearCollapsedGroups: () => {
    const prev = get().collapsedGroupIds || []
    if (prev.length === 0) return
    const graphKey = buildGraphMetaKeyIgnoringPending(get().graphData)
    const by = get().collapsedGroupIdsByGraphMetaKey || {}
    const prevForGraph = graphKey ? (by[graphKey] || []) : prev
    if (prevForGraph.length === 0) return
    const nextBy = graphKey ? { ...by, [graphKey]: [] } : by
    set({ collapsedGroupIds: [], collapsedGroupIdsByGraphMetaKey: nextBy })
  },
  toggleGroupCollapsed: (rawId: string) => {
    const id = String(rawId || '').trim()
    if (!id) return
    set(state => {
      const prev = state.collapsedGroupIds || []
      const exists = prev.includes(id)
      const next = exists ? prev.filter(x => x !== id) : [...prev, id]
      const normalized = normalizeIds(next)
      const graphKey = buildGraphMetaKeyIgnoringPending((state as unknown as { graphData?: unknown }).graphData as GraphState['graphData'])
      const by = (state as unknown as { collapsedGroupIdsByGraphMetaKey?: unknown }).collapsedGroupIdsByGraphMetaKey as Record<string, string[]> | undefined
      const nextBy = graphKey ? { ...(by || {}), [graphKey]: normalized } : (by || {})
      return { collapsedGroupIds: normalized, collapsedGroupIdsByGraphMetaKey: nextBy }
    })
  },
  openWidgetNodeIds: [] as string[],
  openWidgetNodeIdsByRenderer: {} as Partial<Record<Canvas2dRendererId, string[]>>,
  setOpenWidgetNodeIds: (ids: string[]) => {
    const next = normalizeOpenWidgetNodeIds(ids, get().graphData)
    const prev = get().openWidgetNodeIds || []
    const renderer = get().canvas2dRenderer
    const by = get().openWidgetNodeIdsByRenderer || {}
    const prevForRenderer = (renderer && by[renderer]) || []
    const sameGlobal = prev.length === next.length && prev.every((v, i) => v === next[i])
    const sameForRenderer =
      prevForRenderer.length === next.length && prevForRenderer.every((v, i) => v === next[i])
    if (sameGlobal && sameForRenderer) return
    const nextBy = renderer ? { ...by, [renderer]: next } : by
    set({ openWidgetNodeIds: next, openWidgetNodeIdsByRenderer: nextBy })
  },
  updateOpenWidgetNodeIds: (updater: (prev: string[]) => string[]) => {
    const prev = get().openWidgetNodeIds || []
    const next = normalizeOpenWidgetNodeIds(updater([...prev]), get().graphData)
    const renderer = get().canvas2dRenderer
    const by = get().openWidgetNodeIdsByRenderer || {}
    const prevForRenderer = (renderer && by[renderer]) || []
    const sameGlobal = prev.length === next.length && prev.every((v, i) => v === next[i])
    const sameForRenderer =
      prevForRenderer.length === next.length && prevForRenderer.every((v, i) => v === next[i])
    if (sameGlobal && sameForRenderer) return
    const nextBy = renderer ? { ...by, [renderer]: next } : by
    set({ openWidgetNodeIds: next, openWidgetNodeIdsByRenderer: nextBy })
  },
  flowWidgetPinnedByNodeId: {} as Record<string, boolean>,
  flowWidgetPinnedByNodeIdByGraphMetaKey: {} as Record<string, Record<string, boolean>>,
  setFlowWidgetPinnedByNodeId: (pinnedById: Record<string, boolean>) => {
    let state = get()
    if (isWorkspaceGraphMutationBlocked(state)) return
    const nextPinnedById = normalizePinnedByNodeId(pinnedById)
    const graphKey = buildGraphDocumentMetaKey(state.graphData)
    get().loadFlowWidgetDocument(graphKey)
    state = get()
    const by = state.flowWidgetPinnedByNodeIdByGraphMetaKey || {}
    const prevPinnedById = state.flowWidgetPinnedByNodeId || {}
    const prevGraphPinnedById = graphKey ? (by[graphKey] || {}) : prevPinnedById
    const sameGlobal = isSamePinnedByNodeId(prevPinnedById, nextPinnedById)
    const sameForGraph = isSamePinnedByNodeId(prevGraphPinnedById, nextPinnedById)
    if (sameGlobal && sameForGraph) { get().persistFlowWidgetDocument(graphKey, 'pinned'); return }
    const nextBy = graphKey ? { ...by, [graphKey]: nextPinnedById } : by
    if (graphKey) {
      set({
        flowWidgetPinnedByNodeId: nextPinnedById,
        flowWidgetPinnedByNodeIdByGraphMetaKey: nextBy,
      })
      get().persistFlowWidgetDocument(graphKey, 'pinned')
      return
    }
    set({ flowWidgetPinnedByNodeId: nextPinnedById })
  },
  setFlowWidgetPinnedByNodeIdForGraph: (graphMetaKey: string | null | undefined, pinnedById: Record<string, boolean>) => {
    let state = get()
    const nextPinnedById = normalizePinnedByNodeId(pinnedById)
    const graphKey = String(graphMetaKey || '').trim() || buildGraphDocumentMetaKey(state.graphData)
    get().loadFlowWidgetDocument(graphKey)
    state = get()
    const by = state.flowWidgetPinnedByNodeIdByGraphMetaKey || {}
    const prevPinnedById = state.flowWidgetPinnedByNodeId || {}
    const prevGraphPinnedById = graphKey ? (by[graphKey] || {}) : prevPinnedById
    const sameGlobal = isSamePinnedByNodeId(prevPinnedById, nextPinnedById)
    const sameForGraph = isSamePinnedByNodeId(prevGraphPinnedById, nextPinnedById)
    if (sameGlobal && sameForGraph) { get().persistFlowWidgetDocument(graphKey, 'pinned'); return }
    if (!graphKey) {
      set({ flowWidgetPinnedByNodeId: nextPinnedById })
      return
    }
    const nextBy = { ...by, [graphKey]: nextPinnedById }
    set({
      flowWidgetPinnedByNodeId: nextPinnedById,
      flowWidgetPinnedByNodeIdByGraphMetaKey: nextBy,
    })
    get().persistFlowWidgetDocument(graphKey, 'pinned')
  },
  flowWidgetPosByNodeIdByGraphMetaKey: {} as Record<string, Record<string, { top: number; left: number }>>,
  flowWidgetPosByNodeId: {} as Record<string, { top: number; left: number }>,
  setFlowWidgetPosByNodeId: (
    pos: Record<string, { top: number; left: number }>,
    options?: { allowDuringWorkspaceMutation?: boolean; persist?: boolean },
  ) => {
    let state = get()
    if (isWorkspaceGraphMutationBlocked(state) && options?.allowDuringWorkspaceMutation !== true) return
    const nextPosByNodeId = normalizePosByNodeId(pos)
    const graphKey = buildGraphDocumentMetaKey(state.graphData)
    get().loadFlowWidgetDocument(graphKey)
    state = get()
    const by = state.flowWidgetPosByNodeIdByGraphMetaKey || {}
    const prevPosByNodeId = state.flowWidgetPosByNodeId || {}
    const prevGraphPosByNodeId = graphKey ? (by[graphKey] || {}) : prevPosByNodeId
    const sameGlobal = isSamePosByNodeId(prevPosByNodeId, nextPosByNodeId)
    const sameForGraph = isSamePosByNodeId(prevGraphPosByNodeId, nextPosByNodeId)
    if (sameGlobal && sameForGraph) { if (options?.persist !== false) get().persistFlowWidgetDocument(graphKey, 'pos'); return }
    const nextBy = graphKey ? { ...by, [graphKey]: nextPosByNodeId } : by
    if (graphKey) {
      set({
        flowWidgetPosByNodeId: nextPosByNodeId,
        flowWidgetPosByNodeIdByGraphMetaKey: nextBy,
      })
      if (options?.persist !== false) {
        get().persistFlowWidgetDocument(graphKey, 'pos')
      }
      return
    }
    set({ flowWidgetPosByNodeId: nextPosByNodeId })
  },
  setFlowWidgetPosByNodeIdForGraph: (graphMetaKey: string | null | undefined, pos: Record<string, { top: number; left: number }>) => {
    let state = get()
    if (isWorkspaceGraphMutationBlocked(state)) return
    const nextPosByNodeId = normalizePosByNodeId(pos)
    const graphKey = String(graphMetaKey || '').trim() || buildGraphDocumentMetaKey(state.graphData)
    get().loadFlowWidgetDocument(graphKey)
    state = get()
    const by = state.flowWidgetPosByNodeIdByGraphMetaKey || {}
    const prevPosByNodeId = state.flowWidgetPosByNodeId || {}
    const prevGraphPosByNodeId = graphKey ? (by[graphKey] || {}) : prevPosByNodeId
    if (isSamePosByNodeId(prevPosByNodeId, nextPosByNodeId) && isSamePosByNodeId(prevGraphPosByNodeId, nextPosByNodeId)) { get().persistFlowWidgetDocument(graphKey, 'pos'); return }
    if (!graphKey) {
      set({ flowWidgetPosByNodeId: nextPosByNodeId })
      return
    }
    set({
      flowWidgetPosByNodeId: nextPosByNodeId,
      flowWidgetPosByNodeIdByGraphMetaKey: { ...by, [graphKey]: nextPosByNodeId },
    })
    get().persistFlowWidgetDocument(graphKey, 'pos')
  },
  flowWidgetWorldPosByNodeIdByGraphMetaKey: {} as Record<string, Record<string, { x: number; y: number }>>,
  flowWidgetWorldPosByNodeId: {} as Record<string, { x: number; y: number }>,
  setFlowWidgetWorldPosByNodeId: (
    pos: Record<string, { x: number; y: number }>,
    options?: { allowDuringWorkspaceMutation?: boolean; persist?: boolean },
  ) => {
    let state = get()
    if (isWorkspaceGraphMutationBlocked(state) && options?.allowDuringWorkspaceMutation !== true) return
    const nextWorldByNodeId = normalizeWorldByNodeId(pos)
    const graphKey = buildGraphDocumentMetaKey(state.graphData)
    get().loadFlowWidgetDocument(graphKey)
    state = get()
    const by = state.flowWidgetWorldPosByNodeIdByGraphMetaKey || {}
    const prevWorldByNodeId = state.flowWidgetWorldPosByNodeId || {}
    const prevGraphWorldByNodeId = graphKey ? (by[graphKey] || {}) : prevWorldByNodeId
    const sameGlobal = isSameWorldByNodeId(prevWorldByNodeId, nextWorldByNodeId)
    const sameForGraph = isSameWorldByNodeId(prevGraphWorldByNodeId, nextWorldByNodeId)
    if (sameGlobal && sameForGraph) { if (options?.persist !== false) get().persistFlowWidgetDocument(graphKey, 'world'); return }
    const nextBy = graphKey ? { ...by, [graphKey]: nextWorldByNodeId } : by
    if (graphKey) {
      set({
        flowWidgetWorldPosByNodeId: nextWorldByNodeId,
        flowWidgetWorldPosByNodeIdByGraphMetaKey: nextBy,
      })
      if (options?.persist !== false) {
        get().persistFlowWidgetDocument(graphKey, 'world')
      }
      return
    }
    set({ flowWidgetWorldPosByNodeId: nextWorldByNodeId })
  },
  setFlowWidgetWorldPosByNodeIdForGraph: (graphMetaKey: string | null | undefined, pos: Record<string, { x: number; y: number }>) => {
    let state = get()
    if (isWorkspaceGraphMutationBlocked(state)) return
    const nextWorldByNodeId = normalizeWorldByNodeId(pos)
    const graphKey = String(graphMetaKey || '').trim() || buildGraphDocumentMetaKey(state.graphData)
    get().loadFlowWidgetDocument(graphKey)
    state = get()
    const by = state.flowWidgetWorldPosByNodeIdByGraphMetaKey || {}
    const prevWorldByNodeId = state.flowWidgetWorldPosByNodeId || {}
    const prevGraphWorldByNodeId = graphKey ? (by[graphKey] || {}) : prevWorldByNodeId
    if (isSameWorldByNodeId(prevWorldByNodeId, nextWorldByNodeId) && isSameWorldByNodeId(prevGraphWorldByNodeId, nextWorldByNodeId)) { get().persistFlowWidgetDocument(graphKey, 'world'); return }
    if (!graphKey) {
      set({ flowWidgetWorldPosByNodeId: nextWorldByNodeId })
      return
    }
    set({
      flowWidgetWorldPosByNodeId: nextWorldByNodeId,
      flowWidgetWorldPosByNodeIdByGraphMetaKey: { ...by, [graphKey]: nextWorldByNodeId },
    })
    get().persistFlowWidgetDocument(graphKey, 'world')
  },
  flowWidgetDraggingNodeId: null as string | null,
  setFlowWidgetDraggingNodeId: (rawId: string | null) => {
    const id = rawId == null ? null : String(rawId || '').trim()
    const prev = get().flowWidgetDraggingNodeId ?? null
    if (prev === id) return
    set({ flowWidgetDraggingNodeId: id })
  },
  }
}
