import * as d3 from 'd3';
import type { MutableRefObject } from 'react';
import type { GraphNode } from '@/lib/graph/types';
import type { GraphSchema } from '@/lib/graph/schema';
import { truncateTextWithEllipsis, truncateTextWithWordEllipsis, estimateMaxCharsForWidthPx } from '@/components/GraphCanvas/layout/utils'
import { getNodeRenderShape2d } from '@/components/GraphCanvas/nodeSizing2d'
import { getNodeLabelFullText2d, isWordCloudLabelNode2d, readNodeLabelFontSize2d } from '@/components/GraphCanvas/labelLayout2d'
import { readLabelPresentation2d } from '@/lib/canvas/labelPresentation2d'
import { getNodeLabelColor } from '@/components/GraphCanvas/helpers'
import { isTooltipRelatedTarget } from '@/features/panels/ui/tooltipUtils'
import type { HoverInfo } from '@/components/GraphHoverTooltip'
import { compareNodeZKey, type NodeZKey } from '@/lib/canvas/groupZOrder'
import { useGraphStore } from '@/hooks/useGraphStore'
import { activateMultiNodeSelectModeForShift, isMultiNodeSelectMode, resolveNodeSelectionGesture } from '@/lib/canvas/nodeSelectionGesture'

type GSelection = d3.Selection<SVGGElement, unknown, null, undefined>;

export const createLabelsLayer = (args: {
  g: GSelection;
  nodes: GraphNode[];
  schema: GraphSchema;
  documentSemanticMode?: 'document' | 'keyword'
  nodeZKeyById?: Map<string, NodeZKey>;
  panelOnlyNodeIdSet?: Set<string>;
  labelsSelRef: MutableRefObject<d3.Selection<SVGTextElement, GraphNode, SVGGElement, unknown> | null>;
  hoverEnabled?: boolean;
  setHoverInfo?: (updater: (prev: HoverInfo | null) => HoverInfo | null) => void;
  selectNode: (id: string | null) => void;
  selectEdge: (id: string | null) => void;
  setSelectionSource: (src: 'menu' | 'canvas' | 'toolbar' | 'editor' | 'unknown') => void;
}) => {
  const { g, nodes: rawNodes, schema, documentSemanticMode, nodeZKeyById, panelOnlyNodeIdSet, labelsSelRef, hoverEnabled, setHoverInfo, selectNode, selectEdge, setSelectionSource } = args;

  const nodes = panelOnlyNodeIdSet ? rawNodes.filter(n => !panelOnlyNodeIdSet.has(String(n.id))) : rawNodes;

  const labelLayer = g.append('g').attr('data-kg-layer', 'labels').style('pointer-events', 'all');
  
  const labelPresentation = readLabelPresentation2d({ schema, documentSemanticMode })
  const labelFontSize = labelPresentation.nodeFontSizePx
  const labelFontFamily = 'inherit';
  const labelFill = labelPresentation.color || 'var(--kg-canvas-label-fill)';
  const haloColor = labelPresentation.haloColor || 'var(--kg-canvas-label-halo)';
  const haloWidth = labelPresentation.haloWidthPx
  const isWordCloudNode = (d: GraphNode): boolean => isWordCloudLabelNode2d(d)
  const getLabelOpacityForNode = (d: GraphNode): number => {
    const props = (d.properties || {}) as Record<string, unknown>
    if (props['visual:hideLabel'] === true) return 0
    const raw = props['visual:opacity']
    const n = typeof raw === 'number' ? raw : typeof raw === 'string' && raw.trim() ? Number(raw) : Number.NaN
    if (!Number.isFinite(n)) return 1
    return Math.max(0.35, Math.min(1, n))
  }
  const getLabelFontSizeForNode = (d: GraphNode): number => readNodeLabelFontSize2d(d, labelFontSize)
  const getBaseDxForNode = (d: GraphNode) => {
    if (isWordCloudNode(d)) return 0
    if (getNodeRenderShape2d(d, schema) !== 'circle') return 0
    return schema.labelStyles?.offset?.dx ?? 12
  }
  const getBaseAnchorForNode = (d: GraphNode) => {
    if (isWordCloudNode(d)) return 'middle'
    if (getNodeRenderShape2d(d, schema) !== 'circle') return 'middle'
    const dx = getBaseDxForNode(d)
    return dx >= 0 ? 'start' : 'end'
  }

  const label = labelLayer
    .selectAll<SVGTextElement, GraphNode>('text')
    .data(nodes)
    .enter()
    .append('text')
    .attr('class', 'node-label')
    .attr('data-node-id', (d: GraphNode) => String(d.id))
    .attr('data-kg-word-cloud', (d: GraphNode) => (isWordCloudNode(d) ? '1' : '0'))
    .attr('font-size', (d: GraphNode) => getLabelFontSizeForNode(d))
    .attr('font-family', labelFontFamily)
    .attr('font-weight', (d: GraphNode) => (isWordCloudNode(d) ? '700' : null))
    .attr('letter-spacing', '0')
    .attr('data-kg-label-fill', (d: GraphNode) => getNodeLabelColor(d, schema))
    .attr('fill', (d: GraphNode) => getNodeLabelColor(d, schema))
    .attr('fill-opacity', (d: GraphNode) => getLabelOpacityForNode(d))
    .attr('data-lod-hidden', '0')
    .attr('data-zoom-lod-hidden', '0')
    .attr('dx', (d: GraphNode) => {
       return getBaseDxForNode(d)
    })
    .attr('dy', (d: GraphNode) => {
        if (isWordCloudNode(d)) return 0
        if (getNodeRenderShape2d(d, schema) !== 'circle') return 0
        return schema.labelStyles?.offset?.dy ?? 4
    })
    .attr('data-base-anchor', (d: GraphNode) => getBaseAnchorForNode(d))
    .attr('data-base-dx', (d: GraphNode) => {
       return String(getBaseDxForNode(d))
    })
    .attr('data-base-dy', (d: GraphNode) => {
        if (isWordCloudNode(d)) return '0'
        if (getNodeRenderShape2d(d, schema) !== 'circle') return '0'
        return String(schema.labelStyles?.offset?.dy ?? 4);
    })
    .attr('dominant-baseline', 'middle')
    .attr('alignment-baseline', 'middle')
    .attr('text-anchor', (d: GraphNode) => getBaseAnchorForNode(d))
    .attr('paint-order', 'stroke')
    .attr('stroke', haloColor)
    .attr('stroke-width', haloWidth)
    .attr('stroke-opacity', (d: GraphNode) => getLabelOpacityForNode(d))
    .attr('stroke-linejoin', 'round')
    .style('user-select', 'none')
    .style('pointer-events', 'all')
    .style('cursor', 'pointer');

  if (nodeZKeyById) {
    const keyForId = (id: string): NodeZKey =>
      nodeZKeyById.get(id) || { id, groupDepth: -1, groupSize: Number.POSITIVE_INFINITY, zIndex: 0, zMode: 'group', yIndex: 0, xIndex: 0 }
    label.sort((a, b) => compareNodeZKey(keyForId(String(a.id)), keyForId(String(b.id))))
  }

  label.each(function (d: GraphNode) {
    const el = d3.select(this)
    const nodeFontSize = getLabelFontSizeForNode(d)
    const maxChars = Math.max(10, Math.min(72, estimateMaxCharsForWidthPx(260, nodeFontSize)))
    const baseLabelFull = String(getNodeLabelFullText2d(d) || '')
    const labelFullAttr = baseLabelFull.length > 600 ? `${baseLabelFull.slice(0, 599)}…` : baseLabelFull
    const baseLabel = truncateTextWithWordEllipsis(baseLabelFull, 80)
    const compact = truncateTextWithEllipsis(baseLabel, maxChars)
    el
      .attr('data-label-mode', 'compact')
      .attr('data-label-full', labelFullAttr)
      .attr('data-label-wrap', '')
      .attr('data-label-compact', compact.length > 120 ? `${compact.slice(0, 119)}…` : compact)
      .attr('data-label-linecount', '1')
      .attr('data-label-maxlen', String(compact.length))
    el.text(compact)
  })

  const onContextMenu = (event: MouseEvent, d: GraphNode) => {
    event.preventDefault();
    event.stopPropagation();
    setSelectionSource('menu');
    selectEdge(null);
    selectNode(String(d.id));
  }

  const onClick = (event: MouseEvent, d: GraphNode) => {
    event.stopPropagation();
    setSelectionSource('canvas');
    const id = String(d.id || '').trim()
    if (!id) return
    const state = useGraphStore.getState()
    const mode = activateMultiNodeSelectModeForShift({
      mode: schema?.behavior?.selectMode || 'single',
      shiftKey: event.shiftKey,
      setSelectMode: state.setSelectMode,
    })
    const gesture = resolveNodeSelectionGesture({
      mode,
      shiftKey: event.shiftKey,
      metaKey: event.metaKey,
      ctrlKey: event.ctrlKey,
    })
    if (gesture === 'toggle') {
      state.toggleNodeSelectionAdditive(id)
      return
    }
    selectEdge(null);
    if (isMultiNodeSelectMode(mode)) {
      state.selectNodesExpanded({ nodeIds: [id], activeNodeId: id })
      return
    }
    selectNode(id);
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

  label.on('contextmenu', onContextMenu)
  label.on('click', onClick)
  label.on('mouseover', onMouseOver)
  label.on('mousemove', onMouseMove)
  label.on('mouseout', onMouseOut)

  labelsSelRef.current = label;
};
