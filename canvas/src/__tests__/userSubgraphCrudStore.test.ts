import { useGraphStore } from '@/hooks/useGraphStore'
import { deriveGraphGroups } from '@/components/GraphCanvas/layout/graphGroups'
import { readSubgraphs, subgraphGroupId } from '@/lib/graph/subgraphs'

export function testUserSubgraphCrudCreateDerivesGroup() {
  const store = useGraphStore.getState()
  store.clearGraphData()
  store.setGraphData({
    type: 'Graph',
    nodes: [
      { id: 'n1', type: 'Node', label: 'N1', properties: {}, metadata: {} },
      { id: 'n2', type: 'Node', label: 'N2', properties: {}, metadata: {} },
      { id: 'n3', type: 'Node', label: 'N3', properties: {}, metadata: {} },
    ],
    edges: [],
    metadata: {},
  } as never)

  const res = store.createUserSubgraph({ label: 'My Group', memberNodeIds: ['n1', 'n2'] })
  if (res.ok === false) throw new Error(`expected ok, got ${res.message}`)
  const gid = subgraphGroupId(res.id)
  if (!gid) throw new Error('expected group id')

  const g = useGraphStore.getState().graphData
  const subgraphs = readSubgraphs(g)
  if (subgraphs.length !== 1) throw new Error(`expected 1 subgraph, got ${subgraphs.length}`)
  if (subgraphs[0]?.label !== 'My Group') throw new Error(`expected label My Group, got ${String(subgraphs[0]?.label || '')}`)

  const groups = deriveGraphGroups(g as never)
  const gg = groups.find(x => x.id === gid) || null
  if (!gg) throw new Error('expected derived graph group for subgraph')
  if ((gg.memberNodeIds || []).length !== 2) throw new Error(`expected 2 members, got ${(gg.memberNodeIds || []).length}`)

  const child = store.createUserSubgraph({ label: 'Child Group Panel', memberNodeIds: ['n3'], autoBounds: true })
  if (child.ok === false) throw new Error(child.message)
  const parent = store.createUserSubgraph({
    label: 'Parent Group Panel',
    memberNodeIds: [],
    childGroupIds: [res.id, child.id],
    autoBounds: true,
  })
  if (parent.ok === false) throw new Error(parent.message)
  const nested = readSubgraphs(useGraphStore.getState().graphData)
  if (nested.filter(group => group.parentId === parent.id).length !== 2) {
    throw new Error('expected a Group Panel to atomically adopt nested Group Panels')
  }
  const parentGroup = deriveGraphGroups(useGraphStore.getState().graphData as never)
    .find(group => group.id === subgraphGroupId(parent.id))
  if (!parentGroup || parentGroup.memberNodeIds.length !== 3 || parentGroup.connectable !== false) {
    throw new Error('expected handle-free parent Group Panel bounds to include all descendant nodes')
  }
}

export function testUserSubgraphCrudPreventsParentCycle() {
  const store = useGraphStore.getState()
  store.clearGraphData()
  store.setGraphData({
    type: 'Graph',
    nodes: [
      { id: 'n1', type: 'Node', label: 'N1', properties: {}, metadata: {} },
      { id: 'n2', type: 'Node', label: 'N2', properties: {}, metadata: {} },
    ],
    edges: [],
    metadata: {},
  } as never)

  const a = store.createUserSubgraph({ label: 'A', memberNodeIds: ['n1'] })
  const b = store.createUserSubgraph({ label: 'B', memberNodeIds: ['n2'] })
  if (a.ok === false) throw new Error(`expected ok for A, got ${a.message}`)
  if (b.ok === false) throw new Error(`expected ok for B, got ${b.message}`)

  const setA = store.updateUserSubgraph(a.id, { parentId: b.id })
  if (setA.ok === false) throw new Error(`expected ok setting parent, got ${setA.message}`)
  const setB = store.updateUserSubgraph(b.id, { parentId: a.id })
  if (setB.ok === true) throw new Error('expected cycle prevention to fail')
}

export function testUserSubgraphDeleteClearsCollapsedAndSelection() {
  const store = useGraphStore.getState()
  store.clearGraphData()
  store.setGraphData({
    type: 'Graph',
    nodes: [{ id: 'n1', type: 'Node', label: 'N1', properties: {}, metadata: {} }],
    edges: [],
    metadata: {},
  } as never)

  const res = store.createUserSubgraph({ label: 'G', memberNodeIds: ['n1'] })
  if (res.ok === false) throw new Error(`expected ok, got ${res.message}`)
  const gid = subgraphGroupId(res.id)
  if (!gid) throw new Error('expected group id')

  store.setCollapsedGroupIds([gid])
  store.selectGroup(gid)
  store.removeUserSubgraph(res.id)

  const next = useGraphStore.getState()
  if ((next.collapsedGroupIds || []).includes(gid)) throw new Error('expected collapsedGroupIds to remove deleted group')
  if (next.selectedGroupId === gid) throw new Error('expected selection to clear deleted group')
}

export function testUserSubgraphClusterKindDerivesClusterStyle() {
  const store = useGraphStore.getState()
  store.clearGraphData()
  store.setGraphData({
    type: 'Graph',
    nodes: [{ id: 'n1', type: 'Node', label: 'N1', properties: {}, metadata: {} }],
    edges: [],
    metadata: {},
  } as never)

  const res = store.createUserSubgraph({ label: 'C', kind: 'cluster', memberNodeIds: ['n1'] })
  if (res.ok === false) throw new Error(`expected ok, got ${res.message}`)
  const gid = subgraphGroupId(res.id)
  if (!gid) throw new Error('expected group id')
  const g = useGraphStore.getState().graphData
  const groups = deriveGraphGroups(g as never)
  const gg = groups.find(x => x.id === gid) || null
  if (!gg) throw new Error('expected derived graph group')
  if (gg.style?.stroke !== '#0EA5E9') throw new Error(`expected cluster stroke #0EA5E9, got ${String(gg.style?.stroke || '')}`)
}
