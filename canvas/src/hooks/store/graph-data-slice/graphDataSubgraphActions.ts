import type { GetGraph, SetGraph } from './graphDataSliceAccess'
import { persistGraphDataToLocalStorage } from '@/hooks/store/graphDataPersistence'
import {
  createSubgraph,
  readSubgraphs,
  removeSubgraph as removeSubgraphFromGraphData,
  subgraphGroupId,
  updateSubgraph as updateSubgraphInGraphData,
  writeSubgraphs,
} from '@/lib/graph/subgraphs'
import {
  applyLayoutAutosuggestFromMetadata,
  applyWidgetRegistryFromMetadata,
  readGraphRagWorkflowJsonTextFromGraphData,
  withGraphDataRevision,
} from '@/hooks/store/graphDataSliceUtils'
import { isWorkspaceGraphMutationBlocked } from '@/features/workspace-table/workspaceTableSsot'

const readOnlyResult = { ok: false as const, message: 'Knowledge graph projection is read-only.' }

export function createGraphDataSubgraphActions(set: SetGraph, get: GetGraph) {
  return ({
  createUserSubgraph: (
    args: { label?: string; memberNodeIds: string[]; childGroupIds?: string[]; parentId?: string | null; kind?: 'subgraph' | 'cluster'; autoBounds?: boolean },
  ): { ok: true; id: string } | { ok: false; message: string } => {
    if (isWorkspaceGraphMutationBlocked(get())) return readOnlyResult
    let { graphData } = get()
    if (!graphData) {
      get().setGraphData({ context: '', type: 'Graph', nodes: [], edges: [] } as never)
      ;({ graphData } = get())
    }
    if (!graphData) return { ok: false, message: 'No graph loaded.' }

    const nodeIdSet = new Set<string>((graphData.nodes || []).map(n => String(n.id || '')).filter(Boolean))
    const memberNodeIds = Array.from(new Set((args.memberNodeIds || []).map(v => String(v || '').trim()).filter(Boolean))).filter(id => nodeIdSet.has(id))
    const existing = readSubgraphs(graphData)
    const existingIdSet = new Set(existing.map(sg => sg.id))
    const requestedChildIds = new Set(
      (args.childGroupIds || [])
        .map(groupId => String(groupId || '').trim())
        .map(groupId => groupId.startsWith('subgraph:') ? groupId.slice('subgraph:'.length) : groupId)
        .filter(id => existingIdSet.has(id)),
    )
    const childGroupIds = [...requestedChildIds].filter(id => {
      let parentId = existing.find(subgraph => subgraph.id === id)?.parentId || null
      for (let depth = 0; parentId && depth < 200; depth += 1) {
        if (requestedChildIds.has(parentId)) return false
        parentId = existing.find(subgraph => subgraph.id === parentId)?.parentId || null
      }
      return true
    })
    if (memberNodeIds.length === 0 && childGroupIds.length === 0) {
      return { ok: false, message: 'Select at least one node or Group Panel.' }
    }
    const rawParent = args.parentId == null ? null : String(args.parentId || '').trim() || null
    const parentId = rawParent && existingIdSet.has(rawParent) ? rawParent : null

    const { subgraph, graphData: createdGraphData } = createSubgraph(graphData, {
      nodeIds: memberNodeIds,
      label: args.label,
      parentId,
      kind: args.kind === 'cluster' ? 'cluster' : 'subgraph',
      autoBounds: args.autoBounds === true,
    })
    const childGroupIdSet = new Set(childGroupIds)
    const nextGraphDataBase = childGroupIdSet.size === 0
      ? createdGraphData
      : writeSubgraphs(createdGraphData, readSubgraphs(createdGraphData).map(candidate => (
          childGroupIdSet.has(candidate.id) ? { ...candidate, parentId: subgraph.id } : candidate
        )))
    const nextRevision = (get().graphDataRevision || 0) + 1
    const nextGraphData = withGraphDataRevision(nextGraphDataBase, nextRevision)
    set({ graphData: nextGraphData, graphDataRevision: nextRevision, graphValidationStatus: null, graphValidationTimestamp: null })
    set({ lifecycleStage: 'committed' })
    try {
      const nextWorkflowText = readGraphRagWorkflowJsonTextFromGraphData(nextGraphData)
      const currentWorkflowText = get().graphRagWorkflowJsonText
      if (nextWorkflowText !== currentWorkflowText) set({ graphRagWorkflowJsonText: nextWorkflowText })
    } catch { void 0 }
    try {
      applyLayoutAutosuggestFromMetadata(get, nextGraphData.metadata)
    } catch { void 0 }
    try {
      applyWidgetRegistryFromMetadata(get, nextGraphData.metadata, nextGraphData)
    } catch { void 0 }
    try {
      persistGraphDataToLocalStorage(nextGraphData)
    } catch {
      void 0
    }
    get().scheduleHistory(`Create Subgraph: ${subgraph.id} [nodes=${memberNodeIds.length}, groups=${childGroupIds.length}]`)
    return { ok: true, id: subgraph.id }
  },

  updateUserSubgraph: (
    rawId: string,
    patch: { label?: string; memberNodeIds?: string[]; parentId?: string | null; kind?: 'subgraph' | 'cluster' },
  ): { ok: true } | { ok: false; message: string } => {
    if (isWorkspaceGraphMutationBlocked(get())) return readOnlyResult
    const id = String(rawId || '').trim()
    if (!id) return { ok: false, message: 'Missing subgraph id.' }
    const { graphData } = get()
    if (!graphData) return { ok: false, message: 'No graph loaded.' }

    const current = readSubgraphs(graphData)
    const exists = current.find(sg => sg.id === id) || null
    if (!exists) return { ok: false, message: 'Subgraph not found.' }

    const nodeIdSet = new Set<string>((graphData.nodes || []).map(n => String(n.id || '')).filter(Boolean))
    const nextMemberNodeIds = patch.memberNodeIds
      ? Array.from(new Set((patch.memberNodeIds || []).map(v => String(v || '').trim()).filter(Boolean))).filter(nid => nodeIdSet.has(nid))
      : undefined

    const rawParent = patch.parentId === undefined ? undefined : patch.parentId == null ? null : String(patch.parentId || '').trim() || null
    const parentId = rawParent === undefined ? undefined : rawParent

    if (parentId != null) {
      if (parentId === id) return { ok: false, message: 'A subgraph cannot be its own parent.' }
      const sgById = new Map(current.map(sg => [sg.id, sg] as const))
      if (!sgById.has(parentId)) return { ok: false, message: 'Parent subgraph not found.' }
      let cur: string | null = parentId
      for (let i = 0; i < 200 && cur; i += 1) {
        if (cur === id) return { ok: false, message: 'Parent assignment would create a cycle.' }
        cur = sgById.get(cur)?.parentId ?? null
      }
    }

    const nextGraphDataBase = updateSubgraphInGraphData(graphData, id, {
      ...(patch.label != null ? { label: patch.label } : {}),
      ...(nextMemberNodeIds ? { memberNodeIds: nextMemberNodeIds } : {}),
      ...(parentId !== undefined ? { parentId } : {}),
      ...(patch.kind != null ? { kind: patch.kind === 'cluster' ? 'cluster' : 'subgraph' } : {}),
    })
    const nextRevision = (get().graphDataRevision || 0) + 1
    const nextGraphData = withGraphDataRevision(nextGraphDataBase, nextRevision)
    set({ graphData: nextGraphData, graphDataRevision: nextRevision, graphValidationStatus: null, graphValidationTimestamp: null })
    set({ lifecycleStage: 'committed' })
    try {
      const nextWorkflowText = readGraphRagWorkflowJsonTextFromGraphData(nextGraphData)
      const currentWorkflowText = get().graphRagWorkflowJsonText
      if (nextWorkflowText !== currentWorkflowText) set({ graphRagWorkflowJsonText: nextWorkflowText })
    } catch { void 0 }
    try {
      applyLayoutAutosuggestFromMetadata(get, nextGraphData.metadata)
    } catch { void 0 }
    try {
      applyWidgetRegistryFromMetadata(get, nextGraphData.metadata, nextGraphData)
    } catch { void 0 }
    try {
      persistGraphDataToLocalStorage(nextGraphData)
    } catch {
      void 0
    }
    get().scheduleHistory(`Update Subgraph: ${id}`)
    return { ok: true }
  },

  addNodesToUserSubgraph: (rawId: string, rawNodeIds: string[]): { ok: true } | { ok: false; message: string } => {
    if (isWorkspaceGraphMutationBlocked(get())) return readOnlyResult
    const id = String(rawId || '').trim()
    if (!id) return { ok: false, message: 'Missing subgraph id.' }
    const { graphData } = get()
    if (!graphData) return { ok: false, message: 'No graph loaded.' }
    const current = readSubgraphs(graphData)
    const sg = current.find(s => s.id === id) || null
    if (!sg) return { ok: false, message: 'Subgraph not found.' }
    const merged = Array.from(new Set([...(sg.memberNodeIds || []), ...(rawNodeIds || []).map(v => String(v || '').trim()).filter(Boolean)]))
    return get().updateUserSubgraph(id, { memberNodeIds: merged })
  },

  removeNodesFromUserSubgraph: (rawId: string, rawNodeIds: string[]): { ok: true } | { ok: false; message: string } => {
    if (isWorkspaceGraphMutationBlocked(get())) return readOnlyResult
    const id = String(rawId || '').trim()
    if (!id) return { ok: false, message: 'Missing subgraph id.' }
    const { graphData } = get()
    if (!graphData) return { ok: false, message: 'No graph loaded.' }
    const current = readSubgraphs(graphData)
    const sg = current.find(s => s.id === id) || null
    if (!sg) return { ok: false, message: 'Subgraph not found.' }
    const removeSet = new Set((rawNodeIds || []).map(v => String(v || '').trim()).filter(Boolean))
    const filtered = (sg.memberNodeIds || []).filter(nid => !removeSet.has(nid))
    return get().updateUserSubgraph(id, { memberNodeIds: filtered })
  },

  attachNodeToUserSubgraph: (rawId: string, rawNodeId: string): { ok: true } | { ok: false; message: string } => {
    if (isWorkspaceGraphMutationBlocked(get())) return readOnlyResult
    const id = String(rawId || '').trim()
    const nodeId = String(rawNodeId || '').trim()
    if (!id) return { ok: false, message: 'Missing subgraph id.' }
    if (!nodeId) return { ok: false, message: 'Missing node id.' }
    const { graphData } = get()
    if (!graphData) return { ok: false, message: 'No graph loaded.' }
    if (!(graphData.nodes || []).some(node => String(node.id || '').trim() === nodeId)) {
      return { ok: false, message: 'Node not found.' }
    }
    const current = readSubgraphs(graphData)
    if (!current.some(subgraph => subgraph.id === id)) {
      return { ok: false, message: 'Subgraph not found.' }
    }
    const alreadyExclusive =
      current.some(subgraph => subgraph.id === id && subgraph.memberNodeIds.includes(nodeId)) &&
      current.every(subgraph => subgraph.id === id || !subgraph.memberNodeIds.includes(nodeId))
    if (alreadyExclusive) return { ok: true }

    const nextSubgraphs = current.map(subgraph => {
      const withoutNode = subgraph.memberNodeIds.filter(memberId => memberId !== nodeId)
      if (subgraph.id !== id) return { ...subgraph, memberNodeIds: withoutNode }
      return { ...subgraph, memberNodeIds: Array.from(new Set([...withoutNode, nodeId])) }
    })
    const nextGraphDataBase = writeSubgraphs(graphData, nextSubgraphs)
    const nextRevision = (get().graphDataRevision || 0) + 1
    const nextGraphData = withGraphDataRevision(nextGraphDataBase, nextRevision)
    set({ graphData: nextGraphData, graphDataRevision: nextRevision, graphValidationStatus: null, graphValidationTimestamp: null })
    set({ lifecycleStage: 'committed' })
    try {
      const nextWorkflowText = readGraphRagWorkflowJsonTextFromGraphData(nextGraphData)
      const currentWorkflowText = get().graphRagWorkflowJsonText
      if (nextWorkflowText !== currentWorkflowText) set({ graphRagWorkflowJsonText: nextWorkflowText })
    } catch { void 0 }
    try {
      applyLayoutAutosuggestFromMetadata(get, nextGraphData.metadata)
    } catch { void 0 }
    try {
      applyWidgetRegistryFromMetadata(get, nextGraphData.metadata, nextGraphData)
    } catch { void 0 }
    try {
      persistGraphDataToLocalStorage(nextGraphData)
    } catch {
      void 0
    }
    get().scheduleHistory(`Attach Node to Subgraph: ${nodeId} -> ${id}`)
    return { ok: true }
  },

  detachNodeFromUserSubgraph: (rawId: string, rawNodeId: string): { ok: true } | { ok: false; message: string } => {
    if (isWorkspaceGraphMutationBlocked(get())) return readOnlyResult
    const id = String(rawId || '').trim()
    const nodeId = String(rawNodeId || '').trim()
    if (!id) return { ok: false, message: 'Missing subgraph id.' }
    if (!nodeId) return { ok: false, message: 'Missing node id.' }
    const { graphData } = get()
    if (!graphData) return { ok: false, message: 'No graph loaded.' }
    const subgraph = readSubgraphs(graphData).find(candidate => candidate.id === id) || null
    if (!subgraph) return { ok: false, message: 'Subgraph not found.' }
    if (!subgraph.memberNodeIds.includes(nodeId)) {
      return { ok: false, message: 'Node is not attached to this subgraph.' }
    }
    return get().updateUserSubgraph(id, {
      memberNodeIds: subgraph.memberNodeIds.filter(memberId => memberId !== nodeId),
    })
  },

  removeUserSubgraph: (rawId: string) => {
    if (isWorkspaceGraphMutationBlocked(get())) return
    const id = String(rawId || '').trim()
    if (!id) return
    const { graphData } = get()
    if (!graphData) return

    const nextGraphDataBase = removeSubgraphFromGraphData(graphData, id)
    const nextRevision = (get().graphDataRevision || 0) + 1
    const nextGraphData = withGraphDataRevision(nextGraphDataBase, nextRevision)

    const gid = subgraphGroupId(id)
    const state = get()
    const nextCollapsed = gid ? (state.collapsedGroupIds || []).filter(x => x !== gid) : (state.collapsedGroupIds || [])
    const nextSelectedGroupId = state.selectedGroupId === gid ? null : state.selectedGroupId
    const nextSelectedGroupIds = (state.selectedGroupIds || []).filter(x => x !== gid)

    set({
      graphData: nextGraphData,
      graphDataRevision: nextRevision,
      collapsedGroupIds: nextCollapsed,
      selectedGroupId: nextSelectedGroupId,
      selectedGroupIds: nextSelectedGroupIds,
      graphValidationStatus: null,
      graphValidationTimestamp: null,
    })
    set({ lifecycleStage: 'committed' })
    try {
      const nextWorkflowText = readGraphRagWorkflowJsonTextFromGraphData(nextGraphData)
      const currentWorkflowText = get().graphRagWorkflowJsonText
      if (nextWorkflowText !== currentWorkflowText) set({ graphRagWorkflowJsonText: nextWorkflowText })
    } catch { void 0 }
    try {
      applyLayoutAutosuggestFromMetadata(get, nextGraphData.metadata)
    } catch { void 0 }
    try {
      applyWidgetRegistryFromMetadata(get, nextGraphData.metadata, nextGraphData)
    } catch { void 0 }
    try {
      persistGraphDataToLocalStorage(nextGraphData)
    } catch {
      void 0
    }
    get().scheduleHistory(`Remove Subgraph: ${id}`)
  },
  })
}
