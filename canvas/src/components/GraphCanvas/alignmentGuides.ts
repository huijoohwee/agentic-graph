import * as d3 from 'd3'

import type { AlignmentGuide } from '@/lib/canvas/alignmentGuides'

export type GraphAlignmentGuideLayer = d3.Selection<SVGGElement, unknown, SVGGElement, unknown>

export function ensureGraphAlignmentGuideLayer(
  g: d3.Selection<SVGGElement, unknown, null, undefined>,
): GraphAlignmentGuideLayer {
  return g
    .selectAll<SVGGElement, unknown>('g[data-kg-layer="alignment-guides"]')
    .data([null])
    .join('g')
    .attr('data-kg-layer', 'alignment-guides')
    .attr('aria-hidden', 'true')
    .style('pointer-events', 'none')
}

export function clearGraphAlignmentGuides(layer: GraphAlignmentGuideLayer): void {
  layer.selectAll('line').remove()
}

export function renderGraphAlignmentGuides(args: {
  layer: GraphAlignmentGuideLayer
  svgEl: SVGSVGElement
  guides: AlignmentGuide[]
}): void {
  const transform = d3.zoomTransform(args.svgEl)
  const scale = Number.isFinite(transform.k) && transform.k > 0 ? transform.k : 1
  const bounds = args.svgEl.getBoundingClientRect()
  const worldWidth = Math.max(1, bounds.width) / scale
  const worldHeight = Math.max(1, bounds.height) / scale
  const minX = -transform.x / scale - worldWidth
  const minY = -transform.y / scale - worldHeight
  const maxX = minX + worldWidth * 3
  const maxY = minY + worldHeight * 3

  args.layer
    .selectAll<SVGLineElement, AlignmentGuide>('line')
    .data(args.guides, guide => guide.axis)
    .join('line')
    .attr('data-kg-alignment-axis', guide => guide.axis)
    .attr('x1', guide => guide.axis === 'x' ? guide.position : minX)
    .attr('x2', guide => guide.axis === 'x' ? guide.position : maxX)
    .attr('y1', guide => guide.axis === 'y' ? guide.position : minY)
    .attr('y2', guide => guide.axis === 'y' ? guide.position : maxY)
    .attr('stroke', 'var(--kg-canvas-accent, #3b82f6)')
    .attr('stroke-width', 1.25)
    .attr('stroke-dasharray', '6 4')
    .attr('vector-effect', 'non-scaling-stroke')
    .attr('opacity', 0.92)
}
