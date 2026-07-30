import type { GraphState } from '@/hooks/store/types'
import type { StoreApi } from 'zustand'
import { LS_KEYS } from '@/lib/config.ls.keys'
import { getLocalStorage, lsJson, lsSetInt, lsSetJson, readJsonFromStorage } from '@/lib/persistence'
import type { Canvas2dRendererId } from '@/lib/config.render'
import { buildGraphDocumentMetaKey, buildGraphMetaKeyIgnoringPending } from '@/lib/graph/graphMetaKey'
import { scheduleWorkspaceSyncTask } from '@/lib/async/workspaceSyncScheduler'
import {
  WORKSPACE_SYNC_SCOPE_FLOW_WIDGET_RUNTIME_PERSISTENCE,
  WORKSPACE_SYNC_TASK_FLOW_WIDGET_VIEW_STATE,
} from '@/lib/async/workspaceSyncKeys'
import { hashRecordSignature, hashSignatureParts } from '@/lib/hash/signature'
import {
  isWorkspaceGraphMutationBlocked,
} from '@/features/workspace-table/workspaceTableSsot'
import { stripFrontmatterAutoManagedWidgetPinnedStates } from '@/lib/storyboardWidget/widgetPlacementAuthority'
import { isFlowWidgetOverlayEligibleNode } from '@/lib/graph/flowWidgetEligibility'
import { normalizeIds, normalizeOpenWidgetNodeIds } from '@/hooks/store/graphViewIds'
import {
  applyGraphViewPinnedSemanticsMigration,
  normalizePinnedByNodeId,
  normalizePosByNodeId,
  normalizeWorldByNodeId,
  planGraphViewPinnedSemanticsMigration,
} from '@/hooks/store/graphViewPinnedSemanticsMigration'

type SetGraph = StoreApi<GraphState>['setState']
type GetGraph = StoreApi<GraphState>['getState']

const FLOW_WIDGET_PERSIST_DELAY_MS = 90

type WidgetPinnedByGraphMap = Record<string, Record<string, boolean>>
type WidgetPosByGraphMap = Record<string, Record<string, { top: number; left: number }>>
type WidgetWorldByGraphMap = Record<string, Record<string, { x: number; y: number }>>

export {
  applyGraphViewPinnedSemanticsMigration,
  planGraphViewPinnedSemanticsMigration,
} from '@/hooks/store/graphViewPinnedSemanticsMigration'

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

const getFlowWidgetGraphIndexStorageKey = (baseKey: string): string => `${String(baseKey || '').trim()}:graphKeys`
const getFlowWidgetGraphShardStorageKey = (baseKey: string, graphKey: string): string =>
  `${String(baseKey || '').trim()}:${encodeURIComponent(String(graphKey || '').trim())}`

const readFlowWidgetGraphIndex = (storage: Storage | null, baseKey: string): string[] => {
  if (!storage) return []
  try {
    const raw = storage.getItem(getFlowWidgetGraphIndexStorageKey(baseKey))
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.map(v => String(v || '').trim()).filter(Boolean)
  } catch {
    return []
  }
}

const parseFlowWidgetPinnedByGraphMap = (raw: unknown): WidgetPinnedByGraphMap => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const out: WidgetPinnedByGraphMap = {}
  for (const [graphKeyRaw, entry] of Object.entries(raw as Record<string, unknown>)) {
    const graphKey = String(graphKeyRaw || '').trim()
    if (!graphKey) continue
    const inner = normalizePinnedByNodeId(entry as Record<string, boolean> | null | undefined)
    out[graphKey] = inner
  }
  return out
}

const parseFlowWidgetPosByGraphMap = (raw: unknown): WidgetPosByGraphMap => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const out: WidgetPosByGraphMap = {}
  for (const [graphKeyRaw, entry] of Object.entries(raw as Record<string, unknown>)) {
    const graphKey = String(graphKeyRaw || '').trim()
    if (!graphKey) continue
    const inner = normalizePosByNodeId(entry as Record<string, { top: number; left: number }> | null | undefined)
    out[graphKey] = inner
  }
  return out
}

const parseFlowWidgetWorldByGraphMap = (raw: unknown): WidgetWorldByGraphMap => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const out: WidgetWorldByGraphMap = {}
  for (const [graphKeyRaw, entry] of Object.entries(raw as Record<string, unknown>)) {
    const graphKey = String(graphKeyRaw || '').trim()
    if (!graphKey) continue
    const inner = normalizeWorldByNodeId(entry as Record<string, { x: number; y: number }> | null | undefined)
    out[graphKey] = inner
  }
  return out
}

const readShardedFlowWidgetGraphMap = <T>(
  storage: Storage | null,
  baseKey: string,
  parseEntry: (raw: unknown) => T,
  parseLegacy: (raw: unknown) => Record<string, T>,
): Record<string, T> => {
  if (!storage) return {}
  const graphKeys = readFlowWidgetGraphIndex(storage, baseKey)
  if (graphKeys.length > 0) {
    const out: Record<string, T> = {}
    for (let i = 0; i < graphKeys.length; i += 1) {
      const graphKey = graphKeys[i]
      try {
        const raw = storage.getItem(getFlowWidgetGraphShardStorageKey(baseKey, graphKey))
        if (!raw) continue
        out[graphKey] = parseEntry(JSON.parse(raw) as unknown)
      } catch {
        void 0
      }
    }
    return out
  }
  return readJsonFromStorage(storage, baseKey, {} as Record<string, T>, parseLegacy)
}

const writeShardedFlowWidgetGraphState = <T extends Record<string, unknown>>(
  storage: Storage | null,
  baseKey: string,
  graphKey: string,
  value: T,
): void => {
  if (!storage) return
  const normalizedBaseKey = String(baseKey || '').trim()
  const normalizedGraphKey = String(graphKey || '').trim()
  if (!normalizedBaseKey || !normalizedGraphKey) return
  const nextIndex = readFlowWidgetGraphIndex(storage, normalizedBaseKey)
  const hasEntries = Object.keys(value).length > 0
  const shardStorageKey = getFlowWidgetGraphShardStorageKey(normalizedBaseKey, normalizedGraphKey)
  try {
    if (hasEntries) {
      storage.setItem(shardStorageKey, JSON.stringify(value))
      const deduped = [normalizedGraphKey, ...nextIndex.filter(key => key !== normalizedGraphKey)]
      storage.setItem(getFlowWidgetGraphIndexStorageKey(normalizedBaseKey), JSON.stringify(deduped))
    } else {
      storage.removeItem(shardStorageKey)
      const pruned = nextIndex.filter(key => key !== normalizedGraphKey)
      if (pruned.length > 0) {
        storage.setItem(getFlowWidgetGraphIndexStorageKey(normalizedBaseKey), JSON.stringify(pruned))
      } else {
        storage.removeItem(getFlowWidgetGraphIndexStorageKey(normalizedBaseKey))
      }
    }
    storage.removeItem(normalizedBaseKey)
  } catch {
    void 0
  }
}

let pendingFlowWidgetPersistence: {
  pinned?: { graphKey: string; value: Record<string, boolean> }
  pos?: { graphKey: string; value: Record<string, { top: number; left: number }> }
  world?: { graphKey: string; value: Record<string, { x: number; y: number }> }
} = {}

const scheduleFlowWidgetPersistence = (patch: {
  pinned?: { graphKey: string; value: Record<string, boolean> }
  pos?: { graphKey: string; value: Record<string, { top: number; left: number }> }
  world?: { graphKey: string; value: Record<string, { x: number; y: number }> }
}): void => {
  if (patch.pinned) pendingFlowWidgetPersistence.pinned = patch.pinned
  if (patch.pos) pendingFlowWidgetPersistence.pos = patch.pos
  if (patch.world) pendingFlowWidgetPersistence.world = patch.world

  const signature = hashSignatureParts([
    pendingFlowWidgetPersistence.pinned
      ? hashSignatureParts([
          pendingFlowWidgetPersistence.pinned.graphKey,
          hashRecordSignature(pendingFlowWidgetPersistence.pinned.value, { maxEntries: 36 }),
        ])
      : '',
    pendingFlowWidgetPersistence.pos
      ? hashSignatureParts([
          pendingFlowWidgetPersistence.pos.graphKey,
          hashRecordSignature(pendingFlowWidgetPersistence.pos.value, { maxEntries: 36 }),
        ])
      : '',
    pendingFlowWidgetPersistence.world
      ? hashSignatureParts([
          pendingFlowWidgetPersistence.world.graphKey,
          hashRecordSignature(pendingFlowWidgetPersistence.world.value, { maxEntries: 36 }),
        ])
      : '',
  ])

  scheduleWorkspaceSyncTask(
    WORKSPACE_SYNC_TASK_FLOW_WIDGET_VIEW_STATE,
    () => {
      const pending = pendingFlowWidgetPersistence
      pendingFlowWidgetPersistence = {}
      const storage = getLocalStorage()
      if (pending.pinned) writeShardedFlowWidgetGraphState(storage, LS_KEYS.flowWidgetPinnedByGraphMetaKey, pending.pinned.graphKey, pending.pinned.value)
      if (pending.pos) writeShardedFlowWidgetGraphState(storage, LS_KEYS.flowWidgetPosByGraphMetaKey, pending.pos.graphKey, pending.pos.value)
      if (pending.world) writeShardedFlowWidgetGraphState(storage, LS_KEYS.flowWidgetWorldPosByGraphMetaKey, pending.world.graphKey, pending.world.value)
    },
    FLOW_WIDGET_PERSIST_DELAY_MS,
    {
      signature,
      scopeKey: WORKSPACE_SYNC_SCOPE_FLOW_WIDGET_RUNTIME_PERSISTENCE,
    },
  )
}

export const createGraphViewSlice = (set: SetGraph, get: GetGraph) => {
  const storage = getLocalStorage()
  const pinnedSemanticsMigrationPlan = planGraphViewPinnedSemanticsMigration(storage)
  return {
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
  flowWidgetPinnedByNodeId: pinnedSemanticsMigrationPlan.effectivePinnedByNodeId,
  flowWidgetPinnedByNodeIdByGraphMetaKey: readShardedFlowWidgetGraphMap(storage, LS_KEYS.flowWidgetPinnedByGraphMetaKey, raw => normalizePinnedByNodeId(raw as Record<string, boolean> | null | undefined), parseFlowWidgetPinnedByGraphMap),
  setFlowWidgetPinnedByNodeId: (pinnedById: Record<string, boolean>) => {
    const state = get()
    if (isWorkspaceGraphMutationBlocked(state)) return
    const nextPinnedById = normalizePinnedByNodeId(pinnedById)
    const graphKey = buildGraphDocumentMetaKey(state.graphData)
    const by = state.flowWidgetPinnedByNodeIdByGraphMetaKey || {}
    const prevPinnedById = state.flowWidgetPinnedByNodeId || {}
    const prevGraphPinnedById = graphKey ? (by[graphKey] || {}) : prevPinnedById
    const sameGlobal = isSamePinnedByNodeId(prevPinnedById, nextPinnedById)
    const sameForGraph = isSamePinnedByNodeId(prevGraphPinnedById, nextPinnedById)
    if (sameGlobal && sameForGraph) return
    const nextBy = graphKey ? { ...by, [graphKey]: nextPinnedById } : by
    if (graphKey) {
      set({
        flowWidgetPinnedByNodeId: nextPinnedById,
        flowWidgetPinnedByNodeIdByGraphMetaKey: nextBy,
      })
      scheduleFlowWidgetPersistence({ pinned: { graphKey, value: nextPinnedById } })
      return
    }
    set({ flowWidgetPinnedByNodeId: nextPinnedById })
  },
  setFlowWidgetPinnedByNodeIdForGraph: (graphMetaKey: string | null | undefined, pinnedById: Record<string, boolean>) => {
    const state = get()
    const nextPinnedById = normalizePinnedByNodeId(pinnedById)
    const graphKey = String(graphMetaKey || '').trim() || buildGraphDocumentMetaKey(state.graphData)
    const by = state.flowWidgetPinnedByNodeIdByGraphMetaKey || {}
    const prevPinnedById = state.flowWidgetPinnedByNodeId || {}
    const prevGraphPinnedById = graphKey ? (by[graphKey] || {}) : prevPinnedById
    const sameGlobal = isSamePinnedByNodeId(prevPinnedById, nextPinnedById)
    const sameForGraph = isSamePinnedByNodeId(prevGraphPinnedById, nextPinnedById)
    if (sameGlobal && sameForGraph) return
    if (!graphKey) {
      set({ flowWidgetPinnedByNodeId: nextPinnedById })
      return
    }
    const nextBy = { ...by, [graphKey]: nextPinnedById }
    set({
      flowWidgetPinnedByNodeId: nextPinnedById,
      flowWidgetPinnedByNodeIdByGraphMetaKey: nextBy,
    })
    scheduleFlowWidgetPersistence({ pinned: { graphKey, value: nextPinnedById } })
  },
  flowWidgetPosByNodeIdByGraphMetaKey: readShardedFlowWidgetGraphMap(storage, LS_KEYS.flowWidgetPosByGraphMetaKey, raw => normalizePosByNodeId(raw as Record<string, { top: number; left: number }> | null | undefined), parseFlowWidgetPosByGraphMap),
  flowWidgetPosByNodeId: lsJson<Record<string, { top: number; left: number }>>(
    LS_KEYS.flowWidgetPosByNodeId,
    {},
    v => (v && typeof v === 'object' ? (v as Record<string, { top: number; left: number }>) : {}),
  ),
  setFlowWidgetPosByNodeId: (
    pos: Record<string, { top: number; left: number }>,
    options?: { allowDuringWorkspaceMutation?: boolean; persist?: boolean },
  ) => {
    const state = get()
    if (isWorkspaceGraphMutationBlocked(state) && options?.allowDuringWorkspaceMutation !== true) return
    const nextPosByNodeId = normalizePosByNodeId(pos)
    const graphKey = buildGraphDocumentMetaKey(state.graphData)
    const by = state.flowWidgetPosByNodeIdByGraphMetaKey || {}
    const prevPosByNodeId = state.flowWidgetPosByNodeId || {}
    const prevGraphPosByNodeId = graphKey ? (by[graphKey] || {}) : prevPosByNodeId
    const sameGlobal = isSamePosByNodeId(prevPosByNodeId, nextPosByNodeId)
    const sameForGraph = isSamePosByNodeId(prevGraphPosByNodeId, nextPosByNodeId)
    if (sameGlobal && sameForGraph) return
    const nextBy = graphKey ? { ...by, [graphKey]: nextPosByNodeId } : by
    if (graphKey) {
      set({
        flowWidgetPosByNodeId: nextPosByNodeId,
        flowWidgetPosByNodeIdByGraphMetaKey: nextBy,
      })
      if (options?.persist !== false) {
        scheduleFlowWidgetPersistence({ pos: { graphKey, value: nextPosByNodeId } })
      }
      return
    }
    set({ flowWidgetPosByNodeId: nextPosByNodeId })
  },
  setFlowWidgetPosByNodeIdForGraph: (graphMetaKey: string | null | undefined, pos: Record<string, { top: number; left: number }>) => {
    const state = get()
    if (isWorkspaceGraphMutationBlocked(state)) return
    const nextPosByNodeId = normalizePosByNodeId(pos)
    const graphKey = String(graphMetaKey || '').trim() || buildGraphDocumentMetaKey(state.graphData)
    const by = state.flowWidgetPosByNodeIdByGraphMetaKey || {}
    const prevPosByNodeId = state.flowWidgetPosByNodeId || {}
    const prevGraphPosByNodeId = graphKey ? (by[graphKey] || {}) : prevPosByNodeId
    if (isSamePosByNodeId(prevPosByNodeId, nextPosByNodeId) && isSamePosByNodeId(prevGraphPosByNodeId, nextPosByNodeId)) return
    if (!graphKey) {
      set({ flowWidgetPosByNodeId: nextPosByNodeId })
      return
    }
    set({
      flowWidgetPosByNodeId: nextPosByNodeId,
      flowWidgetPosByNodeIdByGraphMetaKey: { ...by, [graphKey]: nextPosByNodeId },
    })
    scheduleFlowWidgetPersistence({ pos: { graphKey, value: nextPosByNodeId } })
  },
  flowWidgetWorldPosByNodeIdByGraphMetaKey: readShardedFlowWidgetGraphMap(storage, LS_KEYS.flowWidgetWorldPosByGraphMetaKey, raw => normalizeWorldByNodeId(raw as Record<string, { x: number; y: number }> | null | undefined), parseFlowWidgetWorldByGraphMap),
  flowWidgetWorldPosByNodeId: lsJson<Record<string, { x: number; y: number }>>(
    LS_KEYS.flowWidgetWorldPosByNodeId,
    {},
    raw => {
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
      const out: Record<string, { x: number; y: number }> = {}
      for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
        const id = String(k || '').trim()
        if (!id) continue
        const o = v as { x?: unknown; y?: unknown } | null
        const x = typeof o?.x === 'number' && Number.isFinite(o.x) ? (o.x as number) : null
        const y = typeof o?.y === 'number' && Number.isFinite(o.y) ? (o.y as number) : null
        if (x == null || y == null) continue
        out[id] = { x, y }
      }
      return out
    },
  ),
  setFlowWidgetWorldPosByNodeId: (
    pos: Record<string, { x: number; y: number }>,
    options?: { allowDuringWorkspaceMutation?: boolean; persist?: boolean },
  ) => {
    const state = get()
    if (isWorkspaceGraphMutationBlocked(state) && options?.allowDuringWorkspaceMutation !== true) return
    const nextWorldByNodeId = normalizeWorldByNodeId(pos)
    const graphKey = buildGraphDocumentMetaKey(state.graphData)
    const by = state.flowWidgetWorldPosByNodeIdByGraphMetaKey || {}
    const prevWorldByNodeId = state.flowWidgetWorldPosByNodeId || {}
    const prevGraphWorldByNodeId = graphKey ? (by[graphKey] || {}) : prevWorldByNodeId
    const sameGlobal = isSameWorldByNodeId(prevWorldByNodeId, nextWorldByNodeId)
    const sameForGraph = isSameWorldByNodeId(prevGraphWorldByNodeId, nextWorldByNodeId)
    if (sameGlobal && sameForGraph) return
    const nextBy = graphKey ? { ...by, [graphKey]: nextWorldByNodeId } : by
    if (graphKey) {
      set({
        flowWidgetWorldPosByNodeId: nextWorldByNodeId,
        flowWidgetWorldPosByNodeIdByGraphMetaKey: nextBy,
      })
      if (options?.persist !== false) {
        scheduleFlowWidgetPersistence({ world: { graphKey, value: nextWorldByNodeId } })
      }
      return
    }
    set({ flowWidgetWorldPosByNodeId: nextWorldByNodeId })
  },
  setFlowWidgetWorldPosByNodeIdForGraph: (graphMetaKey: string | null | undefined, pos: Record<string, { x: number; y: number }>) => {
    const state = get()
    if (isWorkspaceGraphMutationBlocked(state)) return
    const nextWorldByNodeId = normalizeWorldByNodeId(pos)
    const graphKey = String(graphMetaKey || '').trim() || buildGraphDocumentMetaKey(state.graphData)
    const by = state.flowWidgetWorldPosByNodeIdByGraphMetaKey || {}
    const prevWorldByNodeId = state.flowWidgetWorldPosByNodeId || {}
    const prevGraphWorldByNodeId = graphKey ? (by[graphKey] || {}) : prevWorldByNodeId
    if (isSameWorldByNodeId(prevWorldByNodeId, nextWorldByNodeId) && isSameWorldByNodeId(prevGraphWorldByNodeId, nextWorldByNodeId)) return
    if (!graphKey) {
      set({ flowWidgetWorldPosByNodeId: nextWorldByNodeId })
      return
    }
    set({
      flowWidgetWorldPosByNodeId: nextWorldByNodeId,
      flowWidgetWorldPosByNodeIdByGraphMetaKey: { ...by, [graphKey]: nextWorldByNodeId },
    })
    scheduleFlowWidgetPersistence({ world: { graphKey, value: nextWorldByNodeId } })
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
