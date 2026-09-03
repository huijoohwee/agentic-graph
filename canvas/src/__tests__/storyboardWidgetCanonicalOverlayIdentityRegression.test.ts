import { buildFrontmatterOverlayVisualIsolation } from '@/components/StoryboardWidgetCanvas/runtime/storyboardWidgetOverlaySurfaceVisibility'
import { getCachedStoryboardWidgetPlacementContext } from '@/components/StoryboardWidgetCanvas/runtime/storyboardWidgetRenderGraph'
import { resolveStoryboardWidgetOverlayElementIdentity } from '@/components/StoryboardWidgetCanvas/runtime/storyboardWidgetOverlaySurfaceElements'
import { computeFlowConnectedValuesBySchemaPath } from '@/lib/storyboardWidget/flowDataflow'
import {
  resolveStoryboardWidgetGraphDataForNodeAuthority,
  shouldPreferScopedGraphDataAuthority,
} from '@/lib/storyboardWidget/storyboardWidgetGraphAuthority'
import type { WidgetRegistryEntry } from '@/features/storyboard-widget-manager/widgetRegistryTypes'
import type { GraphData } from '@/lib/graph/types'

export function testStoryboardWidgetFrontmatterOverlayIdentityPreservesComposedWidgetIds() {
  const graph: GraphData = {
    type: 'Graph',
    metadata: {
      kind: 'frontmatter-flow',
      frontmatterMeta: {
        widget_bundle: {
          graph: {
            nodes_ref: ['ws:source::target-node'],
          },
        },
      },
    },
    nodes: [
      {
        id: 'ws:source::target-node',
        type: 'TextGeneration',
        label: 'Target node',
        properties: {},
      },
    ],
    edges: [],
  }

  const placement = getCachedStoryboardWidgetPlacementContext({
    graphData: graph,
    graphRevision: 90101,
    openWidgetNodeIds: [],
  })
  if (!placement) throw new Error('expected placement context')
  if (placement.frontmatterOverlayNodeIds.length !== 1 || placement.frontmatterOverlayNodeIds[0] !== 'ws:source::target-node') {
    throw new Error('expected frontmatter overlay ids to preserve the graph-owned composed node id before overlay rendering')
  }

  const identity = resolveStoryboardWidgetOverlayElementIdentity({
    graphMetaKind: 'frontmatter-flow',
    overlayNodeId: placement.frontmatterOverlayNodeIds[0],
    node: graph.nodes[0],
  })
  if (identity.overlayIdentityId !== 'ws:source::target-node' || identity.renderNodeId !== 'ws:source::target-node') {
    throw new Error('expected frontmatter overlay render identity to stay on the graph-owned composed node id')
  }
  if (identity.actionNodeId !== 'ws:source::target-node') {
    throw new Error('expected frontmatter overlay mutations to keep targeting the concrete graph node')
  }

  const coverage = buildFrontmatterOverlayVisualIsolation({
    renderGraphDataOverride: graph,
    frontmatterVisibleSceneDisplay: {
      displayNodes: [{ id: 'ws:source::target-node' }],
    },
    frontmatterRichMediaOverlayNodeIdsSnapshot: [],
    overlayEditorNodeIdsSnapshot: placement.frontmatterOverlayNodeIds,
    renderGraphEligibleNodeIds: new Set(['ws:source::target-node']),
  })
  if (!coverage.hasFullOverlayCoverageForVisibleNodes) {
    throw new Error('expected frontmatter overlay coverage to compare canonical and composed node ids')
  }

  const collectiveGraph: GraphData = {
    type: 'Graph',
    metadata: {
      kind: 'agentic-os-semantic',
      graphKind: 'agentic-os-semantic',
      baseGraphKind: 'frontmatter-flow',
      frontmatterMeta: {
        director_brief: { shots: [{ id: 'shot-1' }] },
        widget_bundle: {
          graph: {
            nodes_ref: ['rich-panel'],
          },
        },
      },
    },
    nodes: [
      {
        id: 'driver-widget',
        type: 'default',
        label: 'Driver Widget',
        properties: { 'flow:widgetFormId': 'fm:driver-widget' },
      },
      {
        id: 'rich-panel',
        type: 'FlowRichMediaPanel',
        label: 'Rich Panel',
        properties: {},
      },
      {
        id: 'display-section',
        type: 'Section',
        label: 'Display Section',
        properties: {},
      },
    ],
    edges: [],
  }
  const collectivePlacement = getCachedStoryboardWidgetPlacementContext({
    graphData: collectiveGraph,
    graphRevision: 90103,
    openWidgetNodeIds: [],
  })
  const collectiveIds = new Set(collectivePlacement?.frontmatterOverlayNodeIds || [])
  if (!collectiveIds.has('driver-widget') || !collectiveIds.has('rich-panel')) {
    throw new Error(`expected composed frontmatter overlay ids to include eligible widgets and rich panels, got ${Array.from(collectiveIds).join(',')}`)
  }
  if (collectiveIds.has('display-section')) {
    throw new Error('expected composed frontmatter overlay ids to exclude non-widget section nodes')
  }
}

export function testStoryboardWidgetConnectedValuesResolveCanonicalTargetNodeIds() {
  const graph: GraphData = {
    type: 'Graph',
    metadata: {
      kind: 'frontmatter-flow',
    },
    nodes: [
      {
        id: 'ws:source::producer-node',
        type: 'ProducerWidget',
        label: 'Producer',
        properties: { output: 'ready' },
      },
      {
        id: 'ws:source::target-node',
        type: 'TargetWidget',
        label: 'Target',
        properties: {},
      },
    ],
    edges: [
      {
        id: 'edge-1',
        label: 'producer to target',
        source: 'ws:source::producer-node',
        target: 'ws:source::target-node',
        properties: {
          'flow:sourcePortKey': 'out',
          'flow:targetPortKey': 'in',
        },
      },
    ],
  }
  const registry: WidgetRegistryEntry[] = [
    {
      id: 'producer',
      isEnabled: true,
      nodeTypeId: 'ProducerWidget',
      widgetTypeId: 'producer',
      formId: 'producer',
      fields: [],
      ports: [{ portKey: 'out', direction: 'output', schemaPath: 'properties.output' }],
      updatedAt: '',
    },
    {
      id: 'target',
      isEnabled: true,
      nodeTypeId: 'TargetWidget',
      widgetTypeId: 'target',
      formId: 'target',
      fields: [],
      ports: [{ portKey: 'in', direction: 'input', schemaPath: 'properties.input' }],
      updatedAt: '',
    },
  ]

  const connectedValuesByNodeId = computeFlowConnectedValuesBySchemaPath({
    graphData: graph,
    registry,
    targetNodeIds: new Set(['target-node']),
    graphRevision: 90102,
  })
  const connected = connectedValuesByNodeId.get('ws:source::target-node')
  if (!connected) {
    throw new Error('expected canonical connected-value target to resolve to the concrete composed graph node')
  }
  const value = connected['properties.input']?.value
  if (value !== 'ready') {
    throw new Error(`expected connected value to resolve through composed graph target, received ${String(value)}`)
  }
}

export function testStoryboardWidgetGraphAuthorityPrefersScopedSourceGraphAfterSourceFileSwitch() {
  const staleFlowCanvasGraph: GraphData = {
    type: 'Graph',
    metadata: {
      kind: 'frontmatter-flow',
      canvas2dRenderer: 'flow',
    },
    nodes: [
      { id: 'image-widget', type: 'ImageWidget', label: 'Image', properties: {} },
      { id: 'script-widget', type: 'ScriptWidget', label: 'Script', properties: {} },
      { id: 'artifact-widget', type: 'ArtifactWidget', label: 'Artifact', properties: {} },
      { id: 'cluster-widget', type: 'Group', label: 'Cluster', properties: {} },
    ],
    edges: [
      {
        id: 'edge:image-script',
        source: 'image-widget',
        target: 'script-widget',
        label: 'image to script',
        properties: {},
      },
    ],
  }
  const activeSourceGraph: GraphData = {
    type: 'Graph',
    metadata: {
      kind: 'frontmatter-flow',
      sourceLayerComposition: 'compose',
      canvas2dRenderer: 'storyboard',
    },
    nodes: [
      { id: 'source:active::image-widget', type: 'ImageWidget', label: 'Image', properties: {} },
      { id: 'source:active::script-widget', type: 'ScriptWidget', label: 'Script', properties: {} },
      { id: 'source:active::artifact-widget', type: 'ArtifactWidget', label: 'Artifact', properties: {} },
      { id: 'source:active::cluster-widget', type: 'Group', label: 'Cluster', properties: {} },
    ],
    edges: [
      {
        id: 'source:active::edge:image-script',
        source: 'source:active::image-widget',
        target: 'source:active::script-widget',
        label: 'image to script',
        properties: {},
      },
    ],
  }
  const activeOpenWidgetIds = [
    'source:active::image-widget',
    'source:active::script-widget',
    'source:active::artifact-widget',
  ]

  if (!shouldPreferScopedGraphDataAuthority({
    candidateGraphData: staleFlowCanvasGraph,
    authorityGraphData: activeSourceGraph,
    nodeIds: activeOpenWidgetIds,
  })) {
    throw new Error('expected Storyboard Widget graph authority to prefer the active scoped Source Files graph over stale Flow Canvas ids after a file switch')
  }

  const resolved = resolveStoryboardWidgetGraphDataForNodeAuthority({
    preferredGraphData: staleFlowCanvasGraph,
    authorityGraphData: activeSourceGraph,
    nodeIds: activeOpenWidgetIds,
  })
  if (resolved !== activeSourceGraph) {
    throw new Error('expected stale Flow Canvas nodes, groups/clusters, and edges to be unable to override the active Storyboard Widget source graph')
  }

  const retained = resolveStoryboardWidgetGraphDataForNodeAuthority({
    preferredGraphData: activeSourceGraph,
    authorityGraphData: staleFlowCanvasGraph,
    nodeIds: activeOpenWidgetIds,
  })
  if (retained !== activeSourceGraph) {
    throw new Error('expected an already scoped Storyboard Widget graph to remain authoritative after renderer switching')
  }
}
