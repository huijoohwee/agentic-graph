import { JSDOM } from 'jsdom'
import {
  HTML_VIEWER_RUNTIME_FULL,
  HTML_VIEWER_RUNTIME_WITHOUT_3D_PAYLOAD,
  HTML_VIEWER_RUNTIME_INPUT_NAMES,
} from '@/lib/graph/htmlViewer/runtimeTemplate.compiled'

type RuntimeInput = Record<(typeof HTML_VIEWER_RUNTIME_INPUT_NAMES)[number], unknown>

function runtimeBoundary(html: string) {
  const script = html.match(/<script>\n([\s\S]*?)\n\s*<\/script>/)?.[1]
  if (!script) throw new Error('Standalone runtime script is missing')
  for (const template of [HTML_VIEWER_RUNTIME_FULL, HTML_VIEWER_RUNTIME_WITHOUT_3D_PAYLOAD]) {
    const [prefix, suffix, extra] = template.split('__AG_FACTORY_INPUT__')
    if (prefix === undefined || suffix === undefined || extra !== undefined) throw new Error('Invalid compiled input boundary')
    if (!script.startsWith(prefix) || !script.endsWith(suffix)) continue
    const values = JSON.parse(script.slice(prefix.length, suffix.length ? -suffix.length : undefined))
    if (!Array.isArray(values) || values.length !== HTML_VIEWER_RUNTIME_INPUT_NAMES.length) throw new Error('Invalid compiled runtime input packet')
    const input = Object.fromEntries(HTML_VIEWER_RUNTIME_INPUT_NAMES.map((name, i) => [name, values[i]])) as RuntimeInput
    return { script, prefix, suffix, input }
  }
  throw new Error('Standalone script does not match either compiled factory')
}

export function readRuntimeInput(html: string): RuntimeInput { return runtimeBoundary(html).input }

export function readRuntimeJsonArray(html: string, name: string): unknown[] {
  const slots = { mediaNodes: 'mediaNodesJson', markdownBlocks: 'markdownBlocksJson' } as const
  if (!(name in slots)) throw new Error(`Unrecognized public runtime payload: ${name}`)
  const value = readRuntimeInput(html)[slots[name as keyof typeof slots]]
  if (!Array.isArray(value)) throw new Error(`Expected runtime array: ${name}`)
  return value
}

export const viewerSvg = (content: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 480"><g>${content}</g></svg>`
export const viewerNode = (id: string, x = 100, y = 100) => `<g data-node-id="${id}" transform="translate(${x},${y})"><circle data-role="node-circle" cx="0" cy="0" r="10"/></g>`

/** Execute the shipped factory in its own window; only layout, clock and I/O are deterministic. */
export function runHtmlViewer(html: string, overrides: Partial<RuntimeInput> = {}) {
  const boundary = runtimeBoundary(html)
  const input = { ...boundary.input, ...overrides }
  const script = Object.keys(overrides).length
    ? boundary.prefix + JSON.stringify(HTML_VIEWER_RUNTIME_INPUT_NAMES.map(name => input[name])) + boundary.suffix
    : boundary.script
  const dom = new JSDOM(html, { url: 'https://standalone.test/', runScripts: 'outside-only' })
  const win = dom.window
  const doc = win.document
  const requests: string[] = []
  const opened: unknown[][] = []
  const errors: string[] = []
  const frames = new Map<number, FrameRequestCallback>()
  let bodyFailure: unknown
  let serial = 0
  let now = 0
  const rect = { x: 0, y: 0, left: 0, top: 0, right: 640, bottom: 480, width: 640, height: 480, toJSON: () => ({}) }
  Object.defineProperties(win, {
    innerWidth: { value: 640 }, innerHeight: { value: 480 },
    fetch: { value: async (url: unknown) => { requests.push(String(url)); return { ok: false, status: 404, json: async () => null } } },
    open: { value: (...args: unknown[]) => { opened.push(args); return null } },
  })
  win.performance.now = () => now
  win.requestAnimationFrame = callback => { frames.set(++serial, callback); return serial }
  win.cancelAnimationFrame = id => { frames.delete(id) }
  win.addEventListener('error', event => { errors.push(event.message); event.preventDefault() })
  const root = doc.getElementById('kg-root')!
  const svg = doc.querySelector<SVGSVGElement>('#kg-svgWrap svg')!
  if (!root || !svg) { win.close(); throw new Error('Missing viewer root or SVG') }
  root.getBoundingClientRect = () => rect
  svg.getBoundingClientRect = () => rect
  const vb = (svg.getAttribute('viewBox') || '0 0 640 480').split(/[ ,]+/).map(Number)
  Object.defineProperty(svg, 'viewBox', { value: { baseVal: { x: vb[0], y: vb[1], width: vb[2], height: vb[3] } } })
  // JSDOM has no SVG layout engine. Supply one known content box, independently of node centroids.
  // JSDOM deliberately has no canvas renderer; renderer pixels are covered by the browser artifact suite.
  Object.defineProperty(win.HTMLCanvasElement.prototype, 'getContext', { value: () => null })
  Object.defineProperty(win.SVGElement.prototype, 'getBBox', { value: () => ({ x: 0, y: 0, width: 640, height: 480 }) })
  const flush = (count = 8) => {
    for (let i = 0; i < count && frames.size; i += 1) {
      now += 100
      const pending = [...frames.values()]; frames.clear()
      for (const callback of pending) callback(now)
    }
    if (errors.length) throw new Error(`Viewer event failed: ${errors.join('; ')}`)
  }
  const key = (value: string, type = 'keydown', options: KeyboardEventInit = {}, target: EventTarget = doc.body) => {
    const event = new win.KeyboardEvent(type, { key: value, bubbles: true, cancelable: true, ...options })
    target.dispatchEvent(event); return event
  }
  const pointer = (target: Element, type: string, x: number, y: number) => {
    const event = new win.MouseEvent(type, { clientX: x, clientY: y, bubbles: true, cancelable: true, buttons: type === 'pointerup' ? 0 : 1 })
    Object.defineProperties(event, { pointerId: { value: 1 }, pointerType: { value: 'mouse' } })
    target.dispatchEvent(event); return event
  }
  const touch = (target: Element, type: string, points: Array<[number, number]>) => {
    const event = new win.Event(type, { bubbles: true, cancelable: true })
    Object.defineProperty(event, 'touches', { value: points.map(([clientX, clientY]) => ({ clientX, clientY, target })) })
    target.dispatchEvent(event); return event
  }
  const matrix = () => {
    const value = Array.from<Element>(svg.children).find(child => child.localName === 'g')?.getAttribute('transform') || ''
    const result = value.match(/^matrix\(([^)]+)\)$/)?.[1]?.split(',').map(Number)
    if (!result || result.length !== 6 || result.some(n => !Number.isFinite(n))) throw new Error(`Invalid viewport matrix: ${value}`)
    return result
  }
  const captureFailure = (error: unknown) => { bodyFailure = error }
  const close = () => {
    const failures: unknown[] = errors.map(message => new Error(message))
    frames.clear()
    try { win.close() } catch (error) { failures.push(error) }
    if (failures.length) {
      const all = bodyFailure === undefined ? failures : [bodyFailure, ...failures]
      const details = all.map(error => error instanceof Error ? error.message : String(error)).join('; ')
      throw new AggregateError(all, `Viewer execution or cleanup failed: ${details}`)
    }
  }
  try { win.eval(script); flush() } catch (error) { captureFailure(error); close(); throw error }
  return { win, doc, root, svg, input, requests, opened, frames, flush, key, pointer, touch, matrix, captureFailure, close }
}
