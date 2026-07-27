import type { GraphState } from '@/hooks/store/types'
import type { StoreApi } from 'zustand'
import { FLOW_WIDGET_FORM_ID_KEY, FLOW_WIDGET_TYPE_ID_KEY } from '@/features/storyboard-widget-manager/resolveWidgetRegistry'
import { emitTocFocus } from '@/features/markdown/ui/tocFocusEvents'
import { isFlowWidgetOverlayEligibleNode } from '@/lib/graph/flowWidgetEligibility'

type SetGraph = StoreApi<GraphState>['setState']
type GetGraph = StoreApi<GraphState>['getState']

const readTocIdFromNode = (node: unknown): string | null => {
  const n = node as { properties?: unknown; id?: unknown; label?: unknown } | null
  const props = n?.properties && typeof n.properties === 'object' && !Array.isArray(n.properties) ? (n.properties as Record<string, unknown>) : null
  const anchorId = typeof props?.anchorId === 'string' ? props.anchorId.trim() : ''
  if (anchorId) return anchorId
  const anchor = typeof props?.anchor === 'string' ? props.anchor.trim() : ''
  if (anchor) return anchor
  const heading = typeof props?.heading === 'string' ? props.heading.trim() : ''
  if (heading) return heading
  const label = typeof n?.label === 'string' ? n.label.trim() : ''
  if (label) return label
  const id = typeof n?.id === 'string' ? n.id.trim() : ''
  if (id) return id
  return null
}

export const createSelectionSlice = (set: SetGraph, get: GetGraph) => ({
  selectedNodeId: null as string | null,
  selectedEdgeId: null as string | null,
  selectedGroupId: null as string | null,
  selectedNodeIds: [] as string[],
  selectedEdgeIds: [] as string[],
  selectedGroupIds: [] as string[],
  selectionSource: null as null | 'canvas' | 'menu' | 'toolbar' | 'editor' | 'unknown',
  setSelectionSource: (src: null | 'canvas' | 'menu' | 'toolbar' | 'editor' | 'unknown') => {
    const cur = get().selectionSource
    if (cur === src) return
    set({ selectionSource: src })
  },
  selectNode: (id: string | null) => {
    const state = get()
    const mode = state.schema.behavior?.selectMode || 'single'
    if (!id) {
      set({
        selectedNodeId: null,
        selectedEdgeId: null,
        selectedGroupId: null,
        selectedNodeIds: [],
        selectedEdgeIds: [],
        selectedGroupIds: [],
      })
      return
    }
    if (
      mode === 'single' &&
      state.selectedNodeId === id &&
      state.selectedEdgeId == null &&
      state.selectedGroupId == null &&
      Array.isArray(state.selectedNodeIds) &&
      state.selectedNodeIds.length === 1 &&
      state.selectedNodeIds[0] === id &&
      (!state.selectedEdgeIds || state.selectedEdgeIds.length === 0) &&
      (!state.selectedGroupIds || state.selectedGroupIds.length === 0)
    ) {
      return
    }
    if (mode === 'multi' || mode === 'lasso') {
      const prevIds = state.selectedNodeIds || []
      const exists = prevIds.includes(id)
      const nextIds = exists ? prevIds.filter(x => x !== id) : [...prevIds, id]
      const nextActiveId = nextIds.length > 0 ? (nextIds.includes(id) ? id : nextIds[nextIds.length - 1]) : null
      set({
        selectedNodeId: nextActiveId,
        selectedEdgeId: state.selectedEdgeId,
        selectedGroupId: state.selectedGroupId,
        selectedNodeIds: nextIds,
        selectedEdgeIds: state.selectedEdgeIds || [],
        selectedGroupIds: state.selectedGroupIds || [],
      })
      if (nextActiveId) {
        try {
          const graphData = get().graphData
          const node = (graphData?.nodes || []).find(n => String(n.id || '') === nextActiveId) || null
          if (isFlowWidgetOverlayEligibleNode(node)) {
            get().updateOpenWidgetNodeIds?.(prev => (prev.includes(nextActiveId) ? prev : [...prev, nextActiveId]))
          }
        } catch {
          void 0
        }
      }
      return
    }
    set({
      selectedNodeId: id,
      selectedEdgeId: null,
      selectedGroupId: null,
      selectedNodeIds: [id],
      selectedEdgeIds: [],
      selectedGroupIds: [],
    })
    if (state.workspaceViewMode === 'editor') {
      try {
        const graphData = get().graphData
        const node = (graphData?.nodes || []).find(n => String(n.id || '') === id) || null
        const tocId = readTocIdFromNode(node)
        if (tocId) emitTocFocus(tocId)
      } catch {
        void 0
      }
    }
    try {
      const graphData = get().graphData
      const node = (graphData?.nodes || []).find(n => String(n.id || '') === id) || null
      if (isFlowWidgetOverlayEligibleNode(node)) {
        get().updateOpenWidgetNodeIds?.(prev => (prev.includes(id) ? prev : [...prev, id]))
      }
    } catch {
      void 0
    }
  },
  toggleNodeSelectionAdditive: (rawId: string) => {
    const id = String(rawId || '').trim()
    if (!id) return
    const state = get()
    const previousIds = new Set<string>(
      (state.selectedNodeIds || []).map(value => String(value || '').trim()).filter(Boolean),
    )
    if (state.selectedNodeId) previousIds.add(String(state.selectedNodeId))
    if (previousIds.has(id)) previousIds.delete(id)
    else previousIds.add(id)
    const nextIds = Array.from(previousIds)
    const nextActiveId = nextIds.includes(id) ? id : nextIds[nextIds.length - 1] || null
    set({
      selectedNodeId: nextActiveId,
      selectedEdgeId: null,
      selectedGroupId: state.selectedGroupId,
      selectedNodeIds: nextIds,
      selectedEdgeIds: [],
      selectedGroupIds: state.selectedGroupIds || [],
    })
    if (!nextActiveId) return
    try {
      const graphData = get().graphData
      const node = (graphData?.nodes || []).find(item => String(item.id || '') === nextActiveId) || null
      if (isFlowWidgetOverlayEligibleNode(node)) {
        get().updateOpenWidgetNodeIds?.(previous => (
          previous.includes(nextActiveId) ? previous : [...previous, nextActiveId]
        ))
      }
    } catch {
      void 0
    }
  },
  selectNodesExpanded: (args: { nodeIds: string[]; edgeIds?: string[]; groupIds?: string[]; activeNodeId?: string | null }) => {
    const state = get()
    const mode = state.schema.behavior?.selectMode || 'single'
    const rawNodeIds = Array.isArray(args.nodeIds) ? args.nodeIds : []
    const nodeIdSet = new Set<string>(rawNodeIds.map(v => String(v)).filter(Boolean))
    const nodeIds = Array.from(nodeIdSet)
    const rawEdgeIds = Array.isArray(args.edgeIds) ? args.edgeIds : []
    const edgeIds = rawEdgeIds.map(v => String(v)).filter(Boolean)
    const rawGroupIds = Array.isArray(args.groupIds) ? args.groupIds : []
    const groupIds = rawGroupIds.map(v => String(v)).filter(Boolean)
    if (nodeIds.length === 0 && edgeIds.length === 0 && groupIds.length === 0) {
      set({
        selectedNodeId: null,
        selectedEdgeId: null,
        selectedGroupId: null,
        selectedNodeIds: [],
        selectedEdgeIds: [],
        selectedGroupIds: [],
      })
      return
    }
    const activeRaw = typeof args.activeNodeId === 'string' ? args.activeNodeId : null
    const activeNodeId = activeRaw && nodeIdSet.has(activeRaw) ? activeRaw : nodeIds[nodeIds.length - 1] || null
    if (mode === 'single') {
      if (!activeNodeId && groupIds.length > 0) {
        const selectedGroupId = groupIds[groupIds.length - 1]
        set({
          selectedNodeId: null,
          selectedEdgeId: null,
          selectedGroupId,
          selectedNodeIds: [],
          selectedEdgeIds: [],
          selectedGroupIds: [selectedGroupId],
        })
        return
      }
      if (!activeNodeId && edgeIds.length > 0) {
        const selectedEdgeId = edgeIds[edgeIds.length - 1]
        set({
          selectedNodeId: null,
          selectedEdgeId,
          selectedGroupId: null,
          selectedNodeIds: [],
          selectedEdgeIds: [selectedEdgeId],
          selectedGroupIds: [],
        })
        return
      }
      set({
        selectedNodeId: activeNodeId,
        selectedEdgeId: null,
        selectedGroupId: null,
        selectedNodeIds: activeNodeId ? [activeNodeId] : [],
        selectedEdgeIds: [],
        selectedGroupIds: [],
      })
      return
    }
    set({
      selectedNodeId: activeNodeId,
      selectedEdgeId: edgeIds.length > 0 ? edgeIds[edgeIds.length - 1] : null,
      selectedGroupId: groupIds.length > 0 ? groupIds[groupIds.length - 1] : null,
      selectedNodeIds: nodeIds,
      selectedEdgeIds: edgeIds,
      selectedGroupIds: groupIds,
    })
  },
  selectEdge: (id: string | null) => {
    const state = get()
    const mode = state.schema.behavior?.selectMode || 'single'
    if (!id) {
      set({
        selectedNodeId: null,
        selectedEdgeId: null,
        selectedGroupId: null,
        selectedNodeIds: [],
        selectedEdgeIds: [],
        selectedGroupIds: [],
      })
      return
    }
    if (
      mode === 'single' &&
      state.selectedEdgeId === id &&
      state.selectedNodeId == null &&
      state.selectedGroupId == null &&
      Array.isArray(state.selectedEdgeIds) &&
      state.selectedEdgeIds.length === 1 &&
      state.selectedEdgeIds[0] === id &&
      (!state.selectedNodeIds || state.selectedNodeIds.length === 0) &&
      (!state.selectedGroupIds || state.selectedGroupIds.length === 0)
    ) {
      return
    }
    if (mode === 'multi' || mode === 'lasso') {
      const prevIds = state.selectedEdgeIds || []
      const exists = prevIds.includes(id)
      const nextIds = exists ? prevIds.filter(x => x !== id) : [...prevIds, id]
      const nextActiveId = nextIds.length > 0 ? (nextIds.includes(id) ? id : nextIds[nextIds.length - 1]) : null
      set({
        selectedNodeId: state.selectedNodeId,
        selectedEdgeId: nextActiveId,
        selectedGroupId: null,
        selectedNodeIds: state.selectedNodeIds || [],
        selectedEdgeIds: nextIds,
        selectedGroupIds: [],
      })
      return
    }
    set({
      selectedNodeId: null,
      selectedEdgeId: id,
      selectedGroupId: null,
      selectedNodeIds: [],
      selectedEdgeIds: [id],
      selectedGroupIds: [],
    })
  },
  selectGroup: (id: string | null) => {
    const state = get()
    const mode = state.schema.behavior?.selectMode || 'single'
    if (!id) {
      set({
        selectedNodeId: null,
        selectedEdgeId: null,
        selectedGroupId: null,
        selectedNodeIds: [],
        selectedEdgeIds: [],
        selectedGroupIds: [],
      })
      return
    }
    if (
      mode === 'single' &&
      state.selectedGroupId === id &&
      state.selectedNodeId == null &&
      state.selectedEdgeId == null &&
      Array.isArray(state.selectedGroupIds) &&
      state.selectedGroupIds.length === 1 &&
      state.selectedGroupIds[0] === id &&
      (!state.selectedNodeIds || state.selectedNodeIds.length === 0) &&
      (!state.selectedEdgeIds || state.selectedEdgeIds.length === 0)
    ) {
      return
    }
    if (mode === 'multi' || mode === 'lasso') {
      const prevIds = state.selectedGroupIds || []
      const exists = prevIds.includes(id)
      const nextIds = exists ? prevIds.filter(x => x !== id) : [...prevIds, id]
      const nextActiveId = nextIds.length > 0 ? (nextIds.includes(id) ? id : nextIds[nextIds.length - 1]) : null
      set({
        selectedNodeId: state.selectedNodeId,
        selectedEdgeId: null,
        selectedGroupId: nextActiveId,
        selectedNodeIds: state.selectedNodeIds || [],
        selectedEdgeIds: [],
        selectedGroupIds: nextIds,
      })
      return
    }
    set({
      selectedNodeId: null,
      selectedEdgeId: null,
      selectedGroupId: id,
      selectedNodeIds: [],
      selectedEdgeIds: [],
      selectedGroupIds: [id],
    })
  },
  selectGroupExpanded: (args: { id: string; nodeIds: string[]; edgeIds: string[] }) => {
    const id = String(args.id || '').trim()
    if (!id) return
    const nodeIds = Array.isArray(args.nodeIds) ? args.nodeIds.map(x => String(x)).filter(Boolean) : []
    const edgeIds = Array.isArray(args.edgeIds) ? args.edgeIds.map(x => String(x)).filter(Boolean) : []
    set({
      selectedNodeId: null,
      selectedEdgeId: null,
      selectedGroupId: id,
      selectedNodeIds: nodeIds,
      selectedEdgeIds: edgeIds,
      selectedGroupIds: [id],
    })
  },
});
