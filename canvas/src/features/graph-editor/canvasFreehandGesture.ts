import { pointer, zoomTransform } from 'd3'
import { isSpacePanHeld } from '@/lib/canvas/space-pan'
import { maxStrokePoints, type SketchPoint } from '@/lib/graph/canvasSketch'
import { useGraphStore } from '@/hooks/useGraphStore'
import { authorCanvasTool } from './authorCanvasTool'

export function bindCanvasFreehand(svg: SVGSVGElement, report: (text: string) => void) {
  let active: { id: number; points: SketchPoint[]; revision: number; document: string | null; line: SVGPolylineElement; transform: ReturnType<typeof zoomTransform> } | null = null
  const clear = () => {
    if (!active) return
    const { line, id } = active
    active = null
    line.remove()
    if (svg.hasPointerCapture(id)) svg.releasePointerCapture(id)
  }
  const sample = (event: PointerEvent) => {
    if (!active) return
    const p = active.transform.invert(pointer(event, svg)) as SketchPoint
    const points = active.points
    const last = points.at(-1)
    if (last && Math.hypot(last[0] - p[0], last[1] - p[1]) * active.transform.k < 2) return
    if (points.length === maxStrokePoints) active.points = points.filter((_, i) => i % 2 === 0)
    active.points.push(p)
    active.line.setAttribute('points', active.points.map(v => active!.transform.apply(v).join(',')).join(' '))
  }
  const down = (event: PointerEvent) => {
    if (!event.isPrimary || event.button !== 0 || isSpacePanHeld() || active) return
    event.preventDefault()
    event.stopImmediatePropagation()
    const state = useGraphStore.getState()
    if (state.canvasAuthoringTurn) return
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'polyline')
    line.setAttribute('fill', 'none')
    line.setAttribute('stroke', '#5294dd')
    line.setAttribute('stroke-width', '3')
    line.setAttribute('stroke-linecap', 'round')
    line.setAttribute('pointer-events', 'none')
    svg.append(line)
    active = { id: event.pointerId, points: [], revision: state.graphDataRevision, document: state.markdownDocumentName,
      line, transform: zoomTransform(svg) }
    svg.setPointerCapture(event.pointerId)
    sample(event)
  }
  const move = (event: PointerEvent) => {
    if (active?.id !== event.pointerId) return
    event.stopImmediatePropagation()
    sample(event)
  }
  const up = (event: PointerEvent) => {
    if (!active || active.id !== event.pointerId) return
    event.stopImmediatePropagation()
    sample(event)
    const { points, document, revision } = active
    clear()
    const state = useGraphStore.getState()
    if (state.markdownDocumentName !== document || state.graphDataRevision !== revision) return report('Canvas changed. Draw the stroke again.')
    if (points.length < 2) return
    void authorCanvasTool({ tool: 'stroke', points }).then(() => report('Added freehand stroke.')).catch(e => report(String(e.message ?? e)))
  }
  const cancel = (event: PointerEvent) => { if (active?.id === event.pointerId) clear() }
  const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') clear() }
  const touchAction = svg.style.touchAction
  svg.style.touchAction = 'none'
  svg.dataset.kgFreehandReady = 'true'
  svg.addEventListener('pointerdown', down, true)
  svg.addEventListener('pointermove', move, true)
  svg.addEventListener('pointerup', up, true)
  svg.addEventListener('pointercancel', cancel)
  svg.addEventListener('lostpointercapture', cancel)
  window.addEventListener('keydown', escape)
  return () => {
    clear()
    svg.style.touchAction = touchAction
    delete svg.dataset.kgFreehandReady
    svg.removeEventListener('pointerdown', down, true)
    svg.removeEventListener('pointermove', move, true)
    svg.removeEventListener('pointerup', up, true)
    svg.removeEventListener('pointercancel', cancel)
    svg.removeEventListener('lostpointercapture', cancel)
    window.removeEventListener('keydown', escape)
  }
}
