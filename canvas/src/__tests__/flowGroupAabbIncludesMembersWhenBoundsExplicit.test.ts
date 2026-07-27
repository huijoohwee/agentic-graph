import { computeFlowGroupAabb, type FlowNativeScene } from '@/components/FlowCanvas/nativeRuntime'
import type { GraphGroup } from '@/components/GraphCanvas/layout/graphGroupsTypes'

export function testFlowGroupAabbExpandsExplicitBoundsToContainMembers() {
  const nodeById = new Map([
    ['A', { id: 'A', x: 100, y: 100, width: 50, height: 20 }],
    ['B', { id: 'B', x: 200, y: 140, width: 80, height: 40 }],
  ])

  const scene: FlowNativeScene = {
    nodes: Array.from(nodeById.values()) as any,
    edges: [] as any,
    nodeById: nodeById as any,
    groups: [] as any,
    groupIdsByNodeId: new Map(),
  }

  const group: GraphGroup = {
    id: 'subgraph:test',
    label: 'Test',
    source: 'userSubgraph',
    depth: 0,
    memberNodeIds: ['A', 'B'],
    style: {},
    bounds: { x: 0, y: 0, width: 10, height: 10 },
  }

  const aabb = computeFlowGroupAabb({ scene, group, paddingPx: 10, labelTopExtraPx: 0 })
  if (!aabb) throw new Error('expected group aabb')

  if (aabb.minX !== 0 || aabb.minY !== 0 || aabb.maxX !== 290 || aabb.maxY !== 190) {
    throw new Error('expected explicit group bounds to expand and contain member node bounds')
  }
}

export function testFlowGroupAabbExpandsToContainPinnedWidgetOverlayExtents() {
  const nodeById = new Map([
    ['A', { id: 'A', x: 100, y: 100, width: 50, height: 20 }],
  ])

  const scene: FlowNativeScene = {
    nodes: Array.from(nodeById.values()) as any,
    edges: [] as any,
    nodeById: nodeById as any,
    groups: [] as any,
    groupIdsByNodeId: new Map(),
  }

  const group: GraphGroup = {
    id: 'subgraph:test',
    label: 'Test',
    source: 'userSubgraph',
    depth: 0,
    memberNodeIds: ['A'],
    style: {},
    bounds: { x: 80, y: 80, width: 120, height: 80 },
  }

  const aabb = computeFlowGroupAabb({
    scene,
    group,
    paddingPx: 10,
    labelTopExtraPx: 0,
    overlayAabbByNodeId: {
      A: { minX: 60, minY: 70, maxX: 520, maxY: 620 },
    },
  })
  if (!aabb) throw new Error('expected group aabb')

  if (aabb.minX !== 60 || aabb.minY !== 70 || aabb.maxX !== 520 || aabb.maxY !== 620) {
    throw new Error('expected group aabb to expand to pinned widget overlay extents')
  }
}

export function testFlowGroupAabbUsesOverlayOnlyMemberBounds() {
  const scene: FlowNativeScene = {
    nodes: [],
    edges: [],
    nodeById: new Map(),
    overlayAabbByNodeId: {
      card: { minX: 100, minY: 120, maxX: 420, maxY: 300 },
      panel: { minX: 520, minY: 80, maxX: 980, maxY: 640 },
    },
    groups: [],
    groupIdsByNodeId: new Map(),
  }
  const group: GraphGroup = {
    id: 'subgraph:overlay-only',
    label: 'Overlay group',
    source: 'userSubgraph',
    depth: 0,
    memberNodeIds: ['card', 'panel'],
    style: {},
    autoBounds: true,
  }

  const aabb = computeFlowGroupAabb({ scene, group, paddingPx: 20, labelTopExtraPx: 12 })
  if (!aabb) throw new Error('expected overlay-only members to produce a visible group aabb')
  if (aabb.minX !== 80 || aabb.minY !== 48 || aabb.maxX !== 1000 || aabb.maxY !== 660) {
    throw new Error(`expected overlay-only group bounds with padding, got ${JSON.stringify(aabb)}`)
  }
}
