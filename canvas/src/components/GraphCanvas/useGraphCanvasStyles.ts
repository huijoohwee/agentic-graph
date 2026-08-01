import { useEffect, MutableRefObject } from 'react';
import * as d3 from 'd3';
import { GraphNode, GraphEdge } from '@/lib/graph/types';
import { type GraphSchema } from '@/lib/graph/schema';
import {
  getRenderNodeRadius2d,
  getEdgeBaseStroke,
  getEdgeLabelColor,
  getEdgeStrokeWidth,
  getNodeBaseStroke,
  getNodeLabelColor,
} from '@/components/GraphCanvas/helpers';
import { type EdgeWithRuntime } from '@/components/GraphCanvas/utils';
import { UI_THEME_COLORS_CSS } from '@/lib/ui/theme-tokens';
import { getNodeRectDimensions2d } from '@/components/GraphCanvas/nodeSizing2d';
import { readEdgeOpacity2d } from '@/lib/graph/layoutDefaults'
import { readLabelPresentation2d } from '@/lib/canvas/labelPresentation2d'
import { isFlowchartCrossEdge } from '@/lib/flowchart/source'
import { readNodeLabelFontSize2d } from '@/components/GraphCanvas/labelLayout2d'
import {
  applyEdgeMarkerAttributes,
  ensureEdgeMarkerRegistry,
} from '@/lib/graph/edgeMarkers'

type UseGraphCanvasStylesProps = {
  gRef?: MutableRefObject<d3.Selection<SVGGElement, unknown, null, undefined> | null>;
  nodesSelRef: MutableRefObject<d3.Selection<SVGElement, GraphNode, SVGGElement, unknown> | null>;
  linksSelRef: MutableRefObject<d3.Selection<SVGElement, GraphEdge, SVGGElement, unknown> | null>;
  labelsSelRef: MutableRefObject<d3.Selection<SVGTextElement, GraphNode, SVGGElement, unknown> | null>;
  schema: GraphSchema;
  documentSemanticMode?: 'document' | 'keyword'
  paused?: boolean;
  graphDataRevision?: number;
  themeSignal?: string;
};

const readEdgeVisualOpacity = (edge: GraphEdge): number => {
  const safeEdge = (edge && typeof edge === 'object' ? edge : null) as
    | { properties?: unknown }
    | null
  const props = safeEdge?.properties
  if (!props || typeof props !== 'object' || Array.isArray(props)) return 1
  const raw = (props as Record<string, unknown>)['visual:opacity']
  const n = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : null
  if (typeof n !== 'number' || !Number.isFinite(n)) return 1
  if (n < 0) return 0
  if (n > 1) return 1
  return n
}

export function applyGraphCanvasStyles2d({
  gRef,
  nodesSelRef,
  linksSelRef,
  labelsSelRef,
  schema,
  documentSemanticMode,
}: Omit<UseGraphCanvasStylesProps, 'paused' | 'graphDataRevision'>) {
  const colors = UI_THEME_COLORS_CSS;
  const lp = readLabelPresentation2d({ schema, documentSemanticMode })
  const labelFill = schema.labelStyles?.color ?? colors.labelFill
  const haloColor = schema.labelStyles?.halo?.color ?? colors.labelHalo
  const haloWidth = lp.haloWidthPx
  const motionRaw = (schema as unknown as { three?: { nodeMotionIntensity?: unknown } }).three?.nodeMotionIntensity
  const motion = typeof motionRaw === 'number' && Number.isFinite(motionRaw)
    ? Math.max(0, Math.min(2, motionRaw))
    : 1
  const motionEnabled = motion > 1e-6
  const hash01 = (s: string) => {
    let h = 2166136261
    for (let i = 0; i < s.length; i += 1) {
      h ^= s.charCodeAt(i)
      h = Math.imul(h, 16777619)
    }
    return ((h >>> 0) % 1000) / 1000
  }

  if (nodesSelRef.current) {
    nodesSelRef.current.each(function (d: GraphNode) {
      const radius = getRenderNodeRadius2d(d, schema);
      const el = d3.select(this);
      const id = String(d.id || '')
      if (motionEnabled && id) {
        const dur = 2.8 + hash01(id) * 1.6
        const delay = hash01(id + ':d') * 1.2
        const amp = (1.5 + hash01(id + ':a') * 1.8) * motion
        el
          .attr('data-kg-node-anim', '1')
          .style('transform-box', 'fill-box')
          .style('transform-origin', 'center')
          .style('--kg-bob-amp', `${amp.toFixed(2)}px`)
          .style('animation', `kgNodeBob ${dur.toFixed(2)}s ease-in-out ${delay.toFixed(2)}s infinite`)
      } else {
        const prev = String(el.attr('data-kg-node-anim') || '')
        if (prev === '1') {
          el
            .attr('data-kg-node-anim', null)
            .style('animation', null)
            .style('--kg-bob-amp', null)
            .style('transform-box', null)
            .style('transform-origin', null)
        }
      }
      if (this.tagName === 'circle') {
        el.attr('r', radius);
      } else if (this.tagName === 'rect') {
        const x = typeof d.x === 'number' ? d.x : 0;
        const y = typeof d.y === 'number' ? d.y : 0;
        const { width: w, height: h } = getNodeRectDimensions2d(d, schema);
        el.attr('x', x - w / 2)
          .attr('y', y - h / 2)
          .attr('width', w)
          .attr('height', h);
      }
    });
    nodesSelRef.current
      .attr('stroke', (d: GraphNode) => {
        return getNodeBaseStroke(d, schema) || colors.nodeStroke;
      })
      .attr('stroke-width', (d: GraphNode) => {
        const override = schema.nodeStroke?.[d.type]?.width;
        if (typeof override === 'number' && Number.isFinite(override) && override >= 0) return override;
        return 1.5;
      });
  }

  if (linksSelRef.current) {
    const baseEdgeOpacity = readEdgeOpacity2d(schema)
    linksSelRef.current.attr('stroke', (d: GraphEdge) => {
      return getEdgeBaseStroke(d, schema) || colors.edgeStroke;
    });
    linksSelRef.current.attr('stroke-opacity', (d: GraphEdge) => {
      const combined = baseEdgeOpacity * readEdgeVisualOpacity(d)
      const floor = isFlowchartCrossEdge(d) ? 0.58 : 0.18
      return Math.max(floor, Math.min(1, combined))
    });
    linksSelRef.current.attr('stroke-width', (d: GraphEdge) => {
      return getEdgeStrokeWidth(d as EdgeWithRuntime, schema);
    });
    const ownerSvg = linksSelRef.current.node()?.ownerSVGElement || null
    if (ownerSvg) {
      const markerRegistry = ensureEdgeMarkerRegistry(ownerSvg)
      linksSelRef.current.each(function (d: GraphEdge) {
        const props = (d && typeof d === 'object' ? d.properties : null) as Record<string, unknown> | null
        applyEdgeMarkerAttributes(this, d, schema, markerRegistry, {
          suppressEnd: typeof props?.['visual:arrowD'] === 'string' && props['visual:arrowD'].trim().length > 0,
        })
      })
    }
  }

  if (labelsSelRef.current) {
    labelsSelRef.current
      .attr('font-size', (d: GraphNode) => readNodeLabelFontSize2d(d, lp.nodeFontSizePx))
      .attr('data-kg-label-fill', (d: GraphNode) => getNodeLabelColor(d, schema))
      .attr('fill', (d: GraphNode) => getNodeLabelColor(d, schema))
      .attr('stroke', haloColor)
      .attr('stroke-width', haloWidth)
      .attr('stroke-linejoin', 'round')
      .attr('paint-order', 'stroke')
  }

  const root = gRef?.current ?? null
  if (root) {
    const styleTextSel = (sel: d3.Selection<SVGTextElement, unknown, SVGGElement, unknown>, fontSizePx?: number) => {
      sel
        .attr('fill', function () {
          const explicit = String((this as SVGTextElement).getAttribute('data-kg-label-fill') || '').trim()
          return explicit || labelFill
        })
        .attr('stroke', haloColor)
        .attr('stroke-width', Math.max(2, haloWidth * 0.85))
        .attr('stroke-linejoin', 'round')
        .attr('paint-order', 'stroke')
      if (typeof fontSizePx === 'number' && Number.isFinite(fontSizePx) && fontSizePx > 0) {
        sel.attr('font-size', fontSizePx)
      }
    }

    styleTextSel(root.selectAll<SVGTextElement, unknown>('[data-kg-layer="group-labels"] text'), lp.groupFontSizePx)
    const edgeLabelSel = root.selectAll<SVGTextElement, GraphEdge>('[data-kg-layer="edge-labels"] text')
    edgeLabelSel
      .attr('data-kg-label-fill', (d: GraphEdge) => getEdgeLabelColor(d, schema))
      .attr('fill', (d: GraphEdge) => getEdgeLabelColor(d, schema))
    styleTextSel(edgeLabelSel as unknown as d3.Selection<SVGTextElement, unknown, SVGGElement, unknown>, lp.edgeFontSizePx)
    root
      .selectAll<SVGPathElement, unknown>('path[data-kg-group-chevron]')
      .attr('stroke', function () {
        const explicit = String((this as SVGPathElement).getAttribute('data-kg-label-fill') || '').trim()
        return explicit || labelFill
      })
  }
}

export function useGraphCanvasStyles({
  gRef,
  nodesSelRef,
  linksSelRef,
  labelsSelRef,
  schema,
  documentSemanticMode,
  paused,
  graphDataRevision,
  themeSignal,
}: UseGraphCanvasStylesProps) {
  useEffect(() => {
    if (paused) return;
    applyGraphCanvasStyles2d({
      gRef,
      nodesSelRef,
      linksSelRef,
      labelsSelRef,
      schema,
      documentSemanticMode,
    });
  }, [paused, gRef, nodesSelRef, linksSelRef, labelsSelRef, schema, documentSemanticMode, graphDataRevision, themeSignal]);
}
