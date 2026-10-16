import test from 'node:test'
import assert from 'node:assert/strict'
import React, { act } from 'react'
import { select, zoom, zoomIdentity, zoomTransform } from 'd3'
import { applyZoomRequest } from '../components/GraphCanvas/zoomController'
import type { ZoomRequest } from '../lib/zoom/requests'
import { createRoot } from 'react-dom/client'
import { initJsdomHarness } from '../tests/lib/jsdomHarness'
import { useGraphStore } from '../hooks/useGraphStore'
import { defaultSchema } from '../lib/graph/schema'
import type { GraphData } from '../lib/graph/types'
import { useSvgSurfaceZoomRuntime } from '../components/GraphCanvas/hooks/useSvgSurfaceZoomRuntime'
import { buildSvgSurfaceGraphData, prepareSvgForInteractiveViewport, svgSurfaceGraphLayoutSignature } from '../components/GraphCanvas/hooks/svgSurfaceGeometry'

const source: GraphData = { type: 'Graph', nodes: [
  { id: 'canonical:left', label: 'Repeated', type: 'Entity', properties: {} },
  { id: 'canonical:right', label: 'Repeated', type: 'Entity', properties: {} },
], edges: [{ id: 'canonical:message', source: 'canonical:left', target: 'canonical:right', label: 'Send', properties: {} }] }
const markup = '<svg viewBox="0 0 1200 240"><defs><marker id="tip"/></defs><title>Authored chart</title><rect id="left" aria-label="Left" x="20" y="20" width="80" height="60"/><rect id="right" aria-label="Right" x="200" y="20" width="80" height="60"/></svg>'
const rect = (width: number, height: number, left = 0, top = 0) => ({ x: left, y: top, left, top, right: left + width, bottom: top + height, width, height, toJSON() {} }) as DOMRect
const flush = () => act(async () => { await new Promise(resolve => setTimeout(resolve, 40)) })
const project = (svg: SVGSVGElement, graph: GraphData | null): GraphData | null => graph && ({ ...graph,
  nodes: graph.nodes.map((node, index) => ({ ...node, x: 60 + index * 180 + Number(svg.dataset.offset || 0), y: 50,
    properties: { ...node.properties, 'visual:width': 80, 'visual:height': 60 } })),
})

type SurfaceProps = { owns?: boolean; svg?: string; read?: typeof project; offset?: number; fitMode?: 'auto' | 'wideTimeline' }

async function runtimeCase(run: (context: {
  host: HTMLElement
  render: (props?: SurfaceProps) => Promise<void>
  labels: string[]
  occlude: (bounds: DOMRect[]) => void
}) => Promise<void>, options: { surface?: DOMRect; editorOpen?: boolean; occluders?: DOMRect[] } = {}) {
  const env = initJsdomHarness()
  const previous = useGraphStore.getState()
  const globals = ['SVGElement', 'SVGSVGElement', 'SVGGElement', 'MouseEvent', 'navigator'] as const
  const descriptors = globals.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)] as const)
  for (const key of globals) Object.defineProperty(globalThis, key, { configurable: true, writable: true,
    value: key === 'SVGGElement' ? env.dom.window.SVGElement : env.dom.window[key] })
  const surface = options.surface || rect(800, 600)
  env.dom.window.HTMLElement.prototype.getBoundingClientRect = () => surface
  env.dom.window.SVGElement.prototype.getBoundingClientRect = function () {
    return this.hasAttribute('data-kg-svg-zoom-content') ? rect(1200, 240, surface.left, surface.top) : surface
  }
  Object.defineProperties(env.dom.window.SVGSVGElement.prototype, {
    width: { configurable: true, get: () => ({ baseVal: { value: surface.width } }) },
    height: { configurable: true, get: () => ({ baseVal: { value: surface.height } }) },
  })
  useGraphStore.setState({ canvasRenderMode: '2d', canvas2dRenderer: 'sequence', schema: defaultSchema,
    workspaceViewMode: options.editorOpen ? 'editor' : 'canvas', workspaceCanvasPaneOpen: options.editorOpen === true,
    viewportFitReferenceWidth: 1920, viewportFitReferenceHeight: 1080,
    fitToScreenMode: false, zoomToSelectionMode: false, viewPinned: false, zoomState: null, zoomStateByKey: {},
    zoomRequest: null, zoomDurationFitMs: 0, zoomDurationSelectionMs: 0, graphData: source, graphDataRevision: 1,
    selectedNodeId: null, selectedEdgeId: null, selectedGroupId: null, selectedNodeIds: [], selectedEdgeIds: [], selectedGroupIds: [],
  })
  const host = document.createElement('main'); document.body.append(host)
  let panels: HTMLElement[] = []
  const occlude = (bounds: DOMRect[]) => {
    panels.forEach(panel => panel.remove())
    panels = bounds.map((box, index) => {
      const panel = document.createElement('aside')
      panel.setAttribute('data-kg-workspace-visible-viewport-occluder', String(index))
      panel.getBoundingClientRect = () => box; document.body.append(panel); return panel
    })
  }
  occlude(options.occluders || [])
  const root = createRoot(host), labels: string[] = []
  const onLabel = (label: string) => labels.push(label)
  function Surface({ owns = false, svg = markup, read, offset = 0, fitMode = 'auto' }: SurfaceProps) {
    const rootRef = React.useRef<HTMLElement>(null), svgHostRef = React.useRef<HTMLElement>(null)
    useSvgSurfaceZoomRuntime({ active: true, rootRef, svgHostRef, svgMarkup: svg, rendererId: 'sequence',
      graphData: source, graphDataRevision: 1, svgFitMode: fitMode, readRenderGraph: read, rendererOwnsSelection: owns, onSelectedElementLabelChange: onLabel })
    React.useLayoutEffect(() => { const element = svgHostRef.current?.querySelector('svg'); if (element) element.dataset.offset = String(offset) }, [offset, svg])
    return <section ref={rootRef} aria-label="Generated SVG viewport"><section ref={svgHostRef} aria-label="Generated SVG content" dangerouslySetInnerHTML={{ __html: svg }}/></section>
  }
  const render = async (props = {}) => { await act(async () => root.render(<Surface {...props}/>)); await flush() }
  try { await run({ host, render, labels, occlude }) }
  finally {
    await act(async () => root.unmount())
    useGraphStore.setState(previous, true)
    for (const [key, descriptor] of descriptors) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor)
      else Reflect.deleteProperty(globalThis, key)
    }
    panels.forEach(panel => panel.remove()); host.remove()
    env.restore()
  }
}

test('shared SVG viewport keeps metadata and intrinsic bounds through repeated preparation', async () => {
  await runtimeCase(async ({ host, render }) => {
    await render()
    const svg = host.querySelector('svg')!
    const prepared = prepareSvgForInteractiveViewport({ svgEl: svg, fitMode: 'wideTimeline' })
    assert.deepEqual(prepared.bounds, { minX: 0, minY: 0, width: 1200, height: 240 })
    assert.equal(svg.querySelectorAll('g[data-kg-svg-zoom-content]').length, 1)
    assert.equal(svg.querySelectorAll('[data-kg-svg-viewport-hitbox]').length, 1)
    assert.equal(svg.querySelector('marker#tip')?.parentElement?.parentElement, svg)
    assert.equal(svg.querySelector('title')?.parentElement, svg)
    assert.equal(svg.querySelector('title')?.textContent, 'Authored chart')
    assert.equal(prepared.group.querySelectorAll('rect').length, 2)
  })
})

test('generic SVG selection remains default and renderer ownership removes competing listeners and dimming', async () => {
  await runtimeCase(async ({ host, render, labels }) => {
    await render()
    const svg = host.querySelector('svg')!
    await act(async () => svg.querySelector('#left')!.dispatchEvent(new MouseEvent('click', { bubbles: true })))
    assert.deepEqual(labels, ['Left'])
    assert.equal(svg.querySelector('#left')?.getAttribute('data-kg-svg-selected'), '1')
    assert.equal(svg.querySelector('#right')?.getAttribute('data-kg-svg-dimmed'), '1')
    await render({ owns: true })
    assert.equal(svg.querySelectorAll('[data-kg-svg-selected], [data-kg-svg-dimmed]').length, 0)
    await act(async () => svg.querySelector('#right')!.dispatchEvent(new MouseEvent('click', { bubbles: true })))
    assert.deepEqual(labels, ['Left'], 'renderer-owned selection never invokes the generic label callback')
    assert.equal(svg.hasAttribute('data-kg-svg-has-selection'), false)
    await render()
    await act(async () => svg.querySelector('#right')!.dispatchEvent(new MouseEvent('click', { bubbles: true })))
    assert.deepEqual(labels, ['Left', 'Right'], 'default ownership can resume without duplicate listeners')
    await render({ svg: markup.replace('Authored chart', 'Replacement chart') })
    await act(async () => svg.querySelector('#left')!.dispatchEvent(new MouseEvent('click', { bubbles: true })))
    assert.deepEqual(labels, ['Left', 'Right'], 'detached SVG no longer publishes selection')
  })
})

test('render projection preserves canonical identities and whole-SVG bounds without mutating source', () => {
  const before = JSON.stringify(source)
  const graph = { ...source, nodes: source.nodes.map((node, index) => ({ ...node, x: 60 + index * 180, y: 50,
    properties: { 'visual:width': 80, 'visual:height': 60 } })) }
  const visual = buildSvgSurfaceGraphData({ bounds: { minX: 0, minY: 0, width: 1200, height: 240 }, graphData: source, rendererId: 'sequence', renderGraphData: graph })!
  assert.deepEqual(visual.nodes.slice(0, -1).map(node => node.id), source.nodes.map(node => node.id))
  assert.equal(visual.edges, source.edges)
  assert.equal(visual.nodes.at(-1)?.properties['visual:width'], 1200)
  assert.equal(visual.nodes.at(-1)?.properties['visual:height'], 240)
  assert.equal(JSON.stringify(source), before)
  assert.notEqual(svgSurfaceGraphLayoutSignature(visual), svgSurfaceGraphLayoutSignature({ ...visual,
    nodes: visual.nodes.map(node => node.id === 'canonical:left' ? { ...node, x: 400 } : node) }))
  assert.throws(() => buildSvgSurfaceGraphData({ bounds: { minX: 0, minY: 0, width: 1, height: 1 }, graphData: source,
    rendererId: 'sequence', renderGraphData: { ...source, nodes: [{ ...source.nodes[0]!, id: 'svg-surface:sequence:bounds' }] } }), /reserved SVG bounds ID/)
})

test('shared zoom selects canonical rendered participants after layout and still fits the entire SVG', async () => {
  await runtimeCase(async ({ host, render }) => {
    let observedOffset = -1
    const read: typeof project = (svg, graph) => { observedOffset = Number(svg.dataset.offset); return project(svg, graph) }
    await render({ owns: true, read, offset: 300 })
    assert.equal(observedOffset, 300, 'projection reads the renderer layout effect, not the pre-layout SVG')
    const svg = host.querySelector('svg')!
    const transform = () => ['x', 'y', 'k'].map(axis => Number(svg.getAttribute(`data-kg-svg-zoom-${axis}`)))
    await act(async () => useGraphStore.setState({ zoomRequest: { type: 'fit', intent: 'fitToScreen' } }))
    await flush()
    const whole = transform()
    assert.ok(whole.every(Number.isFinite) && whole[2]! > 0)
    await act(async () => useGraphStore.setState({ selectedNodeId: 'canonical:left', zoomRequest: { type: 'selection' } }))
    await flush()
    const selected = transform()
    assert.ok(selected[2]! > whole[2]!, 'selection uses positioned canonical nodes and excludes the whole-SVG envelope')
    assert.equal(useGraphStore.getState().zoomRequest, null)
    assert.deepEqual(useGraphStore.getState().graphData, source, 'viewport projection is never authored state')
    await act(async () => useGraphStore.setState({ zoomRequest: { type: 'fit', intent: 'fitToScreen' } }))
    await flush()
    assert.deepEqual(transform(), whole, 'manual whole fit still includes labels and frame outside participant bounds')
  })
})


const transformOf = (host: HTMLElement) => {
  const svg = host.querySelector('svg')!
  const [x, y, k] = ['x', 'y', 'k'].map(axis => Number(svg.getAttribute(`data-kg-svg-zoom-${axis}`)))
  assert.ok([x, y, k].every(Number.isFinite) && k! > 0)
  return { x: x!, y: y!, k: k! }
}
const near = (actual: number, expected: number, message: string) => assert.ok(Math.abs(actual - expected) < 0.001, `${message}: ${actual} versus ${expected}`)
const request = async (zoomRequest: ZoomRequest) => {
  await act(async () => useGraphStore.setState({ zoomRequest }))
  await flush()
  if (zoomRequest.type === 'reset') await act(async () => { await new Promise(resolve => setTimeout(resolve, 280)) })
  assert.equal(useGraphStore.getState().zoomRequest, null)
}
function visibleFit(host: HTMLElement, frame: { left: number; top: number; right: number; bottom: number }) {
  const t = transformOf(host)
  near(t.x + 600 * t.k, (frame.left + frame.right) / 2, 'whole SVG is horizontally centered in the visible frame')
  near(t.y + 120 * t.k, (frame.top + frame.bottom) / 2, 'whole SVG is vertically centered in the visible frame')
  assert.ok(t.x >= frame.left - 0.001 && t.x + 1200 * t.k <= frame.right + 0.001, 'all authored horizontal bounds remain visible')
  assert.ok(t.y >= frame.top - 0.001 && t.y + 240 * t.k <= frame.bottom + 0.001, 'all authored vertical bounds remain visible')
}
const occludedSurface = {
  surface: rect(800, 600, 80, 40), editorOpen: true,
  occluders: [rect(280, 600, 80, 40), rect(800, 80, 80, 40)],
}
const visibleFrame = { left: 280, top: 80, right: 800, bottom: 600 }

test('initial shared SVG fit uses the unobscured frame without shrinking the physical canvas', async () => {
  await runtimeCase(async ({ host, render }) => {
    await render({ owns: true })
    visibleFit(host, visibleFrame)
    const saved = Object.values(useGraphStore.getState().zoomStateByKey).find(Boolean)!
    assert.equal(saved.viewportW, 800); assert.equal(saved.viewportH, 600)
    assert.equal(host.querySelector('svg')!.getBoundingClientRect().left, 80)
    assert.equal(host.querySelector('svg')!.getBoundingClientRect().width, 800)
  }, occludedSurface)
})

for (const zoomRequest of [{ type: 'fit', intent: 'fitToScreen' }, { type: 'fit', intent: 'fitToView' }, { type: 'reset' }] as const) {
  test(`shared SVG ${zoomRequest.type === 'fit' ? zoomRequest.intent : zoomRequest.type} localizes visible framing exactly once`, async () => {
    await runtimeCase(async ({ host, render }) => {
      await render({ owns: true })
      await request({ type: 'transform', payload: { k: 0.6, x: -170, y: 90 } })
      await request(zoomRequest)
      visibleFit(host, visibleFrame)
      assert.deepEqual(useGraphStore.getState().graphData, source)
    }, occludedSurface)
  })
}

test('canonical selection context is centered in the visible frame rather than behind the editor', async () => {
  await runtimeCase(async ({ host, render }) => {
    await render({ owns: true, read: project })
    await act(async () => useGraphStore.setState({ selectedNodeId: 'canonical:left' }))
    await request({ type: 'selection' })
    const t = transformOf(host)
    near(t.x + 150 * t.k, 540, 'selected participant and its canonical neighbor horizontal center')
    near(t.y + 50 * t.k, 340, 'selection context vertical center')
    assert.deepEqual(useGraphStore.getState().graphData, source)
  }, occludedSurface)
})

test('an already inset SVG surface does not apply surrounding panels a second time', async () => {
  await runtimeCase(async ({ host, render }) => {
    await render({ owns: true })
    const frame = { left: 0, top: 0, right: 520, bottom: 520 }
    visibleFit(host, frame)
    await request({ type: 'fit', intent: 'fitToScreen' }); visibleFit(host, frame)
  }, { ...occludedSurface, surface: rect(520, 520, 360, 120) })
})

for (const variant of ['absent', 'closed', 'degenerate'] as const) {
  test(`${variant} workspace occlusion preserves full-surface framing`, async () => {
    await runtimeCase(async ({ host, render }) => {
      await render({ owns: true })
      visibleFit(host, { left: 0, top: 0, right: 800, bottom: 600 })
      await request({ type: 'fit', intent: 'fitToScreen' })
      visibleFit(host, { left: 0, top: 0, right: 800, bottom: 600 })
    }, { surface: rect(800, 600, 80, 40), editorOpen: variant !== 'closed',
      occluders: variant === 'absent' ? [] : [rect(variant === 'degenerate' ? 0 : 280, 600, 80, 40)] })
  })
}

test('a fresh fit samples moved occluders instead of reusing the previous visible origin', async () => {
  await runtimeCase(async ({ host, render, occlude }) => {
    await render({ owns: true })
    occlude([rect(360, 600, 80, 40)])
    await request({ type: 'fit', intent: 'fitToScreen' })
    visibleFit(host, { left: 360, top: 0, right: 800, bottom: 600 })
    occlude([])
    await request({ type: 'fit', intent: 'fitToScreen' })
    visibleFit(host, { left: 0, top: 0, right: 800, bottom: 600 })
  }, occludedSurface)
})

for (const pinned of [false, true]) {
  test(`${pinned ? 'pinned' : 'manual'} stored SVG transforms survive panel changes and SVG replacement`, async () => {
    await runtimeCase(async ({ host, render, occlude }) => {
      await render({ owns: true })
      const chosen = { k: 0.75, x: 93, y: -41 }
      await request({ type: 'transform', payload: chosen })
      assert.deepEqual(transformOf(host), chosen, 'literal transform is not offset by the editor')
      await act(async () => useGraphStore.setState({ viewPinned: pinned }))
      occlude([rect(440, 600, 80, 40)])
      await render({ owns: true, svg: markup.replace('Authored chart', 'Updated authored chart') })
      assert.deepEqual(transformOf(host), chosen, 'restoration keeps the authored viewport choice')
    }, occludedSurface)
  })
}

test('wideTimeline initial and explicit fit keep their existing panel framing', async () => {
  const outcomes: Array<{ initial: ReturnType<typeof transformOf>; fitted: ReturnType<typeof transformOf> }> = []
  for (const editorOpen of [false, true]) await runtimeCase(async ({ host, render }) => {
    await render({ owns: true, fitMode: 'wideTimeline' })
    const initial = transformOf(host)
    await request({ type: 'fit', intent: 'fitToScreen' })
    outcomes.push({ initial, fitted: transformOf(host) })
  }, { ...occludedSurface, editorOpen })
  assert.deepEqual(outcomes[1], outcomes[0], 'specialized Timeline viewport does not consume canvas editor insets')
})

test('empty graph reset on a mounted SVG preserves the identity transform', async () => {
  await runtimeCase(async ({ host, render }) => {
    await render({ owns: true })
    const svg = host.querySelector('svg')!, selection = select(svg)
    const behavior = zoom<SVGSVGElement, unknown>().extent([[0, 0], [800, 600]])
    selection.call(behavior.transform, zoomIdentity.translate(70, 30).scale(2))
    applyZoomRequest({ type: 'reset' }, { svg: selection, zoom: behavior,
      graphData: { type: 'Graph', nodes: [], edges: [] }, width: 800, height: 600,
      selectedNodeId: null, selectedEdgeId: null })
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 320)) })
    const t = zoomTransform(svg)
    assert.deepEqual({ x: t.x, y: t.y, k: t.k }, { x: 0, y: 0, k: 1 })
  }, occludedSurface)
})
