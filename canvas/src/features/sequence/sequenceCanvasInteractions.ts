import * as d3 from 'd3'
import type { GraphSchema } from '@/lib/graph/schema'
import { readSnapGridConfigFromSchema, snapPointToGrid } from '@/lib/canvas/gridSnap'
import { readHelperLinesDisplayControlActive } from '@/lib/canvas/canvasGridDisplayControls'
import { alignmentRectFromCenter, resolveAlignmentSnap, type AlignmentGuide } from '@/lib/canvas/alignmentGuides'
import { ensureGraphAlignmentGuideLayer, clearGraphAlignmentGuides, renderGraphAlignmentGuides } from '@/components/GraphCanvas/alignmentGuides'
import { readCanvasDragIntentThresholdPx } from '@/lib/canvas/dragIntent'
import type { SequenceModel } from './sequenceModel'
import type { SequenceCanvasLayout, SequenceParticipantPoint as Point } from './sequenceCanvasLayout'

type Options = {
  host: HTMLElement; model: SequenceModel; mermaid: boolean; layout: SequenceCanvasLayout
  schema(): GraphSchema | null
  canArrange?(): boolean
  positions?: Readonly<Record<string, Point>>
  constrain?(id: string, point: Point): Point
  onCommit(id: string, point: Point): void
  onInteractionChange?(arranging: boolean): void
  onError?(error: Error): void
}
type Participant = { id: string; element: SVGGraphicsElement; parts: SVGGraphicsElement[]; base: Point; width: number; height: number }
const number = (element: Element, name: string) => Number(element.getAttribute(name) || 0)
const numbers = (text: string) => (text.match(/[-+]?(?:\d*\.)?\d+(?:e[-+]?\d+)?/gi) || []).map(Number)
const same = (a: Point, b: Point) => a.x === b.x && a.y === b.y

/** Local presentation edits share canvas snapping without writing source or changing temporal order. */
export function bindSequenceCanvasInteractions(options: Options): { dispose(): void; refresh(): void } {
  const { host, model, mermaid } = options, svg = host.querySelector<SVGSVGElement>('svg')
  const win = host.ownerDocument.defaultView
  if (!svg || !win) throw new Error('Sequence arrangement requires an active SVG')
  const horizontal = mermaid || options.layout === 'lifelines'
  const originals = new Map<Element, Map<string, string | null>>()
  const original = (element: Element, name: string) => {
    let attrs = originals.get(element)
    if (!attrs) { attrs = new Map(); originals.set(element, attrs) }
    if (!attrs.has(name)) attrs.set(name, element.getAttribute(name))
    return attrs.get(name)!
  }
  const set = (element: Element, name: string, value: string) => {
    original(element, name)
    if (element.getAttribute(name) !== value) element.setAttribute(name, value)
  }
  const translate = (element: Element, delta: Point) => {
    const before = original(element, 'transform')
    if (delta.x === 0 && delta.y === 0) {
      if (before === null) element.removeAttribute('transform'); else set(element, 'transform', before)
    } else set(element, 'transform', `translate(${delta.x},${delta.y}) ${before || ''}`.trim())
  }
  const restore = () => originals.forEach((attrs, element) => attrs.forEach((value, name) => {
    if (value === null) element.removeAttribute(name); else element.setAttribute(name, value)
  }))
  const allParts = [...svg.querySelectorAll<SVGGraphicsElement>('[data-sequence-participant]')]
  const participants: Participant[] = model.participants.map(person => {
    const matching = allParts.filter(element => element.getAttribute('data-sequence-participant') === person.id)
    const element = matching.find(part => !mermaid || part.getAttribute('data-et') === 'participant')
    if (!element) throw new Error('Sequence arrangement participant identity is missing')
    const box = mermaid ? element.getBBox() : null
    const line = matching.find(part => part.getAttribute('data-et') === 'life-line')
    const base = { x: mermaid ? line ? number(line, 'x1') : box!.x + box!.width / 2 : number(element, 'data-sequence-x'),
      y: mermaid ? box!.y + box!.height / 2 : number(element, 'data-sequence-y') }
    const participant = { id: person.id, element, parts: matching, base,
      width: mermaid ? box!.width : number(element, 'data-sequence-width'), height: mermaid ? box!.height : number(element, 'data-sequence-height') }
    set(element, 'tabindex', '0'); set(element, 'role', 'button')
    set(element, 'aria-label', `Move participant: ${person.label}. Use ${horizontal ? 'Left and Right' : 'arrow'} keys; hold Shift for larger steps or Alt to bypass snapping.`)
    set(element, 'data-sequence-arrange-id', person.id)
    set(element, 'style', `${original(element, 'style') || ''};touch-action:none;cursor:grab`)
    return participant
  })
  if (mermaid) {
    for (const element of svg.querySelectorAll<SVGGraphicsElement>('.actor-bottom[name]')) {
      const participant = participants.find(person => person.id === element.getAttribute('name'))
      const part = element.tagName.toLowerCase() === 'g' ? element : element.parentElement
      if (participant && part && !participant.parts.includes(part as SVGGraphicsElement)) participant.parts.push(part as SVGGraphicsElement)
    }
    for (const element of svg.querySelectorAll<SVGGraphicsElement>('.activation0,.activation1,.activation2')) {
      const center = number(element, 'x') + number(element, 'width') / 2
      const owner = [...participants].sort((a, b) => Math.abs(a.base.x - center) - Math.abs(b.base.x - center))[0]
      if (owner) owner.parts.push(element)
    }
  }
  const byId = new Map(participants.map(person => [person.id, person]))
  const points: Record<string, Point> = Object.create(null)
  for (const person of participants) points[person.id] = { ...person.base }
  const constrain = (id: string, point: Point): Point => {
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) throw new Error('Sequence arrangement coordinates must be finite')
    let next = { x: Math.max(-100000, Math.min(100000, point.x)), y: Math.max(-100000, Math.min(100000, point.y)) }
    if (horizontal) {
      const index = participants.findIndex(person => person.id === id), person = participants[index]!
      const before = participants[index - 1], after = participants[index + 1]
      next = { x: Math.max(before ? points[before.id]!.x + (before.width + person.width) / 2 + 32 : -100000,
        Math.min(after ? points[after.id]!.x - (after.width + person.width) / 2 - 32 : 100000, next.x)), y: person.base.y }
    }
    return options.constrain ? options.constrain(id, next) : next
  }
  // Native markup already incorporates committed positions. Mermaid retains its authored SVG baseline.
  if (mermaid) {
    for (const person of participants) {
      const supplied = options.positions && Object.prototype.hasOwnProperty.call(options.positions, person.id) ? options.positions[person.id] : undefined
      if (supplied) {
        if (!Number.isFinite(supplied.x) || !Number.isFinite(supplied.y)) throw new Error('Sequence arrangement coordinates must be finite')
        points[person.id] = { ...supplied }
      }
    }
    for (const person of participants) points[person.id] = constrain(person.id, points[person.id]!)
  }
  const bindings = [...svg.querySelectorAll<SVGGElement>('[data-sequence-event]')].map(group => {
    const event = model.events.find(item => item.id === group.getAttribute('data-sequence-event'))
    if (!event) throw new Error('Sequence arrangement event identity is missing')
    const path = group.querySelector<SVGGraphicsElement>('.sequence-message')
    const data = path?.getAttribute('d') || '', coordinates = numbers(data)
    const text = [...group.querySelectorAll<SVGGraphicsElement>('text')]
    const rects = [...group.querySelectorAll<SVGRectElement>('rect')].map(element => ({ element, x: number(element, 'x'), width: number(element, 'width') }))
    const extras = [...group.querySelectorAll<SVGGraphicsElement>('circle,line')].filter(element => element !== path)
    return { group, event, path, coordinates, text, rects, extras, start: path ? number(path, 'x1') : 0, end: path ? number(path, 'x2') : 0 }
  })
  const content = () => svg.querySelector<SVGGElement>('g[data-kg-svg-zoom-content="1"]')
  const guideRoot = host.ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'g')
  ;(content() || svg).append(guideRoot)
  const guideLayer = ensureGraphAlignmentGuideLayer(d3.select(guideRoot))
  // Branch borders share the same monotone horizontal projection as the participant lanes.
  const frames = horizontal ? [...svg.querySelectorAll<SVGGraphicsElement>('.loopLine,.labelBox,.labelText,.loopText,.sectionTitle')].map(element => ({
    element, x1: number(element, 'x1'), x2: number(element, 'x2'), x: number(element, 'x'), polygon: numbers(element.getAttribute('points') || ''),
  })) : []
  const warpX = (x: number) => {
    if (!participants.length) return x
    let left = participants[0]!, right = left
    for (const person of participants) { if (person.base.x <= x) left = person; if (person.base.x >= x) { right = person; break } right = person }
    const a = points[left.id]!.x - left.base.x, b = points[right.id]!.x - right.base.x
    return x + (left === right ? a : a + (b - a) * (x - left.base.x) / (right.base.x - left.base.x))
  }
  const paint = () => {
    for (const person of participants) {
      const point = points[person.id]!, delta = { x: point.x - person.base.x, y: point.y - person.base.y }
      for (const part of person.parts) translate(part, delta)
    }
    for (const binding of bindings) {
      const { event, group, path, coordinates, text, rects, extras } = binding
      const from = byId.get(event.from)!, to = byId.get(event.to)!
      const a = { x: points[from.id]!.x - from.base.x, y: points[from.id]!.y - from.base.y }
      const b = { x: points[to.id]!.x - to.base.x, y: points[to.id]!.y - to.base.y }
      if (!horizontal) {
        if (!path) continue
        if (coordinates.length !== 14) throw new Error('Sequence connection geometry changed')
        const c = [...coordinates]
        for (const index of [0, 2]) { c[index]! += a.x; c[index + 1]! += a.y }
        for (const index of [10, 12]) { c[index]! += b.x; c[index + 1]! += b.y }
        set(path, 'd', `M${c[0]},${c[1]}C${c[2]},${c[3]} ${c[4]},${c[5]} ${c[6]},${c[7]}C${c[8]},${c[9]} ${c[10]},${c[11]} ${c[12]},${c[13]}`)
        continue
      }
      if (event.from === event.to) { translate(group, { x: a.x, y: 0 }); continue }
      const middle = { x: (a.x + b.x) / 2, y: 0 }
      if (path?.tagName.toLowerCase() === 'line') {
        set(path, 'x1', String(binding.start + a.x)); set(path, 'x2', String(binding.end + b.x))
      } else if (path) {
        if (coordinates.length !== 3) throw new Error('Sequence lifeline geometry changed')
        set(path, 'd', `M${coordinates[0]! + a.x},${coordinates[1]}H${coordinates[2]! + b.x}`)
      }
      for (const element of text) translate(element, element.classList.contains('sequenceNumber') || (!mermaid && element === text[1]) ? { x: a.x, y: 0 } : middle)
      for (const element of extras) translate(element, { x: a.x, y: 0 })
      const left = from.base.x < to.base.x ? a.x : b.x, right = from.base.x < to.base.x ? b.x : a.x
      for (const rect of rects) { set(rect.element, 'x', String(rect.x + left)); set(rect.element, 'width', String(Math.max(44, rect.width + right - left))) }
    }
    for (const frame of frames) {
      const tag = frame.element.tagName.toLowerCase()
      if (tag === 'line') { set(frame.element, 'x1', String(warpX(frame.x1))); set(frame.element, 'x2', String(warpX(frame.x2))) }
      else if (tag === 'polygon') set(frame.element, 'points', frame.polygon.map((value, index) => index % 2 ? value : warpX(value)).join(' '))
      else translate(frame.element, { x: warpX(frame.x) - frame.x, y: 0 })
    }
  }
  let disposed = false, frame: number | null = null, pending: PointerEvent | null = null
  type Drag = { id: string; pointer: number; origin: Point; start: Point; client: Point; threshold: number; moved: boolean }
  let drag: Drag | null = null
  const live = () => !disposed && host.querySelector('svg') === svg
  const scale = () => {
    const matrix = (content() || svg).getScreenCTM?.()
    return matrix ? Math.hypot(matrix.a, matrix.b) || 1 : d3.zoomTransform(svg).k || 1
  }
  const world = (event: PointerEvent): Point => {
    const matrix = (content() || svg).getScreenCTM?.()
    if (matrix && svg.createSVGPoint) { const point = svg.createSVGPoint(); point.x = event.clientX; point.y = event.clientY; return point.matrixTransform(matrix.inverse()) }
    const bounds = svg.getBoundingClientRect(), transform = d3.zoomTransform(svg)
    return { x: (event.clientX - bounds.left - transform.x) / transform.k, y: (event.clientY - bounds.top - transform.y) / transform.k }
  }
  const rectangle = (person: Participant, point: Point) => alignmentRectFromCenter({ id: person.id, cx: point.x, cy: point.y, width: person.width, height: person.height })
  const resolve = (id: string, raw: Point, alt: boolean) => {
    const schema = options.schema(), grid = readSnapGridConfigFromSchema(schema)
    let point = !alt && grid.enabled ? snapPointToGrid(raw, grid) : raw, guides: AlignmentGuide[] = []
    point = constrain(id, point)
    if (!alt && readHelperLinesDisplayControlActive(schema)) {
      const result = resolveAlignmentSnap({ moving: rectangle(byId.get(id)!, point), scale: scale(),
        stationary: participants.filter(person => person.id !== id).map(person => rectangle(person, points[person.id]!)) })
      const next = constrain(id, { x: point.x + result.dx, y: point.y + (horizontal ? 0 : result.dy) })
      guides = result.guides.filter(guide => guide.axis === 'x' ? next.x === point.x + result.dx : !horizontal && next.y === point.y + result.dy)
      point = next
    }
    renderGraphAlignmentGuides({ layer: guideLayer, svgEl: svg, guides })
    return point
  }
  const cancelFrame = () => { if (frame !== null) win.cancelAnimationFrame(frame); frame = null; pending = null }
  const end = (commit: boolean) => {
    const current = drag
    drag = null; cancelFrame(); clearGraphAlignmentGuides(guideLayer)
    if (!current) return
    if (host.hasPointerCapture?.(current.pointer)) host.releasePointerCapture(current.pointer)
    const next = points[current.id]!
    try { if (!commit || !live()) { points[current.id] = { ...current.start }; if (live()) paint() } }
    finally { options.onInteractionChange?.(false) }
    if (commit && live() && current.moved && !same(next, current.start)) {
      options.onCommit(current.id, { ...next })
    }
  }
  const safely = (action: () => void) => {
    try { action() } catch (error) {
      try { end(false) } catch { /* Preserve the initiating geometry error if rollback also fails. */ }
      if (options.onError) options.onError(error instanceof Error ? error : new Error(String(error))); else throw error
    }
  }
  const move = (event: PointerEvent) => {
    if (!drag || event.pointerId !== drag.pointer || !live()) return
    if (!drag.moved && Math.hypot(event.clientX - drag.client.x, event.clientY - drag.client.y) <= drag.threshold) return
    drag.moved = true
    const point = world(event)
    points[drag.id] = resolve(drag.id, { x: drag.start.x + point.x - drag.origin.x, y: drag.start.y + point.y - drag.origin.y }, event.altKey)
    paint()
  }
  const target = (event: Event) => event.target instanceof win.Element && svg.contains(event.target) ? event.target.closest<SVGGraphicsElement>('[data-sequence-arrange-id]') : null
  const down = (event: PointerEvent) => safely(() => {
    if (drag && live()) { event.preventDefault(); event.stopPropagation(); return }
    const element = target(event), id = element?.getAttribute('data-sequence-arrange-id')
    if (!id || !byId.has(id) || !live() || event.button !== 0 || event.isPrimary === false || drag || options.canArrange?.() === false) return
    event.preventDefault(); event.stopPropagation(); element!.focus?.()
    drag = { id, pointer: event.pointerId, origin: world(event), start: { ...points[id]! }, client: { x: event.clientX, y: event.clientY }, threshold: readCanvasDragIntentThresholdPx(event.pointerType), moved: false }
    host.setPointerCapture?.(event.pointerId)
    options.onInteractionChange?.(true)
  })
  const pointerMove = (event: PointerEvent) => {
    if (!drag || event.pointerId !== drag.pointer) return
    event.preventDefault(); pending = event
    if (frame === null) frame = win.requestAnimationFrame(() => { frame = null; const latest = pending; pending = null; if (latest) safely(() => move(latest)) })
  }
  const up = (event: PointerEvent) => safely(() => { if (drag && event.pointerId === drag.pointer) { move(event); end(true) } })
  const cancel = (event: PointerEvent) => { if (drag && event.pointerId === drag.pointer) safely(() => end(false)) }
  const key = (event: KeyboardEvent) => safely(() => {
    if (event.key === 'Escape' && drag) { event.preventDefault(); event.stopPropagation(); end(false); return }
    const id = target(event)?.getAttribute('data-sequence-arrange-id')
    const axis = event.key === 'ArrowLeft' || event.key === 'ArrowRight' ? 'x' : event.key === 'ArrowUp' || event.key === 'ArrowDown' ? 'y' : null
    if (!id || !axis || (horizontal && axis === 'y') || event.ctrlKey || event.metaKey || drag || !live()) return
    event.preventDefault(); event.stopPropagation()
    const grid = readSnapGridConfigFromSchema(options.schema()), old = points[id]!, direction = event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 1
    const amount = (grid.enabled && !event.altKey ? grid[axis] : 10) * (event.shiftKey ? 10 : 1) * direction
    const point = resolve(id, { ...old, [axis]: old[axis] + amount }, event.altKey)
    if (same(old, point)) return
    options.onInteractionChange?.(true)
    try { points[id] = point; paint(); clearGraphAlignmentGuides(guideLayer) }
    finally { options.onInteractionChange?.(false) }
    options.onCommit(id, { ...point })
  })
  const refresh = () => safely(() => { end(false); clearGraphAlignmentGuides(guideLayer) })
  const blur = () => refresh()
  paint()
  host.addEventListener('pointerdown', down, true); host.addEventListener('keydown', key, true); host.addEventListener('lostpointercapture', cancel)
  win.addEventListener('pointermove', pointerMove, { passive: false }); win.addEventListener('pointerup', up); win.addEventListener('pointercancel', cancel)
  win.addEventListener('keydown', key, true); win.addEventListener('blur', blur)
  return { refresh, dispose() {
    if (disposed) return
    end(false); disposed = true; cancelFrame(); restore(); guideRoot.remove()
    host.removeEventListener('pointerdown', down, true); host.removeEventListener('keydown', key, true); host.removeEventListener('lostpointercapture', cancel)
    win.removeEventListener('pointermove', pointerMove); win.removeEventListener('pointerup', up); win.removeEventListener('pointercancel', cancel)
    win.removeEventListener('keydown', key, true); win.removeEventListener('blur', blur)
  } }
}
