import type { GraphNode } from './types'
import { hashSignatureParts } from '@/lib/hash/signature'
import { unwrapGraphCellValue } from './nodeProperties'

export type SketchMark = { d: string; fill: string; stroke: string; width: number }
export type Sketch = { marks: SketchMark[]; caption: boolean }
export type SketchPoint = [number, number]
export const maxStrokePoints = 128
const color = /^(?:none|#[\da-f]{6})$/i

const pathArity: Record<string, number> = { M: 2, L: 2, H: 1, V: 1, Q: 4, T: 2, C: 6, S: 4, A: 7, Z: 0 }
export function isSketchPath(d: unknown): boolean {
  if (typeof d !== 'string' || d.length > 2048 || !/^M[\d\s.,+MLHVQTCSAZ-]+$/i.test(d)) return false
  let segments = 0
  for (const match of d.matchAll(/([a-z])([^a-z]*)/gi)) {
    const command = match[1].toUpperCase(), arity = pathArity[command]
    const args = match[2].trim()
    if (command === 'Z') { if (args) return false; continue }
    if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[\s,]+[+-]?(?:\d+(?:\.\d*)?|\.\d+)|[+-](?:\d+(?:\.\d*)?|\.\d+))*$/.test(args)) return false
    const numbers = args.match(/[+-]?(?:\d+(?:\.\d*)?|\.\d+)/g)!.map(Number)
    if (!arity || numbers.length % arity || numbers.some(n => Math.abs(n) > 4096)) return false
    if (command === 'A') {
      for (let i = 0; i < numbers.length; i += 7) {
        if (numbers[i] < 0 || numbers[i + 1] < 0 || ![0, 1].includes(numbers[i + 3]) || ![0, 1].includes(numbers[i + 4])) return false
      }
    }
    segments += numbers.length / arity - (command === 'M' ? 1 : 0)
  }
  return segments > 0
}

const validatedSketches = new WeakMap<object, Sketch>()

// Paths are data only. Neither markup, paint-server URLs nor CSS enter the SVG.
export function readNodeSketch(node: Pick<GraphNode, 'properties'>): Sketch | null {
  const value = unwrapGraphCellValue(node.properties?.['visual:sketch']) as Partial<Sketch> | null
  if (!value || !Array.isArray(value.marks) || !value.marks.length || value.marks.length > 32) return null
  const previous = validatedSketches.get(value)
  if (previous) return previous
  for (const mark of value.marks) {
    if (!mark || !isSketchPath(mark.d) ||
        typeof mark.fill !== 'string' || typeof mark.stroke !== 'string' || !color.test(mark.fill) || !color.test(mark.stroke) || !Number.isFinite(mark.width) || mark.width < 0 || mark.width > 16) return null
  }
  const sketch = { marks: value.marks, caption: value.caption === true }
  validatedSketches.set(value, sketch)
  return sketch
}

export function sketchProperties(sketch: Sketch, width: number, height: number) {
  return { 'visual:sketch': sketch, 'visual:shape': 'rect', 'visual:width': width, 'visual:height': height,
    'visual:hideLabel': true, 'visual:fill': 'transparent', 'visual:stroke': 'transparent' }
}

export function createStroke(points: SketchPoint[], stroke = '#5294dd') {
  if (points.length < 2 || points.length > maxStrokePoints || points.some(p => p.some(n => !Number.isFinite(n) || Math.abs(n) > 1e6)))
    throw new Error('A stroke needs 2–128 finite points on the Canvas.')
  const xs = points.map(p => p[0]), ys = points.map(p => p[1])
  const left = Math.min(...xs) - 3, top = Math.min(...ys) - 3
  const width = Math.max(...xs) + 3 - left, height = Math.max(...ys) + 3 - top
  const d = points.map(([x, y], i) => (i ? 'L' : 'M') + Math.round((x - left) * 120 / width) + ' ' + Math.round((y - top) * 100 / height)).join('')
  return { type: 'Sketch', label: 'Freehand stroke', position: { x: left + width / 2, y: top + height / 2 },
    properties: sketchProperties({ caption: false, marks: [{ d, stroke, width: 3, fill: 'none' }] }, width, height) }
}

// A source parse can settle after the store revision. Include the actual ink in
// presentation identity while keeping viewport and layout cache keys stable.
export function sketchPresentationKey(nodes: GraphNode[]) {
  const figures: string[] = []
  for (const node of nodes) {
    if (!node.properties?.['visual:sketch']) continue
    const sketch = readNodeSketch(node)
    if (sketch) figures.push(hashSignatureParts([node.id, node.label, sketch.caption,
      ...sketch.marks.flatMap(m => [m.d, m.fill, m.stroke, m.width])]))
  }
  return figures.join(',')
}
