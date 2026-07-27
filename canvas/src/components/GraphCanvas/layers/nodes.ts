import * as d3 from 'd3';
import type { MutableRefObject } from 'react';
import type { GraphNode, GraphEdge, GraphData } from '@/lib/graph/types';
import type { GraphSchema } from '@/lib/graph/schema';
import type { PendingLink, TempLinkSelection } from '@/features/edge-creation';
import { finalizePendingEdge } from '@/features/edge-creation'
import { emitPropsPanelOpen } from '@/features/canvas/utils';
import {
  getNodeBaseFill,
  getNodeBaseStroke,
  getNodeMediaSpec,
  getRenderNodeRadius2d,
  hasNodeMedia,
} from '@/components/GraphCanvas/helpers';
import { DEFAULT_ZOOM_MAX_SCALE } from '@/lib/graph/layoutDefaults'
import { getPortHandlesConfig, readNodePortHandleVisualMetrics, shouldRenderNodePortHandleAsDot } from '@/components/GraphCanvas/portHandles';
import { getFlowPortHandlePosition2d, listFlowPortHandleDatums2d, type FlowPortHandleDatum2d } from '@/components/GraphCanvas/flowPortHandles2d'
import { bindGraphCanvasFlowPortHandleInteractions } from '@/components/GraphCanvas/flowPortHandleInteractions'
import { getNodeRectDimensions2d, getNodeRenderShape2d } from '@/components/GraphCanvas/nodeSizing2d';
import { buildNodeShapePathD } from '@/components/GraphCanvas/shapePaths2d';
import type { HoverInfo } from '@/components/GraphHoverTooltip'
import { isTooltipRelatedTarget } from '@/features/panels/ui/tooltipUtils'
import { useGraphStore } from '@/hooks/useGraphStore'
import { compareNodeZKey, type NodeZKey } from '@/lib/canvas/groupZOrder'
import { bindNodeDraggingWithGroupContainment } from '@/components/GraphCanvas/layers/nodesDragBinding'
import { createNodeGroupChevronSel } from '@/components/GraphCanvas/layers/nodesGroupChevrons'
import { getCachedGraphLookup } from '@/lib/graph/lookupCache'
import { hashScopedStringArraySignature } from '@/lib/hash/signature'
import { isMultiNodeSelectMode, resolveNodeSelectionGesture } from '@/lib/canvas/nodeSelectionGesture'

type GSelection = d3.Selection<SVGGElement, unknown, null, undefined>;

const readNumberProp = (props: Record<string, unknown>, key: string): number | null => {
  const raw = props[key]
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw
  if (typeof raw === 'string' && raw.trim()) {
    const n = Number(raw)
    if (Number.isFinite(n)) return n
  }
  return null
}

export const createNodesLayer = (args: {
  g: GSelection;
  graphData: GraphData;
  schema: GraphSchema;
  zoomOnDoubleClick: boolean;
  renderMediaAsNodes: boolean;
  mediaOverlayNodeIdSet?: Set<string>;
  panelOnlyNodeIdSet?: Set<string>;
  preferDomMediaOverlays?: boolean;
  mediaPanelDensity: 'default' | 'compact';
  nodeZKeyById?: Map<string, NodeZKey>;
  tempLinkSelRef: MutableRefObject<TempLinkSelection>;
  linkDragRef: MutableRefObject<PendingLink | null>;
  simulation: d3.Simulation<GraphNode, GraphEdge>;
  addEdge: (e: GraphEdge) => void;
  updateEdge: (id: string, u: Partial<GraphEdge>) => void;
  getSelectedEdgeId: () => string | null;
  enableEditorGestures?: boolean;
  onCommitNodePosition?: (args: { id: string; x: number; y: number }) => void;
  hoverEnabled?: boolean;
  setHoverInfo?: (updater: (prev: HoverInfo | null) => HoverInfo | null) => void;
  selectNode: (id: string | null) => void;
  selectEdge: (id: string | null) => void;
  setSelectionSource: (src: 'menu' | 'canvas' | 'toolbar' | 'editor' | 'unknown') => void;
  requestZoomSelection: () => void;
  toggleGroupCollapsed: (id: string) => void;
  edgeScroll?: { enabled: () => boolean; panByPx: (dx: number, dy: number) => void };
}): {
  nodeSel: d3.Selection<SVGElement, GraphNode, SVGGElement, unknown>;
  mediaSel: d3.Selection<SVGGraphicsElement, GraphNode, SVGGElement, unknown> | null;
  portHandlesSel: d3.Selection<SVGCircleElement, FlowPortHandleDatum2d, SVGGElement, unknown> | null;
  groupChevronSel: d3.Selection<SVGPathElement, GraphNode, SVGGElement, unknown> | null;
} => {
  const {
    g,
    graphData,
    schema,
    renderMediaAsNodes,
    mediaPanelDensity,
    zoomOnDoubleClick,
    nodeZKeyById,
    selectNode,
    selectEdge,
    setSelectionSource,
    requestZoomSelection,
    simulation,
    addEdge,
    updateEdge,
    getSelectedEdgeId,
    enableEditorGestures,
    onCommitNodePosition,
    hoverEnabled,
    setHoverInfo,
    toggleGroupCollapsed,
  } = args;

  const rawNodes = Array.isArray(graphData.nodes) ? graphData.nodes : [];
  const nodes = rawNodes;
  const preferDomMediaOverlays = args.preferDomMediaOverlays === true
  const mediaOverlayNodeIdSet = args.mediaOverlayNodeIdSet
  const panelOnlyNodeIdSet = args.panelOnlyNodeIdSet
  const renderNodes = (() => {
    if (!panelOnlyNodeIdSet) return nodes
    return nodes.filter(n => {
      const id = String(n.id)
      if (panelOnlyNodeIdSet?.has(id)) return false
      return true
    })
  })()
  const shapeByNodeId = new Map<string, ReturnType<typeof getNodeRenderShape2d>>();
  for (let i = 0; i < renderNodes.length; i += 1) {
    const n = renderNodes[i];
    shapeByNodeId.set(String(n.id), getNodeRenderShape2d(n, schema));
  }
  const mediaByNodeId = new Map<string, ReturnType<typeof getNodeMediaSpec>>();
  if (renderMediaAsNodes) {
    for (let i = 0; i < renderNodes.length; i += 1) {
      const n = renderNodes[i];
      const spec = getNodeMediaSpec(n);
      if (!spec) continue;
      mediaByNodeId.set(String(n.id), spec);
    }
  }
  const shouldHideNodeBody = (d: GraphNode): boolean => {
    const id = String(d.id)
    if (panelOnlyNodeIdSet?.has(id)) return true
    const props = (d.properties || {}) as Record<string, unknown>
    if (props['visual:preserveBody'] === true) return false
    if (!renderMediaAsNodes) return false
    const spec = mediaByNodeId.get(id)
    if (!spec) return false
    if (!preferDomMediaOverlays) return true
    if (!mediaOverlayNodeIdSet) return true
    if (!mediaOverlayNodeIdSet.has(id)) return false
    const x = (d as unknown as { x?: unknown }).x
    const y = (d as unknown as { y?: unknown }).y
    if (typeof x !== 'number' || typeof y !== 'number' || !Number.isFinite(x) || !Number.isFinite(y)) return false
    return true
  }

  const mediaSel: d3.Selection<SVGGraphicsElement, GraphNode, SVGGElement, unknown> | null = null;

  const nodeLayer = g.append('g').attr('data-kg-layer', 'nodes').style('pointer-events', 'all');

  const eligibleNodes = (() => {
    if (!Array.isArray(renderNodes) || renderNodes.length < 2) return renderNodes
    let hasAnyZ = false
    for (let i = 0; i < renderNodes.length; i += 1) {
      const n = renderNodes[i]
      const props = (n?.properties || {}) as Record<string, unknown>
      const z = props['visual:zIndex']
      if (typeof z === 'number' && Number.isFinite(z)) {
        hasAnyZ = true
        break
      }
    }
    if (!hasAnyZ) return renderNodes
    const readZ = (n: GraphNode): number => {
      const props = (n?.properties || {}) as Record<string, unknown>
      const z = props['visual:zIndex']
      return typeof z === 'number' && Number.isFinite(z) ? z : 0
    }
    return renderNodes
      .slice()
      .sort((a, b) => {
        const za = readZ(a)
        const zb = readZ(b)
        if (za !== zb) return za - zb
        return String(a.id || '').localeCompare(String(b.id || ''))
      })
  })();
  const circleNodes = eligibleNodes.filter(n => shapeByNodeId.get(String(n.id)) === 'circle');
  const rectNodes = eligibleNodes.filter(n => shapeByNodeId.get(String(n.id)) === 'rect');
  const diamondNodes = eligibleNodes.filter(n => shapeByNodeId.get(String(n.id)) === 'diamond');
  const hexNodes = eligibleNodes.filter(n => shapeByNodeId.get(String(n.id)) === 'hex');

  nodeLayer
    .selectAll('circle')
    .data(circleNodes)
    .enter()
    .append('circle')
    .attr('fill', 'transparent')
    .attr('r', (d: GraphNode) => getRenderNodeRadius2d(d, schema))

  nodeLayer
    .selectAll('rect')
    .data(rectNodes)
    .enter()
    .append('rect')
    .attr('fill', 'transparent')
    .attr('rx', (d: GraphNode) => getRenderNodeRadius2d(d, schema) * 0.22)
    .attr('ry', (d: GraphNode) => getRenderNodeRadius2d(d, schema) * 0.22)
    .attr('x', (d: GraphNode) => {
        const { width } = getNodeRectDimensions2d(d, schema)
        return (d.x ?? 0) - width / 2;
    })
    .attr('y', (d: GraphNode) => {
        const { height } = getNodeRectDimensions2d(d, schema)
        return (d.y ?? 0) - height / 2;
    })
    .attr('width', (d: GraphNode) => {
        return getNodeRectDimensions2d(d, schema).width
    })
    .attr('height', (d: GraphNode) => {
        return getNodeRectDimensions2d(d, schema).height
    })

  nodeLayer
    .selectAll('path[data-kg-node-shape="diamond"]')
    .data(diamondNodes)
    .enter()
    .append('path')
    .attr('data-kg-node-shape', 'diamond')
    .attr('fill', 'transparent')
    .attr('transform', (d: GraphNode) => {
      const x = typeof d.x === 'number' && Number.isFinite(d.x) ? d.x : 0;
      const y = typeof d.y === 'number' && Number.isFinite(d.y) ? d.y : 0;
      return `translate(${x},${y})`;
    })
    .attr('d', (d: GraphNode) => {
      const { width, height } = getNodeRectDimensions2d(d, schema);
      return buildNodeShapePathD({ shape: 'diamond', width, height });
    })

  nodeLayer
    .selectAll('path[data-kg-node-shape="hex"]')
    .data(hexNodes)
    .enter()
    .append('path')
    .attr('data-kg-node-shape', 'hex')
    .attr('fill', 'transparent')
    .attr('transform', (d: GraphNode) => {
      const x = typeof d.x === 'number' && Number.isFinite(d.x) ? d.x : 0;
      const y = typeof d.y === 'number' && Number.isFinite(d.y) ? d.y : 0;
      return `translate(${x},${y})`;
    })
    .attr('d', (d: GraphNode) => {
      const { width, height } = getNodeRectDimensions2d(d, schema);
      return buildNodeShapePathD({ shape: 'hex', width, height });
    })

  const node = nodeLayer.selectAll<SVGElement, GraphNode>('circle,rect,path[data-kg-node-shape]')
  node
    .attr('data-node-id', (d: GraphNode) => String(d.id))
    .style('display', (d: GraphNode) => {
      const id = String(d.id)
      if (panelOnlyNodeIdSet?.has(id)) return 'none'
      return null
    })
    .style('pointer-events', (d: GraphNode) => {
      const id = String(d.id)
      if (panelOnlyNodeIdSet?.has(id)) return 'none'
      return 'all'
    })
     .attr('fill', (d: GraphNode) => (shouldHideNodeBody(d) ? 'transparent' : getNodeBaseFill(d, schema)))
    .attr('stroke', (d: GraphNode) => {
      if (shouldHideNodeBody(d)) return 'transparent'
      return getNodeBaseStroke(d, schema)
    })
    .attr('stroke-width', (d: GraphNode) => {
      const props = (d.properties || {}) as Record<string, unknown>
      const visualStrokeWidth = typeof props['visual:strokeWidth'] === 'number' ? (props['visual:strokeWidth'] as number) : NaN
      if (Number.isFinite(visualStrokeWidth) && visualStrokeWidth >= 0) return visualStrokeWidth
      const w = schema.nodeStroke?.[d.type]?.width
      if (typeof w === 'number' && Number.isFinite(w) && w >= 0) return w
      return 1.5
    })
    .style('filter', (d: GraphNode) => {
      if (shouldHideNodeBody(d)) return null
      const props = (d.properties || {}) as Record<string, unknown>
      const glow = readNumberProp(props, 'visual:glowIntensity')
      if (glow == null) return null
      const t = glow < 0 ? 0 : glow > 1 ? 1 : glow
      if (t <= 0) return null
      const blurPx = Math.round(2 + t * 10)
      const fill = getNodeBaseFill(d, schema)
      return `drop-shadow(0 0 ${blurPx}px ${fill})`
    })
    .classed('kg-node-pulse', (d: GraphNode) => {
      if (shouldHideNodeBody(d)) return false
      const props = (d.properties || {}) as Record<string, unknown>
      const pulse = readNumberProp(props, 'visual:pulseSpeed')
      if (pulse == null) return false
      const t = pulse < 0 ? 0 : pulse > 1 ? 1 : pulse
      return t > 0
    })
    .style('--kg-pulse-duration', (d: GraphNode) => {
      if (shouldHideNodeBody(d)) return null
      const props = (d.properties || {}) as Record<string, unknown>
      const pulse = readNumberProp(props, 'visual:pulseSpeed')
      if (pulse == null) return null
      const t = pulse < 0 ? 0 : pulse > 1 ? 1 : pulse
      if (t <= 0) return null
      const seconds = (4 - 3.3 * t).toFixed(2)
      return `${seconds}s`
    })
    .attr('stroke-dasharray', () => null)
    .style('user-select', 'none')
    .style('cursor', 'pointer');

  const mediaInteractiveSel: d3.Selection<SVGElement, GraphNode, SVGGElement, unknown> | null = null

  const groupChevronSel = createNodeGroupChevronSel({ g, nodes: renderNodes })

  if (nodeZKeyById) {
    const keyForId = (id: string): NodeZKey =>
      nodeZKeyById.get(id) || { id, groupDepth: -1, groupSize: Number.POSITIVE_INFINITY, zIndex: 0, zMode: 'group', yIndex: 0, xIndex: 0 }
    const cmp = (a: GraphNode, b: GraphNode) => compareNodeZKey(keyForId(String(a.id)), keyForId(String(b.id)))
    node.sort(cmp)
    if (groupChevronSel) groupChevronSel.sort(cmp)
  }

  if (schema.behavior?.allowNodeDrag !== false) {
    bindNodeDraggingWithGroupContainment({
      g,
      nodeSel: node as d3.Selection<SVGElement, GraphNode, SVGGElement, unknown>,
      mediaInteractiveSel,
      simulation,
      graphData,
      schema,
      onCommitNodePosition,
      edgeScroll: args.edgeScroll,
    })
  }

  const onContextMenu = (event: MouseEvent, d: GraphNode) => {
    event.preventDefault();
    event.stopPropagation();
    setSelectionSource('menu');
    selectEdge(null);
    selectNode(String(d.id));
  }

  const onClick = (event: MouseEvent, d: GraphNode) => {
    if ((event as unknown as { defaultPrevented?: unknown }).defaultPrevented) return
    const btn = (event as unknown as { button?: unknown }).button
    if (typeof btn === 'number' && btn !== 0) return
    event.stopPropagation();
    const id = String(d.id || '').trim()
    if (!id) return
    const mode = schema?.behavior?.selectMode || 'single'
    const selectionGesture = resolveNodeSelectionGesture({
      mode,
      shiftKey: event.shiftKey,
      metaKey: (event as unknown as { metaKey?: boolean }).metaKey,
      ctrlKey: (event as unknown as { ctrlKey?: boolean }).ctrlKey,
    })
    if (selectionGesture === 'toggle') {
      setSelectionSource('canvas')
      useGraphStore.getState().toggleNodeSelectionAdditive(id)
      return
    }
    const editorGestures = enableEditorGestures === true
    const allowEdgeCreation = schema?.behavior?.allowEdgeCreation !== false
    if (editorGestures && allowEdgeCreation) {
      if (args.linkDragRef.current) {
        finalizePendingEdge(
          String(d.id),
          null,
          graphData,
          getSelectedEdgeId(),
          args.tempLinkSelRef,
          args.linkDragRef,
          addEdge,
          updateEdge,
          id => selectEdge(id),
          src => setSelectionSource(src),
          schema,
          { label: 'link' },
        )
        return
      }
    }
    setSelectionSource('canvas');
    selectEdge(null);
    if (isMultiNodeSelectMode(mode)) {
      try {
        useGraphStore.getState().selectNodesExpanded({ nodeIds: [id], activeNodeId: id })
      } catch {
        selectNode(id)
      }
      return
    }
    selectNode(id);
  }

  const onDblClick = (event: MouseEvent, d: GraphNode) => {
    event.stopPropagation();
    const props = (d.properties || {}) as Record<string, unknown>
    const groupId = typeof props['kg:groupId'] === 'string' ? String(props['kg:groupId'] || '').trim() : ''
    if (groupId) {
      setSelectionSource('canvas');
      selectEdge(null);
      selectNode(String(d.id));
      toggleGroupCollapsed(groupId)
      return
    }
    if (zoomOnDoubleClick) {
      requestZoomSelection();
    }
    emitPropsPanelOpen();
  }

  const onGroupChevronClick = (event: MouseEvent, d: GraphNode) => {
    event.stopPropagation()
    const props = (d.properties || {}) as Record<string, unknown>
    const groupId = typeof props['kg:groupId'] === 'string' ? String(props['kg:groupId'] || '').trim() : ''
    if (!groupId) return
    setSelectionSource('canvas')
    selectEdge(null)
    selectNode(String(d.id))
    toggleGroupCollapsed(groupId)
  }

  const onMouseOver = (event: MouseEvent, d: GraphNode) => {
    if (!hoverEnabled || !setHoverInfo) return
    const id = String(d.id)
    if (!id) return
    setHoverInfo(() => ({ kind: 'node', id, clientX: event.clientX, clientY: event.clientY }))
  }

  const onMouseMove = (event: MouseEvent, d: GraphNode) => {
    if (!hoverEnabled || !setHoverInfo) return
    const id = String(d.id)
    if (!id) return
    setHoverInfo(() => ({ kind: 'node', id, clientX: event.clientX, clientY: event.clientY }))
  }

  const onMouseOut = (event: MouseEvent, d: GraphNode) => {
    if (!hoverEnabled || !setHoverInfo) return
    const rt = (event as unknown as { relatedTarget?: unknown }).relatedTarget
    if (isTooltipRelatedTarget(rt)) return
    const id = String(d.id)
    if (!id) return
    setHoverInfo(prev => (prev && prev.kind === 'node' && prev.id === id ? null : prev))
  }

  ;(node as d3.Selection<SVGElement, GraphNode, SVGGElement, unknown>).on('contextmenu', onContextMenu)
  ;(node as d3.Selection<SVGElement, GraphNode, SVGGElement, unknown>).on('click', onClick)
  ;(node as d3.Selection<SVGElement, GraphNode, SVGGElement, unknown>).on('dblclick', onDblClick)
  ;(node as d3.Selection<SVGElement, GraphNode, SVGGElement, unknown>).on('mouseover', onMouseOver)
  ;(node as d3.Selection<SVGElement, GraphNode, SVGGElement, unknown>).on('mousemove', onMouseMove)
  ;(node as d3.Selection<SVGElement, GraphNode, SVGGElement, unknown>).on('mouseout', onMouseOut)
  if (mediaInteractiveSel) {
    mediaInteractiveSel.on('contextmenu', onContextMenu)
    mediaInteractiveSel.on('click', onClick)
    mediaInteractiveSel.on('dblclick', onDblClick)
    mediaInteractiveSel.on('mouseover', onMouseOver)
    mediaInteractiveSel.on('mousemove', onMouseMove)
    mediaInteractiveSel.on('mouseout', onMouseOut)
  }
  if (groupChevronSel) {
    groupChevronSel.on('click', onGroupChevronClick)
  }

  const portHandlesCfg = getPortHandlesConfig(schema)
  const portHandlesEnabled = portHandlesCfg.enabled
  const portHandlesSel = (() => {
    if (!portHandlesEnabled) return null
    const portLayer = g.append('g').attr('data-kg-layer', 'port-handles').style('pointer-events', 'all')
    const data = listFlowPortHandleDatums2d({ schema, nodes: renderNodes, edges: graphData.edges || [] })
    if (!data.length) return null
    return portLayer.selectAll<SVGCircleElement, FlowPortHandleDatum2d>('circle')
      .data(data, d => `${d.nodeId}:${d.dir}:${d.portKey}`).enter().append('circle')
      .attr('data-node-id', d => String(d.nodeId)).attr('data-port-dir', d => String(d.dir)).attr('data-port-key', d => String(d.portKey))
      .attr('r', portHandlesCfg.size).attr('fill', portHandlesCfg.fill).attr('stroke', portHandlesCfg.stroke).attr('stroke-width', portHandlesCfg.strokeWidth)
      .style('pointer-events', 'all')
  })()

  if (portHandlesSel) {
    const renderNodeLookupKey = hashScopedStringArraySignature(
      'graph-canvas-port-handle-render-nodes',
      renderNodes.map(node => `${String(node?.id || '').trim()}:${String(node?.type || '').trim()}`),
    )
    const nodeLookup = getCachedGraphLookup({
      cacheScope: 'graph-canvas-port-handle-render-nodes',
      graphData: { type: 'application/json', nodes: renderNodes, edges: [] },
      graphSemanticKey: renderNodeLookupKey,
    })
    const nodeById = nodeLookup?.nodeById || new Map<string, GraphNode>()
    const dynamicForNode = (n: GraphNode) => {
      const dims = getNodeRectDimensions2d(n, schema)
      return readNodePortHandleVisualMetrics({
        schema,
        nodeWidth: dims.width,
        nodeHeight: dims.height,
      })
    }
    portHandlesSel
      .attr('r', d => {
        const n = nodeById.get(d.nodeId)
        if (!n) return portHandlesCfg.size
        return dynamicForNode(n).sizePx
      })
      .attr('stroke-width', d => {
        const n = nodeById.get(d.nodeId)
        if (!n) return portHandlesCfg.strokeWidth
        const dynamic = dynamicForNode(n)
        return shouldRenderNodePortHandleAsDot(dynamic.sizePx) ? 0 : dynamic.strokeWidthPx
      })
      .attr('fill', d => {
        const n = nodeById.get(d.nodeId)
        if (!n) return portHandlesCfg.fill
        const dynamic = dynamicForNode(n)
        return shouldRenderNodePortHandleAsDot(dynamic.sizePx) ? portHandlesCfg.stroke : portHandlesCfg.fill
      })
      .attr('cx', d => {
        const n = nodeById.get(d.nodeId)
        if (!n) return 0
        return getFlowPortHandlePosition2d({ datum: d, node: n, schema }).x
      })
      .attr('cy', d => {
        const n = nodeById.get(d.nodeId)
        if (!n) return 0
        return getFlowPortHandlePosition2d({ datum: d, node: n, schema }).y
      })
    bindGraphCanvasFlowPortHandleInteractions({ selection: portHandlesSel, nodeById, graphData, schema, enableEditorGestures: enableEditorGestures === true,
      allowEdgeCreation: schema?.behavior?.allowEdgeCreation !== false, tempLinkSelRef: args.tempLinkSelRef, linkDragRef: args.linkDragRef,
      getSelectedEdgeId, addEdge, updateEdge, selectEdge, selectNode, setSelectionSource })
    if (nodeZKeyById) {
      const keyForId = (id: string): NodeZKey => nodeZKeyById.get(id) || { id, groupDepth: -1, groupSize: Number.POSITIVE_INFINITY, zIndex: 0, zMode: 'group', yIndex: 0, xIndex: 0 }
      portHandlesSel.sort((a, b) => compareNodeZKey(keyForId(a.nodeId), keyForId(b.nodeId)))
    }
  }

  return { nodeSel: node, mediaSel, portHandlesSel, groupChevronSel };
};
