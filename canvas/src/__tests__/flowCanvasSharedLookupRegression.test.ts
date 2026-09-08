import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { bindGroupsDrag } from '@/components/GraphCanvas/layers/groupsDrag'
import type { GraphGroup } from '@/components/GraphCanvas/layout/graphGroupsTypes'
import type { GraphNode } from '@/lib/graph/types'

export function testFlowCanvasLayoutFallbackSeedUsesSharedLookup() {
  const text = readFileSync(
    resolve(process.cwd(), 'src', 'components', 'FlowCanvas', 'useFlowCanvasLayoutState.ts'),
    'utf8',
  )

  if (!text.includes("cacheScope: 'flow-canvas-layout-state-scene-graph'") || !text.includes('preferCurrentGraphDataRefs: true')) {
    throw new Error('expected FlowCanvas layout state to build a shared scene-graph lookup for fallback seeding')
  }
  if (!text.includes("const node = sceneGraphNodeById?.get(id) || null")) {
    throw new Error('expected FlowCanvas fallback seed logic to read nodes from the shared scene-graph lookup')
  }
  if (text.includes("const node = nodes.find(entry => String(entry?.id || '').trim() === id) || null")) {
    throw new Error('expected FlowCanvas fallback seed logic to remove the raw array find scan once the shared lookup exists')
  }
}

export function testFlowCanvasRichMediaResizeUsesSharedNodePropsLookup() {
  const text = readFileSync(
    resolve(process.cwd(), 'src', 'components', 'FlowCanvas', 'FlowCanvasMediaOverlays.tsx'),
    'utf8',
  )

  if (!text.includes("const baseProps = sceneNodePropsByIdRef.current.get(id) || {}")) {
    throw new Error('expected FlowCanvas Rich Media resize start to reuse the shared scene-node props lookup')
  }
  if (!text.includes("const baseProps = sceneNodePropsByIdRef.current.get(node.id) || {}")) {
    throw new Error('expected FlowCanvas Rich Media resize commit to reuse the shared scene-node props lookup')
  }
  if (text.includes("store.graphData?.nodes?.find(entry => String(entry?.id || '') === id) || null")) {
    throw new Error('expected FlowCanvas Rich Media resize start to remove the raw store node array scan')
  }
  if (text.includes("store.graphData?.nodes?.find(entry => String(entry?.id || '') === node.id) || null")) {
    throw new Error('expected FlowCanvas Rich Media resize commit to remove the raw store node array scan')
  }
}

export function testGroupsLayerAltDragUsesSharedGraphLookup() {
  const text = readFileSync(
    resolve(process.cwd(), 'src', 'components', 'GraphCanvas', 'layers', 'groups.ts'),
    'utf8',
  )

  if (!text.includes("cacheScope: 'graph-canvas-groups-graph'") || !text.includes('const graphNodeById = graphLookup?.nodeById || new Map<string, GraphNode>()')) {
    throw new Error('expected groups layer to build a shared full-graph lookup for live group mutations')
  }
  if (!text.includes('bindGroupsDrag({') || !text.includes('    graphNodeById,')) {
    throw new Error('expected groups layer to pass its shared graph lookup to the drag owner')
  }
  const result = observeGroupAltDrag(false)
  if (result.lookups.length !== 1 || result.lookups[0] !== 'group') {
    throw new Error('expected Alt drag to resolve the group through one shared-map lookup')
  }
  if (result.writes[0]?.updates.properties?.retained !== 'source-owner') {
    throw new Error('expected Alt drag to preserve properties from the shared graph lookup')
  }
}

// Capture the real D3 start handler at its selection boundary; no DOM or source scan is needed.
export function observeGroupAltDrag(shiftKey: boolean) {
  const lookups: string[] = []
  const sourceNode: GraphNode = { id: 'group', label: 'Group', type: 'Subgraph', properties: { retained: 'source-owner' } }
  class ObservedLookup extends Map<string, GraphNode> {
    get(id: string) { lookups.push(id); return super.get(id) }
  }
  const group = (id: string, depth: number, zIndex: number): GraphGroup => ({
    id, label: id, depth, zIndex, memberNodeIds: [], style: {},
  })
  const selected = group('group', 1, 2)
  const visibleGroups = [selected, group('low', 1, -3), group('high', 1, 7), group('other-depth', 2, 99)]
  const writes: { id: string; updates: Partial<GraphNode> }[] = []
  let start: ((event: unknown, datum: GraphGroup) => void) | undefined
  type Args = Parameters<typeof bindGroupsDrag>[0]
  const labelSelection = { call(behavior: { on(name: string): unknown }) {
    start = behavior.on('start') as typeof start
  } } as unknown as Args['labelSelection']
  bindGroupsDrag({
    labelSelection, visibleGroups, parentGroupIdById: new Map(), nodeById: new Map(),
    graphNodeById: new ObservedLookup([[selected.id, sourceNode]]),
    schema: { behavior: {}, layout: {} } as Args['schema'], simulation: null,
    updateNode: (id, updates) => { writes.push({ id, updates }) },
    setSelectionSource: () => {}, selectGroup: () => {}, readExplicitBounds: () => null,
    computeBoundsAndLabel: () => { throw new Error('Alt z-order must not recompute group geometry') },
    applyComputedToGroup: () => { throw new Error('Alt z-order must not apply group geometry') },
    commitGroupBounds: () => { throw new Error('Alt z-order must not commit group bounds') },
  })
  if (!start) throw new Error('expected the drag owner to install its start handler')
  start({ sourceEvent: { altKey: true, shiftKey, stopPropagation() {} } }, selected)
  return { lookups, writes, sourceNode }
}
