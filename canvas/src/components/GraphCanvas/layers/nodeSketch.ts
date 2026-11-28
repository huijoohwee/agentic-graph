import { resolveCanvasContainerInsets } from '@/lib/canvas/canvasContainerSizing'
import { normalizeViewportFrame, type ViewportFrame } from '@/lib/zoom/viewport'
import type { Selection } from 'd3'
import type { GraphNode } from '@/lib/graph/types'
import { readNodeSketch, type Sketch } from '@/lib/graph/canvasSketch'

export function drawNodeSketch(svg: Selection<SVGSVGElement, GraphNode, null, undefined>, node: GraphNode, sketch: Sketch) {
  svg.attr('viewBox', '0 0 120 100').attr('preserveAspectRatio', 'none').attr('data-kg-node-shape', 'sketch')
  svg.append('title').text(node.label || node.id)
  svg.append('rect').attr('width', 120).attr('height', 100).attr('fill', 'transparent').attr('stroke', 'none')
  svg.selectAll('path').data(sketch.marks).enter().append('path').attr('d', mark => mark.d)
    .attr('fill', mark => mark.fill).attr('stroke', mark => mark.stroke).attr('stroke-width', mark => mark.width)
    .attr('stroke-linejoin', 'round').attr('stroke-linecap', 'round')
    .attr('vector-effect', sketch.caption ? null : 'non-scaling-stroke')
  if (sketch.caption) svg.append('text').attr('x', 60).attr('y', 96).attr('text-anchor', 'middle')
    .attr('font-size', 9).attr('font-weight', 600).attr('stroke', 'none').attr('fill', 'var(--kg-canvas-label-fill)')
    .text(node.label || node.id)
}

// Simulation seeding can move even a single stroke. Restore explicitly drawn
// coordinates before fitting the viewport, and hold them during later ticks.
export function captureSketchPositions(nodes: GraphNode[]) {
  const positions: { node: GraphNode; x: number; y: number }[] = []
  for (const node of nodes) {
    if (node.properties?.['visual:sketch'] && Number.isFinite(node.x) && Number.isFinite(node.y) && readNodeSketch(node))
      positions.push({ node, x: node.x!, y: node.y! })
  }
  if (!positions.length) return null
  return () => {
    for (const { node, x, y } of positions) Object.assign(node, { x, y, fx: x, fy: y, vx: 0, vy: 0 })
  }
}

// Keep drawings visible beside FloatingPanel while respecting the editor's
// existing visible frame and the user's saved zoom.
export function fitSketchAroundPanel(surface: SVGSVGElement, frame: ViewportFrame): ViewportFrame {
  const panels = surface.ownerDocument.querySelectorAll('[data-kg-floating-panel-root="true"], [data-agentic-base-floating-panel="true"]')
  if (!panels.length) return frame
  const bounds = surface.getBoundingClientRect()
  const available = { left: bounds.left + frame.left, top: bounds.top + frame.top,
    right: bounds.left + frame.right, bottom: bounds.top + frame.bottom }
  const insets = resolveCanvasContainerInsets('inset', available, Array.from(panels, panel => panel.getBoundingClientRect()))
  return normalizeViewportFrame({ viewportW: bounds.width, viewportH: bounds.height, left: frame.left + insets.left,
    top: frame.top + insets.top, width: frame.width - insets.left - insets.right, height: frame.height - insets.top - insets.bottom })
}
