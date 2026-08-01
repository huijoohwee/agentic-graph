import * as d3 from 'd3';
import { ensureEdgeMarkerRegistry } from '@/lib/graph/edgeMarkers'

type SvgSelection = d3.Selection<SVGSVGElement, unknown, null, undefined>;

export const createDefs = (svg: SvgSelection) => {
  const markerRegistry = ensureEdgeMarkerRegistry(svg.node() as SVGSVGElement)
  const defs = svg.append('defs');
  defs
    .append('clipPath')
    .attr('id', 'node-media-circle-clip')
    .attr('clipPathUnits', 'objectBoundingBox')
    .append('circle')
    .attr('cx', 0.5)
    .attr('cy', 0.5)
    .attr('r', 0.5);
  defs
    .append('clipPath')
    .attr('id', 'node-media-rect-clip')
    .attr('clipPathUnits', 'objectBoundingBox')
    .append('rect')
    .attr('x', 0.05)
    .attr('y', 0.05)
    .attr('width', 0.9)
    .attr('height', 0.9)
    .attr('rx', 0.08)
    .attr('ry', 0.08);
  return markerRegistry
};
