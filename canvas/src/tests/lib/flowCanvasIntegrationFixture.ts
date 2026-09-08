import { FLOW_EDGE_SOURCE_PORT_KEY, FLOW_EDGE_TARGET_PORT_KEY } from '@/lib/graph/flowPorts'
import { JSDOM } from 'jsdom'

import { __flowCanvasDebug } from '@/components/FlowCanvas/flowCanvasDebug'
import { AG_SUBGRAPHS_KEY } from '@/lib/graph/subgraphs'
import {
  FLOW_IMAGE_GENERATION_NODE_TYPE_ID,
  FLOW_RICH_MEDIA_PANEL_NODE_TYPE_ID,
  FLOW_TEXT_GENERATION_NODE_TYPE_ID,
  FLOW_VIDEO_GENERATION_NODE_TYPE_ID,
} from '@/lib/config.storyboard-widget'

type Ctx2d = Partial<CanvasRenderingContext2D>

export const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))

export const waitFor = async (args: { ms: number; pollMs: number; ok: () => boolean }) => {
  const deadline = Date.now() + Math.max(1, args.ms)
  while (Date.now() < deadline) {
    if (args.ok()) return
    await sleep(Math.max(1, args.pollMs))
  }
  throw new Error('timed out waiting for condition')
}

export const createFlowCanvasTestDom = (): JSDOM => {
  if (
    typeof window !== 'undefined' &&
    typeof document !== 'undefined' &&
    typeof window.HTMLCanvasElement === 'function'
  ) {
    document.body.innerHTML = ''
    return { window } as unknown as JSDOM
  }
  return new JSDOM('<!doctype html><html><head></head><body></body></html>', { url: 'http://localhost' })
}

export const installDomStubs = (dom: JSDOM) => {
  const draws = { frames: 0, arcs: 0 }
  __flowCanvasDebug.lastBuiltSceneNodeCount = 0
  __flowCanvasDebug.lastBuiltSceneKey = ''
  __flowCanvasDebug.lastZoomViewKey = ''
  const g = globalThis as unknown as {
    window?: unknown
    document?: unknown
    navigator?: unknown
    ResizeObserver?: unknown
    requestAnimationFrame?: unknown
    cancelAnimationFrame?: unknown
  }
  g.window = dom.window
  g.document = dom.window.document
  Object.assign(g, { Element: dom.window.Element, HTMLElement: dom.window.HTMLElement, SVGElement: dom.window.SVGElement })
  try {
    Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true })
  } catch {
    void 0
  }
  const anyWindow = dom.window as unknown as {
    ResizeObserver?: unknown
    requestAnimationFrame?: unknown
    cancelAnimationFrame?: unknown
  }

  class ResizeObserverStub {
    callback: ResizeObserverCallback
    constructor(cb: ResizeObserverCallback) {
      this.callback = cb
    }
    observe() {}
    unobserve() {}
    disconnect() {}
  }

  g.ResizeObserver = ResizeObserverStub
  anyWindow.ResizeObserver = ResizeObserverStub

  g.requestAnimationFrame = (cb: FrameRequestCallback) => {
    return setTimeout(() => cb(Date.now()), 0) as unknown as number
  }
  g.cancelAnimationFrame = (id: number) => {
    clearTimeout(id as unknown as ReturnType<typeof setTimeout>)
  }
  anyWindow.requestAnimationFrame = g.requestAnimationFrame
  anyWindow.cancelAnimationFrame = g.cancelAnimationFrame

  const ctx: Ctx2d = {
    save: () => {},
    restore: () => {},
    setTransform: () => {},
    clearRect: () => { draws.frames += 1; draws.arcs = 0 },
    fillRect: () => {},
    translate: () => {},
    scale: () => {},
    beginPath: () => {},
    rect: () => {},
    arc: () => { draws.arcs += 1 },
    fill: () => {},
    stroke: () => {},
    moveTo: () => {},
    lineTo: () => {},
    closePath: () => {},
    bezierCurveTo: () => {},
    quadraticCurveTo: () => {},
    fillText: () => {},
  }

  dom.window.HTMLCanvasElement.prototype.getContext = function (type: string) {
    if (type === '2d') return ctx as CanvasRenderingContext2D
    return null
  }
  return draws
}

export const installFlowCanvasViewportRect = (dom: JSDOM, width = 960, height = 540) => {
  const rect = {
    left: 0,
    top: 0,
    right: width,
    bottom: height,
    width,
    height,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  } as DOMRect
  Object.defineProperty(dom.window.HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => width })
  Object.defineProperty(dom.window.HTMLElement.prototype, 'clientHeight', { configurable: true, get: () => height })
  dom.window.HTMLElement.prototype.getBoundingClientRect = function () {
    return rect
  }
  dom.window.HTMLCanvasElement.prototype.getBoundingClientRect = function () {
    return rect
  }
  dom.window.HTMLCanvasElement.prototype.setPointerCapture = function () {}
  dom.window.HTMLCanvasElement.prototype.releasePointerCapture = function () {}
  dom.window.HTMLCanvasElement.prototype.hasPointerCapture = function () {
    return true
  }
}

export const dispatchFlowCanvasPointerEvent = (
  target: EventTarget,
  win: Window,
  type: 'pointerdown' | 'pointermove' | 'pointerup' | 'pointercancel',
  args: { pointerId?: number; clientX?: number; clientY?: number; button?: number; buttons?: number } = {},
) => {
  type MouseEventConstructorLike = new (eventType: string, eventInitDict?: Record<string, unknown>) => Event
  const MouseEventCtor = (win as unknown as { MouseEvent: MouseEventConstructorLike }).MouseEvent
  const event = new MouseEventCtor(type, {
    bubbles: true,
    cancelable: true,
    button: args.button ?? 0,
    buttons: args.buttons ?? (type === 'pointerup' || type === 'pointercancel' ? 0 : 1),
    clientX: args.clientX ?? 0,
    clientY: args.clientY ?? 0,
  })
  Object.defineProperty(event, 'pointerId', { configurable: true, value: args.pointerId ?? 1 })
  Object.defineProperty(event, 'pointerType', { configurable: true, value: 'mouse' })
  const eventTargetCtor = (win as unknown as { EventTarget?: { prototype?: { dispatchEvent?: (event: Event) => boolean } } }).EventTarget
  const dispatch = typeof target.dispatchEvent === 'function'
    ? target.dispatchEvent.bind(target)
    : (eventTargetCtor?.prototype?.dispatchEvent?.bind(target) as ((event: Event) => boolean) | undefined)
  if (typeof dispatch !== 'function') {
    throw new Error(`expected pointer target to expose dispatchEvent for ${type}`)
  }
  dispatch(event)
}

export const readFlowSceneSignature = (runtime: import('@/components/FlowCanvas/nativeRuntime').FlowNativeRuntime) => {
  const scene = runtime.scene
  return JSON.stringify({
    nodes: scene.nodes.map(node => ({ id: node.id, x: node.x, y: node.y, w: node.width, h: node.height, shape: node.shape })).sort((a, b) => a.id.localeCompare(b.id)),
    edges: scene.edges.map(edge => ({ id: edge.id, source: edge.source, target: edge.target })).sort((a, b) => a.id.localeCompare(b.id)),
    groups: (scene.groups || []).map(group => ({
      id: group.id,
      label: group.label,
      source: group.source,
      members: Array.isArray(group.memberNodeIds) ? group.memberNodeIds.slice().sort() : [],
    })).sort((a, b) => a.id.localeCompare(b.id)),
  })
}

export const buildCollectiveStoryboardWidgetGraphFixture = () => ({
  type: 'Graph',
  context: 'flow',
  nodes: [
    { id: 'left', label: 'Left', type: 'Note', properties: { 'visual:layer': 'Subgraph A' }, x: -360, y: -180 },
    { id: 'right', label: 'Right', type: 'Note', properties: { 'visual:community': 'Cluster B' }, x: 420, y: 240 },
    {
      id: 'widget-text',
      label: 'Widget Text',
      type: FLOW_TEXT_GENERATION_NODE_TYPE_ID,
      properties: {
        'flow:widgetFormId': 'textGeneration',
        'flow:portTypes': { in: { prompt: 'text' }, out: { result: 'text' } },
        'visual:layer': 'Subgraph A',
      },
      x: -80,
      y: 80,
    },
    {
      id: 'widget-image',
      label: 'Widget Image',
      type: FLOW_IMAGE_GENERATION_NODE_TYPE_ID,
      properties: {
        'flow:widgetFormId': 'imageGeneration',
        'flow:portTypes': { in: { prompt: 'text' }, out: { image: 'image' } },
        'visual:layer': 'Subgraph A',
      },
      x: 180,
      y: 40,
    },
    {
      id: 'widget-video',
      label: 'Widget Video',
      type: FLOW_VIDEO_GENERATION_NODE_TYPE_ID,
      properties: {
        'flow:widgetFormId': 'videoGeneration',
        'flow:portTypes': { in: { prompt: 'text', image: 'image' }, out: { video: 'video' } },
        'visual:community': 'Cluster B',
      },
      x: 470,
      y: -80,
    },
    {
      id: 'rich-panel',
      label: 'Rich Media Panel',
      type: FLOW_RICH_MEDIA_PANEL_NODE_TYPE_ID,
      properties: {
        'flow:widgetFormId': 'richMediaPanel',
        'flow:portTypes': { in: { image: 'image', video: 'video' }, out: { selected: 'media' } },
        media_interactive: true,
        richMediaActiveTab: 'image',
        imageUrl: 'https://example.test/demo.png',
        videoUrl: 'https://example.test/demo.mp4',
        'visual:community': 'Cluster B',
      },
      x: 780,
      y: -80,
    },
  ],
  edges: [
    { id: 'edge-left-widget', source: 'left', target: 'widget-text', label: 'feeds', properties: { [FLOW_EDGE_SOURCE_PORT_KEY]: 'result', [FLOW_EDGE_TARGET_PORT_KEY]: 'prompt' } },
    { id: 'edge-text-image', source: 'widget-text', target: 'widget-image', label: 'image prompt', properties: { [FLOW_EDGE_SOURCE_PORT_KEY]: 'result', [FLOW_EDGE_TARGET_PORT_KEY]: 'prompt' } },
    { id: 'edge-image-video', source: 'widget-image', target: 'widget-video', label: 'image input', properties: { [FLOW_EDGE_SOURCE_PORT_KEY]: 'image', [FLOW_EDGE_TARGET_PORT_KEY]: 'image' } },
    { id: 'edge-video-rich', source: 'widget-video', target: 'rich-panel', label: 'renders video', properties: { [FLOW_EDGE_SOURCE_PORT_KEY]: 'video', [FLOW_EDGE_TARGET_PORT_KEY]: 'video' } },
    { id: 'edge-right-rich', source: 'right', target: 'rich-panel', label: 'context', properties: {} },
  ],
  metadata: {
    kind: 'test',
    source: 'storyboardWidgetCollectiveInteractions',
    [AG_SUBGRAPHS_KEY]: [
      { id: 'sg-a', label: 'Subgraph A', kind: 'subgraph', memberNodeIds: ['left', 'widget-text', 'widget-image'] },
      { id: 'cluster-b', label: 'Cluster B', kind: 'cluster', memberNodeIds: ['right', 'widget-video', 'rich-panel'] },
      { id: 'group-all', label: 'Workflow Group', kind: 'group', memberNodeIds: ['left', 'right', 'widget-text', 'widget-image', 'widget-video', 'rich-panel'] },
    ],
  },
})

