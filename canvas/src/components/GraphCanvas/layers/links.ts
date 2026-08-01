import * as d3 from 'd3';
import type { MutableRefObject } from 'react';
import type { GraphEdge, GraphNode } from '@/lib/graph/types';
import type { GraphSchema } from '@/lib/graph/schema';
import type { TempLinkSelection } from '@/features/edge-creation';
import type { HoverInfo } from '@/components/GraphHoverTooltip';
import { getEdgeBaseStroke, getEdgeStrokeWidth } from '@/components/GraphCanvas/helpers';
import { attachEdgeInteractionHandlers } from '@/components/GraphCanvas/layers/edgeInteractions'
import { edgeDragBehavior } from '@/components/GraphCanvas/utils';
import {
  applyEdgeMarkerAttributes,
  type EdgeMarkerRegistry,
} from '@/lib/graph/edgeMarkers'
import {
  buildEdgePathD,
  ensureEdgeAnimationStyleElement,
  readEdgePathCurveOptions,
  readEffectiveEdgeTypeFor2dRenderer,
  readGlobalEdgeAnimationEnabled,
  readGlobalEdgeColor,
} from '@/lib/graph/edgeTypes'
import { readEdgeEndpointId } from '@/lib/graph/edgeEndpoints'
import { buildCanonicalNodeLookup, getCanonicalNodeLookupValue } from '@/lib/graph/canonicalNodeIds'

type GSelection = d3.Selection<SVGGElement, unknown, null, undefined>;

function readEdgeVisualOpacity(e: GraphEdge): number {
  const props = (e as unknown as { properties?: unknown }).properties
  if (!props || typeof props !== 'object' || Array.isArray(props)) return 1
  const raw = (props as Record<string, unknown>)['visual:opacity']
  const n = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : null
  if (typeof n !== 'number' || !Number.isFinite(n)) return 1
  if (n < 0) return 0
  if (n > 1) return 1
  return n
}

function readEdgeVisualPathD(e: GraphEdge): string {
  const props = (e as unknown as { properties?: unknown }).properties
  if (!props || typeof props !== 'object' || Array.isArray(props)) return ''
  const d = (props as Record<string, unknown>)['visual:pathD']
  return typeof d === 'string' ? d : ''
}

function readEdgeVisualArrowD(e: GraphEdge): string {
  const props = (e as unknown as { properties?: unknown }).properties
  if (!props || typeof props !== 'object' || Array.isArray(props)) return ''
  const d = (props as Record<string, unknown>)['visual:arrowD']
  return typeof d === 'string' ? d : ''
}

function readEdgeVisualPathTranslate(e: GraphEdge): { x: number; y: number } | null {
  const props = (e as unknown as { properties?: unknown }).properties
  if (!props || typeof props !== 'object' || Array.isArray(props)) return null
  const txRaw = (props as Record<string, unknown>)['visual:pathTx']
  const tyRaw = (props as Record<string, unknown>)['visual:pathTy']
  const tx = typeof txRaw === 'number' ? txRaw : typeof txRaw === 'string' ? Number(txRaw) : null
  const ty = typeof tyRaw === 'number' ? tyRaw : typeof tyRaw === 'string' ? Number(tyRaw) : null
  if (typeof tx !== 'number' || !Number.isFinite(tx) || typeof ty !== 'number' || !Number.isFinite(ty)) return null
  if (!tx && !ty) return null
  return { x: tx, y: ty }
}

function coerceEdgeId(v: unknown): string {
  if (typeof v === 'string' || typeof v === 'number') return String(v)
  return ''
}

function readEndpointPos(endpoint: unknown): { x: number; y: number } | null {
  if (!endpoint || typeof endpoint !== 'object' || Array.isArray(endpoint)) return null
  const x = (endpoint as { x?: unknown }).x
  const y = (endpoint as { y?: unknown }).y
  const nx = typeof x === 'number' && Number.isFinite(x) ? x : NaN
  const ny = typeof y === 'number' && Number.isFinite(y) ? y : NaN
  if (!Number.isFinite(nx) || !Number.isFinite(ny)) return null
  return { x: nx, y: ny }
}

function resolveNodeId(endpoint: unknown): string {
  return readEdgeEndpointId(endpoint)
}

function buildNodeLookup(nodeById?: Map<string, GraphNode> | null): Map<string, GraphNode> | null {
  if (!nodeById || nodeById.size === 0) return null
  return buildCanonicalNodeLookup(nodeById.entries())
}

function getEndpointPosOrZero(endpoint: unknown, nodeLookup?: Map<string, GraphNode> | null): { x: number; y: number } {
  const direct = readEndpointPos(endpoint)
  if (direct) return direct
  if (nodeLookup && nodeLookup.size > 0) {
    const id = resolveNodeId(endpoint)
    if (id) {
      const node = getCanonicalNodeLookupValue(nodeLookup, id)
      const fromNode = readEndpointPos(node)
      if (fromNode) return fromNode
    }
  }
  return { x: 0, y: 0 }
}

function shouldUsePathForEdge(e: GraphEdge, _schema: GraphSchema): boolean {
  if (readEdgeVisualPathD(e)) return true
  return true
}

function resolveEdgePathD(e: GraphEdge, schema: GraphSchema, nodeLookup?: Map<string, GraphNode> | null): string {
  const globalType = readEffectiveEdgeTypeFor2dRenderer({ schema, canvas2dRenderer: 'd3' })
  const existing = readEdgeVisualPathD(e)
  if (globalType === 'bezier' && existing) return existing
  const s = getEndpointPosOrZero((e as any).source, nodeLookup)
  const t = getEndpointPosOrZero((e as any).target, nodeLookup)
  return buildEdgePathD({
    edgeType: globalType,
    sx: s.x,
    sy: s.y,
    tx: t.x,
    ty: t.y,
    curve: readEdgePathCurveOptions(e, schema),
  })
}

const readEdgeDasharray = (d: GraphEdge): string | null => {
  const props = (d.properties || {}) as Record<string, unknown>
  const raw = props['visual:dash']
  if (typeof raw === 'string' && raw.trim()) return raw.trim()
  if (String(d.label || '') === 'spokeTo') return '3,6'
  return null
}

export const createLinksHitLayer = (args: {
  g: GSelection;
  edgesForDisplay: GraphEdge[];
  schema: GraphSchema;
  nodeById?: Map<string, GraphNode> | null;
  simulation: d3.Simulation<GraphNode, GraphEdge>;
  hoverEnabled: boolean;
  setHoverInfo: (updater: (prev: HoverInfo | null) => HoverInfo | null) => void;
  setSelectionSource: (src: 'menu' | 'canvas' | 'toolbar' | 'editor' | 'unknown') => void;
  selectNode: (id: string | null) => void;
  selectEdge: (id: string | null) => void;
}) => {
  const {
    g,
    edgesForDisplay,
    schema,
    nodeById,
    simulation,
    hoverEnabled,
    setHoverInfo,
    setSelectionSource,
    selectNode,
    selectEdge,
  } = args;
  const nodeLookup = buildNodeLookup(nodeById)

  const eligibleEdges = (() => {
    if (!Array.isArray(edgesForDisplay) || edgesForDisplay.length < 2) return edgesForDisplay
    let hasAnyZ = false
    for (let i = 0; i < edgesForDisplay.length; i += 1) {
      const e = edgesForDisplay[i]
      const props = (e as unknown as { properties?: unknown }).properties
      if (!props || typeof props !== 'object' || Array.isArray(props)) continue
      const z = (props as Record<string, unknown>)['visual:zIndex']
      if (typeof z === 'number' && Number.isFinite(z)) {
        hasAnyZ = true
        break
      }
    }
    if (!hasAnyZ) return edgesForDisplay
    const readZ = (e: GraphEdge): number => {
      const props = (e as unknown as { properties?: unknown }).properties
      if (!props || typeof props !== 'object' || Array.isArray(props)) return 0
      const z = (props as Record<string, unknown>)['visual:zIndex']
      return typeof z === 'number' && Number.isFinite(z) ? z : 0
    }
    return edgesForDisplay
      .slice()
      .sort((a, b) => {
        const za = readZ(a)
        const zb = readZ(b)
        if (za !== zb) return za - zb
        return String(a.id || '').localeCompare(String(b.id || ''))
      })
  })()

  const linkRoot = g.append('g').attr('data-kg-layer', 'links-hit').style('pointer-events', 'all');
  const withPath = eligibleEdges.filter(e => shouldUsePathForEdge(e, schema))
  const withoutPath = eligibleEdges.filter(e => !shouldUsePathForEdge(e, schema))

  const pathSel = linkRoot
    .selectAll<SVGPathElement, GraphEdge>('path')
    .data(withPath)
    .enter()
    .append('path')
    .attr('d', (d: GraphEdge) => resolveEdgePathD(d, schema, nodeLookup))
    .attr('transform', (d: GraphEdge) => {
      const t = readEdgeVisualPathTranslate(d)
      return t ? `translate(${t.x},${t.y})` : null
    })

  const lineSel = linkRoot
    .selectAll<SVGLineElement, GraphEdge>('line')
    .data(withoutPath)
    .enter()
    .append('line')

  lineSel
    .attr('x1', (d: GraphEdge) => getEndpointPosOrZero((d as any).source, nodeLookup).x)
    .attr('y1', (d: GraphEdge) => getEndpointPosOrZero((d as any).source, nodeLookup).y)
    .attr('x2', (d: GraphEdge) => getEndpointPosOrZero((d as any).target, nodeLookup).x)
    .attr('y2', (d: GraphEdge) => getEndpointPosOrZero((d as any).target, nodeLookup).y)

  const link = linkRoot.selectAll<SVGElement, GraphEdge>('path, line');

  (link as d3.Selection<SVGElement, GraphEdge, SVGGElement, unknown>)
    .attr('data-edge-id', (d: GraphEdge) => coerceEdgeId((d as any).id))
    .attr('data-source-id', (d: GraphEdge) => readEdgeEndpointId((d as any).source))
    .attr('data-target-id', (d: GraphEdge) => readEdgeEndpointId((d as any).target))
    .attr('stroke', 'transparent')
    .attr('stroke-opacity', 1)
    .attr('stroke-width', (d: GraphEdge) => Math.max(12, getEdgeStrokeWidth(d, schema) * 7))
    .attr('stroke-linecap', 'round')
    .attr('fill', 'none')
    .style('pointer-events', 'stroke')

  attachEdgeInteractionHandlers(link as unknown as d3.Selection<SVGElement, GraphEdge, SVGGElement, unknown>, {
    hoverEnabled,
    setHoverInfo,
    setSelectionSource,
    selectNode,
    selectEdge,
    enableContextMenu: true,
  })

  if (schema.behavior?.allowNodeDrag !== false) {
    const drag = edgeDragBehavior(simulation, schema, nodeById);
    (link as d3.Selection<SVGElement, GraphEdge, SVGGElement, unknown>)
      .call(drag as unknown as d3.DragBehavior<SVGElement, GraphEdge, unknown>)
  }

  return link as unknown as d3.Selection<SVGElement, GraphEdge, SVGGElement, unknown>
}

export const createLinksLayer = (args: {
  g: GSelection
  edgesForDisplay: GraphEdge[]
  schema: GraphSchema
  nodeById?: Map<string, GraphNode> | null
  edgeMarkerRegistry: EdgeMarkerRegistry
}): d3.Selection<SVGElement, GraphEdge, SVGGElement, unknown> => {
  const { g, edgesForDisplay, schema, nodeById, edgeMarkerRegistry } = args
  const edgeAnimationEnabled = readGlobalEdgeAnimationEnabled(schema)
  if (edgeAnimationEnabled) ensureEdgeAnimationStyleElement(typeof document !== 'undefined' ? document : null)
  const nodeLookup = buildNodeLookup(nodeById)

  const eligibleEdges = (() => {
    if (!Array.isArray(edgesForDisplay) || edgesForDisplay.length < 2) return edgesForDisplay
    let hasAnyZ = false
    for (let i = 0; i < edgesForDisplay.length; i += 1) {
      const e = edgesForDisplay[i]
      const props = (e as unknown as { properties?: unknown }).properties
      if (!props || typeof props !== 'object' || Array.isArray(props)) continue
      const z = (props as Record<string, unknown>)['visual:zIndex']
      if (typeof z === 'number' && Number.isFinite(z)) {
        hasAnyZ = true
        break
      }
    }
    if (!hasAnyZ) return edgesForDisplay
    const readZ = (e: GraphEdge): number => {
      const props = (e as unknown as { properties?: unknown }).properties
      if (!props || typeof props !== 'object' || Array.isArray(props)) return 0
      const z = (props as Record<string, unknown>)['visual:zIndex']
      return typeof z === 'number' && Number.isFinite(z) ? z : 0
    }
    return edgesForDisplay
      .slice()
      .sort((a, b) => {
        const za = readZ(a)
        const zb = readZ(b)
        if (za !== zb) return za - zb
        return String(a.id || '').localeCompare(String(b.id || ''))
      })
  })()

  const linkRoot = g.append('g').attr('data-kg-layer', 'links').style('pointer-events', 'none')

  const withPath = eligibleEdges.filter(e => shouldUsePathForEdge(e, schema))
  const withoutPath = eligibleEdges.filter(e => !shouldUsePathForEdge(e, schema))

  const arrowEdges = withPath.filter(e => !!readEdgeVisualArrowD(e))
  linkRoot
    .selectAll<SVGPathElement, GraphEdge>('path.kg-edge-arrow')
    .data(arrowEdges)
    .enter()
    .append('path')
    .attr('class', 'kg-edge-arrow')
    .attr('d', (d: GraphEdge) => readEdgeVisualArrowD(d))
    .attr('transform', (d: GraphEdge) => {
      const t = readEdgeVisualPathTranslate(d)
      return t ? `translate(${t.x},${t.y})` : null
    })
    .attr('fill', (d: GraphEdge) => getEdgeBaseStroke(d, schema))
    .attr('stroke', 'none')
    .style('pointer-events', 'none')

  const pathSel = linkRoot
    .selectAll<SVGPathElement, GraphEdge>('path.kg-edge-path')
    .data(withPath)
    .enter()
    .append('path')
    .attr('class', 'kg-edge-path')
    .attr('d', (d: GraphEdge) => resolveEdgePathD(d, schema, nodeLookup))
    .attr('transform', (d: GraphEdge) => {
      const t = readEdgeVisualPathTranslate(d)
      return t ? `translate(${t.x},${t.y})` : null
    })

  const lineSel = linkRoot.selectAll<SVGLineElement, GraphEdge>('line').data(withoutPath).enter().append('line')

  lineSel
    .attr('x1', (d: GraphEdge) => getEndpointPosOrZero((d as any).source, nodeLookup).x)
    .attr('y1', (d: GraphEdge) => getEndpointPosOrZero((d as any).source, nodeLookup).y)
    .attr('x2', (d: GraphEdge) => getEndpointPosOrZero((d as any).target, nodeLookup).x)
    .attr('y2', (d: GraphEdge) => getEndpointPosOrZero((d as any).target, nodeLookup).y)

  const link = linkRoot.selectAll<SVGElement, GraphEdge>('path.kg-edge-path, line')

  ;(link as d3.Selection<SVGElement, GraphEdge, SVGGElement, unknown>)
    .attr('data-edge-id', (d: GraphEdge) => coerceEdgeId((d as any).id))
    .attr('data-source-id', (d: GraphEdge) => readEdgeEndpointId((d as any).source))
    .attr('data-target-id', (d: GraphEdge) => readEdgeEndpointId((d as any).target))
    .attr('stroke', (d: GraphEdge) => getEdgeBaseStroke(d, schema))
    .attr('stroke-opacity', (d: GraphEdge) => readEdgeVisualOpacity(d))
    .attr('stroke-width', (d: GraphEdge) => getEdgeStrokeWidth(d, schema))
    .attr('stroke-dasharray', (d: GraphEdge) => {
      const base = readEdgeDasharray(d)
      if (base) return base
      return edgeAnimationEnabled ? '7,5' : null
    })
    .attr('fill', 'none')
    .style('animation', edgeAnimationEnabled ? 'kg-edge-dash-flow 1.25s linear infinite' : null)
    .style('pointer-events', 'none')

  ;(link as d3.Selection<SVGElement, GraphEdge, SVGGElement, unknown>)
    .each(function (d: GraphEdge) {
      applyEdgeMarkerAttributes(this, d, schema, edgeMarkerRegistry, {
        suppressEnd: !!readEdgeVisualArrowD(d),
      })
    })

  return link as unknown as d3.Selection<SVGElement, GraphEdge, SVGGElement, unknown>
};

export const createTempLink = (g: GSelection, tempLinkSelRef: MutableRefObject<TempLinkSelection>, schema?: GraphSchema | null) => {
  const tempLink = g
    .append('line')
    .attr('data-kg-layer', 'temp-link')
    .attr('stroke', readGlobalEdgeColor(schema || null))
    .attr('stroke-opacity', 0.6)
    .attr('stroke-width', 2)
    .attr('stroke-dasharray', '4,2')
    .style('pointer-events', 'none')
    .style('display', 'none');
  g
    .append('circle')
    .attr('data-kg-layer', 'temp-link-endpoint')
    .attr('role', 'button')
    .attr('tabindex', -1)
    .attr('aria-label', 'Resume temporary edge')
    .attr('aria-hidden', 'true')
    .attr('r', 5)
    .attr('fill', 'var(--kg-canvas-bg, #ffffff)')
    .attr('stroke', readGlobalEdgeColor(schema || null))
    .attr('stroke-width', 2.5)
    .style('pointer-events', 'none')
    .style('display', 'none');
  tempLinkSelRef.current = tempLink;
};
