import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import {
  buildSelectedEdgeEndpointNodeIdSet,
  readGraphEdgeEndpoints,
  readSelectedEdgeEndpointsById,
} from '@/lib/graph/edgeEndpoints'
import {
  buildSelectionAnchorIdSets,
  normalizeSelectionAnchorIds,
  normalizeSelectionAnchorIdsWithGroups,
  resolveNormalizedSelectionAnchorNodeIds,
  resolveSelectionAnchorNodeIds,
} from '@/lib/selection/anchorIds'

export function testSelectionAnchorIdsNormalizeSingleAndMultiSelectionInputs() {
  const single = normalizeSelectionAnchorIds({
    selectedNodeId: 'node-1',
    selectedEdgeId: 'edge-1',
    selectedNodeIds: [],
    selectedEdgeIds: [],
  })
  if (single.selectionNodeIds.join(',') !== 'node-1') {
    throw new Error(`expected single selected node id fallback, got ${single.selectionNodeIds.join(',')}`)
  }
  if (single.selectionEdgeIds.join(',') !== 'edge-1') {
    throw new Error(`expected single selected edge id fallback, got ${single.selectionEdgeIds.join(',')}`)
  }

  const multi = normalizeSelectionAnchorIds({
    selectedNodeId: 'ignored-node',
    selectedEdgeId: 'ignored-edge',
    selectedNodeIds: ['node-a', 'node-b'],
    selectedEdgeIds: ['edge-a'],
  })
  if (multi.selectionNodeIds.join(',') !== 'node-a,node-b') {
    throw new Error(`expected explicit selected node ids to win, got ${multi.selectionNodeIds.join(',')}`)
  }
  if (multi.selectionEdgeIds.join(',') !== 'edge-a') {
    throw new Error(`expected explicit selected edge ids to win, got ${multi.selectionEdgeIds.join(',')}`)
  }

  const withGroups = normalizeSelectionAnchorIdsWithGroups({
    selectedNodeId: null,
    selectedEdgeId: null,
    selectedGroupId: 'group-1',
    selectedNodeIds: [],
    selectedEdgeIds: [],
    selectedGroupIds: [],
  })
  if (withGroups.selectionGroupIds.join(',') !== 'group-1') {
    throw new Error(`expected single selected group id fallback, got ${withGroups.selectionGroupIds.join(',')}`)
  }

  const selectionSets = buildSelectionAnchorIdSets({
    selectedNodeId: null,
    selectedEdgeId: 'edge-2',
    selectedNodeIds: ['node-3'],
    selectedEdgeIds: ['edge-3'],
  })
  if (!selectionSets.selectedNodeIdSet.has('node-3') || selectionSets.selectedNodeIdSet.size !== 1) {
    throw new Error('expected shared selection set builder to preserve normalized node selections')
  }
  if (!selectionSets.selectedEdgeIdSet.has('edge-3') || selectionSets.selectedEdgeIdSet.size !== 1) {
    throw new Error('expected shared selection set builder to preserve normalized edge selections')
  }

  const graphData = {
    type: 'Graph',
    nodes: [
      { id: 'group-a::node-a', label: 'A', type: 'node', properties: {} },
      { id: 'node-b', label: 'B', type: 'node', properties: {} },
    ],
    edges: [],
  }
  const resolvedCanonicalIds = resolveSelectionAnchorNodeIds(graphData, ['node-a'])
  if (resolvedCanonicalIds.join(',') !== 'group-a::node-a') {
    throw new Error(`expected canonicalized selection id resolution to return graph node ids, got ${resolvedCanonicalIds.join(',')}`)
  }
  const resolvedNormalizedCanonicalIds = resolveNormalizedSelectionAnchorNodeIds(graphData, {
    selectedNodeId: 'node-a',
    selectedEdgeId: null,
    selectedNodeIds: [],
    selectedEdgeIds: [],
  })
  if (resolvedNormalizedCanonicalIds.join(',') !== 'group-a::node-a') {
    throw new Error(`expected normalized canonical selection resolution to return graph node ids, got ${resolvedNormalizedCanonicalIds.join(',')}`)
  }

  const selectedEdgeIdSet = new Set<string>(['edge-1', 'edge-2'])
  const edgeEndpointNodeIds = buildSelectedEdgeEndpointNodeIdSet(
    [
      { id: 'edge-1', source: { id: 'node-1.output' }, target: 'node-2.input' },
      { id: 'edge-2', source: 3, target: { id: 'node-4' } },
      { id: 'edge-3', source: 'ignored', target: 'ignored' },
    ],
    selectedEdgeIdSet,
  )
  if (
    !edgeEndpointNodeIds.has('node-1')
    || !edgeEndpointNodeIds.has('node-2')
    || !edgeEndpointNodeIds.has('3')
    || !edgeEndpointNodeIds.has('node-4')
    || edgeEndpointNodeIds.size !== 4
  ) {
    throw new Error('expected shared selected-edge endpoint helper to normalize object-form and dotted endpoint ids')
  }

  const directEndpoints = readGraphEdgeEndpoints({
    source: { id: 'node-5.port-a' },
    target: 6,
  })
  if (directEndpoints.src !== 'node-5' || directEndpoints.tgt !== '6') {
    throw new Error(`expected shared edge endpoint reader to normalize endpoints, got ${directEndpoints.src}:${directEndpoints.tgt}`)
  }
  const typedCellEndpoints = readGraphEdgeEndpoints({
    source: { key: 'source', type: 'string', value: 'node-7.output' },
    target: { key: 'target', type: 'string', value: 'node-8.input' },
  })
  if (typedCellEndpoints.src !== 'node-7' || typedCellEndpoints.tgt !== 'node-8') {
    throw new Error(`expected typed graph-cell endpoints to remain renderable, got ${typedCellEndpoints.src}:${typedCellEndpoints.tgt}`)
  }

  const selectedEndpoints = readSelectedEdgeEndpointsById(
    new Map<string, { source?: unknown; target?: unknown }>([
      ['edge-1', { source: 'node-a.out', target: { id: 'node-b' } }],
      ['edge-2', { source: 7, target: 'node-c.in' }],
    ]),
    ['edge-2', 'missing', 'edge-1', 'edge-2'],
  )
  const selectedEndpointSignature = selectedEndpoints.map(entry => `${entry.edgeId}:${entry.src}->${entry.tgt}`).join('|')
  if (selectedEndpointSignature !== 'edge-2:7->node-c|edge-1:node-a->node-b') {
    throw new Error(`expected shared selected-edge endpoint lookup to preserve unique order and normalized ids, got ${selectedEndpointSignature}`)
  }
}

export function testSelectionNormalizationReuseAdoptsSharedHookAcrossPanelConsumers() {
  const anchorIdsText = readFileSync(
    resolve(process.cwd(), 'src', 'lib', 'selection', 'anchorIds.ts'),
    'utf8',
  )
  const highlightText = readFileSync(
    resolve(process.cwd(), 'src', 'components', 'GraphCanvas', 'highlight.ts'),
    'utf8',
  )
  const datasetInspectorText = readFileSync(
    resolve(process.cwd(), 'src', 'features', 'panels', 'views', 'DatasetInspectorSection.tsx'),
    'utf8',
  )
  const statsSelectionText = readFileSync(
    resolve(process.cwd(), 'src', 'features', 'graph-stats', 'hooks', 'useStatsSelection.ts'),
    'utf8',
  )
  const selectionTargetsText = readFileSync(
    resolve(process.cwd(), 'src', 'lib', 'zoom', 'selectionTargets.ts'),
    'utf8',
  )
  const graphDataTableText = readFileSync(
    resolve(process.cwd(), 'src', 'lib', 'graph-data-table', 'ui', 'GraphDataTableTable.impl.tsx'),
    'utf8',
  )
  const edgeEndpointsText = readFileSync(
    resolve(process.cwd(), 'src', 'lib', 'graph', 'edgeEndpoints.ts'),
    'utf8',
  )
  const sceneImplText = readFileSync(
    resolve(process.cwd(), 'src', 'lib', 'three', 'Scene.impl.tsx'),
    'utf8',
  )
  const adjacencyText = readFileSync(
    resolve(process.cwd(), 'src', 'components', 'GraphCanvas', 'adjacency.ts'),
    'utf8',
  )
  const displayFilterText = readFileSync(
    resolve(process.cwd(), 'src', 'components', 'GraphCanvas', 'displayFilter.ts'),
    'utf8',
  )
  const linksLayerText = readFileSync(
    resolve(process.cwd(), 'src', 'components', 'GraphCanvas', 'layers', 'links.ts'),
    'utf8',
  )
  const edgeLabelsLayerText = readFileSync(
    resolve(process.cwd(), 'src', 'components', 'GraphCanvas', 'layers', 'edgeLabels.ts'),
    'utf8',
  )
  const simulationText = readFileSync(
    resolve(process.cwd(), 'src', 'components', 'GraphCanvas', 'simulation.ts'),
    'utf8',
  )
  const initializationText = readFileSync(
    resolve(process.cwd(), 'src', 'components', 'GraphCanvas', 'layout', 'initialization.ts'),
    'utf8',
  )
  const viewDerivationText = readFileSync(
    resolve(process.cwd(), 'src', 'components', 'GraphCanvas', 'viewDerivation.ts'),
    'utf8',
  )
  const graphConnectivityText = readFileSync(
    resolve(process.cwd(), 'src', 'components', 'GraphCanvas', 'layout', 'graphConnectivity.ts'),
    'utf8',
  )
  const collectiveFitText = readFileSync(
    resolve(process.cwd(), 'src', 'components', 'GraphCanvas', 'layout', 'collectiveFit.ts'),
    'utf8',
  )
  const portHandlesText = readFileSync(
    resolve(process.cwd(), 'src', 'components', 'GraphCanvas', 'portHandles.ts'),
    'utf8',
  )
  const simulationTickText = readFileSync(
    resolve(process.cwd(), 'src', 'components', 'GraphCanvas', 'sceneHandlers.simulationTick2d.ts'),
    'utf8',
  )
  const groupsLayerText = readFileSync(
    resolve(process.cwd(), 'src', 'components', 'GraphCanvas', 'layers', 'groups.ts'),
    'utf8',
  )
  const dragText = readFileSync(
    resolve(process.cwd(), 'src', 'components', 'GraphCanvas', 'drag.ts'),
    'utf8',
  )

  if (
    !anchorIdsText.includes('export function normalizeSelectionAnchorIds(')
    || !anchorIdsText.includes('export function useSelectionAnchorIds(')
    || !anchorIdsText.includes('export function normalizeSelectionAnchorIdsWithGroups(')
    || !anchorIdsText.includes('export function buildSelectionAnchorIdSets(')
    || !anchorIdsText.includes('export function resolveSelectionAnchorNodeIds(')
    || !anchorIdsText.includes('export function resolveNormalizedSelectionAnchorNodeIds(')
  ) {
    throw new Error('expected shared selection normalization, canonical resolution helpers, hook, and set builder in the upstream selection SSOT layer')
  }

  if (
    !edgeEndpointsText.includes("import { isPlainObject } from '@/lib/graph/value'")
    || !edgeEndpointsText.includes('if (isPlainObject(raw)) {')
    || !edgeEndpointsText.includes('export function readEdgeEndpointId(raw: unknown): string')
    || !edgeEndpointsText.includes('export function readGraphEdgeEndpoints(')
    || !edgeEndpointsText.includes('export function buildSelectedEdgeEndpointNodeIdSet(')
    || !edgeEndpointsText.includes('export function readSelectedEdgeEndpointsById<')
  ) {
    throw new Error('expected shared graph edge endpoint helpers in the upstream endpoint SSOT layer')
  }

  if (
    !highlightText.includes('export const normalizeSelectionIds = normalizeSelectionAnchorIds')
    || !highlightText.includes('export { useSelectionAnchorIds }')
  ) {
    throw new Error('expected GraphCanvas highlight helpers to reuse and re-export the shared selection normalization SSOT')
  }

  if (
    !adjacencyText.includes("buildScopedGraphSemanticKey('graph-canvas-adjacency'")
    || !adjacencyText.includes('const adjacencyCache = new Map<string, Map<string, Set<string>>>()')
    || !adjacencyText.includes('const { src, tgt } = readGraphEdgeEndpoints(e)')
    || adjacencyText.includes('const adjCache = new WeakMap<GraphLike, Map<string, Set<string>>>()')
    || adjacencyText.includes('const getEdgeEndpoints = (edge: GraphEdge)')
    || adjacencyText.includes('const coerceEndpointId = (value: EdgeEndpointLike)')
  ) {
    throw new Error('expected GraphCanvas adjacency to reuse shared edge endpoint normalization and semantic-keyed caching instead of local endpoint parsing and raw graph identity caches')
  }

  if (
    !displayFilterText.includes("import { readGraphEdgeEndpoints } from '@/lib/graph/edgeEndpoints'")
    || !displayFilterText.includes('const { src, tgt } = readGraphEdgeEndpoints(e)')
    || !displayFilterText.includes('const { src: srcId, tgt: tgtId } = readGraphEdgeEndpoints(e)')
    || displayFilterText.includes('const coerceEndpointId = (v: unknown): string => {')
  ) {
    throw new Error('expected GraphCanvas displayFilter to reuse shared edge endpoint normalization instead of local endpoint coercion')
  }

  if (
    !linksLayerText.includes("import { readEdgeEndpointId } from '@/lib/graph/edgeEndpoints'")
    || !linksLayerText.includes('return readEdgeEndpointId(endpoint)')
    || !linksLayerText.includes(".attr('data-source-id', (d: GraphEdge) => readEdgeEndpointId((d as any).source))")
    || !linksLayerText.includes(".attr('data-target-id', (d: GraphEdge) => readEdgeEndpointId((d as any).target))")
    || linksLayerText.includes('function coerceEdgeEndpointId(v: unknown): string {')
  ) {
    throw new Error('expected GraphCanvas links layer to reuse shared edge endpoint normalization instead of local endpoint coercion')
  }

  if (
    !edgeLabelsLayerText.includes("import { readEdgeEndpointId } from '@/lib/graph/edgeEndpoints'")
    || !edgeLabelsLayerText.includes(".attr('data-source-id', (d: GraphEdge) => readEdgeEndpointId((d as any).source))")
    || !edgeLabelsLayerText.includes(".attr('data-target-id', (d: GraphEdge) => readEdgeEndpointId((d as any).target))")
    || edgeLabelsLayerText.includes('function coerceEdgeEndpointId(v: unknown): string {')
  ) {
    throw new Error('expected GraphCanvas edge label layer to reuse shared edge endpoint normalization instead of local endpoint coercion')
  }

  if (
    !simulationText.includes("import { readGraphEdgeEndpoints } from '@/lib/graph/edgeEndpoints'")
    || !simulationText.includes('readGraphEdgeEndpoints(edge)')
    || !simulationText.includes("const { src: source, tgt: target } = readGraphEdgeEndpoints(e)")
    || simulationText.includes('const coerceEndpointId = (value: EdgeEndpointLike): string | null =>')
  ) {
    throw new Error('expected GraphCanvas simulation helpers to reuse shared edge endpoint normalization instead of local endpoint coercion')
  }

  if (
    !initializationText.includes("import { readGraphEdgeEndpoints } from '@/lib/graph/edgeEndpoints'")
    || !initializationText.includes('const { src: sourceId, tgt: targetId } = readGraphEdgeEndpoints(edge)')
    || !initializationText.includes('const { src: s, tgt: t } = readGraphEdgeEndpoints(e)')
    || initializationText.includes('const coerceEndpointId = (value: unknown): string | null => {')
  ) {
    throw new Error('expected GraphCanvas layout initialization helpers to reuse shared edge endpoint normalization instead of local endpoint coercion')
  }

  if (
    !viewDerivationText.includes("import { readGraphEdgeEndpoints } from '@/lib/graph/edgeEndpoints'")
    || !viewDerivationText.includes('const { src, tgt } = readGraphEdgeEndpoints(e)')
    || viewDerivationText.includes("typeof e.source === 'object' ? (e.source as { id?: unknown }).id : e.source")
  ) {
    throw new Error('expected GraphCanvas view derivation helpers to reuse shared edge endpoint normalization instead of raw endpoint coercion')
  }

  if (
    !graphConnectivityText.includes("import { readGraphEdgeEndpoints } from '@/lib/graph/edgeEndpoints'")
    || !graphConnectivityText.includes('const { src, tgt } = readGraphEdgeEndpoints(edge)')
    || graphConnectivityText.includes("typeof edge?.source === 'object'")
  ) {
    throw new Error('expected GraphCanvas graph connectivity helpers to reuse shared edge endpoint normalization instead of raw endpoint coercion')
  }

  if (
    !collectiveFitText.includes("import { readGraphEdgeEndpoints } from '@/lib/graph/edgeEndpoints'")
    || !collectiveFitText.includes('const { src: sourceId, tgt: targetId } = readGraphEdgeEndpoints(edge)')
    || collectiveFitText.includes("typeof edge?.source === 'object'")
  ) {
    throw new Error('expected GraphCanvas collective fit helpers to reuse shared edge endpoint normalization instead of raw endpoint coercion')
  }

  if (
    !portHandlesText.includes("import { readGraphEdgeEndpoints } from '@/lib/graph/edgeEndpoints'")
    || !portHandlesText.includes('const { src, tgt } = readGraphEdgeEndpoints(e)')
    || portHandlesText.includes("typeof e.source === 'object'")
  ) {
    throw new Error('expected GraphCanvas port handle helpers to reuse shared edge endpoint normalization instead of raw endpoint coercion')
  }

  if (
    !simulationTickText.includes("import { readGraphEdgeEndpoints } from '@/lib/graph/edgeEndpoints'")
    || !simulationTickText.includes('const { src: sourceId, tgt: targetId } = readGraphEdgeEndpoints(e)')
    || simulationTickText.includes("typeof e.source === 'object'")
  ) {
    throw new Error('expected GraphCanvas simulation tick helpers to reuse shared edge endpoint normalization instead of raw endpoint coercion')
  }

  if (
    !groupsLayerText.includes("import { readGraphEdgeEndpoints } from '@/lib/graph/edgeEndpoints'")
    || !groupsLayerText.includes('const { src: s, tgt: t } = readGraphEdgeEndpoints(e)')
    || groupsLayerText.includes("typeof e.source === 'object' ? (e.source as { id?: unknown }).id : e.source")
  ) {
    throw new Error('expected GraphCanvas groups layer helpers to reuse shared edge endpoint normalization instead of raw endpoint coercion')
  }

  if (
    !dragText.includes("import { readGraphEdgeEndpoints } from '@/lib/graph/edgeEndpoints'")
    || !dragText.includes('const { src: sId, tgt: tId } = readGraphEdgeEndpoints(d)')
    || dragText.includes("typeof d.source === 'object' ? (d.source as GraphNode).id : d.source")
  ) {
    throw new Error('expected GraphCanvas drag helpers to reuse shared edge endpoint normalization instead of raw endpoint coercion')
  }

  if (
    !datasetInspectorText.includes('const selectionAnchorIds = useSelectionAnchorIds({')
    || datasetInspectorText.includes('React.useMemo<SelectionAnchorIds>(')
    || datasetInspectorText.includes('normalizeSelectionIds({')
  ) {
    throw new Error('expected DatasetInspectorSection to reuse the shared selection anchor hook instead of local normalization memo blocks')
  }

  if (
    !statsSelectionText.includes('const selectionAnchorIds = useSelectionAnchorIds({')
    || statsSelectionText.includes('React.useMemo<SelectionAnchorIds>(')
    || statsSelectionText.includes('normalizeSelectionIds({')
  ) {
    throw new Error('expected useStatsSelection to reuse the shared selection anchor hook instead of local normalization memo blocks')
  }

  if (
    !selectionTargetsText.includes('normalizeSelectionAnchorIdsWithGroups({')
    || !selectionTargetsText.includes('resolveSelectionAnchorNodeIds(graphData, selectionNodeIds)')
    || !selectionTargetsText.includes('readSelectedEdgeEndpointsById(graphLookup?.edgeById, selectionEdgeIds)')
    || selectionTargetsText.includes('const normalizeSelectionIds = (')
    || selectionTargetsText.includes('const resolveSelectionNodeIds = (')
    || selectionTargetsText.includes('const getEdgeEndpoints = (edge: GraphEdge)')
    || selectionTargetsText.includes('const coerceEndpointId = (value: EdgeEndpointLike)')
    || selectionTargetsText.includes('edges.find(e => String(e.id) === edgeId)')
  ) {
    throw new Error('expected selectionTargets zoom helpers to reuse the shared group-aware normalization, canonical node resolution, and selected-edge endpoint helpers')
  }

  if (
    !graphDataTableText.includes('return buildSelectionAnchorIdSets({')
    || graphDataTableText.includes('const { selectionNodeIds, selectionEdgeIds } = normalizeSelectionIds({')
    || !graphDataTableText.includes("cacheScope: 'graph-data-table-root-graph'")
    || !graphDataTableText.includes('getCachedGraphLookup({')
    || !graphDataTableText.includes('graphLookup.incidentEdgesByNodeId.get(nodeId)')
  ) {
    throw new Error('expected GraphDataTable to reuse the shared normalized selection set builder and root graph lookup cache for adjacency reads')
  }

  if (
    !sceneImplText.includes('const selectedEdgeEndpointNodeIdSet = buildSelectedEdgeEndpointNodeIdSet(data.edges, selectedEdgeIdSet)')
    || sceneImplText.includes('const src = String(e.source)')
  ) {
    throw new Error('expected Three scene selection endpoint shaping to reuse the shared selected-edge endpoint helper')
  }
}
